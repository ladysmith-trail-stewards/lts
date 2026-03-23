create or replace function public.upsert_trails(features jsonb)
returns table (
  ok      boolean,
  id      bigint,
  message text
)
language sql
security invoker
as $$
  -- Unpack the JSON array once into a typed CTE
  with parsed as (
    select
      nullif(trim((f.feat -> 'properties' ->> 'id')::text), '')::bigint       as trail_id,
      f.feat -> 'properties'                                                   as props,
      ST_SetSRID(ST_GeomFromGeoJSON((f.feat -> 'geometry')::text), 4326)      as geom
    from jsonb_array_elements(features) as f(feat)
  ),

  -- UPDATE existing trails (trail_id is not null)
  updated as (
    update public.trails t
    set
      name           = coalesce(p.props ->> 'name',                    t.name),
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

  -- INSERT new trails (trail_id is null)
  inserted as (
    insert into public.trails (
      name, type, trail_class, activity_types, direction,
      hidden, planned, connector, bike, tf_popularity,
      visibility, region_id, geometry
    )
    select
      p.props ->> 'name',
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

