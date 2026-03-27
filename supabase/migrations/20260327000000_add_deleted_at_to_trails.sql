-- ============================================================
-- Add soft-delete support to trails
--
-- Changes:
--   1. Add deleted_at timestamptz column to trails
--   2. Update trails_view to exclude soft-deleted rows
--   3. Update upsert_trails RPC to treat id <= 0 as INSERT
--      (supports sentinel id = -1 from the Draw Trail frontend)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add deleted_at column
-- ------------------------------------------------------------
alter table public.trails
  add column if not exists deleted_at timestamptz default null;

comment on column public.trails.deleted_at is
  'Soft-delete timestamp. Non-null rows are excluded from trails_view and treated as deleted.';

-- ------------------------------------------------------------
-- 2. Recreate trails_view to filter soft-deleted rows
--    Must drop first because we're adding the deleted_at column
--    (CREATE OR REPLACE VIEW does not allow new columns between
--    existing ones).
-- ------------------------------------------------------------
drop view if exists public.trails_view;

create view public.trails_view
  with (security_invoker = true)
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
  t.deleted_at,
  round(
    st_length(t.geometry::geography)::numeric,
    2
  )                                                    as distance_m,
  st_asgeojson(t.geometry)::json                       as geometry_geojson
from public.trails t
where t.deleted_at is null;

comment on view public.trails_view is
  'RLS-protected view of trails with computed distance_m (metres) and geometry_geojson fields. Excludes soft-deleted rows.';

grant select on public.trails_view to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Update upsert_trails RPC
--    Treat id <= 0 (e.g. sentinel id = -1) the same as no id
--    to trigger an INSERT rather than a no-op UPDATE.
--
--    The Draw Trail frontend assigns a temporary sentinel id of -1
--    to unsaved trails. Sending id = -1 must produce an INSERT and
--    return the real server-assigned id so the frontend can replace
--    the sentinel.
-- ------------------------------------------------------------
create or replace function public.upsert_trails(features jsonb)
returns table (
  ok      boolean,
  id      bigint,
  message text
)
language sql
security invoker
as $$
  with parsed as (
    select
      -- Treat missing, blank, or non-positive ids as null → INSERT path
      case
        when nullif(trim((f.feat -> 'properties' ->> 'id')::text), '') is null then null
        when (f.feat -> 'properties' ->> 'id')::bigint <= 0               then null
        else (f.feat -> 'properties' ->> 'id')::bigint
      end                                                                        as trail_id,
      f.feat -> 'properties'                                                     as props,
      ST_SetSRID(ST_GeomFromGeoJSON((f.feat -> 'geometry')::text), 4326)        as geom
    from jsonb_array_elements(features) as f(feat)
  ),

  updated as (
    update public.trails t
    set
      name           = coalesce(p.props ->> 'name',                    t.name),
      description    = case when p.props ? 'description'
                         then p.props ->> 'description'
                         else t.description
                       end,
      type           = coalesce(p.props ->> 'type',                    t.type),
      trail_class    = coalesce(p.props ->> 'trail_class',             t.trail_class),
      activity_types = case when p.props ? 'activity_types'
                         then array(select jsonb_array_elements_text(p.props -> 'activity_types'))
                         else t.activity_types
                       end,
      direction      = coalesce(p.props ->> 'direction',               t.direction),
      hidden         = coalesce((p.props ->> 'hidden')::boolean,       t.hidden),
      planned        = coalesce((p.props ->> 'planned')::boolean,      t.planned),
      connector      = coalesce((p.props ->> 'connector')::boolean,    t.connector),
      bike           = coalesce((p.props ->> 'bike')::boolean,         t.bike),
      tf_popularity  = coalesce((p.props ->> 'tf_popularity')::numeric,t.tf_popularity),
      visibility     = coalesce(p.props ->> 'visibility',              t.visibility),
      region_id      = coalesce((p.props ->> 'region_id')::bigint,     t.region_id),
      geometry       = p.geom,
      updated_at     = now()
    from parsed p
    where p.trail_id is not null
      and t.id = p.trail_id
    returning t.id
  ),

  inserted as (
    insert into public.trails (
      name, description, type, trail_class, activity_types, direction,
      hidden, planned, connector, bike, tf_popularity,
      visibility, region_id, geometry
    )
    select
      p.props ->> 'name',
      p.props ->> 'description',
      coalesce(p.props ->> 'type', 'trail'),
      p.props ->> 'trail_class',
      case when p.props ? 'activity_types'
           then array(select jsonb_array_elements_text(p.props -> 'activity_types'))
      end,
      p.props ->> 'direction',
      coalesce((p.props ->> 'hidden')::boolean,    false),
      coalesce((p.props ->> 'planned')::boolean,   false),
      coalesce((p.props ->> 'connector')::boolean, false),
      coalesce((p.props ->> 'bike')::boolean,      false),
      (p.props ->> 'tf_popularity')::numeric,
      coalesce(p.props ->> 'visibility', 'public'),
      (p.props ->> 'region_id')::bigint,
      p.geom
    from parsed p
    where p.trail_id is null
    returning trails.id
  )

  select true, id, null::text from updated
  union all
  select true, id, null::text from inserted;
$$;

revoke execute on function public.upsert_trails(jsonb) from public;
grant  execute on function public.upsert_trails(jsonb) to authenticated;
