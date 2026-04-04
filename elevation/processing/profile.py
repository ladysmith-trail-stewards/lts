"""Build 3D geometry and elevation profile from densified trail points.

Given a list of (lon, lat, elevation_m) tuples this module produces:

* A GeoJSON LineStringZ string suitable for PostGIS ST_GeomFromGeoJSON.
* An elevation profile: an ordered list of {distance_m, elevation_m} dicts
  where distance_m is the cumulative great-circle distance along the trail.
"""

import json
import math
from typing import Optional

# Earth mean radius in metres (WGS84 semi-major axis ≈ 6 378 137 m).
_EARTH_RADIUS_M = 6_371_000.0


def build_3d_linestring_geojson(
    coords_3d: list[tuple[float, float, float]],
) -> str:
    """Return a GeoJSON LineStringZ from (lon, lat, elevation_m) triples.

    Args:
        coords_3d: Ordered list of (lon, lat, elevation_m) tuples.

    Returns:
        GeoJSON string with geometry type "LineString" and Z coordinates.
    """
    return json.dumps(
        {
            "type": "LineString",
            "coordinates": [[lon, lat, elev] for lon, lat, elev in coords_3d],
        }
    )


def build_elevation_profile(
    coords_3d: list[tuple[float, float, float]],
) -> list[dict]:
    """Build a distance-vs-elevation profile from 3D trail coordinates.

    Args:
        coords_3d: Ordered (lon, lat, elevation_m) triples.

    Returns:
        List of {distance_m, elevation_m} dicts.  distance_m is the cumulative
        great-circle distance in metres from the first vertex.  elevation_m is
        rounded to two decimal places; None elevations are preserved as null.
    """
    profile: list[dict] = []
    cumulative_m = 0.0

    for i, (lon, lat, elev) in enumerate(coords_3d):
        if i > 0:
            prev_lon, prev_lat, _ = coords_3d[i - 1]
            cumulative_m += _haversine_m(prev_lat, prev_lon, lat, lon)

        profile.append(
            {
                "distance_m": round(cumulative_m, 2),
                "elevation_m": round(elev, 2) if elev is not None else None,
            }
        )

    return profile


# ── helpers ───────────────────────────────────────────────────────────────────


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2.0) ** 2
    )
    return _EARTH_RADIUS_M * 2.0 * math.asin(math.sqrt(a))
