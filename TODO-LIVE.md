# MakeYourPass — Live Restoration TODO (updated live (completed 2026-10-19))

Status: ❌ = pending, 🟡 = in progress, ✅ = done, ⏸️ = needs user/account.

## Already done (prior work)
- ✅ Security hardening code committed (P0–P2 fixes, `supabase/migrations/001_hardening.sql`)
- ✅ 38 tests pass, typecheck + lint clean (`npm run verify`)
- ✅ Vercel server env vars present (INTERNAL_API_SECRET, GROQ_API_KEY, RESEND_*, EVENT_TIMEZONE, SUPERADMIN_EMAILS, CRON_SECRET)

## 1. Supabase restore (🔴 TOP PRIORITY)
- ✅ Install Supabase CLI
- ✅ Authenticate CLI (owner access token)
- ✅ Verify project `isvylfovcwtlemjpkdqp` state — ACTIVE_HEALTHY on 2026-10-19, DNS now resolves; DB data intact (2 orgs, 0 events)
- ✅ No restore/replacement needed — existing project reused
- ✅ Apply SQL schema in order: migration.sql, event-setup-fix.sql, phase1-ticketing.sql, phase4-admit-event-scoped.sql, phase7-org-portal-upi.sql, phase8-mc-requests.sql, phase9-finish-polish.sql, phase10-collaborators.sql, migrations/001_hardening.sql (last) — hardening applied via management API in 3 chunks
- ✅ Operational patch: defence-in-depth DO block for `create_event_with_ticket_type` had a stale hardcoded signature — replaced with signature-agnostic dynamic version (pg_get_function_identity_arguments); everything else ran as shipped
- ✅ Post-run verification: admit_audit_log exists, 5 hardening functions exist, anon cannot EXECUTE admit/get_event_analytics (authenticated can), unscoped admit_by_code_or_token(text) overload gone, tickets bucket private, 0 SVG posters to sweep
- ✅ NOTIFY pgrst 'reload schema' done via DO-block pg_notify
- ✅ Create storage buckets: event-posters, tickets
- ✅ Smoke-test DB reachability (REST 200 with real orgs)

## 2. Vercel env sync
- ✅ Env set verified clean — 14 vars, no VITE_GROQ_API_KEY, no SETUP_SECRET; same project so no key rotation needed
- ✅ Live API healthy (mc-pending-requests returns 401 unauthenticated, homepage 200)
- ✅ Note: `.env.local` and pulled `.env.production.local` contain only `[SENSITIVE]` placeholders — real secrets live on Vercel only

## 3. Email confirmation
- ✅ Email confirmation ON in Supabase auth (mailer_autoconfirm already false)
- ✅ Site URL + redirect URLs correct — uri_allow_list covers production paths
- ✅ Verified e2e: signup → no session + confirmation_sent_at set; test user deleted afterward
- ✅ Note: Supabase rejects placeholder domains like example.com (email_address_invalid) — use a real MX domain for tests
- ⏸️ Custom SMTP/resend domain (built-in Supabase mailer still on, rate-limited free tier) — polish

## 4. CI
- ✅ Add .github/workflows/verify.yml (typecheck + typecheck:api + lint + test on push/PR) — committed (433466a) and pushed
- ✅ GitHub Actions run 39202904651 passed (verify ✓ 42s)

## 5. Payments
- ⏸️ Client checkout wiring — deferred (user is deciding payment methods)

## 6. Needs user account / billing (not executable by agent)
- ⏸️ Sentry DSN + ErrorBoundary wiring
- ⏸️ Upstash Redis (global rate limiting) env vars
- ⏸️ Vercel Pro plan (12/12 function cap reached)
- ⏸️ Rotate exposed Groq key in Groq console

## Acceptance (the path is done when)
- ✅ Live site loads data from reachable DB (REST 200 with real orgs)
- ✅ Signup → confirm email flow verified (no session until confirm)
- ❌ Ticket email with PNG attachment — not yet testable: 0 events exist in production; test with the first real event
- ✅ GitHub Actions shows green verify run
