---
id: C-003
type: chore
epic: user-account
status: planned
created: 2026-03-26
updated: 2026-03-26
---

# Extract Profiles DB Service from UserProfileDialog

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

`UserProfileDialog.tsx` calls `supabase` directly for two DB operations — fetching the current user's profile and updating it. This pattern bypasses the established `src/lib/db_services/` layer used by the rest of the app (e.g., `trails`), making the queries harder to test in isolation, impossible to mock cleanly in unit tests, and inconsistent with the project's service architecture.

## Solution

Create a `src/lib/db_services/profiles/` service module mirroring the existing `trails` service structure:

- `getProfileDb.ts` — fetches a single profile row (`name`, `bio`) by `auth_user_id`. Accepts a `SupabaseClient` parameter and returns `{ data, error }`.
- `updateProfileDb.ts` — updates `name` and `bio` for a row identified by `auth_user_id`. Accepts a `SupabaseClient` parameter and returns `{ error }`.

Update `UserProfileDialog.tsx` to import and call these service functions instead of calling `supabase` directly.

**In scope:**

- `src/lib/db_services/profiles/getProfileDb.ts` — new file
- `src/lib/db_services/profiles/updateProfileDb.ts` — new file
- `src/components/UserProfileDialog.tsx` — replace inline `supabase.from('profiles')` calls with service imports

**Out of scope:**

- Adding integration tests for the new service functions (tracked separately).
- Moving `supabase.auth.signOut()` — auth calls are not DB service calls.
- Any changes to RLS policies or DB schema.

## Testing

- Run `pnpm build` — TypeScript must compile without errors after the refactor.
- Run `pnpm lint` — ESLint must pass.
- Manually open the User Profile Dialog: confirm name and bio still pre-fill on open, saving still updates values and shows success toast, errors still surface as toast notifications.

## Notes

- Follow the pattern in `src/lib/db_services/trails/getTrailsDb.ts`: accept `SupabaseClient` typed as `SupabaseClient<Database>`, return the raw Supabase response object.
- `UserProfileDialog.tsx` should pass the imported `supabase` client from `@/lib/supabase/client` to the service functions.
- The `profiles` table columns are defined in `src/lib/supabase/database.types.ts` — use those types; do not redefine them manually.

## Related Issues

| Issue | Description | Status |
| ----- | ----------- | ------ |

## Related PRs

| PR  | Description                                          | Status |
| --- | ---------------------------------------------------- | ------ |
| #51 | feat(#48): User Profile Dialog (original feature PR) | Open   |

## Changelog

| Date       | Description  | Author  | Driver                                                          | Why | Stage |
| ---------- | ------------ | ------- | --------------------------------------------------------------- | --- | ----- |
| 2026-03-26 | Spec created | copilot | Feedback on PR #51 to move DB calls out of the dialog component |
