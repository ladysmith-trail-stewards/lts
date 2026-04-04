"""Open-Meteo Elevation API — global low-resolution DEM fallback.

Uses the free Open-Meteo Elevation API which is backed by the Copernicus DEM
(approximately 90 m resolution globally).  No API key is required.

API reference: https://open-meteo.com/en/docs/elevation-api
Copernicus DEM: https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model

This provider is used as a fallback for points where the Canada HRDEM returns
no data (i.e. outside the HRDEM coverage footprint).
"""

import logging
from typing import Any, Optional

import requests

from dem.base import DemProvider

log = logging.getLogger(__name__)

_API_URL = "https://api.open-meteo.com/v1/elevation"

# Open-Meteo accepts up to 100 coordinates per request.
_MAX_BATCH = 100


class OpenMeteoProvider(DemProvider):
    """Open-Meteo Elevation API provider (Copernicus DEM ~90 m, global).

    This provider has no tile concept — fetch_tile() returns None and
    sample_points() issues HTTP requests directly.  Points are batched to
    stay within the API's per-request coordinate limit.
    """

    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> None:
        # No tile pre-fetching; all work is done in sample_points().
        return None

    def sample_points(
        self,
        tile: None,
        points: list[tuple[float, float]],
    ) -> list[Optional[float]]:
        if not points:
            return []
        return self._batch_query(points)

    # ── internal helpers ─────────────────────────────────────────────────────

    def _batch_query(self, points: list[tuple[float, float]]) -> list[Optional[float]]:
        """Query the Open-Meteo API in batches and return elevations."""
        results: list[Optional[float]] = []

        for i in range(0, len(points), _MAX_BATCH):
            batch = points[i : i + _MAX_BATCH]
            lats = [p[1] for p in batch]
            lons = [p[0] for p in batch]

            try:
                resp = requests.get(
                    _API_URL,
                    params={
                        "latitude": ",".join(f"{lat:.6f}" for lat in lats),
                        "longitude": ",".join(f"{lon:.6f}" for lon in lons),
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                elevations = data.get("elevation", [])
                # API returns None for water/no-data; preserve as-is.
                results.extend(
                    float(e) if e is not None else None for e in elevations
                )
            except requests.RequestException as exc:
                log.warning("Open-Meteo request failed: %s — returning None for batch", exc)
                results.extend([None] * len(batch))

        return results
