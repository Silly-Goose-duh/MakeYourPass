# MakeYourPass — Security Hardening & Deploy Runbook

Written after the full market-readiness audit. **Read this before deploying.**

The lower half of `PRODUCTION.md` is the original (2026-07-22) handoff and is
kept as historical context. Several of its "needs fixing" items are now fixed —
this file is the current source of truth.

---

## 1. What was wrong, and what changed

| # | Severity | Flaw | Fix |
|---|----------|------|-----|
| 1 | 🔴 P0 | `admit_registration` / `admit_by_code_or_token` were `SECURITY DEFINER` + `GRANT`ed to `anon`, with **no auth check** and an **optional** event-scope param. Omitting it admitted a ticket from any event. `unique_code` is sequential (`EVT-0001`), so anyone with the public anon key could enumerate and dump every attendee's name platform-wide, and sabotage check-in. | Unscoped overloads dropped; both functions now require `auth.uid()`, verify org `admin`/`host` membership, and require `p_event_id`. Grants reduced to `authenticated`. Every call audited. |
| 2 | 🔴 P0 | `get_event_analytics` was `SECURITY DEFINER` + granted to `anon` — anyone could read response counts and free-text answers for any event. | Same org-scoping guard; anon grant revoked. |
| 3 | 🔴 P0 | `POST /api/on-registration` accepted `{action:'product-report'\|'next-steps'\|'agent-vault-investor-brief'}` with **no auth, no secret, no rate limit** and mailed a hardcoded personal address. An unauthenticated open email relay burning Resend quota. | Branch deleted entirely. |
| 4 | 🔴 P0 | Ticket generation and ticket resend had **no authentication**. `{registration_id, force:true}` let anyone re-send or regenerate any attendee's ticket, and `force` bypassed the `email_sent_at` guard — unbounded email bombing. | Both now require a bearer token and org `admin`/`host` membership. |
| 5 | 🔴 P0 | Razorpay `create-order` took `amount` **from the client**, so a ₹1 order could be used to buy a ₹5000 ticket. `verify-payment` only checked an HMAC — never confirming the payment was captured or that the amount matched — and compared signatures with `===`. | Amount resolved server-side from `events.price`. Verification now fetches the payment + order from Razorpay, asserts `captured`, matches order id, re-reads the authoritative price, and is idempotent. `crypto.timingSafeEqual` with a length guard. |
| 6 | 🟠 P1 | `tickets` bucket was **public** at the predictable path `tickets/{event_id}/{registration_id}.png`, exposing attendee names. | Bucket made private; reads scoped to the owning org's admins/hosts; served through a 2-minute signed URL. |
| 7 | 🟠 P1 | `event-posters` allowed `image/svg+xml` on a public bucket — an org admin could upload an SVG with `<script>` served from the Supabase origin (**stored XSS**). | SVG removed from the allow-list. |
| 8 | 🟠 P1 | The only rate limit was **client-side** (`PublicEventForm`), bypassed by one curl loop. | Server-side limiter on every public/abusive endpoint (Upstash Redis, in-process fallback). |
| 9 | 🟠 P1 | Public ticket-resend returned 404 vs 200 — an **email enumeration oracle**. | Uniform 200 response; send happens silently. |
| 10 | 🟠 P1 | Host blast interpolated the message into email HTML unescaped — an org admin could inject arbitrary markup into mail from your domain to every registrant (**phishing primitive**). | Name, body and subject escaped; CR/LF stripped from the subject. |
| 11 | 🟠 P1 | `VITE_GROQ_API_KEY` was inlined into the browser bundle by Vite. | Groq moved behind an authenticated serverless proxy; key read only from `process.env`. |
| 12 | 🟠 P1 | `api/setup-storage.ts` was still deployed despite its own comment saying to remove it. | Deleted; storage policies now ship as SQL. |
| 13 | 🟠 P1 | `api/poster-theme` was an **unauthenticated, unthrottled** AI endpoint that server-side-fetched any caller-supplied `imageUrl` (**SSRF**, incl. cloud metadata) and leaked upstream error text. | Kept anonymous (the public registration form needs it) but rate-limited per IP, SSRF-validated, output-checked, errors made generic. |
| 14 | 🟠 P1 | Handlers returned raw `err.message`, leaking Supabase internals. | All errors go through a generic `fail()`; detail is logged server-side only. |
| 15 | 🟠 P1 | Every endpoint sent `Access-Control-Allow-Origin: *`. | CORS locked to `APP_ORIGIN`. |
| 16 | 🔴 P0 | `/host/:eventId/scan` and `/host/:eventId/dashboard` had **no route guard** (a `HostRoute` component existed but was never mounted). | Both wrapped in `HostRoute`. |
| 17 | 🟠 P1 | Seat capacity was decided from the monotonic `registration_counter`, so cancelled seats never reopened and the UI could advertise free seats while waitlisting everyone. | Capacity now derived from the live `confirmed` count under a row lock; waitlist auto-promotion on cancel. |
| 18 | 🟠 P1 | Admit RPCs special-cased `waitlisted` but not `cancelled` — cancelled tickets could be admitted. | `cancelled` is refused with a distinct status. |
| 19 | 🟠 P1 | `tickets` bucket INSERT was open to **any** signed-in user, so a student could overwrite or delete another attendee's QR PNG. | Policy dropped; tickets are produced only by the service-role pipeline. |
| 20 | 🟡 P2 | The T-24h reminder cron and the host blast both looped sequentially under a 60s function cap, and the cron computed "tomorrow" in **UTC** — wrong calendar day for IST. | Batch API + time budget + per-recipient stamping; timezone-aware via `EVENT_TIMEZONE`. |
| 21 | 🟡 P2 | No tests; `api/` was never typechecked by the build. | Vitest suite + `typecheck:api` wired into `npm run verify`. |

---

## 2. Required manual steps (I cannot do these)

### 🔴 Blocker A — apply the SQL migration

Everything in the P0 list that lives in Postgres only takes effect once this runs.
**Until it runs, the app is still exploitable.**

1. Supabase dashboard → your project → **SQL Editor**
2. Paste the whole of `supabase/migrations/001_hardening.sql` → **Run**
3. Then, in the same editor:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
   (PostgREST caches function signatures; without this the new grants are not enforced yet.)

Or via the CLI:
```bash
supabase db query --linked -f supabase/migrations/001_hardening.sql
```

The script is idempotent and self-contained.

### 🔴 Blocker B — Vercel environment variables

Set in Vercel → Project → Settings → Environment Variables (mark all **Production**):

| Variable | Required? | Notes |
|---|---|---|
| `GROQ_API_KEY` | yes (if AI used) | **Rotate the old key.** It was public in the browser bundle. |
| `APP_ORIGIN` | recommended | e.g. `https://makeyourpass.vercel.app`. Locks CORS. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | recommended | Without these the rate limiter is per-instance and weak against a distributed flood. Free tier at console.upstash.com. |
| `EVENT_TIMEZONE` | recommended | e.g. `Asia/Kolkata`. Fixes reminder dates. |
| `INTERNAL_API_SECRET` | **required** | Server-to-server secret. Without it the anonymous registration funnel still emails, but the ticket PNG is **not** attached (the response carries `ticket_error`). Generate with `openssl rand -hex 32`. |
| `SUPERADMIN_EMAILS` | recommended | Addresses auto-granted `/mc` superadmin on signup. Was hardcoded in source; with email confirmation off that address was effectively a shared secret. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | yes (if paid events) | |
| `CRON_SECRET` | yes | Protects manual cron invocation. |
| `SETUP_SECRET` | **delete it** | The endpoint that used it is gone. |

Then **delete `VITE_GROQ_API_KEY`** if it still exists, and rotate that key.

### 🟠 Sweep previously-uploaded SVG posters

The new MIME allow-list only blocks *new* uploads. SVGs uploaded before the
migration are still publicly reachable and can still carry script:
```sql
select name from storage.objects
 where bucket_id = 'event-posters' and lower(name) like '%.svg';
```
Delete those objects and clear the matching `events.poster_url` values.

### 🟠 Reconcile existing waitlists

Capacity logic changed. Rebalance any event that is already over capacity:
```sql
select public.promote_from_waitlist('<event_id>');
```

### 🟠 Rotate anything that was exposed

- Groq key (was in the JS bundle).
- Consider rotating `SUPABASE_SERVICE_ROLE_KEY` if you are cautious — it was
  only ever server-side, so this is precautionary.

---

## 3. Verification before you ship

```bash
npm install
npm run verify     # typecheck + typecheck:api + lint + tests
```
Expected: all four steps pass. The test suite is `tests/` (Vitest, node
environment) and covers the CORS/error helpers, the rate limiter, and the
timezone maths behind the reminder cron.

Then smoke-test on a real device:
1. Sign up → request an org → approve as superadmin → land on `/{slug}`.
2. Create an event, register from a **logged-out** browser, receive the ticket email.
3. Open `/host/:eventId/scan` **while signed out** → must redirect to `/login`.
4. Open it as an org host → scan the QR → admitted.
5. Re-scan the same QR → "already admitted".
6. Cancel a registration, then scan its QR → must be refused as cancelled.
7. View a ticket from the host dashboard → must open via a signed URL.
8. Hit an event at capacity, then cancel one → the waitlist must auto-promote.

---

## 4. Known remaining risk

- **You are at exactly 12 of 12 Vercel Hobby functions.** Verified by
  `vercel build`: the output contains 12 `.func` bundles (`complete-signup`,
  `end-event`, `generate-certificate`, `generate-ticket`,
  `mc-pending-requests`, `notify-org-decision`, `on-registration`,
  `poster-theme`, `razorpay`, `reachout`, `resend-verification`,
  `ticket-image`). The shared `api/_lib/*` helpers are bundled *inside* each
  function and are **not** counted separately. Deploying works today, but
  **the next endpoint you add will fail the build** — merge it into an existing
  function behind an `action` discriminator, or upgrade the plan. `/api/groq`
  was merged into `/api/poster-theme` for exactly this reason.
- **Email confirmation is off in Supabase.** Signup auto-confirms, so any
  address (including one in `SUPERADMIN_EMAILS`) can be registered and used
  immediately. Turn it on.
- **Rate limiting without Upstash is per-instance.** On Vercel, one lambda
  handles many concurrent requests, but limits are not global. Set the Upstash
  vars before public launch.
- **The reminder cron and host blast still run inside a 60s function.** They now
  batch and stamp per-recipient so a re-run is safe and never double-sends, but
  a very large blast should be driven from a queue, not a single invocation.
- **No error monitoring.** `ErrorBoundary` exists, but nothing reports to a
  service. Add Sentry before real-money paid events.
- **No CI.** `npm run verify` must be run manually; wire it to GitHub Actions.
- **Client-side rate limit remains** in `PublicEventForm` as a courtesy UX
  affordance only — the server-side limiter is the real control.
- `/api/generate-certificate` is now authenticated but is still **orphaned** —
  no client code calls it, and it writes to a `certificates` bucket that may not
  exist. Wire it up or delete it.
- `EventBuilder.tsx` (~64KB) and `useColorExtractor.ts` are still dead code, not
  routed. Safe to delete.
- `admit_audit_log` has no read policy, so it is only visible via SQL editor /
  service role. Add a `public.is_superadmin()` SELECT policy if the MC panel
  should display it.
