import { test, expect, SEED_USERS, type SeedUserKey } from '../fixtures/auth';

/**
 * Login spec — verifies that each seed user can sign in through the login form
 * and lands on the home page with the expected auth state visible in the header.
 *
 * Covers: user, super_user, admin, super_admin.
 */

const LOGIN_USERS: SeedUserKey[] = ['user', 'super_user', 'admin', 'super_admin'];

for (const userKey of LOGIN_USERS) {
  const { email, password } = SEED_USERS[userKey];

  test(`${userKey} can log in via the login form`, async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /login/i }).click();

    // After successful login the app navigates to the home page.
    await expect(page).toHaveURL('/');

    // The header logout / user button should be present, confirming auth state.
    await expect(
      page.getByRole('button', { name: /log.?out|sign.?out/i }).or(
        // The header renders the username portion of the email in the logout button.
        page.getByRole('button', { name: new RegExp(email.split('@')[0], 'i') }),
      ),
    ).toBeVisible({ timeout: 8000 });
  });

  test(`${userKey} sees an error with wrong credentials`, async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('wrong-password-xyz');
    await page.getByRole('button', { name: /login/i }).click();

    // An error message should appear and the user stays on /login.
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({
      timeout: 6000,
    });
    await expect(page).toHaveURL('/login');
  });
}

test('unauthenticated user is redirected to /login when visiting a protected page', async ({
  page,
}) => {
  await page.goto('/map');
  await expect(page).toHaveURL('/login');
});
