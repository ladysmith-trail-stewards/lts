-- ============================================================
-- Replace get_trails RPC with an RLS-protected view: trails_view
--
-- Advantages over the RPC approach:
--   • Standard SQL view — queryable with .from(), .select(), .eq(), etc.
--   • Filterable and paginatable client-side without RPC args.
--   • RLS is enforced automatically (security_invoker = true on the view).
--   • Computed columns (distance_m, geometry_geojson) live in one place.
--
-- Columns added vs the base table:
--   distance_m         — length of the trail in metres (spheroidal)
--   geometry_geojson   — geometry serialised as a GeoJSON object (json)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the old RPC (both signatures that have existed)
-- ------------------------------------------------------------
drop function if exists public.get_trails(boolean);
drop function if exists public.get_trails(boolean, bigint[]);

-- ------------------------------------------------------------
-- 2. Create the view
-- ------------------------------------------------------------
create or replace view public.trails_view
  with (security_invoker = true)   -- RLS on the underlying trails table is respected
as
select
  t.id,
  t.name,
  t.description,
  t.type,
  t.trail_class,
  t.activity_types,
  t.direction,
  t.hidden,
  t.planned,
  t.connector,
  t.bike,
  t.tf_popularity,
  t.visibility,
  t.region_id,
  t.created_at,
  t.updated_at,
  -- Distance in metres using the spheroidal (accurate) geography calculation
  round(
    st_length(t.geometry::geography)::numeric,
    2
  )                                                    as distance_m,
  -- GeoJSON representation of the geometry
  st_asgeojson(t.geometry)::json                       as geometry_geojson
from public.trails t;

comment on view public.trails_view is
  'RLS-protected view of trails with computed distance_m (metres) and geometry_geojson fields.';

-- ------------------------------------------------------------
-- 3. Grants  (mirrors what the base table already grants)
-- ------------------------------------------------------------
grant select on public.trails_view to anon, authenticated;
