import * as v from 'valibot';

// ── Shared picklists ─────────────────────────────────────────────────────────

const VisibilitySchema = v.picklist(
  ['public', 'private', 'shared'] as const,
  'Visibility must be public, private, or shared'
);

// ── Collection-level inputs ──────────────────────────────────────────────────

export const GeneralGeomCollectionInputSchema = v.object({
  label: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Collection label is required'),
    v.maxLength(200)
  ),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(2000)))),
  visibility: VisibilitySchema,
  feature_collection_type: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Feature collection type is required')
  ),
  style: v.optional(v.record(v.string(), v.unknown())),
  region_id: v.pipe(
    v.number('Region is required'),
    v.integer(),
    v.minValue(1, 'Region is required')
  ),
});

export type GeneralGeomCollectionInput = v.InferOutput<
  typeof GeneralGeomCollectionInputSchema
>;

// ── Per-feature properties (after mapping) ───────────────────────────────────

export const MappedFeaturePropsSchema = v.object({
  type: v.pipe(v.string(), v.trim(), v.minLength(1, 'Type is required')),
  subtype: v.nullable(v.string()),
  visibility: VisibilitySchema,
  label: v.pipe(v.string(), v.trim(), v.minLength(1, 'Label is required')),
  description: v.nullable(v.string()),
});

export type MappedFeatureProps = v.InferOutput<typeof MappedFeaturePropsSchema>;

// ── Mapper config schema ─────────────────────────────────────────────────────

export const GeneralGeomFeatureImportMapperSchema = v.object({
  type: v.object({
    field: v.string(),
    fallback: v.string(),
  }),
  subtype: v.object({
    field: v.string(),
    fallback: v.string(),
  }),
  visibility: v.object({
    field: v.string(),
    fallback: VisibilitySchema,
  }),
  description: v.object({
    field: v.string(),
    fallback: v.string(),
    include_props_json: v.boolean(),
  }),
  label: v.object({
    field: v.string(),
    fallback: v.string(),
    auto_increment_suffix: v.string(),
  }),
});
