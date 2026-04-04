"""Canada HRDEM DEM provider.

Fetches a Digital Terrain Model (DTM) tile from the Natural Resources Canada
(NRCan) HRDEM Mosaic via OGC Web Coverage Service (WCS) 2.0.1.

Service details
---------------
Endpoint   : https://datacube.services.geo.ca/ows/elevation
WCS version: 2.0.1
Coverage   : DTM mosaic at up to 1 m resolution (coverage available for most
             populated / surveyed areas of Canada; returns no data elsewhere).
             The exact coverage identifier is discovered at runtime from
             GetCapabilities and cached for the life of the provider object.
CRS        : Geographic subsets are requested in EPSG:4326 (WGS84 lon/lat).
             The service returns a GeoTIFF in its native CRS; GDAL handles
             re-sampling automatically when we query pixel values.

Official access guide (PDF):
  https://www.download-telecharger.services.geo.ca/pub/elevation/dem_mne/
  HRDEMmosaic_mosaiqueMNEHR/HRDEM_Mosaic_WCS-WMS_instructions_EN.pdf

STAC API (modern alternative, not used here):
  https://datacube.services.geo.ca/stac/api/
"""

import logging
import os
import tempfile
from typing import Any, Optional
from xml.etree import ElementTree

import requests
from osgeo import gdal

from dem.base import DemProvider

log = logging.getLogger(__name__)

# Ensure GDAL exceptions are raised instead of silently returning None.
gdal.UseExceptions()

_WCS_URL = "https://datacube.services.geo.ca/ows/elevation"
_WCS_VERSION = "2.0.1"

# Known fallback if GetCapabilities parsing fails.
_DEFAULT_DTM_COVERAGE = "HRDEMMosaic:HRDEM_DTM"

# WCS namespace used in the capabilities document.
_WCS_NS = "http://www.opengis.net/wcs/2.0"

# Degrees added around the trail bbox so that edge points sample valid pixels.
_DEFAULT_BUFFER_DEG = 0.002


class HRDEMProvider(DemProvider):
    """NRCan HRDEM Mosaic DTM provider (WCS 2.0.1).

    Tile lifecycle
    --------------
    fetch_tile()   downloads one GeoTIFF per trail and writes it to a temp
                   file that GDAL keeps open.
    sample_points() reads pixel values directly from the open dataset.
    close_tile()   closes the GDAL dataset and deletes the temp file.
    """

    def __init__(self, buffer_deg: float = _DEFAULT_BUFFER_DEG) -> None:
        self._buffer = buffer_deg
        self._coverage_id: Optional[str] = None

    # ── tile management ──────────────────────────────────────────────────────

    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> Optional[dict]:
        min_lon, min_lat, max_lon, max_lat = bbox
        min_lon -= self._buffer
        min_lat -= self._buffer
        max_lon += self._buffer
        max_lat += self._buffer

        coverage_id = self._get_dtm_coverage_id()
        log.debug("HRDEM GetCoverage: coverage=%s bbox=(%.4f %.4f %.4f %.4f)",
                  coverage_id, min_lon, min_lat, max_lon, max_lat)

        # Repeated 'subset' parameters are passed as a list of 2-tuples so that
        # requests encodes them as ?subset=Long(…)&subset=Lat(…).
        params = [
            ("service", "WCS"),
            ("version", _WCS_VERSION),
            ("request", "GetCoverage"),
            ("coverageId", coverage_id),
            ("subset", f"Long({min_lon},{max_lon})"),
            ("subset", f"Lat({min_lat},{max_lat})"),
            ("format", "image/tiff"),
        ]

        try:
            resp = requests.get(_WCS_URL, params=params, timeout=60)
        except requests.RequestException as exc:
            log.warning("HRDEM request failed: %s", exc)
            return None

        content_type = resp.headers.get("content-type", "")
        if resp.status_code != 200 or not content_type.startswith("image/tiff"):
            log.debug("HRDEM returned %s (%s) — no coverage for this area",
                      resp.status_code, content_type)
            return None

        # Write to a named temp file so GDAL can open it.
        tmp = tempfile.NamedTemporaryFile(suffix=".tif", delete=False)
        try:
            tmp.write(resp.content)
            tmp.flush()
            tmp.close()

            ds = gdal.Open(tmp.name)
            if ds is None:
                log.warning("GDAL could not open HRDEM GeoTIFF")
                os.unlink(tmp.name)
                return None

            log.debug("HRDEM tile: %dx%d pixels", ds.RasterXSize, ds.RasterYSize)
            return {"dataset": ds, "path": tmp.name}

        except Exception as exc:  # noqa: BLE001
            log.warning("HRDEM tile preparation failed: %s", exc)
            if os.path.exists(tmp.name):
                os.unlink(tmp.name)
            return None

    def sample_points(
        self,
        tile: Optional[dict],
        points: list[tuple[float, float]],
    ) -> list[Optional[float]]:
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
        if tile is None:
            return
        tile["dataset"] = None  # close GDAL dataset
        path = tile.get("path")
        if path and os.path.exists(path):
            os.unlink(path)

    # ── internal helpers ─────────────────────────────────────────────────────

    def _get_dtm_coverage_id(self) -> str:
        """Discover the DTM coverage identifier from GetCapabilities.

        The result is cached so that subsequent trails in the same run do not
        issue additional HTTP requests.
        """
        if self._coverage_id:
            return self._coverage_id

        try:
            resp = requests.get(
                _WCS_URL,
                params={"service": "WCS", "version": _WCS_VERSION, "request": "GetCapabilities"},
                timeout=30,
            )
            resp.raise_for_status()
            root = ElementTree.fromstring(resp.content)

            for summary in root.iter(f"{{{_WCS_NS}}}CoverageSummary"):
                id_elem = summary.find(f"{{{_WCS_NS}}}CoverageId")
                if id_elem is not None and "DTM" in id_elem.text.upper():
                    self._coverage_id = id_elem.text
                    log.info("HRDEM: using coverage '%s'", self._coverage_id)
                    return self._coverage_id

        except Exception as exc:  # noqa: BLE001
            log.warning("Could not parse HRDEM GetCapabilities: %s — using default", exc)

        self._coverage_id = _DEFAULT_DTM_COVERAGE
        log.info("HRDEM: falling back to default coverage '%s'", self._coverage_id)
        return self._coverage_id
