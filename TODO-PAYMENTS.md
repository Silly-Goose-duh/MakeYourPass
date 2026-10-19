# MakeYourPass — Phase: Direct-UPI paid flow v2 (live todo)

Revert point: tag `payments-baseline-20261019`. Rebuild from tag = rollback.

Status: ❌ = pending, 🟡 = in progress, ✅ = done, ⏸️ = needs user/account, 🔀 later.

## 0. Safety net
- ✅ Commit TODO-LIVE.md + TODO-PAYMENTS.md, tag `payments-baseline-20261019`, push (baseline commit b2e0953)

## 1. Database — supabase/migrations/002_payments.sql (idempotent, additive)
- ✅ `events`: `whatsapp_group_url`, `post_register_message`, `ticket_template_path`
- ✅ `payment_proofs`: registration_id, event_id, path, sha256 (duplicate detector), status (uploaded/duplicate/verified/rejected)
- ✅ `event_waitlist`: event_id + email (unique per event), anon-INSERTable
- ✅ Buckets + RLS: `payment-proofs` (private, org staff read), `ticket-templates` (private, signed reads)
- ✅ Payment state machine on event_responses (additive): free events unchanged; paid events submit → pending state with 15-min code-hold, proof upload → confirmed → seat consumed under row lock; expiry → released + waitlist promote
- ✅ Scan rules: paid+confirmed admit; unverified badge; cancelled refused
- ✅ Applied via management API (production, 3 chunks) + NOTIFY pgrst (DO-block pg_notify); pilot event `pilot-payments-test` created under org `under25` with price ₹1, capacity 3, UPI `makeyourpass@upi`
- Note: one implementation nuance — sécurité: resolve_payment_confirmed + verify_payment_proof + hold-aware seat view live

## 2. API — /api/payments.ts (one function, action-based; api/razorpay.ts deleted)
- ✅ POST upload-proof: image-only (no SVG), ≤8 MB, rate-limited, sha256, duplicate flag
- ✅ POST confirm: seat capacity check (row lock), ticket generation trigger (INTERNAL_API_SECRET path)
- ✅ GET status: by registration code + safe filter (no enumeration)
- ✅ POST admin-verify / admin-reject: org staff bearer
- ✅ `npm run typecheck:api` passes (typecheck + eslint clean; api/razorpay.ts deleted — function count stays 12/12)

## 3. Client — registration → ticket (PublicEventForm paid path)
- 🟡 QR + upi:// intent panel (club VPA, amount from server, note with registration code) — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Screenshot upload → Register submit → ticket animation → on-screen preview — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Download PDF + PNG buttons — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Success screen: club-editable message + WhatsApp group button + "check your email" copy — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 FREE events unchanged (instant ticket, no proof) — code complete, typecheck/lint green, awaiting (deployed) e2e smoke

## 4. Ticket engine
- 🟡 Default ticket template starter file (safe-zones for name / unique code / QR), in repo + uploaded to `ticket-templates` — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Admin template upload UI (org dashboard) + preview — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 generate-ticket overlay: name + unique code + QR onto template; regeneration respects template — code complete, typecheck/lint green, awaiting (deployed) e2e smoke

## 5. Seats & waitlist
- 🟡 Event cards: seats-left counter; 0 → gray-out "SEATS FILLED" (visual) — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Filled-event click → /event/:slug/full waiting-list page (email capture, anon insert) — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Seat freed → promote_from_waitlist + "your seat opened" email — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Registrant dashboard: proof thumbnail, duplicate badge, Verify/Delete actions — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Export: CSV/Excel download (Sheets-compatible) — code complete, typecheck/lint green, awaiting (deployed) e2e smoke

## 6. Email
- 🟡 Ticket email: attachment + event info + WhatsApp link + club message — code complete, typecheck/lint green, awaiting (deployed) e2e smoke
- 🟡 Waitlist promotion email — code complete, typecheck/lint green, awaiting (deployed) e2e smoke

## 7. Integrate & verify
- ✅ npm run verify green (typecheck, typecheck:api, lint, tests)
- ✅ Database migration applied in production
- 🟡 Redeploy + HTTP smoke tests (deploy in progress)
- ❌ e2e on real event, own phone: pay → screenshot → upload → ticket in seconds; seats decrement; fill to 0 → gray → waitlist capture → free seat → auto-promote
- Mention: payments code commit 238b683

## 🔀 Later (agreed)
- ⏸️ Android SMS-observer auto-verification (v2)
- ⏸️ Sentry DSN, Upstash vars, Groq rotation (user), Vercel Pro decision
