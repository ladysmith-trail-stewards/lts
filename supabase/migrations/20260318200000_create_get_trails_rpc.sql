-- get_trails() RPC
--
-- Returns all trails visible to the calling user (RLS is enforced via
-- security invoker) with the geometry column serialised as a GeoJSON
-- string so callers don't need a PostGIS client to consume it.
--
-- Usage:
--   supabase.rpc('get_trails')
--   supabase.rpc('get_trails', { hidden: true })   -- include hidden trails

create or replace function public.get_trails(
  hidden boolean default false   -- when true, also return hidden trails
)
returns table (
  id             bigint,
  name           text,
  type           text,
  trail_class    text,
  activity_types text[],
  direction      text,
  hidden         boolean,
  planned        boolean,
  connector      boolean,
  bike           boolean,
  tf_popularity  numeric,
  restriction    text,
  geometry       json
)
language sql
security invoker   -- runs as the calling user so RLS is enforced
stable
as $$
  select
    t.id,
    t.name,
    t.type,
    t.trail_class,
    t.activity_types,
    t.direction,
    t.hidden,
    t.planned,
    t.connector,
    t.bike,
    t.tf_popularity,
    t.restriction,
    ST_AsGeoJSON(t.geometry)::json as geometry
  from public.trails t
  where
    -- always filter hidden trails unless the caller asks for them
    (get_trails.hidden or not t.hidden)
  order by t.id;
$$;

-- Allow anon + authenticated to call the function
grant execute on function public.get_trails(boolean) to anon, authenticated;
