"""Copernicus DEM GLO-30 provider — global 30 m fallback.

Uses the free OpenTopoData public API backed by the Copernicus DEM GLO-30
(approximately 30 m / 1 arc-second resolution, global coverage 80°S–90°N).
No API key is required.

API reference : https://www.opentopodata.org/#copernicus30-dem
Copernicus DEM: https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model

Public API limits (opentopodata.org hosted service):
  - Up to 100 locations per request
  - 1 request/second rate limit
  - Suitable for the trail densification workloads in this tool (~100s of points
    per trail); large bulk runs may need brief sleeps between requests.

This provider is used as a fallback for points where the Canada HRDEM WCS
returns no data (i.e. outside the HRDEM coverage footprint).
"""

import logging
from typing import Optional

import requests

from dem.base import DemProvider

log = logging.getLogger(__name__)

_API_URL = "https://api.opentopodata.org/v1/copernicus30"

# opentopodata.org accepts up to 100 coordinate pairs per request.
_MAX_BATCH = 100


class CopernicusProvider(DemProvider):
    """Copernicus DEM GLO-30 provider via opentopodata.org (~30 m, global).

    This provider has no tile concept — fetch_tile() returns None and
    sample_points() issues HTTP requests directly.  Points are batched to
    stay within the API's per-request coordinate limit.

    The API is free and does not require an API key.
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
        """Query the opentopodata.org Copernicus30 endpoint in batches."""
        results: list[Optional[float]] = []

        for i in range(0, len(points), _MAX_BATCH):
            batch = points[i : i + _MAX_BATCH]
            # opentopodata expects "lat,lon|lat,lon|…" (note: lat first)
            locations = "|".join(f"{lat:.6f},{lon:.6f}" for lon, lat in batch)

            try:
                resp = requests.get(
                    _API_URL,
                    params={"locations": locations},
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                # Successful response: {"results": [{"elevation": <float|null>, ...}, ...]}
                for result in data.get("results", []):
                    elev = result.get("elevation")
                    results.append(float(elev) if elev is not None else None)
            except requests.RequestException as exc:
                log.warning(
                    "Copernicus30 (opentopodata) request failed: %s — returning None for batch",
                    exc,
                )
                results.extend([None] * len(batch))

        return results
