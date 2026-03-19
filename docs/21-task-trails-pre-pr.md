# Pre-PR Draft for 21-task-trails

## PR Title

Setup Ladysmith Trail Stewards web app with Supabase backend and interactive mapping

## PR Description

Complete initial project setup including:
- React 19 + Vite + TypeScript 5.9 build configuration
- Tailwind CSS 4 + shadcn/ui component library
- Supabase backend with PostgreSQL 17, auth, RLS policies
- Public-facing pages: home, charter, contact, gallery
- Authenticated member/admin routes with role-based access control
- Interactive Mapbox GL JS trail mapping with react-map-gl
- Admin dashboard for user management
- Integration tests for database queries and RLS enforcement
- Pre-commit hooks with formatting and linting
- Pre-PR documentation workflow

## Linked issues

closes: #14, #16, #18, #19

## Tasks this PR addresses

#14 - Core framework setup; #16 - Backend and auth; #18 - Trail mapping; #19 - Admin dashboard and user management

## LLM Review Summary

### ✅ Strengths

1. **Security-first RLS implementation**: 10 integration tests verify Row-Level Security across profiles, permissions, and trails tables. Admin bypass prevention confirmed.
2. **Environment management**: Secrets properly gated (no `.env` committed, only `.env.example` with templates). `VITE_SUPABASE_SECRET_KEY` correctly marked "tests only, never in browser."
3. **Auth guards**: RequireAuth and RequireAdmin components correctly check session JWT via Supabase client before rendering protected routes.
4. **Responsive validation**: Password confirmation, email validation, and error handling on login/signup pages.
5. **GIS-appropriate design**: Trail restriction levels (`public|user|admin_only`) match org scope. RPC-based queries enforce access control server-side.
6. **Test coverage**: 42 integration tests pass, covering DB initialization, RLS policies, permission elevation prevention, and trail visibility.

### ⚠️ Observations (Non-blocking)

1. **Bundle size warning** (2.3 MB JS, 662 KB gzip): Expected for initial setup with Mapbox + react-map-gl. Monitor for code-splitting opportunities (dynamic imports) if needed.
2. **No unit tests**: Only integration tests present. Consider adding component unit tests (e.g., Login form validation) as product matures.
3. **Trail filtering at RPC level**: Currently all restrictions handled server-side via `get_trails()` RPC—good for security. Document client-side filtering strategy if admin UI needs to show hidden trails.
4. **Email confirmation flow**: `AuthConfirmPage` expects deep-link from email. Ensure SMTP/email provider is configured in Supabase before production.
5. **Mapbox token fallback**: MapPage gracefully handles missing token, but consider this in staging/CI environment setup.

### 🔒 Security Checks Passed

- ✅ No secrets in git history  
- ✅ Service role key not exposed in browser code  
- ✅ RLS policies tested and enforced  
- ✅ Auth flow validates user before rendering admin routes  
- ✅ Password minimum/confirmation enforced on signup  
- ✅ `.env` properly gitignored

## Manual validation & test steps

pnpm install && pnpm run build && pnpm test && pnpm test:integration

## Checklist

- [x] Code compiles
- [x] Integration tests pass (42 tests)
- [x] No secrets committed
- [x] RLS/security considerations reviewed
- [ ] Supabase SMTP configured for email confirmations
- [ ] Mapbox token obtained and .env.example verified with team
- [ ] Reviewed for bundle size post-merge (consider code-splitting)
- [ ] Test on staging with real auth flow (sign up → email confirmation → login)
- [ ] CI/CD pipeline tested (.github/workflows/ci.yml)

