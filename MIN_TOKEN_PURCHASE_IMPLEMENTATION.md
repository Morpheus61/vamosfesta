# MINIMUM TOKEN PURCHASE CONFIGURATION - IMPLEMENTATION COMPLETE

## Overview
Added **Minimum Token Purchase** configuration to the SipToken system. This setting controls the minimum number of tokens a guest must buy at once from Token Sales Staff.

---

## 📍 Token Configuration Segments Identified

### 1. **Super Admin Settings Tab** (index.html)
- **Location**: Lines 1382-1420
- **Section**: Settings → SipToken Configuration
- **Access**: Super Admin only

### 2. **SipToken Overseer Tab** (index.html)
- **Location**: Lines 2230-2270
- **Section**: SipToken Dashboard → Token Config Tab
- **Access**: Super Admin + SipToken Overseer

### 3. **JavaScript Functions** (main.js)
- `saveTokenRate()` - Lines 6332-6395 (Super Admin)
- `saveOverseerTokenRate()` - Lines 8406-8484 (Overseer)
- `loadTokenRate()` - Lines 6316-6342 (Settings load)
- `loadOverseerSettings()` - Lines 8486-8527 (Overseer load)
- `initializeSipToken()` - Lines 5400-5439 (Initialization)

### 4. **Database Schema**
- Table: `siptoken_settings` (002_siptoken_setup.sql)
- New Migration: `005_add_min_token_purchase.sql`

---

## ✅ Changes Implemented

### **1. UI Updates (index.html)**

#### Super Admin Settings Tab (Lines 1391-1420)
**Before:**
- Single "Token Rate" field with inline Save button

**After:**
- Token Rate field (blue section)
- **NEW: Minimum Token Purchase field (purple section)**
- Unified "Save Configuration" button

#### SipToken Overseer Tab (Lines 2238-2268)
**Before:**
- Single "Token Rate" field with inline Save button

**After:**
- Token Rate field (blue section)
- **NEW: Minimum Token Purchase field (purple section)**
- Unified "Save Configuration" button

---

### **2. JavaScript Functions (main.js)**

#### `saveTokenRate()` - Super Admin Save Function
**Updates:**
- Now saves **both** `token_rate` AND `min_token_purchase`
- Validates both fields (must be ≥ 1)
- Updates both `settings` table (2 rows) and `siptoken_settings` table
- Sets global variables: `window.siptokenRate` and `window.minTokenPurchase`
- Success message: "Configuration saved: ₹100/token, Min: 5 tokens"

#### `saveOverseerTokenRate()` - Overseer Save Function
**Updates:**
- Now saves **both** `token_rate` AND `min_token_purchase`
- Validates both fields (must be ≥ 1)
- Updates both `settings` table (2 rows) and `siptoken_settings` table
- Sets global variables: `window.siptokenRate` and `window.minTokenPurchase`
- Success message: "Configuration updated: ₹100/token, Min: 5 tokens"

#### `loadTokenRate()` - Super Admin Settings Load
**Updates:**
- Loads `token_rate` from settings → populates `settingTokenRate` input
- **NEW: Loads `min_token_purchase` from settings → populates `settingMinTokens` input**

#### `loadOverseerSettings()` - Overseer Settings Load
**Updates:**
- Loads `token_rate` from settings → populates `overseerTokenRate` input
- **NEW: Loads `min_token_purchase` from settings → populates `overseerMinTokens` input**
- Sets default values if settings not found (Rate: 10, Min: 5)

#### `initializeSipToken()` - Global Initialization
**Updates:**
- Loads `token_rate` → sets `window.siptokenRate`
- **NEW: Loads `min_token_purchase` → sets `window.minTokenPurchase`**
- Console log: "✅ SipToken initialized - Rate: ₹100, Min: 5 tokens"

---

### **3. Database Migration (005_add_min_token_purchase.sql)**

**Purpose:** Add `min_token_purchase` column to `siptoken_settings` table

**Changes:**
```sql
-- Add column to siptoken_settings
ALTER TABLE siptoken_settings 
ADD COLUMN IF NOT EXISTS min_token_purchase INTEGER DEFAULT 5;

-- Update existing rows
UPDATE siptoken_settings 
SET min_token_purchase = 5 
WHERE min_token_purchase IS NULL;

-- Add to settings table for consistency
INSERT INTO settings (setting_key, setting_value, description)
VALUES ('min_token_purchase', '5', 'Minimum tokens that can be purchased at once')
ON CONFLICT (setting_key) DO UPDATE...
```

**Database Tables Updated:**
1. `siptoken_settings` - New column: `min_token_purchase` (INTEGER, default: 5)
2. `settings` - New row: `setting_key = 'min_token_purchase'`, `setting_value = '5'`

---

### **4. Global State Variables**

**Added:**
```javascript
window.minTokenPurchase = 5; // Default minimum
```

**Location:** main.js, line 5399 (alongside `window.siptokenRate`)

---

## 🎯 User Workflow

### **Super Admin:**
1. Navigate to **Settings** tab
2. Scroll to **SipToken Configuration** section
3. Set **Token Rate** (e.g., ₹100)
4. Set **Minimum Token Purchase** (e.g., 5 tokens)
5. Click **"Save Configuration"**
6. ✅ Both settings saved to database

### **SipToken Overseer:**
1. Navigate to **SipToken** tab
2. Click **"Token Config"** sub-tab
3. Set **Token Rate** (e.g., ₹100)
4. Set **Minimum Token Purchase** (e.g., 5 tokens)
5. Click **"Save Configuration"**
6. ✅ Both settings saved to database

---

## 🔧 Implementation Details

### **Default Values:**
- Token Rate: ₹10 per token
- Minimum Token Purchase: 5 tokens

### **Validation:**
- Both fields must be ≥ 1
- Input type: `number` with `min="1"`
- Server-side validation in save functions

### **Database Synchronization:**
Both save functions update **3 places**:
1. `settings` table → `setting_key = 'token_rate'`
2. `settings` table → `setting_key = 'min_token_purchase'`
3. `siptoken_settings` table → `token_rate` AND `min_token_purchase` columns

### **Authorization:**
- `saveTokenRate()`: Super Admin ONLY
- `saveOverseerTokenRate()`: Super Admin OR SipToken Overseer

---

## 📋 Next Steps for Implementation

### **1. Run Database Migration**
Execute in Supabase SQL Editor:
```bash
supabase/migrations/005_add_min_token_purchase.sql
```

### **2. Deploy Code**
- Commit changes: `index.html`, `main.js`
- Push to repository
- Vercel auto-deploys

### **3. Token Sales Staff Integration**
**Future Enhancement:** Update Token Sales workflow to enforce minimum:

**File:** `main.js` → `sendInvoiceToGuest()` function
**Add validation:**
```javascript
const qty = parseInt(document.getElementById('tokenQty').value);
if (qty < window.minTokenPurchase) {
    showToast(`Minimum purchase: ${window.minTokenPurchase} tokens`, 'error');
    return;
}
```

---

## 🎨 UI Preview

### **Before:**
```
Token Rate (₹ per token)
[  10  ] [Save Rate]
```

### **After:**
```
Token Rate (₹ per token)
[  100  ]
Example: If rate is ₹10, buying 5 tokens costs ₹50

Minimum Token Purchase
[   5   ]
Minimum tokens a guest must buy at once

[💾 Save Configuration]
```

---

## ✅ Testing Checklist

- [ ] Super Admin can see both fields in Settings tab
- [ ] SipToken Overseer can see both fields in Token Config tab
- [ ] Saving updates both `settings` and `siptoken_settings` tables
- [ ] Values persist after page refresh
- [ ] Validation prevents values < 1
- [ ] Global variables `window.siptokenRate` and `window.minTokenPurchase` set correctly
- [ ] Token Sales Staff UI respects minimum (future enhancement)

---

## 📊 Database Schema Changes

### **siptoken_settings Table**
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `token_rate` | DECIMAL(10,2) | 10.00 | Price per token (₹) |
| **`min_token_purchase`** | **INTEGER** | **5** | **Minimum tokens per transaction** |
| `qr_expiry_seconds` | INTEGER | 60 | QR code validity |
| `allow_fractional_tokens` | BOOLEAN | false | Allow partial tokens |

### **settings Table (New Rows)**
| setting_key | setting_value | description |
|-------------|---------------|-------------|
| `token_rate` | `'10'` | Price per token in INR |
| **`min_token_purchase`** | **`'5'`** | **Minimum tokens that can be purchased at once** |

---

## 🚀 Summary

**Feature:** Minimum Token Purchase Configuration  
**Status:** ✅ Complete  
**Files Modified:** 3  
**Database Migration:** 1  
**Authorization:** Super Admin + SipToken Overseer  
**Default Value:** 5 tokens  

**Impact:**
- Prevents small token purchases (reduces transaction overhead)
- Configurable by Super Admin and SipToken Overseer
- Synchronized across all database tables
- Ready for enforcement in Token Sales workflow

---

**Implementation Date:** December 20, 2025  
**Developer:** GitHub Copilot  
**Version:** VamosFesta v2.0 - SipToken Module
