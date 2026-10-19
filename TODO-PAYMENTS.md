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
- ✅ Applied via management API (production, 3 chunks) + NOTIFY pgrst (DO-block pg_notify); pilot event `pilot-payments-test` created under org `under25` with price ₹1, capacity 4, UPI `makeyourpass@upi`
- Note: one implementation nuance — sécurité: resolve_payment_confirmed + verify_payment_proof + hold-aware seat view live
- Note: fixed after first apply — resolve_payment_confirmed plpgsql shadow bug (ON CONFLICT → constraint name); trigger became CREATE OR REPLACE (full-file re-run not idempotent for dependent triggers); paid submit no longer REQUIRES proof at submit (proof enforced at confirm; holds protect capacity); submit path now capacity-gates holds (4th hold slot → straight to 'waitlisted', no overbooking)

## 2. API — /api/payments.ts (one function, action-based; api/razorpay.ts deleted)
- ✅ POST upload-proof: image-only (no SVG), ≤8 MB, rate-limited, sha256, duplicate flag
- ✅ POST confirm: seat capacity check (row lock), ticket generation trigger (INTERNAL_API_SECRET path) — +email kick (confirm → on-registration x-internal-secret)
- ✅ GET status: by registration code + safe filter (no enumeration)
- ✅ POST admin-verify / admin-reject: org staff bearer
- ✅ `npm run typecheck:api` passes (typecheck + eslint clean; api/razorpay.ts deleted — function count stays 12/12)

## 3. Client — registration → ticket (PublicEventForm paid path)
- ✅ QR + upi:// intent panel (club VPA, amount from server, note with registration code) — code complete, typecheck/lint green
- ✅ Screenshot upload → Register submit → ticket animation → on-screen preview — code complete, typecheck/lint green
- ✅ Download PDF + PNG buttons — code complete, typecheck/lint green
- ✅ Success screen: club-editable message + WhatsApp group button + "check your email" copy — code complete, typecheck/lint green
- ✅ FREE events unchanged (instant ticket, no proof) — code complete, typecheck/lint green
- 🟡 Phone-based UI walk (QR intent, upload, animation, downloads) — user test pending

## 4. Ticket engine
- ✅ Default ticket template starter file (safe-zones for name / unique code / QR), in repo + uploaded to `ticket-templates` — code complete
- ✅ Admin template upload UI (org dashboard) + preview — code complete
- ✅ generate-ticket overlay: name + unique code + QR onto template; regeneration respects template
- Note: fix — generate-ticket now uploads WITHOUT bucket prefix and stores ticket_url WITH `tickets/` prefix (dormant double-prefix bug surfaced by first real event; fixed + validated)
- 🟡 Club-uploaded template not e2e-tested in prod (staff storage write; needs a logged-in org admin session)

## 5. Seats & waitlist
- ✅ Event cards: seats-left counter; 0 → gray-out "SEATS FILLED" (visual) — evidence: gate test, 4th hold → waitlisted at submit
- ✅ Filled-event click → /event/:slug/full waiting-list page (email capture, anon insert) — evidence: anon insert 201 + duplicate 409
- ✅ Seat freed → promote_from_waitlist + "your seat opened" email — evidence: cancel → trigger promoted PILOT-0008 → confirmed; daily reachout sweep (≤30 rows) covers offline promoted buyers
- 🟡 Registrant dashboard: proof thumbnail, duplicate badge, Verify/Delete actions — code done; needs a real admin session to visualize
- 🟡 Export: CSV/Excel download (Sheets-compatible) — code done; needs a real admin session to visualize
- Evidence notes: seat decrement visible in event_seat_status; status-poll self-heal generates + mails ticket
- Note: 15 legacy double-prefixed ticket objects remain in the `tickets` bucket (bytes ~5KB; Supabase blocks SQL delete) — delete via Storage dashboard when convenient

## 6. Email
- ✅ Ticket email: attachment + event info + WhatsApp link + club message — codeside: attachment + when/where + club message + WhatsApp button
- ⏸️ REAL DELIVERY: Resend sandbox only sends to gooseisback4u@gmail.com — user must verify a domain at resend.com/domains + set RESEND_FROM; evidence: send chain executed successfully, rejected only by sandbox policy
- ✅ Waitlist promotion email — covered by the promoted sweep via the standard ticket email (no separate 'seat opened' template — accepted simplification)

## 7. Integrate & verify
- ✅ npm run verify green (typecheck, typecheck:api, lint, tests) — 56 tests
- ✅ Database migration applied in production
- ✅ Redeploy + HTTP smoke tests (deployed commit dea5556; 12/12 functions preserved; vercel.json razorpay entry replaced by payments)
- ✅ REST-level smoke tests passed
- 🟡 e2e on real event, own phone: pay → screenshot → upload → ticket in seconds; seats decrement; fill to 0 → gray → waitlist capture → free seat → auto-promote — REST-verified end-to-end incl. dedupe + promotion; phone UX walk left to user (pilot `pilot-payments-test` live at https://makeyourpass.vercel.app/events)
- Mention: payments code commit 238b683

## 🔀 Later (agreed)
- ⏸️ Android SMS-observer auto-verification (v2)
- ⏸️ Sentry DSN, Upstash vars, Groq rotation (user), Vercel Pro decision
