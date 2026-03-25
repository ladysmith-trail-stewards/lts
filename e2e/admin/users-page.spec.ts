import { test, expect, type SeedUserKey } from '../fixtures/auth';

/**
 * Users page spec — verifies that only admin-tier roles can access /users.
 *
 * Access policy (from RequireAdmin.tsx):
 *   Allowed  → admin, super_admin
 *   Denied   → user, super_user  (redirected to /login)
 */

const ADMIN_USERS: SeedUserKey[] = ['admin', 'super_admin'];
const NON_ADMIN_USERS: SeedUserKey[] = ['user', 'super_user'];

for (const userKey of ADMIN_USERS) {
  test(`${userKey} can access the users management page`, async ({
    page,
    signIn,
  }) => {
    await signIn(userKey);
    await page.goto('/users');

    await expect(page).toHaveURL('/users');

    // The page heading or some user-list content should be visible.
    await expect(
      page
        .getByRole('heading', { name: /users|members|manage/i })
        .or(page.getByText(/members|users/i).first()),
    ).toBeVisible({ timeout: 8000 });
  });
}

for (const userKey of NON_ADMIN_USERS) {
  test(`${userKey} cannot access the users management page and is redirected`, async ({
    page,
    signIn,
  }) => {
    await signIn(userKey);
    await page.goto('/users');

    // Non-admin roles should be redirected to /login.
    await expect(page).toHaveURL('/login');
  });
}

test('unauthenticated visitor cannot access /users', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL('/login');
});
