"""Canada HRDEM DTM provider — 1 m resolution via NRCan STAC + COG tiles."""

import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

import requests
from osgeo import gdal, osr

from dem.base import DemProvider

log = logging.getLogger(__name__)

gdal.UseExceptions()

# GDAL VSI/curl config for reliable COG range-request access.
gdal.SetConfigOption("GDAL_HTTP_TIMEOUT", "60")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "5")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "5")
gdal.SetConfigOption("CPL_VSIL_CURL_CACHE_SIZE", "256000000")

_STAC_SEARCH_URL = "https://datacube.services.geo.ca/stac/api/search"
_STAC_COLLECTION = "hrdem-lidar"
_STAC_DTM_ASSET  = "dtm"

# Degrees added around the trail bbox so edge points sample valid pixels.
_DEFAULT_BUFFER_DEG = 0.002


class HRDEMProvider(DemProvider):
    """NRCan HRDEM DTM provider (STAC + bbox-clipped local cache, ~1 m resolution, Canada)."""

    def __init__(
        self,
        buffer_deg: float = _DEFAULT_BUFFER_DEG,
        cache_dir: Optional[str] = None,
    ) -> None:
        self._buffer    = buffer_deg
        self._cache_dir = Path(cache_dir) if cache_dir else None

    # ── tile management ──────────────────────────────────────────────────────

    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> Optional[dict]:
        """Open HRDEM DTM tile(s) covering the given bounding box.

        Queries the NRCan STAC API for intersecting LiDAR DTM tiles, resolves
        each to a local cached clip or /vsicurl/ path, and merges them into a
        single GDAL VRT mosaic.  Returns None when no tiles cover the area.
        """
        min_lon, min_lat, max_lon, max_lat = bbox
        min_lon -= self._buffer
        min_lat -= self._buffer
        max_lon += self._buffer
        max_lat += self._buffer

        tile_sources = self._resolve_tiles(min_lon, min_lat, max_lon, max_lat)
        if not tile_sources:
            log.debug(
                "HRDEM: no STAC tiles for bbox (%.3f,%.3f)-(%.3f,%.3f)",
                min_lon, min_lat, max_lon, max_lat,
            )
            return None

        vrt_path: Optional[str] = None
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".vrt", delete=False)
            vrt_path = tmp.name
            tmp.close()

            vrt_ds = gdal.BuildVRT(vrt_path, tile_sources)
            if vrt_ds is None:
                log.warning("HRDEM: gdal.BuildVRT returned None")
                os.unlink(vrt_path)
                return None

            log.debug(
                "HRDEM: VRT built from %d tile(s) for bbox (%.3f,%.3f)-(%.3f,%.3f)",
                len(tile_sources), min_lon, min_lat, max_lon, max_lat,
            )
            return {"dataset": vrt_ds, "vrt_path": vrt_path}

        except (OSError, RuntimeError) as exc:
            log.warning("HRDEM: VRT build failed: %s", exc)
            if vrt_path and os.path.exists(vrt_path):
                os.unlink(vrt_path)
            return None

    def sample_points(
        self,
        tile: Optional[dict],
        points: list[tuple[float, float]],
    ) -> list[Optional[float]]:
        """Sample elevation values from the VRT raster dataset."""
        if tile is None:
            return [None] * len(points)

        ds: gdal.Dataset = tile["dataset"]
        gt = ds.GetGeoTransform()
        band = ds.GetRasterBand(1)
        nodata = band.GetNoDataValue()
        width, height = ds.RasterXSize, ds.RasterYSize

        wgs84 = osr.SpatialReference()
        wgs84.ImportFromEPSG(4326)
        wgs84.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        raster_srs = osr.SpatialReference()
        raster_srs.ImportFromWkt(ds.GetProjection())
        transform = osr.CoordinateTransformation(wgs84, raster_srs)

        results: list[Optional[float]] = []
        for lon, lat in points:
            try:
                x, y, _ = transform.TransformPoint(lon, lat)
            except Exception:
                results.append(None)
                continue

            px = int((x - gt[0]) / gt[1])
            py = int((y - gt[3]) / gt[5])

            if px < 0 or py < 0 or px >= width or py >= height:
                results.append(None)
                continue

            value = float(band.ReadAsArray(px, py, 1, 1)[0][0])

            if nodata is not None and abs(value - float(nodata)) < 1e-3:
                results.append(None)
            else:
                results.append(value)

        return results

    def close_tile(self, tile: Optional[dict]) -> None:
        """Close the GDAL VRT dataset and remove the temp VRT file."""
        if tile is None:
            return
        tile["dataset"] = None
        vrt_path = tile.get("vrt_path")
        if vrt_path and os.path.exists(vrt_path):
            os.unlink(vrt_path)

    def warm_cache(self, trails: list[dict]) -> None:
        """Pre-clip HRDEM tiles for the union bbox of all given trails.

        Call before processing a batch for best performance. Does nothing if
        cache_dir is None.
        """
        if self._cache_dir is None or not trails:
            return

        import json as _json

        all_coords: list[tuple[float, float]] = []
        for trail in trails:
            geom = trail.get("geometry", {})
            if isinstance(geom, str):
                geom = _json.loads(geom)
            all_coords.extend(geom.get("coordinates", []))

        if not all_coords:
            return

        lons = [c[0] for c in all_coords]
        lats = [c[1] for c in all_coords]
        min_lon = min(lons) - self._buffer
        min_lat = min(lats) - self._buffer
        max_lon = max(lons) + self._buffer
        max_lat = max(lats) + self._buffer

        log.debug(
            "HRDEM warm_cache: union bbox (%.4f,%.4f)-(%.4f,%.4f)",
            min_lon, min_lat, max_lon, max_lat,
        )
        self._resolve_tiles(min_lon, min_lat, max_lon, max_lat)

    def _resolve_tiles(
        self,
        min_lon: float, min_lat: float,
        max_lon: float, max_lat: float,
    ) -> list[str]:
        """Query STAC for DTM tiles covering the bbox and return source paths."""
        try:
            resp = requests.get(
                _STAC_SEARCH_URL,
                params={
                    "collections": _STAC_COLLECTION,
                    "bbox": f"{min_lon},{min_lat},{max_lon},{max_lat}",
                    "limit": 50,
                },
                timeout=30,
            )
            resp.raise_for_status()
            features = resp.json().get("features", [])
        except (requests.RequestException, ValueError) as exc:
            log.warning("HRDEM STAC search failed: %s", exc)
            return []

        sources: list[str] = []
        for feature in features:
            item_id = feature.get("id", "unknown")
            dtm_asset = feature.get("assets", {}).get(_STAC_DTM_ASSET)
            if not dtm_asset:
                continue
            href = dtm_asset.get("href", "")
            if not href:
                continue
            source = self._resolve_tile(item_id, href, min_lon, min_lat, max_lon, max_lat)
            if source:
                sources.append(source)

        return sources

    def _resolve_tile(
        self,
        item_id: str,
        href: str,
        min_lon: float, min_lat: float,
        max_lon: float, max_lat: float,
    ) -> Optional[str]:
        """Return the source path for a single STAC tile.

        With cache_dir: returns a local clip GeoTIFF, creating or expanding it
        if needed. Without cache_dir: returns a /vsicurl/ streaming path.
        """
        vsicurl = f"/vsicurl/{href}"

        if self._cache_dir is None:
            try:
                ds = gdal.Open(vsicurl)
                if ds is not None:
                    ds = None
                    return vsicurl
            except RuntimeError as exc:
                log.warning("HRDEM: tile not accessible %s: %s", item_id, exc)
            return None

        # ── cache_dir set ────────────────────────────────────────────────────
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        clip_path = self._cache_dir / f"{item_id}.tif"

        if clip_path.exists() and self._clip_covers(clip_path, min_lon, min_lat, max_lon, max_lat):
            log.debug("HRDEM: clip cache hit — %s", clip_path.name)
            return str(clip_path)

        if clip_path.exists():
            log.debug("HRDEM: clip too small for new bbox, re-clipping %s", item_id)
        else:
            log.debug("HRDEM: clipping %s from remote COG", item_id)

        return self._clip_from_cog(item_id, vsicurl, clip_path, min_lon, min_lat, max_lon, max_lat)

    def _clip_covers(
        self,
        clip_path: Path,
        min_lon: float, min_lat: float,
        max_lon: float, max_lat: float,
    ) -> bool:
        """Return True if the local clip GeoTIFF covers the requested WGS84 bbox."""
        try:
            ds = gdal.Open(str(clip_path))
            if ds is None:
                return False
            gt = ds.GetGeoTransform()
            w, h = ds.RasterXSize, ds.RasterYSize

            raster_srs = osr.SpatialReference()
            raster_srs.ImportFromWkt(ds.GetProjection())
            wgs84 = osr.SpatialReference()
            wgs84.ImportFromEPSG(4326)
            wgs84.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            ct = osr.CoordinateTransformation(raster_srs, wgs84)

            corners_proj = [
                (gt[0],             gt[3]),
                (gt[0] + w * gt[1], gt[3]),
                (gt[0],             gt[3] + h * gt[5]),
                (gt[0] + w * gt[1], gt[3] + h * gt[5]),
            ]
            corners_wgs = [ct.TransformPoint(x, y) for x, y in corners_proj]
            clip_lons = [c[0] for c in corners_wgs]
            clip_lats = [c[1] for c in corners_wgs]

            return (
                min(clip_lons) <= min_lon and max(clip_lons) >= max_lon
                and min(clip_lats) <= min_lat and max(clip_lats) >= max_lat
            )
        except (RuntimeError, OSError):
            return False

    def _clip_from_cog(
        self,
        item_id: str,
        vsicurl: str,
        clip_path: Path,
        min_lon: float, min_lat: float,
        max_lon: float, max_lat: float,
    ) -> Optional[str]:
        """Clip the bbox from the remote COG and save to clip_path."""
        tmp_path = clip_path.with_name(clip_path.stem + "-part.tif")
        try:
            src_ds = gdal.Open(vsicurl)
            if src_ds is None:
                log.warning("HRDEM: cannot open remote tile %s", item_id)
                return None

            wgs84 = osr.SpatialReference()
            wgs84.ImportFromEPSG(4326)
            wgs84.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            raster_srs = osr.SpatialReference()
            raster_srs.ImportFromWkt(src_ds.GetProjection())
            ct = osr.CoordinateTransformation(wgs84, raster_srs)

            ul_x, ul_y, _ = ct.TransformPoint(min_lon, max_lat)
            lr_x, lr_y, _ = ct.TransformPoint(max_lon, min_lat)

            clip_ds = gdal.Translate(
                str(tmp_path),
                src_ds,
                format="GTiff",
                projWin=[ul_x, ul_y, lr_x, lr_y],
                creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
            )
            src_ds = None

            if clip_ds is None:
                log.warning("HRDEM: gdal.Translate returned None for %s", item_id)
                tmp_path.unlink(missing_ok=True)
                return None

            clip_ds = None
            tmp_path.rename(clip_path)
            log.debug("HRDEM: clip saved → %s", clip_path.name)
            return str(clip_path)

        except (RuntimeError, OSError) as exc:
            log.warning("HRDEM: clip failed for %s: %s", item_id, exc)
            tmp_path.unlink(missing_ok=True)
            return vsicurl
