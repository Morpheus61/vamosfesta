// =====================================================
// SIPTOKEN MODULE - Complete Beverage Sales System
// Vamos Festa Event Management
// =====================================================

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

// Import supabase from main
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bruwwqxeevqnbhunrhia.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJydXd3cXhlZXZxbmJodW5yaGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQwODYwMDEsImV4cCI6MjA0OTY2MjAwMX0.zU7vCWB9jl5bgDtE2kQM79u5vLs5HeCPq48NOIWp_eY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Global state for SipToken
let tokenSettings = { token_rate: 10, qr_expiry_seconds: 60 };
let currentTokenWallet = null;
let currentPaymentQR = null;
let barmanQrScanner = null;

// =====================================================
// GUEST TOKEN PURCHASE
// =====================================================

export async function initializeGuestTokenPurchase() {
    // Load token settings
    const { data, error } = await supabase
        .from('siptoken_settings')
        .select('*')
        .single();
    
    if (data) {
        tokenSettings = data;
    }
}

// Show token purchase modal for guests
window.showTokenPurchaseModal = async function(guestPhone) {
    const modal = document.getElementById('tokenPurchaseModal');
    if (!modal) return;
    
    // Get or create wallet for this guest
    const { data: wallet, error } = await supabase
        .from('token_wallets')
        .select('*')
        .eq('guest_phone', guestPhone)
        .single();
    
    currentTokenWallet = wallet;
    
    if (!wallet) {
        // Create new wallet
        const { data: guest } = await supabase
            .from('guests')
            .select('*')
            .eq('phone', guestPhone)
            .single();
        
        if (guest) {
            const { data: newWallet } = await supabase
                .from('token_wallets')
                .insert({
                    guest_id: guest.id,
                    guest_name: guest.guest_name,
                    guest_phone: guest.phone,
                    token_balance: 0
                })
                .select()
                .single();
            
            currentTokenWallet = newWallet;
        }
    }
    
    // Display wallet info
    document.getElementById('tokenWalletBalance').textContent = currentTokenWallet?.token_balance || 0;
    document.getElementById('tokenWalletGuest').textContent = currentTokenWallet?.guest_name || '';
    document.getElementById('tokenRate').textContent = `₹${tokenSettings.token_rate} = 1 Token`;
    
    openModal('tokenPurchaseModal');
};

// Purchase tokens (cash/online)
window.purchaseTokens = async function() {
    const tokensInput = document.getElementById('tokensToPurchase');
    const paymentMethod = document.getElementById('tokenPaymentMethod').value;
    const tokens = parseInt(tokensInput.value);
    
    if (!tokens || tokens < 1) {
        showToast('Enter valid token amount', 'error');
        return;
    }
    
    const amount = tokens * tokenSettings.token_rate;
    
    if (!confirm(`Purchase ${tokens} tokens for ₹${amount}?`)) return;
    
    try {
        // Record purchase
        const { data: purchase, error } = await supabase
            .from('token_purchases')
            .insert({
                wallet_id: currentTokenWallet.id,
                seller_id: window.currentUser?.id,
                tokens_purchased: tokens,
                amount_paid: amount,
                payment_method: paymentMethod,
                transaction_status: 'completed'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Reload wallet (will be updated by trigger)
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: updatedWallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('id', currentTokenWallet.id)
            .single();
        
        currentTokenWallet = updatedWallet;
        document.getElementById('tokenWalletBalance').textContent = updatedWallet.token_balance;
        
        showToast(`✅ Purchased ${tokens} tokens successfully!`, 'success');
        tokensInput.value = '';
        
    } catch (error) {
        console.error('Token purchase error:', error);
        showToast('Failed to purchase tokens', 'error');
    }
};

// =====================================================
// TOKEN PAYMENT QR GENERATION (for beverage orders)
// =====================================================

window.generateTokenPaymentQR = async function() {
    const tokensForOrder = parseInt(document.getElementById('tokensForOrder').value);
    
    if (!tokensForOrder || tokensForOrder < 1) {
        showToast('Enter token amount for order', 'error');
        return;
    }
    
    if (tokensForOrder > currentTokenWallet.token_balance) {
        showToast(`Insufficient tokens! Balance: ${currentTokenWallet.token_balance}`, 'error');
        return;
    }
    
    try {
        // Create QR with expiry
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + tokenSettings.qr_expiry_seconds);
        
        const qrData = {
            type: 'token_payment',
            wallet_id: currentTokenWallet.id,
            tokens: tokensForOrder,
            guest_name: currentTokenWallet.guest_name,
            guest_phone: currentTokenWallet.guest_phone,
            timestamp: new Date().toISOString()
        };
        
        const qrString = JSON.stringify(qrData);
        
        // Insert into database
        const { data: paymentQR, error } = await supabase
            .from('token_payment_qrs')
            .insert({
                wallet_id: currentTokenWallet.id,
                qr_data: qrString,
                tokens_amount: tokensForOrder,
                status: 'pending',
                expires_at: expiresAt.toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        currentPaymentQR = paymentQR;
        
        // Generate QR code image
        const qrCanvas = await QRCode.toCanvas(qrString, {
            width: 300,
            margin: 2,
            color: {
                dark: '#1a1a2e',
                light: '#ffffff'
            }
        });
        
        // Display QR
        const qrContainer = document.getElementById('tokenPaymentQRDisplay');
        qrContainer.innerHTML = '';
        qrContainer.appendChild(qrCanvas);
        
        // Show countdown
        startQRCountdown(paymentQR.id, tokenSettings.qr_expiry_seconds);
        
        // Show QR modal
        document.getElementById('tokenPaymentQRInfo').innerHTML = `
            <div class="text-center">
                <h3 class="text-xl font-bold mb-2">Payment QR Ready</h3>
                <p class="text-gray-300 mb-1">${tokensForOrder} tokens</p>
                <p class="text-sm text-gray-400">Show this to barman to place order</p>
                <p class="text-xs text-yellow-500 mt-2">⏱️ Expires in <span id="qrCountdown">${tokenSettings.qr_expiry_seconds}</span> seconds</p>
            </div>
        `;
        
        openModal('tokenPaymentQRModal');
        
    } catch (error) {
        console.error('QR generation error:', error);
        showToast('Failed to generate payment QR', 'error');
    }
};

function startQRCountdown(qrId, seconds) {
    let remaining = seconds;
    const countdownEl = document.getElementById('qrCountdown');
    
    const interval = setInterval(async () => {
        remaining--;
        if (countdownEl) {
            countdownEl.textContent = remaining;
        }
        
        if (remaining <= 0) {
            clearInterval(interval);
            
            // Mark as expired
            await supabase
                .from('token_payment_qrs')
                .update({ status: 'expired' })
                .eq('id', qrId);
            
            showToast('Payment QR expired', 'warning');
            closeModal('tokenPaymentQRModal');
        }
    }, 1000);
}

// =====================================================
// BARMAN QR SCANNER & ORDER PROCESSING
// =====================================================

window.startBarmanScanner = async function() {
    const video = document.getElementById('barmanQrVideo');
    
    if (!video) {
        console.error('Barman video element not found');
        return;
    }
    
    openModal('barmanScannerModal');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        video.play();
        
        // Load QR Scanner library
        if (!window.QrScanner) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.umd.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }
        
        barmanQrScanner = new QrScanner(video, result => {
            processBarmanQRScan(result.data);
        }, {
            highlightScanRegion: true,
            highlightCodeOutline: true
        });
        
        await barmanQrScanner.start();
        
    } catch (error) {
        console.error('Camera error:', error);
        closeModal('barmanScannerModal');
        showToast('Camera access denied', 'error');
    }
};

window.stopBarmanScanner = function() {
    if (barmanQrScanner) {
        barmanQrScanner.stop();
        barmanQrScanner.destroy();
        barmanQrScanner = null;
    }
    
    const video = document.getElementById('barmanQrVideo');
    if (video?.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    closeModal('barmanScannerModal');
};

async function processBarmanQRScan(qrData) {
    stopBarmanScanner();
    
    try {
        let paymentData;
        try {
            paymentData = JSON.parse(qrData);
        } catch {
            showToast('Invalid QR Code', 'error');
            return;
        }
        
        if (paymentData.type !== 'token_payment') {
            showToast('Not a token payment QR', 'error');
            return;
        }
        
        // Get payment QR from database
        const { data: paymentQR, error } = await supabase
            .from('token_payment_qrs')
            .select('*, token_wallets(*)')
            .eq('qr_data', qrData)
            .single();
        
        if (error || !paymentQR) {
            showToast('Payment QR not found', 'error');
            return;
        }
        
        // Check if expired
        if (new Date(paymentQR.expires_at) < new Date()) {
            await supabase
                .from('token_payment_qrs')
                .update({ status: 'expired' })
                .eq('id', paymentQR.id);
            
            showToast('Payment QR has expired', 'error');
            return;
        }
        
        // Check if already used
        if (paymentQR.status !== 'pending') {
            showToast(`Payment QR already ${paymentQR.status}`, 'error');
            return;
        }
        
        // Check wallet balance
        if (paymentQR.token_wallets.token_balance < paymentQR.tokens_amount) {
            showToast('Insufficient token balance', 'error');
            return;
        }
        
        // Show order entry form
        showBarmanOrderEntry(paymentQR);
        
    } catch (error) {
        console.error('Barman QR processing error:', error);
        showToast('Failed to process QR code', 'error');
    }
}

function showBarmanOrderEntry(paymentQR) {
    const modal = document.getElementById('barmanOrderModal');
    if (!modal) return;
    
    // Store current payment QR
    window.currentBarmanPaymentQR = paymentQR;
    
    // Display customer info
    document.getElementById('barmanOrderGuestInfo').innerHTML = `
        <div class="card bg-blue-900/20 border-blue-600/30 mb-4">
            <h4 class="font-bold">${paymentQR.token_wallets.guest_name}</h4>
            <p class="text-sm text-gray-400">${paymentQR.token_wallets.guest_phone}</p>
            <p class="text-lg text-yellow-500 mt-2">
                <i class="fas fa-coins mr-2"></i>${paymentQR.tokens_amount} Tokens
            </p>
            <p class="text-xs text-gray-500 mt-1">Wallet Balance: ${paymentQR.token_wallets.token_balance} tokens</p>
        </div>
    `;
    
    // Set max tokens
    document.getElementById('orderTokensUsed').value = paymentQR.tokens_amount;
    document.getElementById('orderTokensUsed').max = paymentQR.tokens_amount;
    
    openModal('barmanOrderModal');
}

window.processBarmanOrder = async function() {
    const paymentQR = window.currentBarmanPaymentQR;
    if (!paymentQR) return;
    
    const orderItems = document.getElementById('barmanOrderItems').value;
    const tokensUsed = parseInt(document.getElementById('orderTokensUsed').value);
    
    if (!orderItems) {
        showToast('Enter order items', 'error');
        return;
    }
    
    if (tokensUsed > paymentQR.tokens_amount) {
        showToast('Tokens exceed QR amount', 'error');
        return;
    }
    
    try {
        // Store original balance
        const originalBalance = paymentQR.token_wallets.token_balance;
        
        // Create beverage order
        const { data: order, error: orderError } = await supabase
            .from('beverage_orders')
            .insert({
                wallet_id: paymentQR.wallet_id,
                payment_qr_id: paymentQR.id,
                barman_id: window.currentUser?.id,
                tokens_spent: tokensUsed,
                items: { description: orderItems },
                total_tokens: tokensUsed,
                status: 'completed'
            })
            .select()
            .single();
        
        if (orderError) throw orderError;
        
        // Mark payment QR as completed
        await supabase
            .from('token_payment_qrs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                barman_id: window.currentUser?.id,
                order_details: { items: orderItems }
            })
            .eq('id', paymentQR.id);
        
        // Wait for trigger to update wallet
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch updated wallet balance
        const { data: updatedWallet, error: walletError } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('id', paymentQR.wallet_id)
            .single();
        
        const newBalance = updatedWallet?.token_balance || (originalBalance - tokensUsed);
        
        // Show guest balance notification
        showGuestBalanceNotification(
            paymentQR.token_wallets.guest_name,
            tokensUsed,
            newBalance
        );
        
        showToast(`✅ Order completed! ${tokensUsed} tokens processed`, 'success');
        closeModal('barmanOrderModal');
        
        // Clear form
        document.getElementById('barmanOrderItems').value = '';
        document.getElementById('orderTokensUsed').value = '';
        
        // Reload barman stats if function exists
        if (window.loadBarmanStats) {
            await window.loadBarmanStats();
        }
        
    } catch (error) {
        console.error('Order processing error:', error);
        showToast('Failed to process order', 'error');
    }
};

// Show guest balance notification after order
function showGuestBalanceNotification(guestName, tokensDeducted, remainingBalance) {
    const modal = document.getElementById('guestBalanceNotificationModal');
    if (!modal) {
        // Create modal if it doesn't exist
        createGuestBalanceNotificationModal();
        return showGuestBalanceNotification(guestName, tokensDeducted, remainingBalance);
    }
    
    // Update notification content
    document.getElementById('guestNotificationName').textContent = guestName;
    document.getElementById('guestNotificationDeducted').textContent = tokensDeducted;
    document.getElementById('guestNotificationBalance').textContent = remainingBalance;
    
    // Show modal
    openModal('guestBalanceNotificationModal');
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        closeModal('guestBalanceNotificationModal');
    }, 5000);
}

// Create guest balance notification modal dynamically
function createGuestBalanceNotificationModal() {
    const modalHTML = `
        <div id="guestBalanceNotificationModal" class="modal">
            <div class="modal-content max-w-md">
                <div style="text-align: center; padding: 1rem;">
                    <div style="
                        background: linear-gradient(135deg, #22c55e, #10b981);
                        color: white;
                        padding: 1.5rem;
                        border-radius: 1rem;
                        margin-bottom: 1.5rem;
                        box-shadow: 0 10px 30px rgba(34, 197, 94, 0.3);
                    ">
                        <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">
                            ORDER COMPLETED!
                        </h2>
                        <p style="font-size: 1rem; opacity: 0.9;">
                            Thank you, <span id="guestNotificationName" style="font-weight: 700;">Guest</span>!
                        </p>
                    </div>
                    
                    <div style="
                        background: rgba(255, 107, 53, 0.1);
                        border: 2px solid #FF6B35;
                        border-radius: 1rem;
                        padding: 1.5rem;
                        margin-bottom: 1rem;
                    ">
                        <p style="
                            color: #666;
                            font-size: 0.9rem;
                            margin-bottom: 0.5rem;
                            font-weight: 600;
                        ">Tokens Deducted:</p>
                        <p style="
                            font-size: 2.5rem;
                            font-weight: 800;
                            color: #FF6B35;
                            margin: 0;
                        ">
                            <i class="fas fa-minus-circle" style="font-size: 2rem; vertical-align: middle;"></i>
                            <span id="guestNotificationDeducted">0</span>
                        </p>
                    </div>
                    
                    <div style="
                        background: rgba(0, 180, 216, 0.1);
                        border: 2px solid #00B4D8;
                        border-radius: 1rem;
                        padding: 1.5rem;
                    ">
                        <p style="
                            color: #666;
                            font-size: 0.9rem;
                            margin-bottom: 0.5rem;
                            font-weight: 600;
                        ">Your Remaining Balance:</p>
                        <p style="
                            font-size: 2.5rem;
                            font-weight: 800;
                            color: #00B4D8;
                            margin: 0;
                        ">
                            <i class="fas fa-coins" style="font-size: 2rem; vertical-align: middle;"></i>
                            <span id="guestNotificationBalance">0</span> tokens
                        </p>
                    </div>
                    
                    <button onclick="closeModal('guestBalanceNotificationModal')" style="
                        margin-top: 1.5rem;
                        width: 100%;
                        padding: 1rem;
                        background: linear-gradient(135deg, #FF6B35, #FFD60A);
                        color: #1a1a2e;
                        border: none;
                        border-radius: 0.75rem;
                        font-size: 1.1rem;
                        font-weight: 700;
                        cursor: pointer;
                        box-shadow: 0 4px 15px rgba(255, 107, 53, 0.4);
                    ">
                        <i class="fas fa-check mr-2"></i> OK, Got It!
                    </button>
                    
                    <p style="
                        margin-top: 1rem;
                        font-size: 0.75rem;
                        color: #999;
                    ">This window will close automatically in 5 seconds</p>
                </div>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// =====================================================
// OVERSEER STAFF MANAGEMENT
// =====================================================

window.showClockInModal = async function(staffRole) {
    // staffRole: 'token_sales' or 'barman'
    
    const modal = document.getElementById('overseerClockInModal');
    if (!modal) return;
    
    // Load available staff
    const roleFilter = staffRole === 'token_sales' ? 'is_siptoken_sales' : 'is_barman';
    
    const { data: staff, error } = await supabase
        .from('users')
        .select('*')
        .eq(roleFilter, true)
        .eq('is_active', true);
    
    if (error) {
        console.error('Error loading staff:', error);
        return;
    }
    
    // Populate staff select
    const select = document.getElementById('clockInStaffSelect');
    select.innerHTML = staff.map(s => `
        <option value="${s.id}">${s.full_name} (${s.username})</option>
    `).join('');
    
    document.getElementById('clockInStaffRole').value = staffRole;
    document.getElementById('clockInModalTitle').textContent = `Clock In ${staffRole === 'token_sales' ? 'Sales Staff' : 'Barman'}`;
    
    openModal('overseerClockInModal');
};

window.clockInStaff = async function() {
    const staffId = document.getElementById('clockInStaffSelect').value;
    const staffRole = document.getElementById('clockInStaffRole').value;
    const counterName = document.getElementById('clockInCounter').value;
    const openingCash = parseFloat(document.getElementById('clockInOpeningCash').value) || 0;
    
    if (!staffId || !counterName) {
        showToast('Select staff and enter counter name', 'error');
        return;
    }
    
    try {
        const { data: session, error } = await supabase
            .from('siptoken_duty_sessions')
            .insert({
                staff_id: staffId,
                overseer_id: window.currentUser?.id,
                staff_role: staffRole,
                counter_name: counterName,
                opening_cash: staffRole === 'token_sales' ? openingCash : null,
                status: 'on_duty'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        showToast('✅ Staff clocked in successfully', 'success');
        closeModal('overseerClockInModal');
        
        // Reload duty sessions
        if (window.loadDutySessions) {
            await window.loadDutySessions();
        }
        
    } catch (error) {
        console.error('Clock in error:', error);
        showToast('Failed to clock in staff', 'error');
    }
};

window.showClockOutModal = async function(sessionId) {
    const { data: session, error } = await supabase
        .from('siptoken_duty_sessions')
        .select('*, users(*)')
        .eq('id', sessionId)
        .single();
    
    if (error || !session) {
        showToast('Session not found', 'error');
        return;
    }
    
    window.currentClockOutSession = session;
    
    const modal = document.getElementById('overseerClockOutModal');
    if (!modal) return;
    
    // Display staff info
    document.getElementById('clockOutStaffInfo').innerHTML = `
        <div class="card bg-gray-800">
            <h4 class="font-bold">${session.users.full_name}</h4>
            <p class="text-sm text-gray-400">${session.counter_name}</p>
            <p class="text-xs text-gray-500">Clocked in: ${new Date(session.clock_in_time).toLocaleString()}</p>
        </div>
    `;
    
    // Show appropriate reconciliation fields
    if (session.staff_role === 'token_sales') {
        document.getElementById('tokenSalesReconciliation').classList.remove('hidden');
        document.getElementById('barmanReconciliation').classList.add('hidden');
        document.getElementById('clockOutOpeningCash').textContent = `₹${session.opening_cash}`;
    } else {
        document.getElementById('tokenSalesReconciliation').classList.add('hidden');
        document.getElementById('barmanReconciliation').classList.remove('hidden');
    }
    
    openModal('overseerClockOutModal');
};

window.clockOutStaff = async function() {
    const session = window.currentClockOutSession;
    if (!session) return;
    
    let updateData = {
        clock_out_time: new Date().toISOString(),
        status: 'clocked_out',
        notes: document.getElementById('clockOutNotes').value
    };
    
    if (session.staff_role === 'token_sales') {
        const tokensSold = parseInt(document.getElementById('clockOutTokensSold').value) || 0;
        const cashCollected = parseFloat(document.getElementById('clockOutCashCollected').value) || 0;
        const expectedCash = (session.opening_cash || 0) + (tokensSold * tokenSettings.token_rate);
        const discrepancy = cashCollected - expectedCash;
        
        updateData = {
            ...updateData,
            closing_cash: cashCollected,
            tokens_sold: tokensSold,
            rupees_collected: tokensSold * tokenSettings.token_rate,
            discrepancy_amount: discrepancy
        };
        
        if (Math.abs(discrepancy) > 0.01) {
            if (!confirm(`Discrepancy of ₹${discrepancy.toFixed(2)} detected. Continue?`)) {
                return;
            }
        }
    } else {
        const ordersServed = parseInt(document.getElementById('clockOutOrdersServed').value) || 0;
        const tokensProcessed = parseInt(document.getElementById('clockOutTokensProcessed').value) || 0;
        
        updateData = {
            ...updateData,
            orders_served: ordersServed,
            tokens_processed: tokensProcessed,
            discrepancy_amount: ordersServed !== tokensProcessed ? Math.abs(ordersServed - tokensProcessed) : 0
        };
    }
    
    try {
        const { error } = await supabase
            .from('siptoken_duty_sessions')
            .update(updateData)
            .eq('id', session.id);
        
        if (error) throw error;
        
        showToast('✅ Staff clocked out successfully', 'success');
        closeModal('overseerClockOutModal');
        
        if (window.loadDutySessions) {
            await window.loadDutySessions();
        }
        
    } catch (error) {
        console.error('Clock out error:', error);
        showToast('Failed to clock out staff', 'error');
    }
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function showToast(message, type = 'info') {
    // Implement toast notification
    console.log(`[${type.toUpperCase()}] ${message}`);
    if (window.showToast) {
        window.showToast(message, type);
    }
}
