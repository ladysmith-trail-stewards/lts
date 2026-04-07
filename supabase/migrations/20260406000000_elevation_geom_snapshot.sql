alter table public.trail_elevations
  add column if not exists geom_snapshot_at timestamptz;

comment on column public.trail_elevations.geom_snapshot_at is
  'Snapshot of trails.geom_updated_at at the time the elevation profile was last computed. '
  'The Python elevation app compares this against the current trails.geom_updated_at to '
  'determine whether a profile is stale and needs reprocessing.';
