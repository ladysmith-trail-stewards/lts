---
id: F-010
type: feature
epic: user-management
status: planned
created: 2026-04-02
updated: 2026-04-02
---

# New User Admin Notification

> Epic: [User Management Improvements](../spec.md) — E-004

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ✅  |
| Style Only          | ⬜  |
| Env Update Required | ✅  |

## Problem

When a new user completes the signup flow and enters the `pending` queue, no admin is notified. Admins must manually check `UsersPage` to discover pending users. This means approvals are delayed indefinitely unless an admin happens to log in and look — unsuitable for an org that processes signups infrequently.

## Solution

### Overview

A Supabase Database Webhook fires on every `INSERT` to `public.profiles`. It calls a Supabase Edge Function (`notify-new-user`) which looks up the new user's email, then sends a notification email to the configured admin address via the Resend API.

```
profiles INSERT
  → Supabase Database Webhook (HTTP POST)
  → notify-new-user Edge Function
  → Resend API
  → admin notification email
```

This is entirely serverless — no additional infrastructure required.

### Trigger condition

The webhook should fire on `INSERT` to `public.profiles` **only when `role = 'pending'`**. Seed inserts (role = `'user'`, `'admin'`, etc.) must not generate emails.

The filter is applied inside the Edge Function (the webhook payload includes the `record` object with all column values) rather than in the webhook config — webhook filters in Supabase are limited, and a function-level check is more reliable and testable.

### Edge Function: `notify-new-user`

**Location:** `supabase/functions/notify-new-user/index.ts`

**Inputs:** Supabase Database Webhook `POST` payload:

```json
{
  "type": "INSERT",
  "table": "profiles",
  "record": {
    "id": 42,
    "auth_user_id": "uuid",
    "name": "Jane Smith",
    "role": "pending",
    "policy_accepted_at": "2026-04-02T10:00:00Z",
    ...
  }
}
```

**Steps:**

1. Parse `record`. Exit 200 silently if `record.role !== 'pending'` — no email sent for non-pending inserts.
2. Look up the user's email via `supabase-js` with the **service role key**: `supabase.auth.admin.getUserById(record.auth_user_id)`.
3. `POST` to the Resend API (`https://api.resend.com/emails`) with:
   - **To:** `ADMIN_NOTIFICATION_EMAIL` env var
   - **From:** `RESEND_FROM_ADDRESS` env var (must be a verified Resend sender)
   - **Subject:** `New user pending approval — <name>`
   - **HTML body:** name, email, signup timestamp, direct link to the UsersPage in the app.
4. Return 200 on success; return 500 with a logged error message on failure (Resend or Supabase error).

**Dependencies:** Resend SDK (`npm:resend`) or raw `fetch` to the Resend REST API — prefer raw `fetch` to avoid a build step.

### Database Webhook configuration

Configured in the Supabase dashboard (not in `config.toml` — dashboard webhooks are project-level, not local config):

| Setting      | Value                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Name         | `on_profile_insert`                                                                                       |
| Table        | `public.profiles`                                                                                         |
| Events       | `INSERT`                                                                                                  |
| Endpoint     | Edge Function URL: `.../functions/v1/notify-new-user`                                                     |
| HTTP headers | `Authorization: Bearer <supabase anon key>` (Supabase sets this automatically for Edge Function webhooks) |

Document the exact configuration steps in `supabase/ARCHITECTURE.md` under a new **Webhooks** section, since webhook config is not captured in `config.toml` or migrations.

### Environment variables

| Variable                    | Where set                                 | Purpose                                 |
| --------------------------- | ----------------------------------------- | --------------------------------------- |
| `RESEND_API_KEY`            | Supabase project secrets                  | Authenticates calls to the Resend API   |
| `RESEND_FROM_ADDRESS`       | Supabase project secrets                  | Verified Resend sender address          |
| `ADMIN_NOTIFICATION_EMAIL`  | Supabase project secrets                  | Destination address for new-user alerts |
| `SUPABASE_SERVICE_ROLE_KEY` | Available automatically in Edge Functions | Look up user email from `auth.users`    |
| `SUPABASE_URL`              | Available automatically in Edge Functions | Supabase client initialisation          |

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically by Supabase into every Edge Function — they do not need to be set manually.

## Out of Scope

- Notifying the _user_ by email when their account is approved — deferred.
- In-app notifications or dashboard badges for admins — deferred.
- Batching notifications (e.g. one daily digest) — deferred.
- Notifications for role changes (pending → user) — deferred.

## In Scope

- Silently skipping the notification (200 OK, no email) for non-`pending` inserts so seed data and admin-created profiles do not spam the inbox.
- Logging the Resend response (success or error) to Edge Function logs for observability.
- Documenting the webhook setup in `supabase/ARCHITECTURE.md` since it cannot be version-controlled in migrations.

## Testing

**Unit tests (Edge Function):**

- Payload with `role = 'pending'` → Resend API is called with correct To/From/Subject.
- Payload with `role = 'user'` → Resend API is **not** called; function returns 200.
- Resend API error → function returns 500 and logs the error message.
- Missing `auth_user_id` in payload → function returns 500 with a descriptive error.

**Integration tests:**

- Insert a `pending` profile in the test DB → verify the Edge Function is invoked (check function logs or use a mock endpoint).
- Insert a `user` profile → verify the Edge Function is invoked but sends no email.

**Edge cases:**

- New user email is null (edge case for some OAuth providers) — function logs a warning and skips the send rather than erroring.
- Resend rate limit hit — function returns 500 and logs; does not retry (retry is deferred).
- Webhook delivers the payload twice (at-least-once delivery) — the email is sent twice; idempotency is deferred as the impact is low.

## Notes

- Resend is the preferred email provider: generous free tier (3,000 emails/month), simple REST API, first-class TypeScript SDK. Alternatives: Postmark, Sendgrid — same approach applies.
- To test locally: use `supabase functions serve notify-new-user` and `curl` a test payload, or use the Supabase dashboard's webhook test tool. The Resend sandbox mode can be used to avoid sending real emails in development.
- Edge Function logs are accessible in the Supabase dashboard under **Edge Functions → notify-new-user → Logs**. This is the primary debugging surface.
- The webhook is configured in the dashboard, not in code. Any changes to the webhook config must also be reflected in the `supabase/ARCHITECTURE.md` Webhooks section — this is the only version-controlled record of its existence.
- F-009 (Policy Acknowledgement) introduces `policy_accepted_at` on `profiles`. If F-009 ships first, consider whether the notification email should note whether the user has accepted the policy at time of insert — the `record` object in the webhook payload will include `policy_accepted_at` and can be used for this.

## Related Issues

| Issue | Description | Status |
| ----- | ----------- | ------ |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author  | Driver    | Why                                                              | Status  |
| ---------- | ------------ | ------- | --------- | ---------------------------------------------------------------- | ------- |
| 2026-04-02 | Spec created | Copilot | blueprint | Admins have no visibility of new signups without manual checking | planned |
