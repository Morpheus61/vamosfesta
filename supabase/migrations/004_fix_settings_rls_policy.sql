-- =====================================================
-- FIX SETTINGS RLS POLICY
-- Migration: 004_fix_settings_rls_policy.sql
-- Purpose: Add missing INSERT policy for settings table
-- =====================================================

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON settings;

-- Recreate policies with full CRUD permissions
CREATE POLICY "Anyone can view settings" 
    ON settings FOR SELECT 
    TO anon 
    USING (true);

CREATE POLICY "Anyone can insert settings" 
    ON settings FOR INSERT 
    TO anon 
    WITH CHECK (true);

CREATE POLICY "Anyone can update settings" 
    ON settings FOR UPDATE 
    TO anon 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Anyone can delete settings" 
    ON settings FOR DELETE 
    TO anon 
    USING (true);

-- Add comment
COMMENT ON TABLE settings IS 'Application settings - accessible via anon key for configuration management';
