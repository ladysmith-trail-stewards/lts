from abc import ABC, abstractmethod
from typing import Any, Optional


class DemProvider(ABC):
    """Abstract base class for Digital Elevation Model providers.

    Concrete providers implement sample_points() using their own data source
    (e.g. a WCS raster tile or an HTTP batch API).  The caller fetches a tile
    once per trail and then samples all densified points from it, falling back
    to another provider for any points that return None.
    """

    @abstractmethod
    def fetch_tile(self, bbox: tuple[float, float, float, float]) -> Any:
        """Fetch or prepare a DEM tile covering the given bounding box.

        Args:
            bbox: (min_lon, min_lat, max_lon, max_lat) in WGS84 degrees.

        Returns:
            An opaque tile object passed back to sample_points(), or None if
            this provider has no coverage for the area.
        """

    @abstractmethod
    def sample_points(
        self,
        tile: Any,
        points: list[tuple[float, float]],
    ) -> list[Optional[float]]:
        """Sample elevations for a list of (lon, lat) points.

        Args:
            tile:   The object returned by fetch_tile() for this trail's bbox.
            points: List of (lon, lat) tuples in WGS84 degrees.

        Returns:
            Elevation in metres for each point, or None where no data exists.
            The returned list has the same length as points.
        """

    def close_tile(self, tile: Any) -> None:  # noqa: B027
        """Release any resources held by a tile (e.g. open file handles).

        Override in subclasses that open files or allocate memory for the tile.
        The default implementation does nothing.
        """
