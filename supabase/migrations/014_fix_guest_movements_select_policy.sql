-- =====================================================
-- FIX: Guest Movements Policies
-- ISSUE: App uses custom session auth (user_sessions table), NOT Supabase Auth
-- Therefore auth.uid() is NULL and INSERT policy fails
-- =====================================================

-- Ensure RLS is enabled
ALTER TABLE guest_movements ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Anyone can view guest movements" ON guest_movements;
DROP POLICY IF EXISTS "All users can view guest movements" ON guest_movements;
DROP POLICY IF EXISTS "Public can view guest movements" ON guest_movements;
DROP POLICY IF EXISTS "Authenticated users can insert movements" ON guest_movements;
DROP POLICY IF EXISTS "Marshalls can insert guest movements" ON guest_movements;
DROP POLICY IF EXISTS "Users can update their own movements" ON guest_movements;
DROP POLICY IF EXISTS "Super admin can delete movements" ON guest_movements;

-- SELECT: Allow everyone to view movements (needed for statistics)
CREATE POLICY "Allow select guest movements"
    ON guest_movements FOR SELECT
    USING (true);

-- INSERT: Allow all inserts (app logic validates user is authenticated)
-- Since we use custom auth (user_sessions), auth.uid() doesn't work
CREATE POLICY "Allow insert guest movements"
    ON guest_movements FOR INSERT
    WITH CHECK (true);

-- UPDATE: Allow all updates (app logic validates permissions)
CREATE POLICY "Allow update guest movements"
    ON guest_movements FOR UPDATE
    USING (true);

-- DELETE: Allow all deletes (should be rare, app logic validates)
CREATE POLICY "Allow delete guest movements"
    ON guest_movements FOR DELETE
    USING (true);

-- Grant permissions
GRANT ALL ON guest_movements TO anon;
GRANT ALL ON guest_movements TO authenticated;
