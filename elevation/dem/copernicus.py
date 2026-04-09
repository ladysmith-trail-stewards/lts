"""Copernicus DEM GLO-30 provider — global ~30 m fallback.

Fetches 1°×1° COG tiles from the AWS Open Data public bucket.
AWS Open Data registry: https://registry.opendata.aws/copernicus-dem/
"""

import logging
import math
import os
import tempfile
from pathlib import Path
from typing import Optional

import requests
from osgeo import gdal

from dem.base import DemProvider

log = logging.getLogger(__name__)

# Ensure GDAL exceptions are raised instead of silently returning None.
gdal.UseExceptions()

_S3_HTTPS_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"


def _tile_name(lat_floor: int, lon_floor: int) -> str:
    """Return the file-name stem for the 1°×1° COG tile whose SW corner is
    at (lat_floor, lon_floor)."""
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return (
        f"Copernicus_DSM_COG_10_{ns}{abs(lat_floor):02d}_00"
        f"_{ew}{abs(lon_floor):03d}_00_DEM"
    )


def _vsicurl_path(name: str) -> str:
    """Return the GDAL /vsicurl/ path for the given tile name."""
    return f"/vsicurl/{_S3_HTTPS_BASE}/{name}/{name}.tif"


class CopernicusProvider(DemProvider):
    """Copernicus DEM GLO-30 (~30 m, global) via AWS Open Data COG tiles."""

    def __init__(self, cache_dir: Optional[str] = None) -> None:
        self._cache_dir: Optional[Path] = Path(cache_dir) if cache_dir else None

    # ── tile management ──────────────────────────────────────────────────────

    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> Optional[dict]:
        """Open Copernicus GLO-30 tile(s) covering the given bounding box."""
        min_lon, min_lat, max_lon, max_lat = bbox

        lat_floors = range(math.floor(min_lat), math.floor(max_lat) + 1)
        lon_floors = range(math.floor(min_lon), math.floor(max_lon) + 1)

        valid_sources: list[str] = []
        for lat_f in lat_floors:
            for lon_f in lon_floors:
                name = _tile_name(lat_f, lon_f)
                source = self._resolve_tile(name)
                if source:
                    valid_sources.append(source)

        if not valid_sources:
            log.warning(
                "Copernicus: no accessible tiles for bbox (%.3f,%.3f)-(%.3f,%.3f)",
                min_lon, min_lat, max_lon, max_lat,
            )
            return None

        vrt_path: Optional[str] = None
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".vrt", delete=False)
            vrt_path = tmp.name
            tmp.close()

            vrt_ds = gdal.BuildVRT(vrt_path, valid_sources)
            if vrt_ds is None:
                log.warning("Copernicus: gdal.BuildVRT returned None")
                os.unlink(vrt_path)
                return None

            log.debug(
                "Copernicus: VRT built from %d tile(s) for bbox (%.3f,%.3f)-(%.3f,%.3f)",
                len(valid_sources), min_lon, min_lat, max_lon, max_lat,
            )
            return {"dataset": vrt_ds, "vrt_path": vrt_path}

        except (OSError, RuntimeError) as exc:
            log.warning("Copernicus: VRT build failed: %s", exc)
            if vrt_path and os.path.exists(vrt_path):
                os.unlink(vrt_path)
            return None

    def sample_points(
        self,
        tile: Optional[dict],
        points: list[tuple[float, float]],
    ) -> list[Optional[float]]:
        """Sample elevation values from the VRT raster dataset.

        Reads the entire clipped raster into a numpy array once, then resolves
        all point lookups via array indexing — far faster than one
        ``ReadAsArray(px, py, 1, 1)`` call per point.  Copernicus tiles are
        already in WGS84 so no CRS transform is needed.
        """
        if tile is None:
            return [None] * len(points)

        import numpy as np

        ds: gdal.Dataset = tile["dataset"]
        gt = ds.GetGeoTransform()
        width, height = ds.RasterXSize, ds.RasterYSize

        # Read the full clipped raster into memory once.
        if "data" not in tile:
            band = ds.GetRasterBand(1)
            nodata = band.GetNoDataValue()
            arr = band.ReadAsArray().astype(float)
            if nodata is not None:
                arr[np.abs(arr - float(nodata)) < 1e-3] = float("nan")
            tile["data"] = arr
        data: np.ndarray = tile["data"]

        results: list[Optional[float]] = []
        for lon, lat in points:
            px = int((lon - gt[0]) / gt[1])
            py = int((lat - gt[3]) / gt[5])

            if px < 0 or py < 0 or px >= width or py >= height:
                results.append(None)
                continue

            value = data[py, px]
            results.append(None if np.isnan(value) else float(value))

        return results

    def close_tile(self, tile: Optional[dict]) -> None:
        """Close the GDAL VRT dataset and remove the temp VRT file."""
        if tile is None:
            return
        tile["dataset"] = None
        vrt_path = tile.get("vrt_path")
        if vrt_path and os.path.exists(vrt_path):
            os.unlink(vrt_path)

    # ── internal helpers ─────────────────────────────────────────────────────

    def _resolve_tile(self, name: str) -> Optional[str]:
        """Return the source path to use for the given tile name.

        Returns a local cached path, downloading the tile if not yet cached,
        or a /vsicurl/ streaming path when cache_dir is not set.
        Returns None if the tile is not accessible.
        """
        if self._cache_dir is not None:
            self._cache_dir.mkdir(parents=True, exist_ok=True)
            local_path = self._cache_dir / f"{name}.tif"

            if local_path.exists():
                log.debug("Copernicus: cache hit — %s", local_path.name)
                return str(local_path)

            url = f"{_S3_HTTPS_BASE}/{name}/{name}.tif"
            log.debug("Copernicus: downloading tile %s", name)
            try:
                resp = requests.get(url, timeout=120, stream=True)
                if resp.status_code == 200:
                    with open(local_path, "wb") as fh:
                        for chunk in resp.iter_content(chunk_size=65536):
                            fh.write(chunk)
                    log.debug("Copernicus: cached %s → %s", name, local_path)
                    return str(local_path)
                else:
                    log.debug(
                        "Copernicus: tile not found on S3: %s (HTTP %d)",
                        name, resp.status_code,
                    )
                    return None
            except requests.RequestException as exc:
                log.warning("Copernicus: download failed for %s: %s", name, exc)
                if local_path.exists():
                    local_path.unlink()
                # Fall through to /vsicurl/ as last resort.

        vsicurl = _vsicurl_path(name)
        try:
            ds = gdal.Open(vsicurl)
            if ds is not None:
                ds = None
                return vsicurl
        except RuntimeError:
            pass
        log.debug("Copernicus: tile not accessible: %s", name)
        return None
