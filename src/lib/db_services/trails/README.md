# trails db_services

CRUD wrappers for the `public.trails` table. See [`../README.md`](../README.md) for general layer conventions and role definitions.

## Files

| File                | Description                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `getTrailsDb.ts`    | SELECT from `trails_view` — returns rows with GeoJSON geometry and computed `distance_m` |
| `upsertTrailsDb.ts` | UPSERT (insert/update) via `upsert_trails()` RPC                                         |
| `deleteTrailsDb.ts` | DELETE by id                                                                             |
| `testHelpers.ts`    | Trail fixtures (`fixtureCreateTrail`, `fixtureDeleteTrails`, `SAMPLE_GEOMETRY`)          |

## RLS

Full policy definitions: [`supabase/migrations/20260318050136_initial_schema.sql`](/supabase/migrations/20260318050136_initial_schema.sql).

The view `trails_view` is defined with `security_invoker = true`, so the underlying RLS policies on `public.trails` are always enforced.

### SELECT (`trails_view` — security invoker)

| Caller                                  | Sees                         |
| --------------------------------------- | ---------------------------- |
| anon                                    | `visibility = 'public'` only |
| user / admin / super_user / super_admin | all trails                   |
| service_role                            | all trails (bypasses RLS)    |

`hidden=true` trails are excluded by default; pass `{ hidden: true }` to include them.

### Computed columns

| Column             | Type     | Description                                       |
| ------------------ | -------- | ------------------------------------------------- |
| `distance_m`       | `number` | Spheroidal length of the trail geometry in metres |
| `geometry_geojson` | `Json`   | GeoJSON representation of the PostGIS LineString  |

### INSERT / UPDATE

| Caller             | Allowed            |
| ------------------ | ------------------ |
| anon / user        | ✗ denied           |
| admin / super_user | own region only    |
| super_admin        | any region         |
| service_role       | any (bypasses RLS) |

### DELETE

| Caller             | Allowed            |
| ------------------ | ------------------ |
| anon / user        | ✗ denied¹          |
| admin / super_user | own region only    |
| super_admin        | any trail          |
| service_role       | any (bypasses RLS) |

¹ PostgREST returns 204 with 0 rows deleted — not an HTTP error. Tests assert the row still exists.
