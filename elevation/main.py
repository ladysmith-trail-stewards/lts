#!/usr/bin/env python3
"""LTS Elevation Profile Generator — see README.md for full documentation."""

import argparse
import logging
import os
import sys
from pathlib import Path

from tqdm import tqdm

from db.client import get_connection
from db.elevations import batch_upsert_trail_elevations, upsert_trail_elevation
from db.trails import fetch_all_trails, fetch_outdated_trails, fetch_trail
from dem.copernicus import CopernicusProvider
from dem.hrdem import HRDEMProvider
from processing.densify import densify_trail
from processing.profile import build_4d_linestring_wkt, downsample_coords

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    force=True,
)
log = logging.getLogger(__name__)

# Desired spacing between consecutive elevation samples in metres.
DENSIFY_INTERVAL_M = 5.0

# Downsampled vertex spacing for the LD (Copernicus-only) geometry.
STORE_INTERVAL_LD_M = 10.0

# Local directory where DEM tiles are cached between runs.
# Override via the DEM_CACHE_DIR environment variable.
_DEFAULT_CACHE_DIR = Path.home() / ".cache" / "lts_dem"
_CACHE_DIR: str = os.environ.get("DEM_CACHE_DIR") or str(_DEFAULT_CACHE_DIR)


# ── core processing ───────────────────────────────────────────────────────────


def _compute_trail(trail: dict, hrdem: HRDEMProvider, fallback: CopernicusProvider) -> dict | None:
    """Compute elevation data for one trail and return a result dict (no DB write).

    Returns None if the trail has no points after densification.
    """
    trail_id: int = trail["id"]

    points = densify_trail(trail["geometry"], DENSIFY_INTERVAL_M)
    if not points:
        log.warning("Trail %d: no points after densification — skipping", trail_id)
        return None

    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    bbox = (min(lons), min(lats), max(lons), max(lats))

    hrdem_tile = hrdem.fetch_tile(bbox)
    fallback_indices: list[int] = []
    try:
        elevations = hrdem.sample_points(hrdem_tile, points)

        fallback_indices = [i for i, e in enumerate(elevations) if e is None]
        if fallback_indices:
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

    missing = sum(1 for e in elevations if e is None)
    if missing:
        log.warning(
            "Trail %d: %d/%d points have no elevation data — Z stored as 0.0",
            trail_id, missing, len(elevations),
        )

    hrdem_count = len(points) - len(fallback_indices)

    # Full (lon, lat, elev) triples with best available elevation at every point.
    coords_3d = [
        (lon, lat, elev if elev is not None else 0.0)
        for (lon, lat), elev in zip(points, elevations)
    ]

    # geom4d: all points at full density — HRDEM where available, Copernicus fallback elsewhere.
    wkt_hd = build_4d_linestring_wkt(coords_3d)

    # geom4d_ld: Copernicus-only points, downsampled.
    coords_copernicus = [coords_3d[i] for i in fallback_indices]
    wkt_ld = build_4d_linestring_wkt(downsample_coords(coords_copernicus, STORE_INTERVAL_LD_M)) if len(coords_copernicus) >= 2 else None

    return {
        "trail_id": trail_id,
        "geom4d_wkt": wkt_hd,
        "geom4d_ld_wkt": wkt_ld,
        "sample_interval_m": DENSIFY_INTERVAL_M,
        "sample_interval_ld_m": STORE_INTERVAL_LD_M,
        "geom_snapshot_at": trail["geom_updated_at"],
        "total_points": len(points),
        "hrdem_points": hrdem_count,
    }


def _process_trails(conn, trails: list[dict], hrdem: HRDEMProvider, fallback: CopernicusProvider, label: str) -> None:
    """Compute elevations for all trails with a progress bar, then batch-insert."""
    tqdm.write(f"Warming HRDEM cache for {len(trails)} trail(s)…")
    hrdem.warm_cache(trails)

    results = []
    with tqdm(trails, desc=label, unit="trail") as bar:
        for trail in bar:
            bar.set_postfix(id=trail["id"])
            result = _compute_trail(trail, hrdem, fallback)
            if result:
                results.append(result)

    if results:
        tqdm.write(f"Saving {len(results)} trail(s) to database…")
        batch_upsert_trail_elevations(conn, results)

    total_pts  = sum(r["total_points"] for r in results)
    hrdem_pts  = sum(r["hrdem_points"]  for r in results)
    hrdem_trails = sum(1 for r in results if r["hrdem_points"] > 0)

    pt_pct     = hrdem_pts  / total_pts  * 100 if total_pts  else 0.0
    trail_pct  = hrdem_trails / len(results) * 100 if results else 0.0

    tqdm.write(
        f"\nDone — {len(results)}/{len(trails)} trail(s) saved.\n"
        f"  High-res (HRDEM) points : {hrdem_pts:,} / {total_pts:,}  ({pt_pct:.1f}%)\n"
        f"  Trails with any HRDEM   : {hrdem_trails} / {len(results)}  ({trail_pct:.1f}%)"
    )


# ── public API ────────────────────────────────────────────────────────────────


def update_trail_by_id(trail_id: int, prod: bool = False) -> None:
    """Update the 3D geometry and elevation profile for a single trail."""
    conn = get_connection(prod=prod)
    hrdem = HRDEMProvider(cache_dir=_CACHE_DIR)
    fallback = CopernicusProvider(cache_dir=_CACHE_DIR)

    try:
        trail = fetch_trail(conn, trail_id)
        if trail is None:
            log.error("Trail %d not found or is soft-deleted", trail_id)
            sys.exit(1)
        _process_trails(conn, [trail], hrdem, fallback, label=f"Trail {trail_id}")
    finally:
        conn.close()


def update_all_trails(prod: bool = False) -> None:
    """Update 3D geometry and elevation profiles for all active trails."""
    conn = get_connection(prod=prod)
    hrdem = HRDEMProvider(cache_dir=_CACHE_DIR)
    fallback = CopernicusProvider(cache_dir=_CACHE_DIR)

    try:
        trails = fetch_all_trails(conn)
        _process_trails(conn, trails, hrdem, fallback, label="All trails")
    finally:
        conn.close()


def update_outdated_trails(prod: bool = False) -> None:
    """Update trails whose geom_updated_at is newer than geom_snapshot_at."""
    conn = get_connection(prod=prod)
    hrdem = HRDEMProvider(cache_dir=_CACHE_DIR)
    fallback = CopernicusProvider(cache_dir=_CACHE_DIR)

    try:
        trails = fetch_outdated_trails(conn)
        if not trails:
            tqdm.write("All trails are up to date.")
            return
        _process_trails(conn, trails, hrdem, fallback, label="Outdated trails")
    finally:
        conn.close()


# ── CLI ───────────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python main.py",
        description="LTS elevation profile generator",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        default=False,
        help="Connect to the production Supabase database (PROD_DATABASE_URL). "
             "Defaults to local (DATABASE_URL).",
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
    prod: bool = args.prod

    if prod:
        log.warning("Connecting to PRODUCTION database (PROD_DATABASE_URL)")

    if args.command == "update-trail":
        update_trail_by_id(args.id, prod=prod)
    elif args.command == "update-all":
        update_all_trails(prod=prod)
    elif args.command == "update-outdated":
        update_outdated_trails(prod=prod)


if __name__ == "__main__":
    main()
