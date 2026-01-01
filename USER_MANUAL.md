# VAMOS FESTA - User Manual
## Latin Fiesta Night - Event Management System

**Version:** 2.5  
**Last Updated:** December 18, 2025

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [User Roles & Access Levels](#user-roles--access-levels)
4. [Super Admin Guide](#super-admin-guide)
5. [Admin Guide](#admin-guide)
6. [Seller Guide](#seller-guide)
7. [Entry Marshall Guide](#entry-marshall-guide)
8. [Gate Overseer Guide](#gate-overseer-guide)
9. [SipToken Overseer Guide](#siptoken-overseer-guide)
10. [Troubleshooting](#troubleshooting)
11. [Security & Best Practices](#security--best-practices)

---

## System Overview

Vamos Festa is a comprehensive event management system designed for multi-seller ticket registration with integrated payment verification, QR-based entry management, SipToken beverage service, and security-controlled gate operations.

### Key Features

- **Multi-Seller Registration**: Multiple sellers can register guests independently
- **Payment Verification**: Super Admin verifies all payments before pass generation
- **Digital Guest Passes**: QR code-based passes with WhatsApp delivery
- **Entry Management**: QR scanning at gates with entry/exit tracking
- **SipToken System**: Cashless beverage service with token-based ordering
- **Inventory Management**: Complete beverage stock tracking and reconciliation
- **Marshall Management**: Overseer-controlled clock-in/out with approval workflows
- **User Deactivation**: Soft delete system with audit trail and reactivation
- **Card-Based UI**: Clean, mobile-friendly lists with click-to-expand details
- **Real-time Analytics**: Live statistics and reporting
- **Security Controls**: Role-based access with audit trails

### System Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (optional - works offline)
- Camera access (for QR scanning)
- WhatsApp (for pass delivery)
- 50MB free storage (for offline caching)

### Progressive Web App (PWA) Features

Rock 4 One is a **Progressive Web App** that works offline:

✅ **Install as Native App**: Add to home screen on mobile/desktop  
✅ **Offline Mode**: Continue working without internet  
✅ **Auto-Sync**: Queued data syncs when connection returns  
✅ **Fast Loading**: Cached assets load instantly  
✅ **Background Updates**: Automatic app updates  
✅ **Push Notifications**: Real-time event alerts (optional)

---

## Getting Started

### Installing the App (Recommended)

**On Mobile (Android/iOS):**
1. Open `https://rock4one.vercel.app` in browser
2. Look for **"Install App"** button (bottom-right)
3. Tap **Install** or **Add to Home Screen**
4. Find Rock 4 One icon on your home screen
5. Launch app from icon (opens in full screen)

**On Desktop (Windows/Mac/Linux):**
1. Open app in Chrome/Edge
2. Click install icon in address bar (⊕)
3. Or click "Install App" button when prompted
4. App installs to applications folder
5. Launch like any other desktop app

**Benefits of Installing:**
- ⚡ Faster loading (cached assets)
- 📱 Works offline with auto-sync
- 🎯 Full screen experience
- 🔔 Push notifications enabled
- 🏠 Quick access from home screen

### First Time Login

1. Navigate to: `https://rock4one.vercel.app` (or open installed app)
2. Enter your credentials:
   - **Username**: Provided by Super Admin
   - **Password**: Provided by Super Admin
3. Click **Login**
4. Change your password immediately (Super Admin only)

### Offline Mode Indicator

When you lose internet connection:
- 🔴 **Red badge** appears (top-right): "Offline Mode"
- Continue working normally
- Data saves locally and syncs when online
- Badge disappears when connection returns

### Understanding the New Card-Based UI

**Vamos Festa v2.5 introduces a clean, mobile-friendly interface:**

#### What You'll See

**All Lists Now Use Cards:**
- Personnel lists (Admins, Users, Marshalls, Staff)
- Clean, uncluttered appearance
- Easy to scan and find people
- Mobile-optimized with no horizontal scrolling

**Collapsed View (Default):**
```
┌─────────────────────────────────────────┐
│ Ramesh Kumar                   🔽      │
│ 🏷️ Gate Overseer  📱 9876543210       │
└─────────────────────────────────────────┘
```

Shows only essential information:
- ✅ Name (large, bold)
- ✅ Role (with icon)
- ✅ Phone number
- ✅ Status badges (if applicable)

**Click to Expand:**
- Click anywhere on the card
- Chevron rotates (🔽 → 🔼)
- Details slide down smoothly
- Shows full information and action buttons

**Expanded View:**
```
┌─────────────────────────────────────────┐
│ Ramesh Kumar                   🔼      │
│ 🏷️ Gate Overseer  📱 9876543210       │
├─────────────────────────────────────────┤
│ Username: GateOverseer-Ramesh          │
│ Club: 41'ers Mumbai                    │
│ Registrations: 45 | Revenue: ₹67,500  │
│                                         │
│ [Edit] [Assign Gates] [Deactivate]    │
└─────────────────────────────────────────┘
```

**Filter Dropdowns:**
- Located at top of each list
- Options:
  - **Active Only** (default) - Shows only active users
  - **All Users** - Shows everyone
  - **Deactivated Only** - Shows deactivated users
- Results update instantly

**Status Badges:**
- 🟢 **ON DUTY** - Staff currently working (green)
- 🔴 **DEACTIVATED** - User cannot login (red)
- Badges appear next to name in collapsed view

**Visual Indicators:**
- Hover effect: Border changes to yellow
- Deactivated users: Semi-transparent (60% opacity)
- Active cursor: Indicates card is clickable

#### Interaction Tips

**✅ DO:**
- Click cards to see full details
- Use filters to find specific users
- Click action buttons inside expanded cards
- Expand multiple cards simultaneously

**❌ DON'T:**
- Don't look for traditional tables
- Cards don't need double-clicking
- Action buttons won't collapse the card

### Dashboard Navigation

The system uses a tab-based navigation:
- **Home/Dashboard**: Role-specific overview
- **Main Functions**: Role-based operational tabs
- **Settings**: Configuration and management
- **Logout**: Secure session termination

---

## User Roles & Access Levels

### Role Hierarchy

| Role | Access Level | Primary Functions |
|------|--------------|-------------------|
| **Super Admin** | Full System Access | Payment verification, pass generation, user management, settings |
| **Admin** | Read-Only + Overseer (optional) | View all data, marshall management (if overseer) |
| **Seller** | Own Sales Only | Register guests, view own registrations |
| **Entry Marshall** | Gate Operations | Scan QR codes, manage entry/exit |
| **Gate Overseer** | Marshall Management | Assign marshalls, generate tokens, approve clockouts |

---

## Super Admin Guide

### 1. Dashboard Overview

Upon login, you'll see:
- **Total Registrations**: All guest registrations
- **Pending Verifications**: Awaiting payment verification
- **Verified Registrations**: Approved entries
- **Revenue Summary**: Total, cash, UPI, bank transfer amounts

### 2. Payment Verification Workflow

#### Viewing Pending Registrations

1. Click **Verification Queue** tab
2. View list showing:
   - Guest Name & Mobile
   - Entry Type (Stag/Couple)
   - Payment Mode & Reference
   - Seller Information
   - Registration Date

#### Verifying Payments

**For Cash Payments:**
1. Click **Verify** on the registration
2. Confirm cash was physically collected by seller
3. Click **Verify Payment**

**For UPI Payments:**
1. Note the UTR/Reference number
2. Check your payment app/bank for matching transaction
3. Verify amount matches ticket price
4. Click **Verify** → **Verify Payment**

**For Bank Transfers:**
1. Check bank statement for reference number
2. Verify transfer amount and date
3. Click **Verify** → **Verify Payment**

#### Rejecting Payments

1. Click **Reject** on suspicious registration
2. Enter rejection reason (required)
3. Seller and guest will be notified

### 3. Pass Generation & Distribution

#### Generating Guest Passes

**Automatic (After Verification):**
- System prompts to generate pass immediately
- Click **Generate Pass** in modal

**Manual:**
1. Go to **All Registrations** tab
2. Find verified guest
3. Click **QR** icon
4. Pass displays with guest details and QR code

#### Pass Components

Each pass includes:
- Event name and tagline in gold banner header
- Guest name and mobile number
- Entry type (Stag/Couple)
- Unique QR code for scanning
- Event date and venue
- Musical theme decoration

#### Sending Passes

**Via WhatsApp:**
1. Generate pass
2. Click **Send via WhatsApp**
3. WhatsApp opens with pre-filled message
4. Attach downloaded pass image
5. Send to guest

**Direct Download:**
1. Generate pass
2. Click **Download**
3. Share file manually

### 4. Seller Management

#### Creating New Sellers

1. Click **Seller Management** tab
2. Click **Add New Seller**
3. Fill in details:
   - Username (unique, login ID)
   - Password (minimum 6 characters)
   - Full Name
   - Mobile Number (10 digits)
   - Club Name (optional)
   - Club Number (optional)
4. Click **Create Seller**

#### Managing Existing Users

**Card-Based List View:**
- Each user shown as a card
- Collapsed view shows: Name, Role, Phone, Club
- Click card to expand and see:
  - Username (system ID)
  - Club details
  - Registration statistics
  - Verified revenue amount
  - Deactivation details (if deactivated)

**Filter Options:**
Use dropdown to filter:
- **Active Only** (default)
- **All Users**
- **Deactivated Only**

**Actions Available:**
- **Edit**: Modify user details
- **Deactivate**: Soft delete with reason tracking
- **Reactivate**: Restore deactivated users

#### Deactivating Users (Soft Delete)

**Why Deactivate Instead of Delete?**
✅ Preserves all historical data for reports  
✅ Maintains audit trail  
✅ Can be reversed if needed  
✅ Complies with data retention policies  

**How to Deactivate:**
1. Find user in list
2. Click card to expand
3. Click **Deactivate** button (red)
4. Modal opens - select reason:
   - Resigned
   - Terminated
   - Contract Ended
   - Performance Issues
   - No Show / Abandoned
   - Other
5. Add optional notes
6. Click **Deactivate User**

**What Happens:**
- User can no longer login
- Appears with red "DEACTIVATED" badge
- Card becomes semi-transparent (60% opacity)
- Shows deactivation reason and date
- All historical data preserved
- Can filter to view deactivated users

**Reactivating Users:**
1. Change filter to "Deactivated Only" or "All Users"
2. Find deactivated user (red badge)
3. Click card to expand
4. Click **Reactivate** button (green)
5. Confirm action
6. User can login immediately
7. Deactivation details cleared

**Permission Rules:**
- Super Admin: Can deactivate anyone
- Gate Overseer: Can only deactivate entry marshalls
- SipToken Overseer: Can only deactivate token staff/barmen
- Regular Admin: Cannot deactivate anyone

### 5. Admin Management

#### Understanding the New Card-Based List View

**What You See (Collapsed View):**
- Admin name (large, bold)
- Role badge (Admin/Gate Overseer/SipToken Overseer)
- Phone number
- Status badges (ON DUTY, DEACTIVATED if applicable)

**Click to Expand:**
- Click anywhere on the card to see full details
- Username, role description, gate assignments
- Deactivation details (if deactivated)
- Action buttons (Assign Gates, Deactivate, etc.)

**Filter Options:**
- **Active Only** (default) - Shows only active admins
- **All Users** - Shows everyone
- **Deactivated Only** - Shows deactivated admins only

#### Creating Admin Users

**Improved Admin Creation Modal:**

1. Click **Admin Management** tab
2. Click **Add New Admin**
3. **Step 1: Select Admin Type**
   - Choose from dropdown:
     - **Admin** - Read-only access to reports
     - **Gate Overseer** - Manages entry marshalls
     - **SipToken Overseer** - Manages token operations
   - Role preview card appears showing:
     - Icon and description
     - Reporting hierarchy
     - Username prefix

4. **Step 2: Enter First Name**
   - Enter first name or nickname (letters only)
   - Username auto-generates with prefix:
     - Admin-Ramesh
     - GateOverseer-Tony
     - TokenOverseer-Maria
   - Preview shows full username (case-sensitive!)

5. **Fill Additional Details:**
   - Full name (for display)
   - Password (min 6 chars, toggle visibility)
   - Mobile number (10 digits)

6. **Optional SipToken Operational Roles:**
   - ☑️ Token Sales Staff (sell tokens to guests)
   - ☑️ Barman (scan QR codes, serve beverages)
   - These allow flexibility during the event

7. Click **Create Admin**

**Username Rules:**
- Auto-generated based on admin type + first name
- Case-sensitive (Admin-Ramesh ≠ admin-ramesh)
- Cannot be changed after creation
- System checks for duplicates

#### Designating Gate Overseers

1. Find admin in list
2. Click **Make Overseer** button (shield icon)
3. Admin gains overseer capabilities

#### Assigning Gates to Overseers

1. Click **Assign Gates** button (door icon)
2. Select gates from checklist
3. Check **Lead Overseer** if primary manager
4. Click **Assign Gates**

**Lead Overseer Benefits:**
- Primary contact for gate operations
- Can override standard overseer permissions
- Receives priority notifications

#### Removing Overseer Status

1. Find overseer admin
2. Click **Remove** button (X icon)
3. Confirm removal
4. All gate assignments are also removed

### 6. Settings Configuration

#### Event Settings

1. Click **Settings** tab
2. Update:
   - **Event Name**: Display name (e.g., "Rock 4 One")
   - **Event Tagline**: Subtitle (e.g., "Viva La Festa")
   - **Event Date**: When event occurs
   - **Event Venue**: Location details

#### Ticket Pricing

- **Stag Price**: Individual entry fee
- **Couple Price**: Two-person entry fee

To update:
1. Enter new amount in ₹
2. Click **Save Settings**
3. New registrations use updated prices

#### Payment Information

**UPI ID:**
- Your UPI ID for sellers to collect payments
- Shown in seller's payment section

**Bank Details:**
- Account number, IFSC, bank name
- For bank transfer payments

**Payment QR Code:**
- Upload QR image for UPI payments
- Sellers can display to customers

### 7. Statistics & Reports

#### Overall Statistics View

Access from **Statistics** tab:
- Total registrations by status
- Entry type breakdown (Stag/Couple)
- Total PAX (Person count: Stag=1, Couple=2)
- Revenue by payment mode
- Check-in statistics

#### Seller Performance

View **View Sellers** tab:
- Registrations per seller
- Verification rate
- Revenue contribution
- Payment mode distribution

#### Downloading Reports

1. Go to relevant tab
2. Click **Download CSV**
3. Open in Excel/Sheets for analysis

---

## Admin Guide

### Read-Only Access

As a standard Admin, you can:
- View all registrations
- See verification queue
- Access statistics
- View seller performance

You **cannot**:
- Verify payments
- Create users
- Modify settings
- Generate passes

### Gate Overseer Access

If designated as Gate Overseer, you gain additional capabilities:

#### 1. Marshall Roster Management

Access **Overseer Management** tab:

**Viewing Your Gates:**
- See all gates assigned to you
- Lead status indicated with ⭐

**Assigning Marshalls:**
1. Click **Assign Marshall** button
2. Select marshall from dropdown
3. Choose gate
4. Add optional notes
5. Click **Assign Marshall**

**Unassigning Marshalls:**
1. Find marshall in roster
2. Click **Unassign** button
3. Confirm removal

#### 2. QR Token Generation

**Purpose**: Secure tokens for marshall clock-in

**Creating Tokens:**
1. Go to **Clock-in Tokens** section
2. Click **Generate New Token**
3. Select gate
4. Set validity period:
   - 1 Hour (quick shifts)
   - 4 Hours (standard)
   - 8 Hours (full day)
   - 12 Hours (extended events)
5. Click **Generate QR Code**

**Token Display:**
- QR code preview shown
- Expiry countdown timer
- Used status tracking

**Using Tokens:**
- Show QR to marshalls
- They scan to clock in
- Token marks as "used" after first scan
- Expired tokens cannot be used

#### 3. Clock-out Approvals

**Reviewing Requests:**
1. Go to **Clock-out Requests** section
2. View pending requests showing:
   - Marshall name
   - Gate location
   - Duty duration
   - Clock-out reason

**Approving:**
1. Review reason
2. Click **Approve**
3. Marshall is clocked out
4. Duty record updated

**Rejecting:**
1. Click **Reject**
2. Enter rejection reason
3. Marshall must continue duty
4. Can request again with better reason

---

## Seller Guide

### 1. Dashboard Overview

Your dashboard shows:
- **Total Sales**: Your registration count
- **Pending**: Awaiting verification
- **Verified**: Approved by Super Admin
- **Revenue**: Your verified sales amount

### 2. Registering Guests

#### Starting Registration

1. Click **Register Guest** tab
2. Form appears with two sections:
   - Guest Information
   - Payment Information

#### Guest Information

Fill in:
- **Guest Name**: Full name (as on ID)
- **Mobile Number**: 10-digit number
- **Entry Type**: 
  - Stag (Individual)
  - Couple (Two persons)

#### Payment Information

**Collecting Cash:**
1. Select **Cash** payment mode
2. Ticket price displays automatically
3. Collect exact amount
4. Leave reference field empty
5. Submit registration

**Collecting via UPI:**
1. Select **UPI** payment mode
2. Show your UPI QR/ID to customer
3. Customer makes payment
4. Note the **UTR number** from their confirmation
5. Enter UTR in reference field
6. Submit registration

**Bank Transfer:**
1. Select **Bank Transfer**
2. Share bank details with customer
3. Customer transfers amount
4. Get **reference/transaction number**
5. Enter in reference field
6. Submit registration

#### Submitting Registration

1. Click **Register Guest**
2. Confirmation message appears
3. Guest status: "Pending Verification"
4. Super Admin will verify payment

#### Working Offline

**If you lose internet connection:**
- Registration saves to **offline queue**
- ✅ Message: "Registration saved offline. Will sync when online."
- Continue registering more guests
- All queued registrations auto-sync when connection returns

**Offline Queue Status:**
- Check pending count in offline indicator
- Data stored securely on your device
- Syncs automatically in background
- No data loss even if app closes

### 3. Viewing Your Sales

#### My Sales Tab

Access your registrations:
- List of all guests you registered
- Status for each:
  - 🕐 Pending: Awaiting verification
  - ✅ Verified: Payment approved
  - ❌ Rejected: Payment issue
  - 📱 Pass Sent: Guest received pass
  - 🎫 Checked In: Guest entered event

#### Filtering Sales

Use status filter dropdown:
- All Registrations
- Pending Only
- Verified Only
- Rejected Only

#### Guest Details

Click on any guest to view:
- Full registration information
- Payment details
- Verification notes (if any)
- Pass status

### 4. Payment Collection Best Practices

**Cash Payments:**
- ✅ Count money carefully
- ✅ Give receipt if available
- ✅ Keep cash secure
- ❌ Don't accept damaged notes

**UPI Payments:**
- ✅ Wait for payment confirmation
- ✅ Match amount exactly
- ✅ Copy UTR number accurately
- ❌ Don't proceed without UTR

**Bank Transfers:**
- ✅ Verify transfer before leaving
- ✅ Get screenshot proof
- ✅ Note exact reference number
- ❌ Don't rely on "in progress" status

### 5. Troubleshooting

**Payment Rejected?**
1. Check rejection reason in guest details
2. Contact Super Admin for clarification
3. If valid issue, request guest for new payment
4. Register again with correct details

**Can't Submit Registration?**
- Check all required fields filled
- Verify mobile number is 10 digits
- Ensure payment reference entered (UPI/Bank)
- Check internet connection

---

## Entry Marshall Guide

### 1. Clock-In Process

**IMPORTANT**: You must scan a QR token from Gate Overseer to clock in.

#### Getting QR Token

1. Contact your Gate Overseer
2. Overseer generates token for your gate
3. Overseer shows you QR code

#### Scanning Token

1. Login to system
2. Click **Entry Scan** tab
3. You'll see "Off Duty" status
4. Click **Clock In**
5. Camera opens (allow permission)
6. Point camera at overseer's QR token
7. System validates:
   - Token is valid and not expired
   - Token is for correct gate
   - You're assigned to that gate
8. Success: Status changes to "On Duty"

**If Clock-In Fails:**
- Token expired: Request new token
- Wrong gate: Get token for your assigned gate
- Not assigned: Contact overseer to assign you first

### 2. Scanning Guest Passes

#### Entry Scanning

**When Guest Arrives:**
1. Guest shows QR pass on phone or printed
2. Your screen shows **On Duty** with gate name
3. Click **Scan Guest QR**
4. Camera opens
5. Point at guest's QR code
6. System validates:
   - Pass is genuine
   - Guest verified by Super Admin
   - Not already inside venue
7. **If Valid**: 
   - ✅ Green "Entry Recorded"
   - Guest counter increases
   - Guest marked "Inside Venue"

#### Scanning Offline

**If internet connection drops:**
- Scanning continues normally
- Scans save to **offline queue**
- ✅ "Scan saved offline. Will sync when online."
- Entry/exit tracking maintained locally
- Auto-syncs when connection returns

**Offline Validation:**
- Recently scanned guests cached
- Prevents duplicate entries
- Full validation resumes when online
- Check offline indicator for pending scans

#### Exit Scanning

**When Guest Leaves:**
1. Guest shows same QR pass
2. Click **Scan Guest QR**
3. Point at QR code
4. System checks guest is inside
5. **If Valid**:
   - ✅ "Exit Recorded"
   - Guest marked "Outside Venue"
   - Can re-enter later

#### Re-entry

Guests can exit and re-enter:
- System tracks all movements
- Same QR code works multiple times
- Entry/exit history maintained

### 3. Viewing Entry Statistics

Your dashboard shows:
- **Total Scans**: Entry + Exit count
- **Currently Inside**: Guests in venue now
- **Your Gate Activity**: Today's traffic
- **Last Scan**: Most recent entry/exit

### 4. Clock-Out Process

**IMPORTANT**: You cannot clock out directly. Must request approval.

#### Requesting Clock-Out

1. Click **Request Clock Out** button
2. Enter reason (minimum 3 characters):
   - "Shift complete"
   - "Emergency leave"
   - "Break time"
   - "Gate closing"
3. Click **Submit Request**
4. Status: "Clock-out Pending"
5. Wait for overseer approval

#### After Approval

- Status changes to "Off Duty"
- Can see duty duration in history
- Ready for next shift

#### If Rejected

- Rejection reason shown
- Must continue duty
- Can submit new request with better reason
- Contact overseer if urgent

### 5. Handling Guest Issues

**QR Code Not Scanning:**
- Check phone brightness (increase)
- Hold phone steady
- Clean camera lens
- Try printed pass if available

**Invalid Pass Message:**
- Guest not verified - direct to registration desk
- Already inside - check if legitimate exit first
- Expired token - update app and try again

**Duplicate Entry Attempt:**
- Check if guest already inside
- Ask guest about earlier entry
- Scan again to record exit first
- Then scan for re-entry

**Offline Mode:**
- Red badge shows "Offline Mode"
- Continue scanning normally
- Scans queue automatically
- Sync happens when connection returns
- Check for pending scans in indicator

**Technical Issues:**
- Note guest details manually
- Report to supervisor
- Allow entry with manual verification
- Update system when online

---

## Gate Overseer Guide

### Overview

As Gate Overseer, you manage marshall operations for your assigned gates. This includes:
- Assigning marshalls to gates
- Generating QR tokens for clock-in
- Approving/rejecting clock-out requests
- Monitoring gate activity

### 1. Accessing Overseer Functions

1. Login with your admin credentials
2. Navigate to **Overseer Management** tab
3. You'll see three main sections:
   - Marshall Roster
   - Clock-in Tokens
   - Clock-out Requests

### 2. Marshall Roster Management

#### Viewing Roster

**Your Gates Section:**
- Lists all gates assigned to you
- Lead gates marked with ⭐
- Shows marshall assignments per gate

**All Marshalls Section:**
- Complete list of entry marshalls
- Shows current assignment status
- Indicates if on duty

#### Assigning Marshalls to Gates

1. Click **Assign Marshall** button
2. Modal opens with:
   - Marshall dropdown (all available marshalls)
   - Gate dropdown (your assigned gates)
   - Notes field (optional shift details)
3. Select marshall and gate
4. Add notes like:
   - "Morning shift 8 AM - 2 PM"
   - "Main entrance coverage"
   - "VIP gate assignment"
5. Click **Assign Marshall**

**Assignment Rules:**
- One marshall = one gate at a time
- Must unassign before reassigning to different gate
- Assignment persists across sessions

#### Unassigning Marshalls

**When to Unassign:**
- Shift rotation
- Marshall unavailable
- Gate closing
- Reassignment needed

**Steps:**
1. Find marshall in roster
2. Click **Unassign** button
3. Confirm removal
4. Marshall can be assigned to another gate

### 3. QR Token Generation

#### Purpose

QR tokens are secure, time-limited codes that marshalls scan to clock in. This ensures:
- Only authorized marshalls clock in
- Only at assigned gates
- Within valid time periods
- Complete audit trail

#### Creating Tokens

1. Go to **Clock-in Tokens** section
2. Click **Generate New Token**
3. Token generation modal opens:

**Select Gate:**
- Choose from your assigned gates
- Only gates you oversee appear

**Set Validity Period:**
- **1 Hour**: Short shifts, temporary coverage
- **4 Hours**: Standard half-shift
- **8 Hours**: Full shift
- **12 Hours**: Extended event coverage

**Generate:**
4. Click **Generate QR Code**
5. Token created with:
   - Unique cryptographic code
   - Selected gate assignment
   - Expiration timestamp
   - QR code representation

#### Using Tokens

**Display to Marshalls:**
1. Show QR code on your screen
2. Marshall uses their camera to scan
3. Token validates and clocks them in
4. Token marked as "used"

**Token States:**
- 🟢 Active: Not used, not expired
- 🔵 Used: Already scanned once
- 🔴 Expired: Past validity period

**Token Security:**
- One-time use per marshall
- Cannot reuse after expiry
- Gate-specific validation
- Logged in audit trail

#### Managing Tokens

**Active Tokens View:**
- All your generated tokens
- Countdown timer for each
- Used/Unused status
- Gate assignment

**Best Practices:**
- Generate before shift starts
- Use appropriate validity period
- Don't share screenshots (security risk)
- Generate new if expired

### 4. Clock-out Approval Workflow

#### Pending Requests Section

View all pending clock-out requests:

**Request Information:**
- Marshall name and ID
- Gate location
- Clock-in time
- Duty duration
- Reason for clock-out
- Request timestamp

**Sorting:**
- Newest requests first
- Filter by gate
- Priority indicators

#### Reviewing Requests

**Good Reasons to Approve:**
- ✅ Shift complete
- ✅ Gate closing
- ✅ Scheduled break time
- ✅ Rotation handover
- ✅ Emergency (verified)
- ✅ Event concluded

**Reasons to Reject:**
- ❌ Insufficient duty time
- ❌ No replacement available
- ❌ Peak entry period
- ❌ Vague reason
- ❌ Unverified emergency
- ❌ Gate still operational

#### Approving Clock-out

1. Review marshall's reason
2. Check duty duration
3. Verify gate coverage
4. Click **Approve** button
5. Marshall is clocked out
6. Duty record finalized
7. Gate available for new marshall

**After Approval:**
- Marshall status: Off Duty
- Can assign new marshall to gate
- Duty logged for records
- Activity recorded

#### Rejecting Clock-out

1. Determine rejection reason
2. Click **Reject** button
3. Modal opens for rejection reason
4. Enter clear explanation:
   - "Shift not complete - 2 hours remaining"
   - "No replacement available yet"
   - "Peak entry time - wait 30 minutes"
   - "Please handover to next marshall first"
5. Click **Submit**

**After Rejection:**
- Marshall receives reason
- Must continue duty
- Can request again later
- Consider their situation

**Good Rejection Communication:**
- Be specific
- Explain timing
- Suggest alternatives
- Indicate when they can request again

### 5. Activity Monitoring

#### Gate Activity Log

View comprehensive logs:
- All clock-ins at your gates
- Clock-out requests and outcomes
- Marshall assignments
- Token generations
- Entry/exit statistics

#### Real-time Dashboard

**Per Gate View:**
- Current marshall on duty
- Guests scanned (entries/exits)
- Currently inside count
- Shift duration
- Last activity timestamp

**Alerts:**
- Long duty hours (fatigue risk)
- No marshall assigned
- Multiple failed clock-in attempts
- Unusual entry patterns

### 6. Best Practices

**Marshall Management:**
- ✅ Assign before shifts start
- ✅ Generate tokens in advance
- ✅ Keep backup marshalls ready
- ✅ Rotate for long events
- ✅ Monitor duty hours

**Token Security:**
- ✅ Generate fresh tokens daily
- ✅ Use minimum required validity
- ✅ Never share token screenshots
- ✅ Verify marshall identity
- ✅ Check gate assignments

**Approval Guidelines:**
- ✅ Review all requests promptly
- ✅ Ensure gate coverage
- ✅ Document rejection reasons
- ✅ Communicate with marshalls
- ✅ Plan for emergencies

**Communication:**
- ✅ Brief marshalls before shifts
- ✅ Explain token usage
- ✅ Set expectations clearly
- ✅ Be available for issues
- ✅ Provide feedback

---

## SipToken Overseer Guide

### Overview

As SipToken Overseer, you manage the entire beverage service operation including:
- Staff management (Token Sales & Barmen)
- Clock-in/out for beverage staff
- Live monitoring of token sales and beverage service
- Inventory management and reconciliation
- Bar counter operations

### 1. Accessing SipToken Functions

1. Login with your admin credentials
2. Navigate to **SipToken Overseer** tab
3. You'll see sections:
   - Dashboard with live stats
   - Staff management (Sales & Barmen)
   - Bar counters
   - Inventory (if you have access)

### 2. Staff Management

#### Card-Based Staff List

**What You See:**
- Clean cards showing: Name, Role, Phone
- Status badges: ON DUTY, DEACTIVATED
- Click card to expand for full details

**Filter Staff:**
- Active Only (default)
- All Staff
- Deactivated Only

#### Clock-In Staff

**Purpose**: Staff must clock in before working

**Steps:**
1. Click **Clock In Staff** button
2. Select staff member from dropdown
3. Choose their role for this shift:
   - Token Sales (sells tokens to guests)
   - Barman (serves beverages)
4. Assign bar counter (if barman)
5. Click **Clock In**

**What Happens:**
- Staff can access their interface
- Duty session starts tracking
- Shows in "Staff On Duty" section
- Timer begins counting duration

#### Monitoring Active Duty Sessions

**Staff On Duty Section:**
- Shows all currently working staff
- Role icon: 🪙 Sales / 🍸 Barman
- Counter assignment
- Duty duration (hours/minutes)
- End session button

**Ending Duty Session:**
1. Find staff in duty list
2. Click stop button
3. Confirm end of shift
4. Duty record saved

#### Clock-Out Approvals

**When Staff Request Clock-Out:**
1. Request appears in your queue
2. Shows: Name, role, duration, reason
3. **Approve**: Staff clocked out, shift ends
4. **Reject**: Staff continues duty, must resubmit

### 3. Bar Counter Management

#### Viewing Counters

**Counter List Shows:**
- Counter name and code
- Assigned barmen
- Current status (Active/Inactive)
- Counter QR code

#### Counter QR Codes

**Purpose**: Guests scan to place orders

**Using QR Codes:**
1. Click **View QR** on counter
2. QR code displays
3. Print or display on screen
4. Place at bar counter
5. Guests scan to order

**QR Code Contains:**
- Counter ID
- Counter name
- Ordering interface link

### 4. Inventory Access Control

#### Your Access Level: OPERATIONAL CONTROL

As SipToken Overseer, you can:

**✅ You CAN:**
- View live inventory dashboard
- Monitor stock levels during event
- Enter opening stock (before event)
- Enter closing stock (after event)
- Perform reconciliation
- Add wastage/breakage notes
- Request restock
- View consumption reports

**❌ You CANNOT:**
- Modify beverage master list
- Change pricing or token costs
- Delete inventory records
- Final reconciliation approval (Super Admin only)

#### Inventory Workflow Stages

**Stage 1: Opening Stock (Your Job - Day of Event)**
1. Navigate to Inventory section
2. Click **Enter Opening Stock**
3. Physical count all bottles
4. Enter quantities per beverage
5. Verify against purchase records
6. Click **Lock Opening Stock**
7. ⚠️ Once locked, cannot be changed

**Stage 2: Live Monitoring (During Event)**
1. Dashboard shows real-time consumption
2. Watch for low stock alerts
3. Monitor barman performance
4. Coordinate restock if needed
5. Track popular beverages

**Stage 3: Closing Stock (Your Job - End of Event)**
1. Click **Enter Closing Stock**
2. Physical count remaining bottles
3. Count damaged/broken bottles
4. Enter closing quantities
5. Note any discrepancies

**Stage 4: Reconciliation (Your Job)**
1. System calculates variance:
   - Expected consumption (from orders)
   - Actual consumption (opening - closing)
   - Variance (difference)
2. Review variance reports
3. Add notes for high variances:
   - Spillage during service
   - Broken bottles (how many)
   - Wastage (samples, spoiled)
4. Submit reconciliation
5. ⚠️ Awaits Super Admin approval

**Stage 5: Approval (Super Admin)**
- Super Admin reviews your reconciliation
- Approves if variance acceptable
- Flags for investigation if suspicious
- Final closure locks inventory forever

#### Understanding Variance

**Acceptable Variance:**
- 1-2% is normal (spillage, measurement)
- Documented breakage
- Reasonable wastage

**Investigate If:**
- Variance > 3%
- No documentation
- Pattern of shortages
- Unexplained differences

### 5. Live Dashboard

**Key Metrics:**
- Active staff on duty
- Total tokens sold (today)
- Total beverages served
- Current inventory levels
- Popular beverages
- Revenue generated

**Using Dashboard:**
- Monitor in real-time
- Identify bottlenecks
- Allocate staff accordingly
- Track performance
- Make operational decisions

### 6. Deactivating Staff

**When to Deactivate:**
- End of contract
- Performance issues
- No show
- Resigned

**How to Deactivate:**
1. Find staff in list
2. Click card to expand
3. Click **Deactivate** (red button)
4. Select reason
5. Add notes
6. Confirm deactivation

**What Happens:**
- Staff cannot login
- All historical data preserved
- Shows with red badge
- Can be reactivated by Super Admin

### Best Practices

**Staff Management:**
- ✅ Clock in staff before their shift
- ✅ Brief staff on their duties
- ✅ Monitor performance regularly
- ✅ End shifts promptly
- ✅ Handle clock-out requests quickly

**Inventory Management:**
- ✅ Accurate opening stock critical
- ✅ Document all breakage immediately
- ✅ Note spillage incidents
- ✅ Double-check closing count
- ✅ Explain variances clearly

**During Event:**
- ✅ Monitor dashboard continuously
- ✅ Watch for stock alerts
- ✅ Coordinate restock quickly
- ✅ Address staff issues immediately
- ✅ Keep Super Admin informed

---

## Troubleshooting

### Common Issues & Solutions

#### Login Problems

**"Invalid credentials"**
- Check username spelling (case-sensitive)
- Verify password (case-sensitive)
- Contact Super Admin if forgotten
- Ensure account is active

**Page won't load**
- Check internet connection
- Try different browser
- Clear browser cache
- Disable VPN if active
- Try launching installed PWA app

#### Offline Mode Issues

**App not working offline**
- Must visit app online at least once
- Service worker needs to install first
- Clear cache and revisit site
- Check for "Service Worker: Activated" in browser console

**Data not syncing**
- Wait for stable connection
- Check offline indicator for pending count
- Open app in foreground to trigger sync
- Manually refresh page if needed

**Pending data stuck**
- Check browser storage not full
- Verify internet connection stable
- Clear offline queue: Settings → Clear Cache
- Contact support if persists

#### QR Scanning Issues

**Camera won't open**
- Allow camera permissions in browser
- Check if camera used by another app
- Try different browser
- Restart device

**QR code not recognized**
- Increase phone brightness
- Hold steady for 2-3 seconds
- Clean camera lens
- Ensure QR code fully visible
- Try landscape orientation

**"Invalid QR code" error**
- Verify code is from Vamos Festa system
- Check if token expired
- Ensure correct gate assignment
- Request new token if needed

#### User Deactivation & Reactivation

**Cannot find user in list**
- Check filter dropdown setting
- Change to "All Users" to see everyone
- Deactivated users only show with "Deactivated Only" filter
- Use search if available

**Deactivate button not showing**
- Expand the card first (click to open)
- Check your permission level:
  - Super Admin: Can deactivate anyone
  - Gate Overseer: Only entry marshalls
  - SipToken Overseer: Only token staff/barmen
  - Regular Admin: Cannot deactivate
- User might already be deactivated

**User still can login after deactivation**
- Verify deactivation completed (check for red badge)
- User might be using cached session (ask them to logout)
- Check database: is_active should be FALSE
- Clear browser cache on user's device
- Contact Super Admin if persists

**Cannot reactivate user**
- Only Super Admin can reactivate
- Ensure you're viewing deactivated users (filter)
- Expand card to see reactivate button
- Check if user was permanently deleted (rare)

**Deactivation modal not opening**
- Ensure card is expanded first
- Clear browser cache
- Try different browser
- Check console for JavaScript errors

#### Card-Based UI Issues

**Cards not expanding**
- Click directly on card area (not action buttons)
- JavaScript might not be loaded - refresh page
- Try different browser
- Clear cache and reload
- Check browser console for errors

**Chevron icon not rotating**
- Visual issue only - card still expands
- Refresh page to reload CSS
- Check browser supports CSS transforms
- Not critical - functionality still works

**Filter dropdown not working**
- Ensure list has loaded completely
- Try selecting different option
- Refresh page
- Clear browser cache
- Check network connectivity

**Action buttons collapse card**
- This shouldn't happen (uses stopPropagation)
- Report as bug to Super Admin
- Workaround: Re-expand card after action
- May need code fix

#### Payment Verification

**Can't find transaction**
- Check date and time
- Look for exact amount
- Search by UTR number
- Allow 24 hours for bank transfers
- Contact seller for details

**Amount mismatch**
- Verify current ticket price
- Check payment mode fees
- Compare with registration entry
- Ask seller for screenshot

#### Guest Pass Issues

**Pass not generating**
- Ensure guest is verified
- Check internet connection
- Refresh page and try again
- Contact Super Admin

**WhatsApp won't open**
- Check if WhatsApp installed
- Allow pop-ups in browser
- Try manual download and share
- Use WhatsApp Web

**Downloaded pass missing header**
- Issue has been fixed in latest version
- Refresh page (Ctrl+F5)
- Generate pass again
- Contact support if persists

#### Marshall Clock-in Problems

**Token scan fails**
- Check token not expired
- Verify you're assigned to gate
- Ensure token is for your gate
- Request new token from overseer

**Already clocked in error**
- You may have pending duty
- Check duty status on dashboard
- Request clock-out if needed
- Contact overseer for help

**Can't request clock-out**
- Must be clocked in first
- Check if previous request pending
- Ensure reason is provided
- Wait for approval/rejection of pending request

### Error Messages Explained

| Error | Meaning | Solution |
|-------|---------|----------|
| "Guest already inside" | Duplicate entry attempt | Record exit first, then re-entry |
| "Token expired" | Clock-in token too old | Request new token from overseer |
| "Not assigned to gate" | Marshall not in roster | Contact overseer for assignment |
| "Payment verification pending" | Super Admin hasn't verified | Wait for verification |
| "Invalid UTR number" | Payment reference incorrect | Contact seller for correct UTR |
| "Insufficient permissions" | Role restriction | Contact admin for role update |
| "Offline Mode" | No internet connection | Continue working - data queues locally |
| "Sync failed" | Network error during sync | Data remains queued - will retry |
| "Service Worker error" | PWA installation issue | Clear cache, reinstall app |

### Getting Help

**Technical Support:**
- Email: support@rock4one.com
- Phone: [Support Number]
- Hours: [Support Hours]

**Reporting Bugs:**
1. Note exact error message
2. Screenshot if possible
3. Describe steps to reproduce
4. Send to technical support

**Feature Requests:**
- Submit via feedback form
- Describe use case
- Explain expected behavior
- Include role context

---

## Security & Best Practices

### Password Security

**Creating Strong Passwords:**
- Minimum 8 characters
- Mix uppercase and lowercase
- Include numbers
- Add special characters (@, #, $, %)
- Avoid personal information

**Password Management:**
- ✅ Change default password immediately
- ✅ Use unique password per account
- ✅ Never share passwords
- ✅ Change if compromised
- ❌ Don't write down passwords
- ❌ Don't use same password everywhere

### Account Security

**Login Safety:**
- Always logout when finished
- Don't save password on shared devices
- Clear browser data on public computers
- Be aware of shoulder surfing
- Report suspicious activity

**Session Management:**
- System auto-logs out after inactivity
- Don't leave logged in unattended
- Use secure, private networks
- Avoid public WiFi for sensitive operations

### Payment Security

**For Sellers:**
- Verify payment before registering
- Keep payment proofs safe
- Report suspicious transactions
- Don't accept third-party payments
- Get buyer identification

**For Super Admin:**
- Double-check UTR numbers
- Verify amounts match exactly
- Watch for duplicate payments
- Document rejection reasons
- Maintain verification logs

### QR Code Security

**Token Protection (Overseers):**
- Don't screenshot tokens
- Display only to authorized marshalls
- Generate new for each shift
- Report lost tokens
- Monitor token usage

**Pass Protection (All):**
- Don't share guest passes publicly
- Verify pass legitimacy
- Report duplicate passes
- Check pass generation timestamp
- Monitor scan attempts

### Data Privacy

**Guest Information:**
- Keep mobile numbers confidential
- Don't share payment details
- Secure printed documents
- Shred sensitive papers
- Follow data protection laws

**System Access:**
- Only access data needed for role
- Don't export unnecessary data
- Delete downloads after use
- Report data breaches immediately
- Respect guest privacy

### Audit & Compliance

**Activity Logging:**
- All actions are logged
- Timestamps recorded
- User ID tracked
- Cannot be deleted
- Available for audit

**Best Practices:**
- Follow role guidelines
- Document decisions
- Keep accurate records
- Report irregularities
- Cooperate with audits

### Emergency Procedures

**System Downtime:**
1. Switch to manual registration
2. Note all details on paper
3. Enter into system when online
4. Keep guests informed
5. Contact technical support

**Security Incident:**
1. Report immediately to Super Admin
2. Document what happened
3. Don't attempt to fix yourself
4. Preserve evidence
5. Follow investigation procedures

**Lost Device:**
1. Change password immediately
2. Notify Super Admin
3. Check for unauthorized access
4. Review activity logs
5. Secure new device

---

## Appendix

### Quick Reference Card

#### Card-Based UI Interactions
```
- Expand Card: Click anywhere on card
- Collapse Card: Click card again
- Action Buttons: Click button (card stays open)
- Filter Lists: Use dropdown at top
- Find Deactivated: Change filter to "Deactivated Only"
- Status Badges: Green (ON DUTY), Red (DEACTIVATED)
```

#### PWA Installation & Offline
```
- Install App: Click "Install App" button → Add to Home
- Check Offline Status: Look for red badge (top-right)
- View Pending Queue: Hover over offline indicator
- Force Sync: Go online → Refresh page
- Clear Offline Data: Browser settings → Clear site data
```

#### Super Admin Quick Actions
```
- Verify Payment: Verification Queue → Verify/Reject
- Generate Pass: All Registrations → QR icon
- Create Seller: User Management → Add New Seller
- Create Admin: Admin Management → Add New Admin (dropdown-based)
- Deactivate User: Expand card → Deactivate → Select reason
- Reactivate User: Filter "Deactivated Only" → Expand → Reactivate
- Update Settings: Settings → Edit → Save
```

#### Seller Quick Actions
```
- Register Guest: Register Guest tab → Fill form → Submit
- Register Offline: Works automatically when offline
- View Sales: My Sales tab → Filter by status
- Check Status: Click guest name for details
- Check Pending: Look for offline indicator count
```

#### Marshall Quick Actions
```
- Clock In: Entry Scan → Clock In → Scan Token
- Scan Guest: Scan Guest QR → Point camera
- Scan Offline: Automatic queue when offline
- Clock Out: Request Clock Out → Enter reason
- Check Pending Scans: Offline indicator badge
```

#### Gate Overseer Quick Actions
```
- Assign Marshall: Roster → Expand card → Assign to Gate
- Generate Token: Tokens → Generate New Token
- Approve Clockout: Requests → Approve/Reject
- Deactivate Marshall: Expand card → Deactivate
```

#### SipToken Overseer Quick Actions
```
- Clock In Staff: Click Clock In → Select staff & counter
- Monitor Dashboard: View live stats and alerts
- Enter Opening Stock: Inventory → Opening Stock → Enter counts
- Enter Closing Stock: Inventory → Closing Stock → Count remaining
- Reconcile: Inventory → Reconciliation → Review variance
- Deactivate Staff: Expand card → Deactivate → Reason
- End Duty: Staff On Duty → Stop button
```

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Focus search | `/` |
| Logout | `Ctrl + L` |
| Refresh data | `Ctrl + R` |
| Close modal | `Esc` |
| Navigate tabs | `Tab` |

### Support Contacts

**Technical Support:**
- Email: support@rock4one.com
- Emergency: [24/7 Number]

**Event Coordination:**
- Venue: [Venue Contact]
- Security: [Security Number]
- Medical: [Medical Support]

**System Administrator:**
- Super Admin: [Contact]
- Lead Overseer: [Contact]

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Dec 2025 | PWA with offline mode, overseer system, QR tokens, approval workflow |
| 1.5 | Nov 2025 | Marshall management, entry tracking |
| 1.0 | Oct 2025 | Initial release, basic registration |

### Glossary

**Entry Type:**
- **Stag**: Individual guest (1 person)
- **Couple**: Two-person entry (2 persons)

**Payment Modes:**
- **Cash**: Physical currency
- **UPI**: Unified Payments Interface (digital)
- **Bank Transfer**: Direct bank transaction

**QR Code:**
Quick Response code - 2D barcode for scanning

**UTR:**
Unique Transaction Reference - payment identifier

**Overseer:**
Admin responsible for marshall management

**Token:**
Time-limited QR code for secure clock-in

**Duty:**
Marshall's work shift at gate

**PAX:**
Total person count (Stag=1, Couple=2)

**PWA (Progressive Web App):**
Web app that installs like native app, works offline

**Service Worker:**
Background script that enables offline functionality

**Offline Queue:**
Local storage for data pending internet sync

**Cache:**
Stored data for fast loading and offline access

**Background Sync:**
Automatic data synchronization when connection available

**Offline Mode:**
Operating state when internet connection unavailable

---

### PWA Capabilities Summary

| Feature | Online | Offline | Auto-Sync |
|---------|--------|---------|-----------|
| View Dashboard | ✅ | ✅ Cached | - |
| Register Guests | ✅ | ✅ Queued | ✅ |
| Scan QR Codes | ✅ | ✅ Queued | ✅ |
| Verify Payments | ✅ | ❌ | - |
| Generate Passes | ✅ | ⚠️ Limited | - |
| Send WhatsApp | ✅ | ❌ | - |
| View Reports | ✅ | ✅ Cached | - |
| Clock In/Out | ✅ | ✅ Queued | ✅ |
| Manage Settings | ✅ | ❌ | - |
| Install Updates | ✅ | ✅ | ✅ |

**Legend:**
- ✅ Fully functional
- ⚠️ Limited functionality
- ❌ Requires internet
- Cached: Shows last loaded data
- Queued: Saves locally, syncs when online

---

## Document Information

**Document Version:** 2.0  
**Last Updated:** December 11, 2025  
**Author:** Rock 4 One Development Team  
**Contact:** support@rock4one.com  

**License:** © 2025 Rock 4 One. All rights reserved.  
**Usage:** For authorized users only. Do not distribute.

---

*End of User Manual*
