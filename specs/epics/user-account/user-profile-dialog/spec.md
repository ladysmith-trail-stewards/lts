---
id: F-003
type: feature
epic: user-account
status: draft
created: 2026-03-25
updated: 2026-03-25
---

# User Profile Dialog

> Epic: [User Account](../spec.md) — E-002

## Flags

| Flag | |
|---|---|
| DB Change | ⬜ |
| Style Only | ⬜ |
| Env Update Required | ⬜ |

## Problem

Users have no way to update their display name or bio after signing up, and no in-app logout — they must navigate to a URL manually.

## Behaviour

The logout button in `Header.tsx` (`HeaderUser`) becomes a clickable trigger that opens a shadcn `Dialog`.

### Dialog contents

- **Display name** — text input, labelled _"Alias / Nickname"_. Pre-filled with current `profiles.name`. Required.
- **Bio** — textarea, labelled _"Bio"_. Pre-filled with current `profiles.bio`. Optional.
- **Save** button — calls `supabase.from('profiles').update(...)` for the current user's row. On success shows a `sonner` toast: _"Profile updated"_. On error shows a toast with the error message.
- **Log out** button (secondary/destructive) — calls `supabase.auth.signOut()`, navigates to `/`, shows a `sonner` toast: _"Logged out"_.
- **Cancel** — closes dialog without saving.

### Data loading

Profile data is fetched from `public.profiles` when the dialog opens (not on mount), keyed by the current `auth_user_id` from `useAuth()`.

## Implementation notes

- Use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`.
- Toast via `sonner` — already installed (`import { toast } from 'sonner'`).
- No new RPC needed — direct `supabase.from('profiles').update()` with `.eq('auth_user_id', user.id)`.
- The existing `useAuth()` hook provides `user` and `role` — no additional context needed.
- Keep `HeaderUser` as the trigger; extract dialog into a `UserProfileDialog` component in `src/components/`.

## Files to create / modify

| File | Change |
|---|---|
| `src/components/UserProfileDialog.tsx` | New — dialog component |
| `src/components/Header.tsx` | Modify `HeaderUser` to open the dialog on click instead of logging out directly |

## Testing

- Opening the dialog pre-fills name and bio correctly.
- Saving with a valid name shows success toast and updates the header display name.
- Saving with an empty name is blocked (required field).
- Logging out via the dialog shows the logout toast and redirects to `/`.
- Cancel closes the dialog without any changes.
