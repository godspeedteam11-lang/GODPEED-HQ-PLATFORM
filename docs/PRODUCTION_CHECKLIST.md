# LegacyOS — Production Launch Checklist

Use this checklist to verify external service configurations, database constraints, and deployment readiness before onboarding paying customers.

---

## 1. Database & Security Verification
- [ ] **Supabase Database Verified**: All 22 tables deployed (`offices`, `members`, `genealogy_closure`, `attendance_logs`, `office_dues`, `pv_submissions`, `earnings_ledger`, `health_scores`, `chat_messages`, `community_posts`, `notice_board`, `director_networks`, `network_offices`, `training_classes`, `training_class_members`, `training_sessions`, `training_attendance`, `subscription_plans`, `subscriptions`, `subscription_events`, `notifications`, `payment_transactions`).
- [ ] **RLS Verified**: Row-Level Security enabled on all 22 tables; cross-tenant query tests return empty results for unauthorized tenants.
- [ ] **Signup Trigger Verified**: `handle_new_user_signup()` requires valid tenant ID/slug and throws an exception on invalid input.
- [ ] **Member Limit Trigger Verified**: `trg_enforce_office_member_limit` halts inserts on Starter plan when active member count reaches 49.
- [ ] **Subscriptions Schema Verified**: `subscriptions.billing_cycle` with CHECK constraint `('monthly', 'annual')` active and populated.
- [ ] **Attendance Snapshots Verified**: `attendance_logs.snapshot_url` column active for facial capture storage paths.

---

## 2. Storage & Assets
- [ ] **Storage Buckets Created**: Buckets `office-assets` (Public), `member-avatars` (Public), and `attendance-snapshots` (Private) created in Supabase Storage.
- [ ] **Storage Policies Verified**:
  - `office-assets`: Path `{office_id}/{filename}` writable by Team Leaders and Super Admins.
  - `member-avatars`: Path `{member_id}/{filename}` writable by the respective authenticated member.
  - `attendance-snapshots`: Path `{office_id}/{member_id}/{snapshot_id}.jpg` uploadable by authenticated member, readable by Team Leader/Super Admin.

---

## 3. Realtime & Edge Functions
- [ ] **Realtime Verified**: Publication `supabase_realtime` enabled for `earnings_ledger`, `notifications`, `training_sessions`, `training_attendance`, and `chat_messages`.
- [ ] **Edge Functions Deployed**: `paystack-webhook` and `cron-reminders` deployed via `supabase functions deploy`.
- [ ] **Supabase Secrets Configured**: `PAYSTACK_SECRET_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` set in Supabase Edge Functions.

---

## 4. Payment Gateway (Paystack)
- [ ] **Paystack Public Key Configured**: Configured via `window.LEGACYOS_PAYSTACK_PUBLIC_KEY` or `window.GODSPEED_CONFIG.PAYSTACK_PUBLIC_KEY` without hardcoded placeholder keys.
- [ ] **Paystack Test Transaction Completed**: Completed sandbox transaction on Starter Monthly (₦7,500) and confirmed status in Paystack dashboard.
- [ ] **Paystack Webhook Verified**: Webhook endpoint `https://<project-ref>.supabase.co/functions/v1/paystack-webhook` receives `charge.success`, verifies HMAC-SHA512 signature, fails closed on invalid/missing signatures, and activates subscription via `service_role` RPC.
- [ ] **Paystack Live Keys Configured**: Live `pk_live_...` in frontend configuration and `sk_live_...` in Supabase Secrets.

---

## 5. Background Jobs & Scheduling
- [ ] **Reminder Cron Configured**: `pg_cron` schedule `process-daily-reminders` created in Supabase SQL editor (`0 7 * * *`) executing `public.process_automated_reminders()`.
- [ ] **Milestone Celebrations Verified**: Earning entry &ge; ₦50,000 generates celebration notification banner.

---

## 6. Domain, DNS & SSL
- [ ] **Vercel / Hosting Domain Configured**: `app.legacyosapp.com` resolves with active SSL.
- [ ] **Wildcard Domain Configured**: `*.legacyosapp.com` CNAME points to hosting provider.
- [ ] **SSL Verified**: Valid HTTPS certificate active on root and tenant subdomains.

---

## 7. End-to-End User Flow Smoke Tests
- [ ] **New Office Signup Tested**: Created a new office via `/signup` with 30-day trial activated and creator promoted to `team_leader`.
- [ ] **New Member Signup Tested**: Member registered via `/#/o/:slug/join` correctly assigned to target office with `role = 'member'`.
- [ ] **Cross-Tenant Isolation Tested**: Verified Office A members cannot view or alter Office B members, earnings, attendance logs, or private office metadata.
- [ ] **Mobile Tested**: Verified on mobile widths (&le; 580px) that modals, dashboards, and attendance QR views fit without clipping.
- [ ] **Production Smoke Test Completed**: Realtime updates, attendance check-in, dues tracking, and leaderboard rankings operating cleanly.
