-- =====================================================
-- VERIFY AND FIX SIPTOKEN OVERSEER PERMISSIONS
-- Migration: 008_verify_and_fix_overseer.sql
-- Purpose: Check and update user permissions for SipToken Overseer
-- =====================================================

-- First, let's see which users should be SipToken overseers
-- This will help identify if the user record is correct
SELECT 
    id,
    username,
    full_name,
    role,
    is_siptoken_overseer,
    is_active
FROM users 
WHERE username LIKE '%Overseer%' 
   OR full_name LIKE '%Overseer%'
   OR is_siptoken_overseer = true;

-- If you see the user but is_siptoken_overseer is NULL or false, run:
-- UPDATE users SET is_siptoken_overseer = true WHERE username = 'YourOverseerUsername';
