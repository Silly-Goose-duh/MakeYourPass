# MakeYourPass — Phase: Direct-UPI paid flow v2 (live todo)

Revert point: tag `payments-baseline-20261019`. Rebuild from tag = rollback.

Status: ❌ = pending, 🟡 = in progress, ✅ = done, ⏸️ = needs user/account, 🔀 later.

## 0. Safety net
- ❌ Commit TODO-LIVE.md + TODO-PAYMENTS.md, tag `payments-baseline-20261019`, push

## 1. Database — supabase/migrations/002_payments.sql (idempotent, additive)
- ❌ `events`: `whatsapp_group_url`, `post_register_message`, `ticket_template_path`
- ❌ `payment_proofs`: registration_id, event_id, path, sha256 (duplicate detector), status (uploaded/duplicate/verified/rejected)
- ❌ `event_waitlist`: event_id + email (unique per event), anon-INSERTable
- ❌ Buckets + RLS: `payment-proofs` (private, org staff read), `ticket-templates` (private, signed reads)
- ❌ Payment state machine on event_responses (additive): free events unchanged; paid events submit → pending state with 15-min code-hold, proof upload → confirmed → seat consumed under row lock; expiry → released + waitlist promote
- ❌ Scan rules: paid+confirmed admit; unverified badge; cancelled refused
- ❌ Applied via management API + NOTIFY pgrst (DO-block pg_notify)

## 2. API — /api/payments.ts (one function, action-based; api/razorpay.ts deleted)
- ❌ POST upload-proof: image-only (no SVG), ≤8 MB, rate-limited, sha256, duplicate flag
- ❌ POST confirm: seat capacity check (row lock), ticket generation trigger (INTERNAL_API_SECRET path)
- ❌ GET status: by registration code + safe filter (no enumeration)
- ❌ POST admin-verify / admin-reject: org staff bearer
- ❌ `npm run typecheck:api` passes

## 3. Client — registration → ticket (PublicEventForm paid path)
- ❌ QR + upi:// intent panel (club VPA, amount from server, note with registration code)
- ❌ Screenshot upload → Register submit → ticket animation → on-screen preview
- ❌ Download PDF + PNG buttons
- ❌ Success screen: club-editable message + WhatsApp group button + "check your email" copy
- ❌ FREE events unchanged (instant ticket, no proof)

## 4. Ticket engine
- ❌ Default ticket template starter file (safe-zones for name / unique code / QR), in repo + uploaded to `ticket-templates`
- ❌ Admin template upload UI (org dashboard) + preview
- ❌ generate-ticket overlay: name + unique code + QR onto template; regeneration respects template

## 5. Seats & waitlist
- ❌ Event cards: seats-left counter; 0 → gray-out "SEATS FILLED" (visual)
- ❌ Filled-event click → /event/:slug/full waiting-list page (email capture, anon insert)
- ❌ Seat freed → promote_from_waitlist + "your seat opened" email
- ❌ Registrant dashboard: proof thumbnail, duplicate badge, Verify/Delete actions
- ❌ Export: CSV/Excel download (Sheets-compatible)

## 6. Email
- ❌ Ticket email: attachment + event info + WhatsApp link + club message
- ❌ Waitlist promotion email

## 7. Integrate & verify
- ❌ npm run verify green (typecheck, typecheck:api, lint, tests)
- ❌ Database migration applied in production
- ❌ Redeploy + HTTP smoke tests
- ❌ e2e on real event, own phone: pay → screenshot → upload → ticket in seconds; seats decrement; fill to 0 → gray → waitlist capture → free seat → auto-promote

## 🔀 Later (agreed)
- ⏸️ Android SMS-observer auto-verification (v2)
- ⏸️ Sentry DSN, Upstash vars, Groq rotation (user), Vercel Pro decision
