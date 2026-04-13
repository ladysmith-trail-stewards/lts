import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  signedInClient,
  serviceClient,
} from '../../db_services/supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../../db_services/testSuite';

const P = '__jwt_claims_test__';

let suite: BuiltTestSuite;

/** Decode the payload of a JWT without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('JWT claims — user_role', () => {
  it('pending JWT has user_role = pending', async () => {
    const client = await signedInClient(
      suite.pending.email,
      suite.pending.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('pending');
  });

  it('user JWT has user_role = user', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('user');
  });

  it('super_user JWT has user_role = super_user', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('super_user');
  });

  it('admin JWT has user_role = admin', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('admin');
  });

  it('super_admin JWT has user_role = super_admin', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('super_admin');
  });
});

describe('JWT claims — region_id', () => {
  it('user JWT contains region_id', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.region_id).toBe(suite.regionId);
  });
});

describe('JWT claims — is_admin', () => {
  it('is_admin = false for pending', async () => {
    const client = await signedInClient(
      suite.pending.email,
      suite.pending.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = false for user', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = false for super_user', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = true for admin', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(true);
  });

  it('is_admin = true for super_admin', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(true);
  });
});

describe('JWT claims — soft-deleted profile fallback', () => {
  it('user_role = pending after profile is soft-deleted', async () => {
    const throwawayEmail = `i_test_${P.replace(/[^a-z0-9]/gi, '_').toLowerCase()}softdelete@test-fixture.invalid`;
    const throwawayPassword = 'fixture-password-123';

    const { data: created } = await serviceClient.auth.admin.createUser({
      email: throwawayEmail,
      password: throwawayPassword,
      email_confirm: true,
    });
    const authUserId = created.user!.id;

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    await serviceClient
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', profile!.id);

    const client = await signedInClient(throwawayEmail, throwawayPassword);
    const { data: session } = await client.auth.getSession();
    const payload = decodeJwtPayload(session.session!.access_token);

    await serviceClient.auth.admin.deleteUser(authUserId);

    expect(payload.user_role).toBe('pending');
  });
});
