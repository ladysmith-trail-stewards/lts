/**
 * Valibot schemas for trail DB I/O shapes.
 *
 * Reference: Database['public']['Tables']['trails'] and
 *            Database['public']['Views']['trails_view']
 * (src/lib/supabase/database.types.ts — do NOT edit that file manually).
 *
 * The codegen view Row has every column as `| null` because PostgreSQL views
 * expose no nullability metadata.  The schemas below reinstate the actual NOT
 * NULL constraints from the underlying `trails` table, and narrow
 * `geometry_geojson` to a typed LineString instead of `Json | null`.
 */

import * as v from 'valibot';

// ── Geometry ──────────────────────────────────────────────────────────────────

/** GeoJSON LineString with 2-D coordinates. */
export const TrailLineStringSchema = v.object({
  type: v.literal('LineString'),
  coordinates: v.array(v.tuple([v.number(), v.number()])),
});

export type TrailLineString = v.InferOutput<typeof TrailLineStringSchema>;

// ── Read — rows returned by trails_view ──────────────────────────────────────
//
// Non-null columns mirror the `trails` table Row (bike, connector, hidden,
// planned, id, name, type, visibility, region_id, created_at, updated_at).
// Nullable columns (description, trail_class, direction, activity_types,
// tf_popularity, distance_m) stay `| null`.
// geometry_geojson is narrowed from `Json | null` to TrailLineString.

export const TrailReadSchema = v.object({
  id: v.number(),
  name: v.string(),
  type: v.string(),
  description: v.nullable(v.string()),
  trail_class: v.nullable(v.string()),
  direction: v.nullable(v.string()),
  activity_types: v.nullable(v.array(v.string())),
  bike: v.boolean(),
  connector: v.boolean(),
  hidden: v.boolean(),
  planned: v.boolean(),
  visibility: v.string(),
  region_id: v.number(),
  tf_popularity: v.nullable(v.number()),
  distance_m: v.nullable(v.number()),
  geometry_geojson: TrailLineStringSchema,
  created_at: v.string(),
  updated_at: v.string(),
});

/** A fully-resolved trail row from `trails_view` with narrow nullability. */
export type TrailRow = v.InferOutput<typeof TrailReadSchema>;

// ── Write — properties payload for the upsert_trails RPC ─────────────────────
//
// Reference: Database['public']['Tables']['trails']['Insert']
// `geometry` is passed as the Feature's geometry field, not in properties.
// `created_at` / `updated_at` are server-managed.
//
// Fields marked optional here match the DB Insert type — they are NOT NULL in
// the table but have server-side defaults (bike, connector, hidden, planned,
// visibility all default to false / 'public').  Omitting them on INSERT lets
// the database apply those defaults; on UPDATE they should be provided
// explicitly to avoid unintended resets.

export const TrailUpsertPropertiesSchema = v.object({
  /** Omit for INSERT; provide for UPDATE. */
  id: v.optional(v.nullable(v.number())),
  name: v.string(),
  type: v.string(),
  region_id: v.number(),
  description: v.optional(v.nullable(v.string())),
  trail_class: v.optional(
    v.nullable(
      v.picklist([
        'EASIEST',
        'EASY',
        'INTERMEDIATE',
        'BLACK',
        'DOUBLE_BLACK',
        'ADVANCED',
        'PRO',
        'ACCESS',
        'PATH',
        'SECONDARY',
        'IMBY',
        'LIFT',
        'TBD',
      ] as const)
    )
  ),
  direction: v.optional(
    v.nullable(v.picklist(['both', 'oneway', 'oneway-reverse'] as const))
  ),
  activity_types: v.optional(v.nullable(v.array(v.string()))),
  bike: v.optional(v.boolean()),
  connector: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  planned: v.optional(v.boolean()),
  tf_popularity: v.optional(v.nullable(v.number())),
  visibility: v.optional(v.picklist(['public', 'private', 'shared'] as const)),
});

export type TrailUpsertProperties = v.InferOutput<
  typeof TrailUpsertPropertiesSchema
>;

// ── Write — full GeoJSON Feature sent to upsert_trails RPC ───────────────────

export const TrailUpsertFeatureSchema = v.object({
  type: v.literal('Feature'),
  geometry: TrailLineStringSchema,
  properties: TrailUpsertPropertiesSchema,
});

export type TrailUpsertFeature = v.InferOutput<typeof TrailUpsertFeatureSchema>;
