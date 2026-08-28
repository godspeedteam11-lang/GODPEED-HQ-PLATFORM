# AUDIT REQUEST FOR CLAUDE AI — GODSPEED HQ PLATFORM

Please conduct a comprehensive technical, security, architecture, and compliance audit of the **GODSPEED HQ Platform** repository against the **GODSPEED HQ Comprehensive Product Requirements Document (PRD v1.1)**.

---

## 🌐 1. REPOSITORY OVERVIEW & DEPLOYMENT

- **GitHub Repository**: `https://github.com/godspeedteam11-lang/GODPEED-HQ-PLATFORM.git`
- **Frontend Stack**: Vanilla HTML5, ES6 JavaScript, CSS3 (Custom Design System with CSS Custom Properties).
- **Backend / DB Stack**: Supabase Cloud PostgreSQL, Supabase Auth (`auth.users`), PostGIS Geofencing (`POINT(5.2058 7.2571)` for HQ Akure), Row-Level Security (RLS).
- **Deployment**: Vercel (Auto-deployed from `origin/main`).

---

## 🏛️ 2. TWO-PORTAL ARCHITECTURE SUMMARY

1. **Portal 1 — Member & Public Portal (`index.html`)**:
   - Public Landing Page (`/`)
   - Member Sign Up (`/signup`) — Server-enforced `role = 'member'`, read-only office locked to **GODSPEED HQ Akure** (`HQ-AKR`).
   - Member Sign In (`/login`) — Authenticates via Supabase Auth SDK (`signInWithPassword`).
   - Personal Member Dashboard (`/dashboard`) — Personal rank, PPV/QPV, attendance, freelance split, 10/20/70 ledger, tasks, and learning.
   - Upline / Team Subtree View (`/team`) — Authorised descendants subtree view.
   - Office Dashboard (`/office-dashboard`) — Team Leader office management and live member rank editing.

2. **Portal 2 — Super Admin Control Center (`admin.html`)**:
   - Private Entry Point (`admin.html` / `admin.godspeedhq.com`).
   - Dedicated Administrator Sign In form.
   - Strict Authorization Boundary (`is_super_admin()` RPC check). Non-Super Admins receive a `403 Forbidden` screen (`#view-admin-denied`).
   - Master Organization Dashboard (`/admin/dashboard`) — Global member count, active office monitoring, global rank distribution, system configuration, live rank & role management.

---

## 🛡️ 3. CORE SECURITY & AUTHORIZATION HIGHLIGHTS

1. **Server-Enforced Role Assignment**:
   - PostgreSQL trigger `on_auth_user_created` fires `public.handle_new_user_signup()` AFTER INSERT on `auth.users`.
   - Explicitly sets `role = 'member'` server-side regardless of any browser form payload tampering.

2. **Non-Recursive RLS Policies**:
   - Created `public.is_super_admin(p_user_id)` SECURITY DEFINER function with `search_path = public`.
   - Created `public.is_office_team_leader(p_user_id, p_office_id)` SECURITY DEFINER function.
   - Bypasses relation `members` self-referential RLS loops, completely eliminating PostgreSQL error `42P17` (`infinite recursion detected in policy for relation "members"`).

3. **Office Assignment Integrity**:
   - Official primary office: **GODSPEED HQ Akure** (`id: 33333333-3333-3333-3333-333333333333`, `code: HQ-AKR`).
   - `members.primary_office_id` remains a strict PostgreSQL `UUID`. String codes (`HQ-AKR`, `OFF-AKR`, `OFF-101`) deterministically resolve to the Akure office UUID.

4. **10/20/70 Freelance Earnings Split**:
   - Generated stored columns on `public.earnings_ledger`:
     - `office_due_10`: 10% auto-allocated to Office Dues ledger.
     - `personal_savings_20`: 20% auto-allocated to Personal Savings.
     - `business_fund_70`: 70% auto-allocated to Operating Business Fund.

5. **Live Rank & Role Management**:
   - Live Supabase database mutations (`updateMemberRank` / `updateMemberRole`) allowing Super Admins and Team Leaders to modify member ranks (`newbie`, `manager`, `senior_manager`, `executive_manager`, `director`, `sapphire_director`, `ruby_director`, `emerald_director`, `diamond_director`, `president_team`) and roles in real time.

---

## 📁 4. FILE MANIFEST FOR AUDIT

Below are the primary codebase files for your review:

### A. Database Schema & RLS Policies (`supabase/schema.sql`)
```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ENUM Types
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_leader', 'trainer', 'finance_officer', 'member');
CREATE TYPE neolife_rank AS ENUM ('newbie', 'manager', 'senior_manager', 'executive_manager', 'director', 'sapphire_director', 'ruby_director', 'emerald_director', 'diamond_director', 'president_team');

-- Offices Table
CREATE TABLE IF NOT EXISTS offices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    geofence_radius_meters INT DEFAULT 30,
    timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
    team_leader_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members Table (Referencing auth.users)
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    member_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30),
    sponsor_id UUID REFERENCES members(id) ON DELETE SET NULL,
    primary_office_id UUID REFERENCES offices(id) ON DELETE RESTRICT,
    role user_role DEFAULT 'member',
    official_rank neolife_rank DEFAULT 'newbie',
    highest_achieved_rank neolife_rank DEFAULT 'newbie',
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    biometric_enrolled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Office (GODSPEED HQ Akure)
INSERT INTO offices (id, code, name, address, location, geofence_radius_meters, timezone)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 'HQ-AKR', 'GODSPEED HQ Akure', 'Akure, Ondo State, Nigeria', ST_SetSRID(ST_MakePoint(5.2058, 7.2571), 4326)::geography, 30, 'Africa/Lagos')
ON CONFLICT (code) DO NOTHING;

-- SECURITY DEFINER Helper Functions
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
    v_role user_role;
BEGIN
    IF p_user_id IS NULL THEN RETURN FALSE; END IF;
    SELECT role INTO v_role FROM public.members WHERE id = p_user_id;
    RETURN v_role = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_office_team_leader(p_user_id UUID, p_office_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_leader BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_office_id IS NULL THEN RETURN FALSE; END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.members
        WHERE id = p_user_id
          AND (role = 'team_leader' OR role = 'super_admin')
          AND primary_office_id = p_office_id
    ) INTO v_is_leader;
    RETURN v_is_leader;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Non-Recursive RLS Policies
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own record" ON public.members
FOR SELECT USING (id = auth.uid());

CREATE POLICY "Super Admins access all members" ON public.members
FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Team Leaders view office members" ON public.members
FOR SELECT USING (public.is_office_team_leader(auth.uid(), primary_office_id));

-- Trigger Function for Auto Profile Creation
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
    v_office_id UUID;
    v_sponsor_uuid UUID;
    v_raw_office TEXT;
BEGIN
    v_raw_office := COALESCE(NEW.raw_user_meta_data->>'office_id', NEW.raw_user_meta_data->>'office', 'HQ-AKR');

    SELECT id INTO v_office_id FROM public.offices
    WHERE id::text = v_raw_office OR code = v_raw_office OR code = 'HQ-AKR'
    LIMIT 1;

    IF v_office_id IS NULL THEN
        SELECT id INTO v_office_id FROM public.offices WHERE code = 'HQ-AKR';
    END IF;

    INSERT INTO public.members (
        id, member_code, full_name, email, phone, sponsor_id, role, official_rank, primary_office_id, onboarding_completed
    ) VALUES (
        NEW.id,
        'GSD-' || UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 6)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Member'),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        v_sponsor_uuid,
        'member'::user_role,
        'newbie'::neolife_rank,
        v_office_id,
        FALSE
    ) ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();
```

---

## 🔍 AUDIT SCOPE & QUESTIONS FOR CLAUDE AI

1. **Security & Authorization Review**:
   - Are there any potential privilege escalation routes or bypasses in the client controllers or Supabase RLS policies?
   - Is server-side role enforcement on `handle_new_user_signup()` 100% resilient against malicious user metadata payloads?

2. **Genealogy & RLS Scaling**:
   - Does the `genealogy_closure` table query pattern scale efficiently for large downlines ($\ge 10,000$ members)?

3. **Data Integrity & Financial Allocation**:
   - Is the 10/20/70 stored column calculation mathematically accurate across edge cases (e.g. fractional NGN currency splits)?

4. **Production Readiness**:
   - What recommendations do you have for zero-downtime deployment, environment variable management, and automated test coverage?

---
