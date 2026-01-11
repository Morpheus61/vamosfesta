-- =====================================================
-- FIX: Gate Roster RLS Policies
-- Allow Gate Overseers and Super Admins to manage gate assignments
-- =====================================================

-- Gate Overseers and Super Admins can insert gate roster entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'gate_roster' 
        AND policyname = 'Overseers can assign marshalls'
    ) THEN
        CREATE POLICY "Overseers can assign marshalls" 
            ON gate_roster FOR INSERT 
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM users 
                    WHERE id = auth.uid() 
                    AND (role = 'super_admin' OR is_gate_overseer = true)
                )
            );
    END IF;
END $$;

-- Gate Overseers and Super Admins can update gate roster entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'gate_roster' 
        AND policyname = 'Overseers can update assignments'
    ) THEN
        CREATE POLICY "Overseers can update assignments" 
            ON gate_roster FOR UPDATE 
            USING (
                EXISTS (
                    SELECT 1 FROM users 
                    WHERE id = auth.uid() 
                    AND (role = 'super_admin' OR is_gate_overseer = true)
                )
            );
    END IF;
END $$;

-- Gate Overseers and Super Admins can delete gate roster entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'gate_roster' 
        AND policyname = 'Overseers can unassign marshalls'
    ) THEN
        CREATE POLICY "Overseers can unassign marshalls" 
            ON gate_roster FOR DELETE 
            USING (
                EXISTS (
                    SELECT 1 FROM users 
                    WHERE id = auth.uid() 
                    AND (role = 'super_admin' OR is_gate_overseer = true)
                )
            );
    END IF;
END $$;
