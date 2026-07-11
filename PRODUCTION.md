# MakeYourPass — Production Readiness Checklist

Status snapshot for shipping MakeYourPass to real users. Grouped by ownership.
Items marked ✅ are done in-repo; 🔴/🟠/🟡 need **your** action (secrets, backend,
or product decisions an autonomous agent shouldn't make blindly).

---

## ✅ Done (safe, in-repo — shipped)
- **Mobile-hardened UI**: `overflow-x: hidden` guard, fluid `clamp()` hero, responsive
  event grid using `minmax(min(240px,100%),1fr)` (no overflow on 320px phones),
  `hidden lg:block` sidebar with a mobile chip-row + hamburger fallback, viewport meta present.
- **App-wide ErrorBoundary** (`src/components/ErrorBoundary.tsx`, wired in `main.tsx`) —
  a render error no longer white-screens the whole SPA.
- **SEO / social meta** in `index.html` — description, Open Graph, Twitter card, `theme-color`.
- **Fixed dead route** — "Create Organization" (`OrgDashboard.tsx`) pointed to the
  non-existent `/dashboard/orgs/new` (404); now routes to the real `/signup` org-request flow.
- **SPA routing config** — `vercel.json` present with API passthrough + `/(.*) → /index.html`.
- **Favicon** — `public/favicon.svg` present.
- **Build/lint clean** — `npm run build` ✓, `npm run lint` ✓ (0 errors).
- **v4 "Zine" brutalist frontend** — see DESIGN.md.

---

## 🔴 Critical — needs your action before real launch
1. **Supabase RLS migration must be applied.** The app depends on RPCs
   (`get_published_events`, `get_organization_events`, `create_event`,
   `create_organization_request`, `approve/reject_organization_request`,
   `get_event_analytics`, `get_organizations_with_counts`) **and** the SQL in
   `supabase/rls-fix-v2.sql`. Without them every read fails with `RLS_RECURSION`.
   → Apply the migration(s) in the Supabase SQL editor for the production project.
2. **Environment variables** — confirmed set in Vercel Production (Supabase URL/key,
   EmailJS ×3, Groq). Verify they point at the **production** Supabase project, not a
   dev one. No `.env.local` is committed (correct — it's git-ignored).

---

## 🟠 Features shipped but NOT functional (decide: wire or hide)
3. **Razorpay payments never fire.** `api/razorpay.ts` exists (order + HMAC verify) but the
   client never calls it or loads Razorpay Checkout. Paid events show
   "Tickets processed securely via Razorpay" as a false promise.
   → Either wire the checkout flow end-to-end **or** hide the paid-event option until then.
   → Also: server must re-validate order amount against the authoritative event price
     (currently price is client-set; a tampered client could underpay).
4. **EmailJS confirmations never sent.** `sendConfirmationEmail` (`src/lib/email.ts`) is
   never imported, yet the public form promises "You'll receive a confirmation at {email}".
   → Import + call it on successful registration, or remove the promise copy.
5. **QR check-in is absent.** `html5-qrcode` + `qrcode.react` are deps but unused; there's
   no pass/scan model. → Build the check-in flow or drop the deps to shrink the bundle.
6. **Orphaned dead code** — `EventBuilder.tsx` + `useColorExtractor.ts` aren't imported by
   `App.tsx` (app uses CreateEvent/EditEvent). → Delete to reduce confusion/bundle.

---

## 🟡 Security / hardening
7. **Groq API key is exposed client-side** (`VITE_GROQ_API_KEY` shipped to the browser in
   `src/lib/groq.ts`). Anyone can extract and abuse it (billing risk).
   → Proxy Groq calls through a serverless function; keep the key server-only.
8. **Razorpay function CORS is `*`** and the verify route is public. HMAC verify itself is
   correct, but tighten CORS to your domain and add rate limiting.
9. **Admin authz is data-dependent** (`profiles.is_superadmin` + `organization_members` via
   RLS). No server-side enforcement beyond `SECURITY DEFINER` RPCs. Acceptable for MVP but
   audit RLS policies carefully — a misconfig = broken access control.

---

## 🧪 Testing / observability (recommended)
10. **No test suite exists.** Add Vitest + React Testing Library for the data layer
    (`src/lib/supabase.ts` tryRpc/fallback) and core flows (signup, event create, public
    form submit).
11. **No error monitoring.** ErrorBoundary logs to console only. Wire Sentry (or similar)
    in `ErrorBoundary.componentDidCatch` + a global `window.onunhandledrejection`.
12. **Accessibility pass.** Run Lighthouse/axe. Known watch-item: red-on-yellow hero text is
    borderline for color-blind users (heavy weight compensates; darken if stricter needed).

---

## 📱 Manual mobile QA (do on a real device)
The responsive code is correct, but browser tooling here can't emulate a true device.
Before launch, on an actual phone verify:
- No horizontal scroll on the home, event, login, signup, and dashboard pages.
- Hamburger menu opens/closes; profile dropdown is reachable.
- Filter chip rows scroll horizontally without breaking layout.
- Event cards stack to a single column and remain tappable (44px+ targets).
- The splash screen animation doesn't trap/scroll-lock on mobile Safari.
- `.glass`/backdrop and hard shadows render on iOS Safari + Android Chrome.
