---
id: C-002
type: chore
epic: null
status: draft
created: 2026-03-25
updated: 2026-03-25
---

# E2E Test Framework with Playwright

## Flags

| Flag | |
|------|-|
| DB Change | ⬜ |
| Style Only | ⬜ |
| Env Update Required | ✅ |

## Problem

There are no end-to-end tests covering critical user flows. Auth flows, role-based route access, and map interactions can regress silently. Manual QA is the only safety net today and does not scale even for a small team.

## Solution

Add a Playwright E2E framework targeting the four critical flows listed below. Tests run against the local dev server (`pnpm dev`) pointing at local Supabase (`pnpm db:start`). Seed credentials from `supabase/seed.sql` are used directly.

**In scope:**
- Install `@playwright/test` as a dev dependency.
- Add `playwright.config.ts` at the repo root; base URL defaults to `http://localhost:5173`.
- Add `pnpm test:e2e` script to `package.json`.
- Create shared auth fixture (`e2e/fixtures/auth.ts`) that handles `signInWithPassword` via the Supabase REST API before each test to avoid clicking the login form in every spec.
- Create four spec files:
  - `e2e/auth/login.spec.ts` — login with every seed role (`user`, `super_user`, `admin`, `super_admin`); assert header reflects the logged-in state.
  - `e2e/map/map-view.spec.ts` — each authenticated user can reach `/map`; unauthenticated visitor is redirected to `/login`. Map canvas rendering is **stubbed** (Mapbox requires a live token; see notes).
  - `e2e/admin/users-page.spec.ts` — `admin` and `super_admin` can access `/users`; `user` and `super_user` are redirected to `/login`.
  - `e2e/map/edit-features.spec.ts` — `admin`, `super_user`, `super_admin` see the edit pencil button in the trail drawer; plain `user` does not. Trail drawer interactions are **stubbed** pending a reliable way to select a map feature in CI (tracked in C-003).
- Add Playwright output dirs to `.gitignore`.
- Add required E2E env vars to `.env.example`.

**Out of scope:**
- Running E2E in CI/CD (no GitHub Actions workflow yet — deferred).
- Full Mapbox map interaction testing (requires live Mapbox token and map canvas — stubbed, tracked in C-003).
- Visual regression / screenshot diffing.
- Mobile viewport testing.

## Testing

- `pnpm test:e2e` passes all specs against a running local dev server + local Supabase.
- `pnpm lint` and `pnpm build` must not regress.
- Each spec file must be independently runnable: `pnpm exec playwright test e2e/auth/login.spec.ts`.

## Notes

- Seed credentials (all use password `password123`):
  - `user@test.com` → role `user`
  - `super_user@test.com` → role `super_user`
  - `admin@test.com` → role `admin`
  - `super_admin@test.com` → role `super_admin`
- The auth fixture calls `supabase.auth.signInWithPassword` via the Supabase JS client and stores the session in `localStorage` before Playwright navigates to the page, keeping login-form interaction out of non-auth specs.
- Map specs stub the Mapbox canvas (`VITE_MAPBOX_ACCESS_TOKEN` absent = map token warning renders instead of canvas). Tests assert the page is reachable and the token-missing message is handled gracefully, or assert the page heading when a token is present.
- Edit-feature specs that require clicking a trail feature on the Mapbox canvas are stubbed with a `test.skip` and a chore reference (C-003) so the spec structure is in place without flaky canvas interactions.
- New env vars needed for E2E: `PLAYWRIGHT_BASE_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`.

## Related Issues

| Issue | Description | Status |
|-------|-------------|--------|

## Related PRs

| PR | Description | Status |
|----|-------------|--------|

## Changelog

| Date | Description | Initiated by | Why |
|------|-------------|--------------|-----|
| 2026-03-25 | Spec created | Copilot | Establish E2E safety net for critical user flows |
