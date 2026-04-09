-- Replace geometry_3d (LineStringZ) + elevation_profile (jsonb) with two 4-D
-- geometry columns:
--   geom4d     — HRDEM + Copernicus GLO-30 fallback; full sampling resolution.
--   geom4d_ld  — Copernicus GLO-30 only; downsampled for lighter payloads.
-- Z = elevation in metres; M = cumulative great-circle distance in metres.

alter table public.trail_elevations
  drop column if exists geometry_3d,
  drop column if exists elevation_profile,
  add  column geom4d              geometry(LineStringZM, 4326),
  add  column geom4d_ld           geometry(LineStringZM, 4326),
  add  column sample_interval_m   real not null default 5.0,
  add  column sample_interval_ld_m real not null default 10.0;

drop index if exists trail_elevations_geometry_3d_idx;

create index trail_elevations_geom4d_idx
  on public.trail_elevations using gist (geom4d);

create index trail_elevations_geom4d_ld_idx
  on public.trail_elevations using gist (geom4d_ld);

comment on column public.trail_elevations.geom4d is
  '4-D LineString (Z = elevation m, M = cumulative distance m) in WGS84 (EPSG:4326). '
  'HRDEM LiDAR where available, Copernicus GLO-30 as fallback. Full sampling resolution.';

comment on column public.trail_elevations.geom4d_ld is
  '4-D LineString (Z = elevation m, M = cumulative distance m) in WGS84 (EPSG:4326). '
  'Copernicus GLO-30 only, downsampled. Useful for lightweight clients and overview rendering.';

comment on column public.trail_elevations.sample_interval_m is
  'Vertex spacing (metres) used when densifying the trail before sampling the DEM for geom4d.';

comment on column public.trail_elevations.sample_interval_ld_m is
  'Vertex spacing (metres) used when downsampling the Copernicus-only geometry into geom4d_ld.';

