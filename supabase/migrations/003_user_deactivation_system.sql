-- =====================================================
-- USER DEACTIVATION SYSTEM
-- Migration: 003_user_deactivation_system.sql
-- Purpose: Add soft delete functionality with audit trail
-- =====================================================

-- Add deactivation tracking fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_notes TEXT;

-- Create index for faster filtering by active status
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_deactivated_at ON users(deactivated_at);

-- Add comment explaining the soft delete approach
COMMENT ON COLUMN users.is_active IS 'Soft delete flag - FALSE means user is deactivated but data is retained';
COMMENT ON COLUMN users.deactivated_at IS 'Timestamp when user was deactivated';
COMMENT ON COLUMN users.deactivated_by IS 'User ID of admin who deactivated this user';
COMMENT ON COLUMN users.deactivation_reason IS 'Reason for deactivation (resigned, terminated, etc.)';
COMMENT ON COLUMN users.deactivation_notes IS 'Additional notes about deactivation';

-- =====================================================
-- BEVERAGE INVENTORY SYSTEM
-- Purpose: Track beverage stock and consumption
-- =====================================================

-- Beverage Master - Product catalog
CREATE TABLE IF NOT EXISTS beverage_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('spirits', 'beer', 'wine', 'soft_drinks', 'cocktails')),
    beverage_name TEXT NOT NULL,
    brand TEXT,
    bottle_size_ml INTEGER NOT NULL,
    standard_peg_ml INTEGER DEFAULT 30,
    pegs_per_bottle INTEGER GENERATED ALWAYS AS (CASE WHEN standard_peg_ml > 0 THEN bottle_size_ml / standard_peg_ml ELSE 0 END) STORED,
    purchase_price DECIMAL(10,2),
    selling_price_per_unit DECIMAL(10,2),
    token_cost INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES users(id)
);

-- Inventory Stock - Physical count per event
CREATE TABLE IF NOT EXISTS inventory_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    beverage_id UUID REFERENCES beverage_master(id) ON DELETE CASCADE,
    event_id UUID,
    opening_stock_bottles INTEGER NOT NULL DEFAULT 0,
    current_stock_bottles INTEGER NOT NULL DEFAULT 0,
    closing_stock_bottles INTEGER,
    damaged_bottles INTEGER DEFAULT 0,
    wastage_ml INTEGER DEFAULT 0,
    restock_quantity INTEGER DEFAULT 0,
    stock_locked BOOLEAN DEFAULT false,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_updated_by UUID REFERENCES users(id),
    UNIQUE(beverage_id, event_id)
);

-- Consumption Tracking - Auto-calculated from siptoken orders
CREATE TABLE IF NOT EXISTS inventory_consumption (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    beverage_id UUID REFERENCES beverage_master(id) ON DELETE CASCADE,
    event_id UUID,
    order_id UUID,
    barman_id UUID REFERENCES users(id),
    quantity_served INTEGER NOT NULL,
    ml_consumed INTEGER NOT NULL,
    bottles_consumed DECIMAL(10,3) NOT NULL,
    served_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inventory Reconciliation - End of event
CREATE TABLE IF NOT EXISTS inventory_reconciliation (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID,
    beverage_id UUID REFERENCES beverage_master(id) ON DELETE CASCADE,
    opening_stock_bottles INTEGER NOT NULL,
    closing_stock_bottles INTEGER NOT NULL,
    restock_quantity INTEGER DEFAULT 0,
    damaged_bottles INTEGER DEFAULT 0,
    expected_consumption_bottles DECIMAL(10,3) NOT NULL,
    actual_consumption_bottles DECIMAL(10,3) NOT NULL,
    variance_bottles DECIMAL(10,3),
    variance_percentage DECIMAL(5,2),
    variance_value DECIMAL(10,2),
    variance_reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'investigation', 'closed')),
    reconciled_by UUID REFERENCES users(id),
    reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(event_id, beverage_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_beverage_master_category ON beverage_master(category);
CREATE INDEX IF NOT EXISTS idx_beverage_master_active ON beverage_master(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_event ON inventory_stock(event_id);
CREATE INDEX IF NOT EXISTS idx_inventory_consumption_event ON inventory_consumption(event_id);
CREATE INDEX IF NOT EXISTS idx_inventory_consumption_barman ON inventory_consumption(barman_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_event ON inventory_reconciliation(event_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_status ON inventory_reconciliation(status);

-- Add comments for documentation
COMMENT ON TABLE beverage_master IS 'Master catalog of all beverages available for events';
COMMENT ON TABLE inventory_stock IS 'Physical stock counts per event - tracks opening, current, and closing stock';
COMMENT ON TABLE inventory_consumption IS 'Detailed consumption log - automatically recorded when barmen serve beverages';
COMMENT ON TABLE inventory_reconciliation IS 'End-of-event reconciliation comparing expected vs actual consumption';

COMMENT ON COLUMN inventory_stock.stock_locked IS 'TRUE after opening stock is entered - prevents modifications during event';
COMMENT ON COLUMN inventory_reconciliation.variance_bottles IS 'Difference between actual and expected consumption (negative = shortage)';
COMMENT ON COLUMN inventory_reconciliation.variance_percentage IS 'Variance as percentage of consumption';
COMMENT ON COLUMN inventory_reconciliation.status IS 'pending=awaiting review, approved=normal variance, investigation=suspicious, closed=finalized';
