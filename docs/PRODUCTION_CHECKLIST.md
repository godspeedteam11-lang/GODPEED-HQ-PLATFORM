# LegacyOS — Production Launch Checklist

Use this checklist to verify external service configurations, database constraints, and deployment readiness before onboarding paying customers.

---

## 1. Database & Security Verification
- [ ] **Supabase Database Verified**: All 18 tables deployed (`offices`, `members`, `genealogy_closure`, `attendance_logs`, `office_dues`, `pv_submissions`, `earnings_ledger`, `health_scores`, `chat_messages`, `community_posts`, `notice_board`, `training_classes`, `training_class_members`, `training_sessions`, `training_attendance`, `director_networks`, `network_offices`, `subscription_plans`, `subscriptions`, `subscription_events`, `notifications`, `payment_transactions`).
- [ ] **RLS Verified**: Row-Level Security enabled on all tables; cross-tenant query tests return empty results for unauthorized tenants.
- [ ] **Signup Trigger Verified**: `handle_new_user_signup()` requires valid tenant ID/slug and throws an exception on invalid input.
- [ ] **Member Limit Trigger Verified**: `trg_enforce_office_member_limit` halts inserts on Starter plan when active member count reaches 49.

---

## 2. Storage & Assets
- [ ] **Storage Verified**: Buckets `office-assets` (Public), `member-avatars` (Public), and `attendance-snapshots` (Private) created.
- [ ] **Storage Policies Verified**: Authenticated team leaders can upload to `office-assets`; members can upload avatars; attendance captures restricted.

---

## 3. Realtime & Edge Functions
- [ ] **Realtime Verified**: Publication `supabase_realtime` enabled for `earnings_ledger`, `notifications`, `training_sessions`, `training_attendance`, and `chat_messages`.
- [ ] **Edge Functions Deployed**: `paystack-webhook` and `cron-reminders` deployed via `supabase functions deploy`.
- [ ] **Supabase Secrets Configured**: `PAYSTACK_SECRET_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` set in Supabase Edge Functions.

---

## 4. Payment Gateway (Paystack)
- [ ] **Paystack Test Transaction Completed**: Completed sandbox transaction on Starter Monthly (₦7,500) and confirmed status in Paystack dashboard.
- [ ] **Paystack Webhook Verified**: Webhook endpoint `https://<project-ref>.supabase.co/functions/v1/paystack-webhook` receives `charge.success`, verifies HMAC signature, and updates office subscription.
- [ ] **Paystack Live Keys Configured**: Replaced test keys with live `pk_live_...` in frontend configuration and `sk_live_...` in Supabase Secrets.

---

## 5. Background Jobs & Scheduling
- [ ] **Reminder Cron Configured**: `pg_cron` schedule `process-daily-reminders` created in Supabase SQL editor (`0 7 * * *`).
- [ ] **Milestone Celebrations Verified**: Earning entry &ge; ₦50,000 generates celebration notification.

---

## 6. Domain, DNS & SSL
- [ ] **Vercel / Hosting Domain Configured**: `app.legacyosapp.com` resolves with active SSL.
- [ ] **Wildcard Domain Configured**: `*.legacyosapp.com` CNAME points to hosting provider.
- [ ] **SSL Verified**: Valid HTTPS certificate active on root and tenant subdomains.

---

## 7. End-to-End User Flow Smoke Tests
- [ ] **New Office Signup Tested**: Created a new office via `/signup` with 30-day trial activated.
- [ ] **New Member Signup Tested**: Member registered via `/#/o/:slug/join` correctly assigned to target office.
- [ ] **Cross-Tenant Isolation Tested**: Verified Office A cannot view or alter Office B members, earnings, or attendance.
- [ ] **Mobile Tested**: Verified on mobile widths (&le; 580px) that modals, dashboards, and attendance QR views fit without clipping.
- [ ] **Production Smoke Test Completed**: Realtime updates, attendance check-in, and leaderboard rankings operating cleanly.
