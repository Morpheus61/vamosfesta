# 🎉 Vamos Festa - Deployment Guide

## Pre-Deployment Checklist

### 1. Supabase Setup
- [ ] Create new Supabase project for Vamos Festa
- [ ] Update `supabaseUrl` and `supabaseKey` in `src/main.js` (lines 10-11)
- [ ] Run migration: `supabase/migrations/001_rock4one_v2_setup.sql`
- [ ] Run migration: `supabase/migrations/002_siptoken_setup.sql`
- [ ] Verify all tables created successfully

### 2. Branding Assets
- [ ] Replace logo in `src/assets/rock4one-logo.jpg` with Vamos Festa logo
- [ ] Update all icons in `src/icons/` with Vamos Festa branded icons
- [ ] Generate new favicon set matching Vamos Festa colors (Orange #FF6B35, Turquoise #00B4D8, Yellow #FFD60A)

### 3. Payment Gateway Setup (Razorpay Recommended)
- [ ] Create Razorpay account
- [ ] Get API Key ID and Secret
- [ ] Configure webhooks for payment verification
- [ ] Test payment flow in sandbox mode
- [ ] Update payment integration in code

### 4. Event Configuration
Update in `src/main.js` or create `src/config/event.js`:
```javascript
export const EVENT_CONFIG = {
  name: "Vamos Festa",
  tagline: "¡Viva la Fiesta!",
  date: "February 7th, 2026",
  venue: "Area 8 MITM, Kayamkulam",
  ticketPrice: 200,  // ₹200 per person
  tokenRate: 10      // ₹10 per token
};
```

### 5. Initial Users Setup
Create admin accounts in Supabase `users` table:

```sql
INSERT INTO users (username, password_hash, full_name, role, email, phone, is_siptoken_overseer) VALUES
('admin', '...hashed...', 'Admin User', 'super_admin', 'admin@vamosfesta.com', '+91...', true),
('overseer1', '...hashed...', 'Overseer Name', 'admin', 'overseer@vamosfesta.com', '+91...', true);
```

## Deployment Steps

### Development Environment

```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Access at http://localhost:5173
```

### Production Build

```bash
# 1. Build for production
npm run build

# 2. Test production build locally
npm run preview

# 3. Deploy 'dist/' folder to hosting
```

## Hosting Options

### Option 1: Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

Configuration file `vercel.json` already included.

### Option 2: Netlify
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy

# Production deploy
netlify deploy --prod
```

### Option 3: Traditional Web Server
1. Upload `dist/` folder contents to web root
2. Configure server for SPA (redirect all routes to index.html)
3. Ensure HTTPS is enabled

## Post-Deployment

### 1. Create Entry Gates
Login as Super Admin and create entry gates:
- Main Entrance
- VIP Entrance
- Side Entry
(Navigate to Admin → Entry Gates → Add Gate)

### 2. Setup SipToken Counters
Create counter assignments:
- Token Sales Counter 1, 2, 3...
- Bar Counter 1, 2, 3...

### 3. Assign Staff Roles
- Overseer: Enable `is_siptoken_overseer` flag
- Sales Staff: Enable `is_siptoken_sales` flag
- Barmen: Enable `is_barman` flag
- Marshalls: Role = `entry_marshall`
- Sellers: Role = `seller`

### 4. Test Complete Workflow
- [ ] Seller registration
- [ ] Payment verification
- [ ] QR pass generation
- [ ] WhatsApp sending
- [ ] Gate entry scanning
- [ ] Token purchase
- [ ] Beverage order
- [ ] Overseer reconciliation

## Day-of-Event Checklist

### Morning Setup (4 hours before)
- [ ] Verify internet connectivity at venue
- [ ] Test all tablets/devices
- [ ] Login all staff accounts
- [ ] Verify QR scanners working
- [ ] Print backup guest lists
- [ ] Setup Token Sales counters
- [ ] Setup Bar counters
- [ ] Overseer clock-in all staff

### During Event
- [ ] Monitor real-time dashboard
- [ ] Handle payment verification queue
- [ ] Manage entry flow
- [ ] Monitor SipToken sales
- [ ] Track beverage orders
- [ ] Handle any discrepancies

### Post-Event (Within 2 hours)
- [ ] Overseer clock-out all staff
- [ ] Verify all reconciliations
- [ ] Export final reports
- [ ] Backup database
- [ ] Generate analytics

## Troubleshooting

### Issue: Supabase Connection Failed
- Check internet connectivity
- Verify Supabase URL and Key are correct
- Check Supabase project status

### Issue: QR Code Not Scanning
- Ensure camera permissions granted
- Check QR code is not blurred/damaged
- Verify adequate lighting

### Issue: Payment Not Verifying
- Check Razorpay webhook configuration
- Verify payment actually received in Razorpay dashboard
- Check payment_id matches

### Issue: Reconciliation Mismatch
- Review all transactions for the shift
- Check for cancelled orders
- Verify token rate settings
- Check for system time discrepancies

## Support Contacts

**Technical Support:** [Your Contact]
**Supabase Issues:** support@supabase.com
**Razorpay Issues:** support@razorpay.com

## Security Notes

⚠️ **IMPORTANT:**
- Never commit `.env` file to Git
- Keep Supabase keys secure
- Use environment variables in production
- Enable Row Level Security in Supabase
- Regular database backups
- Monitor for suspicious activity

## Performance Optimization

- Enable Supabase connection pooling
- Use indexes on frequently queried fields
- Implement rate limiting for API calls
- Consider CDN for static assets
- Monitor database query performance

---

**🎉 Ready to make Vamos Festa unforgettable! ¡Viva la Fiesta! 🌮**
