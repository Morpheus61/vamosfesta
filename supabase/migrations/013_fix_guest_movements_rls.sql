-- =====================================================
-- FIX: Guest Movements RLS Policies
-- Allow authenticated users to view and insert guest movements
-- =====================================================

-- Ensure RLS is enabled
ALTER TABLE guest_movements ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone can view guest movements" ON guest_movements;
DROP POLICY IF EXISTS "Marshalls can insert guest movements" ON guest_movements;

-- SELECT: Allow all authenticated users AND anon to view guest movements
-- This is needed for admins viewing gate statistics
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guest_movements' 
        AND policyname = 'All users can view guest movements'
    ) THEN
        CREATE POLICY "All users can view guest movements" 
            ON guest_movements FOR SELECT 
            USING (true);
    END IF;
END $$;

-- INSERT: Allow authenticated users (Marshalls) to insert guest movements
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guest_movements' 
        AND policyname = 'Authenticated users can insert movements'
    ) THEN
        CREATE POLICY "Authenticated users can insert movements" 
            ON guest_movements FOR INSERT 
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM users 
                    WHERE id = auth.uid() 
                    AND is_active = true
                )
            );
    END IF;
END $$;

-- UPDATE: Allow the marshall who created the movement or super_admin to update
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guest_movements' 
        AND policyname = 'Users can update their own movements'
    ) THEN
        CREATE POLICY "Users can update their own movements" 
            ON guest_movements FOR UPDATE 
            USING (
                marshall_id = auth.uid() 
                OR EXISTS (
                    SELECT 1 FROM users 
                    WHERE id = auth.uid() 
                    AND role = 'super_admin'
                )
            );
    END IF;
END $$;

-- DELETE: Only super_admin can delete movements (for data integrity)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guest_movements' 
        AND policyname = 'Super admin can delete movements'
    ) THEN
        CREATE POLICY "Super admin can delete movements" 
            ON guest_movements FOR DELETE 
            USING (
                EXISTS (
                    SELECT 1 FROM users 
                    WHERE id = auth.uid() 
                    AND role = 'super_admin'
                )
            );
    END IF;
END $$;
