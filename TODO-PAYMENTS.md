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
- Note: fix (commits after 45d0424) — user's free walk exposed that the free "thank you" screen showed NOTHING (ticket was generated server-side but only visible if the email arrived, which the Resend sandbox blocks for most addresses). Now the FREE flow: (1) awaits the on-registration kick before mounting the success screen, (2) new `FreeTicketSuccess` polls `/api/payments status` for the generated PNG and reuses `TicketSuccess` — same ticket image, code, PNG/PDF downloads, club message + WhatsApp button as paid buyers; (3) if the poll reveals `waitlisted` (full event), it routes to the same waitlist screen as the paid flow; (4) `/api/on-registration` no longer 500s when the Resend send fails — returns `email_error` as data (PNG generation unaffected, `email_sent_at` only stamps on successful send). Live e2e in prod: free submit → kick 200 `{ok:true}` → status `generated` + signed URL; full-capacity free submit → `waitlisted` status route verified. Test rows (freewalk1/2) deleted; vest1244 (user's real free registration, PILOT-0014) kept with ticket.
- 🟡 Phone-based UI walk (QR intent, upload, animation, downloads, free-flow ticket screen) — user test pending

## 4. Ticket engine
- ✅ Default ticket template starter file (safe-zones for name / unique code / QR), in repo + uploaded to `ticket-templates` — code complete
- ✅ Admin template upload UI (org dashboard) + preview — code complete
- ✅ generate-ticket overlay: name + unique code + QR onto template; regeneration respects template
- Note: fix — generate-ticket now uploads WITHOUT bucket prefix and stores ticket_url WITH `tickets/` prefix (dormant double-prefix bug surfaced by first real event; fixed + validated)
- 🟡 Club-uploaded template not e2e-tested in prod (staff storage write; needs a logged-in org admin session)

## 5. Seats & waitlist
- ✅ Event cards: seats-left counter; 0 → gray-out "SEATS FILLED" (visual) — evidence: gate test, 4th hold → waitlisted at submit
- ✅ Filled-event click → waiting-list email-capture page — now at the dedicated `/waiting-list?event=:slug` route (plus legacy `/event/:slug/full`); evidence: anon insert 201 + duplicate 409 (re-verified after the grant fix, see note)
- ✅ About-event page shipped: clicking any card (or ticket-status links) opens `/event/:slug` with poster/title/when/where/price/seats-left and a Register now button → `/event/:slug/register` (form pipeline unchanged); full events show "Add me to the waiting list" instead; past events disable registration. New AboutEventPage + route rewire + EventsPage filled-card redirect.
- 🟡→✅ Seat-open alerts for event_waitlist captures (built): reachout daily cron sweeps published upcoming events with seats_left>0, emails the first unalerted captures (≤30/run) via new internal `waitlist-alert` action on /api/on-registration (x-internal-secret gated, 401 verified in prod); `event_waitlist.alerted_at` column stamps only on clean send so failures retry. First real run due 02:30 UTC; gooseisback4u capture pre-planted on the pilot event as the deliverable demo.
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
- Note: fix (commit 45d0424) — first phone walk exposed a real flow bug: capacity-gated holds land the new row `waitlisted`, but the form still opened the payment panel for it → UPI intent + proof upload that could never pass the storage policy (user hit "Upload failed"). Now the submit path reads the registration status back and routes `waitlisted` buyers straight to the waitlist screen; the panel's boot poll routes terminal states (`waitlisted`/`rejected`/cancelled hold) instead of dead-ending; proof-upload failures with a storage-policy denial now say the hold is inactive instead of blaming the connection. Pilot event capacity bumped 4 → 6 (user's runbook SQL was skipped) so the retest has 2 free slots; PILOT-0010/0011 (user's waitlist visits) remain as valid capture rows. Retest on phone still pending; use a fresh email (tjj5279 / gooseisback4u are taken).
- Mention: payments code commit 238b683

## 🔀 Later (agreed)
- ⏸️ Android SMS-observer auto-verification (v2)
- ⏸️ Sentry DSN, Upstash vars, Groq rotation (user), Vercel Pro decision

## 8. Attendee-account hardening (migration 005)
- ✅ `supabase/migrations/005_attendee_account_hardening.sql` applied in production
- ✅ Cancellation requests are RPC-only writes; broad anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE grants revoked; staff SELECT policy added; ownership re-checked inside `review_event_cancellation` (cross-owner request returns “Registration not found”, verified)
- ✅ Legacy anonymous registrations linked to accounts by email; `get_my_event_registration`, `request_event_cancellation`, and `list_my_event_registrations` fall back to the verified account email
- ✅ Realtime enabled: `event_responses` + `event_cancellation_requests` added to `supabase_realtime` with `REPLICA IDENTITY FULL`
- ✅ `events.response_count` maintained by trigger + backfilled (counts confirmed + pending only)
- ✅ Registration RPC releases the attendee’s lapsed holds and refuses past-date events
- ✅ Attendee UX: `/account/tickets` (My Tickets), Navbar links, About page “Complete payment” resume, “Register again” after cancellation, cancellation confirmation + optional reason, refund-pending note
- ✅ Registration form resumes an existing pending paid registration into PaymentPanel and shows a status card for confirmed/waitlisted rows instead of the form
- ✅ `resend-verification` now carries `?next=` and returns 400 (not 500) on malformed JSON; unknown email returns generic 200
- ✅ Org dashboard polls every 20s while a request is pending (approval appears without a manual refresh)
- ✅ Supabase Auth `mailer_autoconfirm=true` temporarily so attendee signups work while Resend is sandboxed. Re-enable confirmation + configure Resend SMTP once the domain is verified.
- E2E in production: signup → register → My Tickets → cross-owner cancellation blocked → request → staff approval → waitlist promotion → response_count restored; test users/rows cleaned up.
- ⏸️ Cancellation decision email (approve/reject) still not sent to the attendee
- ⏸️ Refund completion UI still missing (`refund_status` is set but there is no staff action to mark it completed)

## 9. Student + club signup split (migration 006)
- ✅ `supabase/migrations/006_student_and_club_profiles.sql` applied in production
- ✅ `profiles` now stores `age`, `semester` (S1–S8), `department` (CSE R1 … MCA), and `account_type` (`student` / `club`); `handle_new_user` copies these from auth metadata
- ✅ `event_responses` snapshots `age`, `semester`, `department` at registration; `submit_authenticated_event_response` reads them from the attendee profile
- ✅ Unified `/signup` and `/account/signup` first ask **student or club**. Student form collects name, age, email, phone, semester, department, password
- ✅ Club form collects full org name, short form, club email, representative name/contact, logo (PNG/JPG/WebP/GIF ≤2 MB), vision, and optional UPI ID; logo uploads to the public `event-posters` bucket under `org-logos/`
- ✅ Club signup shows a “Creating your organization dashboard” provisioning animation before the pending-approval screen
- ✅ `organization_registration_requests` stores the new club profile fields; `approve_organization_request` copies them onto `organizations` (`short_name`, `representative_name`, `contact_email`, `contact_phone`, `logo_url`, `upi_id`, `description`)
- ✅ MC approval queue shows the club logo, short name, club email, representative, and UPI ID
- ✅ Event registration form asks for age/semester/department when missing, prefills them for existing accounts, and updates the profile before creating the ticket
- ✅ Registrants CSV includes age, semester, and department
- ✅ `npm run verify` green (typecheck, API typecheck, lint, 65 tests)
- ✅ Production smoke test: student signup stored `age`/`semester`/`department`/`account_type` on `profiles`; registration snapshotted the same fields onto `event_responses` (`PILOT-0006`); test rows removed
- ✅ Production smoke test: club signup uploaded a real logo, created the pending request with short name, club email, representative, UPI, and vision; approval copied every field into `organizations` and made the requester an admin; test user/org/request/logo removed
- ✅ Live visual check (headless browser): role chooser, student details form, and club details form render correctly on the production deployment
- ⏸️ Provisioning animation has not been visually captured; its text/screen is present in the deployed bundle
