---
name: migration-no-data
description: Do not insert seed/fixture data in migration files — data injection belongs in seed.sql unless explicitly requested
type: feedback
---

Do not insert data (INSERT statements) in migration files. Data seeding belongs in seed.sql.

**Why:** User considers migrations as schema-only. They plan to squash migrations before real deployment, so keeping data out of migrations keeps them clean.

**How to apply:** When writing migrations, only include DDL (CREATE, ALTER, DROP) and schema-related operations. Put any INSERT/UPDATE seed data in supabase/seed.sql instead.
