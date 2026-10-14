# Security Hardening Report — 14 October 2026

Full market-readiness audit and remediation pass on MakeYourPass.

- **Repo:** https://github.com/Silly-Goose-duh/MakeYourPass (branch `master`)
- **Commit before:** `d8b20fb` — *fix(swarm-audit): 16 real bugs across auth/ticketing/scan/org*
- **Commit after:** see the log entry `security: close P0-P2 audit findings` on `master`
- **Diff:** 34 files changed, +5063 / −854 (11 new, 22 modified, 1 deleted)
- **Live site:** https://makeyourpass.vercel.app

> ⚠️ **Nothing here is effective until you apply the SQL migration.** See
> [Required manual steps](#required-manual-steps). Until `supabase/migrations/001_hardening.sql`
> is run, every P0 Postgres fix is inert and the platform is still exploitable
> with nothing but the public anon key.

---

## 1. Why this pass happened

The repo had been shipped and iterated for ~2 months (156 commits). A full read of
all 12 serverless functions, 19 SQL files and the client data layer found that the
most valuable-looking features — QR check-in, ticket generation, analytics — had
**no authorization at all**. Several were reachable anonymously using only the anon
key that Vite inlines into the public JS bundle.

The headline finding: `admit_registration` and `admit_by_code_or_token` were
`SECURITY DEFINER` functions granted to `anon`, containing **no auth check**, with
an **optional** event-scope parameter. Omitting it admitted a ticket from any event
on the platform and returned the attendee's name. Because `unique_code` is a
sequential counter (`EVT-0001`, `EVT-0002`, …), a single unauthenticated script could
enumerate and dump every attendee's name across every event — and simultaneously
sabotage check-in at the door.

---

## 2. Findings and fixes

### 🔴 P0 — exploitable by anyone, today

| # | Flaw | Fix |
|---|---|---|
| 1 | **Check-in open to anonymous users.** Admit RPCs were `SECURITY DEFINER`, granted to `anon`, no auth check, optional event scope. Platform-wide attendee enumeration + check-in sabotage. | Unscoped overloads dropped. Both functions now require `auth.uid()`, verify `organization_members` role in (`admin`,`host`) or superadmin, and require `p_event_id`. Grants reduced to `authenticated` only. Client signature made non-optional so an unscoped call is a *compile* error. |
| 2 | **Analytics readable by anyone.** `get_event_analytics` was `SECURITY DEFINER` + granted to `anon` — response counts and free-text answers for any event. | Same org-scoping guard; anon grant revoked. |
| 3 | **Unauthenticated email relay.** `POST /api/on-registration` accepted `{action:'product-report'\|'next-steps'\|'agent-vault-investor-brief'}` with no auth, no secret, no rate limit, mailing a hardcoded personal address. (~160 lines, including an embedded unrelated investor brief.) | Branch deleted entirely. |
| 4 | **Ticket generation & resend had no auth.** `{registration_id, force:true}` let anyone regenerate or re-send any attendee's ticket; `force` bypassed the `email_sent_at` guard, enabling unbounded email bombing billed to us. | Both require a bearer token **and** org `admin`/`host` membership. Server-to-server calls use a shared internal secret. |
| 5 | **Payments trivially bypassable.** `create-order` took `amount` from the client (₹1 order for a ₹5000 event). `verify-payment` only checked an HMAC — never confirming capture or amount — and compared signatures with `===`. | Amount resolved server-side from `events.price`. Verification fetches the payment and order from Razorpay, asserts `captured`, matches the order id, re-reads the authoritative price, and is idempotent. `crypto.timingSafeEqual` with a length guard. |
| 6 | **Host routes had no guard.** `/host/:eventId/scan` and `/host/:eventId/dashboard` were mounted with no protection — while a fully-implemented `HostRoute` component sat unused in `RouteGuards.tsx`. | Both routes now mount through `HostRoute`. |

### 🟠 P1 — data exposure and abuse

| # | Flaw | Fix |
|---|---|---|
| 7 | `tickets` bucket was **public** at the predictable path `tickets/{event_id}/{registration_id}.png`, leaking attendee names. | Bucket private; reads scoped to the owning org; served via a 2-minute signed URL from a new `/api/ticket-image`. |
| 8 | Any **signed-in** user could INSERT/UPDATE/DELETE in the `tickets` bucket — overwriting or deleting another attendee's QR PNG. | Policy dropped. Tickets are produced only by the service-role pipeline. A guard `DO` block raises if a ticket write policy ever reappears. |
| 9 | `event-posters` allowed `image/svg+xml` on a public bucket → **stored XSS** (an org admin uploads an SVG with `<script>`, served from the Supabase origin). | SVG removed from the allow-list. |
| 10 | The **only** rate limit was client-side in `PublicEventForm` — bypassed by one `curl` loop. | Server-side limiter on every public/abusive endpoint (Upstash Redis, in-process fallback that fails open). |
| 11 | Public ticket-resend returned 404 vs 200 — an **email enumeration oracle**. | Uniform 200 response, send performed silently, rate limit applied *before* the lookup. |
| 12 | Host blast interpolated the message into email HTML unescaped — an org admin could inject arbitrary markup into mail sent **from our domain** to every registrant. A phishing primitive. | Name, body and subject escaped; CR/LF stripped from the subject. |
| 13 | `VITE_GROQ_API_KEY` was inlined into the browser bundle by Vite — publicly extractable. | Groq moved behind an authenticated serverless proxy; key read only from `process.env`. |
| 14 | `/api/poster-theme` was **unauthenticated and unthrottled**, and server-side-fetched any caller-supplied `imageUrl` — **SSRF**, including cloud metadata (`169.254.169.254`). | Kept anonymous (the public registration form depends on it) but rate-limited per IP, SSRF-validated, output-checked, errors genericised. |
| 15 | `api/setup-storage.ts` still deployed despite its own comment saying to remove it. | Deleted; storage policies now ship as SQL. |
| 16 | Handlers returned raw `err.message`, leaking Supabase internals. | All errors genericised; detail logged server-side only. |
| 17 | Every endpoint sent `Access-Control-Allow-Origin: *`. | CORS locked to `APP_ORIGIN`. |
| 18 | **Seat capacity desynced from the counter.** Capacity was decided from the monotonic `registration_counter`, so cancelled seats never reopened, and the UI could advertise free seats while waitlisting everyone. | Capacity derived from the live `confirmed` count under a `FOR UPDATE` row lock; `promote_from_waitlist()` auto-promotes on cancellation. |
| 19 | Admit RPCs special-cased `waitlisted` but not `cancelled` — cancelled tickets could be admitted. | `cancelled` refused with a distinct status. |
| 20 | **Hardcoded superadmin grant.** Signup auto-granted platform admin to a literal gmail address, with Supabase email confirmation off — anyone who knew the address could register with it. | Moved to the `SUPERADMIN_EMAILS` env var (legacy address retained as default so the owner isn't locked out). |

### 🟡 P2 — would not survive real volume

| # | Flaw | Fix |
|---|---|---|
| 21 | The T-24h cron and host blast looped sequentially under a 60s function cap, making a nested HTTP call per recipient (which itself uploaded to storage, rendered a PNG and called Resend). Past ~50 attendees the function timed out mid-loop, and partial failures caused re-runs to double-send. | Resend batch API (chunks of 100), a 45s budget, atomic claim-and-stamp per recipient with release-on-failure. Re-runs are safe and never double-send. |
| 22 | The cron computed "tomorrow" with `Date.UTC(...)` — the **UTC** calendar day. At 02:30 IST it selected the wrong date and reminders landed a day early/late. | Timezone-aware via `EVENT_TIMEZONE` (default `Asia/Kolkata`), implemented with calendar arithmetic so DST cannot shift it. **12 unit tests** cover the exact regression. |
| 23 | No tests existed, and `npm run build` never typechecked `api/` — 4 pre-existing type errors were invisible. | Vitest suite; `typecheck:api` added and wired into `npm run verify`; all 4 latent errors fixed. |

---

## 3. Required manual steps

These require access I do not have. **Steps 1 and 2 are blockers.**

### 🔴 1 — Apply the SQL migration

Supabase dashboard → project → **SQL Editor** → paste all of
`supabase/migrations/001_hardening.sql` → **Run**. Then:

```sql
NOTIFY pgrst, 'reload schema';
```

(PostgREST caches function signatures; without the notify the new grants are not
enforced yet.) Or: `supabase db query --linked -f supabase/migrations/001_hardening.sql`

The script is idempotent and self-contained (1105 lines; execution order documented
in its footer).

### 🔴 2 — Vercel environment variables

| Variable | Required? | Notes |
|---|---|---|
| `INTERNAL_API_SECRET` | **yes** | Server-to-server secret. **Without it the anonymous registration funnel still emails, but the ticket PNG is not attached** (response carries `ticket_error`). `openssl rand -hex 32` |
| `APP_ORIGIN` | recommended | e.g. `https://makeyourpass.vercel.app`. Locks CORS. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | recommended | Without these the rate limiter is per-lambda-instance and weak against a distributed flood. Free tier at console.upstash.com. |
| `EVENT_TIMEZONE` | recommended | e.g. `Asia/Kolkata`. Fixes reminder dates. |
| `SUPERADMIN_EMAILS` | recommended | Addresses auto-granted `/mc` admin on signup. |
| `GROQ_API_KEY` | yes (AI) | **Rotate it** — the old one was public in the JS bundle. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | yes (paid events) | |
| `CRON_SECRET` | yes | Protects manual cron invocation. |

Also: **delete `VITE_GROQ_API_KEY`** if it still exists, **delete `SETUP_SECRET`**,
and turn **email confirmation ON** in Supabase.

### 🟠 3 — One-off cleanups

- **Sweep pre-existing SVG posters** (the MIME allow-list only blocks *new* uploads):
  ```sql
  select name from storage.objects
   where bucket_id = 'event-posters' and lower(name) like '%.svg';
  ```
  Delete those objects and clear the matching `events.poster_url` values.
- **Rebalance existing waitlists** with `select public.promote_from_waitlist('<event_id>');`

---

## 4. Verification performed

```
npm run verify          # typecheck + typecheck:api + lint + tests — all pass
  ✓ 38 tests passed (3 files)
  ✓ 0 TypeScript errors (src + api, strict)
  ✓ 0 lint errors, 0 warnings

npx vercel build        # Build completed successfully
  ✓ 12 / 12 functions  (Hobby cap)
```

A pre-change baseline was built from `git archive HEAD` first, so the green result
is a genuine no-regression comparison rather than an assumption.

Also verified:
- No secrets (`gsk_`, `rzp_live_`, JWTs, private keys) in the client bundle or in any
  file staged for commit.
- `api/_lib/*` is bundled *inside* each function and is **not** counted against the
  Hobby function cap (confirmed from `.vercel/output/functions`, which contains
  exactly 12 `.func` directories).

### Smoke test after deploying

1. Sign up → request an org → approve as superadmin → land on `/{slug}`.
2. Create an event, register from a **logged-out** browser, confirm the ticket email
   **arrives with a PNG attachment**.
3. Open `/host/<eventId>/scan` **while signed out** → must redirect to `/login`.
4. Open it as an org host → scan the QR → admitted.
5. Re-scan the same QR → "already admitted".
6. Cancel a registration, scan its QR → must be refused as **cancelled**.
7. View a ticket from the host dashboard → must open via a signed URL.
8. Fill an event to capacity, cancel one → the waitlist must **auto-promote**.

---

## 5. Structural changes to be aware of

- **New `api/_lib/`** — `http.ts` (CORS/errors/validation/escaping), `authz.ts`
  (bearer resolution + org membership), `rateLimit.ts`. Dependency-free and
  dynamically imported inside handlers, per a hard-won constraint documented in
  `generate-ticket.ts` about the Vercel function bundler.
- **`/api/groq` merged into `/api/poster-theme`** behind `action: 'chat' | 'theme'`.
  Vercel Hobby caps a deployment at 12 functions and the project was at the ceiling.
- **`admit_audit_log`** created (RLS on, no policies — service role / SQL only).
- **`api/generate-ticket.ts`** now stores a storage *path* in `event_responses.ticket_url`
  instead of a public URL, since the bucket went private. Legacy `http…` values are
  handled and migrated on regeneration.
- **`api/setup-storage.ts`** deleted.

---

## 6. Known remaining risk

- **You are at exactly 12 of 12 Vercel Hobby functions.** Deployment works today, but
  **the next endpoint added will fail the build.** Merge it into an existing function
  behind an `action` discriminator, or upgrade the plan.
- **Rate limiting without Upstash is per-instance**, not global. Set the vars before
  public launch.
- **Email confirmation is off in Supabase** — any address can be registered and used
  immediately, including one in `SUPERADMIN_EMAILS`.
- **The cron and host blast still run inside a 60s function.** They now batch and
  stamp per-recipient so re-runs are safe, but a very large blast should be driven
  from a queue.
- **No error monitoring.** `ErrorBoundary` exists but reports nowhere. Add Sentry
  before real-money paid events.
- **No CI.** `npm run verify` must be run manually; wire it to GitHub Actions.
- **`/api/generate-certificate` is authenticated but still orphaned** — no client
  calls it and it writes to a `certificates` bucket that may not exist. Wire it up
  or delete it.
- `EventBuilder.tsx` (~64 KB) and `useColorExtractor.ts` remain dead, unrouted code.
- `admit_audit_log` has no read policy; add a superadmin SELECT policy if the MC
  panel should display it.

---

## 7. Where to look next time

| File | Purpose |
|---|---|
| `SECURITY.md` | Standing deploy runbook and the full flaw→fix table. **Read before deploying.** |
| `supabase/migrations/001_hardening.sql` | The migration. Header explains scope, footer documents execution order and what was deliberately left alone. |
| `api/_lib/` | Shared server helpers; start here to understand auth/CORS/rate-limit conventions. |
| `tests/` | The 38 tests; each file's comments explain which historical bug it pins. |
| `.env.example` | Every new server var, with the reason it exists. |
| `PRODUCTION.md` | Original 2026-07-22 handoff, kept as history. **Superseded by `SECURITY.md`.** |
