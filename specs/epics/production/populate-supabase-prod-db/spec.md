---
id: F-006
type: feature
epic: production
status: planned
created: 2026-03-31
updated: 2026-03-31
---

# Populate Supabase Prod DB

> Epic: [Production](../spec.md) — E-003

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ✅  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

The production database has no trail or region data after migrations are applied. A user visiting the live site would see an empty map. The initial dataset must be entered manually by a steward who knows the local trails.

## Solution

Manually populate the production database with at least one region and the initial set of trails using the Supabase dashboard SQL Editor or Table Editor.

### Data to populate

#### Regions

Insert at least the primary region used by the Ladysmith Trail Stewards:

```sql
INSERT INTO public.regions (id, name)
VALUES (1, 'Ladysmith');
```

> Region `0` ("Default") is created by the migration `20260325000000_auto_create_profile_on_signup.sql` — do not re-insert it.

#### Trails

Use one of:

- **Table Editor** — navigate to **Table Editor → trails** in the Supabase dashboard and insert rows manually.
- **SQL Editor** — paste prepared `INSERT` statements.
- **In-app draw tool** — once the frontend is deployed (F-007), a builder/admin can use the Draw Trail feature (F-001) to create trails directly in the UI. This is the preferred long-term path.

#### Minimum viable dataset

At minimum, populate:

- 1 region (`Ladysmith`)
- A representative set of existing trails with correct geometry (GeoJSON LineString in `geography` column), name, difficulty, and surface type.

### Data source

Trail geometries should be sourced from existing GPS tracks (GPX/KML exports from Gaia GPS, Trailforks, or field-collected data). Convert to GeoJSON using QGIS, geojson.io, or `ogr2ogr` before inserting.

### Column reference (`public.trails`)

| Column       | Type               | Notes                                     |
| ------------ | ------------------ | ----------------------------------------- |
| `name`       | `text`             | Trail name                                |
| `difficulty` | `app_difficulty`   | `green`, `blue`, `black`, `double_black`  |
| `surface`    | `app_surface`      | `dirt`, `gravel`, `paved`, etc.           |
| `region_id`  | `bigint`           | FK → `regions.id` (use `1` for Ladysmith) |
| `geom`       | `geography`        | GeoJSON LineString                        |
| `status`     | `app_trail_status` | `active`, `proposed`, `closed`            |
| `notes`      | `text`             | Optional steward notes                    |

## Out of Scope

- Automated import pipeline (GPX/KML bulk import — deferred to Trail Management epic).
- Populating trails for regions other than Ladysmith on day one.
- User data — no production user rows should be seeded; real users will self-register via Google SSO.

## In Scope

- At least one region row with a real `id` and `name`.
- At least one trail with valid geometry and metadata.
- Verifying the map page renders trails on the live site after data entry.

## Testing

**Manual verification:**

- Navigate to the live map page → at least one trail renders on the map.
- Trail detail drawer opens with correct name, difficulty, and surface.
- Unauthenticated users can view trails (read-only RLS policies allow `anon`).

**Edge cases:**

- A trail inserted with a `region_id` that doesn't exist in `regions` → should fail FK constraint (confirm constraint is active in prod).
- Geometry inserted as plain `text` rather than GeoJSON → confirm `geography` cast works correctly.

## Notes

- Run `pnpm db:types` locally after any schema changes, but no schema changes are needed for this task — data only.
- Coordinate with a steward who has GPS data for accurate geometries. Approximate geometries are acceptable for an initial launch.
- After populating, do a quick sanity-check query in the SQL Editor:
  ```sql
  SELECT id, name, difficulty, st_asgeojson(geom) FROM public.trails LIMIT 5;
  ```

## Related Issues

| Issue                                                            | Description                                    | Status |
| ---------------------------------------------------------------- | ---------------------------------------------- | ------ |
| [#61](https://github.com/ladysmith-trail-stewards/lts/issues/61) | [E-003] Production (parent epic)               | Open   |
| [#63](https://github.com/ladysmith-trail-stewards/lts/issues/63) | [F-006] Populate Supabase Prod DB (this issue) | Open   |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author         | Driver    | Why                                     | Status  |
| ---------- | ------------ | -------------- | --------- | --------------------------------------- | ------- |
| 2026-03-31 | Spec created | KeeganShaw-GIS | blueprint | Derived from issue #61 production tasks | planned |
