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

## Security state (updated 2026-10-15)
- **`SECURITY.md` is the source of truth** for the deploy runbook and what still needs a human.
- **The Postgres hardening is NOT applied yet.** `supabase/migrations/001_hardening.sql` must be
  run in the Supabase SQL Editor, followed by `NOTIFY pgrst, 'reload schema';`. Until then the
  P0 fixes are inert and the platform is still exploitable.
- `VITE_GROQ_API_KEY` has been **deleted** from Vercel (Production + Development). The Groq key
  was publicly readable in the JS bundle for ~3 months and **still needs rotating** in the Groq
  console.
- `/api/setup-storage` is **deleted**. Storage policies ship as SQL instead.
- Storage buckets: `event-posters` (public, **no SVG**), `tickets` (**private**, served via
  signed URLs).
- CORS is locked to `APP_ORIGIN` (comma-separated list, because of the 5 aliases above).

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
