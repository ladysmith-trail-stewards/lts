/**
 * Thrown when the DB detects that the caller's JWT role claim no longer matches
 * their live profile role (errcode: stale_jwt).
 *
 * Consumers should catch this and call `auth.handleStaleSession()` from
 * AuthContext, which triggers a session refresh. If the session has been
 * revoked, Supabase fires SIGNED_OUT and AuthContext redirects to /login.
 */
export class StaleSessionError extends Error {
  constructor() {
    super('Your session is out of date. Please log in again.');
    this.name = 'StaleSessionError';
  }
}
