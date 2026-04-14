-- Extend trails_view with elevation_coords and elevation_stale columns.
--
-- Must DROP and recreate (not CREATE OR REPLACE) because PostgreSQL does not
-- allow inserting, reordering, or renaming existing view columns — only
-- appending. DROP gives us a clean column list.
--
-- trail_elevations is joined as an inline subquery (not a CTE) because
-- PostgreSQL does not support WITH ... AS (...) in CREATE VIEW bodies in
-- all versions.
--
-- elevation_stale — true when the elevation profile is missing or outdated:
--                   no row, geom4d is null, or trail geometry changed after
--                   the elevation was last computed.
-- elevation_coords — float[][] of [lng, lat, elevation_m, distance_m].
--                    NULL when stale so clients need no extra check.

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
  t.geom_updated_at,
  t.deleted_at,
  round(
    st_length(t.geometry::geography)::numeric,
    2
  )                                                      as distance_m,
  st_asgeojson(t.geometry)::json                         as geometry_geojson,

  -- true  → profile missing, geom4d unpopulated, or geometry changed after compute
  -- false → fresh elevation data is available
  (
    e.trail_id is null
    or e.geom4d is null
    or e.elev_updated_at < t.geom_updated_at
  )                                                      as elevation_stale,

  -- Coords only when fresh; NULL otherwise.
  case
    when
      e.trail_id is not null
      and e.geom4d is not null
      and e.elev_updated_at >= t.geom_updated_at
    then (
      select array_agg(
        array[
          st_x(dp.geom),
          st_y(dp.geom),
          st_z(dp.geom),
          st_m(dp.geom)
        ]
        order by dp.path[1]
      )
      from st_dumppoints(e.geom4d) as dp
    )
    else null
  end                                                    as elevation_coords

from public.trails t
left join (
  select
    te.trail_id,
    te.updated_at  as elev_updated_at,
    te.geom4d
  from public.trail_elevations te
) e on e.trail_id = t.id
where t.deleted_at is null;

comment on view public.trails_view is
  'RLS-protected view of trails. '
  'elevation_stale: true when the elevation profile is missing or outdated. '
  'elevation_coords: float[][] of [lng, lat, elevation_m, distance_m] — NULL when stale. '
  'Excludes soft-deleted rows.';

grant select on public.trails_view to anon, authenticated;
