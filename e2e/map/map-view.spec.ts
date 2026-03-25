import { test, expect, type SeedUserKey } from '../fixtures/auth';

/**
 * Map view spec — verifies that authenticated users can reach /map and that
 * unauthenticated visitors are redirected to /login.
 *
 * Note: Full Mapbox canvas rendering requires a live VITE_MAPBOX_ACCESS_TOKEN.
 * When the token is absent the app renders a "Map requires a Mapbox access token"
 * message instead of the canvas. Both cases are handled below.
 *
 * Stub: Actual map interaction (clicking trails, opening drawer) is deferred
 * to C-003 once a reliable canvas interaction strategy is established.
 */

const MAP_USERS: SeedUserKey[] = ['user', 'super_user', 'admin', 'super_admin'];

for (const userKey of MAP_USERS) {
  test(`${userKey} can access the map page`, async ({ page, signIn }) => {
    await signIn(userKey);
    await page.goto('/map');

    // The page should not redirect to /login.
    await expect(page).not.toHaveURL('/login');
    await expect(page).toHaveURL('/map');

    // Either the Mapbox canvas renders or the "token missing" message shows.
    const hasCanvas = await page.locator('.mapboxgl-canvas').isVisible();
    const hasMissingTokenMsg = await page
      .getByText(/mapbox access token/i)
      .isVisible();

    expect(hasCanvas || hasMissingTokenMsg).toBe(true);
  });
}

test('unauthenticated visitor is redirected to /login from /map', async ({
  page,
}) => {
  await page.goto('/map');
  await expect(page).toHaveURL('/login');
});
