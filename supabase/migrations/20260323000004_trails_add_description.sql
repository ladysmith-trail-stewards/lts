-- Add description column to trails
alter table public.trails
  add column if not exists description text;

comment on column public.trails.description is 'Optional human-readable description of the trail segment';

-- Update get_trails RPC to return description
drop function if exists public.get_trails(boolean);
create or replace function public.get_trails(hidden boolean default false)
returns table (
  id             bigint,
  name           text,
  description    text,
  type           text,
  trail_class    text,
  activity_types text[],
  direction      text,
  hidden         boolean,
  planned        boolean,
  connector      boolean,
  bike           boolean,
  tf_popularity  numeric,
  visibility     text,
  region_id      bigint,
  geometry       json
)
language sql
security invoker
stable
as $$
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
    st_asgeojson(t.geometry)::json as geometry
  from public.trails t
  where ($1 = true or t.hidden = false);
$$;

-- Update upsert_trails RPC to handle description
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
      nullif(trim((f.feat -> 'properties' ->> 'id')::text), '')::bigint       as trail_id,
      f.feat -> 'properties'                                                   as props,
      ST_SetSRID(ST_GeomFromGeoJSON((f.feat -> 'geometry')::text), 4326)      as geom
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
      geometry       = p.geom
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
