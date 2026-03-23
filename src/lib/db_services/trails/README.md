# trails db_services

CRUD wrappers for the `public.trails` table. See [`../README.md`](../README.md) for general layer conventions and role definitions.

## Files

| File               | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `createTrailDb.ts` | INSERT — returns `{ id }` of created row                                        |
| `getTrailsDb.ts`   | SELECT via `get_trails()` RPC — returns rows with GeoJSON geometry              |
| `updateTrailDb.ts` | UPDATE by id — returns `{ id }` of updated row                                  |
| `deleteTrailDb.ts` | DELETE by id                                                                    |
| `testHelpers.ts`   | Trail fixtures (`fixtureCreateTrail`, `fixtureDeleteTrails`, `SAMPLE_GEOMETRY`) |

## RLS

Full policy definitions: [`supabase/migrations/20260318050136_initial_schema.sql`](/supabase/migrations/20260318050136_initial_schema.sql).

### SELECT (`get_trails` RPC — security invoker)

| Caller                                  | Sees                         |
| --------------------------------------- | ---------------------------- |
| anon                                    | `visibility = 'public'` only |
| user / admin / super_user / super_admin | all trails                   |
| service_role                            | all trails (bypasses RLS)    |

`hidden=true` trails are excluded by default; pass `{ hidden: true }` to include them.

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
