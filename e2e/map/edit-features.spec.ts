import { test, expect, type SeedUserKey } from '../fixtures/auth';

/**
 * Edit features spec — verifies that edit-capable roles see the pencil/edit
 * button in the trail detail drawer, and that plain `user` does not.
 *
 * Edit roles (from TrailDetailDrawer/index.tsx):
 *   EDIT_ROLES = ['admin', 'super_user', 'super_admin']
 *
 * STUB: Opening the trail detail drawer requires clicking a specific trail
 * feature on the Mapbox GL canvas, which is not reliably automatable without
 * a live Mapbox token and canvas interaction support.
 *
 * The tests below are structured and ready but are skipped with a clear
 * reference. Un-skip and implement canvas interaction in chore C-003.
 *
 * When C-003 is resolved, replace `test.skip(...)` with `test(...)` and
 * implement the `openTrailDrawer` helper to click a seeded trail feature.
 */

const EDIT_ROLES: SeedUserKey[] = ['admin', 'super_user', 'super_admin'];
const READ_ONLY_ROLES: SeedUserKey[] = ['user'];

// ── Stub helper ───────────────────────────────────────────────────────────────

/**
 * Opens the trail detail drawer by clicking a trail feature on the map.
 * STUB — not yet implemented. Tracked in C-003.
 */
// async function openTrailDrawer(page: Page): Promise<void> {
//   // TODO (C-003): click a specific trail feature on the Mapbox canvas
//   // e.g. await page.locator('.mapboxgl-canvas').click({ position: { x: ..., y: ... } });
//   throw new Error('openTrailDrawer is not yet implemented — see C-003');
// }

// ── Specs ─────────────────────────────────────────────────────────────────────

for (const userKey of EDIT_ROLES) {
  test.skip(
    `${userKey} sees the edit button in the trail detail drawer`,
    async ({ page, signIn }) => {
      // STUB (C-003): requires canvas interaction to open the trail drawer.
      await signIn(userKey);
      await page.goto('/map');

      // TODO (C-003): open trail drawer
      // await openTrailDrawer(page);

      // The edit pencil button is rendered by TrailDetailDrawer when canEdit=true.
      await expect(
        page.getByRole('button', { name: /edit/i }).or(
          page.locator('[aria-label="Edit trail"]'),
        ),
      ).toBeVisible({ timeout: 8000 });
    },
  );
}

for (const userKey of READ_ONLY_ROLES) {
  test.skip(
    `${userKey} does not see the edit button in the trail detail drawer`,
    async ({ page, signIn }) => {
      // STUB (C-003): requires canvas interaction to open the trail drawer.
      await signIn(userKey);
      await page.goto('/map');

      // TODO (C-003): open trail drawer
      // await openTrailDrawer(page);

      // Plain `user` role should NOT see an edit control.
      await expect(
        page.getByRole('button', { name: /edit/i }).or(
          page.locator('[aria-label="Edit trail"]'),
        ),
      ).not.toBeVisible({ timeout: 4000 });
    },
  );
}

// ── Non-stubbed: role is reflected on the map page ────────────────────────────

test('edit-capable roles reach /map without redirect', async ({
  page,
  signIn,
}) => {
  await signIn('admin');
  await page.goto('/map');
  await expect(page).toHaveURL('/map');
});

test('plain user reaches /map without redirect (read-only)', async ({
  page,
  signIn,
}) => {
  await signIn('user');
  await page.goto('/map');
  await expect(page).toHaveURL('/map');
});
