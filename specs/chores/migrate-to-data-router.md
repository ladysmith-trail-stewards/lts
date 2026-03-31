---
id: C-004
type: chore
status: planned
created: 2026-03-31
updated: 2026-03-31
---

# Migrate to createBrowserRouter (Data Router)

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

The app uses `<BrowserRouter>` (a legacy router), which does not support React Router v6.4+ data router APIs. This was discovered when `useBlocker` was used in `TrailDetailDrawer` (`src/components/TrailDetailDrawer/index.tsx`) to guard in-app navigation against unsaved geometry edits — it threw a runtime error:

> `useBlocker must be used within a data router.`

`useBlocker` was removed as a short-term fix. The app now only guards browser close/refresh via `beforeunload`, but in-app link navigation (e.g. clicking "Home" in the nav while mid-edit) silently discards unsaved geometry changes without warning the user.

## Solution

Migrate from `<BrowserRouter>` to `createBrowserRouter` + `<RouterProvider>`.

**Files to change:**

- `src/main.tsx` — replace `<BrowserRouter>` with `<RouterProvider router={router} />`; define `router` with `createBrowserRouter`
- `src/App.tsx` — dissolve `<Routes>/<Route>` tree into the router config; move layout logic into a root layout route component
- `src/components/TrailDetailDrawer/index.tsx` — re-add `useBlocker` for in-app navigation guard (see F-001 spec)

**Approach:**

1. Create a root layout route component (inline in `App.tsx` or a new `src/components/RootLayout.tsx`) that renders `<Header>`, `<Outlet>`, and `<Footer>` — replacing the current `isMapPage` branch logic.
2. Define all routes in a `createBrowserRouter` call in `main.tsx` (or a dedicated `src/router.tsx`).
3. Remove `<BrowserRouter>` from `main.tsx`.
4. Restore `useBlocker` in `TrailDetailDrawer` once the data router is in place.

## Out of Scope

- Loaders or actions — no data fetching is being migrated, just the router type.

## Testing

- All existing routes render correctly after migration.
- `useBlocker` in `TrailDetailDrawer` intercepts in-app navigation while geometry edits are dirty and prompts the user to confirm.

## Changelog

| Date       | Author  | Driver | Notes                                            |
| ---------- | ------- | ------ | ------------------------------------------------ |
| 2026-03-31 | Copilot | Dev    | Created. `useBlocker` removed as short-term fix. |
