# 🎉 Vamos Festa - Event Management System

**¡Viva la Fiesta!** - Complete event management solution for Vamos Festa with integrated SipToken beverage sales system.

## Event Details
- **Event:** Vamos Festa - Latin Fiesta Night
- **Date:** February 7th, 2026
- **Venue:** Area 8 MITM, Kayamkulam
- **Theme:** Vibrant Mexican/Latin celebration

## Features

### Core Event Management
- 🎟️ **Guest Registration** - Multi-seller workflow with payment verification
- 📱 **QR Pass Generation** - Digital passes sent via WhatsApp
- 🚪 **Entry Management** - Gate marshalls with real-time check-in
- 📊 **Admin Dashboard** - Complete oversight and analytics

### SipToken Beverage System (NEW!)
- 🍹 **Token-Based Sales** - Pre-paid tokens for beverages (₹10 = 1 token default)
- 💰 **Cash to Token Counter** - Guests purchase tokens with cash
- 🍺 **Barman Interface** - Quick QR-based order processing
- 👁️ **Overseer Functionality** - Staff clock-in/out with mandatory reconciliation
- 📈 **Real-Time Analytics** - Live tracking of sales and inventory
- 🔒 **Secure QR Payments** - 60-second expiry on payment QR codes

## Color Scheme

Vibrant Mexican/Latin theme:
- **Primary Orange:** `#FF6B35` - Main accent color
- **Turquoise:** `#00B4D8` - Secondary highlights  
- **Yellow:** `#FFD60A` - Accent details
- **Deep Navy:** `#1a1a2e` - Background

## Technology Stack

- **Frontend:** Vanilla JavaScript + Vite
- **Database:** Supabase (PostgreSQL)
- **PWA:** Offline-capable with Service Worker
- **QR:** QRCode.js for pass and payment generation
- **UI:** Tailwind CSS + Custom Fiesta Theme

## User Roles

1. **Super Admin** - Complete system control
2. **Admin** - Event management and oversight
3. **Seller** - Guest registration and payment collection
4. **Entry Marshall** - Gate entry verification
5. **SipToken Sales Staff** - Token counter sales
6. **Barman** - Beverage service with token processing
7. **SipToken Overseer** - Staff management and reconciliation (NEW!)

## SipToken Overseer Features

The Overseer role provides complete staff management:

### Clock-In/Out Management
- Clock in Token Sales Counter staff
- Clock in Bar Sales Counter staff
- Mandatory reconciliation at clock-out

### Token Sales Reconciliation
- Tokens sold count
- Cash collected (₹)
- Automatic verification: Tokens × Rate = Cash
- Discrepancy logging and alerts

### Bar Staff Reconciliation
- Orders served count
- Tokens processed
- Verification: Orders = Token transactions
- Review cancelled/expired orders

## Installation

```bash
# Install dependencies
npm install

# Configure Supabase
# Update supabaseUrl and supabaseKey in src/main.js

# Run development server
npm run dev

# Build for production
npm run build
```

## Database Setup

Run the migrations in `supabase/migrations/` in order:
1. `001_rock4one_v2_setup.sql` - Base event system
2. `002_siptoken_setup.sql` - SipToken module (NEW!)

## Payment Gateway

Recommended: **Razorpay** for both ticket sales and SipToken purchases
- Comprehensive payment methods (UPI, cards, wallets)
- Superior developer experience  
- Automatic reconciliation dashboard
- Cost: 2% + GST (UPI capped at ₹15,000/year)

## Event Day Workflow

### Guest Journey
1. Seller registers guest and collects payment
2. Admin verifies payment  
3. System generates QR pass
4. Pass sent via WhatsApp
5. Guest shows pass at entry gate
6. Marshall scans and grants entry
7. Guest purchases SipTokens at counter
8. Guest orders beverages using token QR

### SipToken Operations
1. Overseer clocks in Sales Staff and Barmen
2. Sales Staff sell tokens for cash
3. Guests receive token QR codes
4. Barmen scan token QR to fulfill orders
5. End of shift: Overseer manages reconciliation
6. System validates cash vs tokens sold
7. System validates orders vs tokens processed

## License

Proprietary - Vamos Festa Event Management

## Support

For technical support, contact the development team.

---

**🎉 ¡Viva la Fiesta! - Making every celebration unforgettable! 🌮🎊**
