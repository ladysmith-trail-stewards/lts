-- Add an optional bounding box to regions, stored as a PostGIS Polygon.
--
-- Using geometry(Polygon, 4326) rather than four scalar columns lets the DB
-- do spatial containment checks (ST_Contains, ST_Intersects) natively and
-- keeps the schema consistent with the rest of the GIS data.
-- NULL means "no bbox restriction for this region".

alter table public.regions
  add column bbox geometry(Polygon, 4326) default null;

comment on column public.regions.bbox is
  'Optional bounding box for this region as a WGS84 Polygon. '
  'NULL = no geographic restriction. '
  'Use ST_MakeEnvelope(minLng, minLat, maxLng, maxLat, 4326) to construct.';

create index regions_bbox_idx on public.regions using gist (bbox)
  where bbox is not null;

-- View: regions with the bounding box as a JSON array.
--
-- bbox is returned as a native jsonb array [minLng, minLat, maxLng, maxLat]
-- (WGS84 degrees), matching the ST_MakeEnvelope argument order.
-- Supabase/PostgREST serialises jsonb columns directly, so clients receive a
-- real JS array — no client-side parsing required.
-- NULL when no bbox has been set for the region.
create or replace view public.regions_with_bbox as
select
  r.id,
  r.name,
  r.bbox,
  case
    when r.bbox is null then null
    else jsonb_build_array(
      st_xmin(r.bbox::box2d),
      st_ymin(r.bbox::box2d),
      st_xmax(r.bbox::box2d),
      st_ymax(r.bbox::box2d)
    )
  end as bbox_arr
from public.regions r;

comment on view public.regions_with_bbox is
  'Regions with the optional bbox column plus bbox_arr, '
  'a jsonb array [minLng, minLat, maxLng, maxLat] for easy consumption '
  'by clients that do not parse PostGIS geometry directly. '
  'Access is governed by the RLS policies on public.regions.';
