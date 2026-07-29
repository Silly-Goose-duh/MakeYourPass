# MakeYourPass

**Campus event platform** — org portals, ticketing, QR check-in, live host dashboard.

**Live:** https://makeyourpass.vercel.app  
**GitHub:** https://github.com/Silly-Goose-duh/MakeYourPass

---

## Phase 1 (shipped) — product core

### Auth & orgs
- Sign up / sign in / forgot password (Resend recovery links)
- Existing accounts can request an org without re-registering
- Post-login: approved club → `/{slug}`; pending → wait screen; never forced back into signup loop
- Superadmin MC: approve/reject requests, orgs list, users, events
- Approval email: “your portal is live” + create-event CTA
- Collaborators: invite by email as **host** (scan/admit) or **admin**

### Club portal `/{slug}`
- Public events rails + execom sidebar
- Admin: **Edit profile** (name, tagline, logo)
- Contact strip: email, phone, WhatsApp, website, Instagram
- Team photos upload → circular icons (storage policies fixed)
- **Add member** pinned in execom header (no scroll to bottom)
- UPI settings for paid events
- Host **Live** + **Scan** shortcuts

### Ticketing & ops
- Registration → unique code + QR token + ticket PNG generation
- Resend ticket, T-24h reminder path (reachout cron)
- Scan-to-admit (camera + manual code)
- Live registrant dashboard + seats left
- Certificates / end-event / reachout (existing)

### Reliability polish (audit)
- Error boundaries: **Try again / Go home / Reload** (per-page + app)
- No React-DOM mutation on broken images (avatars)
- HostRoute never infinite-spins when logged out
- Storage RLS for `event-posters` (logos, execom, UPI QR)
- `get_organizations_with_counts` ambiguous-`id` fix

---

## Stack
- React + TypeScript + Vite
- Tailwind CSS + Framer Motion
- Supabase (Auth, Postgres, Storage, RLS)
- Resend (transactional email)
- Vercel (SPA + `api/*` serverless, Hobby ≤12 functions)

## Local dev

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev
```

### Server env (Vercel)
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, optional `CRON_SECRET` / `SETUP_SECRET`

### Database
SQL under `supabase/` — apply via linked CLI when possible:

```bash
supabase db query --linked -f supabase/phase1-ticketing.sql
# … phase4, phase9, phase10, fix-*.sql, org-contact-fields.sql, etc.
```

## Scripts
| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run lint` | ESLint |
| `npx vercel --prod --yes` | Deploy |

## Phase 1 intentionally deferred
- Verified custom sending domain (Resend sandbox limits delivery)
- Real-device camera QA matrix
- Orphan `EventBuilder` page (not routed; CreateEvent is live path)
- Full rate limiting / abuse controls
- og:image PNG polish, Vercel project rename

## License
Private / campus use.
