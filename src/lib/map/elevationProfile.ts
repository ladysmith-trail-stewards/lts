/**
 * Normalised elevation point — single contract regardless of data source.
 * Matches the spec from issue #97.
 */
export type ElevationPoint = {
  /** Position within the coordinate array — used for map ↔ plot sync. */
  index: number;
  lat: number;
  lng: number;
  /** Cumulative distance from the trail start (km). */
  distanceKm: number;
  /** Elevation above sea level (m). */
  elevationM: number;
  /** Elevation change relative to the previous point (m). Positive = gain. */
  elevationDeltaM: number;
};

// ── Haversine distance ────────────────────────────────────────────────────────

const R = 6371000; // Earth radius in metres

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance in metres between two [lng, lat] positions.
 */
export function haversineM(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── Case A — build from elevation_coords (from trails_view) ──────────────────

/**
 * Normalises the `elevation_coords` column from `trails_view` into the
 * elevation profile contract.
 *
 * The view aggregates trail_elevations.geom4d into float[][] where each
 * inner array is [lng, lat, elevation_m, distance_m] — the raw XYZM ordinates
 * from the PostGIS LineStringZM, ordered by vertex path index.
 */
export function buildProfileFromCoords(coords: number[][]): ElevationPoint[] {
  if (coords.length === 0) return [];

  return coords.map((coord, index) => {
    const [lng, lat, z, m] = coord;
    const prevZ = index > 0 ? coords[index - 1][2] : z;
    return {
      index,
      lat,
      lng,
      distanceKm: m / 1000,
      elevationM: z,
      elevationDeltaM: index === 0 ? 0 : z - prevZ,
    };
  });
}

// ── Case B — build from 2D geometry + Mapbox terrain elevation ────────────────

/**
 * Queries Mapbox GL's terrain model for the elevation at a given point.
 *
 * `map.queryTerrainElevation` returns `null` when terrain is not loaded or the
 * point is off the visible canvas — we fall back to `0` in that case.
 */
type MapboxMapWithTerrain = {
  queryTerrainElevation: (
    lngLat: { lng: number; lat: number },
    options?: { exaggerated: boolean }
  ) => number | null | undefined;
};

/**
 * Builds an elevation profile from a plain 2D LineString by sampling the
 * Mapbox terrain model at each vertex.  Less accurate than 4D geometry but
 * works as a graceful fallback.
 *
 * @param coordinates - Array of [lng, lat] tuples.
 * @param map - A mapbox-gl Map instance that has terrain enabled.
 */
export function buildProfileFromMapboxTerrain(
  coordinates: [number, number][],
  map: MapboxMapWithTerrain
): ElevationPoint[] {
  if (coordinates.length === 0) return [];

  let cumulativeM = 0;

  return coordinates.map(([lng, lat], index) => {
    if (index > 0) {
      cumulativeM += haversineM(coordinates[index - 1], [lng, lat]);
    }

    const elevationM =
      map.queryTerrainElevation({ lng, lat }, { exaggerated: false }) ?? 0;

    const prevElevation =
      index > 0
        ? (map.queryTerrainElevation(
            { lng: coordinates[index - 1][0], lat: coordinates[index - 1][1] },
            { exaggerated: false }
          ) ?? 0)
        : elevationM;

    return {
      index,
      lat,
      lng,
      distanceKm: cumulativeM / 1000,
      elevationM,
      elevationDeltaM: index === 0 ? 0 : elevationM - prevElevation,
    };
  });
}
