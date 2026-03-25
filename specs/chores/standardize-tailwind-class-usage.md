---
id: C-001
type: chore
epic: null
status: draft
created: 2026-03-24
updated: 2026-03-24
---

# Standardize Tailwind Class Usage Across Components

## Flags

| Flag | |
|------|-|
| DB Change | ⬜ |
| Style Only | ✅ |
| Env Update Required | ⬜ |

## Problem

Several components mix Tailwind utility classes with arbitrary CSS values, hardcoded hex colors, and raw pixel values instead of the project's design tokens (oklch CSS custom properties, spacing scale, font-size scale). This creates visual inconsistencies and makes future theme changes expensive — a single color update requires touching many files rather than one CSS variable.

Examples observed:
- `Hero.tsx` uses `style={{ color: '#3a5a3c' }}` inline instead of a Tailwind token.
- Some components use `text-[14px]` arbitrary values instead of `text-sm`.
- `Footer.tsx` mixes `gap-4` and `gap-[18px]` for logically equivalent spacing.

This was flagged in issue #37 ("Standardize Tailwind usage").

## Solution

Audit all files in `src/components/` and `src/pages/` and apply the following rules:

1. **Colors** — Replace all hardcoded hex/rgb/hsl color values with the corresponding CSS custom property via `text-[var(--color-*)]` or a project Tailwind alias. Never use `style={{ color: '...' }}` for design-token colors.
2. **Spacing** — Replace arbitrary spacing values (e.g., `gap-[18px]`) with the nearest Tailwind spacing token (`gap-4` = 16 px, `gap-5` = 20 px). Diverge only when pixel-precision is genuinely required and document why.
3. **Typography** — Replace `text-[14px]` with `text-sm`, `text-[18px]` with `text-lg`, etc. Use the Tailwind type scale.
4. **No new `style={{}}` props** — Inline styles are allowed only for dynamic values (e.g., map marker position). Static styles must use Tailwind.

### Scope

- `src/components/*.tsx` and `src/components/**/*.tsx`
- `src/pages/*.tsx`

Out of scope:
- `src/components/ui/` — shadcn primitives; do not modify unless explicitly upgrading a component.
- Generated files (`database.types.ts`).
- Mapbox canvas layer styles (JSON paint properties — not Tailwind).

## Impact

**Benefits:**
- Consistent visual output across components.
- Single-source-of-truth for colors via CSS custom properties.
- Faster future theme changes (e.g., dark mode or brand refresh).
- Reduces reviewer cognitive load — no ad-hoc color archaeology.

**Tradeoffs:**
- Purely mechanical refactor — no user-visible feature change.
- Low risk but touches many files; should be done in a single focused PR to keep the diff reviewable.
- Requires careful visual regression check (manual or screenshot diff).

## Testing

- Run `pnpm lint` — ESLint should pass after changes (no regressions).
- Run `pnpm build` — TypeScript build must pass.
- Manual visual check: load the home page, map page, and login page at 1280 px and 390 px viewports and confirm no layout regressions.
- Optional: add an ESLint rule (`eslint-plugin-tailwindcss` `no-arbitrary-value` or similar) to prevent regression. Document this in `eslint.config.js`.

## Notes

- Related to issue #37 ("Standardize Tailwind usage").
- Do not change component behaviour or markup structure — CSS classes only.
- Prettier will reformat class strings; run `pnpm format` after all edits.
- If a color has no obvious CSS variable equivalent, document the gap and create a new token in `index.css` rather than leaving a hardcoded value.

## Related Issues

| Issue | Description | Status |
|-------|-------------|--------|

## Related PRs

| PR | Description | Status |
|----|-------------|--------|

## Changelog

| Date | Description | Initiated by | Why |
|------|-------------|--------------|-----|
| 2026-03-24 | Spec created | KS | New spec system |

## Related PRs

| PR | Description | Status |
|----|-------------|--------|
