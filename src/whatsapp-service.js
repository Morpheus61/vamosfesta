// =====================================================
// WHATSAPP SERVICE - TWILIO INTEGRATION
// Vamos Festa Event Management
// =====================================================

// Twilio Configuration (from environment variables)
const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = import.meta.env.VITE_TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// App Configuration
const APP_URL = import.meta.env.VITE_APP_URL || 'https://vamosfesta.vercel.app';

// Supabase client (imported from main)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bruwwqxeevqnbhunrhia.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJydXd3cXhlZXZxbmJodW5yaGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MzIwMjksImV4cCI6MjA4MTEwODAyOX0.dhmkH6aUudxm3eUZblRe9Iah1RWEr5fz8PzcPNqh4tw';
const supabase = createClient(supabaseUrl, supabaseKey);

// =====================================================
// SEND WHATSAPP MESSAGE (via Twilio)
// =====================================================

async function sendWhatsAppMessage(to, message, messageType) {
    // Format phone number for WhatsApp
    const formattedTo = formatPhoneForWhatsApp(to);
    
    // Log attempt to database
    const logEntry = {
        guest_phone: to,
        message_type: messageType,
        message_content: message,
        status: 'pending'
    };
    
    const { data: logData } = await supabase
        .from('whatsapp_messages')
        .insert(logEntry)
        .select()
        .single();
    
    try {
        // Check if Twilio is configured
        if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
            console.warn('Twilio not configured. Message not sent:', message);
            
            // Update log with failure
            if (logData) {
                await supabase
                    .from('whatsapp_messages')
                    .update({ 
                        status: 'failed', 
                        error_message: 'Twilio credentials not configured' 
                    })
                    .eq('id', logData.id);
            }
            
            return { success: false, error: 'Twilio not configured' };
        }
        
        // Send via Twilio API
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        
        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                From: TWILIO_WHATSAPP_FROM,
                To: formattedTo,
                Body: message
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Update log with success
            if (logData) {
                await supabase
                    .from('whatsapp_messages')
                    .update({ 
                        status: 'sent', 
                        twilio_sid: result.sid 
                    })
                    .eq('id', logData.id);
            }
            
            console.log('✅ WhatsApp message sent to', to);
            return { success: true, sid: result.sid };
        } else {
            throw new Error(result.message || 'Failed to send message');
        }
        
    } catch (error) {
        console.error('WhatsApp send error:', error);
        
        // Update log with error
        if (logData) {
            await supabase
                .from('whatsapp_messages')
                .update({ 
                    status: 'failed', 
                    error_message: error.message 
                })
                .eq('id', logData.id);
        }
        
        return { success: false, error: error.message };
    }
}

function formatPhoneForWhatsApp(phone) {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Add India country code if not present
    if (digits.length === 10) {
        return `whatsapp:+91${digits}`;
    } else if (digits.startsWith('91') && digits.length === 12) {
        return `whatsapp:+${digits}`;
    } else {
        return `whatsapp:+${digits}`;
    }
}

// =====================================================
// GENERATE GUEST AUTH TOKEN
// =====================================================

async function generateGuestAuthToken(guestPhone, guestId) {
    // Generate random token
    const token = generateRandomToken(32);
    
    // Set expiry (24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // Delete old tokens for this guest
    await supabase
        .from('guest_auth_tokens')
        .delete()
        .eq('guest_phone', guestPhone);
    
    // Create new token
    await supabase
        .from('guest_auth_tokens')
        .insert({
            guest_id: guestId,
            guest_phone: guestPhone,
            auth_token: token,
            expires_at: expiresAt.toISOString()
        });
    
    return token;
}

function generateRandomToken(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// =====================================================
// MESSAGE TEMPLATES
// =====================================================

// Token Purchase Confirmation
export async function sendTokenPurchaseMessage(guestPhone, guestName, guestId, tokensPurchased, amountPaid, newBalance) {
    const authToken = await generateGuestAuthToken(guestPhone, guestId);
    const portalLink = `${APP_URL}/guest.html?token=${authToken}`;
    
    const message = `🎉 *Vamos Festa - Tokens Purchased!*

Hi ${guestName}!

✅ Tokens: ${tokensPurchased}
💰 Paid: ₹${amountPaid}
🪙 Balance: ${newBalance} tokens

👉 *Order drinks here:*
${portalLink}

_Your personal menu is ready!_

Enjoy the festa! 🎊`;

    return sendWhatsAppMessage(guestPhone, message, 'token_purchase');
}

// Order Served Confirmation
export async function sendOrderServedMessage(guestPhone, guestName, orderNumber, items, tokensUsed, newBalance) {
    const message = `🍹 *Vamos Festa - Order Served!*

Hi ${guestName}!

✅ Order *#${orderNumber}* is ready!

📋 Items: ${items}
🪙 Tokens used: ${tokensUsed}
🪙 Remaining: ${newBalance} tokens

Cheers! 🥂`;

    return sendWhatsAppMessage(guestPhone, message, 'order_served');
}

// Order Rejected Notification
export async function sendOrderRejectedMessage(guestPhone, guestName, orderNumber, reason) {
    const message = `❌ *Vamos Festa - Order Cancelled*

Hi ${guestName},

Your order *#${orderNumber}* could not be processed.

${reason ? `Reason: ${reason}` : ''}

🪙 No tokens were deducted.

Please visit the bar counter for assistance or create a new order.`;

    return sendWhatsAppMessage(guestPhone, message, 'order_rejected');
}

// Refund Processed Notification
export async function sendRefundMessage(guestPhone, guestName, guestId, orderNumber, tokensRefunded, newBalance, reason) {
    const authToken = await generateGuestAuthToken(guestPhone, guestId);
    const portalLink = `${APP_URL}/guest.html?token=${authToken}`;
    
    const message = `🔄 *Vamos Festa - Refund Processed*

Hi ${guestName}!

Order *#${orderNumber}* has been refunded.

🪙 Tokens credited: ${tokensRefunded}
🪙 New balance: ${newBalance} tokens

${reason ? `Reason: ${reason}` : ''}

👉 Order more:
${portalLink}

Sorry for any inconvenience! 🙏`;

    return sendWhatsAppMessage(guestPhone, message, 'refund_processed');
}

// Low Balance Warning
export async function sendLowBalanceMessage(guestPhone, guestName, guestId, currentBalance) {
    const authToken = await generateGuestAuthToken(guestPhone, guestId);
    const portalLink = `${APP_URL}/guest.html?token=${authToken}`;
    
    const message = `⚠️ *Vamos Festa - Low Token Balance*

Hi ${guestName}!

Your token balance is running low.

🪙 Current balance: ${currentBalance} tokens

Visit the Token Counter to top up!

👉 Check your balance:
${portalLink}`;

    return sendWhatsAppMessage(guestPhone, message, 'low_balance');
}

// Order Submitted Confirmation
export async function sendOrderSubmittedMessage(guestPhone, guestName, orderNumber, counterName, items, totalTokens) {
    const message = `📝 *Order Submitted!*

Hi ${guestName}!

Your order *#${orderNumber}* has been sent to *${counterName}*.

📋 Items: ${items}
🪙 Total: ${totalTokens} tokens

⏳ Waiting for barman to accept...

We'll notify you when it's ready!

_Vamos Festa_`;

    return sendWhatsAppMessage(guestPhone, message, 'order_submitted');
}

// Order Accepted Notification
export async function sendOrderAcceptedMessage(guestPhone, guestName, orderNumber, counterName, barmanName) {
    const message = `✅ *Order Accepted!*

Hi ${guestName}!

Your order *#${orderNumber}* is being prepared at *${counterName}*.

👨‍🍳 Prepared by: ${barmanName}

Please wait nearby - we'll notify you when it's ready!

_Vamos Festa_`;

    return sendWhatsAppMessage(guestPhone, message, 'order_accepted');
}

// Guest Registration Welcome (with Portal Link)
export async function sendGuestWelcomeMessage(guestPhone, guestName, guestId, entryType) {
    const authToken = await generateGuestAuthToken(guestPhone, guestId);
    const portalLink = `${APP_URL}/guest.html?token=${authToken}`;
    
    const message = `🎉 *Welcome to Vamos Festa!*

Hi ${guestName}!

Your registration is complete!

🎫 Entry Type: ${entryType === 'stag' ? 'Stag' : 'Couple'}
📱 Mobile: ${guestPhone}

👉 *Your Personal Guest Portal:*
${portalLink}

✨ *Simply click the link above to access your portal!*
(No login needed - the link is personalized for you)

*Portal Features:*
• Download your guest pass
• Purchase beverage tokens
• Order drinks from any counter
• Track your orders in real-time

💡 *TIP:* Save this link for easy access throughout the event!

See you at the festa! 🎊

_Vamos Festa - ¡Viva la Fiesta!_`;

    return sendWhatsAppMessage(guestPhone, message, 'guest_welcome');
}

// =====================================================
// EXPORTS
// =====================================================

export {
    sendWhatsAppMessage,
    generateGuestAuthToken,
    sendOrderSubmittedMessage,
    sendOrderAcceptedMessage,
    sendGuestWelcomeMessage
};

console.log('✅ WhatsApp service loaded');