-- Update get_trails to support optional id filtering via an array of ids.
-- Passing ids = NULL (default) returns all trails (existing behaviour).
-- Passing ids = '{1,2,3}' returns only those trails.
-- Drop the old single-argument overload so only one signature exists.
drop function if exists public.get_trails(boolean);

create or replace function public.get_trails(
  hidden boolean   default false,
  ids    bigint[]  default null
)
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
  where ($1 = true or t.hidden = false)
    and ($2 is null or t.id = any($2));
$$;
