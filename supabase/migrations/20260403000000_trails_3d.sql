alter table public.trails
  add column if not exists geom_updated_at timestamptz not null default now();

comment on column public.trails.geom_updated_at is
  'Timestamp of the last geometry change. Maintained by trails_set_geom_updated_at trigger. '
  'Compared against trail_elevations.updated_at to detect stale elevation profiles.';

update public.trails
  set geom_updated_at = updated_at;

create or replace function public.set_geom_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Cast to bytea for comparison: PostGIS registers multiple = operators for
  -- the geometry type and IS DISTINCT FROM cannot resolve the ambiguity.
  if new.geometry::bytea is distinct from old.geometry::bytea then
    new.geom_updated_at = now();
  end if;
  return new;
end;
$$;

comment on function public.set_geom_updated_at() is
  'BEFORE UPDATE trigger that bumps geom_updated_at whenever the geometry column changes.';

create trigger trails_set_geom_updated_at
  before update on public.trails
  for each row execute function public.set_geom_updated_at();

create table public.trail_elevations (
  trail_id          bigint primary key references public.trails (id) on delete cascade,
  geometry_3d       geometry(LineStringZ, 4326),
  elevation_profile jsonb  not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);

comment on table public.trail_elevations is
  '1-to-1 extension of trails. Stores the 3D LineString and the distance/elevation profile '
  'computed by the Python elevation app. updated_at is compared with trails.geom_updated_at '
  'to detect profiles that are out of date.';

comment on column public.trail_elevations.geometry_3d is
  '3D LineString (Z = elevation in metres) in WGS84 (EPSG:4326). '
  'Densified to roughly one vertex every 5 m by the elevation app.';

comment on column public.trail_elevations.elevation_profile is
  'Ordered array of {distance_m, elevation_m} objects representing the elevation chart. '
  'distance_m is the cumulative great-circle distance along the trail in metres.';

comment on column public.trail_elevations.updated_at is
  'When the elevation data was last computed. Compared with trails.geom_updated_at to '
  'detect profiles that need a refresh (threshold: 30 seconds).';

create index trail_elevations_geometry_3d_idx on public.trail_elevations using gist (geometry_3d);

alter table public.trail_elevations enable row level security;

create policy "trail_elevations: select"
  on public.trail_elevations for select
  using (true);

grant select on public.trail_elevations to anon, authenticated;
grant all    on public.trail_elevations to service_role;

create or replace function public.get_utm_epsg(geom geometry)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when public.st_y(public.st_centroid(geom)) >= 0
      then (32600 + floor((public.st_x(public.st_centroid(geom)) + 180) / 6) + 1)::integer
    else
          (32700 + floor((public.st_x(public.st_centroid(geom)) + 180) / 6) + 1)::integer
  end;
$$;

comment on function public.get_utm_epsg(geometry) is
  'Returns the WGS84 UTM EPSG code (326xx N / 327xx S) for the given geometry, '
  'based on its centroid. Used to reproject trail geometries to a metric CRS '
  'before Python-side densification.';

create or replace function public.get_trails_utm(trail_ids integer[])
returns table (
  id       integer,
  geometry geometry(LineString)
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id::integer,
    public.st_transform(
      t.geometry,
      public.get_utm_epsg(t.geometry)
    ) as geometry
  from public.trails t
  where t.id = any(trail_ids)
    and t.deleted_at is null;
$$;

comment on function public.get_trails_utm(integer[]) is
  'Returns active trails (by ID array) reprojected to their local UTM zone via '
  'get_utm_epsg(). Used by the Python elevation pipeline to obtain metric '
  'coordinates for densification without requiring GDAL reprojection in Python.';
