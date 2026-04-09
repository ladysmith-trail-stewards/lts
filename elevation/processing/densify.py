"""Trail geometry densification — uses numpy for fast segment interpolation.

Densifies a WGS84 LineString so that there is a vertex at most every
INTERVAL_M metres along the line.

Interpolation is done in geographic (lon, lat) space using linear interpolation
along each segment.  At the scale of trail segments (< 20 km) this introduces
negligible error compared to a full UTM reprojection.  The metric distance
between consecutive vertices is computed via the haversine formula so the
interval is still expressed in true metres.
"""

import logging
import math

import numpy as np

log = logging.getLogger(__name__)

_EARTH_RADIUS_M = 6_371_000.0


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return _EARTH_RADIUS_M * 2.0 * math.asin(math.sqrt(a))


def densify_trail(geojson: dict, interval_m: float = 5.0) -> list[tuple[float, float]]:
    """Densify a WGS84 LineString GeoJSON to at most interval_m metres between
    consecutive vertices.

    Args:
        geojson:    Parsed GeoJSON dict of a LineString in WGS84 (EPSG:4326),
                    as returned by ``ST_AsGeoJSON()`` via ``db/trails.py``.
        interval_m: Maximum distance between consecutive vertices in metres.

    Returns:
        List of (lon, lat) tuples in WGS84.

    Raises:
        ValueError: If the GeoJSON is not a LineString or has fewer than 2 points.
    """
    geom_type = geojson.get("type")
    if geom_type != "LineString":
        raise ValueError(f"Expected a LineString geometry, got '{geom_type}'")

    raw = geojson.get("coordinates", [])
    if len(raw) < 2:
        raise ValueError(f"LineString must have at least 2 coordinates, got {len(raw)}")

    result: list[tuple[float, float]] = [(raw[0][0], raw[0][1])]

    for i in range(1, len(raw)):
        lon0, lat0 = raw[i - 1][0], raw[i - 1][1]
        lon1, lat1 = raw[i][0], raw[i][1]

        seg_len = _haversine_m(lon0, lat0, lon1, lat1)
        if seg_len == 0.0:
            continue

        n = int(seg_len / interval_m)
        if n > 0:
            # Vectorised interpolation: t values for inserted points only
            # (excludes t=0 which is already in result, excludes t>=1).
            ts = np.arange(1, n + 1) * (interval_m / seg_len)
            ts = ts[ts < 1.0]
            lons = lon0 + ts * (lon1 - lon0)
            lats = lat0 + ts * (lat1 - lat0)
            result.extend(zip(lons.tolist(), lats.tolist()))

        result.append((lon1, lat1))

    log.debug("Densified to %d points at %.0f m spacing", len(result), interval_m)
    return result

