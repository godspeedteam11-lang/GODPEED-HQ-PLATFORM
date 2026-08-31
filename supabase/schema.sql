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

-- 3. OFFICES TABLE
CREATE TABLE IF NOT EXISTS offices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL, -- Exact GPS coordinates
    geofence_radius_meters INT DEFAULT 30,
    timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
    team_leader_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    status attendance_status DEFAULT 'success',
    override_reason TEXT,
    override_by UUID REFERENCES members(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Seed Default Offices with valid UUIDs (Official HQ Akure as primary)
INSERT INTO offices (id, code, name, address, location, geofence_radius_meters, timezone)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 'HQ-AKR', 'GODSPEED HQ Akure', 'Akure, Ondo State, Nigeria', ST_SetSRID(ST_MakePoint(5.2058, 7.2571), 4326)::geography, 30, 'Africa/Lagos'),
  ('11111111-1111-1111-1111-111111111111', 'HQ-LGS', 'GODSPEED HQ Ikeja', 'Ikeja, Lagos, Nigeria', ST_SetSRID(ST_MakePoint(3.3515, 6.6018), 4326)::geography, 30, 'Africa/Lagos'),
  ('22222222-2222-2222-2222-222222222222', 'HQ-ABJ', 'GODSPEED Abuja Hub', 'Abuja, Nigeria', ST_SetSRID(ST_MakePoint(7.3986, 9.0765), 4326)::geography, 40, 'Africa/Lagos')
ON CONFLICT (code) DO NOTHING;

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

-- ============================================================================
-- FIELD PRIVILEGE GUARD TRIGGER (Role, Rank, and Sponsor Mutation Security)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_member_field_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Only Super Admin or Admin can change role
    IF (NEW.role IS DISTINCT FROM OLD.role) AND NOT public.is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admins can modify member roles.';
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
BEGIN
    v_raw_office := COALESCE(
        NEW.raw_user_meta_data->>'office_id',
        NEW.raw_user_meta_data->>'office',
        'HQ-AKR'
    );

    SELECT id INTO v_office_id
    FROM public.offices
    WHERE id::text = v_raw_office
       OR code = v_raw_office
       OR code = CASE 
            WHEN v_raw_office = 'OFF-AKR' THEN 'HQ-AKR'
            WHEN v_raw_office = 'OFF-101' THEN 'HQ-LGS'
            WHEN v_raw_office = 'OFF-102' THEN 'HQ-ABJ'
            ELSE NULL
          END;

    IF v_office_id IS NULL THEN
        SELECT id INTO v_office_id FROM public.offices WHERE code = 'HQ-AKR';
    END IF;

    IF NEW.raw_user_meta_data->>'sponsor' IS NOT NULL AND NEW.raw_user_meta_data->>'sponsor' <> '' THEN
        SELECT id INTO v_sponsor_uuid FROM public.members 
        WHERE member_code = UPPER(NEW.raw_user_meta_data->>'sponsor') 
           OR LOWER(email) = LOWER(NEW.raw_user_meta_data->>'sponsor')
           OR id::text = NEW.raw_user_meta_data->>'sponsor';
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
        'GSD-' || UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 6)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Member'),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        v_sponsor_uuid,
        'member'::user_role,
        'newbie'::neolife_rank,
        v_office_id,
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;

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
    FOR SELECT USING (is_active = TRUE OR public.is_super_admin(auth.uid()) OR public.is_office_team_leader(auth.uid(), id));

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
     OR public.is_ancestor_of(auth.uid(), id)
    );

CREATE POLICY "Members insert policy" ON members
    FOR INSERT WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid()));

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
