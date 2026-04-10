/**
 * Parses GeoJSON, GPX, and KML files into arrays of TrailFeature objects ready
 * to be sent to `upsertTrailsDb`.
 *
 * GPX and KML files are converted to GeoJSON via `@tmcw/togeojson`. All
 * formats support FeatureCollections or individual Features. Only LineString
 * geometries are accepted — Points, Polygons, etc. are silently dropped.
 */

import { gpx, kml } from '@tmcw/togeojson';
import type { TrailFeature } from '@/lib/db_services/trails/upsertTrailsDb';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParseResult {
  features: TrailFeature[];
  /** Non-fatal warnings (e.g. skipped geometries). */
  warnings: string[];
}

export interface ParseError {
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts valid LineString Features from a raw GeoJSON FeatureCollection or
 * Feature. Returns warnings for every skipped / unsupported geometry.
 */
function extractLineStrings(
  json: GeoJSON.GeoJSON,
  filename: string
): ParseResult {
  const features: TrailFeature[] = [];
  const warnings: string[] = [];

  const rawFeatures: GeoJSON.Feature[] =
    json.type === 'FeatureCollection'
      ? json.features
      : json.type === 'Feature'
        ? [json]
        : [];

  if (rawFeatures.length === 0) {
    warnings.push(`${filename}: no features found.`);
    return { features, warnings };
  }

  for (const f of rawFeatures) {
    if (!f.geometry) {
      warnings.push(`${filename}: skipped feature with no geometry.`);
      continue;
    }

    let coords: [number, number][];

    if (f.geometry.type === 'LineString') {
      coords = f.geometry.coordinates as [number, number][];
    } else if (f.geometry.type === 'MultiLineString') {
      // Flatten all segments into a single LineString.
      coords = (f.geometry.coordinates as [number, number][][]).flat();
    } else {
      warnings.push(
        `${filename}: skipped ${f.geometry.type} geometry (only LineString supported).`
      );
      continue;
    }

    if (coords.length < 2) {
      warnings.push(`${filename}: skipped feature with fewer than 2 points.`);
      continue;
    }

    // Strip Z-coordinate (altitude) — the DB geometry column is 2D.
    const coords2d: [number, number][] = coords.map(([lng, lat]) => [lng, lat]);

    const props = f.properties ?? {};
    const name: string =
      (props['name'] as string | undefined) ??
      (props['title'] as string | undefined) ??
      filename.replace(/\.[^.]+$/, '');

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords2d },
      properties: {
        name,
        type: (props['type'] as string | undefined) ?? 'trail',
        region_id: undefined as unknown as number, // caller must supply
        visibility: 'public',
        description: (props['desc'] as string | undefined) ?? null,
        planned: false,
        connector: false,
      },
    });
  }

  return { features, warnings };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Parse a `.geojson` / `.json` file. */
export async function parseGeoJsonFile(file: File): Promise<ParseResult> {
  const text = await file.text();

  let json: GeoJSON.GeoJSON;
  try {
    json = JSON.parse(text) as GeoJSON.GeoJSON;
  } catch (err) {
    return {
      features: [],
      warnings: [
        `${file.name}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  return extractLineStrings(json, file.name);
}

/** Parse a `.gpx` file, converting to GeoJSON first. */
export async function parseGpxFile(file: File): Promise<ParseResult> {
  const text = await file.text();

  let dom: Document;
  try {
    dom = new DOMParser().parseFromString(text, 'text/xml');
    const parseError = dom.querySelector('parseerror');
    if (parseError) {
      throw new Error(parseError.textContent ?? 'XML parse error');
    }
  } catch (err) {
    return {
      features: [],
      warnings: [
        `${file.name}: invalid XML — ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const geojson = gpx(dom);
  return extractLineStrings(geojson as GeoJSON.GeoJSON, file.name);
}

/** Parse a `.kml` file, converting to GeoJSON first. */
export async function parseKmlFile(file: File): Promise<ParseResult> {
  const text = await file.text();

  let dom: Document;
  try {
    dom = new DOMParser().parseFromString(text, 'text/xml');
    const parseError = dom.querySelector('parseerror');
    if (parseError) {
      throw new Error(parseError.textContent ?? 'XML parse error');
    }
  } catch (err) {
    return {
      features: [],
      warnings: [
        `${file.name}: invalid XML — ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const geojson = kml(dom);
  return extractLineStrings(geojson as GeoJSON.GeoJSON, file.name);
}

/** Dispatch to the correct parser based on file extension. */
export async function parseTrailFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'gpx') return parseGpxFile(file);
  if (ext === 'kml') return parseKmlFile(file);
  if (ext === 'geojson' || ext === 'json') return parseGeoJsonFile(file);

  return {
    features: [],
    warnings: [`${file.name}: unsupported file type ".${ext ?? '?'}".`],
  };
}
