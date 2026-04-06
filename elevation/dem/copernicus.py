"""Copernicus DEM GLO-30 provider — global ~30 m fallback.

Fetches COG (Cloud-Optimised GeoTIFF) tiles from the AWS Open Data public
bucket via GDAL's /vsicurl/ virtual file-system and samples elevation values
directly from the raster.  HTTP range requests ensure only the COG tile blocks
that contain the requested points are transferred over the network — there is
no full-tile download.

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

Tile lifecycle (matching HRDEMProvider)
---------------------------------------
  fetch_tile()    identifies which 1°×1° tiles cover the trail bbox, verifies
                  each is accessible via a GDAL /vsicurl/ open (COG header
                  read, a few KB), and builds a GDAL VRT mosaic over the bbox.
  sample_points() reads pixel values directly from the open VRT dataset.
  close_tile()    closes the GDAL dataset and removes the temp VRT file.
"""

import logging
import math
import os
import tempfile
from typing import Optional

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

    Uses GDAL's /vsicurl/ driver to stream individual COG tile blocks via HTTP
    range requests, avoiding full GeoTIFF downloads.  Multiple 1°×1° tiles
    are merged into a single GDAL VRT when the trail's bounding box spans
    more than one degree cell.

    Tile lifecycle
    --------------
    fetch_tile()    opens the tiles covering the trail bbox via GDAL /vsicurl/
                    and merges them into a GDAL VRT dataset.
    sample_points() reads pixel values from the open VRT dataset.
    close_tile()    closes the dataset and removes the temp VRT file.
    """

    # ── tile management ──────────────────────────────────────────────────────

    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> Optional[dict]:
        """Open Copernicus GLO-30 COG tile(s) covering the given bounding box.

        Identifies every 1°×1° tile whose extent intersects the bbox, verifies
        each is accessible (GDAL reads the COG header via a range request), and
        builds a GDAL VRT mosaic from the valid tiles.  Returns None when no
        tiles are accessible (e.g. the trail is entirely over open ocean).
        """
        min_lon, min_lat, max_lon, max_lat = bbox

        # Enumerate all 1°×1° tiles whose SW corner falls within the bbox.
        lat_floors = range(math.floor(min_lat), math.floor(max_lat) + 1)
        lon_floors = range(math.floor(min_lon), math.floor(max_lon) + 1)

        valid_sources: list[str] = []
        for lat_f in lat_floors:
            for lon_f in lon_floors:
                name = _tile_name(lat_f, lon_f)
                path = _vsicurl_path(name)
                try:
                    ds = gdal.Open(path)
                    if ds is not None:
                        valid_sources.append(path)
                        ds = None  # close immediately; VRT will re-open
                except RuntimeError:
                    log.debug("Copernicus: tile not accessible: %s", path)

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
