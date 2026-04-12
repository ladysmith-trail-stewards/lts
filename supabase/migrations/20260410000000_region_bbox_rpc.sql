-- RPC: set_region_bbox
--
-- Sets the bbox column on a region using four scalar WGS84 coordinates so
-- callers don't need to construct a PostGIS geometry literal.
--
-- All four coordinates are required and must form a valid, non-degenerate
-- envelope (min < max for both axes).  Passing NULL or an invalid range
-- raises an exception.
--
-- Arguments:
--   p_region_id  bigint              -- target region
--   p_min_lng    double precision    -- west  longitude (WGS84)
--   p_min_lat    double precision    -- south latitude  (WGS84)
--   p_max_lng    double precision    -- east  longitude (WGS84)
--   p_max_lat    double precision    -- north latitude  (WGS84)
--
-- Access control (SECURITY INVOKER — RLS on public.regions is enforced):
--   admin        → may set a bbox  (regions: admin bbox update policy)
--   super_admin  → may set a bbox  (regions: super_admin update policy)
--   service_role → bypasses RLS, always permitted (fixture/tooling use)

create or replace function public.set_region_bbox(
  p_region_id bigint,
  p_min_lng   double precision,
  p_min_lat   double precision,
  p_max_lng   double precision,
  p_max_lat   double precision
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- All four coordinates are mandatory.
  if p_min_lng is null or p_min_lat is null
     or p_max_lng is null or p_max_lat is null then
    raise exception
      'set_region_bbox: all four coordinates are required (got %, %, %, %)',
      p_min_lng, p_min_lat, p_max_lng, p_max_lat;
  end if;

  -- Envelope must be non-degenerate: min strictly less than max on both axes.
  if p_min_lng >= p_max_lng then
    raise exception
      'set_region_bbox: p_min_lng (%) must be less than p_max_lng (%)',
      p_min_lng, p_max_lng;
  end if;

  if p_min_lat >= p_max_lat then
    raise exception
      'set_region_bbox: p_min_lat (%) must be less than p_max_lat (%)',
      p_min_lat, p_max_lat;
  end if;

  -- WGS84 range checks.
  if p_min_lng < -180 or p_max_lng > 180 then
    raise exception
      'set_region_bbox: longitude values must be in [-180, 180] (got %, %)',
      p_min_lng, p_max_lng;
  end if;

  if p_min_lat < -90 or p_max_lat > 90 then
    raise exception
      'set_region_bbox: latitude values must be in [-90, 90] (got %, %)',
      p_min_lat, p_max_lat;
  end if;

  update public.regions
  set    bbox = st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
  where  id   = p_region_id;

  if not found then
    raise exception 'set_region_bbox: region % not found', p_region_id;
  end if;
end;
$$;

comment on function public.set_region_bbox(bigint, double precision, double precision, double precision, double precision) is
  'Sets the bbox Polygon on a region from four required WGS84 scalar coordinates. '
  'All coordinates must be non-null and form a valid non-degenerate envelope '
  '(min_lng < max_lng, min_lat < max_lat, within WGS84 bounds). '
  'SECURITY INVOKER — RLS on public.regions is enforced: '
  'admin and super_admin may set a bbox.';

-- Revoke from public/anon; grant to authenticated (RLS restricts further)
-- and service_role (bypasses RLS for fixture/tooling use).
revoke execute on function public.set_region_bbox(bigint, double precision, double precision, double precision, double precision)
  from public, anon;

grant execute on function public.set_region_bbox(bigint, double precision, double precision, double precision, double precision)
  to authenticated, service_role;

-- RLS policy: admin may UPDATE the bbox column on any region.
-- (The existing "regions: super_admin update" policy already covers super_admin.)
create policy "regions: admin bbox update"
  on public.regions for update
  using  ((select auth.jwt() ->> 'user_role') in ('admin', 'super_admin'))
  with check ((select auth.jwt() ->> 'user_role') in ('admin', 'super_admin'));
