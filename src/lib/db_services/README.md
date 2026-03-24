# db_services

Typed wrappers around Supabase table/RPC operations. Each function accepts a `SupabaseClient<Database>` and returns `{ data, error }` — no exceptions are thrown.

## Structure

```
db_services/
  supabaseTestClients.ts   # shared test clients + seed credentials
  trails/                  # trails CRUD
```

Each domain folder follows the same convention:

| File pattern                             | Purpose                                    |
| ---------------------------------------- | ------------------------------------------ |
| `<action><Domain>Db.ts`                  | single operation (e.g. `createTrailDb.ts`) |
| `<action><Domain>Db.integration.test.ts` | integration tests for that operation       |
| `testHelpers.ts`                         | domain-specific fixtures                   |
| `README.md`                              | domain-level notes                         |

## RLS

RLS is enforced server-side by Postgres — these wrappers do not add their own access checks. The caller's Supabase client determines the effective role.

Full policy definitions: [`supabase/migrations/20260318050136_initial_schema.sql`](/supabase/migrations/20260318050136_initial_schema.sql).

A live snapshot of active policies (generated after each `pnpm db:reset`) is kept at [`supabase/POLICIES.md`](/supabase/POLICIES.md).

### Roles

| Role           | Description                                          |
| -------------- | ---------------------------------------------------- |
| `anon`         | Unauthenticated                                      |
| `user`         | Authenticated, standard access                       |
| `super_user`   | Authenticated, elevated read/write within own region |
| `admin`        | Authenticated, manages own region                    |
| `super_admin`  | Authenticated, manages all regions                   |
| `service_role` | Bypasses RLS entirely — fixture setup/teardown only  |

### Access matrix

> ✅ = always &nbsp;·&nbsp; 📍 = own region only &nbsp;·&nbsp; 👤 = own record only &nbsp;·&nbsp; — = no access
>
> `service_role` bypasses RLS entirely and is excluded from this matrix.

#### `profiles`

| Role        | SELECT | INSERT | UPDATE | DELETE |
| ----------- | :----: | :----: | :----: | :----: |
| Anon        |   —    |   —    |   —    |   —    |
| User        |   👤   |   —    |   👤   |   —    |
| Super User  |   👤   |   —    |   👤   |   —    |
| Admin       |   📍   |   📍   |   📍   |   📍   |
| Super Admin |   ✅   |   ✅   |   ✅   |   ✅   |

#### `regions`

| Role        | SELECT | INSERT | UPDATE | DELETE |
| ----------- | :----: | :----: | :----: | :----: |
| Anon        |   ✅   |   —    |   —    |   —    |
| User        |   ✅   |   —    |   —    |   —    |
| Super User  |   ✅   |   —    |   —    |   —    |
| Admin       |   ✅   |   —    |   —    |   —    |
| Super Admin |   ✅   |   ✅   |   ✅   |   ✅   |

#### `trails`

| Role        | SELECT | INSERT | UPDATE | DELETE |
| ----------- | :----: | :----: | :----: | :----: |
| Anon        |   —    |   —    |   —    |   —    |
| User        |   ✅   |   —    |   —    |   —    |
| Super User  |   ✅   |   📍   |   📍   |   📍   |
| Admin       |   ✅   |   📍   |   📍   |   📍   |
| Super Admin |   ✅   |   ✅   |   ✅   |   ✅   |

> The above is a snapshot — always refer to [`supabase/POLICIES.md`](/supabase/POLICIES.md) for the authoritative live view after schema changes.

### Testing against all roles

Every integration test file **must cover all five callers** — `anon`, `user`, `super_user`, `admin`, and `super_admin`. Denied callers should assert the row is unchanged; permitted callers should assert the operation succeeded. Use `serviceClient` for fixture setup/teardown only (it bypasses RLS).

Seed credentials are exported from `supabaseTestClients.ts`:

```ts
SEED_USER; // role: user
SEED_SUPER_USER; // role: super_user
SEED_ADMIN; // role: admin
SEED_SUPER_ADMIN; // role: super_admin
```

`serviceClient` bypasses RLS and is used for fixture setup/teardown only.

## Schema shapes

> Auto-generated from the local Supabase instance. Always regenerate with `pnpm db:types` after schema changes.
> Canonical source: [`src/lib/supabase/database.types.ts`](/src/lib/supabase/database.types.ts)

### `profiles`

| Column         | Type                   | Nullable | Notes                                              |
| -------------- | ---------------------- | :------: | -------------------------------------------------- |
| `id`           | `number`               |          | PK, identity                                       |
| `auth_user_id` | `string` (UUID)        |          | FK → `auth.users`, CASCADE delete                  |
| `name`         | `string`               |          | unique                                             |
| `role`         | `app_role`             |          | `user` \| `super_user` \| `admin` \| `super_admin` |
| `region_id`    | `number`               |          | FK → `regions.id`                                  |
| `phone`        | `string`               |    ✓     |                                                    |
| `bio`          | `string`               |    ✓     |                                                    |
| `created_at`   | `string` (timestamptz) |          |                                                    |

### `regions`

| Column | Type     | Nullable | Notes        |
| ------ | -------- | :------: | ------------ |
| `id`   | `number` |          | PK, identity |
| `name` | `string` |          | unique       |

### `trails`

| Column           | Type                   | Nullable | Notes                                                                        |
| ---------------- | ---------------------- | :------: | ---------------------------------------------------------------------------- |
| `id`             | `number`               |          | PK, identity                                                                 |
| `name`           | `string`               |          |                                                                              |
| `type`           | `string`               |          | surface/type classification                                                  |
| `trail_class`    | `string`               |    ✓     | difficulty TC1–TC5                                                           |
| `activity_types` | `string[]`             |    ✓     | e.g. hiking, mtb                                                             |
| `direction`      | `string`               |    ✓     | `both` \| `oneway` \| `oneway-reverse`                                       |
| `hidden`         | `boolean`              |          | default `false`                                                              |
| `planned`        | `boolean`              |          | default `false`                                                              |
| `connector`      | `boolean`              |          | default `false`                                                              |
| `bike`           | `boolean`              |          | default `false`                                                              |
| `tf_popularity`  | `number`               |    ✓     | Trailforks score                                                             |
| `visibility`     | `string`               |          | `public` \| `private` \| `shared`                                            |
| `region_id`      | `number`               |          | FK → `regions.id`                                                            |
| `geometry`       | `unknown`              |          | PostGIS `LineString` (EPSG:4326); returned as GeoJSON via `get_trails()` RPC |
| `created_at`     | `string` (timestamptz) |          |                                                                              |
| `updated_at`     | `string` (timestamptz) |          | auto-set by trigger                                                          |

> **TODO:** Input validation (shape, required fields, business rules) should be added at this layer before the Supabase call, so it is enforced regardless of which client is used. Consider `zod` schemas co-located with each `*Db.ts` file.

## Adding a new domain

1. Create a folder `db_services/<domain>/`
2. Add `<action><Domain>Db.ts` files following the existing pattern
3. Add `testHelpers.ts` for fixtures, importing shared clients from `../supabaseTestClients`
4. Write integration tests covering all five callers (`anon`, `user`, `super_user`, `admin`, `super_admin`)
5. Add a `README.md` with domain-specific notes
