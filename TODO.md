# MakeYourPass — TODO / Production-Readiness Backlog

Findings from an end-to-end code audit (2026-07-11). Grouped by ownership.
UI/design-system items in the first section are **done**; the rest need
backend, secrets, or product decisions and are handed off.

## ✅ Done (UI rework + design-system fixes)
- v3 "Aurora" design system (see DESIGN.md) — tokens, glass navbar, elevation, gradient.
- Fixed false "UPCOMING" label over past events → dynamic "All Events" / "Results".
- **Defined missing design tokens** that were silently breaking accents app-wide:
  `--color-accent-rose`, `--color-accent-teal`, `--color-primary-hover`.
  (Previously undefined → MCPanel "Pending Requests" stat, EventAnalytics CheckCircle,
  and Login/Signup/FormBuilder/PublicEventForm hover states rendered with no color.)
- Cleared all 3 eslint unused-var errors. `npm run lint` and `npm run build` both pass clean.

## 🔴 Critical (blockers)
- ~~RLS recursion~~ — fixed in prod (`rls-fix-v2` + RPCs live).
- ~~vercel.json / SPA routing~~ — fixed; assets load on Vercel.
- ~~VITE env on Vercel~~ — re-synced from `.env.local` (2026-07-22).

## 🟠 Remaining product work
- **Razorpay payments** — server side is now correct (amount resolved from `events.price`,
  capture + amount verified server-side, idempotent). Still no client checkout wiring and
  no `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` in Vercel. Either wire the UI or hide the option.
- **Email** — Resend + `/api/on-registration` (not EmailJS) handles ticket email. Confirm Resend domain.
- **QR check-in** — **DONE** (`/host/:eventId/scan` + `admit_registration` RPC).
- **Live host dashboard** — **DONE** (`/host/:eventId/dashboard`); linked from org dashboard.
- **Storage buckets** — `/api/setup-storage` is **DELETED**. Policies now ship as SQL in
  `supabase/migrations/001_hardening.sql` (`tickets` is private; `event-posters` no longer
  accepts SVG).
- **`EventBuilder.tsx` + `useColorExtractor.ts`** still orphaned. Note `EventBuilder` is the
  ONLY caller of `src/lib/groq.ts`, so deleting it also deletes the AI document-parsing
  feature. Route it or remove it deliberately — do not delete it by accident.
- **`/api/generate-certificate`** is authenticated but still has no client caller, and writes
  to a `certificates` bucket that may not exist. Wire it up or delete it.

## 🟡 Security / config
> Resolved on 2026-10-15 — see `SECURITY.md` for the full audit. Kept here as a record.
- ~~**Groq API key exposed client-side** (`VITE_GROQ_API_KEY`)~~ — **FIXED.** Groq is proxied
  server-side; `VITE_GROQ_API_KEY` deleted from Vercel (both environments). The key should
  still be rotated in the Groq console, since it was publicly readable for ~3 months.
- ~~**Razorpay `Access-Control-Allow-Origin: *`** + client-set amount~~ — **FIXED.** CORS locked
  to `APP_ORIGIN`; amount read from the DB; verification asserts capture + amount.
- **Rate limiting is per-instance** until `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set.
- **Email confirmation is OFF in Supabase** — any address can register and use the app
  immediately, including one listed in `SUPERADMIN_EMAILS`.
- **Admin authz is data-dependent** (`profiles.is_superadmin` + RLS). No server-side enforcement
  beyond `SECURITY DEFINER` RPCs. Harden if RLS misconfig is a realistic risk.
- ~~**No error boundaries**~~ — **DONE** (per-page + app-level `ErrorBoundary`).
- **Missing `/favicon.svg`** referenced in `index.html` (no file in `public/`).
- **No error monitoring** — `ErrorBoundary` catches render errors but reports nowhere.
- **No CI** — `npm run verify` must be run by hand.
- **Vercel function count is at 12/12 (Hobby cap)** — the next endpoint added will fail the
  build. Merge it into an existing function behind an `action` discriminator, or upgrade.

## 🧪 Testing
- **No test suite exists** (no test script, no framework). Add Vitest + RTL for the data layer
  (`src/lib/supabase.ts` tryRpc/fallback) and core flows (signup, event create, public form submit).

## Needs human testing (post-rework)
- Formal WCAG/contrast audit (Lighthouse/axe) — contrast improved by eye, not measured.
- Authenticated surfaces (Dashboard, MC Panel, Create/Edit/Analytics) visually spot-checked in a
  real Supabase session — they inherit new tokens but weren't re-reviewed live.
- `.glass` backdrop-filter across Safari/Firefox.
