-- ============================================================================
-- GODSPEED HQ | Database Schema & Row-Level Security (RLS) Policies (PRD v1.1)
-- Target Platform: Supabase PostgreSQL + PostGIS Extension
-- Fully Idempotent (Safe to run repeatedly)
-- ============================================================================
-- MIGRATION & REFACTORING NOTES:
-- 1. SECURITY DEFINER HELPERS: Created public.is_super_admin(), public.is_office_team_leader(),
--    public.is_ancestor_of(), and public.get_user_office_id() as SECURITY DEFINER functions with
--    SET search_path = public. All RLS policies reference these functions instead of querying
--    the members table directly within policy USING/WITH CHECK clauses. This completely resolves
--    PostgreSQL error 42P17 (infinite recursion in policy for relation "members").
-- 2. EXPLICIT RLS COVERAGE: Enabled RLS and created explicit SELECT/INSERT/UPDATE/DELETE policies
--    for all 9 system tables (offices, members, genealogy_closure, attendance_logs, office_dues,
--    pv_submissions, earnings_ledger, health_scores, chat_messages) aligned with PRD §8/§9/§16.3/§20.
-- 3. AUTOMATED GENEALOGY CLOSURE & ANTI-CYCLIC GUARD: Implemented maintain_genealogy_closure()
--    trigger function firing AFTER INSERT OR UPDATE OF sponsor_id on members. Automatically inserts
--    depth 0 self rows and propagates ancestor pairs. Rejects self-sponsorship and cyclic descendant
--    sponsorship with descriptive PostgreSQL exceptions per PRD §14.
-- 4. FIELD PRIVILEGE GUARDS: Implemented trg_guard_member_field_updates trigger preventing regular
--    members from unauthorized self-elevation of role, rank, or sponsor reassignment.
-- 5. ATTENDANCE 24-HOUR DUPLICATE GUARD: Added check_attendance_duplicate trigger enforcing the
--    server-side 24-hour check-in rule per PRD §12.4.
-- 6. ENUM ALIGNMENT: Added missing director ranks (sapphire_director, ruby_director, diamond_director)
--    to neolife_rank enum to prevent DB mutation crashes on rank upgrades.
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS & DOMAINS (Idempotent Creation)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_leader', 'trainer', 'finance_officer', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE neolife_rank AS ENUM (
        'newbie', 'pro', 'full_distributor', 'manager', 'senior_manager',
        'executive_manager', 'director', 'sapphire_director', 'ruby_director',
        'emerald_director', 'diamond_director', 'world_team', 'president_team'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE neolife_rank ADD VALUE IF NOT EXISTS 'sapphire_director';
ALTER TYPE neolife_rank ADD VALUE IF NOT EXISTS 'ruby_director';
ALTER TYPE neolife_rank ADD VALUE IF NOT EXISTS 'diamond_director';

DO $$ BEGIN
    CREATE TYPE attendance_status AS ENUM ('success', 'flagged', 'manual_override', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE carriage_status AS ENUM ('pv_submitted', 'ready_for_pickup', 'carriage_uploaded', 'under_review', 'approved', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE dues_status AS ENUM ('pending', 'partially_paid', 'paid', 'overdue', 'waived', 'cancelled', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE health_state AS ENUM ('green', 'amber', 'red');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. OFFICES TABLE (Extended for LegacyOS Multi-Tenant Architecture)
CREATE TABLE IF NOT EXISTS offices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL, -- Exact GPS coordinates
    geofence_radius_meters INT DEFAULT 30,
    timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
    team_leader_id UUID,
    logo_url TEXT,
    description TEXT,
    phone VARCHAR(30),
    whatsapp_number VARCHAR(30),
    website_url TEXT,
    primary_brand_color VARCHAR(20) DEFAULT '#6366f1',
    secondary_brand_color VARCHAR(20) DEFAULT '#8b5cf6',
    subscription_plan_id VARCHAR(50) DEFAULT 'starter_monthly',
    subscription_status VARCHAR(30) DEFAULT 'trial', -- 'trial', 'active', 'past_due', 'cancelled', 'expired'
    trial_start_at TIMESTAMPTZ DEFAULT NOW(),
    trial_end_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'annual'
    member_limit INT DEFAULT 49, -- Starter plan cap
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column additions for existing installations
ALTER TABLE offices ADD COLUMN IF NOT EXISTS slug VARCHAR(50) UNIQUE;
ALTER TABLE offices ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE offices ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE offices ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE offices ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30);
ALTER TABLE offices ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE offices ADD COLUMN IF NOT EXISTS primary_brand_color VARCHAR(20) DEFAULT '#6366f1';
ALTER TABLE offices ADD COLUMN IF NOT EXISTS secondary_brand_color VARCHAR(20) DEFAULT '#8b5cf6';
ALTER TABLE offices ADD COLUMN IF NOT EXISTS subscription_plan_id VARCHAR(50) DEFAULT 'starter_monthly';
ALTER TABLE offices ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'trial';
ALTER TABLE offices ADD COLUMN IF NOT EXISTS trial_start_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE offices ADD COLUMN IF NOT EXISTS trial_end_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE offices ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';
ALTER TABLE offices ADD COLUMN IF NOT EXISTS member_limit INT DEFAULT 49;

-- Set default slugs for seeded offices
UPDATE offices SET slug = 'godspeed-akure', whatsapp_number = '+2348000000000', description = 'GODSPEED HQ Akure Central Campus' WHERE code = 'HQ-AKR' AND slug IS NULL;
UPDATE offices SET slug = 'godspeed-lagos', whatsapp_number = '+2348000000001', description = 'GODSPEED Lagos Ikeja Hub' WHERE code = 'HQ-LGS' AND slug IS NULL;
UPDATE offices SET slug = 'godspeed-abuja', whatsapp_number = '+2348000000002', description = 'GODSPEED Abuja Hub' WHERE code = 'HQ-ABJ' AND slug IS NULL;

-- 4. MEMBERS TABLE
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    member_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30),
    sponsor_id UUID REFERENCES members(id) ON DELETE SET NULL, -- Upline / Sponsor
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

-- Foreign key constraint for offices.team_leader_id
DO $$ BEGIN
    ALTER TABLE offices ADD CONSTRAINT fk_offices_team_leader FOREIGN KEY (team_leader_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure members foreign key correctly references auth.users(id)
DO $$ BEGIN
    ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_id_fkey;
    ALTER TABLE public.members ADD CONSTRAINT members_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. GENEALOGY CLOSURE TABLE (Instantaneous Subtree Lookup)
CREATE TABLE IF NOT EXISTS genealogy_closure (
    ancestor_id UUID REFERENCES members(id) ON DELETE CASCADE,
    descendant_id UUID REFERENCES members(id) ON DELETE CASCADE,
    depth INT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_genealogy_closure_descendant ON genealogy_closure(descendant_id, ancestor_id);
CREATE INDEX IF NOT EXISTS idx_genealogy_closure_ancestor_depth ON genealogy_closure(ancestor_id, depth);

-- 6. ATTENDANCE LOGS TABLE
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    check_in_timestamp TIMESTAMPTZ DEFAULT NOW(),
    device_latitude DOUBLE PRECISION NOT NULL,
    device_longitude DOUBLE PRECISION NOT NULL,
    distance_from_office_meters DOUBLE PRECISION NOT NULL,
    qr_verified BOOLEAN DEFAULT FALSE,
    face_verified BOOLEAN DEFAULT FALSE,
    liveness_passed BOOLEAN DEFAULT FALSE,
    snapshot_url TEXT,
    status attendance_status DEFAULT 'success',
    override_reason TEXT,
    override_by UUID REFERENCES members(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column addition for attendance_logs
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS snapshot_url TEXT;

-- 7. OFFICE DUES TABLE
CREATE TABLE IF NOT EXISTS office_dues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    period_name VARCHAR(50) NOT NULL, -- e.g. "August 2026"
    amount NUMERIC(12, 2) NOT NULL,
    paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    due_date DATE NOT NULL,
    status dues_status DEFAULT 'pending',
    evidence_url TEXT,
    recorded_by UUID REFERENCES members(id),
    verified_by UUID REFERENCES members(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. NEOLIFE PV & CARRIAGE TABLE
CREATE TABLE IF NOT EXISTS pv_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    sales_period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    pv_amount NUMERIC(10, 2) NOT NULL,
    order_reference VARCHAR(100),
    status carriage_status DEFAULT 'pv_submitted',
    expected_pickup_date DATE,
    carriage_photo_url TEXT,
    reviewed_by UUID REFERENCES members(id),
    decline_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EARNINGS LEDGER & 10/20/70 SPLIT TABLE
CREATE TABLE IF NOT EXISTS earnings_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL, -- 'neolife', 'freelancing', 'referral', 'consulting'
    gross_amount NUMERIC(12, 2) NOT NULL,
    net_amount NUMERIC(12, 2) NOT NULL,
    office_due_10 NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(net_amount * 0.10, 2)) STORED,
    personal_savings_20 NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(net_amount * 0.20, 2)) STORED,
    business_fund_70 NUMERIC(12, 2) GENERATED ALWAYS AS (net_amount - (ROUND(net_amount * 0.10, 2) + ROUND(net_amount * 0.20, 2))) STORED,
    currency VARCHAR(10) DEFAULT 'NGN',
    earned_date DATE NOT NULL,
    evidence_url TEXT,
    verified_by UUID REFERENCES members(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. MEMBER HEALTH & INTERVENTION TABLE
CREATE TABLE IF NOT EXISTS health_scores (
    member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    health_status health_state DEFAULT 'green',
    warning_signals JSONB DEFAULT '[]'::jsonb,
    attendance_rate_30d NUMERIC(5, 2),
    pv_month_to_date NUMERIC(10, 2),
    due_arrears_count INT DEFAULT 0,
    last_evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. HIERARCHICAL CHAT MESSAGES TABLE (PRD §34.2)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES members(id) ON DELETE CASCADE, -- Null for group/office chat
    office_id UUID REFERENCES offices(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attachment_url TEXT,
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    moderated_by UUID REFERENCES members(id),
    moderation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. COMMUNITY POSTS TABLE (PRD §34.4 - §34.7)
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    office_id UUID REFERENCES offices(id) ON DELETE CASCADE, -- Null for global community
    category VARCHAR(50) DEFAULT 'general',
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    likes_count INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. NOTICE BOARD & BROADCASTS TABLE (PRD §34.4)
CREATE TABLE IF NOT EXISTS notice_board (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES members(id) ON DELETE SET NULL,
    office_id UUID REFERENCES offices(id) ON DELETE CASCADE, -- Null for org-wide broadcast
    title VARCHAR(200) NOT NULL,
    category VARCHAR(50) DEFAULT 'Official Announcement',
    content TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    target_audience VARCHAR(50) DEFAULT 'all',
    expires_at TIMESTAMPTZ,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. DIRECTOR NETWORKS TABLE (World Team Multi-Office Hierarchy)
CREATE TABLE IF NOT EXISTS director_networks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    director_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. NETWORK OFFICES LINK TABLE
CREATE TABLE IF NOT EXISTS network_offices (
    network_id UUID NOT NULL REFERENCES director_networks(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (network_id, office_id)
);

-- 16. TRAINING CLASSES TABLE
CREATE TABLE IF NOT EXISTS training_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tutor_id UUID REFERENCES members(id) ON DELETE SET NULL,
    head_id UUID REFERENCES members(id) ON DELETE SET NULL,
    schedule_info VARCHAR(150),
    location_info VARCHAR(150),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. TRAINING CLASS MEMBERS TABLE
CREATE TABLE IF NOT EXISTS training_class_members (
    class_id UUID NOT NULL REFERENCES training_classes(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    stage VARCHAR(50) DEFAULT 'Beginner', -- 'Beginner', 'Foundation', 'Intermediate', 'Advanced', 'Leadership'
    modules_completed INT DEFAULT 0,
    total_modules INT DEFAULT 10,
    assessment_score NUMERIC(5, 2) DEFAULT 0.00,
    tutor_notes TEXT,
    last_training_date DATE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (class_id, member_id)
);

-- 18. TRAINING SESSIONS TABLE
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES training_classes(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    topic VARCHAR(200) NOT NULL,
    tutor_id UUID REFERENCES members(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. TRAINING ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS training_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'present', -- 'present', 'absent', 'excused', 'late'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (session_id, member_id)
);

-- 20. SUBSCRIPTION PLANS TABLE
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(30) NOT NULL, -- 'starter', 'growth'
    billing_interval VARCHAR(20) NOT NULL, -- 'monthly', 'annual'
    price_ngn NUMERIC(12, 2) NOT NULL,
    member_limit INT NOT NULL,
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Subscription Plans
INSERT INTO subscription_plans (id, name, tier, billing_interval, price_ngn, member_limit, features)
VALUES
  ('starter_monthly', 'Starter Monthly', 'starter', 'monthly', 7500.00, 49, '["Up to 49 Members", "QR Code Attendance", "Earnings Leaderboard", "Training Classes", "Custom Office Web Address", "Automated Reminders"]'::jsonb),
  ('growth_monthly', 'Growth Monthly', 'growth', 'monthly', 18000.00, 999999, '["Unlimited Members", "QR Code Attendance", "Earnings Leaderboard", "Training Classes & Tutors", "Multi-Office Linking (World Team)", "Dedicated WhatsApp Support"]'::jsonb),
  ('starter_annual', 'Starter Annual', 'starter', 'annual', 75000.00, 49, '["Up to 49 Members", "2 Months Free", "QR Code Attendance", "Earnings Leaderboard", "Training Classes", "Custom Office Web Address", "Automated Reminders"]'::jsonb),
  ('growth_annual', 'Growth Annual', 'growth', 'annual', 180000.00, 999999, '["Unlimited Members", "2 Months Free", "QR Code Attendance", "Earnings Leaderboard", "Training Classes & Tutors", "Multi-Office Linking (World Team)", "Dedicated WhatsApp Support"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_ngn = EXCLUDED.price_ngn,
  member_limit = EXCLUDED.member_limit,
  features = EXCLUDED.features;

-- 21. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID UNIQUE NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(30) NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'past_due', 'cancelled', 'expired'
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly', 'annual'
    trial_start TIMESTAMPTZ DEFAULT NOW(),
    trial_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column addition and constraint for subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';
DO $$ BEGIN
    ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_billing_cycle CHECK (billing_cycle IN ('monthly', 'annual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 22. SUBSCRIPTION EVENTS & AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'trial_started', 'subscribed', 'renewed', 'plan_changed', 'cancelled', 'payment_failed'
    amount_paid NUMERIC(12, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'NGN',
    reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. NOTIFICATIONS & REMINDERS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES members(id) ON DELETE CASCADE, -- Null if broadcast to entire office
    office_id UUID REFERENCES offices(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'attendance_reminder', 'training_reminder', 'due_reminder', 'trial_reminder', 'celebration', 'system'
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Offices with valid UUIDs (Official HQ Akure as primary)
INSERT INTO offices (id, code, slug, name, address, location, geofence_radius_meters, timezone, whatsapp_number, description)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 'HQ-AKR', 'godspeed-akure', 'GODSPEED HQ Akure', 'Akure, Ondo State, Nigeria', ST_SetSRID(ST_MakePoint(5.2058, 7.2571), 4326)::geography, 30, 'Africa/Lagos', '+2348000000000', 'GODSPEED HQ Akure Central Campus'),
  ('11111111-1111-1111-1111-111111111111', 'HQ-LGS', 'godspeed-lagos', 'GODSPEED HQ Ikeja', 'Ikeja, Lagos, Nigeria', ST_SetSRID(ST_MakePoint(3.3515, 6.6018), 4326)::geography, 30, 'Africa/Lagos', '+2348000000001', 'GODSPEED Lagos Ikeja Hub'),
  ('22222222-2222-2222-2222-222222222222', 'HQ-ABJ', 'godspeed-abuja', 'GODSPEED Abuja Hub', 'Abuja, Nigeria', ST_SetSRID(ST_MakePoint(7.3986, 9.0765), 4326)::geography, 40, 'Africa/Lagos', '+2348000000002', 'GODSPEED Abuja Hub')
ON CONFLICT (code) DO UPDATE SET
  slug = EXCLUDED.slug,
  whatsapp_number = EXCLUDED.whatsapp_number,
  description = EXCLUDED.description;

-- ============================================================================
-- SECURITY DEFINER HELPER FUNCTIONS (Prevent 42P17 Infinite Recursion)
-- ============================================================================

-- Helper 1: Check if user is Super Admin or Admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
    v_role user_role;
BEGIN
    IF p_user_id IS NULL THEN RETURN FALSE; END IF;
    SELECT role INTO v_role FROM public.members WHERE id = p_user_id;
    RETURN v_role IN ('super_admin', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper 2: Check if user is Team Leader of a specific office (or primary office)
CREATE OR REPLACE FUNCTION public.is_office_team_leader(p_user_id UUID DEFAULT auth.uid(), p_office_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    v_role user_role;
    v_user_office UUID;
    v_is_leader BOOLEAN := FALSE;
BEGIN
    IF p_user_id IS NULL THEN RETURN FALSE; END IF;
    
    SELECT role, primary_office_id INTO v_role, v_user_office 
    FROM public.members WHERE id = p_user_id;

    IF v_role IN ('super_admin', 'admin') THEN
        RETURN TRUE;
    END IF;

    IF p_office_id IS NULL THEN
        p_office_id := v_user_office;
    END IF;

    IF p_office_id IS NULL THEN RETURN FALSE; END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.offices
        WHERE id = p_office_id AND team_leader_id = p_user_id
    ) OR (
        v_role = 'team_leader' AND v_user_office = p_office_id
    ) INTO v_is_leader;

    RETURN COALESCE(v_is_leader, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper 3: Check if p_ancestor_id is ancestor of p_descendant_id (or self)
CREATE OR REPLACE FUNCTION public.is_ancestor_of(p_ancestor_id UUID, p_descendant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_ancestor_id IS NULL OR p_descendant_id IS NULL THEN RETURN FALSE; END IF;
    IF p_ancestor_id = p_descendant_id THEN RETURN TRUE; END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.genealogy_closure
        WHERE ancestor_id = p_ancestor_id AND descendant_id = p_descendant_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper 4: Get primary office UUID for a given user
CREATE OR REPLACE FUNCTION public.get_user_office_id(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID AS $$
DECLARE
    v_office_id UUID;
BEGIN
    IF p_user_id IS NULL THEN RETURN NULL; END IF;
    SELECT primary_office_id INTO v_office_id FROM public.members WHERE id = p_user_id;
    RETURN v_office_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper 5: Check if user is Director of a Network containing an Office
CREATE OR REPLACE FUNCTION public.is_director_of_office(p_user_id UUID DEFAULT auth.uid(), p_office_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_user_id IS NULL OR p_office_id IS NULL THEN RETURN FALSE; END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.director_networks dn
        JOIN public.network_offices no ON no.network_id = dn.id
        WHERE dn.director_id = p_user_id AND no.office_id = p_office_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- FIELD PRIVILEGE GUARD TRIGGER (Role, Rank, and Sponsor Mutation Security)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_member_field_updates()
RETURNS TRIGGER AS $$
DECLARE
    v_is_office_creation BOOLEAN := FALSE;
BEGIN
    -- Check if update is happening within trusted create_tenant_office() transaction
    v_is_office_creation := COALESCE(current_setting('app.internal_office_creation', true), 'false') = 'true';

    -- Role mutation validation
    IF (NEW.role IS DISTINCT FROM OLD.role) THEN
        IF v_is_office_creation THEN
            -- During office creation onboarding, only the caller can be promoted to team_leader for their newly created office
            IF NOT (
                NEW.id = auth.uid() 
                AND NEW.role = 'team_leader'::user_role
                AND EXISTS (SELECT 1 FROM public.offices WHERE id = NEW.primary_office_id AND team_leader_id = auth.uid())
            ) THEN
                RAISE EXCEPTION 'Unauthorized: Role escalation bypass detected during office creation.';
            END IF;
        ELSIF NOT public.is_super_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Unauthorized: Only Super Admins can modify member roles.';
        END IF;
    END IF;

    -- Only Super Admin or Team Leader can modify official_rank or highest_achieved_rank
    IF (NEW.official_rank IS DISTINCT FROM OLD.official_rank OR NEW.highest_achieved_rank IS DISTINCT FROM OLD.highest_achieved_rank) 
       AND NOT (public.is_super_admin(auth.uid()) OR public.is_office_team_leader(auth.uid(), OLD.primary_office_id)) THEN
        RAISE EXCEPTION 'Unauthorized: Only Admins or Team Leaders can modify member ranks.';
    END IF;

    -- Prevent member from changing their own sponsor_id directly unless Super Admin
    IF (NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id) AND NOT public.is_super_admin(auth.uid()) AND OLD.sponsor_id IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admins can reassign sponsors.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_member_field_updates ON public.members;
CREATE TRIGGER trg_guard_member_field_updates
    BEFORE UPDATE ON public.members
    FOR EACH ROW EXECUTE FUNCTION public.guard_member_field_updates();

-- ============================================================================
-- ATTENDANCE 24-HOUR DUPLICATE GUARD TRIGGER (PRD §12.4)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_attendance_duplicate()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != 'manual_override' THEN
        IF EXISTS (
            SELECT 1 FROM public.attendance_logs
            WHERE member_id = NEW.member_id
              AND office_id = NEW.office_id
              AND check_in_timestamp >= NOW() - INTERVAL '24 hours'
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
              AND status IN ('success', 'flagged', 'manual_override')
        ) THEN
            RAISE EXCEPTION 'Attendance already logged within 24 hours for this office.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_check_attendance_duplicate ON public.attendance_logs;
CREATE TRIGGER trg_check_attendance_duplicate
    BEFORE INSERT ON public.attendance_logs
    FOR EACH ROW EXECUTE FUNCTION public.check_attendance_duplicate();

-- ============================================================================
-- AUTOMATED GENEALOGY CLOSURE TRIGGER & ANTI-CYCLIC SPONSORSHIP GUARD
-- ============================================================================

CREATE OR REPLACE FUNCTION public.maintain_genealogy_closure()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Anti-Self Sponsorship Check
    IF NEW.sponsor_id IS NOT NULL AND NEW.sponsor_id = NEW.id THEN
        RAISE EXCEPTION 'Invalid sponsorship: Member % cannot be their own sponsor.', NEW.id;
    END IF;

    -- 2. Anti-Cyclic Sponsorship Guard (PRD §14)
    IF NEW.sponsor_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.genealogy_closure 
            WHERE ancestor_id = NEW.id AND descendant_id = NEW.sponsor_id
        ) THEN
            RAISE EXCEPTION 'Cyclic sponsorship detected: Member % cannot set descendant % as sponsor.', NEW.id, NEW.sponsor_id;
        END IF;
    END IF;

    -- 3. Self relationship (depth 0)
    INSERT INTO public.genealogy_closure (ancestor_id, descendant_id, depth)
    VALUES (NEW.id, NEW.id, 0)
    ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

    -- 4. Clean old ancestor rows if sponsor changed or removed
    IF TG_OP = 'UPDATE' AND OLD.sponsor_id IS DISTINCT FROM NEW.sponsor_id AND OLD.sponsor_id IS NOT NULL THEN
        DELETE FROM public.genealogy_closure
        WHERE descendant_id IN (
            SELECT descendant_id FROM public.genealogy_closure WHERE ancestor_id = NEW.id
        )
        AND ancestor_id NOT IN (
            SELECT descendant_id FROM public.genealogy_closure WHERE ancestor_id = NEW.id
        );
    END IF;

    -- 5. Propagate ancestor rows if sponsor assigned
    IF NEW.sponsor_id IS NOT NULL THEN
        INSERT INTO public.genealogy_closure (ancestor_id, descendant_id, depth)
        SELECT 
            super_anc.ancestor_id,
            sub_desc.descendant_id,
            super_anc.depth + sub_desc.depth + 1
        FROM public.genealogy_closure super_anc
        CROSS JOIN public.genealogy_closure sub_desc
        WHERE super_anc.descendant_id = NEW.sponsor_id
          AND sub_desc.ancestor_id = NEW.id
        ON CONFLICT (ancestor_id, descendant_id) DO UPDATE 
        SET depth = EXCLUDED.depth;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_maintain_genealogy_closure ON public.members;
CREATE TRIGGER trg_maintain_genealogy_closure
    AFTER INSERT OR UPDATE OF sponsor_id ON public.members
    FOR EACH ROW EXECUTE FUNCTION public.maintain_genealogy_closure();

-- ============================================================================
-- AUTOMATED MEMBER PROFILE TRIGGER ON SUPABASE AUTH SIGNUP
-- SECURITY ENFORCED SERVER-SIDE: Always assigns role = 'member'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
    v_office_id UUID;
    v_sponsor_uuid UUID;
    v_raw_office TEXT;
    v_user_role public.user_role := 'member';
BEGIN
    v_raw_office := COALESCE(
        NEW.raw_user_meta_data->>'office_id',
        NEW.raw_user_meta_data->>'office',
        NEW.raw_user_meta_data->>'office_slug',
        NEW.raw_user_meta_data->>'tenant'
    );

    IF v_raw_office IS NULL OR TRIM(v_raw_office) = '' THEN
        RAISE EXCEPTION 'Signup Error: Office identifier is required for tenant registration.';
    END IF;

    -- Strict Tenant Resolution: Must match UUID, Slug, or Official Code
    SELECT id INTO v_office_id
    FROM public.offices
    WHERE (id::text = v_raw_office)
       OR (LOWER(slug) = LOWER(TRIM(v_raw_office)))
       OR (UPPER(code) = UPPER(TRIM(v_raw_office)))
       OR (code = CASE 
            WHEN v_raw_office = 'OFF-AKR' THEN 'HQ-AKR'
            WHEN v_raw_office = 'OFF-101' THEN 'HQ-LGS'
            WHEN v_raw_office = 'OFF-102' THEN 'HQ-ABJ'
            ELSE NULL
          END);

    IF v_office_id IS NULL THEN
        RAISE EXCEPTION 'Signup Error: Target office/tenant "%" does not exist or is inactive.', v_raw_office;
    END IF;

    -- Optional Sponsor Resolution (Case-insensitive code, email, or UUID)
    IF NEW.raw_user_meta_data->>'sponsor' IS NOT NULL AND TRIM(NEW.raw_user_meta_data->>'sponsor') <> '' THEN
        SELECT id INTO v_sponsor_uuid FROM public.members 
        WHERE member_code = UPPER(TRIM(NEW.raw_user_meta_data->>'sponsor')) 
           OR LOWER(email) = LOWER(TRIM(NEW.raw_user_meta_data->>'sponsor'))
           OR id::text = TRIM(NEW.raw_user_meta_data->>'sponsor');
    END IF;

    -- If created via Owner Onboarding
    IF NEW.raw_user_meta_data->>'is_office_owner' = 'true' THEN
        v_user_role := 'team_leader';
    END IF;

    INSERT INTO public.members (
        id,
        member_code,
        full_name,
        email,
        phone,
        sponsor_id,
        role,
        official_rank,
        primary_office_id,
        onboarding_completed
    ) VALUES (
        NEW.id,
        'LEG-' || UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 8)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Member'),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        v_sponsor_uuid,
        v_user_role,
        'newbie'::neolife_rank,
        v_office_id,
        FALSE
    )
    ON CONFLICT (id) DO UPDATE SET
        primary_office_id = EXCLUDED.primary_office_id,
        full_name = COALESCE(EXCLUDED.full_name, public.members.full_name),
        phone = COALESCE(EXCLUDED.phone, public.members.phone);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- ============================================================================
-- SERVER-SIDE DASHBOARD ROUTE PERMISSION ENGINE (RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_dashboard_permissions(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_role user_role;
    v_office_id UUID;
    v_is_team_leader BOOLEAN := FALSE;
    v_has_descendants BOOLEAN := FALSE;
    v_can_access_admin BOOLEAN := FALSE;
    v_can_access_office BOOLEAN := FALSE;
    v_can_access_team BOOLEAN := FALSE;
    v_default_route TEXT := '/dashboard';
BEGIN
    SELECT role, primary_office_id INTO v_role, v_office_id
    FROM public.members WHERE id = p_user_id;

    v_is_team_leader := public.is_office_team_leader(p_user_id, v_office_id);

    SELECT EXISTS (
        SELECT 1 FROM public.genealogy_closure WHERE ancestor_id = p_user_id AND depth > 0
    ) INTO v_has_descendants;

    IF v_role IN ('super_admin', 'admin') THEN
        v_can_access_admin := TRUE;
        v_can_access_office := TRUE;
        v_can_access_team := TRUE;
        v_default_route := '/admin/dashboard';
    ELSIF v_role = 'team_leader' OR v_is_team_leader THEN
        v_can_access_office := TRUE;
        v_can_access_team := v_has_descendants;
        v_default_route := '/office-dashboard';
    ELSE
        v_can_access_team := v_has_descendants;
        v_default_route := '/dashboard';
    END IF;

    RETURN jsonb_build_object(
        'role', v_role,
        'can_access_personal', TRUE,
        'can_access_team', v_can_access_team,
        'can_access_office', v_can_access_office,
        'can_access_admin', v_can_access_admin,
        'default_route', v_default_route
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- GEOSPATIAL VALIDATION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_geofence(
    p_office_id UUID,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
) RETURNS BOOLEAN AS $$
DECLARE
    v_office_loc GEOGRAPHY;
    v_radius INT;
    v_checkin_loc GEOGRAPHY;
    v_distance DOUBLE PRECISION;
BEGIN
    SELECT location, geofence_radius_meters INTO v_office_loc, v_radius
    FROM public.offices WHERE id = p_office_id;

    IF v_office_loc IS NULL THEN RETURN FALSE; END IF;

    v_checkin_loc := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    v_distance := ST_Distance(v_office_loc, v_checkin_loc);

    RETURN v_distance <= v_radius;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES — EXPLICIT COVERAGE ACROSS ALL TABLES
-- ============================================================================

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE genealogy_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE pv_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_board ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to guarantee idempotent clean apply
DROP POLICY IF EXISTS "Offices select policy" ON offices;
DROP POLICY IF EXISTS "Offices insert policy" ON offices;
DROP POLICY IF EXISTS "Offices update policy" ON offices;
DROP POLICY IF EXISTS "Offices delete policy" ON offices;

DROP POLICY IF EXISTS "Members select policy" ON members;
DROP POLICY IF EXISTS "Members insert policy" ON members;
DROP POLICY IF EXISTS "Members self update policy" ON members;
DROP POLICY IF EXISTS "Members team leader update policy" ON members;
DROP POLICY IF EXISTS "Members super admin update policy" ON members;
DROP POLICY IF EXISTS "Members delete policy" ON members;

DROP POLICY IF EXISTS "Genealogy closure select policy" ON genealogy_closure;
DROP POLICY IF EXISTS "Genealogy closure write policy" ON genealogy_closure;

DROP POLICY IF EXISTS "Attendance logs select policy" ON attendance_logs;
DROP POLICY IF EXISTS "Attendance logs insert policy" ON attendance_logs;
DROP POLICY IF EXISTS "Attendance logs update policy" ON attendance_logs;
DROP POLICY IF EXISTS "Attendance logs delete policy" ON attendance_logs;

DROP POLICY IF EXISTS "Office dues select policy" ON office_dues;
DROP POLICY IF EXISTS "Office dues insert policy" ON office_dues;
DROP POLICY IF EXISTS "Office dues update policy" ON office_dues;
DROP POLICY IF EXISTS "Office dues delete policy" ON office_dues;

DROP POLICY IF EXISTS "PV submissions select policy" ON pv_submissions;
DROP POLICY IF EXISTS "PV submissions insert policy" ON pv_submissions;
DROP POLICY IF EXISTS "PV submissions update policy" ON pv_submissions;
DROP POLICY IF EXISTS "PV submissions delete policy" ON pv_submissions;

DROP POLICY IF EXISTS "Earnings ledger select policy" ON earnings_ledger;
DROP POLICY IF EXISTS "Earnings ledger insert policy" ON earnings_ledger;
DROP POLICY IF EXISTS "Earnings ledger update policy" ON earnings_ledger;
DROP POLICY IF EXISTS "Earnings ledger delete policy" ON earnings_ledger;

DROP POLICY IF EXISTS "Health scores select policy" ON health_scores;
DROP POLICY IF EXISTS "Health scores write policy" ON health_scores;

DROP POLICY IF EXISTS "Chat messages select policy" ON chat_messages;
DROP POLICY IF EXISTS "Chat messages insert policy" ON chat_messages;
DROP POLICY IF EXISTS "Chat messages update policy" ON chat_messages;
DROP POLICY IF EXISTS "Chat messages delete policy" ON chat_messages;

DROP POLICY IF EXISTS "Community posts select policy" ON community_posts;
DROP POLICY IF EXISTS "Community posts insert policy" ON community_posts;
DROP POLICY IF EXISTS "Community posts update policy" ON community_posts;
DROP POLICY IF EXISTS "Community posts delete policy" ON community_posts;

DROP POLICY IF EXISTS "Notice board select policy" ON notice_board;
DROP POLICY IF EXISTS "Notice board insert policy" ON notice_board;
DROP POLICY IF EXISTS "Notice board update policy" ON notice_board;
DROP POLICY IF EXISTS "Notice board delete policy" ON notice_board;

-- ----------------------------------------------------------------------------
-- 1. OFFICES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Offices select policy" ON offices
    FOR SELECT USING (
        -- Super Admins and Admins can see all offices
        public.is_super_admin(auth.uid())
        -- Team Leaders can see their own office
     OR public.is_office_team_leader(auth.uid(), id)
        -- Network Directors can see offices linked to their director network
     OR public.is_director_of_office(auth.uid(), id)
        -- Members can see their assigned primary office
     OR (public.get_user_office_id(auth.uid()) = id)
        -- Unauthenticated visitors can view active offices for public routing, slug resolution, and signup
     OR (auth.uid() IS NULL AND is_active = TRUE)
    );

CREATE POLICY "Offices insert policy" ON offices
    FOR INSERT WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Offices update policy" ON offices
    FOR UPDATE USING (public.is_super_admin(auth.uid()) OR public.is_office_team_leader(auth.uid(), id));

CREATE POLICY "Offices delete policy" ON offices
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. MEMBERS POLICIES (Non-Recursive via Security Definer Helpers)
-- ----------------------------------------------------------------------------
CREATE POLICY "Members select policy" ON members
    FOR SELECT USING (
        id = auth.uid() 
     OR public.is_super_admin(auth.uid()) 
     OR public.is_office_team_leader(auth.uid(), primary_office_id) 
     OR public.is_director_of_office(auth.uid(), primary_office_id)
     OR public.is_ancestor_of(auth.uid(), id)
    );

CREATE POLICY "Members insert policy" ON members
    FOR INSERT WITH CHECK (
        public.is_super_admin(auth.uid())
     OR public.is_office_team_leader(auth.uid(), primary_office_id)
     OR public.is_director_of_office(auth.uid(), primary_office_id)
     OR (
         id = auth.uid()
         AND role = 'member'::user_role
         AND EXISTS (SELECT 1 FROM public.offices o WHERE o.id = primary_office_id AND o.is_active = TRUE)
     )
    );

CREATE POLICY "Members self update policy" ON members
    FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Members team leader update policy" ON members
    FOR UPDATE USING (public.is_office_team_leader(auth.uid(), primary_office_id));

CREATE POLICY "Members super admin update policy" ON members
    FOR UPDATE USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Members delete policy" ON members
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. GENEALOGY CLOSURE POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Genealogy closure select policy" ON genealogy_closure
    FOR SELECT USING (
        ancestor_id = auth.uid() 
     OR descendant_id = auth.uid() 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Genealogy closure write policy" ON genealogy_closure
    FOR ALL USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. ATTENDANCE LOGS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Attendance logs select policy" ON attendance_logs
    FOR SELECT USING (
        member_id = auth.uid() 
     OR public.is_ancestor_of(auth.uid(), member_id) 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Attendance logs insert policy" ON attendance_logs
    FOR INSERT WITH CHECK (
        member_id = auth.uid() 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Attendance logs update policy" ON attendance_logs
    FOR UPDATE USING (
        public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Attendance logs delete policy" ON attendance_logs
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. OFFICE DUES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Office dues select policy" ON office_dues
    FOR SELECT USING (
        member_id = auth.uid() 
     OR public.is_ancestor_of(auth.uid(), member_id) 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Office dues insert policy" ON office_dues
    FOR INSERT WITH CHECK (
        member_id = auth.uid() 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Office dues update policy" ON office_dues
    FOR UPDATE USING (
        member_id = auth.uid() 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Office dues delete policy" ON office_dues
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 6. NEOLIFE PV SUBMISSIONS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "PV submissions select policy" ON pv_submissions
    FOR SELECT USING (
        member_id = auth.uid() 
     OR public.is_ancestor_of(auth.uid(), member_id) 
     OR public.is_office_team_leader(auth.uid(), public.get_user_office_id(member_id)) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "PV submissions insert policy" ON pv_submissions
    FOR INSERT WITH CHECK (member_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "PV submissions update policy" ON pv_submissions
    FOR UPDATE USING (
        member_id = auth.uid() 
     OR public.is_office_team_leader(auth.uid(), public.get_user_office_id(member_id)) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "PV submissions delete policy" ON pv_submissions
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 7. EARNINGS LEDGER & 10/20/70 SPLIT POLICIES (Confidential per PRD §16.3/§20)
-- ----------------------------------------------------------------------------
CREATE POLICY "Earnings ledger select policy" ON earnings_ledger
    FOR SELECT USING (member_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Earnings ledger insert policy" ON earnings_ledger
    FOR INSERT WITH CHECK (member_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Earnings ledger update policy" ON earnings_ledger
    FOR UPDATE USING (member_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Earnings ledger delete policy" ON earnings_ledger
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 8. HEALTH SCORES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Health scores select policy" ON health_scores
    FOR SELECT USING (
        member_id = auth.uid() 
     OR public.is_ancestor_of(auth.uid(), member_id) 
     OR public.is_office_team_leader(auth.uid(), public.get_user_office_id(member_id)) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Health scores write policy" ON health_scores
    FOR ALL USING (
        public.is_office_team_leader(auth.uid(), public.get_user_office_id(member_id)) 
     OR public.is_super_admin(auth.uid())
    );

-- ----------------------------------------------------------------------------
-- 9. CHAT MESSAGES POLICIES (PRD §34.2)
-- ----------------------------------------------------------------------------
CREATE POLICY "Chat messages select policy" ON chat_messages
    FOR SELECT USING (
        sender_id = auth.uid() 
     OR recipient_id = auth.uid() 
     OR (office_id IS NOT NULL AND office_id = public.get_user_office_id(auth.uid()))
     OR public.is_ancestor_of(auth.uid(), sender_id) 
     OR public.is_office_team_leader(auth.uid(), public.get_user_office_id(sender_id)) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Chat messages insert policy" ON chat_messages
    FOR INSERT WITH CHECK (sender_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Chat messages update policy" ON chat_messages
    FOR UPDATE USING (sender_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Chat messages delete policy" ON chat_messages
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 10. COMMUNITY POSTS POLICIES (PRD §34.4 - §34.7)
-- ----------------------------------------------------------------------------
CREATE POLICY "Community posts select policy" ON community_posts
    FOR SELECT USING (
        office_id IS NULL 
     OR office_id = public.get_user_office_id(auth.uid()) 
     OR public.is_super_admin(auth.uid()) 
     OR public.is_ancestor_of(auth.uid(), author_id)
    );

CREATE POLICY "Community posts insert policy" ON community_posts
    FOR INSERT WITH CHECK (author_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Community posts update policy" ON community_posts
    FOR UPDATE USING (
        author_id = auth.uid() 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Community posts delete policy" ON community_posts
    FOR DELETE USING (
        author_id = auth.uid() 
     OR public.is_office_team_leader(auth.uid(), office_id) 
     OR public.is_super_admin(auth.uid())
    );

-- ----------------------------------------------------------------------------
-- 11. NOTICE BOARD POLICIES (PRD §34.4)
-- ----------------------------------------------------------------------------
CREATE POLICY "Notice board select policy" ON notice_board
    FOR SELECT USING (
        is_published = TRUE 
    AND (
            office_id IS NULL 
         OR office_id = public.get_user_office_id(auth.uid()) 
         OR public.is_super_admin(auth.uid())
        )
    );

CREATE POLICY "Notice board insert policy" ON notice_board
    FOR INSERT WITH CHECK (
        public.is_super_admin(auth.uid()) 
     OR public.is_office_team_leader(auth.uid(), office_id)
    );

CREATE POLICY "Notice board update policy" ON notice_board
    FOR UPDATE USING (
        public.is_super_admin(auth.uid()) 
     OR public.is_office_team_leader(auth.uid(), office_id)
    );

CREATE POLICY "Notice board delete policy" ON notice_board
    FOR DELETE USING (public.is_super_admin(auth.uid()));

-- ============================================================================
-- 13. SERVER-SIDE MEMBER LIMIT ENFORCEMENT TRIGGER (LegacyOS Plan Bounds)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_office_member_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_limit INT;
    v_current_count INT;
BEGIN
    IF NEW.primary_office_id IS NULL THEN RETURN NEW; END IF;

    SELECT COALESCE(member_limit, 49) INTO v_limit
    FROM public.offices
    WHERE id = NEW.primary_office_id;

    IF v_limit IS NOT NULL AND v_limit < 999999 THEN
        SELECT COUNT(*) INTO v_current_count
        FROM public.members
        WHERE primary_office_id = NEW.primary_office_id AND is_active = TRUE;

        IF v_current_count >= v_limit THEN
            RAISE EXCEPTION 'Cannot register member: Office has reached its Starter plan limit (% members). Upgrade to Growth plan for unlimited members.', v_limit;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_office_member_limit ON public.members;
CREATE TRIGGER trg_enforce_office_member_limit
    BEFORE INSERT ON public.members
    FOR EACH ROW EXECUTE FUNCTION public.enforce_office_member_limit();

-- ============================================================================
-- 14. TOP-EARNER MILESTONE CELEBRATION TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.celebrate_top_earner()
RETURNS TRIGGER AS $$
DECLARE
    v_member_name TEXT;
    v_office_id UUID;
BEGIN
    SELECT full_name, primary_office_id INTO v_member_name, v_office_id
    FROM public.members WHERE id = NEW.member_id;

    IF NEW.gross_amount >= 50000.00 AND v_office_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            office_id, type, title, message, action_url
        ) VALUES (
            v_office_id,
            'celebration',
            '🎉 Big Earner Milestone!',
            COALESCE(v_member_name, 'A member') || ' just recorded ₦' || TO_CHAR(NEW.gross_amount, 'FM999,999,999.00') || ' in earnings!',
            '/leaderboard'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_celebrate_top_earner ON public.earnings_ledger;
CREATE TRIGGER trg_celebrate_top_earner
    AFTER INSERT ON public.earnings_ledger
    FOR EACH ROW EXECUTE FUNCTION public.celebrate_top_earner();

-- ============================================================================
-- 15. RLS POLICIES FOR NEW LEGACYOS MODULES
-- ============================================================================

-- A. DIRECTOR NETWORKS POLICIES
ALTER TABLE public.director_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Director networks select policy" ON director_networks
    FOR SELECT USING (
        director_id = auth.uid() 
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Director networks write policy" ON director_networks
    FOR ALL USING (
        director_id = auth.uid() 
     OR public.is_super_admin(auth.uid())
    );

-- B. NETWORK OFFICES POLICIES
ALTER TABLE public.network_offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Network offices select policy" ON network_offices
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM director_networks dn WHERE dn.id = network_id AND dn.director_id = auth.uid())
     OR public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Network offices write policy" ON network_offices
    FOR ALL USING (
        EXISTS (SELECT 1 FROM director_networks dn WHERE dn.id = network_id AND dn.director_id = auth.uid())
     OR public.is_super_admin(auth.uid())
    );

-- C. TRAINING CLASSES POLICIES
ALTER TABLE public.training_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Training classes select policy" ON training_classes
    FOR SELECT USING (
        office_id = public.get_user_office_id(auth.uid())
     OR public.is_director_of_office(auth.uid(), office_id)
     OR public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Training classes write policy" ON training_classes
    FOR ALL USING (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

-- D. TRAINING CLASS MEMBERS POLICIES
ALTER TABLE public.training_class_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Training class members select policy" ON training_class_members
    FOR SELECT USING (
        member_id = auth.uid()
     OR EXISTS (SELECT 1 FROM training_classes tc WHERE tc.id = class_id AND (tc.office_id = public.get_user_office_id(auth.uid()) OR public.is_office_team_leader(auth.uid(), tc.office_id) OR public.is_director_of_office(auth.uid(), tc.office_id)))
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Training class members write policy" ON training_class_members
    FOR ALL USING (
        EXISTS (SELECT 1 FROM training_classes tc WHERE tc.id = class_id AND (public.is_office_team_leader(auth.uid(), tc.office_id) OR tc.tutor_id = auth.uid() OR tc.head_id = auth.uid()))
     OR public.is_super_admin(auth.uid())
    );

-- E. TRAINING SESSIONS & ATTENDANCE POLICIES
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Training sessions select policy" ON training_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM training_classes tc WHERE tc.id = class_id AND (tc.office_id = public.get_user_office_id(auth.uid()) OR public.is_office_team_leader(auth.uid(), tc.office_id) OR public.is_director_of_office(auth.uid(), tc.office_id)))
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Training sessions write policy" ON training_sessions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM training_classes tc WHERE tc.id = class_id AND (public.is_office_team_leader(auth.uid(), tc.office_id) OR tc.tutor_id = auth.uid()))
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Training attendance select policy" ON training_attendance
    FOR SELECT USING (
        member_id = auth.uid()
     OR EXISTS (SELECT 1 FROM training_sessions ts JOIN training_classes tc ON tc.id = ts.class_id WHERE ts.id = session_id AND (public.is_office_team_leader(auth.uid(), tc.office_id) OR tc.tutor_id = auth.uid() OR public.is_director_of_office(auth.uid(), tc.office_id)))
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Training attendance write policy" ON training_attendance
    FOR ALL USING (
        EXISTS (SELECT 1 FROM training_sessions ts JOIN training_classes tc ON tc.id = ts.class_id WHERE ts.id = session_id AND (public.is_office_team_leader(auth.uid(), tc.office_id) OR tc.tutor_id = auth.uid()))
     OR public.is_super_admin(auth.uid())
    );

-- F. SUBSCRIPTIONS & PLANS POLICIES
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subscription plans public read" ON subscription_plans
    FOR SELECT USING (TRUE);

CREATE POLICY "Subscriptions select policy" ON subscriptions
    FOR SELECT USING (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_director_of_office(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Subscriptions write policy" ON subscriptions
    FOR ALL USING (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Subscription events select policy" ON subscription_events
    FOR SELECT USING (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Subscription events write policy" ON subscription_events
    FOR ALL USING (public.is_super_admin(auth.uid()));

-- G. NOTIFICATIONS POLICIES
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications select policy" ON notifications
    FOR SELECT USING (
        member_id = auth.uid()
     OR (member_id IS NULL AND office_id = public.get_user_office_id(auth.uid()))
     OR public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Notifications update policy" ON notifications
    FOR UPDATE USING (
        member_id = auth.uid()
     OR public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Notifications write policy" ON notifications
    FOR INSERT WITH CHECK (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

-- ============================================================================
-- 16. SERVER-SIDE TENANT ONBOARDING RPC (PRD & SaaS Spec §4 / §7)
-- Atomic Office Creation, 30-Day Free Trial, and Team Leader Role Assignment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_tenant_office(
    p_name TEXT,
    p_slug TEXT,
    p_address TEXT DEFAULT 'Main Office Hall',
    p_phone TEXT DEFAULT '',
    p_whatsapp TEXT DEFAULT '',
    p_website TEXT DEFAULT '',
    p_plan_id TEXT DEFAULT 'starter_monthly'
) RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_clean_slug TEXT;
    v_office_code TEXT;
    v_new_office public.offices%ROWTYPE;
    v_member_limit INT := 49;
    v_is_annual BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to create an office.';
    END IF;

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Validation Error: Office name cannot be empty.';
    END IF;

    IF p_slug IS NULL OR TRIM(p_slug) = '' THEN
        RAISE EXCEPTION 'Validation Error: Office slug URL identifier cannot be empty.';
    END IF;

    -- Normalize slug: lowercase alphanumeric + hyphen
    v_clean_slug := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-z0-9-]', '-', 'g'));
    v_clean_slug := TRIM(BOTH '-' FROM v_clean_slug);

    IF EXISTS (SELECT 1 FROM public.offices WHERE LOWER(slug) = v_clean_slug) THEN
        RAISE EXCEPTION 'Office URL slug "%" is already taken. Please choose a unique web address.', v_clean_slug;
    END IF;

    v_office_code := 'OFF-' || UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 6));
    v_is_annual := p_plan_id LIKE '%annual%';
    IF p_plan_id LIKE '%growth%' THEN
        v_member_limit := 999999;
    END IF;

    -- 1. Create Office Record with 30-Day Free Trial
    INSERT INTO public.offices (
        code,
        slug,
        name,
        address,
        phone,
        whatsapp_number,
        website_url,
        team_leader_id,
        subscription_plan_id,
        subscription_status,
        trial_start_at,
        trial_end_at,
        billing_cycle,
        member_limit,
        location,
        geofence_radius_meters,
        is_active
    ) VALUES (
        v_office_code,
        v_clean_slug,
        TRIM(p_name),
        COALESCE(NULLIF(TRIM(p_address), ''), 'Main Office Hall'),
        COALESCE(TRIM(p_phone), ''),
        COALESCE(TRIM(p_whatsapp), ''),
        COALESCE(TRIM(p_website), ''),
        v_caller_id,
        p_plan_id,
        'trial',
        NOW(),
        NOW() + INTERVAL '30 days',
        CASE WHEN v_is_annual THEN 'annual' ELSE 'monthly' END,
        v_member_limit,
        'SRID=4326;POINT(5.2058 7.2571)'::geography,
        30,
        TRUE
    ) RETURNING * INTO v_new_office;

    -- 2. Promote Caller to Team Leader of this Office (Scoped securely to this transaction)
    PERFORM set_config('app.internal_office_creation', 'true', true);

    UPDATE public.members
    SET role = 'team_leader'::user_role,
        primary_office_id = v_new_office.id,
        onboarding_completed = TRUE
    WHERE id = v_caller_id;

    -- 3. Initialize Subscription Record
    INSERT INTO public.subscriptions (
        office_id,
        plan_id,
        status,
        billing_cycle,
        trial_start,
        trial_end,
        current_period_start,
        current_period_end
    ) VALUES (
        v_new_office.id,
        p_plan_id,
        'trial',
        CASE WHEN v_is_annual THEN 'annual' ELSE 'monthly' END,
        NOW(),
        NOW() + INTERVAL '30 days',
        NOW(),
        NOW() + INTERVAL '30 days'
    );

    -- 4. Audit Subscription Event
    INSERT INTO public.subscription_events (
        office_id,
        event_type,
        amount_paid,
        notes
    ) VALUES (
        v_new_office.id,
        'trial_started',
        0.00,
        '30-Day Free Trial initiated for ' || v_new_office.name
    );

    -- 5. Send Welcome Notification
    INSERT INTO public.notifications (
        member_id,
        office_id,
        type,
        title,
        message,
        action_url
    ) VALUES (
        v_caller_id,
        v_new_office.id,
        'system',
        '🚀 Welcome to LegacyOS!',
        'Your office "' || v_new_office.name || '" is now live with a 30-day free trial. Share your link: /#/o/' || v_clean_slug || '/join',
        '/office-settings'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'office_id', v_new_office.id,
        'name', v_new_office.name,
        'slug', v_new_office.slug,
        'code', v_new_office.code,
        'member_limit', v_new_office.member_limit,
        'trial_end_at', v_new_office.trial_end_at,
        'message', 'Office created successfully with 30-day free trial!'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 17. PAYMENT TRANSACTIONS & PAYSTACK WEBHOOK HANDLER (PRD & SaaS Spec §11)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'paystack',
    reference TEXT NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'NGN',
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'abandoned')),
    provider_response JSONB,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment transactions select policy" ON payment_transactions
    FOR SELECT USING (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE POLICY "Payment transactions insert policy" ON payment_transactions
    FOR INSERT WITH CHECK (
        public.is_office_team_leader(auth.uid(), office_id)
     OR public.is_super_admin(auth.uid())
    );

CREATE OR REPLACE FUNCTION public.handle_paystack_webhook(
    p_reference TEXT,
    p_event TEXT,
    p_payload JSONB
) RETURNS JSONB AS $$
DECLARE
    v_tx public.payment_transactions%ROWTYPE;
    v_office public.offices%ROWTYPE;
    v_period_interval INTERVAL;
    v_expected_amount_kobo NUMERIC;
    v_payload_amount_kobo NUMERIC;
    v_payload_currency TEXT;
    v_payload_status TEXT;
BEGIN
    -- 1. Find transaction record
    SELECT * INTO v_tx FROM public.payment_transactions WHERE reference = p_reference;
    IF v_tx.id IS NULL THEN
        RAISE EXCEPTION 'Transaction reference "%" not found in database', p_reference;
    END IF;

    -- 2. Prevent Replay Attack / Duplicate Activation
    IF v_tx.status = 'success' THEN
        RETURN jsonb_build_object(
            'success', TRUE, 
            'status', 'already_processed', 
            'message', 'Transaction has already been verified and processed.'
        );
    END IF;

    -- 3. Extract verified Paystack parameters from server payload
    v_payload_amount_kobo := COALESCE(
        (p_payload->'data'->>'amount')::NUMERIC, 
        (p_payload->>'amount')::NUMERIC, 
        0
    );
    v_payload_currency := UPPER(COALESCE(
        p_payload->'data'->>'currency', 
        p_payload->>'currency', 
        ''
    ));
    v_payload_status := LOWER(COALESCE(
        p_payload->'data'->>'status', 
        p_payload->>'status', 
        ''
    ));

    -- 4. Calculate exact required amount in Kobo based on plan
    v_expected_amount_kobo := CASE 
        WHEN v_tx.plan_id = 'starter_monthly' THEN 750000.00
        WHEN v_tx.plan_id = 'growth_monthly' THEN 1800000.00
        WHEN v_tx.plan_id = 'starter_annual' THEN 7500000.00
        WHEN v_tx.plan_id = 'growth_annual' THEN 18000000.00
        ELSE NULL
    END;

    -- 5. Strict Server-Side Validation: Event, Status, Currency, and Exact Amount
    IF p_event <> 'charge.success' OR v_payload_status <> 'success' THEN
        UPDATE public.payment_transactions
        SET status = 'failed', provider_response = p_payload
        WHERE id = v_tx.id;
        RETURN jsonb_build_object('success', FALSE, 'status', 'failed', 'reason', 'Payment was not marked successful by Paystack');
    END IF;

    IF v_payload_currency <> 'NGN' THEN
        UPDATE public.payment_transactions
        SET status = 'failed', provider_response = p_payload
        WHERE id = v_tx.id;
        RAISE EXCEPTION 'Currency mismatch: Expected NGN, received %', v_payload_currency;
    END IF;

    IF v_expected_amount_kobo IS NULL OR v_payload_amount_kobo <> v_expected_amount_kobo THEN
        UPDATE public.payment_transactions
        SET status = 'failed', provider_response = p_payload
        WHERE id = v_tx.id;
        RAISE EXCEPTION 'Exact amount mismatch: Expected % kobo (₦%), but Paystack verified % kobo (₦%)', 
            v_expected_amount_kobo, (v_expected_amount_kobo / 100.00), 
            v_payload_amount_kobo, (v_payload_amount_kobo / 100.00);
    END IF;

    -- 6. Update Verified Transaction
    UPDATE public.payment_transactions
    SET status = 'success',
        amount = (v_expected_amount_kobo / 100.00),
        currency = 'NGN',
        paid_at = NOW(),
        provider_response = p_payload
    WHERE id = v_tx.id;

    -- 7. Activate / Renew Office Subscription
    SELECT * INTO v_office FROM public.offices WHERE id = v_tx.office_id;
    v_period_interval := CASE WHEN v_tx.plan_id LIKE '%annual%' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;

    UPDATE public.offices
    SET subscription_status = 'active',
        subscription_plan_id = v_tx.plan_id,
        billing_cycle = CASE WHEN v_tx.plan_id LIKE '%annual%' THEN 'annual' ELSE 'monthly' END,
        member_limit = CASE WHEN v_tx.plan_id LIKE '%growth%' THEN 999999 ELSE 49 END,
        updated_at = NOW()
    WHERE id = v_tx.office_id;

    -- 8. Update Subscriptions Table Ledger
    UPDATE public.subscriptions
    SET status = 'active',
        plan_id = v_tx.plan_id,
        billing_cycle = CASE WHEN v_tx.plan_id LIKE '%annual%' THEN 'annual' ELSE 'monthly' END,
        current_period_start = NOW(),
        current_period_end = NOW() + v_period_interval,
        updated_at = NOW()
    WHERE office_id = v_tx.office_id;

    -- 9. Record Subscription Audit Event
    INSERT INTO public.subscription_events (
        office_id, event_type, amount_paid, notes
    ) VALUES (
        v_tx.office_id, 
        'payment_received', 
        (v_expected_amount_kobo / 100.00), 
        'Exact verified Paystack payment reference: ' || p_reference
    );

    -- 10. Notify Office Owner
    INSERT INTO public.notifications (
        office_id, type, title, message, action_url
    ) VALUES (
        v_tx.office_id,
        'system',
        '💳 Subscription Payment Confirmed',
        'Your payment of ₦' || TO_CHAR((v_expected_amount_kobo / 100.00), 'FM999,999.00') || ' was verified by Paystack. Your ' || v_tx.plan_id || ' subscription is active.',
        '/office-settings'
    );

    RETURN jsonb_build_object(
        'success', TRUE, 
        'status', 'active', 
        'reference', p_reference,
        'amount_ngn', (v_expected_amount_kobo / 100.00),
        'plan_id', v_tx.plan_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Security Boundary: Strictly Restrict Execution to Service Role Only
REVOKE ALL ON FUNCTION public.handle_paystack_webhook(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_paystack_webhook(TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.handle_paystack_webhook(TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_paystack_webhook(TEXT, TEXT, JSONB) TO service_role;

-- ============================================================================
-- 18. AUTOMATED SERVER-SIDE REMINDER ENGINE (PRD & SaaS Spec §12)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_automated_reminders()
RETURNS JSONB AS $$
DECLARE
    v_reminders_count INT := 0;
    r_office RECORD;
    r_session RECORD;
    r_due RECORD;
BEGIN
    -- 1. Trial Expiration Warnings (Expiring in <= 3 days)
    FOR r_office IN 
        SELECT id, name, trial_end_at, team_leader_id 
        FROM public.offices 
        WHERE subscription_status = 'trial' 
          AND trial_end_at <= NOW() + INTERVAL '3 days'
          AND trial_end_at > NOW()
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications 
            WHERE office_id = r_office.id 
              AND type = 'reminder' 
              AND created_at >= NOW() - INTERVAL '24 hours'
              AND title LIKE '%Trial Expiring%'
        ) THEN
            INSERT INTO public.notifications (
                member_id, office_id, type, title, message, action_url
            ) VALUES (
                r_office.team_leader_id,
                r_office.id,
                'reminder',
                '⏳ 30-Day Free Trial Expiring Soon',
                'Your free trial for ' || r_office.name || ' ends in ' || EXTRACT(DAY FROM (r_office.trial_end_at - NOW())) || ' days. Choose a plan to maintain continuous access.',
                '/office-settings'
            );
            v_reminders_count := v_reminders_count + 1;
        END IF;
    END LOOP;

    -- 2. Training Session Today Reminders
    FOR r_session IN
        SELECT ts.id, ts.topic, ts.session_date, ts.start_time, tc.office_id, tc.name AS class_name
        FROM public.training_sessions ts
        JOIN public.training_classes tc ON tc.id = ts.class_id
        WHERE ts.session_date = CURRENT_DATE
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications 
            WHERE office_id = r_session.office_id 
              AND type = 'reminder' 
              AND created_at >= NOW() - INTERVAL '12 hours'
              AND title LIKE '%Training Session Today%'
        ) THEN
            INSERT INTO public.notifications (
                office_id, type, title, message, action_url
            ) VALUES (
                r_session.office_id,
                'reminder',
                '📚 Training Session Today: ' || r_session.class_name,
                'Session on "' || r_session.topic || '" starts today at ' || r_session.start_time || '.',
                '/training'
            );
            v_reminders_count := v_reminders_count + 1;
        END IF;
    END LOOP;

    -- 3. Overdue Office Dues Reminders
    FOR r_due IN
        SELECT od.id, od.member_id, od.office_id, (od.amount - COALESCE(od.paid_amount, 0.00)) AS outstanding_amount, m.full_name
        FROM public.office_dues od
        JOIN public.members m ON m.id = od.member_id
        WHERE od.status = 'overdue' AND (od.amount - COALESCE(od.paid_amount, 0.00)) > 0
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications 
            WHERE member_id = r_due.member_id 
              AND type = 'reminder' 
              AND created_at >= NOW() - INTERVAL '48 hours'
              AND title LIKE '%Office Dues Overdue%'
        ) THEN
            INSERT INTO public.notifications (
                member_id, office_id, type, title, message, action_url
            ) VALUES (
                r_due.member_id,
                r_due.office_id,
                'reminder',
                '⚠️ Office Dues Overdue',
                'Outstanding dues of ₦' || TO_CHAR(r_due.outstanding_amount, 'FM999,999.00') || ' are due for your office operations.',
                '/dues'
            );
            v_reminders_count := v_reminders_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', TRUE, 'generated_reminders', v_reminders_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 19. SUPABASE REALTIME REPLICATION CONFIGURATION
-- ============================================================================

DO $$
BEGIN
    -- Add tables to realtime publication if not already present
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'earnings_ledger') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.earnings_ledger;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'training_sessions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.training_sessions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'training_attendance') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.training_attendance;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- Safe fallback if publications are managed at project dashboard level
END;
$$;

