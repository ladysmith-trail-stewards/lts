-- Trails should be hard-deleted when their region is hard-deleted.
-- The original FK had no ON DELETE clause (defaults to NO ACTION).
-- Replace it with ON DELETE CASCADE.
--
-- The auto_attach_block_deleted_at event trigger fires on ALTER TABLE and
-- attempts to re-create the block_deleted_at trigger, which already exists.
-- Disable it around the FK swap to avoid the duplicate-trigger error.

alter event trigger auto_attach_block_deleted_at disable;

alter table public.trails
  drop constraint trails_region_id_fkey;

alter table public.trails
  add constraint trails_region_id_fkey
    foreign key (region_id)
    references public.regions (id)
    on delete cascade;

alter event trigger auto_attach_block_deleted_at enable;
