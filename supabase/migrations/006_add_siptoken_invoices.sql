-- =====================================================
-- ADD SIPTOKEN INVOICES TABLE
-- Migration: 006_add_siptoken_invoices.sql
-- Purpose: Create invoice system for token sales
-- =====================================================

-- Add missing columns to existing siptoken_invoices table
ALTER TABLE siptoken_invoices 
ADD COLUMN IF NOT EXISTS guest_name TEXT,
ADD COLUMN IF NOT EXISTS guest_phone TEXT,
ADD COLUMN IF NOT EXISTS seller_name TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_message_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

-- Update existing rows with guest data
UPDATE siptoken_invoices si
SET 
    guest_name = g.guest_name,
    guest_phone = g.mobile_number
FROM guests g
WHERE si.guest_id = g.id AND si.guest_name IS NULL;

-- Update existing rows with seller data
UPDATE siptoken_invoices si
SET seller_name = u.full_name
FROM users u
WHERE si.seller_id = u.id AND si.seller_name IS NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_siptoken_invoices_seller 
    ON siptoken_invoices(seller_id);
    
CREATE INDEX IF NOT EXISTS idx_siptoken_invoices_guest 
    ON siptoken_invoices(guest_id);
    
CREATE INDEX IF NOT EXISTS idx_siptoken_invoices_status 
    ON siptoken_invoices(status);
    
CREATE INDEX IF NOT EXISTS idx_siptoken_invoices_confirmed_at 
    ON siptoken_invoices(confirmed_at);

-- Enable Row Level Security
ALTER TABLE siptoken_invoices ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Staff can view their own invoices" ON siptoken_invoices;
DROP POLICY IF EXISTS "Staff can create invoices" ON siptoken_invoices;
DROP POLICY IF EXISTS "Staff can update their own invoices" ON siptoken_invoices;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON siptoken_invoices;
DROP POLICY IF EXISTS "Authenticated users can create invoices" ON siptoken_invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON siptoken_invoices;

-- RLS Policies - More permissive for authenticated users
CREATE POLICY "Authenticated users can view invoices"
    ON siptoken_invoices FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can create invoices"
    ON siptoken_invoices FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
    ON siptoken_invoices FOR UPDATE
    TO authenticated
    USING (true);

-- Function to auto-expire old invoices
CREATE OR REPLACE FUNCTION expire_old_siptoken_invoices()
RETURNS void AS $$
BEGIN
    UPDATE siptoken_invoices
    SET status = 'expired',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending' 
    AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update token_purchases when invoice is confirmed
CREATE OR REPLACE FUNCTION process_confirmed_invoice()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
        -- Get or create wallet
        INSERT INTO token_wallets (guest_id, guest_name, guest_phone, token_balance)
        VALUES (NEW.guest_id, NEW.guest_name, NEW.guest_phone, 0)
        ON CONFLICT (guest_phone) DO NOTHING;
        
        -- Record the purchase
        INSERT INTO token_purchases (
            wallet_id,
            seller_id,
            tokens_purchased,
            amount_paid,
            payment_method,
            razorpay_payment_id,
            transaction_status
        )
        SELECT 
            tw.id,
            NEW.seller_id,
            NEW.tokens_requested,
            NEW.amount,
            NEW.payment_method,
            NEW.razorpay_payment_id,
            'completed'
        FROM token_wallets tw
        WHERE tw.guest_phone = NEW.guest_phone;
        
        NEW.confirmed_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_confirmed_invoice ON siptoken_invoices;
CREATE TRIGGER trigger_process_confirmed_invoice
BEFORE UPDATE ON siptoken_invoices
FOR EACH ROW
EXECUTE FUNCTION process_confirmed_invoice();

-- Add comment
COMMENT ON TABLE siptoken_invoices IS 'Invoice system for token sales with WhatsApp integration';
