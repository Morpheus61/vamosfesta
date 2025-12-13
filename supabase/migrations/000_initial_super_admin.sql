-- =====================================================
-- INITIAL SUPER ADMIN SETUP
-- Vamos Festa Event Management System
-- =====================================================
-- 
-- This creates the initial Super Admin account for first-time login.
-- 
-- CREDENTIALS:
-- Username: SuperAdmin
-- Password: VamosFesta@2026
-- 
-- ⚠️ IMPORTANT: Change the password immediately after first login!
-- =====================================================

-- Insert Super Admin user
INSERT INTO users (
    username, 
    password_hash, 
    full_name, 
    role, 
    email, 
    phone,
    is_active,
    is_siptoken_overseer
) VALUES (
    'SuperAdmin',
    'VamosFesta@2026',  -- ⚠️ CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!
    'Super Administrator',
    'super_admin',
    'admin@vamosfesta.com',
    '+919876543210',  -- Update with actual phone number
    true,
    true
);

-- Verify the user was created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE username = 'SuperAdmin') THEN
        RAISE NOTICE '✅ Super Admin user "SuperAdmin" created successfully!';
        RAISE NOTICE '📧 Email: admin@vamosfesta.com';
        RAISE NOTICE '🔑 Username: SuperAdmin';
        RAISE NOTICE '🔒 Password: VamosFesta@2026';
        RAISE NOTICE '';
        RAISE NOTICE '⚠️  CRITICAL: Change this password immediately after first login!';
        RAISE NOTICE '⚠️  Update the email and phone number with actual details!';
    ELSE
        RAISE EXCEPTION '❌ Failed to create Super Admin user!';
    END IF;
END $$;

-- Grant all permissions (Super Admin can do everything)
COMMENT ON TABLE users IS 'Super Admin (SuperAdmin) has full access to all system features';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════';
    RAISE NOTICE '   VAMOS FESTA - Initial Setup Complete';
    RAISE NOTICE '════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Your Vamos Festa system is ready!';
    RAISE NOTICE '';
    RAISE NOTICE 'Login with:';
    RAISE NOTICE '  Username: SuperAdmin';
    RAISE NOTICE '  Password: VamosFesta@2026';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Login to the system';
    RAISE NOTICE '2. CHANGE YOUR PASSWORD immediately';
    RAISE NOTICE '3. Update your email and phone in profile';
    RAISE NOTICE '4. Create entry gates';
    RAISE NOTICE '5. Add sellers, marshalls, and other staff';
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;
