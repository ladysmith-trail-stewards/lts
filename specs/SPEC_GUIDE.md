# Spec Writing Guide

This guide is for humans and LLMs writing specs in this repository. Specs are the source of truth — issues and PRs are derived from them.

## Core Rules

- One spec per feature, bug, or chore.
- IDs are sequential and never reused. Check `README.md` for the next available ID.
- Specs live in the right folder:
  - Features → `specs/epics/<epic-name>/<feature-name>/spec.md`
  - Bugs → `specs/fixes/<bug-name>.md`
  - Chores → `specs/chores/<chore-name>.md`
- After creating a spec, add it to `specs/README.md`.
- After creating a feature spec, add it to its parent epic's Features table and add the epic back-link below the title.

## Writing Style

- **Be concise.** Bullets over paragraphs. No filler.
- **Problem first.** Always start with why, not what.
- **Name things.** Reference actual file paths, function names, RPC names, and component names where known.
- **No tradeoffs/benefits sections at the epic level** — save those for feature specs in Notes if relevant.
- **Don't over-specify implementation** in Testing — test behaviour, not internals.

## Flags

Every spec must include a `## Flags` table directly after the title (and epic back-link if present). Flags give reviewers an instant read on the blast radius of the change.

| Flag                | Yes | No  | Meaning                                               |
| ------------------- | --- | --- | ----------------------------------------------------- |
| DB Change           | ✅  | ⬜  | Requires a migration, schema alter, or new RPC        |
| Style Only          | ✅  | ⬜  | CSS / Tailwind / design token changes only — no logic |
| Env Update Required | ✅  | ⬜  | New or changed environment variable needed            |

Rules:

- All three flags must be present on every spec — never omit a row.
- A spec can be both `DB Change: ✅` and `Style Only: ⬜` — flags are independent.
- If unsure, default to ✅ and refine later.

---

## Status Values

`status` in the front matter has three values:

| `status`      | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `planned`     | Feature is known and on the roadmap — spec may be at any level of fidelity. |
| `in-progress` | Actively being worked on.                                                   |
| `complete`    | Shipped and done.                                                           |

Specs are **living documents** — they can receive changes from any team at any time, regardless of status. A design change, a new requirement, a tech assessment finding, or a dev discovery can all update a spec while it is `planned`, `in-progress`, or even after `complete` (for post-ship learnings). Always add a changelog entry when the spec changes.

## Changelog

The `## Changelog` table records every meaningful change to the spec. Columns:

**`Author`** — who wrote this entry.

**`Driver`** — the type of work or team that prompted the change:

| `Driver`    | Meaning                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `stubbed`   | Feature placeholder created — reserved but no detail yet.                               |
| `spitball`  | Rough idea or early thinking captured.                                                  |
| `blueprint` | Structured spec written or significantly updated — story, flow, and intent fleshed out. |
| `design`    | UX or visual design decision.                                                           |
| `ta`        | Tech assessment — architecture, feasibility, or sub-task breakdown.                     |
| `dev`       | Finding or change that came out of active development.                                  |
| `review`    | Change requested during code or spec review.                                            |

**`Why`** — one sentence on why the change was made.

**`Status`** — the feature's `status` at the time of this entry (`planned`, `in-progress`, or `complete`).

---

## Templates

### Feature (`F-XXX`)

```md
---
id: F-XXX
type: feature
epic: <epic-name>
status: planned
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# <Feature Name>

> Epic: [<Epic Name>](relative-path-to-epic-spec.md) — E-XXX

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

<One or two sentences. What is missing or broken for the user right now?>

## Solution

<What will be built. Be specific: component names, RPC names, data flow.>

<Use sub-headings if the solution has distinct parts — e.g. ### Permissions, ### UI Interactions.>

## Out of Scope

- <Thing intentionally excluded — frame as deferred, not rejected.>

## In Scope

- <Anything non-obvious that IS included.>

## Testing

**Unit tests:**

- <Function name and what it asserts.>

**Integration tests:**

- <RPC or DB behaviour to verify, including RLS checks.>

**Edge cases:**

- <Boundary conditions, error states, race conditions.>

## Notes

- <Implementation hints, library choices, file locations, cross-references.>
- <Anything a developer needs to know before starting.>

## Related Issues

| Issue | Description | Status |
| ----- | ----------- | ------ |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author | Driver    | Why      | Status  |
| ---------- | ------------ | ------ | --------- | -------- | ------- |
| YYYY-MM-DD | Spec created | <name> | blueprint | <reason> | planned |
```

---

### Bug (`B-XXX`)

```md
---
id: B-XXX
type: fix
epic: <epic-name or null>
status: planned
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# <Short Bug Title>

> Epic: [<Epic Name>](relative-path) — E-XXX ← omit if no parent epic

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

<What is broken. Include reproduction steps:>

1. <Step one>
2. <Step two>
3. **Actual:** <what happens>
4. **Expected:** <what should happen>

## Solution

<The fix. Reference the exact file, function, or component to change.>

## Testing

**Reproduction test:**

- <How to confirm the bug is fixed.>

**Regression:**

- <What must still work after the fix.>

**Edge cases:**

- <Related failure modes to check.>

## Notes

- <Root cause analysis if known.>
- <Files likely involved.>

## Related Issues

| Issue | Description | Status |
| ----- | ----------- | ------ |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author | Driver    | Why      | Status  |
| ---------- | ------------ | ------ | --------- | -------- | ------- |
| YYYY-MM-DD | Spec created | <name> | blueprint | <reason> | planned |
```

---

### Chore (`C-XXX`)

```md
---
id: C-XXX
type: chore
epic: <epic-name or null>
status: planned
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# <Chore Title>

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ⬜  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

<Why this work needs doing. What breaks, degrades, or accumulates if it's not done?>

## Solution

<What will be done. Define the scope boundary clearly — what files/systems are in and out.>

**In scope:**

- <...>

**Out of scope:**

- <...>

## Testing

- <How to verify the chore is complete — lint, build, manual check, etc.>

## Notes

- <Anything a developer needs before starting.>

## Related Issues

| Issue | Description | Status |
| ----- | ----------- | ------ |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author | Driver    | Why      | Status  |
| ---------- | ------------ | ------ | --------- | -------- | ------- |
| YYYY-MM-DD | Spec created | <name> | blueprint | <reason> | planned |
```

---

## After Writing a Spec

1. Add the entry to `specs/README.md` under the correct epic or section with the spec's current `status` as a backtick label (e.g. `` `draft` ``).
2. If it's a feature, add it to the parent epic's `## Features` table.
3. Add the `> Epic:` back-link below the spec title (features and bugs only).
4. Leave `Related Issues` and `Related PRs` tables empty — fill them when tickets are created.
5. Add a first row to the `Changelog` table: today's date, "Spec created", your name, and why.

## When a Spec Ships (PR merged)

1. Update the spec front matter: set `status: complete` and update `updated` to today's date. Add `pr: <url>` and `closed-by: <issue-url>` if applicable.
2. **Update `specs/README.md`** — change the status label next to the entry from `` `draft` `` / `` `active` `` to `` `complete` ``.
3. Add a Changelog row describing what shipped and why.

## Generating a GitHub Issue from a Spec

When ready to create an issue:

- **Title:** `[<ID>] <Spec Title>`
- **Body:** Summary (Problem + Solution), Acceptance Criteria (from Testing), link to spec file:
  `Implements spec: specs/epics/<epic>/<feature>/spec.md`
- After creating, update the spec's `Related Issues` table with the issue number and set status to `Open`.
