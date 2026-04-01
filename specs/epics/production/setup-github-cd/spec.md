---
id: F-008
type: feature
epic: production
status: planned
created: 2026-03-31
updated: 2026-03-31
---

# Setup GitHub CD

> Epic: [Production](../spec.md) — E-003

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ✅  |

## Problem

There is no automated delivery pipeline. Every code change merged to `main` requires a developer to manually rebuild and re-deploy the frontend. This is error-prone, slow, and blocks the team from shipping safely.

## Solution

Add a GitHub Actions workflow that automatically builds and deploys the frontend on every push to `main`. The workflow integrates with the hosting provider (Vercel) via a deploy hook or GitHub integration.

### Approach options

| Approach                                    | Description                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel GitHub integration (recommended)** | Vercel's native GitHub app listens for pushes to `main` and triggers a build automatically — no workflow file needed. Zero maintenance.                               |
| **GitHub Actions + Vercel CLI**             | A `.github/workflows/deploy.yml` that runs `pnpm build` and calls the Vercel CLI to deploy. More explicit, easier to add pre-deploy checks (lint, type-check, tests). |

**Decision: GitHub Actions + Vercel CLI** — gives explicit control over pre-deploy gates (lint + type-check must pass before deploy) and is consistent with the existing `pnpm` toolchain.

### Workflow file

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check & build
        run: pnpm build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY }}
          VITE_MAPBOX_ACCESS_TOKEN: ${{ secrets.VITE_MAPBOX_ACCESS_TOKEN }}

      - name: Deploy to Vercel
        run: pnpm dlx vercel --prod --token=${{ secrets.VERCEL_TOKEN }} --yes
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### GitHub Actions secrets required

| Secret                                  | How to get it                                               |
| --------------------------------------- | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`                     | Supabase dashboard → Project Settings → API → Project URL   |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase dashboard → Project Settings → API → anon key      |
| `VITE_MAPBOX_ACCESS_TOKEN`              | Mapbox account tokens page                                  |
| `VERCEL_TOKEN`                          | Vercel dashboard → Account Settings → Tokens → Create token |
| `VERCEL_ORG_ID`                         | `vercel env pull` or Vercel project settings                |
| `VERCEL_PROJECT_ID`                     | `vercel env pull` or Vercel project settings                |

Add all secrets under **GitHub repo → Settings → Secrets and variables → Actions**.

> `VITE_SUPABASE_SECRET_KEY` must **not** be added here — it would be embedded in the built bundle.

### Branch protection (recommended)

Enable branch protection on `main`:

- Require the `deploy` workflow to pass before merging.
- Require at least 1 approving review (optional for a small team, but good practice).

## Out of Scope

- Running integration tests in CI (deferred — requires a Supabase CI instance or mocking strategy).
- Preview deployments per PR (deferred).
- Slack/email notifications on deploy failure (deferred).

## In Scope

- Every push to `main` triggers lint + type-check + build.
- A successful build is automatically deployed to Vercel production.
- A failed lint or type-check blocks the deploy.
- No secrets are ever embedded in the built output or logged in CI.

## Files to create / modify

| File                           | Change                                          |
| ------------------------------ | ----------------------------------------------- |
| `.github/workflows/deploy.yml` | New — lint, build, and deploy on push to `main` |

## Testing

**Manual verification:**

- Push a trivial change to `main` → workflow runs in GitHub Actions → Vercel deployment URL updates.
- Introduce a TypeScript error → build step fails → deploy is skipped, no broken version is pushed.
- Introduce a lint error → lint step fails → deploy is skipped.

**Edge cases:**

- A missing GitHub secret causes the Vercel deploy step to fail with an auth error — verify all 6 secrets are set before the first run.
- `pnpm install --frozen-lockfile` fails if `pnpm-lock.yaml` is out of date — always commit lock file changes.

## Notes

- Alternatively, if using Vercel's native GitHub integration (no workflow file), set the three `VITE_*` env vars in the Vercel project dashboard instead of GitHub secrets — Vercel injects them at build time automatically.
- The `vercel --yes` flag skips interactive prompts in CI.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` can be retrieved by running `vercel link` locally and inspecting `.vercel/project.json` (do not commit this file).

## Related Issues

| Issue                                                            | Description                          | Status |
| ---------------------------------------------------------------- | ------------------------------------ | ------ |
| [#61](https://github.com/ladysmith-trail-stewards/lts/issues/61) | [E-003] Production (parent epic)     | Open   |
| [#65](https://github.com/ladysmith-trail-stewards/lts/issues/65) | [F-008] Setup GitHub CD (this issue) | Open   |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author         | Driver    | Why                                     | Status  |
| ---------- | ------------ | -------------- | --------- | --------------------------------------- | ------- |
| 2026-03-31 | Spec created | KeeganShaw-GIS | blueprint | Derived from issue #61 production tasks | planned |
