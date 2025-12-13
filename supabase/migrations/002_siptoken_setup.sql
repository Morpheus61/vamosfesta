-- =====================================================
-- SIPTOKEN MODULE - Database Schema
-- Vamos Festa Beverage Sales System
-- =====================================================

-- Add SipToken roles to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_siptoken_overseer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_siptoken_sales BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_barman BOOLEAN DEFAULT false;

-- Settings for SipToken system
CREATE TABLE IF NOT EXISTS siptoken_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_rate DECIMAL(10,2) DEFAULT 10.00,  -- ₹ per token
    qr_expiry_seconds INTEGER DEFAULT 60,
    allow_fractional_tokens BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO siptoken_settings (token_rate, qr_expiry_seconds, allow_fractional_tokens)
VALUES (10.00, 60, false)
ON CONFLICT DO NOTHING;

-- Guest Token Wallets
CREATE TABLE IF NOT EXISTS token_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guest_id UUID REFERENCES guests(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    guest_phone TEXT NOT NULL,
    token_balance INTEGER DEFAULT 0,
    total_purchased INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guest_phone)
);

-- Token Purchase Transactions (Cash to Token)
CREATE TABLE IF NOT EXISTS token_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES token_wallets(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES users(id),
    tokens_purchased INTEGER NOT NULL CHECK (tokens_purchased > 0),
    amount_paid DECIMAL(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'cash',  -- 'cash', 'upi', 'online'
    razorpay_payment_id TEXT,
    transaction_status TEXT DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Token Payment QR Codes (for barman scanning)
CREATE TABLE IF NOT EXISTS token_payment_qrs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES token_wallets(id) ON DELETE CASCADE,
    qr_data TEXT UNIQUE NOT NULL,
    tokens_amount INTEGER NOT NULL CHECK (tokens_amount > 0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    barman_id UUID REFERENCES users(id),
    order_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Beverage Orders (processed by barmen)
CREATE TABLE IF NOT EXISTS beverage_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES token_wallets(id) ON DELETE CASCADE,
    payment_qr_id UUID REFERENCES token_payment_qrs(id) ON DELETE SET NULL,
    barman_id UUID REFERENCES users(id),
    tokens_spent INTEGER NOT NULL CHECK (tokens_spent > 0),
    items JSONB NOT NULL,  -- Array of {name, quantity, tokens_per_item}
    total_tokens INTEGER NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    cancelled_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Staff Duty Sessions (for Overseers to manage)
CREATE TABLE IF NOT EXISTS siptoken_duty_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
    overseer_id UUID REFERENCES users(id),
    staff_role TEXT NOT NULL CHECK (staff_role IN ('token_sales', 'barman')),
    counter_name TEXT,
    
    -- Clock in/out times
    clock_in_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    clock_out_time TIMESTAMP WITH TIME ZONE,
    
    -- Reconciliation data - Token Sales Staff
    opening_cash DECIMAL(10,2),
    closing_cash DECIMAL(10,2),
    tokens_sold INTEGER DEFAULT 0,
    rupees_collected DECIMAL(10,2) DEFAULT 0,
    
    -- Reconciliation data - Barman
    orders_served INTEGER DEFAULT 0,
    tokens_processed INTEGER DEFAULT 0,
    
    -- Status and notes
    status TEXT DEFAULT 'on_duty' CHECK (status IN ('on_duty', 'pending_clockout', 'clocked_out')),
    discrepancy_amount DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytics View: Real-time SipToken Stats
CREATE OR REPLACE VIEW siptoken_analytics AS
SELECT 
    COUNT(DISTINCT tw.id) as total_guests_with_tokens,
    COALESCE(SUM(tw.token_balance), 0) as total_active_tokens,
    COALESCE(SUM(tw.total_purchased), 0) as total_tokens_sold,
    COALESCE(SUM(tw.total_spent), 0) as total_tokens_spent,
    COALESCE(SUM(tp.amount_paid), 0) as total_revenue,
    COUNT(bo.id) as total_orders,
    COUNT(DISTINCT bo.barman_id) as active_barmen
FROM token_wallets tw
LEFT JOIN token_purchases tp ON tw.id = tp.wallet_id
LEFT JOIN beverage_orders bo ON tw.id = bo.wallet_id;

-- Function: Update wallet balance after purchase
CREATE OR REPLACE FUNCTION update_wallet_after_purchase()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE token_wallets
    SET 
        token_balance = token_balance + NEW.tokens_purchased,
        total_purchased = total_purchased + NEW.tokens_purchased,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.wallet_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update wallet on token purchase
DROP TRIGGER IF EXISTS trigger_update_wallet_purchase ON token_purchases;
CREATE TRIGGER trigger_update_wallet_purchase
AFTER INSERT ON token_purchases
FOR EACH ROW
EXECUTE FUNCTION update_wallet_after_purchase();

-- Function: Update wallet balance after order
CREATE OR REPLACE FUNCTION update_wallet_after_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        UPDATE token_wallets
        SET 
            token_balance = token_balance - NEW.tokens_spent,
            total_spent = total_spent + NEW.tokens_spent,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.wallet_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update wallet on order completion
DROP TRIGGER IF EXISTS trigger_update_wallet_order ON beverage_orders;
CREATE TRIGGER trigger_update_wallet_order
AFTER INSERT ON beverage_orders
FOR EACH ROW
EXECUTE FUNCTION update_wallet_after_order();

-- Function: Auto-expire old payment QRs
CREATE OR REPLACE FUNCTION expire_old_payment_qrs()
RETURNS void AS $$
BEGIN
    UPDATE token_payment_qrs
    SET status = 'expired'
    WHERE status = 'pending' 
    AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE siptoken_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_payment_qrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beverage_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE siptoken_duty_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - adjust based on your auth setup)
CREATE POLICY "Anyone can view SipToken settings"
    ON siptoken_settings FOR SELECT
    USING (true);

CREATE POLICY "Admins can modify settings"
    ON siptoken_settings FOR ALL
    USING (auth.uid() IN (SELECT id FROM users WHERE role IN ('super_admin', 'admin')));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_wallets_guest_phone ON token_wallets(guest_phone);
CREATE INDEX IF NOT EXISTS idx_token_wallets_guest_id ON token_wallets(guest_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_wallet ON token_purchases(wallet_id);
CREATE INDEX IF NOT EXISTS idx_token_payment_qrs_wallet ON token_payment_qrs(wallet_id);
CREATE INDEX IF NOT EXISTS idx_token_payment_qrs_status ON token_payment_qrs(status);
CREATE INDEX IF NOT EXISTS idx_beverage_orders_wallet ON beverage_orders(wallet_id);
CREATE INDEX IF NOT EXISTS idx_siptoken_duty_staff ON siptoken_duty_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_siptoken_duty_status ON siptoken_duty_sessions(status);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ SipToken module successfully installed for Vamos Festa!';
    RAISE NOTICE '🍹 Token-based beverage sales system is ready!';
    RAISE NOTICE '👁️ Overseer functionality enabled for staff management!';
END $$;
