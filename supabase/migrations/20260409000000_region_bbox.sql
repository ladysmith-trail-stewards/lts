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
