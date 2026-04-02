# Specs

Specs are the source of truth for all planned work in this repository. Issues and PRs are derived from specs — not the other way around.
How can this possibly be maintained? Through the Use of LLM, and rulesheets, that will check for deviations / closed tickets , etc. Totally worth a try.

> New here? Read the [Spec Writing Guide](./SPEC_GUIDE.md).

## Table of Contents

- **E-001** [Trail Management](./epics/trail-management/spec.md) `active`
  - **F-001** [Draw Trail](./epics/trail-management/draw-trail/spec.md) `draft`
  - **F-002** [Trail Elevation Profile](./epics/trail-management/trail-elevation-profile/spec.md) `draft`

- **E-002** [User Account](./epics/user-account/spec.md) `active`
  - **F-004** [Google SSO Authentication](./epics/user-account/google-sso-auth/spec.md) `complete`
  - **F-003** [User Profile Dialog](./epics/user-account/user-profile-dialog/spec.md) `draft`

- **E-003** [Production](./epics/production/spec.md) `active`
  - **F-005** [Setup Supabase Prod DB](./epics/production/setup-supabase-prod-db/spec.md) `planned`
  - **F-006** [Populate Supabase Prod DB](./epics/production/populate-supabase-prod-db/spec.md) `planned`
  - **F-007** [Host Static Code](./epics/production/host-static-code/spec.md) `planned`
  - **F-008** [Setup GitHub CD](./epics/production/setup-github-cd/spec.md) `planned`

- **Chores**
  - **C-001** [Standardize Tailwind Class Usage Across Components](./chores/standardize-tailwind-class-usage.md) `draft`
  - **C-002** [DX Improvements: db:studio, db:reset Formatting, POLICIES.md Stability, pre-commit Hook](./chores/dx-improvements-db-tooling.md) `complete`
  - **C-003** [Extract Profiles DB Service from UserProfileDialog](./chores/extract-profiles-db-service.md) `draft`
  - **C-004** [Migrate to createBrowserRouter (Data Router)](./chores/migrate-to-data-router.md) `planned`

---

## Structure

```
specs/
├── epics/        # Large, multi-feature bodies of work
├── fixes/        # Bug fixes
└── chores/       # Refactors, maintenance, and non-feature work
```

## ID Format

| Prefix | Type    | Example |
| ------ | ------- | ------- |
| `E-`   | Epic    | E-001   |
| `F-`   | Feature | F-001   |
| `B-`   | Bug fix | B-001   |
| `C-`   | Chore   | C-001   |

IDs are sequential and never reused.
