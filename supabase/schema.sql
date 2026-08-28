-- ============================================================================
-- GODSPEED HQ | Database Schema & Row-Level Security (RLS) Policies (PRD v1.1)
-- Target Platform: Supabase PostgreSQL + PostGIS Extension
-- Fully Idempotent (Safe to run multiple times)
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS & DOMAINS (Idempotent Creation)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_leader', 'trainer', 'finance_officer', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE neolife_rank AS ENUM ('newbie', 'pro', 'full_distributor', 'manager', 'senior_manager', 'executive_manager', 'director', 'emerald_director', 'world_team', 'president_team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- 5. GENEALOGY CLOSURE TABLE (Instantaneous Subtree Lookup)
CREATE TABLE IF NOT EXISTS genealogy_closure (
    ancestor_id UUID REFERENCES members(id) ON DELETE CASCADE,
    descendant_id UUID REFERENCES members(id) ON DELETE CASCADE,
    depth INT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);

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
    office_due_10 NUMERIC(12, 2) GENERATED ALWAYS AS (net_amount * 0.10) STORED,
    personal_savings_20 NUMERIC(12, 2) GENERATED ALWAYS AS (net_amount * 0.20) STORED,
    business_fund_70 NUMERIC(12, 2) GENERATED ALWAYS AS (net_amount * 0.70) STORED,
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

-- 11. HIERARCHICAL CHAT MESSAGES TABLE
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

-- Seed Default Offices with valid UUIDs (Official HQ Akure as primary)
INSERT INTO offices (id, code, name, address, location, geofence_radius_meters, timezone)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 'HQ-AKR', 'GODSPEED HQ Akure', 'Akure, Ondo State, Nigeria', ST_SetSRID(ST_MakePoint(5.2058, 7.2571), 4326)::geography, 30, 'Africa/Lagos'),
  ('11111111-1111-1111-1111-111111111111', 'HQ-LGS', 'GODSPEED HQ Ikeja', 'Ikeja, Lagos, Nigeria', ST_SetSRID(ST_MakePoint(3.3515, 6.6018), 4326)::geography, 30, 'Africa/Lagos'),
  ('22222222-2222-2222-2222-222222222222', 'HQ-ABJ', 'GODSPEED Abuja Hub', 'Abuja, Nigeria', ST_SetSRID(ST_MakePoint(7.3986, 9.0765), 4326)::geography, 40, 'Africa/Lagos')
ON CONFLICT (code) DO NOTHING;

-- Ensure members foreign key correctly references auth.users(id) rather than public.users
DO $$ BEGIN
    ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_id_fkey;
    ALTER TABLE public.members ADD CONSTRAINT members_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

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
    -- Extract office identifier from user metadata, defaulting to HQ-AKR
    v_raw_office := COALESCE(
        NEW.raw_user_meta_data->>'office_id',
        NEW.raw_user_meta_data->>'office',
        'HQ-AKR'
    );

    -- Safely resolve incoming office identifier (UUID string, office code, or confirmed mock ID) to public.offices.id UUID
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

    -- Deterministic fallback to default HQ-AKR office UUID if unresolved
    IF v_office_id IS NULL THEN
        SELECT id INTO v_office_id FROM public.offices WHERE code = 'HQ-AKR';
    END IF;

    -- Resolve sponsor by member_code or email if provided in user metadata
    IF NEW.raw_user_meta_data->>'sponsor' IS NOT NULL AND NEW.raw_user_meta_data->>'sponsor' <> '' THEN
        SELECT id INTO v_sponsor_uuid FROM public.members 
        WHERE member_code = UPPER(NEW.raw_user_meta_data->>'sponsor') 
           OR LOWER(email) = LOWER(NEW.raw_user_meta_data->>'sponsor');
    END IF;

    -- Insert member profile record (Errors are not swallowed so real DB failures trigger rollback)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger firing automatically after Supabase auth.users row creation
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
    FROM members WHERE id = p_user_id;

    -- Check if user is Team Leader of their office or assigned as team leader
    SELECT EXISTS (
        SELECT 1 FROM offices WHERE team_leader_id = p_user_id
    ) INTO v_is_team_leader;

    -- Check if user has descendants in genealogy tree
    SELECT EXISTS (
        SELECT 1 FROM genealogy_closure WHERE ancestor_id = p_user_id AND depth > 0
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTIONS & GEOSPATIAL VALIDATION
-- ============================================================================

-- Function to check if attendance check-in location is within office radius
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
    FROM offices WHERE id = p_office_id;

    v_checkin_loc := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    v_distance := ST_Distance(v_office_loc, v_checkin_loc);

    RETURN v_distance <= v_radius;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop Policies if Exists to allow seamless re-execution
DROP POLICY IF EXISTS "Super Admins access all members" ON members;
DROP POLICY IF EXISTS "Team Leaders view office members" ON members;
DROP POLICY IF EXISTS "Ancestors view descendant subtree members" ON members;
DROP POLICY IF EXISTS "Chat view permissions for participants, uplines, and team leaders" ON chat_messages;

-- Member self-access & Ancestor subtree access for Members table
CREATE POLICY "Super Admins access all members" ON members
    FOR ALL USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Team Leaders view office members" ON members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM members leader
            WHERE leader.id = auth.uid() AND leader.role = 'team_leader' AND leader.primary_office_id = members.primary_office_id
        )
    );

CREATE POLICY "Ancestors view descendant subtree members" ON members
    FOR SELECT USING (
        id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM genealogy_closure gc
            WHERE gc.ancestor_id = auth.uid() AND gc.descendant_id = members.id
        )
    );

-- Hierarchical Chat RLS policy (PRD Section 34.2)
CREATE POLICY "Chat view permissions for participants, uplines, and team leaders" ON chat_messages
    FOR SELECT USING (
        sender_id = auth.uid() OR
        recipient_id = auth.uid() OR
        -- Direct Sponsor can view
        EXISTS (SELECT 1 FROM members m WHERE m.id = chat_messages.sender_id AND m.sponsor_id = auth.uid()) OR
        -- Upline Ancestor can view
        EXISTS (SELECT 1 FROM genealogy_closure gc WHERE gc.ancestor_id = auth.uid() AND gc.descendant_id = chat_messages.sender_id) OR
        -- Team Leader of sender's office can view
        EXISTS (
            SELECT 1 FROM members sender
            JOIN offices o ON sender.primary_office_id = o.id
            WHERE sender.id = chat_messages.sender_id AND o.team_leader_id = auth.uid()
        ) OR
        -- Super Admin can view
        EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'super_admin')
    );
