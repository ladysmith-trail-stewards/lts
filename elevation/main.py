#!/usr/bin/env python3
"""LTS Elevation Profile Generator.

Standalone Python tool that pulls trail geometries from the Supabase/PostgreSQL
database, fetches elevation data from the NRCan HRDEM (high-resolution Canada
DEM) with a Copernicus GLO-30 global fallback, and stores 3D geometries plus
distance/elevation profiles back into the trail_elevations table.

Usage
-----
    python main.py update-trail --id <trail_id>
    python main.py update-all
    python main.py update-outdated

Commands
--------
update-trail      Recompute elevation for a single trail identified by its DB id.
update-all        Recompute elevation for every active (non-deleted) trail.
update-outdated   Recompute only trails whose geometry changed more than 30 s
                  after the stored elevation profile was last computed, plus any
                  trail that has no elevation entry yet.

Environment
-----------
See .env.example for required variables.  Copy it to .env and fill in the
values before running.

DEM sources
-----------
1. NRCan HRDEM Mosaic DTM (≤1 m, Canada only)
   WCS endpoint: https://datacube.services.geo.ca/ows/elevation
   Docs: https://www.download-telecharger.services.geo.ca/pub/elevation/dem_mne/
         HRDEMmosaic_mosaiqueMNEHR/HRDEM_Mosaic_WCS-WMS_instructions_EN.pdf

2. Copernicus DEM GLO-30 via AWS Open Data COG tiles (~30 m, global fallback)
   Tile URL: https://copernicus-dem-30m.s3.amazonaws.com/<name>/<name>.tif
   Tiles are downloaded in full on first use and reused from the local cache.

Tile cache
----------
Downloaded DEM tiles are stored in DEM_CACHE_DIR (default: ~/.cache/lts_dem).
Set DEM_CACHE_DIR to a different path in .env or as an environment variable.
Delete the directory to clear the cache and force fresh downloads.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from db.client import get_connection
from db.elevations import upsert_trail_elevation
from db.trails import fetch_all_trails, fetch_outdated_trails, fetch_trail
from dem.hrdem import HRDEMProvider
from dem.copernicus import CopernicusProvider
from processing.densify import densify_trail
from processing.profile import build_3d_linestring_geojson, build_elevation_profile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

# Desired spacing between consecutive elevation samples in metres.
DENSIFY_INTERVAL_M = 5.0

# Local directory where DEM tiles are cached between runs.
# Override via the DEM_CACHE_DIR environment variable.
_DEFAULT_CACHE_DIR = Path.home() / ".cache" / "lts_dem"
_CACHE_DIR: str = os.environ.get("DEM_CACHE_DIR") or str(_DEFAULT_CACHE_DIR)


# ── core processing ───────────────────────────────────────────────────────────


def _process_trail(conn, trail: dict, hrdem: HRDEMProvider, fallback: CopernicusProvider) -> None:
    """Compute and persist the elevation profile for one trail.

    Steps:
    1. Densify the 2D trail geometry to DENSIFY_INTERVAL_M-metre spacing.
    2. Fetch a high-resolution HRDEM tile covering the trail's bounding box.
    3. Sample elevation at every densified vertex (HRDEM first).
    4. For vertices where HRDEM has no data, fetch a Copernicus GLO-30 raster
       tile for their bounding box and sample from it.
    5. Build the 3D LineString and elevation profile and upsert to DB.
    """
    trail_id: int = trail["id"]
    log.info("Processing trail %d …", trail_id)

    # Step 1: densify
    points = densify_trail(trail["geometry"], DENSIFY_INTERVAL_M)
    log.info("  Trail %d: %d densified points at %.0f m spacing", trail_id, len(points), DENSIFY_INTERVAL_M)

    if not points:
        log.warning("  Trail %d: no points after densification — skipping", trail_id)
        return

    # Step 2: fetch HRDEM tile for the trail's bounding box
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    bbox = (min(lons), min(lats), max(lons), max(lats))

    hrdem_tile = hrdem.fetch_tile(bbox)

    try:
        # Step 3: sample HRDEM for all points
        elevations = hrdem.sample_points(hrdem_tile, points)

        # Step 4: Copernicus GLO-30 fallback — fetch raster tile for the
        # bounding box of the missing points, then sample from it.
        fallback_indices = [i for i, e in enumerate(elevations) if e is None]
        if fallback_indices:
            log.info(
                "  Trail %d: %d/%d points need Copernicus GLO-30 fallback",
                trail_id,
                len(fallback_indices),
                len(points),
            )
            fallback_points = [points[i] for i in fallback_indices]
            fb_lons = [p[0] for p in fallback_points]
            fb_lats = [p[1] for p in fallback_points]
            fallback_bbox = (min(fb_lons), min(fb_lats), max(fb_lons), max(fb_lats))
            fallback_tile = fallback.fetch_tile(fallback_bbox)
            try:
                fallback_elevs = fallback.sample_points(fallback_tile, fallback_points)
            finally:
                fallback.close_tile(fallback_tile)
            for i, idx in enumerate(fallback_indices):
                elevations[idx] = fallback_elevs[i]

    finally:
        hrdem.close_tile(hrdem_tile)

    # Step 5: build output structures
    # PostGIS LineStringZ requires a numeric Z for every vertex; fall back to
    # 0.0 when both DEM providers returned no data.  Log a warning so the
    # operator knows the profile may contain zeroed-out sea-level artefacts.
    missing = sum(1 for e in elevations if e is None)
    if missing:
        log.warning(
            "  Trail %d: %d/%d points have no elevation data from either DEM "
            "— Z will be stored as 0.0 for those points",
            trail_id, missing, len(elevations),
        )
    coords_3d = [
        (lon, lat, elev if elev is not None else 0.0)
        for (lon, lat), elev in zip(points, elevations)
    ]
    geometry_3d = build_3d_linestring_geojson(coords_3d)
    profile = build_elevation_profile(coords_3d)

    upsert_trail_elevation(conn, trail_id, geometry_3d, profile)

    total_dist = profile[-1]["distance_m"] if profile else 0.0
    log.info("  Trail %d: saved — total distance %.0f m", trail_id, total_dist)


# ── public API ────────────────────────────────────────────────────────────────


def update_trail_by_id(trail_id: int) -> None:
    """Update the 3D geometry and elevation profile for a single trail."""
    conn = get_connection()
    hrdem = HRDEMProvider(cache_dir=_CACHE_DIR)
    fallback = CopernicusProvider(cache_dir=_CACHE_DIR)

    try:
        trail = fetch_trail(conn, trail_id)
        if trail is None:
            log.error("Trail %d not found or is soft-deleted", trail_id)
            sys.exit(1)
        _process_trail(conn, trail, hrdem, fallback)
    finally:
        conn.close()


def update_all_trails() -> None:
    """Update 3D geometry and elevation profiles for all active trails."""
    conn = get_connection()
    hrdem = HRDEMProvider(cache_dir=_CACHE_DIR)
    fallback = CopernicusProvider(cache_dir=_CACHE_DIR)

    try:
        trails = fetch_all_trails(conn)
        log.info("Updating %d trail(s) …", len(trails))
        for trail in trails:
            _process_trail(conn, trail, hrdem, fallback)
        log.info("Done — all %d trail(s) updated.", len(trails))
    finally:
        conn.close()


def update_outdated_trails() -> None:
    """Update trails whose geometry changed more than 30 s after last elevation compute."""
    conn = get_connection()
    hrdem = HRDEMProvider(cache_dir=_CACHE_DIR)
    fallback = CopernicusProvider(cache_dir=_CACHE_DIR)

    try:
        trails = fetch_outdated_trails(conn)
        log.info("Found %d outdated trail(s) to update …", len(trails))
        for trail in trails:
            _process_trail(conn, trail, hrdem, fallback)
        log.info("Done — %d outdated trail(s) updated.", len(trails))
    finally:
        conn.close()


# ── CLI ───────────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python main.py",
        description="LTS elevation profile generator",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_single = sub.add_parser("update-trail", help="Update a single trail by ID")
    p_single.add_argument("--id", type=int, required=True, metavar="TRAIL_ID",
                          help="Primary key of the trail to update")

    sub.add_parser("update-all", help="Update all active trails")
    sub.add_parser("update-outdated", help="Update only outdated trails")

    return parser


def main() -> None:
    args = _build_parser().parse_args()

    if args.command == "update-trail":
        update_trail_by_id(args.id)
    elif args.command == "update-all":
        update_all_trails()
    elif args.command == "update-outdated":
        update_outdated_trails()


if __name__ == "__main__":
    main()
