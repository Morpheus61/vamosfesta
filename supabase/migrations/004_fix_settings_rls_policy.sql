-- =====================================================
-- FIX SETTINGS & SIPTOKEN_SETTINGS RLS POLICIES
-- Migration: 004_fix_settings_rls_policy.sql
-- Purpose: Secure settings with application-level authorization
-- =====================================================

-- ============= SETTINGS TABLE =============
-- Drop ALL existing policies (various names from different migrations)
DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
DROP POLICY IF EXISTS "Anon can view settings" ON settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON settings;
DROP POLICY IF EXISTS "Anon can update settings" ON settings;
DROP POLICY IF EXISTS "Anyone can insert settings" ON settings;
DROP POLICY IF EXISTS "Anon can insert settings" ON settings;
DROP POLICY IF EXISTS "Anyone can delete settings" ON settings;
DROP POLICY IF EXISTS "Anon can delete settings" ON settings;

-- Create clean policies - anon key can operate (authorization in JavaScript)
-- JavaScript validates: Only Super Admin can modify settings
CREATE POLICY "Settings: View by all" 
    ON settings FOR SELECT 
    TO anon 
    USING (true);

CREATE POLICY "Settings: Insert by anon" 
    ON settings FOR INSERT 
    TO anon 
    WITH CHECK (true);

CREATE POLICY "Settings: Update by anon" 
    ON settings FOR UPDATE 
    TO anon 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Settings: Delete by anon" 
    ON settings FOR DELETE 
    TO anon 
    USING (true);

COMMENT ON TABLE settings IS 'App settings - JS enforces Super Admin only for modifications';

-- ============= SIPTOKEN_SETTINGS TABLE =============
-- Drop ALL existing policies (various names from different migrations)
DROP POLICY IF EXISTS "Anyone can view SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Anon can view SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Admins can modify settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Anyone can update SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Anon can update SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Anyone can insert SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Anon can insert SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Only Super Admin and SipToken Overseers can update SipToken settings" ON siptoken_settings;
DROP POLICY IF EXISTS "Only Super Admin and SipToken Overseers can insert SipToken settings" ON siptoken_settings;

-- Create clean policies - anon key can operate (authorization in JavaScript)
-- JavaScript validates: Only Super Admin OR SipToken Overseer can modify
CREATE POLICY "SipToken Settings: View by all" 
    ON siptoken_settings FOR SELECT 
    TO anon 
    USING (true);

CREATE POLICY "SipToken Settings: Update by anon" 
    ON siptoken_settings FOR UPDATE 
    TO anon 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "SipToken Settings: Insert by anon" 
    ON siptoken_settings FOR INSERT 
    TO anon 
    WITH CHECK (true);

COMMENT ON TABLE siptoken_settings IS 'SipToken settings - JS enforces Super Admin & SipToken Overseer only';
