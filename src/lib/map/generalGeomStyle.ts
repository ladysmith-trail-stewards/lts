import * as v from 'valibot';
import type { ExpressionSpecification } from 'mapbox-gl';

// ── Schema ─────────────────────────────────────────────────────────────────────

/**
 * A paint-property value can be:
 *  - { mode: 'constant', value: … }        → literal colour / number
 *  - { mode: 'TYPE',    map: {k→v, …} }    → Mapbox `match` on the feature `type` field
 *  - { mode: 'SUBTYPE', map: {k→v, …} }    → Mapbox `match` on the feature `subtype` field
 */
const StyleValueMapSchema = v.optional(
  v.record(v.string(), v.union([v.string(), v.number()])),
  {}
);

export const StyleValueSchema = v.union([
  v.object({
    mode: v.literal('constant'),
    value: v.union([v.string(), v.number()]),
  }),
  v.object({ mode: v.literal('TYPE'), map: StyleValueMapSchema }),
  v.object({ mode: v.literal('SUBTYPE'), map: StyleValueMapSchema }),
]);
export type StyleValue = v.InferOutput<typeof StyleValueSchema>;

export const LineStyleSchema = v.optional(
  v.object({
    color: v.optional(StyleValueSchema),
    width: v.optional(StyleValueSchema),
    opacity: v.optional(StyleValueSchema),
  })
);
export type LineStyle = v.InferOutput<typeof LineStyleSchema>;

export const PolygonStyleSchema = v.optional(
  v.object({
    fillColor: v.optional(StyleValueSchema),
    fillOpacity: v.optional(StyleValueSchema),
    outlineColor: v.optional(StyleValueSchema),
  })
);
export type PolygonStyle = v.InferOutput<typeof PolygonStyleSchema>;

export const PointStyleSchema = v.optional(
  v.object({
    color: v.optional(StyleValueSchema),
  })
);
export type PointStyle = v.InferOutput<typeof PointStyleSchema>;

export const CollectionStyleSchema = v.object({
  line: LineStyleSchema,
  polygon: PolygonStyleSchema,
  point: PointStyleSchema,
});
export type CollectionStyle = v.InferOutput<typeof CollectionStyleSchema>;

/** Parse raw JSON from DB; returns empty object on failure. */
export function parseCollectionStyle(raw: unknown): CollectionStyle {
  const result = v.safeParse(CollectionStyleSchema, raw);
  if (result.success) return result.output;
  return {};
}

// ── Mapbox expression builders ────────────────────────────────────────────────
// We keep these as plain arrays so they're serialisable / comparable.

type Expr = ExpressionSpecification | string | number;

function toValue(sv: StyleValue | undefined, def: string | number): Expr {
  if (!sv) return def;
  if (sv.mode === 'constant') return sv.value;
  // TYPE / SUBTYPE → Mapbox match expression keyed on the feature field
  const field = sv.mode === 'TYPE' ? 'type' : 'subtype';
  const entries = Object.entries(sv.map ?? {});
  if (entries.length === 0) return def;
  const args: unknown[] = ['match', ['get', field]];
  for (const [k, v] of entries) args.push(k, v);
  args.push(def);
  return args as unknown as ExpressionSpecification;
}

/**
 * Build a Mapbox `case` expression that maps each collection_id
 * to the resolved style value for that collection, with `def` as fallback.
 */
function buildCaseExpr(
  entries: [number, StyleValue | undefined][],
  def: string | number
): Expr {
  const cases: Expr[] = ['case'];
  for (const [id, sv] of entries) {
    if (!sv) continue;
    cases.push(['==', ['get', 'collection_id'], id]);
    cases.push(toValue(sv, def));
  }
  if (cases.length === 1) return def; // no entries → constant default
  cases.push(def);
  return cases as unknown as ExpressionSpecification;
}

export type StyleMap = Map<number, CollectionStyle>;

// Defaults that mirror the original hard-coded layer configs
export const DEFAULTS = {
  line: { color: '#1d4ed8', width: 2.5, opacity: 0.9 },
  polygon: { fillColor: '#16a34a', fillOpacity: 0.25, outlineColor: '#15803d' },
  point: { color: '#2563eb' },
} as const;

// Line
export const buildLineColor = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.line?.color]),
    DEFAULTS.line.color
  );
export const buildLineWidth = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.line?.width]),
    DEFAULTS.line.width
  );
export const buildLineOpacity = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.line?.opacity]),
    DEFAULTS.line.opacity
  );

// Polygon
export const buildPolygonFillColor = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.polygon?.fillColor]),
    DEFAULTS.polygon.fillColor
  );
export const buildPolygonFillOpacity = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.polygon?.fillOpacity]),
    DEFAULTS.polygon.fillOpacity
  );
export const buildPolygonOutlineColor = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.polygon?.outlineColor]),
    DEFAULTS.polygon.outlineColor
  );

// Point
export const buildPointColor = (m: StyleMap): Expr =>
  buildCaseExpr(
    [...m].map(([id, s]) => [id, s.point?.color]),
    DEFAULTS.point.color
  );
