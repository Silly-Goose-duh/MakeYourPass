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
- **RLS infinite-recursion dependency.** Whole app depends on RPCs + `supabase/rls-fix-v2.sql`
  being applied in Supabase, else every read fails with `RLS_RECURSION`. A fresh clone with
  no Supabase project loads no data. Document required migrations + provide `.env.local` template.
- **No `.env.local` / env validation / `vercel.json`.** Supabase URL/key, Razorpay, EmailJS,
  Groq keys all required but only in `.env.example`. Add runtime env validation + Vercel routing config.

## 🟠 Dead / unwired features (shipped but non-functional)
- **Razorpay payments never fire.** `api/razorpay.ts` exists but the client never calls it or
  loads Razorpay Checkout. Paid events display "Tickets processed securely via Razorpay"
  (`EventBuilder.tsx:1366`) as a false promise. Wire the checkout flow or hide paid events.
- **EmailJS confirmations never sent.** `sendConfirmationEmail` (`src/lib/email.ts`) is never
  imported, yet `PublicEventForm.tsx:224` promises "You'll receive a confirmation at {email}".
- **QR check-in absent.** `html5-qrcode` + `qrcode.react` are deps but unused; no pass/scan model.
- **`EventBuilder.tsx` + `useColorExtractor.ts` are orphaned** (not imported by App.tsx; app uses
  CreateEvent/EditEvent). Dead code using old tokens — delete or re-integrate.
- **`/dashboard/orgs/new` route missing** — "Create Organization" link (`OrgDashboard.tsx:143`)
  and signup org-request flow point to a non-existent route → 404.

## 🟡 Security / config
- **Groq API key exposed client-side** (`VITE_GROQ_API_KEY` shipped to browser in `groq.ts`).
  Proxy server-side to avoid key extraction / billing abuse.
- **Razorpay `Access-Control-Allow-Origin: *`** and order amount never re-validated server-side
  against expected price (client sets price authoritatively). HMAC verify itself is correct.
- **Admin authz is data-dependent** (`profiles.is_superadmin` + RLS). No server-side enforcement
  beyond `SECURITY DEFINER` RPCs. Harden if RLS misconfig is a realistic risk.
- **No error boundaries** — a render error crashes the whole SPA.
- **Missing `/favicon.svg`** referenced in `index.html` (no file in `public/`).

## 🧪 Testing
- **No test suite exists** (no test script, no framework). Add Vitest + RTL for the data layer
  (`src/lib/supabase.ts` tryRpc/fallback) and core flows (signup, event create, public form submit).

## Needs human testing (post-rework)
- Formal WCAG/contrast audit (Lighthouse/axe) — contrast improved by eye, not measured.
- Authenticated surfaces (Dashboard, MC Panel, Create/Edit/Analytics) visually spot-checked in a
  real Supabase session — they inherit new tokens but weren't re-reviewed live.
- `.glass` backdrop-filter across Safari/Firefox.
