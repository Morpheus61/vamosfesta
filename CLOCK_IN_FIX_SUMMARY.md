# Clock-In Buttons & Console Errors - FIXES APPLIED

## Issues Identified

### 1. Clock In Buttons Not Working ❌
**Error:** `Uncaught ReferenceError: showClockInModal is not defined`

**Root Cause:** The deployed JavaScript bundle on Vercel (`main-CmvuxJQh.js`) is an **old cached version**. The source code in `main.js` is correct and has the `showClockInModal` function properly defined at line 6082.

### 2. Console Errors - 400 Bad Request ❌

#### A. siptoken_duty_sessions Table Issues
**Errors:**
```
Failed to load resource: the server responded with a status of 400 ()
bruwwqxeevqnbhunrhia.supabase.co/rest/v1/siptoken_duty_sessions?select=*&ended_at=is.null:1
```

**Root Causes:**
1. **Missing RLS Policies** - The table had no Row Level Security policies
2. **Schema Mismatch** - Table has `counter_name` (TEXT) but code tries to insert `counter_id` (UUID)

#### B. Settings Table Issues
**Errors:**
```
Failed to load resource: the server responded with a status of 400 ()
bruwwqxeevqnbhunrhia.supabase.co/rest/v1/settings?select=value&key=eq.token_rate:1
```

**Root Cause:** The deployed JavaScript is using old column names (`key`/`value`) instead of the correct ones (`setting_key`/`setting_value`). The source code is correct.

#### C. Counter Assignments Issues
**Error:** Queries using `ended_at=is.null` failing due to missing RLS policies.

---

## Solutions Applied ✅

### Migration Created: `007_fix_duty_sessions_and_settings.sql`

This migration fixes all database issues:

1. **✅ Added `counter_id` column** to `siptoken_duty_sessions` table
   - Type: UUID with foreign key to `bar_counters(id)`
   - Migrated existing data from `counter_name` to `counter_id`

2. **✅ Added RLS Policies** for `siptoken_duty_sessions`:
   - SELECT: Authenticated users can view all sessions
   - INSERT: Authenticated users can create sessions
   - UPDATE: Authenticated users can update sessions

3. **✅ Added RLS Policies** for `settings` table:
   - SELECT: Authenticated users can read all settings
   - ALL: Admins/Overseers/Super Admins can modify settings

4. **✅ Added RLS Policies** for `counter_assignments` table:
   - SELECT: Authenticated users can view assignments
   - INSERT: Authenticated users can create assignments
   - UPDATE: Authenticated users can update assignments

5. **✅ Added Performance Indexes:**
   - `idx_siptoken_duty_counter` on counter_id
   - `idx_counter_assignments_user` on user_id
   - `idx_counter_assignments_ended` on ended_at (filtered for NULL)

---

## Required Actions 🎯

### Step 1: Apply Database Migration
Run the migration in Supabase:

```bash
# Navigate to Supabase dashboard
# Or use CLI:
supabase db push
```

Or manually execute: `supabase/migrations/007_fix_duty_sessions_and_settings.sql`

### Step 2: Redeploy to Vercel
The current deployment has **stale JavaScript bundles**. You must redeploy:

**Option A - Via Vercel Dashboard:**
1. Go to https://vercel.com/dashboard
2. Select your `vamosfesta` project
3. Click "Deployments" tab
4. Click "Redeploy" on the latest deployment
5. Enable "Use existing Build Cache" = **OFF**

**Option B - Via Git Push:**
```bash
git add .
git commit -m "Fix: Add migration 007 for duty sessions and settings RLS"
git push origin main
```

**Option C - Via Vercel CLI:**
```bash
vercel --prod --force
```

### Step 3: Clear Browser Cache
After redeployment:
1. Open https://vamosfesta.vercel.app
2. Press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
3. Or use DevTools: Application > Clear Storage > Clear site data

---

## Verification Steps ✅

After migration and redeployment:

### 1. Check Console Errors
Open browser console (F12) and verify:
- ❌ No more "Failed to load resource: 400" errors
- ✅ Should see: `✅ SipToken initialized with rate: ₹10`
- ✅ Should see: `✅ Service Worker registered successfully`

### 2. Test Clock In Buttons
1. Login as SipToken Overseer
2. Navigate to SipToken tab
3. Click "Clock In Sales Staff" button
   - ✅ Modal should open
   - ✅ Staff dropdown should populate
   - ✅ Counter dropdown should show token sales counters
4. Click "Clock In Barman" button
   - ✅ Modal should open
   - ✅ Staff dropdown should populate (barmen only)
   - ✅ Counter dropdown should show bar counters (excluding token counters)

### 3. Verify Active Duty Sessions
- ✅ "Active Duty Sessions" section should load without errors
- ✅ Should display message: "No active staff" or show active sessions

---

## Technical Details

### Database Schema Changes

**Before:**
```sql
CREATE TABLE siptoken_duty_sessions (
    counter_name TEXT,  -- ❌ No foreign key, just text
    -- Missing RLS policies
);
```

**After:**
```sql
CREATE TABLE siptoken_duty_sessions (
    counter_name TEXT,
    counter_id UUID REFERENCES bar_counters(id),  -- ✅ Added
    -- + RLS policies
);
```

### Code Analysis

**Function Location:**
- `showClockInModal()` - Line 6082 in `src/main.js`
- Modal HTML - Lines 2385-2430 in `src/index.html`
- Button click handlers - Lines 2139, 2142 in `src/index.html`

**Query Patterns:**
```javascript
// Correct (in source code)
.from('settings')
.select('setting_value')
.eq('setting_key', 'token_rate')

// Incorrect (in deployed bundle)
.from('settings')
.select('value')
.eq('key', 'token_rate')  // ❌ Old column names
```

---

## Files Modified

1. **Created:** `supabase/migrations/007_fix_duty_sessions_and_settings.sql`
   - Comprehensive database fixes
   - RLS policy additions
   - Schema updates
   - Index optimizations

---

## Summary

**Root Causes:**
1. ❌ Deployed JavaScript bundle is stale/cached
2. ❌ Missing RLS policies on critical tables
3. ❌ Database schema mismatch (counter_name vs counter_id)

**Fixes:**
1. ✅ Created migration 007 with all database fixes
2. ✅ Source code is already correct
3. ✅ Need to redeploy to update JavaScript bundle

**Next Steps:**
1. Apply migration in Supabase
2. Redeploy on Vercel (force rebuild)
3. Clear browser cache
4. Test functionality

---

## Notes

- The `showClockInModal` function exists and is correctly defined in source code
- All queries in source code use correct column names
- The issue is purely deployment-related (stale build cache)
- After redeployment, all functionality should work correctly
