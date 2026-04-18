/**
 * Generic geo-file upload engine.
 *
 * `UploaderConfig<TRecord>` describes everything domain-specific. The dialog
 * and parser consume it without knowing anything about trails, regions, or any
 * particular DB table.
 */

import { gpx, kml } from '@tmcw/togeojson';

// ── Supported file formats ────────────────────────────────────────────────────

export type GeoFileFormat = 'geojson' | 'gpx' | 'kml';

export const GEO_FILE_FORMAT_EXTENSIONS: Record<GeoFileFormat, string[]> = {
  geojson: ['.geojson', '.json'],
  gpx: ['.gpx'],
  kml: ['.kml'],
};

// ── Geometry types ────────────────────────────────────────────────────────────

export type AcceptedGeometry = 'LineString' | 'Point' | 'Polygon' | 'Any';

// ── Bounding box ──────────────────────────────────────────────────────────────

/** [minLng, minLat, maxLng, maxLat] in WGS84 */
export type BBox = [number, number, number, number];

function pointInBBox([lng, lat]: [number, number], bbox: BBox): boolean {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function coordsInBBox(coords: [number, number][], bbox: BBox): boolean {
  return coords.every((c) => pointInBBox(c, bbox));
}

// ── Parsed record ─────────────────────────────────────────────────────────────

/**
 * A single feature extracted from a file, before domain mapping is applied.
 * `properties` is the raw GeoJSON properties bag.
 */
export interface RawFeature {
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  /** Source filename (for error messages). */
  sourceFile: string;
}

// ── Upload row result ─────────────────────────────────────────────────────────

export interface UploadRowResult {
  ok: boolean;
  message: string | null;
}

// ── Pending item (used by the dialog) ────────────────────────────────────────

export interface PendingItem<TRecord> {
  key: string;
  /** Human-readable label shown in the review list. */
  label: string;
  /** Coordinate count — shown as a badge. */
  coordCount: number;
  /** The mapped record ready to be submitted (mutated when the user edits the label). */
  record: TRecord;
  result?: UploadRowResult;
}

// ── UploaderConfig ────────────────────────────────────────────────────────────

export interface UploaderConfig<TRecord> {
  /** Dialog title, e.g. "Upload Trails" */
  title: string;

  /** Accepted file formats. */
  formats: GeoFileFormat[];

  /**
   * Which geometry types to keep. Features with other types are warned and
   * dropped. `'Any'` passes all geometry through.
   */
  geometryType: AcceptedGeometry;

  /**
   * Optional bounding box filter. Features with any coordinate outside the box
   * are warned and dropped.
   */
  boundingBox?: BBox;

  /**
   * When true, a region selector is shown before the user can submit.
   * The selected region id is passed into `mapFeature` as `regionId`.
   */
  regionBased: boolean;

  /**
   * Maps a parsed raw feature (plus optional regionId) to the domain record
   * that will be passed to `submit`. Return `null` to skip the feature with a
   * warning.
   */
  mapFeature: (
    raw: RawFeature,
    regionId: number | null
  ) => { record: TRecord; label: string } | null;

  /**
   * Validates a mapped record before the review list is shown. Return an error
   * string to block that item, or null if valid.
   */
  validate?: (record: TRecord) => string | null;

  /**
   * Submits the full batch to the backend. Returns per-row results.
   * The array is guaranteed to be in the same order as `records`.
   */
  submit: (records: TRecord[]) => Promise<UploadRowResult[]>;

  /** Singular noun for the data type, e.g. "trail". Used in button labels. */
  noun: string;
}

// ── File parsing ──────────────────────────────────────────────────────────────

export interface ParseFilesResult<TRecord> {
  items: PendingItem<TRecord>[];
  warnings: string[];
}

async function domFromXml(
  file: File
): Promise<{ dom: Document } | { error: string }> {
  const text = await file.text();
  try {
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    const parseError = dom.querySelector('parseerror');
    if (parseError)
      throw new Error(parseError.textContent ?? 'XML parse error');
    return { dom };
  } catch (err) {
    return {
      error: `${file.name}: invalid XML — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function geojsonFromFile(
  file: File
): Promise<{ geojson: GeoJSON.GeoJSON } | { error: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'gpx') {
    const result = await domFromXml(file);
    if ('error' in result) return result;
    return { geojson: gpx(result.dom) as unknown as GeoJSON.GeoJSON };
  }

  if (ext === 'kml') {
    const result = await domFromXml(file);
    if ('error' in result) return result;
    return { geojson: kml(result.dom) as unknown as GeoJSON.GeoJSON };
  }

  // GeoJSON / JSON
  const text = await file.text();
  try {
    return { geojson: JSON.parse(text) as GeoJSON.GeoJSON };
  } catch (err) {
    return {
      error: `${file.name}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function extractCoords(geometry: GeoJSON.Geometry): [number, number][] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates.slice(0, 2) as [number, number]];
    case 'LineString':
      return geometry.coordinates.map((c) => [c[0], c[1]]);
    case 'MultiLineString':
      return geometry.coordinates.flat().map((c) => [c[0], c[1]]);
    case 'Polygon':
      return geometry.coordinates[0].map((c) => [c[0], c[1]]);
    case 'MultiPolygon':
      return geometry.coordinates[0][0].map((c) => [c[0], c[1]]);
    default:
      return [];
  }
}

function normaliseGeometry(
  geometry: GeoJSON.Geometry,
  accepted: AcceptedGeometry
): GeoJSON.Geometry | null {
  if (accepted === 'Any') return geometry;

  // Flatten Multi* → single type where it makes sense.
  if (accepted === 'LineString' && geometry.type === 'MultiLineString') {
    const flat = (geometry.coordinates as number[][][]).flat();
    return { type: 'LineString', coordinates: flat };
  }
  if (accepted === 'Point' && geometry.type === 'MultiPoint') {
    return { type: 'Point', coordinates: geometry.coordinates[0] };
  }
  if (accepted === 'Polygon' && geometry.type === 'MultiPolygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates[0] };
  }

  if (geometry.type !== accepted) return null;
  return geometry;
}

/**
 * Parses an array of Files using the provided config and returns
 * PendingItems ready for the review dialog.
 */
export async function parseFiles<TRecord>(
  files: File[],
  config: UploaderConfig<TRecord>,
  regionId: number | null
): Promise<ParseFilesResult<TRecord>> {
  const items: PendingItem<TRecord>[] = [];
  const warnings: string[] = [];
  let keyCounter = Date.now();

  const acceptedExts = config.formats.flatMap(
    (f) => GEO_FILE_FORMAT_EXTENSIONS[f]
  );

  for (const file of files) {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!acceptedExts.includes(ext)) {
      warnings.push(`${file.name}: unsupported format "${ext}".`);
      continue;
    }

    const result = await geojsonFromFile(file);
    if ('error' in result) {
      warnings.push(result.error);
      continue;
    }

    const { geojson } = result;
    const rawFeatures: GeoJSON.Feature[] =
      geojson.type === 'FeatureCollection'
        ? geojson.features
        : geojson.type === 'Feature'
          ? [geojson]
          : [];

    if (rawFeatures.length === 0) {
      warnings.push(`${file.name}: no features found.`);
      continue;
    }

    for (const f of rawFeatures) {
      if (!f.geometry) {
        warnings.push(`${file.name}: skipped feature with no geometry.`);
        continue;
      }

      const normalised = normaliseGeometry(f.geometry, config.geometryType);
      if (!normalised) {
        warnings.push(
          `${file.name}: skipped ${f.geometry.type} (expected ${config.geometryType}).`
        );
        continue;
      }

      const coords = extractCoords(normalised);

      const isPointGeom =
        normalised.type === 'Point' || normalised.type === 'MultiPoint';
      const minCoords = config.geometryType === 'Point' || isPointGeom ? 1 : 2;
      if (coords.length < minCoords) {
        warnings.push(
          `${file.name}: skipped feature with too few coordinates.`
        );
        continue;
      }

      if (config.boundingBox && !coordsInBBox(coords, config.boundingBox)) {
        warnings.push(`${file.name}: skipped feature outside bounding box.`);
        continue;
      }

      // Strip Z coordinate — DB columns are 2D.
      const geometry2d = stripZ(normalised);

      const raw: RawFeature = {
        geometry: geometry2d,
        properties: (f.properties ?? {}) as Record<string, unknown>,
        sourceFile: file.name,
      };

      const mapped = config.mapFeature(raw, regionId);
      if (!mapped) {
        warnings.push(
          `${file.name}: skipped feature (mapFeature returned null).`
        );
        continue;
      }

      const validationError = config.validate?.(mapped.record) ?? null;
      if (validationError) {
        warnings.push(`${file.name}: skipped — ${validationError}`);
        continue;
      }

      items.push({
        key: String(keyCounter++),
        label: mapped.label,
        coordCount: coords.length,
        record: mapped.record,
      });
    }
  }

  return { items, warnings };
}

function stripZ(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: geometry.coordinates.slice(0, 2) };
    case 'LineString':
      return {
        type: 'LineString',
        coordinates: geometry.coordinates.map(
          (c) => c.slice(0, 2) as [number, number]
        ),
      };
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map((ring) =>
          ring.map((c) => c.slice(0, 2) as [number, number])
        ),
      };
    case 'Polygon':
      return {
        type: 'Polygon',
        coordinates: geometry.coordinates.map((ring) =>
          ring.map((c) => c.slice(0, 2) as [number, number])
        ),
      };
    default:
      return geometry;
  }
}
