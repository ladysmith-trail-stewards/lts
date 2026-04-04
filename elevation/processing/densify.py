"""Trail geometry densification using GDAL/OGR.

Densifies a 2D WGS84 LineString so that there is a vertex at most every
INTERVAL_M metres along the line.  The steps are:

1. Parse the GeoJSON geometry with OGR.
2. Reproject to a local UTM zone (WGS84) for accurate metric distances.
3. Call OGR Segmentize() to insert intermediate vertices at the target spacing.
4. Reproject back to WGS84.
5. Extract and return the (lon, lat) coordinates.
"""

import json
import logging

from osgeo import ogr, osr

log = logging.getLogger(__name__)

# Keep axes in (lon, lat) / (x, y) order regardless of GDAL version.
_AXIS_ORDER = osr.OAMS_TRADITIONAL_GIS_ORDER


def densify_trail(geojson_str: str, interval_m: float = 5.0) -> list[tuple[float, float]]:
    """Densify a LineString GeoJSON to at most interval_m metres between vertices.

    Args:
        geojson_str: GeoJSON string of a LineString in WGS84 (EPSG:4326).
        interval_m:  Maximum distance between consecutive vertices in metres.

    Returns:
        List of (lon, lat) tuples in WGS84.

    Raises:
        ValueError: If the GeoJSON is invalid or not a (Multi)LineString.
    """
    geom = ogr.CreateGeometryFromJson(geojson_str)
    if geom is None:
        raise ValueError("Invalid GeoJSON geometry")

    geom_type = geom.GetGeometryType()
    if geom_type not in (ogr.wkbLineString, ogr.wkbMultiLineString,
                         ogr.wkbLineString25D, ogr.wkbMultiLineString25D):
        raise ValueError(f"Expected a LineString geometry, got type {geom_type}")

    # Determine UTM zone from the geometry centroid.
    env = geom.GetEnvelope()  # (min_lon, max_lon, min_lat, max_lat)
    lon_centre = (env[0] + env[1]) / 2.0
    utm_zone = int((lon_centre + 180.0) / 6.0) + 1
    utm_epsg = 32600 + utm_zone  # WGS84 UTM North

    wgs84 = osr.SpatialReference()
    wgs84.ImportFromEPSG(4326)
    wgs84.SetAxisMappingStrategy(_AXIS_ORDER)

    utm = osr.SpatialReference()
    utm.ImportFromEPSG(utm_epsg)
    utm.SetAxisMappingStrategy(_AXIS_ORDER)

    ct_to_utm = osr.CoordinateTransformation(wgs84, utm)
    ct_to_wgs84 = osr.CoordinateTransformation(utm, wgs84)

    # Work on a clone to avoid mutating the original.
    geom_utm = geom.Clone()
    geom_utm.Transform(ct_to_utm)
    geom_utm.Segmentize(interval_m)
    geom_utm.Transform(ct_to_wgs84)

    # Extract all (lon, lat) vertices.
    coords: list[tuple[float, float]] = []
    _collect_coords(geom_utm, coords)

    log.debug("Densified to %d points at %.0f m spacing", len(coords), interval_m)
    return coords


# ── helpers ───────────────────────────────────────────────────────────────────


def _collect_coords(geom: ogr.Geometry, out: list[tuple[float, float]]) -> None:
    """Recursively collect (lon, lat) vertices from a geometry."""
    if geom.GetGeometryCount() > 0:
        # MultiLineString or GeometryCollection: descend into sub-geometries.
        for i in range(geom.GetGeometryCount()):
            _collect_coords(geom.GetGeometryRef(i), out)
    else:
        for i in range(geom.GetPointCount()):
            pt = geom.GetPoint(i)
            out.append((pt[0], pt[1]))  # (lon, lat) — Z ignored here
