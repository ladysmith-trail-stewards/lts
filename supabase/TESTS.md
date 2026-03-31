# Integration Test Coverage — Permissions

Derived from `POLICIES.md` and `ARCHITECTURE.md`. Each row is a behaviour that needs a test.
`✅` = should be tested | status column to be filled in once tests exist.

---

## `profiles`

| #   | Scenario                                               | Status |
| --- | ------------------------------------------------------ | :----: |
| 1   | `anon` cannot SELECT any profile                       |   ⬜   |
| 2   | `anon` cannot INSERT a profile                         |   ⬜   |
| 3   | `user` can SELECT own profile                          |   ⬜   |
| 4   | `user` cannot SELECT another user's profile            |   ⬜   |
| 5   | `user` can UPDATE own profile (name, phone, bio)       |   ⬜   |
| 6   | `user` cannot UPDATE another user's profile            |   ⬜   |
| 7   | `user` cannot set `deleted_at` directly via UPDATE     |   ⬜   |
| 8   | `user` cannot hard-DELETE any profile                  |   ⬜   |
| 9   | `super_user` same SELECT/UPDATE restrictions as `user` |   ⬜   |
| 10  | `admin` can SELECT profiles in own region              |   ⬜   |
| 11  | `admin` cannot SELECT profiles in a different region   |   ⬜   |
| 12  | `admin` can INSERT a profile in own region             |   ⬜   |
| 13  | `admin` cannot INSERT a profile in a different region  |   ⬜   |
| 14  | `admin` can UPDATE a profile in own region             |   ⬜   |
| 15  | `admin` cannot UPDATE a profile in a different region  |   ⬜   |
| 16  | `admin` cannot hard-DELETE any profile                 |   ⬜   |
| 17  | `super_admin` can SELECT any profile                   |   ⬜   |
| 18  | `super_admin` can INSERT any profile                   |   ⬜   |
| 19  | `super_admin` can UPDATE any profile                   |   ⬜   |
| 20  | `super_admin` can hard-DELETE any profile              |   ⬜   |
| 21  | `pending` cannot SELECT any profile (same as anon)     |   ⬜   |

---

## `regions`

| #   | Scenario                                                             | Status |
| --- | -------------------------------------------------------------------- | :----: |
| 22  | `anon` can SELECT regions                                            |   ⬜   |
| 23  | `anon` cannot INSERT/UPDATE/DELETE a region                          |   ⬜   |
| 24  | `user` / `admin` / `super_user` cannot INSERT/UPDATE/DELETE a region |   ⬜   |
| 25  | `super_admin` can INSERT a region                                    |   ⬜   |
| 26  | `super_admin` can UPDATE a region                                    |   ⬜   |
| 27  | `super_admin` can DELETE a region                                    |   ⬜   |

---

## `trails`

| #   | Scenario                                                 | Status |
| --- | -------------------------------------------------------- | :----: |
| 28  | `anon` can SELECT public trails                          |   ⬜   |
| 29  | `anon` cannot SELECT private/shared trails               |   ⬜   |
| 30  | `anon` cannot SELECT soft-deleted trails                 |   ⬜   |
| 31  | `anon` cannot INSERT/UPDATE/DELETE a trail               |   ⬜   |
| 32  | `user` can SELECT all trails (including private)         |   ⬜   |
| 33  | `user` cannot INSERT a trail                             |   ⬜   |
| 34  | `user` cannot UPDATE a trail                             |   ⬜   |
| 35  | `user` cannot set `deleted_at` directly via UPDATE       |   ⬜   |
| 36  | `super_user` can INSERT a trail in own region            |   ⬜   |
| 37  | `super_user` cannot INSERT a trail in a different region |   ⬜   |
| 38  | `super_user` can UPDATE a trail in own region            |   ⬜   |
| 39  | `super_user` cannot UPDATE a trail in a different region |   ⬜   |
| 40  | `admin` can INSERT a trail in own region                 |   ⬜   |
| 41  | `admin` cannot INSERT a trail in a different region      |   ⬜   |
| 42  | `admin` can UPDATE a trail in own region                 |   ⬜   |
| 43  | `admin` cannot UPDATE a trail in a different region      |   ⬜   |
| 44  | `admin` cannot hard-DELETE a trail                       |   ⬜   |
| 45  | `super_admin` can INSERT a trail in any region           |   ⬜   |
| 46  | `super_admin` can UPDATE any trail                       |   ⬜   |
| 47  | `super_admin` can hard-DELETE any trail                  |   ⬜   |

---

## `soft_delete_trails` RPC

| #   | Scenario                                                      | Status |
| --- | ------------------------------------------------------------- | :----: |
| 48  | `anon` / `pending` cannot call `soft_delete_trails`           |   ⬜   |
| 49  | `user` cannot call `soft_delete_trails`                       |   ⬜   |
| 50  | `super_user` can soft-delete a trail in own region            |   ⬜   |
| 51  | `super_user` cannot soft-delete a trail in a different region |   ⬜   |
| 52  | `admin` can soft-delete a trail in own region                 |   ⬜   |
| 53  | `admin` cannot soft-delete a trail in a different region      |   ⬜   |
| 54  | `super_admin` can soft-delete any trail                       |   ⬜   |
| 55  | Soft-deleted trail is excluded from `trails_view`             |   ⬜   |

---

## `soft_delete_profiles` RPC

| #   | Scenario                                                          | Status |
| --- | ----------------------------------------------------------------- | :----: |
| 56  | `anon` / `pending` cannot call `soft_delete_profiles`             |   ⬜   |
| 57  | `user` can soft-delete own profile                                |   ⬜   |
| 58  | `user` cannot soft-delete another user's profile                  |   ⬜   |
| 59  | `super_user` can soft-delete own profile                          |   ⬜   |
| 60  | `super_user` cannot soft-delete another user's profile            |   ⬜   |
| 61  | `admin` can soft-delete a profile in own region                   |   ⬜   |
| 62  | `admin` can soft-delete own profile                               |   ⬜   |
| 63  | `admin` cannot soft-delete a profile in a different region        |   ⬜   |
| 64  | `super_admin` can soft-delete any profile                         |   ⬜   |
| 65  | Soft-deleted user gets `user_role = 'pending'` on next token mint |   ⬜   |

---

## `upsert_trails` RPC

| #   | Scenario                                                                     | Status |
| --- | ---------------------------------------------------------------------------- | :----: |
| 66  | `anon` cannot call `upsert_trails`                                           |   ⬜   |
| 67  | `user` cannot insert a trail via `upsert_trails` (RLS blocks)                |   ⬜   |
| 68  | `super_user` can insert a trail in own region via `upsert_trails`            |   ⬜   |
| 69  | `super_user` cannot insert a trail in a different region via `upsert_trails` |   ⬜   |
| 70  | `super_user` can update a trail in own region via `upsert_trails`            |   ⬜   |
| 71  | `admin` can insert/update a trail in own region via `upsert_trails`          |   ⬜   |
| 72  | `super_admin` can insert/update a trail in any region via `upsert_trails`    |   ⬜   |

---

## `custom_access_token_hook`

| #   | Scenario                                                    | Status |
| --- | ----------------------------------------------------------- | :----: |
| 73  | Token contains correct `user_role` after login              |   ⬜   |
| 74  | Token contains correct `region_id` after login              |   ⬜   |
| 75  | Token `user_role` = `pending` when no profile row exists    |   ⬜   |
| 76  | Token `user_role` = `pending` after profile is soft-deleted |   ⬜   |
| 77  | `is_admin` = `true` for `admin` and `super_admin`           |   ⬜   |
| 78  | `is_admin` = `false` for `user`, `super_user`, `pending`    |   ⬜   |
| 79  | After role downgrade, new token carries downgraded role     |   ⬜   |
| 80  | After region change, new token carries new `region_id`      |   ⬜   |

---

## `get_admin_users` RPC

| #   | Scenario                                                           |                                       Status                                        |
| --- | ------------------------------------------------------------------ | :---------------------------------------------------------------------------------: |
| 81  | `anon` cannot call `get_admin_users`                               |                                         ⬜                                          |
| 82  | `user` / `super_user` cannot call `get_admin_users`                |                                         ⬜                                          |
| 83  | `admin` can call `get_admin_users` and sees profiles in own region |                                         ⬜                                          |
| 84  | `super_admin` can call `get_admin_users` and sees all profiles     |                                         ⬜                                          |
| 85  | `get_admin_users` does not return soft-deleted profiles            | ⬜ (requires migration fix — `and p.deleted_at is null` added to `get_admin_users`) |

---

## `trails_view`

| #   | Scenario                                                          | Status |
| --- | ----------------------------------------------------------------- | :----: |
| 86  | `anon` sees only public, non-deleted trails via `trails_view`     |   ⬜   |
| 87  | `anon` cannot see private/shared trails via `trails_view`         |   ⬜   |
| 88  | `authenticated` sees all non-deleted trails via `trails_view`     |   ⬜   |
| 89  | Soft-deleted trail does not appear in `trails_view` for any role  |   ⬜   |
| 90  | `trails_view` returns `distance_m` and `geometry_geojson` columns |   ⬜   |
