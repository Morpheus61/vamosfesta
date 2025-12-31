-- =====================================================
-- ADD CHILD REGISTRATION FEATURE
-- Migration: 010_add_child_registration.sql
-- Purpose: Add support for child registration as add-on
-- =====================================================

-- Add child registration price to settings table
INSERT INTO settings (setting_key, setting_value, description) 
VALUES ('child_registration_price', '1500', 'Price for Child Registration (12 Years and Above) add-on')
ON CONFLICT (setting_key) DO UPDATE 
SET setting_value = '1500', 
    description = 'Price for Child Registration (12 Years and Above) add-on';

-- Add child registration fields to guests table
ALTER TABLE guests 
ADD COLUMN IF NOT EXISTS child_count INTEGER DEFAULT 0 CHECK (child_count >= 0),
ADD COLUMN IF NOT EXISTS child_price NUMERIC DEFAULT 0;

-- Add comment to explain the fields
COMMENT ON COLUMN guests.child_count IS 'Number of children (12 years and above) registered with this guest';
COMMENT ON COLUMN guests.child_price IS 'Total price charged for child registrations';

-- Update RLS policies if needed (guests table should already have policies)
-- No additional RLS changes needed as child fields are part of guests table
