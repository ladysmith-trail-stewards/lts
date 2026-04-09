"""Build 4-D trail geometries from densified trail points.

Given a list of (lon, lat, elevation_m) tuples this module produces WKT
LINESTRINGZM strings suitable for PostGIS ``ST_GeomFromText``.

The four ordinates per vertex are:
    X  longitude (degrees, WGS84)
    Y  latitude  (degrees, WGS84)
    Z  elevation (metres above ellipsoid/sea level)
    M  cumulative great-circle distance (metres) from the first vertex

Having M encoded directly on the geometry makes it trivial to extract an
elevation profile at query time:
    ``SELECT ST_M(dp.geom), ST_Z(dp.geom)
      FROM   ST_DumpPoints(geom4d) AS dp``
"""

import math

# Earth mean radius in metres (used for haversine; slightly shorter than the
# WGS84 semi-major axis of 6 378 137 m but appropriate for geographic distances).
_EARTH_RADIUS_M = 6_371_000.0


def downsample_coords(
    coords_3d: list[tuple[float, float, float]],
    target_interval_m: float,
) -> list[tuple[float, float, float]]:
    """Thin a densely-sampled coordinate list to a coarser interval.

    Always keeps the first and last points.  Intermediate points are kept only
    when the accumulated great-circle distance since the last kept point reaches
    ``target_interval_m``.

    Args:
        coords_3d:          Ordered (lon, lat, elevation_m) tuples.
        target_interval_m:  Desired minimum spacing between kept vertices, metres.

    Returns:
        Thinned list of (lon, lat, elevation_m) tuples.
    """
    if len(coords_3d) < 2:
        return list(coords_3d)

    kept: list[tuple[float, float, float]] = [coords_3d[0]]
    accumulated_m = 0.0

    for i in range(1, len(coords_3d)):
        prev_lon, prev_lat, _ = coords_3d[i - 1]
        lon, lat, _ = coords_3d[i]
        accumulated_m += _haversine_m(prev_lat, prev_lon, lat, lon)

        if accumulated_m >= target_interval_m or i == len(coords_3d) - 1:
            kept.append(coords_3d[i])
            accumulated_m = 0.0

    return kept


def build_4d_linestring_wkt(
    coords_3d: list[tuple[float, float, float]],
) -> str:
    """Return a WKT LINESTRINGZM from (lon, lat, elevation_m) triples.

    The M ordinate is the cumulative great-circle distance in metres from the
    first vertex, rounded to two decimal places.  Z values are rounded to two
    decimal places as well.

    Args:
        coords_3d: Ordered list of (lon, lat, elevation_m) tuples.

    Returns:
        WKT string, e.g. ``'LINESTRINGZM (lon lat z m, …)'``.
        Pass directly to PostGIS ``ST_GeomFromText(<wkt>, 4326)``.

    Raises:
        ValueError: If fewer than 2 coordinates are provided.
    """
    if len(coords_3d) < 2:
        raise ValueError(f"LINESTRINGZM requires at least 2 points, got {len(coords_3d)}")

    cumulative_m = 0.0
    parts: list[str] = []

    for i, (lon, lat, elev) in enumerate(coords_3d):
        if i > 0:
            prev_lon, prev_lat, _ = coords_3d[i - 1]
            cumulative_m += _haversine_m(prev_lat, prev_lon, lat, lon)

        z = round(elev, 2) if elev is not None else 0.0
        m = round(cumulative_m, 2)
        parts.append(f"{lon} {lat} {z} {m}")

    return "LINESTRINGZM (" + ", ".join(parts) + ")"


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
