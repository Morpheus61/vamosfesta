-- =====================================================
-- VAMOS FESTA - Database Setup Script v2.0
-- Multi-Seller Workflow with Payment Verification
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Drop existing tables if they exist (fresh start)
-- Must drop in reverse order of dependencies
DROP TABLE IF EXISTS pass_access_log CASCADE;
DROP TABLE IF EXISTS gate_activity_log CASCADE;
DROP TABLE IF EXISTS guest_pass_tokens CASCADE;
DROP TABLE IF EXISTS clockin_tokens CASCADE;
DROP TABLE IF EXISTS overseer_assignments CASCADE;
DROP TABLE IF EXISTS gate_roster CASCADE;
DROP TABLE IF EXISTS clockout_requests CASCADE;
DROP TABLE IF EXISTS guest_movements CASCADE;
DROP TABLE IF EXISTS marshall_duties CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS entry_gates CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- Drop views if they exist
DROP VIEW IF EXISTS overall_stats CASCADE;
DROP VIEW IF EXISTS seller_stats CASCADE;

-- =====================================================
-- SETTINGS TABLE - For configurable ticket prices
-- =====================================================
CREATE TABLE settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_by UUID
);

-- Insert default ticket prices (Super Admin can change these)
INSERT INTO settings (setting_key, setting_value, description) VALUES
    ('stag_price', '2750', 'Ticket price for Stag entry'),
    ('couple_price', '4750', 'Ticket price for Couple entry'),
    ('event_name', 'Vamos Festa', 'Event name'),
    ('event_tagline', '¡Viva La Festa!', 'Event tagline'),
    ('event_date', 'February 7, 2026', 'Event date'),
    ('event_venue', 'AREA 8 MTM', 'Event venue'),
    ('upi_id', '', 'UPI ID for payments (shown to sellers)'),
    ('bank_details', '', 'Bank account details for transfers'),
    ('payment_qr_code', '', 'Payment QR Code image (base64)');

-- =====================================================
-- USERS TABLE - With four roles and club info
-- =====================================================
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    club_name TEXT,
    club_number TEXT,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'seller', 'entry_marshall')),
    is_active BOOLEAN DEFAULT true,
    is_roster_manager BOOLEAN DEFAULT false,
    is_gate_overseer BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID
);

-- Insert default Super Admin
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO users (username, password, full_name, mobile_number, role) 
VALUES ('SuperAdmin', 'VamosFesta@2026', 'Super Administrator', '0000000000', 'super_admin');

-- =====================================================
-- ENTRY GATES TABLE - Physical entry/exit gates
-- =====================================================
CREATE TABLE entry_gates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gate_name TEXT NOT NULL,
    gate_code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES users(id)
);

-- =====================================================
-- GUESTS TABLE - With seller tracking & payment verification
-- =====================================================
CREATE TABLE guests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Guest Information (captured by Seller)
    guest_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('stag', 'couple')),
    
    -- Payment Information (captured by Seller)
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer')),
    payment_reference TEXT,  -- UTR number for UPI, Reference for Bank Transfer
    ticket_price NUMERIC NOT NULL,
    
    -- Seller Information
    registered_by UUID NOT NULL REFERENCES users(id),
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    
    -- Verification Information (by Super Admin)
    status TEXT DEFAULT 'pending_verification' CHECK (status IN (
        'pending_verification',  -- Awaiting payment verification
        'payment_verified',      -- Payment confirmed by Super Admin
        'pass_generated',        -- QR Pass generated
        'pass_sent',             -- WhatsApp sent to guest
        'checked_in',            -- Guest arrived at event
        'rejected'               -- Payment rejected/invalid
    )),
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- Pass Information
    pass_generated_at TIMESTAMP WITH TIME ZONE,
    pass_sent_at TIMESTAMP WITH TIME ZONE,
    pass_code TEXT UNIQUE,  -- Unique pass code for guest
    
    -- Entry Information (at event)
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID REFERENCES users(id),
    is_inside_venue BOOLEAN DEFAULT false,
    last_gate_id UUID REFERENCES entry_gates(id),
    entry_count INTEGER DEFAULT 0,
    last_movement_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =====================================================
-- MARSHALL DUTIES TABLE - Clock-in/out tracking
-- =====================================================
CREATE TABLE marshall_duties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    marshall_id UUID NOT NULL REFERENCES users(id),
    gate_id UUID NOT NULL REFERENCES entry_gates(id),
    clock_in_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    clock_out_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'on_duty' CHECK (status IN ('on_duty', 'off_duty')),
    notes TEXT,
    verified_by UUID REFERENCES users(id),
    clockout_request_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =====================================================
-- GUEST MOVEMENTS TABLE - Entry/exit tracking
-- =====================================================
CREATE TABLE guest_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guest_id UUID NOT NULL REFERENCES guests(id),
    gate_id UUID NOT NULL REFERENCES entry_gates(id),
    marshall_id UUID REFERENCES users(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('entry', 'exit')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =====================================================
-- CLOCKOUT REQUESTS TABLE - Marshall clockout approval workflow
-- =====================================================
CREATE TABLE clockout_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    duty_id UUID NOT NULL REFERENCES marshall_duties(id),
    marshall_id UUID NOT NULL REFERENCES users(id),
    gate_id UUID NOT NULL REFERENCES entry_gates(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- GATE ROSTER TABLE - Marshall assignments to gates
-- =====================================================
CREATE TABLE gate_roster (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    marshall_id UUID NOT NULL UNIQUE REFERENCES users(id),
    gate_id UUID NOT NULL REFERENCES entry_gates(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    notes TEXT
);

-- =====================================================
-- OVERSEER ASSIGNMENTS TABLE - Gate overseers
-- =====================================================
CREATE TABLE overseer_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    overseer_id UUID NOT NULL REFERENCES users(id),
    gate_id UUID NOT NULL REFERENCES entry_gates(id),
    is_lead_overseer BOOLEAN DEFAULT false,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(overseer_id, gate_id)
);

-- =====================================================
-- CLOCKIN TOKENS TABLE - Secure tokens for marshall clock-in
-- =====================================================
CREATE TABLE clockin_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gate_id UUID NOT NULL REFERENCES entry_gates(id),
    overseer_id UUID NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_by UUID REFERENCES users(id),
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- GUEST PASS TOKENS TABLE - Secure tokens for guest passes
-- =====================================================
CREATE TABLE guest_pass_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guest_id UUID NOT NULL REFERENCES guests(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    used_by_marshall UUID REFERENCES users(id),
    used_at_gate UUID REFERENCES entry_gates(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- GATE ACTIVITY LOG TABLE - Audit log for gate operations
-- =====================================================
CREATE TABLE gate_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gate_id UUID REFERENCES entry_gates(id),
    user_id UUID REFERENCES users(id),
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'clock_in',
        'clock_out_request',
        'clock_out_approved',
        'clock_out_rejected',
        'clock_out_cancelled',
        'overseer_assigned',
        'marshall_assigned'
    )),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- PASS ACCESS LOG TABLE - Track guest pass access
-- =====================================================
CREATE TABLE pass_access_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guest_id UUID NOT NULL REFERENCES guests(id),
    ip_address TEXT,
    user_agent TEXT,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

-- SETTINGS POLICIES
CREATE POLICY "Anyone can view settings" ON settings FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can update settings" ON settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- USERS POLICIES
CREATE POLICY "Anyone can view users" ON users FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can insert users" ON users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can update users" ON users FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete users" ON users FOR DELETE TO anon USING (true);

-- GUESTS POLICIES
CREATE POLICY "Anyone can view guests" ON guests FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can insert guests" ON guests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can update guests" ON guests FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete guests" ON guests FOR DELETE TO anon USING (true);

-- Add foreign key constraint for clockout_request_id after both tables exist
ALTER TABLE marshall_duties 
ADD CONSTRAINT marshall_duties_clockout_request_id_fkey 
FOREIGN KEY (clockout_request_id) REFERENCES clockout_requests(id);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
-- Guests table indexes
CREATE INDEX idx_guests_status ON guests(status);
CREATE INDEX idx_guests_registered_by ON guests(registered_by);
CREATE INDEX idx_guests_payment_mode ON guests(payment_mode);
CREATE INDEX idx_guests_created_at ON guests(created_at DESC);
CREATE INDEX idx_guests_mobile_number ON guests(mobile_number);
CREATE INDEX idx_guests_is_inside_venue ON guests(is_inside_venue);
CREATE INDEX idx_guests_pass_code ON guests(pass_code);

-- Users table indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Settings table indexes
CREATE INDEX idx_settings_key ON settings(setting_key);

-- Entry gates indexes
CREATE INDEX idx_entry_gates_is_active ON entry_gates(is_active);
CREATE INDEX idx_entry_gates_gate_code ON entry_gates(gate_code);

-- Marshall duties indexes
CREATE INDEX idx_marshall_duties_marshall_id ON marshall_duties(marshall_id);
CREATE INDEX idx_marshall_duties_gate_id ON marshall_duties(gate_id);
CREATE INDEX idx_marshall_duties_status ON marshall_duties(status);
CREATE INDEX idx_marshall_duties_clock_in_at ON marshall_duties(clock_in_at DESC);

-- Guest movements indexes
CREATE INDEX idx_guest_movements_guest_id ON guest_movements(guest_id);
CREATE INDEX idx_guest_movements_gate_id ON guest_movements(gate_id);
CREATE INDEX idx_guest_movements_marshall_id ON guest_movements(marshall_id);
CREATE INDEX idx_guest_movements_movement_type ON guest_movements(movement_type);
CREATE INDEX idx_guest_movements_created_at ON guest_movements(created_at DESC);

-- Clockout requests indexes
CREATE INDEX idx_clockout_requests_duty_id ON clockout_requests(duty_id);
CREATE INDEX idx_clockout_requests_marshall_id ON clockout_requests(marshall_id);
CREATE INDEX idx_clockout_requests_status ON clockout_requests(status);
CREATE INDEX idx_clockout_requests_created_at ON clockout_requests(created_at DESC);

-- Gate roster indexes
CREATE INDEX idx_gate_roster_marshall_id ON gate_roster(marshall_id);
CREATE INDEX idx_gate_roster_gate_id ON gate_roster(gate_id);

-- Clockin tokens indexes
CREATE INDEX idx_clockin_tokens_token ON clockin_tokens(token);
CREATE INDEX idx_clockin_tokens_gate_id ON clockin_tokens(gate_id);
CREATE INDEX idx_clockin_tokens_expires_at ON clockin_tokens(expires_at);

-- Guest pass tokens indexes
CREATE INDEX idx_guest_pass_tokens_guest_id ON guest_pass_tokens(guest_id);
CREATE INDEX idx_guest_pass_tokens_token ON guest_pass_tokens(token);
CREATE INDEX idx_guest_pass_tokens_expires_at ON guest_pass_tokens(expires_at);

-- =====================================================
-- VIEWS FOR EASY REPORTING
-- =====================================================

-- View: Sales by Seller
CREATE OR REPLACE VIEW seller_stats AS
SELECT 
    u.id as seller_id,
    u.username,
    u.full_name,
    u.mobile_number,
    u.club_name,
    u.club_number,
    COUNT(g.id) as total_registrations,
    COUNT(CASE WHEN g.status = 'pending_verification' THEN 1 END) as pending_count,
    COUNT(CASE WHEN g.status IN ('payment_verified', 'pass_generated', 'pass_sent', 'checked_in') THEN 1 END) as verified_count,
    COUNT(CASE WHEN g.status = 'rejected' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN g.entry_type = 'stag' THEN 1 END) as stag_count,
    COUNT(CASE WHEN g.entry_type = 'couple' THEN 1 END) as couple_count,
    COALESCE(SUM(CASE WHEN g.status IN ('payment_verified', 'pass_generated', 'pass_sent', 'checked_in') THEN g.ticket_price ELSE 0 END), 0) as total_verified_amount,
    COALESCE(SUM(CASE WHEN g.payment_mode = 'cash' AND g.status IN ('payment_verified', 'pass_generated', 'pass_sent', 'checked_in') THEN g.ticket_price ELSE 0 END), 0) as cash_collected,
    COALESCE(SUM(CASE WHEN g.payment_mode = 'upi' AND g.status IN ('payment_verified', 'pass_generated', 'pass_sent', 'checked_in') THEN g.ticket_price ELSE 0 END), 0) as upi_collected,
    COALESCE(SUM(CASE WHEN g.payment_mode = 'bank_transfer' AND g.status IN ('payment_verified', 'pass_generated', 'pass_sent', 'checked_in') THEN g.ticket_price ELSE 0 END), 0) as bank_collected
FROM users u
LEFT JOIN guests g ON u.id = g.registered_by
WHERE u.role = 'seller'
GROUP BY u.id, u.username, u.full_name, u.mobile_number, u.club_name, u.club_number;

-- View: Overall Statistics
CREATE OR REPLACE VIEW overall_stats AS
SELECT 
    COUNT(*) as total_registrations,
    COUNT(CASE WHEN status = 'pending_verification' THEN 1 END) as pending_verification,
    COUNT(CASE WHEN status = 'payment_verified' THEN 1 END) as payment_verified,
    COUNT(CASE WHEN status = 'pass_generated' THEN 1 END) as pass_generated,
    COUNT(CASE WHEN status = 'pass_sent' THEN 1 END) as pass_sent,
    COUNT(CASE WHEN status = 'checked_in' THEN 1 END) as checked_in,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
    COUNT(CASE WHEN entry_type = 'stag' THEN 1 END) as stag_count,
    COUNT(CASE WHEN entry_type = 'couple' THEN 1 END) as couple_count,
    COUNT(CASE WHEN entry_type = 'stag' THEN 1 END) + (COUNT(CASE WHEN entry_type = 'couple' THEN 1 END) * 2) as total_pax,
    COALESCE(SUM(CASE WHEN status NOT IN ('pending_verification', 'rejected') THEN ticket_price ELSE 0 END), 0) as total_verified_revenue,
    COALESCE(SUM(CASE WHEN payment_mode = 'cash' AND status NOT IN ('pending_verification', 'rejected') THEN ticket_price ELSE 0 END), 0) as cash_revenue,
    COALESCE(SUM(CASE WHEN payment_mode = 'upi' AND status NOT IN ('pending_verification', 'rejected') THEN ticket_price ELSE 0 END), 0) as upi_revenue,
    COALESCE(SUM(CASE WHEN payment_mode = 'bank_transfer' AND status NOT IN ('pending_verification', 'rejected') THEN ticket_price ELSE 0 END), 0) as bank_revenue
FROM guests;

-- =====================================================
-- SETUP COMPLETE!
-- 
-- Default Super Admin Login:
--   Username: SuperAdmin
--   Password: VamosFesta@2026
-- 
-- IMPORTANT: Change the password after first login!
--
-- Roles:
--   super_admin - Full access, verify payments, send passes
--   admin       - Read-only access to all data
--   seller      - Register guests, view own sales
-- =====================================================
