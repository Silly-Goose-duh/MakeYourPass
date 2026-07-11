# MakeYourPass — Production Readiness Handoff

Zero-context handoff for whoever picks this up next (human or agent).
Status as of **2026-07-11**. ✅ = verified done & live. 🔴/🟠/🟡 = needs a human action
(secrets, Supabase dashboard, or a product decision an autonomous agent shouldn't make blindly).

Live site: **https://makeyourpass.vercel.app**
Repo: **https://github.com/Silly-Goose-duh/MakeYourPass** (branch `master`)
Supabase project: `isvylfovcwtlemjpkdqp` (anon key in Vercel env)

---

## ✅ Verified working (live)
- **App actually mounts on Vercel.** Previous `vercel.json` rewrote `/assets/*.js` →
  `index.html`, so the React bundle never loaded (page looked alive but React was dead).
  Fixed to `framework: vite` + `rewrites` (static assets win, SPA falls back to `index.html`).
  Verified: assets serve `application/javascript`; event page, home, login all render.
- **Public event form** (`/event/:slug`): renders full form (event details, questions,
  dropdown, 1–5 scale, submit). Event loads fast; questions stream in with a mini-loader.
  12s safety timeout so it can never hang silently.
- **Email/phone validation** on the public form (inline errors).
- **Route guards**: `ProtectedRoute`, `OrgAdminRoute`, `SuperAdminRoute` all fixed —
  logged-out users no longer get an infinite "Loading…" spinner; they redirect to login.
  `/mc` correctly redirects non-superadmins to the dashboard (verified live).
- **Supabase RLS**: the recursion is resolved in production. `get_published_events`,
  `organizations`, `event_questions` all return live data.
- **Auth**: sign-up → immediate session (email confirmation is OFF), sign-in, sign-out
  all work. Superadmin is auto-granted to `gooseisback4u@gmail.com` (see migration trigger).
- **Groq poster-theme**: serverless `api/poster-theme.ts` uses a **server-only** `GROQ_API_KEY`
  (no client key). Live endpoint returns a palette `{accent, vibe, isDark, ...}`. The public
  form applies it as CSS vars when `event.poster_url` exists, with a "themed to your poster" notice.
- **Dashboard** (OrgAdmin view) renders for a logged-in user (verified live).
- **Brand rename**: all "CampusPass" → "MakeYourPass" (code, docs, package.json, SEO meta,
  auth-page wordmarks). Vercel dashboard *project name* is still `campuspass` — rename it
  one-click in Vercel project Settings → General.
- **SEO**: `index.html` has OG + Twitter tags; `og:image` now points at `/og-image.svg`
  (1200×630 branded card).
- Build/lint clean (`npm run build` ✓, `npm run lint` ✓).

---

## 🔴 Critical — your action before real club launch

1. **Run the Supabase migration** (`supabase/migration.sql`) in the production Supabase SQL
   Editor if not already applied. It now also creates the **`event-posters` storage bucket**
   and its RLS policies (public read, authenticated write). This is required for poster
   uploads to actually persist (see fix #3 below).
   → Supabase dashboard → SQL Editor → paste `supabase/migration.sql` → Run.

1b. **Run `supabase/event-setup-fix.sql`** (also in SQL Editor). This:
    - (re)creates the **anon INSERT policies** on `event_responses` + `response_answers`
      so public form submissions no longer fail with *"new row violates row-level
      security policy for table event_responses"*.
    - adds an `AFTER INSERT` trigger `trg_event_created` that **auto-seeds a default
      "Email" question into `event_questions` for every new event** (SECURITY DEFINER,
      bypasses RLS). This automates per-event setup at creation time — no manual step.
    → Supabase dashboard → SQL Editor → paste `supabase/event-setup-fix.sql` → Run.
    (Idempotent; safe to re-run.)

2. **Delete the test accounts** I created (clutter; can't be deleted via the anon key, so
   this needs the dashboard or service role):
   - `qa-test@campuspass.app`
   - `visual-qa@campuspass.app`
   → Supabase dashboard → Authentication → Users → delete both. (Or SQL w/ service role:
   `delete from auth.users where email in ('qa-test@campuspass.app','visual-qa@campuspass.app');`)

---

## 🟠 Shipped but NOT wired end-to-end (decide: finish or hide)

3. **Poster upload bug — FIXED in code, needs migration run.** `PosterUpload.tsx` was
   uploading to a non-existent `event-images` bucket, so `poster_url` was never set and the
   Groq auto-theme could never trigger. Now uses `event-posters` (matches migration). The
   migration's storage policies must be applied (item #1) for uploads to work at the policy level.
   After that: upload a poster to any event → the public form will auto-theme. **Needs a visual
   check with a real poster-bearing event** (none exists in prod yet).

4. **Razorpay payments never fire.** `api/razorpay.ts` exists (create-order + HMAC verify) but
   the client never calls it or loads Razorpay Checkout. Paid events show "Tickets processed
   securely via Razorpay" as a false promise. Add `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`
   (server env) and wire the client checkout, **or** hide the paid-event option. Also: the
   server should re-validate the order amount against the authoritative event price (currently
   client-set → a tampered client could underpay).

5. **EmailJS confirmations never sent.** `sendConfirmationEmail` (`src/lib/email.ts`) is never
   imported; the public form still promises "You'll receive a confirmation at {email}". Either
   import + call it on successful registration, or remove the promise copy. Needs
   `VITE_EMAILJS_SERVICE_ID` / `TEMPLATE_ID` / `PUBLIC_KEY` (client env) configured.

6. **QR check-in is absent.** `html5-qrcode` + `qrcode.react` are deps but unused; no pass/scan
   model. Build the flow or drop the deps to shrink the bundle.

7. **Orphaned code**: `EventBuilder.tsx` + `useColorExtractor.ts` aren't imported by `App.tsx`.
   Delete to reduce confusion/bundle.

---

## 🟡 Hardening / nice-to-have
8. **Razorpay CORS is `*`** and verify route is public. HMAC verify is correct; tighten CORS to
   the domain + add rate limiting.
9. **No test suite / no error monitoring.** Add Vitest + RTL for the data layer and core flows;
   wire Sentry in `ErrorBoundary.componentDidCatch`. (App already has a global ErrorBoundary.)
10. **Accessibility**: run Lighthouse/axe. Hero text is heavy-weight dark-on-cream (passes AA
    for large text); verify contrast if you restyle.
11. **og:image is an SVG.** Most platforms (LinkedIn, Slack, Discord, Facebook) render it;
    **Twitter/X ignores SVG** — generate a 1200×630 **PNG** (`public/og-image.png`) and point
    `twitter:image` at it for full coverage.

---

## 🧪 How to verify locally
```
npm install
cp .env.local.example .env.local   # fill Supabase + (optional) Groq/EmailJS/Razorpay
npm run dev                        # local preview
npm run lint && npm run build      # must both pass
```
Deploy: `vercel --prod --yes` (or push to `master` → auto-deploy).

## 📱 Mobile QA (real device)
Responsive code is correct; browser tooling can't fully emulate a device. Before launch on a
phone verify: no horizontal scroll (home/event/login/signup/dashboard), hamburger + profile
dropdown reachable, filter chips scroll, cards single-column & tappable, splash animation
doesn't scroll-lock on iOS Safari.
