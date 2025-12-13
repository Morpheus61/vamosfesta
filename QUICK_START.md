# 🎉 Vamos Festa - Quick Start Guide

## 5-Minute Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Supabase
1. Open `src/main.js`
2. Update lines 10-11 with your Supabase credentials:
```javascript
const supabaseUrl = 'https://YOUR-PROJECT.supabase.co';
const supabaseKey = 'YOUR-ANON-KEY';
```

### Step 3: Run Database Migrations
In your Supabase SQL editor, run:
1. `supabase/migrations/001_rock4one_v2_setup.sql`
2. `supabase/migrations/002_siptoken_setup.sql`

### Step 4: Start Development Server
```bash
npm run dev
```

Access at: `http://localhost:5173`

### Step 5: Create Admin User
In Supabase SQL editor:
```sql
INSERT INTO users (username, password_hash, full_name, role, email, phone, is_siptoken_overseer)
VALUES ('admin', 'temp123', 'Admin User', 'super_admin', 'admin@vamosfesta.com', '+91...', true);
```

**Login:** `admin` / `temp123`

---

## What's Included

✅ Complete Event Management System
✅ SipToken Beverage Sales Module  
✅ Overseer Staff Management
✅ QR Pass Generation
✅ Real-time Analytics
✅ Offline Support (PWA)
✅ Mobile Optimized

## Default Users to Create

| Role | Username | Purpose |
|------|----------|---------|
| Super Admin | admin | Full system access |
| Overseer | overseer1 | SipToken staff management |
| Seller | seller1 | Guest registration |
| Marshall | marshall1 | Gate entry |
| Sales Staff | sales1 | Token sales counter |
| Barman | barman1 | Beverage service |

## Key Features

### For Event Management
- Multi-seller registration workflow
- Payment verification queue
- Digital QR passes via WhatsApp
- Entry gate scanning
- Real-time analytics dashboard

### For SipToken (Beverage Sales)
- Token purchase (cash/online)
- QR-based beverage orders
- Staff clock-in/out
- Automatic reconciliation
- Live sales tracking

## Event Configuration

Edit these in `src/main.js` or create `src/config/event.js`:
- **Event Name:** Vamos Festa
- **Event Date:** February 7th, 2026
- **Venue:** Area 8 MITM, Kayamkulam
- **Ticket Price:** ₹200 (customize as needed)
- **Token Rate:** ₹10 per token

## Production Deployment

```bash
# Build for production
npm run build

# Deploy dist/ folder to:
# - Vercel (recommended)
# - Netlify
# - Any static hosting
```

See `DEPLOYMENT_GUIDE.md` for detailed instructions.

## Need Help?

📖 Read `README.md` - Complete feature documentation
📋 Check `VAMOS_FESTA_SUMMARY.md` - All changes from Rock4One
🚀 Follow `DEPLOYMENT_GUIDE.md` - Step-by-step deployment

## Customization Needed

Before going live, replace:
1. `src/assets/rock4one-logo.jpg` → Your Vamos Festa logo
2. `src/icons/*` → Vamos Festa branded icons
3. Update colors if needed (already set to vibrant Mexican theme)

## Support

For questions or issues, refer to documentation or check:
- Supabase Dashboard for database queries
- Browser Console for JavaScript errors
- Network tab for API issues

---

**🎉 Ready to make Vamos Festa unforgettable!**
**¡Viva la Fiesta! 🌮🎊**
