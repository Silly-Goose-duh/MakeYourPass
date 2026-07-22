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
- **Razorpay payments** — UI now shows "Paid · soon" (disabled). Wire checkout when keys ready.
- **Email** — Resend + `/api/on-registration` (not EmailJS) handles ticket email. Confirm Resend domain.
- **QR check-in** — **DONE** (`/host/:eventId/scan` + `admit_registration` RPC).
- **Live host dashboard** — **DONE** (`/host/:eventId/dashboard`); linked from org dashboard.
- **Storage buckets** — create `event-posters` + `tickets` via `/api/setup-storage` if missing.
- **`EventBuilder.tsx` + `useColorExtractor.ts`** still orphaned — safe to delete later.

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
