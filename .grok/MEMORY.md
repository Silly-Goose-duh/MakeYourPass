# MakeYourPass — session memory

## Owner / accounts
- **GitHub**: https://github.com/Silly-Goose-duh (account `Silly-Goose-duh`)
- **Repo**: https://github.com/Silly-Goose-duh/MakeYourPass (branch `master`)
- **Vercel**: logged in as `silly-goose-duh`, project `campuspass`
- **Live**: https://makeyourpass.vercel.app (aliases: mec-campuspass, makeyourpass-app)
- **Supabase project**: `isvylfovcwtlemjpkdqp` (linked in `supabase/.temp/`)
- **Default browser**: Chrome (`ChromeHTML`)

## Deploy rule
All product changes must be pushed to `master` / deployed with `vercel --prod` so production stays live-updated.

## Notes
- Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_*`, `GROQ_API_KEY`) live only on Vercel Production.
- Client `VITE_*` vars re-synced from `.env.local` on 2026-07-22.
- Storage buckets `event-posters` + `tickets` created via `/api/setup-storage` (remove after use).
