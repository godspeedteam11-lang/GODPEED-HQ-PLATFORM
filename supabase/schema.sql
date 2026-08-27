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
