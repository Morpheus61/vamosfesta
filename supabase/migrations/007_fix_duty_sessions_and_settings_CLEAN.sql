-- =====================================================
-- FIX SIPTOKEN DUTY SESSIONS AND SETTINGS
-- Migration: 007_fix_duty_sessions_and_settings.sql
-- Purpose: Fix schema mismatches and add missing RLS policies
-- =====================================================

-- 1. Fix siptoken_duty_sessions table - add counter_id column
ALTER TABLE siptoken_duty_sessions 
ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES bar_counters(id);

-- 2. Update counter_id from counter_name where possible
UPDATE siptoken_duty_sessions sds
SET counter_id = bc.id
FROM bar_counters bc
WHERE sds.counter_name = bc.counter_name 
AND sds.counter_id IS NULL;

-- 3. Add index for counter_id
CREATE INDEX IF NOT EXISTS idx_siptoken_duty_counter 
    ON siptoken_duty_sessions(counter_id);

-- 4. Add missing RLS policies for siptoken_duty_sessions
DROP POLICY IF EXISTS "Authenticated users can view duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "Authenticated users can create duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "Authenticated users can update duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "Authenticated users can delete duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "SipToken overseers can view duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "SipToken overseers can create duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "SipToken overseers can update duty sessions" ON siptoken_duty_sessions;
DROP POLICY IF EXISTS "SipToken overseers can delete duty sessions" ON siptoken_duty_sessions;

-- SELECT: All authenticated users can view
CREATE POLICY "SipToken overseers can view duty sessions"
    ON siptoken_duty_sessions FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: Create new duty sessions
CREATE POLICY "SipToken overseers can create duty sessions"
    ON siptoken_duty_sessions FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT COALESCE(is_siptoken_overseer, false) FROM users WHERE id = auth.uid()) = true
        OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    );

-- UPDATE: Modify existing duty sessions
CREATE POLICY "SipToken overseers can update duty sessions"
    ON siptoken_duty_sessions FOR UPDATE
    TO authenticated
    USING (
        (SELECT COALESCE(is_siptoken_overseer, false) FROM users WHERE id = auth.uid()) = true
        OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    );

-- DELETE: Remove duty sessions
CREATE POLICY "SipToken overseers can delete duty sessions"
    ON siptoken_duty_sessions FOR DELETE
    TO authenticated
    USING (
        (SELECT COALESCE(is_siptoken_overseer, false) FROM users WHERE id = auth.uid()) = true
        OR
        (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    );

-- 5. Ensure settings table has proper RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read settings" ON settings;
DROP POLICY IF EXISTS "Authenticated users can read settings" ON settings;
DROP POLICY IF EXISTS "Admins can modify settings" ON settings;

CREATE POLICY "Authenticated users can read settings"
    ON settings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can modify settings"
    ON settings FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('super_admin', 'admin')
        )
    );
