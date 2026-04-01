---
id: E-003
type: epic
status: in-progress
created: 2026-03-31
updated: 2026-03-31
---

# Production

Everything required to take the app from local development to a live, publicly accessible deployment — hosted static frontend, production Supabase project, and automated delivery pipeline.

## Problem

The application runs locally but has no production deployment. There is no production Supabase project seeded with real trail and region data, no static hosting for the built frontend, and no automated pipeline to deliver code changes to users. Without this, the app cannot be used by the Ladysmith Trail Stewards community.

## Solution

Stand up a production environment consisting of:

- A provisioned Supabase cloud project with migrations applied and initial data populated.
- A hosted static build of the Vite frontend.
- A GitHub Actions CD pipeline that builds and deploys the frontend on every merge to `main`.

## Goals

- Any member of the public can reach the live site over HTTPS.
- Trail and region data is present in the production database on day one.
- Code merged to `main` is automatically delivered — no manual deploy steps.
- Secrets and environment variables are managed securely and never committed to git.

## Features

| ID    | Type    | Name                      | Status  | Spec                                        |
| ----- | ------- | ------------------------- | ------- | ------------------------------------------- |
| F-005 | feature | Setup Supabase Prod DB    | planned | [spec](./setup-supabase-prod-db/spec.md)    |
| F-006 | feature | Populate Supabase Prod DB | planned | [spec](./populate-supabase-prod-db/spec.md) |
| F-007 | feature | Host Static Code          | planned | [spec](./host-static-code/spec.md)          |
| F-008 | feature | Setup GitHub CD           | planned | [spec](./setup-github-cd/spec.md)           |

## Work Plans (Future)

- **Preview environments** — per-PR staging deploys via Vercel/Netlify preview URLs.
- **Supabase branching** — database branches tied to feature branches.
- **Monitoring & alerting** — uptime checks, error tracking (e.g. Sentry).
- **CDN / edge caching** — cache static assets for faster global load times.
