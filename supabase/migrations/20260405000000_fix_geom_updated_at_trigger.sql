-- Fix the set_geom_updated_at trigger function.
--
-- The original implementation used `new.geometry is distinct from old.geometry`
-- which fails with "operator is not unique: public.geometry = public.geometry"
-- because PostGIS registers multiple = operators for the geometry type and
-- PostgreSQL cannot resolve the ambiguity.
--
-- The fix casts both sides to bytea before comparing, which gives a
-- deterministic byte-for-byte comparison of the WKB representation.

create or replace function public.set_geom_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.geometry::bytea is distinct from old.geometry::bytea then
    new.geom_updated_at = now();
  end if;
  return new;
end;
$$;

comment on function public.set_geom_updated_at() is
  'BEFORE UPDATE trigger that bumps geom_updated_at whenever the geometry column changes.';
