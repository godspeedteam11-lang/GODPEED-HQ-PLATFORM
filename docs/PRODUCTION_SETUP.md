# LegacyOS — Production Setup & External Infrastructure Guide

This guide documents the complete manual setup required for external cloud infrastructure (Supabase Cloud, Paystack, Domain/DNS, and Storage) to launch the **LegacyOS** SaaS platform.

---

## 1. Supabase Storage Configuration

LegacyOS requires three distinct storage buckets in Supabase Storage.

### Bucket Definitions

| Bucket Name | Public Access | Max File Size | Allowed MIME Types | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `office-assets` | **Public** | 5 MB | `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp` | Custom office logos and tenant branding assets. |
| `member-avatars` | **Public** | 2 MB | `image/png`, `image/jpeg`, `image/webp` | Member profile pictures. |
| `attendance-snapshots` | **Private** | 2 MB | `image/jpeg`, `image/webp` | Facial verification captures for attendance logs. |

### Storage Folder / Path Structure

* **`office-assets/`**:
  * Path pattern: `logos/{office_id}/logo.{ext}`
  * Example: `logos/d9b2d63d-a169-424a-9b5b-0123456789ab/logo.png`
* **`member-avatars/`**:
  * Path pattern: `avatars/{member_id}/avatar.{ext}`
  * Example: `avatars/f7812bc4-3b2e-4344-9fa2-887766554433/avatar.jpg`
* **`attendance-snapshots/`**:
  * Path pattern: `snapshots/{office_id}/{YYYY-MM-DD}/{log_id}.jpg`
  * Example: `snapshots/d9b2d63d-a169-424a-9b5b-0123456789ab/2026-08-31/att-001.jpg`

### Database Tables Referencing Storage URLs

* `public.offices.logo_url` &rarr; references `office-assets` public URL.
* `public.members.avatar_url` &rarr; references `member-avatars` public URL.
* `public.attendance_logs.snapshot_url` &rarr; references `attendance-snapshots` signed / private path.

### Storage RLS Policies (Run in Supabase SQL Editor)

```sql
-- 1. office-assets: Public read, team leader upload
CREATE POLICY "Public Read Office Assets" ON storage.objects
    FOR SELECT USING (bucket_id = 'office-assets');

CREATE POLICY "Team Leaders Upload Office Assets" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'office-assets' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Team Leaders Update Office Assets" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'office-assets' 
        AND auth.role() = 'authenticated'
    );

-- 2. member-avatars: Public read, self upload
CREATE POLICY "Public Read Member Avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'member-avatars');

CREATE POLICY "Members Upload Own Avatar" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'member-avatars' 
        AND auth.uid()::text = (storage.foldername(name))[2]
    );

-- 3. attendance-snapshots: Office-scoped read/write
CREATE POLICY "Members Upload Attendance Snapshot" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'attendance-snapshots' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Team Leaders Read Attendance Snapshots" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'attendance-snapshots' 
        AND auth.role() = 'authenticated'
    );
```

---

## 2. Supabase Realtime Replication

The following tables must have Realtime enabled in the **Supabase Dashboard &rarr; Database &rarr; Publications (`supabase_realtime`)**:

1. `public.earnings_ledger` — Triggers instant live earnings recalculations on the leaderboard.
2. `public.notifications` — Dispatches instant toast alerts and celebration milestone banners.
3. `public.training_sessions` — Refreshes scheduled class sessions without page reloads.
4. `public.training_attendance` — Updates real-time training roll call.
5. `public.chat_messages` — Dispatches instant team chat communication.

### Verification SQL

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.earnings_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
```

---

## 3. Supabase Edge Functions

The repository includes ready-to-deploy TypeScript functions in `supabase/functions/`.

### Function 1: `paystack-webhook`
* **Path**: `supabase/functions/paystack-webhook/index.ts`
* **Purpose**: Receives server-to-server POST requests from Paystack, verifies the `x-paystack-signature` HMAC SHA512 header, and securely invokes `public.handle_paystack_webhook` using the Supabase Service Role key.
* **Required Secrets**: `PAYSTACK_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
* **Deployment Command**:
  ```bash
  supabase functions deploy paystack-webhook --no-verify-jwt
  ```
* **Expected Endpoint**:
  `https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook`

### Function 2: `cron-reminders`
* **Path**: `supabase/functions/cron-reminders/index.ts`
* **Purpose**: Automated dispatcher invoked on schedule to execute `public.process_automated_reminders()`.
* **Required Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
* **Deployment Command**:
  ```bash
  supabase functions deploy cron-reminders
  ```
* **Expected Endpoint**:
  `https://<your-project-ref>.supabase.co/functions/v1/cron-reminders`

---

## 4. Supabase Secrets (Environment Variables)

Configure these secrets in **Supabase Dashboard &rarr; Settings &rarr; Edge Functions &rarr; Secrets** (or via `supabase secrets set`):

| Secret Name | Purpose | Location Where Secret is Sourced |
| :--- | :--- | :--- |
| `PAYSTACK_SECRET_KEY` | Paystack Live/Test Secret Key (`sk_live_...` or `sk_test_...`) | Paystack Dashboard &rarr; Settings &rarr; API Keys & Webhooks |
| `SUPABASE_URL` | Cloud project URL (`https://<project-ref>.supabase.co`) | Supabase Dashboard &rarr; Settings &rarr; API |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged Backend Admin Key | Supabase Dashboard &rarr; Settings &rarr; API &rarr; `service_role` secret |

> [!CAUTION]
> Never commit actual secret values into Git repositories or expose them to frontend JavaScript.

---

## 5. Supabase Cron Scheduler (`pg_cron`)

To run reminders 24/7 in the background without requiring user browser activity, enable `pg_cron` in Supabase SQL Editor.

### SQL Setup for Daily Automated Reminders

```sql
-- 1. Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule automated reminder engine daily at 08:00 AM West Africa Time (WAT / UTC+1 -> 07:00 UTC)
SELECT cron.schedule(
    'process-daily-reminders',
    '0 7 * * *', -- 07:00 UTC = 08:00 AM West Africa Time (WAT)
    $$ SELECT public.process_automated_reminders(); $$
);

-- 3. Verify Scheduled Cron Jobs
SELECT * FROM cron.job;
```

---

## 6. Paystack Configuration

### API Keys
1. **Frontend Public Key**:
   * Sourced from: Paystack Dashboard &rarr; Settings &rarr; API Keys & Webhooks &rarr; **Public Key** (`pk_live_...`).
   * Configured in frontend via `window.LEGACYOS_PAYSTACK_PUBLIC_KEY = 'pk_live_...'`.
2. **Server Secret Key**:
   * Sourced from: Paystack Dashboard &rarr; Settings &rarr; API Keys & Webhooks &rarr; **Secret Key** (`sk_live_...`).
   * Configured in Supabase Edge Function secret `PAYSTACK_SECRET_KEY`.

### Webhook Configuration
1. Go to **Paystack Dashboard &rarr; Settings &rarr; Preferences &rarr; API Keys & Webhooks**.
2. Set **Live Webhook URL** to:
   `https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook`
3. Set **Test Webhook URL** to the same endpoint during sandbox verification.

### Test & Live Verification Procedure
1. **Test Mode**:
   * Use Paystack test card (`4084 0840 0840 0840`, exp: `12/30`, CVV: `408`, OTP: `12345`).
   * Complete payment popup.
   * Verify that transaction appears in Paystack Dashboard with status `success`.
   * Verify that office subscription transitions from `trial` to `active`.
2. **Live Mode**:
   * Switch Paystack toggle to **Live Mode**.
   * Replace public key with `pk_live_...` and secret key in Supabase Secrets with `sk_live_...`.
   * Execute a real card transaction of ₦7,500 (Starter Monthly) or ₦18,000 (Growth Monthly).

---

## 7. Domain & DNS Configuration

### DNS Records (Cloudflare / Namecheap / GoDaddy / Vercel)

| Type | Name / Host | Target / Value | TTL | Proxy Status |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `app` | `cname.vercel-dns.com` (or your hosting target) | Auto | DNS Only / Proxied |
| **CNAME** | `*` (Wildcard) | `cname.vercel-dns.com` (or your hosting target) | Auto | DNS Only / Proxied |

### Subdomain Routing Support

The LegacyOS codebase natively supports **both** routing paradigms simultaneously:
1. **True Subdomain Routing**: `https://office-slug.legacyosapp.com`
   * Automatically extracts `office-slug` from `window.location.hostname` when the host has 3+ parts and is not `app` / `www`.
2. **Hash Slug Routing**: `https://app.legacyosapp.com/#/o/office-slug`
   * Supported out of the box for environments without wildcard DNS.
   * Direct registration link: `https://app.legacyosapp.com/#/o/office-slug/join`
