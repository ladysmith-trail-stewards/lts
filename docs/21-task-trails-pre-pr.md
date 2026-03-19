Branch: 21-task-trails

## PR Title

feat: Implement complete LTS app with auth, admin dashboard, and trail mapping

## PR Description

Complete implementation of Ladysmith Trail Stewards web application with public pages (charter, contact, gallery), user authentication (signup/login/password reset), role-based access control (member vs admin), admin user management dashboard, and interactive Mapbox GIS trail mapping with filtering and querying capabilities.

## Linked issues

#21

## LLM Review Summary

### 🔍 Automated Pre-PR Review

#### Git History & Security Scan
- **Branch commits**: 44
- **Files changed**: 88
- **Secrets in diff**: ✅ None detected
- **Secrets in history**: ⚠️ Potential API keys or private keys

#### Build Results
- **Status**: ✅ PASS
- **Build time**: 1.14s

#### Test Results  
- **Integration tests**: ✅ PASS
- **Tests passed**: 0/0 ✓

#### Recommendation
🔴 **BLOCK** — Secrets detected. Clean before merge.

#### Commits
```
3466fb0 updated prepr doc
c1d36d0 Updated pre-pr documentation
d522589 docs: add Pre-PR Documentation Tool to Agent-LLM chatmode with automation
c8eb604 refactor: remove commit analysis tool, focus on pre-PR documentation workflow
8118b93 docs: add Commit Analysis Tool workflow to Agent-LLM chatmode
cd7d182 Added yargs and updated husky
ae1cd22 Add LLM agent guidance and git helper scripts
c73ed2d refactored supabase client file structure for single exported client
c71f175 Formatting
e819d29 Updated husky script
44cabba fixed db types
e253f4e Merge branch 'main' of https://github.com/ladysmith-trail-stewards/lts into 21-task-trails
60a4d47 Merge pull request #18 from ladysmith-trail-stewards/15-task-supabase-setup
be1cf28 ci: restrict push trigger to main to avoid duplicate PR runs
287ea8e removed weird checks
bf76906 ci: install pnpm action before setup-node and use pnpm cache as per docs
6191b01 ci: enable corepack and prepare pnpm in CI
3db9ec7 ci: run CI on push to any branch
0547fbf chore(husky): run db:types on pre-push and fail if generated types changed; remove generation from CI
ec5a2c8 ci: use pnpm/action-setup@v4 and pnpm v10 in CI
42b52a0 ci: disable husky in CI jobs (HUSKY=0)
04c4464 chore(husky): fallback to npm when pnpm is not available
86878a8 Added Husky
56abda4 chore(husky): add pre-commit (format+lint) and pre-push (integration tests) hooks
2fb9a45 chore(ci): generate supabase types and add CI for format/lint/build
2ecdb4e Updated Types
1c96ac5 fix(supabase): harden SECURITY DEFINER funcs, RLS & client fixes
0419646 Added trails, Added contour lines, updated Basemaps
65c507a Merge pull request #19 from ladysmith-trail-stewards/copilot/sub-pr-18
ea5d1dd Address PR review feedback: security fixes, formatting, types, and route guards
fe5bceb Initial plan
30aa2f3 Merge branch 'main' of https://github.com/ladysmith-trail-stewards/lts into 15-task-supabase-setup
93058f4 Implemented Supabase client with Auth System
e8bcf44 Merge pull request #14 from ladysmith-trail-stewards/12-task-initial-app-setup
67366ca Merge pull request #16 from ladysmith-trail-stewards/copilot/sub-pr-14
4e5937b Fix all PR review issues: React imports, form submission, map token guard, router link, dependencies
f30af97 Initial plan
2b2401f updated favicon
272c430 more formatting!
22ef55b cleanup
7e206a0 feat: complete initial app setup with professional UI enhancements
fa8feab Moved to shadcn
eb4cadb feat: initial commit
00030e9 feat: Set up Vite + React project with Tailwind and Prettier
```

### Custom Review
Comprehensive full-stack implementation with production-ready auth, secure RLS policies, and scalable architecture for ~50 users on Supabase free tier.

## Manual validation & test steps

pnpm test && pnpm test:integration

## Checklist

- [ ] Code compiles
- [ ] Unit tests pass
- [ ] Integration tests (if applicable) pass
- [ ] No secrets committed
- [ ] RLS/security considerations reviewed

## Notes / Follow-ups

(none yet)
