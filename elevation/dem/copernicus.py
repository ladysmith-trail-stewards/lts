"""Copernicus DEM GLO-30 provider — global ~30 m fallback.

Fetches COG (Cloud-Optimised GeoTIFF) tiles from the AWS Open Data public
bucket and samples elevation values directly from the raster.

AWS Open Data registry:
  https://registry.opendata.aws/copernicus-dem/

S3 bucket (public, no authentication required):
  s3://copernicus-dem-30m/

Tile-naming convention (1°×1° cells, SW-corner labelled):
  Copernicus_DSM_COG_10_{NS}{lat:02d}_00_{EW}{lon:03d}_00_DEM

Example — trail near (lat ≈ 48.9°N, lon ≈ 123.8°W):
  SW corner → (N48, W124)
  https://copernicus-dem-30m.s3.amazonaws.com/
      Copernicus_DSM_COG_10_N48_00_W124_00_DEM/
      Copernicus_DSM_COG_10_N48_00_W124_00_DEM.tif

Local tile cache
----------------
When cache_dir is configured, each 1°×1° GeoTIFF tile is downloaded in full
on its first use and written to the cache directory as ``{name}.tif``.
Subsequent runs open the local file instead of making any network requests.

If a tile is not yet cached, it is streamed via GDAL's /vsicurl/ virtual
file-system using HTTP range requests (only the COG blocks covering the
requested points are fetched); it is then immediately also saved to the cache
directory for future use.

When cache_dir is None, the original /vsicurl/ streaming behaviour is used
without any local storage.

Tile lifecycle (matching HRDEMProvider)
---------------------------------------
  fetch_tile()    resolves each needed 1°×1° tile to a local path (cached) or
                  a /vsicurl/ path (not cached), downloads missing tiles when
                  cache_dir is set, and builds a GDAL VRT mosaic over the bbox.
  sample_points() reads pixel values directly from the open VRT dataset.
  close_tile()    closes the GDAL dataset and removes the temp VRT file.
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
    """Copernicus DEM GLO-30 (~30 m, global) via AWS Open Data COG tiles.

    On cache miss the tile is streamed via GDAL /vsicurl/ (COG range requests)
    and, when cache_dir is set, also downloaded in full so future runs can read
    it entirely from disk without any network access.

    Multiple 1°×1° tiles are merged into a single GDAL VRT when the trail's
    bounding box spans more than one degree cell.

    Tile lifecycle
    --------------
    fetch_tile()    resolves tiles to local paths (cached) or /vsicurl/ paths
                    (uncached), downloads tiles to cache when cache_dir is set,
                    and builds a GDAL VRT mosaic dataset.
    sample_points() reads pixel values from the open VRT dataset.
    close_tile()    closes the dataset and removes the temp VRT file.
    """

    def __init__(self, cache_dir: Optional[str] = None) -> None:
        self._cache_dir: Optional[Path] = Path(cache_dir) if cache_dir else None

    # ── tile management ──────────────────────────────────────────────────────

    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> Optional[dict]:
        """Open Copernicus GLO-30 tile(s) covering the given bounding box.

        Resolves each needed 1°×1° tile to a local cached file (downloading it
        if necessary) or to a GDAL /vsicurl/ path.  Merges all accessible tiles
        into a GDAL VRT mosaic.  Returns None when no tiles are accessible (e.g.
        the trail is entirely over open ocean).
        """
        min_lon, min_lat, max_lon, max_lat = bbox

        # Enumerate all 1°×1° tiles whose SW corner falls within the bbox.
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
        """Sample elevation values from the VRT raster dataset."""
        if tile is None:
            return [None] * len(points)

        ds: gdal.Dataset = tile["dataset"]
        gt = ds.GetGeoTransform()
        band = ds.GetRasterBand(1)
        nodata = band.GetNoDataValue()
        width, height = ds.RasterXSize, ds.RasterYSize

        results: list[Optional[float]] = []
        for lon, lat in points:
            # Affine transform: px = (lon - x_origin) / pixel_width
            px = int((lon - gt[0]) / gt[1])
            py = int((lat - gt[3]) / gt[5])

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
        tile["dataset"] = None  # close GDAL dataset
        vrt_path = tile.get("vrt_path")
        if vrt_path and os.path.exists(vrt_path):
            os.unlink(vrt_path)

    # ── internal helpers ─────────────────────────────────────────────────────

    def _resolve_tile(self, name: str) -> Optional[str]:
        """Return the source path to use for the given tile name.

        Resolution order:
        1. Local cache file (if cache_dir is set and the file exists).
        2. Download from S3 to cache_dir (if cache_dir is set but not yet cached).
        3. GDAL /vsicurl/ path (if cache_dir is not set or download fails).

        Returns None if the tile is not accessible from any source.
        """
        if self._cache_dir is not None:
            self._cache_dir.mkdir(parents=True, exist_ok=True)
            local_path = self._cache_dir / f"{name}.tif"

            if local_path.exists():
                log.debug("Copernicus: cache hit — %s", local_path.name)
                return str(local_path)

            # Cache miss — download the full tile.
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

        # No cache_dir, or download failed — stream via /vsicurl/.
        vsicurl = _vsicurl_path(name)
        try:
            ds = gdal.Open(vsicurl)
            if ds is not None:
                ds = None  # close immediately; VRT will re-open
                return vsicurl
        except RuntimeError:
            pass
        log.debug("Copernicus: tile not accessible: %s", name)
        return None
