-- =====================================================
-- ADD MINIMUM TOKEN PURCHASE SETTING
-- Migration: 005_add_min_token_purchase.sql
-- Purpose: Add minimum token purchase configuration
-- =====================================================

-- Add min_token_purchase column to siptoken_settings table
ALTER TABLE siptoken_settings 
ADD COLUMN IF NOT EXISTS min_token_purchase INTEGER DEFAULT 5;

-- Add comment
COMMENT ON COLUMN siptoken_settings.min_token_purchase IS 'Minimum number of tokens a guest must purchase at once';

-- Update existing row with default value
UPDATE siptoken_settings 
SET min_token_purchase = 5 
WHERE min_token_purchase IS NULL;

-- Insert setting into settings table for consistency
INSERT INTO settings (setting_key, setting_value, description)
VALUES ('min_token_purchase', '5', 'Minimum tokens that can be purchased at once')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;
