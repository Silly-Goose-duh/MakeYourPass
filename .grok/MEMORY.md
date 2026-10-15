# MakeYourPass — session memory

## Owner / accounts
- **GitHub**: https://github.com/Silly-Goose-duh (account `Silly-Goose-duh`)
- **Repo**: https://github.com/Silly-Goose-duh/MakeYourPass (branch `master`)
- **Vercel**: team `silly-gooses-projects`, project `campuspass` (projectId `prj_2Gk18jb3A197uZynpr3IBvjLoBt6`)
- **Live aliases** (all point at the same production deployment):
  - https://makeyourpass.vercel.app (primary — used in OG tags)
  - https://mec-campuspass.vercel.app
  - https://makeyourpass-app.vercel.app
  - https://campuspass-silly-gooses-projects.vercel.app
  - https://campuspass-silly-goose-duh-silly-gooses-projects.vercel.app
- **Supabase project**: `isvylfovcwtlemjpkdqp` — ⚠️ **NOT currently linked** (`supabase/.temp/`
  is empty). `supabase db query --linked` will fail until `supabase link` is run with a
  personal access token.
- **Default browser**: Chrome (`ChromeHTML`)

## Deploy rule
All product changes must be pushed to `master` / deployed with `vercel --prod` so production stays live-updated.

## 🔴 BLOCKER (found 2026-10-15) — Supabase project is gone
`isvylfovcwtlemjpkdqp.supabase.co` returns NXDOMAIN from every resolver tried
(local + the Vercel function in bom1). A paused project still resolves, so the
project has been **deleted / renamed / torn down**. The whole app is
non-functional until it is restored or replaced — the SPA calls Supabase
directly, so this is not only a serverless-API problem.

Confirmed with `vercel logs`, which showed:
`getaddrinfo ENOTFOUND isvylfovcwtlemjpkdqp.supabase.co (ENOTFOUND)`

If a new project is created, re-apply the schema in this order:
`migration.sql` → `event-setup-fix.sql` → `phase1-ticketing.sql` →
`phase4-admit-event-scoped.sql` → `phase7-org-portal-upi.sql` →
`phase8-mc-requests.sql` → `phase9-finish-polish.sql` →
`phase10-collaborators.sql` → **`supabase/migrations/001_hardening.sql`**.
Then create the `event-posters` and `tickets` buckets, update the three Supabase
env vars on Vercel, and re-run `npm run doctor`.

## Security state (updated 2026-10-15)
- **`SECURITY.md` is the source of truth** for the deploy runbook and what still needs a human.
- **`supabase/migrations/001_hardening.sql` has NOT been applied** to any database yet.
  The audit migration is what closes the P0 holes; it must be the last one applied
  in the re-apply order above.
- `VITE_GROQ_API_KEY` deleted from Vercel (Production + Development). The Groq key
  was publicly readable in the JS bundle for ~3 months and **still needs rotating**.
- `/api/setup-storage` is **deleted**. Storage policies ship as SQL instead.
- Storage buckets: `event-posters` (public, **no SVG**), `tickets` (**private**, served via
  signed URLs).
- CORS is locked to `APP_ORIGIN` (comma-separated list, because of the 5 aliases above).
- **`api/_lib/*` must stay inlined in each handler.** `await import('./_lib/...')`
  crashes every Vercel function at init (`FUNCTION_INVOCATION_FAILED`). This
  happened for real on 2026-10-15 and took the whole API down. `api/_lib/` is
  kept only as the canonical copy for the unit tests.

## Pre-deploy checklist (do not skip)
```
npm run verify   # typecheck + typecheck:api + lint + tests
npm run doctor   # env vars, Supabase DNS+REST, leaked keys, function budget
vercel --prod
# THEN smoke-test the deployed URL with real HTTP requests
```
A green `vercel build` is **not** sufficient evidence — it passed while the
entire API was broken.

## Notes
- Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_*`, `GROQ_API_KEY`, `INTERNAL_API_SECRET`,
  `CRON_SECRET`) live only on Vercel Production.
- Client `VITE_*` vars re-synced from `.env.local` on 2026-07-22.
- **`INTERNAL_API_SECRET` is required** for the anonymous registration funnel to attach a ticket
  PNG. It falls back to `CRON_SECRET`, which is set, so this works — but set it explicitly.
- Rate limiting uses an in-process map until `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set.
- **Vercel function count is 12/12 (Hobby cap).** Adding a 13th endpoint fails the build —
  merge into an existing function behind an `action` discriminator instead.
- Verify before pushing: `npm run verify` (typecheck + typecheck:api + lint + tests).
