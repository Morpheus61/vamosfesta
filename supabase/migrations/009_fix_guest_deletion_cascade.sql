-- =====================================================
-- FIX GUEST DELETION - ADD CASCADE DELETE
-- =====================================================
-- This migration fixes the issue where guests cannot be deleted
-- due to foreign key constraints. We add ON DELETE CASCADE to
-- allow automatic cleanup of related records when a guest is deleted.

-- Create guest_auth_tokens table if it doesn't exist (for WhatsApp authentication)
CREATE TABLE IF NOT EXISTS guest_auth_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    guest_phone TEXT NOT NULL,
    auth_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Drop and recreate guest_movements foreign key with CASCADE
ALTER TABLE guest_movements 
DROP CONSTRAINT IF EXISTS guest_movements_guest_id_fkey;

ALTER TABLE guest_movements
ADD CONSTRAINT guest_movements_guest_id_fkey 
FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;

-- Drop and recreate guest_pass_tokens foreign key with CASCADE
ALTER TABLE guest_pass_tokens 
DROP CONSTRAINT IF EXISTS guest_pass_tokens_guest_id_fkey;

ALTER TABLE guest_pass_tokens
ADD CONSTRAINT guest_pass_tokens_guest_id_fkey 
FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;

-- Drop and recreate pass_access_log foreign key with CASCADE
ALTER TABLE pass_access_log 
DROP CONSTRAINT IF EXISTS pass_access_log_guest_id_fkey;

ALTER TABLE pass_access_log
ADD CONSTRAINT pass_access_log_guest_id_fkey 
FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;

-- Drop and recreate guest_auth_tokens foreign key with CASCADE (if table already exists)
ALTER TABLE IF EXISTS guest_auth_tokens 
DROP CONSTRAINT IF EXISTS guest_auth_tokens_guest_id_fkey;

ALTER TABLE IF EXISTS guest_auth_tokens
ADD CONSTRAINT guest_auth_tokens_guest_id_fkey 
FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;
