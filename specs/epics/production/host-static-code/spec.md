---
id: F-007
type: feature
epic: production
status: planned
created: 2026-03-31
updated: 2026-03-31
---

# Host Static Code

> Epic: [Production](../spec.md) — E-003

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ✅  |

## Problem

The frontend has no public hosting. Running `pnpm build` produces a `dist/` folder of static assets but there is nowhere to serve them — the app is not reachable by anyone other than a local developer.

## Solution

Deploy the built static assets to a hosting provider that serves them over HTTPS. Vercel is the recommended choice: it has a generous free tier, native Vite support, automatic HTTPS, and integrates with GitHub for CD (see F-008).

### Hosting provider decision

| Option       | Pros                                   | Cons                                                                         |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------------- |
| Vercel       | Zero-config Vite, free tier, GitHub CD | Vendor lock-in                                                               |
| Netlify      | Similar free tier, good DX             | Slightly more config for Vite                                                |
| GitHub Pages | Free, no vendor                        | No server-side redirects by default; SPA routing needs `404.html` workaround |

**Decision: Vercel** (or Netlify — either is acceptable). Avoid GitHub Pages for SPA routing complexity.

### Steps

1. **Create Vercel account** (if not already) and import the `ladysmith-trail-stewards/lts` GitHub repo.
2. **Configure the build:**
   - Framework preset: `Vite`
   - Build command: `pnpm build`
   - Output directory: `dist`
   - Install command: `pnpm install`
3. **Set environment variables** in the Vercel project dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
   - `VITE_MAPBOX_ACCESS_TOKEN`
4. **Configure SPA routing** — add a `vercel.json` at the project root to rewrite all routes to `index.html`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

5. **Trigger the first deploy** — push to `main` or trigger manually from the Vercel dashboard.
6. **Verify** — open the Vercel deployment URL and confirm the app loads, routes work, and Supabase/Mapbox calls succeed.

### Custom domain (optional / deferred)

Assigning a custom domain (e.g. `ladysmithtrailstewards.ca`) is deferred — it requires DNS access and is not a blocker for the initial production deployment.

## Out of Scope

- Custom domain setup (deferred).
- Preview environments per PR (deferred to a future epic).
- Server-side rendering — the app is entirely static/SPA.

## In Scope

- The built app is publicly accessible over HTTPS at a Vercel-assigned URL.
- All client-side routes render correctly (no 404 on page refresh).
- Environment variables are injected at build time via the hosting provider.

## Files to create / modify

| File          | Change                                                       |
| ------------- | ------------------------------------------------------------ |
| `vercel.json` | New — SPA rewrite rule so all routes resolve to `index.html` |

## Testing

**Manual verification:**

- Load the production URL → app loads without console errors.
- Navigate to `/map`, `/charter`, `/contact` — hard-refresh on each → no 404.
- Sign in via Google → OAuth redirect completes and user lands on the correct page.
- Map tiles and trail geometry render correctly.

**Edge cases:**

- A missing `VITE_*` env var causes a silent failure — verify all three vars are set in the Vercel dashboard before the first deploy.
- Mapbox token with restricted URL scopes may block production domain — ensure the token allows the Vercel deployment URL.

## Notes

- `VITE_SUPABASE_SECRET_KEY` must **not** be added to Vercel — it is for integration tests only and would be exposed in the browser bundle.
- After the first successful deploy, add the production URL to `README.md`.
- `vercel.json` must be committed to the repo for routing to work on every deploy.

## Related Issues

| Issue                                                            | Description                           | Status |
| ---------------------------------------------------------------- | ------------------------------------- | ------ |
| [#61](https://github.com/ladysmith-trail-stewards/lts/issues/61) | [E-003] Production (parent epic)      | Open   |
| [#64](https://github.com/ladysmith-trail-stewards/lts/issues/64) | [F-007] Host Static Code (this issue) | Open   |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author         | Driver    | Why                                     | Status  |
| ---------- | ------------ | -------------- | --------- | --------------------------------------- | ------- |
| 2026-03-31 | Spec created | KeeganShaw-GIS | blueprint | Derived from issue #61 production tasks | planned |
