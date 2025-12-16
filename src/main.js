// =====================================================
// VAMOS FESTA - Main Application v2.0
// Multi-Seller Workflow with Payment Verification
// =====================================================

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

// Supabase Configuration - Use environment variables or fallback to hardcoded values
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nybbovgdsvbwabuqthbd.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55YmJvdmdkc3Zid2FidXF0aGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTU5NTIsImV4cCI6MjA4MDMzMTk1Mn0.g-1eRhGpiiOICp0tTPjsvAcuIUYur1NIqw1AOt1tugw';
const supabase = createClient(supabaseUrl, supabaseKey);

// Global State
let currentUser = null;
let settings = {};
let currentGuestForPass = null;

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            console.log('✅ Service Worker registered successfully:', registration.scope);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New service worker available
                        if (confirm('New version available! Reload to update?')) {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                        }
                    }
                });
            });
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    }
    
    // Initialize online/offline status indicator
    initializeOfflineMode();
    
    // Check for existing session
    const savedUser = sessionStorage.getItem('vamosfesta_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        await initializeApp();
    }
    
    // Setup event listeners
    setupEventListeners();
});

async function initializeApp() {
    if (!currentUser) return;
    
    // Load settings
    await loadSettings();
    
    // Update UI for role
    // SipToken staff get special role class to hide seller tabs
    let bodyClass = `vamosfesta-bg`;
    
    if (currentUser.is_siptoken_sales && !currentUser.is_barman) {
        bodyClass += ' role-token-sales';
    } else if (currentUser.is_barman && !currentUser.is_siptoken_sales) {
        bodyClass += ' role-barman';
    } else if (currentUser.is_siptoken_sales && currentUser.is_barman) {
        bodyClass += ' role-siptoken-staff';
    } else {
        bodyClass += ` role-${currentUser.role}`;
    }
    
    if (currentUser.is_gate_overseer) {
        bodyClass += ' overseer';
    }
    if (currentUser.is_siptoken_overseer) {
        bodyClass += ' siptoken-overseer';
    }
    
    document.body.className = bodyClass;
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // =====================================================
    // HIDE MAIN SETTINGS/ADMIN TABS FOR SIPTOKEN OVERSEER
    // SipToken Overseer should ONLY see SipToken tab with their own config
    // =====================================================
    if (currentUser.is_siptoken_overseer && currentUser.role !== 'super_admin') {
        const tabsToHide = ['settings', 'verification-queue', 'all-registrations', 
                           'seller-management', 'admin-management', 'gate-management',
                           'view-registrations', 'view-sellers'];
        
        tabsToHide.forEach(tabName => {
            // Hide nav tabs
            const navTab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
            if (navTab) navTab.style.display = 'none';
            
            // Hide mobile menu items
            const mobileItem = document.querySelector(`.mobile-menu-item[data-tab="${tabName}"]`);
            if (mobileItem) mobileItem.style.display = 'none';
        });
        
        console.log('✅ SipToken Overseer: Hidden admin tabs - user has access only to SipToken management');
        
        // Also hide the Gate Management tab content itself
        const gateManagementTab = document.getElementById('tab-gate-management');
        if (gateManagementTab) gateManagementTab.style.display = 'none';
    }
    
    // Show SipToken tab for users with SipToken roles
    const siptokenNavTab = document.getElementById('siptokenNavTab');
    const siptokenMobileItems = document.querySelectorAll('.siptoken-menu-item');
    if (currentUser.is_siptoken_sales || currentUser.is_barman || currentUser.is_siptoken_overseer || currentUser.role === 'super_admin') {
        if (siptokenNavTab) siptokenNavTab.style.display = 'flex';
        siptokenMobileItems.forEach(item => item.style.display = 'flex');
    }
    
    // Hide seller tabs for SipToken-only staff
    if ((currentUser.is_siptoken_sales || currentUser.is_barman) && currentUser.role === 'seller') {
        // Hide seller tabs - they should only see SipToken
        document.querySelectorAll('.nav-tab.seller-only').forEach(tab => {
            tab.style.display = 'none';
        });
    }
    
    // Update user display
    document.getElementById('userName').textContent = currentUser.full_name || currentUser.username;
    
    // Show proper role badge
    let roleBadgeText = formatRole(currentUser.role);
    if (currentUser.is_siptoken_sales) roleBadgeText = 'Token Sales';
    if (currentUser.is_barman) roleBadgeText = 'Barman';
    if (currentUser.is_siptoken_overseer) roleBadgeText += ' (Overseer)';
    
    document.getElementById('userRoleBadge').textContent = roleBadgeText;
    document.getElementById('userRoleBadge').className = `role-badge role-${currentUser.role}`;
    
    // Show first appropriate tab
    showDefaultTab();
    
    // Load data based on role
    await loadRoleData();
}

function formatRole(role) {
    const roles = {
        'super_admin': 'Super Admin',
        'admin': 'Admin',
        'seller': 'Seller',
        'entry_marshall': 'Entry Marshall',
        'token_sales': 'Token Sales',
        'barman': 'Barman'
    };
    return roles[role] || role;
}

function showDefaultTab() {
    let defaultTab;
    
    // SipToken staff and overseers get SipToken tab by default
    if (currentUser.is_siptoken_sales || currentUser.is_barman || currentUser.is_siptoken_overseer) {
        defaultTab = 'siptokenTab';
        showTab(defaultTab);
        showSipTokenRoleContent();
        return;
    }
    
    switch(currentUser.role) {
        case 'seller':
            defaultTab = 'register';
            break;
        case 'super_admin':
            defaultTab = 'verification-queue';
            break;
        case 'admin':
            defaultTab = 'view-registrations';
            break;
        case 'entry_marshall':
            defaultTab = 'entry-scan';
            break;
        default:
            defaultTab = 'register';
    }
    showTab(defaultTab);
}

async function loadRoleData() {
    switch(currentUser.role) {
        case 'seller':
            await loadMySales();
            updateRegistrationForm();
            break;
        case 'super_admin':
            await Promise.all([
                loadVerificationQueue(),
                loadAllRegistrations(),
                loadSellers(),
                loadStatistics(),
                loadAdmins()
            ]);
            updateRegistrationForm();
            break;
        case 'admin':
            if (currentUser.is_gate_overseer) {
                await Promise.all([
                    loadAdminRegistrations(),
                    loadAdminSellerStats(),
                    loadStatistics(),
                    loadOverseerGates()
                ]);
            } else {
                await Promise.all([
                    loadAdminRegistrations(),
                    loadAdminSellerStats(),
                    loadStatistics()
                ]);
            }
            break;
        case 'entry_marshall':
            await loadEntryStats();
            break;
    }
}

// =====================================================
// SETTINGS MANAGEMENT
// =====================================================

async function loadSettings() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*');
        
        if (error) throw error;
        
        // Convert to key-value object
        settings = {};
        data.forEach(s => {
            settings[s.setting_key] = s.setting_value;
        });
        
        // Update UI with settings
        updateUIWithSettings();
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function updateUIWithSettings() {
    // Update entry type options with prices
    const stagPrice = settings.stag_price || '2750';
    const couplePrice = settings.couple_price || '4750';
    
    const entryTypeSelect = document.getElementById('entryType');
    if (entryTypeSelect) {
        entryTypeSelect.innerHTML = `
            <option value="">Select entry type</option>
            <option value="stag">Stag - ₹${stagPrice}</option>
            <option value="couple">Couple - ₹${couplePrice}</option>
        `;
    }
    
    // Update UPI display for sellers
    const upiDisplay = document.getElementById('displayUpiId');
    if (upiDisplay) {
        upiDisplay.textContent = settings.upi_id || 'Not configured';
    }
    
    // Update Payment QR Code display for sellers
    const paymentQRDisplay = document.getElementById('paymentQRDisplay');
    const sellerQRImage = document.getElementById('sellerQRImage');
    const downloadQRBtn = document.getElementById('downloadQRBtnContainer');
    
    if (paymentQRDisplay && sellerQRImage && settings.payment_qr_code) {
        sellerQRImage.src = settings.payment_qr_code;
        paymentQRDisplay.classList.remove('hidden');
        if (downloadQRBtn) downloadQRBtn.classList.remove('hidden');
    } else if (paymentQRDisplay) {
        paymentQRDisplay.classList.add('hidden');
        if (downloadQRBtn) downloadQRBtn.classList.add('hidden');
    }
    
    // Update Bank Details display for sellers
    const bankDisplay = document.getElementById('paymentBankDisplay');
    const bankDetails = document.getElementById('displayBankDetails');
    if (bankDisplay && bankDetails && settings.bank_details) {
        bankDetails.textContent = settings.bank_details;
        bankDisplay.classList.remove('hidden');
    } else if (bankDisplay) {
        bankDisplay.classList.add('hidden');
    }
    
    // Update settings form if super admin
    if (currentUser?.role === 'super_admin') {
        document.querySelectorAll('#settingsForm [data-key]').forEach(input => {
            const key = input.dataset.key;
            if (settings[key] !== undefined) {
                input.value = settings[key];
            }
        });
        
        // Show QR code preview in settings
        const qrPreview = document.getElementById('qrCodePreview');
        const qrImage = document.getElementById('qrCodeImage');
        const qrUploadArea = document.getElementById('qrCodeUploadArea');
        
        if (qrPreview && qrImage && settings.payment_qr_code) {
            qrImage.src = settings.payment_qr_code;
            qrPreview.classList.remove('hidden');
            if (qrUploadArea) qrUploadArea.classList.add('hidden');
        } else if (qrPreview) {
            qrPreview.classList.add('hidden');
            if (qrUploadArea) qrUploadArea.classList.remove('hidden');
        }
    }
}

async function saveSettings(e) {
    e.preventDefault();
    
    try {
        const updates = [];
        document.querySelectorAll('#settingsForm [data-key]').forEach(input => {
            updates.push({
                setting_key: input.dataset.key,
                setting_value: input.value,
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            });
        });
        
        for (const update of updates) {
            const { error } = await supabase
                .from('settings')
                .update({ 
                    setting_value: update.setting_value,
                    updated_at: update.updated_at,
                    updated_by: update.updated_by
                })
                .eq('setting_key', update.setting_key);
            
            if (error) throw error;
        }
        
        await loadSettings();
        showToast('Settings saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Failed to save settings', 'error');
    }
}

// Payment QR Code Upload Handler
window.handleQRCodeUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be less than 2MB', 'error');
        return;
    }
    
    try {
        showToast('Uploading QR code...', 'info');
        
        // Convert to base64
        const base64 = await fileToBase64(file);
        
        // Save to settings
        const { error } = await supabase
            .from('settings')
            .upsert({ 
                setting_key: 'payment_qr_code',
                setting_value: base64,
                description: 'Payment QR Code image (base64)',
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            }, { onConflict: 'setting_key' });
        
        if (error) throw error;
        
        // Reload settings to update UI
        await loadSettings();
        showToast('Payment QR Code uploaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error uploading QR code:', error);
        showToast('Failed to upload QR code', 'error');
    }
    
    // Clear the input
    event.target.value = '';
};

// Remove Payment QR Code
window.removePaymentQR = async function() {
    if (!confirm('Remove the Payment QR Code?')) return;
    
    try {
        const { error } = await supabase
            .from('settings')
            .update({ 
                setting_value: '',
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            })
            .eq('setting_key', 'payment_qr_code');
        
        if (error) throw error;
        
        await loadSettings();
        showToast('Payment QR Code removed', 'success');
        
    } catch (error) {
        console.error('Error removing QR code:', error);
        showToast('Failed to remove QR code', 'error');
    }
};

// Share Payment Info via WhatsApp (for Sellers)
window.sharePaymentInfo = function() {
    const eventName = settings.event_name || 'Vamos Festa';
    const upiId = settings.upi_id || '';
    const bankDetails = settings.bank_details || '';
    const stagPrice = settings.stag_price || '2750';
    const couplePrice = settings.couple_price || '4750';
    
    let message = `🎸 *${eventName.toUpperCase()}* 🎸\n`;
    message += `_Harmony for Humanity_\n\n`;
    message += `💰 *PAYMENT INFORMATION*\n\n`;
    
    message += `🎫 *Ticket Prices:*\n`;
    message += `• Stag: ₹${parseInt(stagPrice).toLocaleString()}\n`;
    message += `• Couple: ₹${parseInt(couplePrice).toLocaleString()}\n\n`;
    
    if (upiId) {
        message += `📱 *UPI ID:*\n`;
        message += `\`${upiId}\`\n\n`;
    }
    
    if (bankDetails) {
        message += `🏦 *Bank Transfer:*\n`;
        message += `${bankDetails}\n\n`;
    }
    
    if (settings.payment_qr_code) {
        message += `📲 *QR Code:* I'll send the payment QR code separately.\n\n`;
    }
    
    message += `✅ After payment, please share:\n`;
    message += `• Your Name\n`;
    message += `• Mobile Number\n`;
    message += `• Payment Screenshot/UTR\n\n`;
    
    message += `Thank you! 🎵`;
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    // If QR code exists, prompt to download it
    if (settings.payment_qr_code) {
        setTimeout(() => {
            if (confirm('Would you like to download the Payment QR Code to share separately?')) {
                downloadPaymentQR();
            }
        }, 500);
    }
};

// Download Payment QR Code (for Sellers to share)
window.downloadPaymentQR = function() {
    if (!settings.payment_qr_code) {
        showToast('No Payment QR Code available', 'error');
        return;
    }
    
    try {
        const link = document.createElement('a');
        link.download = 'vamosfesta-payment-qr.png';
        link.href = settings.payment_qr_code;
        link.click();
        showToast('QR Code downloaded!', 'success');
    } catch (error) {
        console.error('Error downloading QR:', error);
        showToast('Failed to download QR code', 'error');
    }
};

// Helper function to convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// =====================================================
// AUTHENTICATION
// =====================================================

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .eq('is_active', true);
        
        if (error) throw error;
        
        if (!users || users.length === 0) {
            throw new Error('Invalid username or password');
        }
        
        currentUser = users[0];
        sessionStorage.setItem('vamosfesta_user', JSON.stringify(currentUser));
        
        errorDiv.classList.add('hidden');
        await initializeApp();
        
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed';
        errorDiv.classList.remove('hidden');
    }
}

function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('vamosfesta_user');
    document.body.className = 'vamosfesta-bg';
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginForm').reset();
}

// =====================================================
// NAVIGATION
// =====================================================

function showTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active from all nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.classList.add('secondary');
    });
    
    // Remove active from all mobile menu items
    document.querySelectorAll('.mobile-menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected tab - check both with and without 'tab-' prefix
    let targetTab = document.getElementById(`tab-${tabId}`);
    if (!targetTab) {
        targetTab = document.getElementById(tabId);
    }
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }
    
    // Activate nav button
    const navBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (navBtn) {
        navBtn.classList.add('active');
        navBtn.classList.remove('secondary');
    }
    
    // Activate mobile menu item
    const mobileItem = document.querySelector(`.mobile-menu-item[data-tab="${tabId}"]`);
    if (mobileItem) {
        mobileItem.classList.add('active');
    }
    
    // Refresh data for certain tabs
    refreshTabData(tabId);
}

async function refreshTabData(tabId) {
    switch(tabId) {
        case 'verification-queue':
            await loadVerificationQueue();
            break;
        case 'all-registrations':
            await loadAllRegistrations();
            break;
        case 'my-sales':
            await loadMySales();
            break;
        case 'seller-management':
            await loadSellers();
            break;
        case 'admin-management':
            await loadAdmins();
            break;
        case 'overseer-management':
            await loadOverseerGates();
            break;
        case 'statistics':
            await loadStatistics();
            break;
        case 'view-registrations':
            await loadAdminRegistrations();
            break;
        case 'view-sellers':
            await loadAdminSellerStats();
            break;
        case 'entry-scan':
            await loadEntryStats();
            break;
        case 'gate-management':
            await loadGateManagement();
            break;
    }
}

// =====================================================
// SELLER: REGISTRATION FORM
// =====================================================

function updateRegistrationForm() {
    const entryType = document.getElementById('entryType');
    const paymentMode = document.getElementById('paymentMode');
    const priceDisplay = document.getElementById('priceDisplay');
    const ticketPrice = document.getElementById('ticketPrice');
    const paymentRefSection = document.getElementById('paymentRefSection');
    const paymentReference = document.getElementById('paymentReference');
    const refLabel = document.getElementById('refLabel');
    
    // Update price display
    if (entryType.value) {
        const price = entryType.value === 'stag' 
            ? (settings.stag_price || '2750') 
            : (settings.couple_price || '4750');
        ticketPrice.textContent = price;
        priceDisplay.classList.remove('hidden');
    } else {
        priceDisplay.classList.add('hidden');
    }
    
    // Show/hide payment reference based on mode
    if (paymentMode.value === 'upi' || paymentMode.value === 'bank_transfer') {
        paymentRefSection.classList.remove('hidden');
        paymentReference.required = true;
        refLabel.textContent = paymentMode.value === 'upi' ? 'UTR Number' : 'Transaction Reference';
    } else {
        paymentRefSection.classList.add('hidden');
        paymentReference.required = false;
    }
}

async function handleRegistration(e) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
    
    try {
        const entryType = document.getElementById('entryType').value;
        const ticketPrice = entryType === 'stag' 
            ? parseInt(settings.stag_price || 2750) 
            : parseInt(settings.couple_price || 4750);
        
        const guestData = {
            guest_name: document.getElementById('guestName').value.trim(),
            mobile_number: document.getElementById('guestMobile').value.trim(),
            entry_type: entryType,
            payment_mode: document.getElementById('paymentMode').value,
            payment_reference: document.getElementById('paymentReference')?.value.trim() || null,
            ticket_price: ticketPrice,
            registered_by: currentUser.id,
            status: 'pending_verification'
        };
        
        const { data, error } = await supabase
            .from('guests')
            .insert([guestData])
            .select();
        
        if (error) throw error;
        
        // Reset form
        e.target.reset();
        document.getElementById('priceDisplay').classList.add('hidden');
        document.getElementById('paymentRefSection').classList.add('hidden');
        
        showToast('Registration submitted successfully!', 'success');
        
        // Refresh my sales
        await loadMySales();
        
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Failed to submit registration: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Submit Registration';
    }
}

// =====================================================
// SELLER: MY SALES
// =====================================================

async function loadMySales() {
    try {
        const { data: guests, error } = await supabase
            .from('guests')
            .select('*')
            .eq('registered_by', currentUser.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Update stats
        const total = guests.length;
        const pending = guests.filter(g => g.status === 'pending_verification').length;
        const verified = guests.filter(g => !['pending_verification', 'rejected'].includes(g.status)).length;
        const totalAmount = guests
            .filter(g => !['pending_verification', 'rejected'].includes(g.status))
            .reduce((sum, g) => sum + (g.ticket_price || 0), 0);
        
        document.getElementById('myTotalCount').textContent = total;
        document.getElementById('myPendingCount').textContent = pending;
        document.getElementById('myVerifiedCount').textContent = verified;
        document.getElementById('myTotalAmount').textContent = `₹${totalAmount.toLocaleString()}`;
        
        // Render card list (simplified: Name & Phone only)
        const cardList = document.getElementById('mySalesCardList');
        if (guests.length === 0) {
            cardList.innerHTML = '<p class="text-center py-8 text-gray-500">No registrations yet</p>';
            return;
        }
        
        // Store guests data for modal access
        window.mySalesData = guests;
        
        cardList.innerHTML = guests.map(g => `
            <div class="guest-card bg-gray-800/50 rounded-lg p-4 border border-gray-700 cursor-pointer hover:border-yellow-600/50 transition-all" 
                 onclick="showGuestDetailModal('${g.id}', 'sales')">
                <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-white truncate">${escapeHtml(g.guest_name)}</h4>
                        <p class="text-sm text-gray-400">${g.mobile_number}</p>
                    </div>
                    <div class="flex items-center gap-2 ml-3">
                        ${getStatusBadgeSmall(g.status)}
                        <i class="fas fa-chevron-right text-gray-500"></i>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading my sales:', error);
    }
}

// =====================================================
// SUPER ADMIN: VERIFICATION QUEUE
// =====================================================

async function loadVerificationQueue(filter = 'all') {
    try {
        let query = supabase
            .from('guests')
            .select(`
                *,
                seller:registered_by(username, full_name)
            `)
            .eq('status', 'pending_verification')
            .order('created_at', { ascending: true });
        
        if (filter !== 'all') {
            query = query.eq('payment_mode', filter);
        }
        
        const { data: guests, error } = await query;
        
        if (error) throw error;
        
        // Update pending badge
        const pendingBadge = document.getElementById('pendingBadge');
        const mobilePendingBadge = document.getElementById('mobilePendingBadge');
        if (pendingBadge) {
            pendingBadge.textContent = guests.length;
            pendingBadge.style.display = guests.length > 0 ? 'inline' : 'none';
        }
        if (mobilePendingBadge) {
            mobilePendingBadge.textContent = guests.length;
            mobilePendingBadge.style.display = guests.length > 0 ? 'inline' : 'none';
        }
        
        const container = document.getElementById('verificationQueueList');
        if (guests.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">No pending verifications 🎉</p>';
            return;
        }
        
        // Store guests data for modal access
        window.verificationGuestsData = guests;
        
        container.innerHTML = guests.map(g => `
            <div class="guest-card bg-gray-800/50 rounded-lg p-4 border border-gray-700 cursor-pointer hover:border-yellow-600/50 transition-all" 
                 onclick="showGuestDetailModal('${g.id}', 'verification')" data-payment="${g.payment_mode}">
                <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-white truncate">${escapeHtml(g.guest_name)}</h4>
                        <p class="text-sm text-gray-400">${g.mobile_number}</p>
                    </div>
                    <div class="flex items-center gap-2 ml-3">
                        <span class="px-2 py-1 rounded text-xs ${g.payment_mode === 'cash' ? 'bg-green-900/50 text-green-400' : g.payment_mode === 'upi' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}">
                            ${g.payment_mode === 'cash' ? '💵' : g.payment_mode === 'upi' ? '📱' : '🏦'} ${g.payment_mode.toUpperCase()}
                        </span>
                        <span class="text-yellow-400 font-bold">₹${g.ticket_price?.toLocaleString()}</span>
                        <i class="fas fa-chevron-right text-gray-500"></i>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading verification queue:', error);
    }
}

// Show Guest Detail Modal (mobile-optimized)
window.showGuestDetailModal = async function(guestId, source = 'all') {
    try {
        const { data: guest, error } = await supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .eq('id', guestId)
            .single();
        
        if (error) throw error;
        
        const isVerification = source === 'verification';
        
        let actionButtons = '';
        if (isVerification) {
            // Verification queue actions
            actionButtons = `
                <div class="flex gap-2 mt-4">
                    <button onclick="closeModal('guestDetailModal'); showVerifyModal('${guest.id}')" class="vamosfesta-button success flex-1 py-3">
                        <i class="fas fa-check mr-2"></i>Verify Payment
                    </button>
                    <button onclick="closeModal('guestDetailModal'); quickReject('${guest.id}')" class="vamosfesta-button danger flex-1 py-3">
                        <i class="fas fa-times mr-2"></i>Reject
                    </button>
                </div>
            `;
        } else {
            // All guests actions based on status
            if (guest.status === 'pending_verification') {
                actionButtons = `
                    <div class="flex gap-2 mt-4">
                        <button onclick="closeModal('guestDetailModal'); showVerifyModal('${guest.id}')" class="vamosfesta-button success flex-1 py-3">
                            <i class="fas fa-check mr-2"></i>Verify
                        </button>
                        <button onclick="closeModal('guestDetailModal'); quickReject('${guest.id}')" class="vamosfesta-button danger flex-1 py-3">
                            <i class="fas fa-times mr-2"></i>Reject
                        </button>
                    </div>
                `;
            } else if (['payment_verified', 'pass_generated'].includes(guest.status)) {
                actionButtons = `
                    <button onclick="closeModal('guestDetailModal'); generateAndShowPass('${guest.id}')" class="vamosfesta-button w-full py-3 mt-4">
                        <i class="fas fa-qrcode mr-2"></i>Generate & Send Pass
                    </button>
                `;
            } else if (guest.status === 'pass_sent') {
                actionButtons = `
                    <button onclick="closeModal('guestDetailModal'); resendPass('${guest.id}')" class="vamosfesta-button w-full py-3 mt-4">
                        <i class="fab fa-whatsapp mr-2"></i>Resend Pass
                    </button>
                `;
            }
        }
        
        const content = `
            <!-- Guest Info Header -->
            <div class="text-center mb-4 pb-4 border-b border-gray-700">
                <div class="w-16 h-16 mx-auto rounded-full bg-yellow-600/20 flex items-center justify-center mb-3">
                    <i class="fas fa-user text-yellow-400 text-2xl"></i>
                </div>
                <h4 class="text-xl font-bold text-white">${escapeHtml(guest.guest_name)}</h4>
                <p class="text-gray-400">${guest.mobile_number}</p>
                <div class="mt-2">${getStatusBadge(guest.status)}</div>
            </div>
            
            <!-- Guest Details -->
            <div class="space-y-3">
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Entry Type</span>
                    <span class="font-semibold capitalize">${guest.entry_type}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Amount</span>
                    <span class="font-bold text-yellow-400">₹${guest.ticket_price?.toLocaleString()}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Payment Mode</span>
                    <span>${formatPaymentMode(guest.payment_mode)}</span>
                </div>
                ${guest.payment_reference ? `
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Reference</span>
                    <span class="font-mono text-sm text-blue-400">${guest.payment_reference}</span>
                </div>
                ` : ''}
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Registered By</span>
                    <span>${guest.seller?.full_name || guest.seller?.username || '-'}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Registered On</span>
                    <span class="text-sm">${formatDate(guest.created_at)}</span>
                </div>
                ${guest.is_inside_venue !== undefined ? `
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Venue Status</span>
                    <span class="${guest.is_inside_venue ? 'text-green-400' : 'text-gray-400'}">
                        ${guest.is_inside_venue ? '🟢 Inside Venue' : '⚪ Outside'}
                    </span>
                </div>
                ` : ''}
                ${guest.entry_count > 0 ? `
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Entry Count</span>
                    <span>${guest.entry_count} time(s)</span>
                </div>
                ` : ''}
            </div>
            
            ${actionButtons}
            
            <button onclick="closeModal('guestDetailModal')" class="vamosfesta-button secondary w-full py-3 mt-3">
                Close
            </button>
        `;
        
        document.getElementById('guestDetailContent').innerHTML = content;
        openModal('guestDetailModal');
        
    } catch (error) {
        console.error('Error loading guest details:', error);
        showToast('Failed to load guest details', 'error');
    }
};

window.showVerifyModal = async function(guestId) {
    try {
        const { data: guest, error } = await supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .eq('id', guestId)
            .single();
        
        if (error) throw error;
        
        document.getElementById('verifyGuestId').value = guestId;
        document.getElementById('verifyGuestInfo').innerHTML = `
            <div class="space-y-2">
                <div class="flex justify-between">
                    <span class="text-gray-400">Guest:</span>
                    <span class="font-semibold">${escapeHtml(guest.guest_name)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">Mobile:</span>
                    <span>${guest.mobile_number}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">Entry:</span>
                    <span class="capitalize">${guest.entry_type}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">Amount:</span>
                    <span class="text-yellow-400 font-bold">₹${guest.ticket_price?.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">Payment:</span>
                    <span>${formatPaymentMode(guest.payment_mode)}</span>
                </div>
                ${guest.payment_reference ? `
                <div class="flex justify-between">
                    <span class="text-gray-400">Reference:</span>
                    <span class="font-mono text-sm">${guest.payment_reference}</span>
                </div>
                ` : ''}
                <div class="flex justify-between">
                    <span class="text-gray-400">Seller:</span>
                    <span>${guest.seller?.full_name || guest.seller?.username}</span>
                </div>
            </div>
        `;
        
        document.getElementById('verifyNotes').value = '';
        openModal('verifyModal');
        
    } catch (error) {
        console.error('Error loading guest for verification:', error);
        showToast('Failed to load guest details', 'error');
    }
};

async function handleVerification(e) {
    e.preventDefault();
    
    const guestId = document.getElementById('verifyGuestId').value;
    const notes = document.getElementById('verifyNotes').value;
    
    try {
        const { error } = await supabase
            .from('guests')
            .update({
                status: 'payment_verified',
                verified_by: currentUser.id,
                verified_at: new Date().toISOString(),
                verification_notes: notes || null
            })
            .eq('id', guestId);
        
        if (error) throw error;
        
        closeModal('verifyModal');
        showToast('Payment verified successfully!', 'success');
        await loadVerificationQueue();
        
        // Ask to generate pass
        if (confirm('Generate and send guest pass now?')) {
            await generateAndShowPass(guestId);
        }
        
    } catch (error) {
        console.error('Error verifying payment:', error);
        showToast('Failed to verify payment', 'error');
    }
}

window.rejectPayment = async function() {
    const guestId = document.getElementById('verifyGuestId').value;
    const notes = document.getElementById('verifyNotes').value;
    
    if (!confirm('Are you sure you want to reject this payment?')) return;
    
    try {
        const { error } = await supabase
            .from('guests')
            .update({
                status: 'rejected',
                verified_by: currentUser.id,
                verified_at: new Date().toISOString(),
                verification_notes: notes || 'Payment rejected'
            })
            .eq('id', guestId);
        
        if (error) throw error;
        
        closeModal('verifyModal');
        showToast('Payment rejected', 'warning');
        await loadVerificationQueue();
        
    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Failed to reject payment', 'error');
    }
};

window.quickReject = async function(guestId) {
    if (!confirm('Reject this registration?')) return;
    
    try {
        const { error } = await supabase
            .from('guests')
            .update({
                status: 'rejected',
                verified_by: currentUser.id,
                verified_at: new Date().toISOString(),
                verification_notes: 'Quick rejected'
            })
            .eq('id', guestId);
        
        if (error) throw error;
        
        showToast('Registration rejected', 'warning');
        await loadVerificationQueue();
        
    } catch (error) {
        console.error('Error rejecting:', error);
        showToast('Failed to reject', 'error');
    }
};

// =====================================================
// SUPER ADMIN: ALL REGISTRATIONS
// =====================================================

let allRegistrationsCache = [];
let currentStatusFilter = 'all';

async function loadAllRegistrations(statusFilter = 'all') {
    currentStatusFilter = statusFilter;
    
    try {
        let query = supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .order('created_at', { ascending: false });
        
        if (statusFilter !== 'all') {
            // Handle combined filters
            if (statusFilter === 'verified') {
                // Verified includes payment_verified and pass_generated
                query = query.in('status', ['payment_verified', 'pass_generated']);
            } else {
                query = query.eq('status', statusFilter);
            }
        }
        
        const { data: guests, error } = await query;
        
        if (error) throw error;
        
        allRegistrationsCache = guests;
        renderAllRegistrations(guests);
        
    } catch (error) {
        console.error('Error loading all registrations:', error);
    }
}

function renderAllRegistrations(guests) {
    const container = document.getElementById('allRegistrationsList');
    const countDisplay = document.getElementById('guestCountDisplay');
    
    if (countDisplay) {
        countDisplay.textContent = `Showing ${guests.length} guest${guests.length !== 1 ? 's' : ''}`;
    }
    
    if (guests.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No registrations found</p>';
        return;
    }
    
    // Store guests data for modal access
    window.allGuestsData = guests;
    
    container.innerHTML = guests.map(g => `
        <div class="guest-card bg-gray-800/50 rounded-lg p-4 border border-gray-700 cursor-pointer hover:border-yellow-600/50 transition-all" 
             onclick="showGuestDetailModal('${g.id}', 'all')">
            <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                    <h4 class="font-semibold text-white truncate">${escapeHtml(g.guest_name)}</h4>
                    <p class="text-sm text-gray-400">${g.mobile_number}</p>
                </div>
                <div class="flex items-center gap-2 ml-3">
                    ${getStatusBadgeSmall(g.status)}
                    <i class="fas fa-chevron-right text-gray-500"></i>
                </div>
            </div>
        </div>
    `).join('');
}

function getStatusBadgeSmall(status) {
    const badges = {
        'pending_verification': '<span class="px-2 py-1 rounded text-xs bg-orange-900/50 text-orange-400">Pending</span>',
        'payment_verified': '<span class="px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-400">Verified</span>',
        'pass_generated': '<span class="px-2 py-1 rounded text-xs bg-purple-900/50 text-purple-400">Pass Ready</span>',
        'pass_sent': '<span class="px-2 py-1 rounded text-xs bg-green-900/50 text-green-400">Pass Sent</span>',
        'checked_in': '<span class="px-2 py-1 rounded text-xs bg-emerald-900/50 text-emerald-400">Checked In</span>',
        'rejected': '<span class="px-2 py-1 rounded text-xs bg-red-900/50 text-red-400">Rejected</span>'
    };
    return badges[status] || '<span class="px-2 py-1 rounded text-xs bg-gray-700 text-gray-400">Unknown</span>';
}

function getActionButtons(guest) {
    const buttons = [];
    
    if (guest.status === 'pending_verification') {
        buttons.push(`<button onclick="showVerifyModal('${guest.id}')" class="vamosfesta-button success text-xs py-1 px-2" title="Verify"><i class="fas fa-check"></i></button>`);
    }
    
    if (['payment_verified', 'pass_generated'].includes(guest.status)) {
        buttons.push(`<button onclick="generateAndShowPass('${guest.id}')" class="vamosfesta-button text-xs py-1 px-2" title="Generate Pass"><i class="fas fa-qrcode"></i></button>`);
    }
    
    if (guest.status === 'pass_sent') {
        buttons.push(`<button onclick="resendPass('${guest.id}')" class="vamosfesta-button secondary text-xs py-1 px-2" title="Resend"><i class="fab fa-whatsapp"></i></button>`);
    }
    
    return buttons.join(' ') || '-';
}

// =====================================================
// PASS GENERATION & WHATSAPP
// =====================================================

window.generateAndShowPass = async function(guestId) {
    try {
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*')
            .eq('id', guestId)
            .single();
        
        if (error) throw error;
        
        currentGuestForPass = guest;
        
        // Generate QR Code
        const qrData = JSON.stringify({
            id: guest.id,
            name: guest.guest_name,
            type: guest.entry_type,
            ts: Date.now()
        });
        
        const qrCodeDataURL = await QRCode.toDataURL(qrData, {
            width: 200,
            margin: 2,
            color: { dark: '#0a0a0a', light: '#ffffff' }
        });
        
        // Render pass preview
        const eventName = settings.event_name || 'Vamos Festa';
        const eventTagline = settings.event_tagline || 'Harmony for Humanity';
        const eventDate = settings.event_date || 'TBD';
        const eventVenue = settings.event_venue || 'TBD';
        
        document.getElementById('guestPassPreview').innerHTML = `
            <div id="passForDownload" style="
                width: 100%;
                max-width: 400px;
                margin: 0 auto;
                padding: 20px;
                background: linear-gradient(135deg, #0a0a0a, #1a1a1a);
                border: 4px solid #d4a853;
                border-radius: 16px;
                color: white;
                font-family: Arial, sans-serif;
            ">
                <div style="text-align: center; border-bottom: 2px solid #d4a853; padding-bottom: 15px; margin-bottom: 15px;">
                    <div style="background: linear-gradient(135deg, #d4a853, #f5d76e); padding: 8px 0; margin: -20px -20px 10px; border-radius: 12px 12px 0 0;">
                        <h1 style="
                            font-size: 28px;
                            font-weight: bold;
                            margin: 0;
                            color: #0a0a0a;
                            letter-spacing: 3px;
                            text-shadow: 1px 1px 2px rgba(255,255,255,0.3);
                        ">${eventName.toUpperCase()}</h1>
                    </div>
                    <p style="color: #d4a853; font-size: 12px; letter-spacing: 2px; margin: 5px 0 0;">${eventTagline}</p>
                    <p style="color: #f5d76e; font-size: 18px; margin: 10px 0 0;">🎫 GUEST PASS</p>
                </div>
                
                <div style="display: flex; gap: 20px;">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 12px;">
                            <p style="color: #d4a853; font-size: 11px; margin: 0;">NAME</p>
                            <p style="font-size: 18px; font-weight: bold; margin: 2px 0 0;">${escapeHtml(guest.guest_name)}</p>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <p style="color: #d4a853; font-size: 11px; margin: 0;">MOBILE</p>
                            <p style="font-size: 16px; margin: 2px 0 0;">${guest.mobile_number}</p>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <p style="color: #d4a853; font-size: 11px; margin: 0;">ENTRY TYPE</p>
                            <p style="font-size: 16px; font-weight: bold; margin: 2px 0 0; text-transform: uppercase;">${guest.entry_type}</p>
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <div style="background: white; padding: 8px; border-radius: 8px; border: 2px solid #d4a853;">
                            <img src="${qrCodeDataURL}" alt="QR Code" style="width: 120px; height: 120px;">
                        </div>
                        <p style="color: #888; font-size: 10px; margin-top: 5px;">Scan at entry</p>
                    </div>
                </div>
                
                <div style="border-top: 2px solid #d4a853; margin-top: 15px; padding-top: 15px; text-align: center;">
                    <p style="color: #d4a853; font-size: 12px; margin: 0;">📅 ${eventDate}</p>
                    <p style="color: #d4a853; font-size: 12px; margin: 5px 0 0;">📍 ${eventVenue}</p>
                </div>
                
                <div style="text-align: center; margin-top: 15px; color: #666; font-size: 20px;">
                    🎸 🎵 🎸 🎵 🎸
                </div>
            </div>
        `;
        
        // Update guest status
        await supabase
            .from('guests')
            .update({
                status: 'pass_generated',
                pass_generated_at: new Date().toISOString()
            })
            .eq('id', guestId);
        
        openModal('passModal');
        
    } catch (error) {
        console.error('Error generating pass:', error);
        showToast('Failed to generate pass', 'error');
    }
};

window.sendWhatsApp = async function() {
    if (!currentGuestForPass) return;
    
    try {
        // Download pass first
        await downloadPass();
        
        // Format phone number
        let phone = currentGuestForPass.mobile_number.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        
        const eventName = settings.event_name || 'Vamos Festa';
        const eventDate = settings.event_date || 'TBD';
        const eventVenue = settings.event_venue || 'TBD';
        
        const message = `🎸 *${eventName.toUpperCase()} - GUEST PASS* 🎸

Hello ${currentGuestForPass.guest_name}!

Your registration is confirmed! ✅

📋 *Details:*
• Name: ${currentGuestForPass.guest_name}
• Entry: ${currentGuestForPass.entry_type.toUpperCase()}
• Mobile: ${currentGuestForPass.mobile_number}

📅 Date: ${eventDate}
📍 Venue: ${eventVenue}

Please show this pass and QR code at the entrance.

See you at the event! 🎵

_Harmony for Humanity_`;
        
        const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        
        // Update status
        await supabase
            .from('guests')
            .update({
                status: 'pass_sent',
                pass_sent_at: new Date().toISOString()
            })
            .eq('id', currentGuestForPass.id);
        
        closeModal('passModal');
        showToast('Pass sent via WhatsApp!', 'success');
        
        // Refresh data
        await loadAllRegistrations(currentStatusFilter);
        
    } catch (error) {
        console.error('Error sending WhatsApp:', error);
        showToast('Failed to send WhatsApp', 'error');
    }
};

window.downloadPass = async function() {
    const passElement = document.getElementById('passForDownload');
    if (!passElement || !currentGuestForPass) return;
    
    try {
        const canvas = await html2canvas(passElement, {
            backgroundColor: '#0a0a0a',
            scale: 2
        });
        
        const link = document.createElement('a');
        link.download = `vamosfesta-pass-${currentGuestForPass.guest_name.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
    } catch (error) {
        console.error('Error downloading pass:', error);
        showToast('Failed to download pass', 'error');
    }
};

window.resendPass = async function(guestId) {
    await generateAndShowPass(guestId);
};

// =====================================================
// SUPER ADMIN: SELLER MANAGEMENT
// =====================================================

async function loadSellers() {
    try {
        // Get all users
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (userError) throw userError;
        
        // Get seller stats
        const { data: stats, error: statsError } = await supabase
            .from('seller_stats')
            .select('*');
        
        // Merge data
        const usersWithStats = users.map(u => {
            const stat = stats?.find(s => s.seller_id === u.id) || {};
            return { ...u, ...stat };
        });
        
        const tbody = document.getElementById('sellersTableBody');
        tbody.innerHTML = usersWithStats.map(u => `
            <tr>
                <td class="font-semibold">${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.full_name || '-')}</td>
                <td>${u.mobile_number || '-'}</td>
                <td class="text-sm">
                    ${u.club_name ? `<span class="text-yellow-400">${escapeHtml(u.club_name)}</span>` : ''}
                    ${u.club_number ? `<br><span class="text-gray-500 text-xs">#${escapeHtml(u.club_number)}</span>` : ''}
                    ${!u.club_name && !u.club_number ? '-' : ''}
                </td>
                <td><span class="role-badge role-${u.role}">${formatRole(u.role)}</span></td>
                <td>${u.total_registrations || 0}</td>
                <td class="text-green-400">₹${(u.total_verified_amount || 0).toLocaleString()}</td>
                <td>
                    <span class="text-xs px-2 py-1 rounded ${u.is_active ? 'bg-green-600' : 'bg-red-600'}">
                        ${u.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button onclick="editUser('${u.id}')" class="vamosfesta-button secondary text-xs py-1 px-2 mr-1">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="toggleUserStatus('${u.id}', ${!u.is_active})" class="vamosfesta-button ${u.is_active ? 'danger' : 'success'} text-xs py-1 px-2">
                        <i class="fas fa-${u.is_active ? 'ban' : 'check'}"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading sellers:', error);
    }
}

// =====================================================
// USERNAME NAMING PROTOCOL
// =====================================================

const ROLE_CONFIG = {
    'super_admin': { 
        prefix: 'SuperAdmin', 
        icon: '👑', 
        desc: 'Full system access, back office',
        reportsTo: 'Organization',
        color: 'border-yellow-500',
        dbRole: 'super_admin'
    },
    'admin': { 
        prefix: 'Admin', 
        icon: '📊', 
        desc: 'Read-only access to reports',
        reportsTo: 'Super Admin',
        color: 'border-blue-500',
        dbRole: 'admin'
    },
    'gate_overseer': { 
        prefix: 'GateOverseer', 
        icon: '🚪', 
        desc: 'Manages marshalls & venue sellers',
        reportsTo: 'Super Admin',
        color: 'border-cyan-500',
        dbRole: 'admin',
        flags: { is_gate_overseer: true }
    },
    'presales_seller': { 
        prefix: 'PreSales', 
        icon: '🎫', 
        desc: 'Pre-event ticket sales (off-site)',
        reportsTo: 'Super Admin',
        color: 'border-green-500',
        dbRole: 'seller'
    },
    'event_seller': { 
        prefix: 'EventSales', 
        icon: '🎟️', 
        desc: 'Venue ticket sales',
        reportsTo: 'Gate Overseer',
        color: 'border-green-400',
        dbRole: 'seller'
    },
    'entry_marshall': { 
        prefix: 'Marshall', 
        icon: '🚧', 
        desc: 'Scans guest passes at gates',
        reportsTo: 'Gate Overseer',
        color: 'border-yellow-400',
        dbRole: 'entry_marshall'
    },
    'siptoken_overseer': { 
        prefix: 'TokenOverseer', 
        icon: '👔', 
        desc: 'Manages token sales & barmen',
        reportsTo: 'Super Admin',
        color: 'border-purple-500',
        dbRole: 'admin',
        flags: { is_siptoken_overseer: true }
    },
    'token_sales': { 
        prefix: 'TokenSales', 
        icon: '💰', 
        desc: 'Sells SipTokens to guests',
        reportsTo: 'SipToken Overseer',
        color: 'border-orange-500',
        dbRole: 'seller',
        flags: { is_siptoken_sales: true }
    },
    'barman': { 
        prefix: 'BevServe', 
        icon: '🍹', 
        desc: 'Serves drinks, scans order QR',
        reportsTo: 'SipToken Overseer',
        color: 'border-purple-400',
        dbRole: 'seller',
        flags: { is_barman: true }
    }
};

// Update role selection - show preview and update username
window.updateRoleSelection = function() {
    const select = document.getElementById('userRoleSelect');
    const role = select.value;
    const previewCard = document.getElementById('rolePreviewCard');
    
    if (!role) {
        previewCard.classList.add('hidden');
        document.getElementById('usernamePrefix').textContent = '---';
        document.getElementById('usernameValue').textContent = '---';
        return;
    }
    
    const config = ROLE_CONFIG[role];
    if (!config) return;
    
    // Update preview card
    previewCard.classList.remove('hidden');
    previewCard.className = `card border-2 ${config.color}`;
    document.getElementById('rolePreviewIcon').textContent = config.icon;
    document.getElementById('rolePreviewTitle').textContent = select.options[select.selectedIndex].text;
    document.getElementById('rolePreviewDesc').textContent = config.desc;
    document.getElementById('roleReportsTo').textContent = config.reportsTo;
    
    // Update username prefix
    document.getElementById('usernamePrefix').textContent = config.prefix;
    
    // Regenerate username
    generateUsername();
};

// Generate username from prefix + first name
window.generateUsername = function() {
    const roleSelect = document.getElementById('userRoleSelect');
    const firstNameInput = document.getElementById('userFirstName');
    const role = roleSelect?.value;
    const firstName = firstNameInput?.value?.trim();
    
    if (!role || !firstName) {
        document.getElementById('usernameValue').textContent = firstName || '---';
        document.getElementById('userUsername').value = '';
        return;
    }
    
    const config = ROLE_CONFIG[role];
    if (!config) return;
    
    // Clean first name - remove spaces, keep camelCase
    const cleanName = firstName.replace(/\s+/g, '');
    
    // Generate full username
    const username = `${config.prefix}-${cleanName}`;
    
    document.getElementById('usernameValue').textContent = cleanName;
    document.getElementById('userUsername').value = username;
};

// Toggle password visibility
window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

window.showAddUserModal = function() {
    document.getElementById('userModalTitle').textContent = 'Add New Staff';
    document.getElementById('userForm').reset();
    document.getElementById('editUserId').value = '';
    document.getElementById('userPassword').required = true;
    document.getElementById('userFullName').required = true;
    document.getElementById('userMobile').required = true;
    
    // Reset username display
    document.getElementById('usernamePrefix').textContent = '---';
    document.getElementById('usernameValue').textContent = '---';
    document.getElementById('userUsername').value = '';
    
    // Hide role preview
    document.getElementById('rolePreviewCard').classList.add('hidden');
    
    openModal('userModal');
};

// Toggle Overseer option visibility based on selected role
function updateSipTokenOverseerVisibility() {
    const selectedRole = document.getElementById('userRoleSelect').value;
    const overseerOption = document.getElementById('siptokenOverseerOption');
    const sipTokenRoles = ['token_sales', 'barman'];
    
    if (overseerOption) {
        if (sipTokenRoles.includes(selectedRole)) {
            overseerOption.classList.remove('hidden');
        } else {
            overseerOption.classList.add('hidden');
            // Uncheck if hidden
            const checkbox = document.getElementById('userIsSiptokenOverseer');
            if (checkbox) checkbox.checked = false;
        }
    }
}

// Add event listener for role change
document.addEventListener('DOMContentLoaded', function() {
    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) {
        roleSelect.addEventListener('change', updateSipTokenOverseerVisibility);
    }
});

window.editUser = async function(userId) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('editUserId').value = userId;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').required = false;
        document.getElementById('userFullName').required = true;
        document.getElementById('userMobile').required = true;
        document.getElementById('userFullName').value = user.full_name || '';
        document.getElementById('userMobile').value = user.mobile_number || '';
        document.getElementById('userClubName').value = user.club_name || '';
        document.getElementById('userClubNumber').value = user.club_number || '';
        
        // Parse username to get prefix and name
        const usernameParts = user.username.split('-');
        const prefix = usernameParts[0] || '';
        const name = usernameParts.slice(1).join('-') || user.username;
        
        document.getElementById('usernamePrefix').textContent = prefix;
        document.getElementById('usernameValue').textContent = name;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userFirstName').value = name;
        
        // Determine role to select in dropdown
        let roleToSelect = user.role;
        if (user.is_gate_overseer) {
            roleToSelect = 'gate_overseer';
        } else if (user.is_siptoken_overseer) {
            roleToSelect = 'siptoken_overseer';
        } else if (user.is_siptoken_sales) {
            roleToSelect = 'token_sales';
        } else if (user.is_barman) {
            roleToSelect = 'barman';
        } else if (user.role === 'seller') {
            // Determine seller type from username prefix
            if (prefix === 'PreSales') roleToSelect = 'presales_seller';
            else if (prefix === 'EventSales') roleToSelect = 'event_seller';
        }
        document.getElementById('userRoleSelect').value = roleToSelect;
        
        // Update role preview
        updateRoleSelection();
        
        openModal('userModal');
        
    } catch (error) {
        console.error('Error loading user:', error);
        showToast('Failed to load user', 'error');
    }
};

async function handleUserForm(e) {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const isEdit = !!userId;
    
    // Validate required fields
    const fullName = document.getElementById('userFullName').value.trim();
    const mobileNumber = document.getElementById('userMobile').value.trim();
    const selectedRole = document.getElementById('userRoleSelect').value;
    const username = document.getElementById('userUsername').value.trim();
    
    if (!selectedRole) {
        showToast('Please select a role', 'error');
        return;
    }
    
    if (!username) {
        showToast('Username not generated. Please enter a first name.', 'error');
        return;
    }
    
    if (!fullName) {
        showToast('Full Name is required', 'error');
        return;
    }
    
    if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
        showToast('Valid 10-digit Mobile Number is required', 'error');
        return;
    }
    
    // Get role configuration
    const roleConfig = ROLE_CONFIG[selectedRole];
    if (!roleConfig) {
        showToast('Invalid role selected', 'error');
        return;
    }
    
    // Build user data from role config
    const userData = {
        username: username,
        full_name: fullName,
        mobile_number: mobileNumber,
        club_name: document.getElementById('userClubName').value.trim() || null,
        club_number: document.getElementById('userClubNumber').value.trim() || null,
        role: roleConfig.dbRole,
        // Reset all flags first
        is_gate_overseer: false,
        is_siptoken_overseer: false,
        is_siptoken_sales: false,
        is_barman: false
    };
    
    // Apply flags from role config
    if (roleConfig.flags) {
        Object.assign(userData, roleConfig.flags);
    }
    
    const password = document.getElementById('userPassword').value;
    if (password) {
        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        userData.password = password;
    }
    
    try {
        // Check username uniqueness (for new users)
        if (!isEdit) {
            const { data: existing } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();
            
            if (existing) {
                showToast('Username already exists! Use a different name.', 'error');
                return;
            }
        }
        
        if (isEdit) {
            const { error } = await supabase
                .from('users')
                .update(userData)
                .eq('id', userId);
            
            if (error) throw error;
            showToast('User updated successfully!', 'success');
        } else {
            if (!password) {
                showToast('Password is required for new users', 'error');
                return;
            }
            userData.password = password;
            userData.created_by = currentUser.id;
            
            const { error } = await supabase
                .from('users')
                .insert([userData]);
            
            if (error) throw error;
            showToast(`User created: ${username}`, 'success');
        }
        
        closeModal('userModal');
        await loadSellers();
        
    } catch (error) {
        console.error('Error saving user:', error);
        showToast('Failed to save user: ' + error.message, 'error');
    }
}

window.toggleUserStatus = async function(userId, newStatus) {
    const action = newStatus ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ is_active: newStatus })
            .eq('id', userId);
        
        if (error) throw error;
        
        showToast(`User ${action}d successfully!`, 'success');
        await loadSellers();
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        showToast('Failed to update user', 'error');
    }
};

// =====================================================
// ADMIN: READ-ONLY VIEWS
// =====================================================

async function loadAdminRegistrations() {
    try {
        const { data: guests, error } = await supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.getElementById('adminRegTableBody');
        if (guests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No registrations found</td></tr>';
            return;
        }
        
        tbody.innerHTML = guests.map(g => `
            <tr>
                <td class="font-semibold">${escapeHtml(g.guest_name)}</td>
                <td>${g.mobile_number}</td>
                <td class="capitalize">${g.entry_type}</td>
                <td>₹${g.ticket_price?.toLocaleString()}</td>
                <td>${formatPaymentMode(g.payment_mode)}</td>
                <td class="text-sm">${g.seller?.full_name || g.seller?.username || '-'}</td>
                <td>${getStatusBadge(g.status)}</td>
                <td class="text-sm text-gray-400">${formatDate(g.created_at)}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading admin registrations:', error);
    }
}

async function loadAdminSellerStats() {
    try {
        const { data: stats, error } = await supabase
            .from('seller_stats')
            .select('*');
        
        if (error) throw error;
        
        const tbody = document.getElementById('adminSellerStatsBody');
        if (!stats || stats.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-gray-500">No seller data</td></tr>';
            return;
        }
        
        tbody.innerHTML = stats.map(s => `
            <tr>
                <td class="font-semibold">${escapeHtml(s.full_name || s.username)}</td>
                <td class="text-sm">
                    ${s.club_name ? `<span class="text-yellow-400">${escapeHtml(s.club_name)}</span>` : '-'}
                </td>
                <td>${s.total_registrations}</td>
                <td class="text-orange-400">${s.pending_count}</td>
                <td class="text-green-400">${s.verified_count}</td>
                <td>${s.stag_count}</td>
                <td>${s.couple_count}</td>
                <td>₹${s.cash_collected?.toLocaleString()}</td>
                <td>₹${s.upi_collected?.toLocaleString()}</td>
                <td>₹${s.bank_collected?.toLocaleString()}</td>
                <td class="font-semibold text-yellow-400">₹${s.total_verified_amount?.toLocaleString()}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading admin seller stats:', error);
    }
}

// =====================================================
// STATISTICS
// =====================================================

async function loadStatistics() {
    try {
        const { data: stats, error } = await supabase
            .from('overall_stats')
            .select('*')
            .single();
        
        if (error) throw error;
        
        // Update stat displays
        document.getElementById('statTotalReg').textContent = stats.total_registrations || 0;
        document.getElementById('statTotalPax').textContent = stats.total_pax || 0;
        document.getElementById('statTotalRevenue').textContent = `₹${(stats.total_verified_revenue || 0).toLocaleString()}`;
        document.getElementById('statCheckedIn').textContent = stats.checked_in || 0;
        
        document.getElementById('statPending').textContent = stats.pending_verification || 0;
        document.getElementById('statVerified').textContent = stats.payment_verified || 0;
        document.getElementById('statGenerated').textContent = stats.pass_generated || 0;
        document.getElementById('statSent').textContent = stats.pass_sent || 0;
        document.getElementById('statChecked').textContent = stats.checked_in || 0;
        document.getElementById('statRejected').textContent = stats.rejected || 0;
        
        document.getElementById('statCash').textContent = `₹${(stats.cash_revenue || 0).toLocaleString()}`;
        document.getElementById('statUpi').textContent = `₹${(stats.upi_revenue || 0).toLocaleString()}`;
        document.getElementById('statBank').textContent = `₹${(stats.bank_revenue || 0).toLocaleString()}`;
        document.getElementById('statTotalVerified').textContent = `₹${(stats.total_verified_revenue || 0).toLocaleString()}`;
        
        document.getElementById('statStagCount').textContent = stats.stag_count || 0;
        document.getElementById('statCoupleCount').textContent = stats.couple_count || 0;
        
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

window.downloadRegistrationsCSV = async function() {
    try {
        const { data: guests, error } = await supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const csvData = guests.map(g => ({
            'Guest Name': g.guest_name,
            'Mobile': g.mobile_number,
            'Entry Type': g.entry_type,
            'Amount': g.ticket_price,
            'Payment Mode': g.payment_mode,
            'Payment Ref': g.payment_reference || '',
            'Seller': g.seller?.full_name || g.seller?.username || '',
            'Status': g.status,
            'Registered At': formatDate(g.created_at),
            'Verified At': g.verified_at ? formatDate(g.verified_at) : ''
        }));
        
        const csv = Papa.unparse(csvData);
        downloadFile(csv, `vamosfesta-registrations-${formatDateForFile()}.csv`, 'text/csv');
        
    } catch (error) {
        console.error('Error downloading CSV:', error);
        showToast('Failed to download CSV', 'error');
    }
};

window.downloadStatsReport = async function() {
    // Similar to CSV but with summary stats
    showToast('Generating report...', 'info');
    await downloadRegistrationsCSV();
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    
    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => showTab(tab.dataset.tab));
    });
    
    // Registration form
    document.getElementById('registrationForm')?.addEventListener('submit', handleRegistration);
    document.getElementById('entryType')?.addEventListener('change', updateRegistrationForm);
    document.getElementById('paymentMode')?.addEventListener('change', updateRegistrationForm);
    
    // Settings form
    document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);
    
    // User form
    document.getElementById('userForm')?.addEventListener('submit', handleUserForm);
    
    // Verification form
    document.getElementById('verifyForm')?.addEventListener('submit', handleVerification);
    
    // Queue filters
    document.querySelectorAll('.queue-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.queue-filter').forEach(b => {
                b.classList.remove('active');
                b.classList.add('secondary');
            });
            btn.classList.add('active');
            btn.classList.remove('secondary');
            loadVerificationQueue(btn.dataset.filter);
        });
    });
    
    // Registration filters
    document.querySelectorAll('.reg-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.reg-filter').forEach(b => {
                b.classList.remove('active');
                b.classList.add('secondary');
            });
            btn.classList.add('active');
            btn.classList.remove('secondary');
            loadAllRegistrations(btn.dataset.status);
        });
    });
    
    // Search
    document.getElementById('searchRegistrations')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allRegistrationsCache.filter(g => 
            g.guest_name.toLowerCase().includes(term) ||
            g.mobile_number.includes(term) ||
            (g.seller?.full_name || '').toLowerCase().includes(term)
        );
        renderAllRegistrations(filtered);
    });
    
    // Mobile menu items
    document.querySelectorAll('.mobile-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            if (tab) {
                showTab(tab);
                toggleMobileMenu(); // Close menu after selection
            }
        });
    });
}

// Mobile Menu Toggle
window.toggleMobileMenu = function() {
    const menu = document.getElementById('mobileSlideMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    
    if (menu && overlay) {
        menu.classList.toggle('active');
        overlay.classList.toggle('active');
        
        // Update menu role display
        const roleDisplay = document.getElementById('mobileMenuRole');
        if (roleDisplay && currentUser) {
            roleDisplay.textContent = formatRole(currentUser.role);
        }
        
        // Update pending badge in mobile menu
        const pendingBadge = document.getElementById('pendingBadge');
        const mobilePendingBadge = document.getElementById('mobilePendingBadge');
        if (pendingBadge && mobilePendingBadge) {
            mobilePendingBadge.textContent = pendingBadge.textContent;
        }
    }
};

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

window.closeModal = closeModal;

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    
    const types = {
        success: { bg: 'bg-green-600', icon: 'fa-check-circle' },
        error: { bg: 'bg-red-600', icon: 'fa-times-circle' },
        warning: { bg: 'bg-yellow-600', icon: 'fa-exclamation-circle' },
        info: { bg: 'bg-blue-600', icon: 'fa-info-circle' }
    };
    
    const config = types[type] || types.info;
    
    toast.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 ${config.bg}`;
    icon.className = `fas ${config.icon} text-xl`;
    msg.textContent = message;
    
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.transform = 'translateY(100%)';
        toast.style.opacity = '0';
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateForFile() {
    return new Date().toISOString().slice(0, 10);
}

function formatPaymentMode(mode) {
    const modes = {
        'cash': '💵 Cash',
        'upi': '📱 UPI',
        'bank_transfer': '🏦 Bank'
    };
    return modes[mode] || mode;
}

function getStatusBadge(status) {
    const statuses = {
        'pending_verification': { class: 'status-pending', text: 'Pending' },
        'payment_verified': { class: 'status-verified', text: 'Verified' },
        'pass_generated': { class: 'status-generated', text: 'Pass Ready' },
        'pass_sent': { class: 'status-sent', text: 'Sent' },
        'checked_in': { class: 'status-checked', text: 'Checked In' },
        'rejected': { class: 'status-rejected', text: 'Rejected' }
    };
    const s = statuses[status] || { class: '', text: status };
    return `<span class="status-badge ${s.class}">${s.text}</span>`;
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// =====================================================
// ENTRY MARSHALL - GATE MANAGEMENT & CHECK-IN
// =====================================================

let qrScanner = null;
let currentDuty = null;
let scanMode = 'entry'; // 'entry' or 'exit'

async function loadEntryStats() {
    try {
        // Display marshall name
        const marshallDisplay = document.getElementById('marshallNameDisplay');
        if (marshallDisplay) {
            marshallDisplay.textContent = `Logged in as: ${currentUser.full_name || currentUser.username}`;
        }
        
        // Check if marshall is on duty
        await checkDutyStatus();
        
        // Get stats
        const { count: myCheckins } = await supabase
            .from('guest_movements')
            .select('*', { count: 'exact', head: true })
            .eq('marshall_id', currentUser.id)
            .eq('movement_type', 'entry');
        
        const { count: insideVenue } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .eq('is_inside_venue', true);
        
        const { count: totalExpected } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pass_sent', 'checked_in']);
        
        // Update displays
        const myCheckinsEl = document.getElementById('entryMyCheckins');
        const insideEl = document.getElementById('entryCheckedInCount');
        const expectedEl = document.getElementById('entryTotalExpected');
        
        if (myCheckinsEl) myCheckinsEl.textContent = myCheckins || 0;
        if (insideEl) insideEl.textContent = insideVenue || 0;
        if (expectedEl) expectedEl.textContent = totalExpected || 0;
        
        // Load recent activity
        await loadRecentActivity();
        
    } catch (error) {
        console.error('Error loading entry stats:', error);
    }
}

async function loadGatesDropdown() {
    try {
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('is_active', true)
            .order('gate_name');
        
        if (error) throw error;
        
        const select = document.getElementById('gateSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Choose Gate --</option>';
        
        if (gates && gates.length > 0) {
            gates.forEach(gate => {
                select.innerHTML += `<option value="${gate.id}">${gate.gate_name} (${gate.gate_code})</option>`;
            });
        }
        
    } catch (error) {
        console.error('Error loading gates:', error);
    }
}

async function checkDutyStatus() {
    try {
        const { data: duty, error } = await supabase
            .from('marshall_duties')
            .select('*, gate:entry_gates(*)')
            .eq('marshall_id', currentUser.id)
            .eq('status', 'on_duty')
            .single();
        
        if (duty && !error) {
            currentDuty = duty;
            showOnDutyUI(duty);
        } else {
            currentDuty = null;
            showOffDutyUI();
        }
        
    } catch (error) {
        // No active duty found
        currentDuty = null;
        showOffDutyUI();
    }
}

function showOnDutyUI(duty) {
    const offDutySection = document.getElementById('offDutySection');
    const onDutySection = document.getElementById('onDutySection');
    const scanSection = document.getElementById('scanSection');
    const notOnDutyMessage = document.getElementById('notOnDutyMessage');
    const currentGateName = document.getElementById('currentGateName');
    const dutyDuration = document.getElementById('dutyDuration');
    
    if (offDutySection) offDutySection.classList.add('hidden');
    if (onDutySection) onDutySection.classList.remove('hidden');
    if (scanSection) scanSection.classList.remove('hidden');
    if (notOnDutyMessage) notOnDutyMessage.classList.add('hidden');
    
    if (currentGateName && duty.gate) {
        currentGateName.textContent = duty.gate.gate_name;
    }
    
    if (dutyDuration && duty.clock_in_at) {
        const clockIn = new Date(duty.clock_in_at);
        dutyDuration.textContent = `Since: ${clockIn.toLocaleTimeString()}`;
    }
}

function showOffDutyUI() {
    const offDutySection = document.getElementById('offDutySection');
    const onDutySection = document.getElementById('onDutySection');
    const scanSection = document.getElementById('scanSection');
    const notOnDutyMessage = document.getElementById('notOnDutyMessage');
    
    if (offDutySection) offDutySection.classList.remove('hidden');
    if (onDutySection) onDutySection.classList.add('hidden');
    if (scanSection) scanSection.classList.add('hidden');
    if (notOnDutyMessage) notOnDutyMessage.classList.remove('hidden');
}

window.clockIn = async function() {
    // Open QR scanner modal for clock-in token
    openModal('clockinScannerModal');
    
    const video = document.getElementById('clockinQrVideo');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        video.play();
        
        // Use qr-scanner library if available
        if (window.QrScanner) {
            const qrScanner = new QrScanner(
                video,
                result => processClockInToken(result.data, qrScanner, stream),
                {
                    returnDetailedScanResult: true,
                    highlightScanRegion: true,
                    highlightCodeOutline: true
                }
            );
            qrScanner.start();
        } else {
            showToast('QR Scanner not available', 'error');
            stopClockinScanner();
        }
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        showToast('Camera access denied. Please enable camera permissions.', 'error');
        closeModal('clockinScannerModal');
    }
};

async function processClockInToken(qrData, scanner, stream) {
    // Stop scanner
    if (scanner) scanner.stop();
    if (stream) stream.getTracks().forEach(track => track.stop());
    closeModal('clockinScannerModal');
    
    try {
        // Parse QR data
        let tokenData;
        try {
            tokenData = JSON.parse(qrData);
        } catch {
            showToast('Invalid QR code format', 'error');
            return;
        }
        
        if (tokenData.type !== 'clockin_token' || !tokenData.token) {
            showToast('This is not a valid clock-in token', 'error');
            return;
        }
        
        // Validate token in database
        const { data: token, error: tokenError } = await supabase
            .from('clockin_tokens')
            .select('*, entry_gates(*)')
            .eq('token', tokenData.token)
            .is('used_at', null)
            .gt('expires_at', new Date().toISOString())
            .single();
        
        if (tokenError || !token) {
            showToast('Invalid or expired token', 'error');
            return;
        }
        
        // Check if marshall is assigned to this gate
        const { data: assignment, error: assignError } = await supabase
            .from('gate_roster')
            .select('*')
            .eq('marshall_id', currentUser.id)
            .eq('gate_id', token.gate_id)
            .single();
        
        if (assignError || !assignment) {
            showToast(`You are not assigned to ${token.entry_gates.gate_name}. Please contact your overseer.`, 'error');
            return;
        }
        
        // Check if already on duty
        const { data: existingDuty } = await supabase
            .from('marshall_duties')
            .select('*')
            .eq('marshall_id', currentUser.id)
            .eq('status', 'on_duty')
            .single();
        
        if (existingDuty) {
            showToast('You are already on duty. Clock out first.', 'error');
            return;
        }
        
        // Create duty record
        const { data: duty, error: dutyError } = await supabase
            .from('marshall_duties')
            .insert({
                marshall_id: currentUser.id,
                gate_id: token.gate_id,
                status: 'on_duty',
                clock_in_at: new Date().toISOString()
            })
            .select('*, gate:entry_gates(*)')
            .single();
        
        if (dutyError) throw dutyError;
        
        // Mark token as used
        await supabase
            .from('clockin_tokens')
            .update({
                used_by: currentUser.id,
                used_at: new Date().toISOString()
            })
            .eq('id', token.id);
        
        // Log activity
        await supabase
            .from('gate_activity_log')
            .insert({
                gate_id: token.gate_id,
                user_id: currentUser.id,
                activity_type: 'clock_in',
                details: {
                    token_id: token.id,
                    overseer_id: token.overseer_id
                }
            });
        
        currentDuty = duty;
        showOnDutyUI(duty);
        showToast(`✓ Clocked in at ${duty.gate.gate_name}`, 'success');
        
    } catch (error) {
        console.error('Error processing clock-in token:', error);
        showToast('Failed to clock in: ' + error.message, 'error');
    }
}

function stopClockinScanner() {
    const video = document.getElementById('clockinQrVideo');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
};

window.clockOut = async function() {
    if (!currentDuty) return;
    
    // Prompt for reason
    const reason = prompt('Please provide a reason for clocking out:');
    if (!reason || reason.trim().length < 3) {
        showToast('Please provide a valid reason (minimum 3 characters)', 'error');
        return;
    }
    
    try {
        // Check if there's already a pending request
        const { data: existingRequest } = await supabase
            .from('clockout_requests')
            .select('*')
            .eq('duty_id', currentDuty.id)
            .eq('status', 'pending')
            .single();
        
        if (existingRequest) {
            showToast('You already have a pending clockout request', 'info');
            return;
        }
        
        // Create clockout request
        const { error } = await supabase
            .from('clockout_requests')
            .insert({
                duty_id: currentDuty.id,
                marshall_id: currentUser.id,
                gate_id: currentDuty.gate_id,
                reason: reason.trim(),
                status: 'pending'
            });
        
        if (error) throw error;
        
        // Log activity
        await supabase
            .from('gate_activity_log')
            .insert({
                gate_id: currentDuty.gate_id,
                user_id: currentUser.id,
                activity_type: 'clock_out_request',
                details: {
                    duty_id: currentDuty.id,
                    reason: reason.trim()
                }
            });
        
        showToast('✓ Clockout request submitted. Awaiting overseer approval.', 'success');
        
    } catch (error) {
        console.error('Error requesting clockout:', error);
        showToast('Failed to submit clockout request', 'error');
    }
};

window.setScanMode = function(mode) {
    scanMode = mode;
    
    const btnEntry = document.getElementById('btnModeEntry');
    const btnExit = document.getElementById('btnModeExit');
    const scanModeText = document.getElementById('scanModeText');
    const scanButton = document.getElementById('scanButton');
    
    if (mode === 'entry') {
        btnEntry?.classList.remove('secondary');
        btnExit?.classList.add('secondary');
        if (scanModeText) scanModeText.textContent = 'ENTRY';
        if (scanButton) scanButton.classList.remove('danger');
    } else {
        btnEntry?.classList.add('secondary');
        btnExit?.classList.remove('secondary');
        if (scanModeText) scanModeText.textContent = 'EXIT';
        if (scanButton) scanButton.classList.add('danger');
    }
};

async function loadRecentActivity() {
    try {
        const { data: recent, error } = await supabase
            .from('guest_movements')
            .select('*, guest:guests(guest_name, entry_type)')
            .eq('marshall_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        const container = document.getElementById('recentCheckins');
        if (!container) return;
        
        if (!recent || recent.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No activity yet</p>';
            return;
        }
        
        container.innerHTML = recent.map(m => {
            const isEntry = m.movement_type === 'entry';
            const bgColor = isEntry ? 'bg-green-900/20 border-green-600/30' : 'bg-red-900/20 border-red-600/30';
            const textColor = isEntry ? 'text-green-400' : 'text-red-400';
            const icon = isEntry ? 'fa-sign-in-alt' : 'fa-sign-out-alt';
            
            return `
                <div class="flex justify-between items-center p-2 ${bgColor} rounded border">
                    <div>
                        <i class="fas ${icon} ${textColor} mr-2"></i>
                        <span class="font-semibold">${escapeHtml(m.guest?.guest_name || 'Unknown')}</span>
                        <span class="text-xs text-gray-400 ml-1 capitalize">(${m.guest?.entry_type || ''})</span>
                    </div>
                    <span class="text-xs ${textColor}">${formatTimeAgo(m.created_at)}</span>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(date);
}

// QR Scanner
window.startQRScanner = async function() {
    if (!currentDuty) {
        showToast('Please clock in first', 'error');
        return;
    }
    
    openModal('scannerModal');
    
    const video = document.getElementById('qrVideo');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        video.play();
        
        if (!window.QrScanner) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.umd.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }
        
        qrScanner = new QrScanner(video, result => {
            processQRCode(result.data);
        }, {
            highlightScanRegion: true,
            highlightCodeOutline: true
        });
        
        await qrScanner.start();
        
    } catch (error) {
        console.error('Camera error:', error);
        closeModal('scannerModal');
        showToast('Camera access denied', 'error');
    }
};

window.stopQRScanner = function() {
    if (qrScanner) {
        qrScanner.stop();
        qrScanner.destroy();
        qrScanner = null;
    }
    
    const video = document.getElementById('qrVideo');
    if (video?.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    closeModal('scannerModal');
};

async function processQRCode(qrData) {
    stopQRScanner();
    
    try {
        let guestData;
        try {
            guestData = JSON.parse(qrData);
        } catch {
            showCheckinResult(false, 'Invalid QR Code', 'This is not a valid guest pass.');
            return;
        }
        
        if (!guestData.id) {
            showCheckinResult(false, 'Invalid Pass', 'Invalid guest information.');
            return;
        }
        
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*')
            .eq('id', guestData.id)
            .single();
        
        if (error || !guest) {
            showCheckinResult(false, 'Guest Not Found', 'No guest found with this pass.');
            return;
        }
        
        if (scanMode === 'entry') {
            await processEntry(guest);
        } else {
            await processExit(guest);
        }
        
    } catch (error) {
        console.error('Error processing QR:', error);
        showCheckinResult(false, 'Error', 'An error occurred.');
    }
}

async function processEntry(guest) {
    // Check if already inside
    if (guest.is_inside_venue) {
        showCheckinResult(false, 'Already Inside', 
            `<strong>${guest.guest_name}</strong> is already inside the venue.`, 'warning');
        return;
    }
    
    // Check if pass is valid
    if (!['pass_sent', 'checked_in'].includes(guest.status)) {
        showCheckinResult(false, 'Invalid Pass', 
            `This pass is not valid. Status: ${guest.status}`, 'warning');
        return;
    }
    
    try {
        // Update guest status
        await supabase
            .from('guests')
            .update({
                status: 'checked_in',
                is_inside_venue: true,
                last_gate_id: currentDuty.gate_id,
                entry_count: (guest.entry_count || 0) + 1,
                last_movement_at: new Date().toISOString(),
                checked_in_by: currentUser.id
            })
            .eq('id', guest.id);
        
        // Log movement
        await supabase
            .from('guest_movements')
            .insert({
                guest_id: guest.id,
                gate_id: currentDuty.gate_id,
                marshall_id: currentUser.id,
                movement_type: 'entry'
            });
        
        const entryNum = (guest.entry_count || 0) + 1;
        const reentryNote = entryNum > 1 ? `<br><span class="text-sm text-yellow-400">(Re-entry #${entryNum})</span>` : '';
        
        showCheckinResult(true, 'Entry Successful!', 
            `<strong>${guest.guest_name}</strong><br>
            <span class="text-sm text-gray-400 capitalize">${guest.entry_type} Entry</span>${reentryNote}`, 'success');
        
        await loadEntryStats();
        
    } catch (error) {
        console.error('Error processing entry:', error);
        showCheckinResult(false, 'Entry Failed', 'An error occurred.');
    }
}

async function processExit(guest) {
    // Check if inside venue
    if (!guest.is_inside_venue) {
        showCheckinResult(false, 'Not Inside', 
            `<strong>${guest.guest_name}</strong> is not currently inside the venue.`, 'warning');
        return;
    }
    
    try {
        // Update guest status
        await supabase
            .from('guests')
            .update({
                is_inside_venue: false,
                last_movement_at: new Date().toISOString()
            })
            .eq('id', guest.id);
        
        // Log movement
        await supabase
            .from('guest_movements')
            .insert({
                guest_id: guest.id,
                gate_id: currentDuty.gate_id,
                marshall_id: currentUser.id,
                movement_type: 'exit'
            });
        
        showCheckinResult(true, 'Exit Recorded', 
            `<strong>${guest.guest_name}</strong> has exited.<br>
            <span class="text-sm text-gray-400">They can re-enter by scanning again.</span>`, 'success');
        
        await loadEntryStats();
        
    } catch (error) {
        console.error('Error processing exit:', error);
        showCheckinResult(false, 'Exit Failed', 'An error occurred.');
    }
}

window.manualLookup = async function() {
    const mobile = document.getElementById('manualMobile')?.value.trim();
    
    if (!mobile || mobile.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
    }
    
    if (!currentDuty) {
        showToast('Please clock in first', 'error');
        return;
    }
    
    try {
        const { data: guests, error } = await supabase
            .from('guests')
            .select('*')
            .eq('mobile_number', mobile);
        
        if (error) throw error;
        
        if (!guests || guests.length === 0) {
            showCheckinResult(false, 'Guest Not Found', `No guest found with mobile ${mobile}.`);
            return;
        }
        
        const guest = guests[0];
        showGuestLookup(guest);
        
    } catch (error) {
        console.error('Error in manual lookup:', error);
        showToast('An error occurred', 'error');
    }
};

function showGuestLookup(guest) {
    const content = document.getElementById('guestLookupContent');
    if (!content) return;
    
    const statusColor = guest.is_inside_venue ? 'green' : 'gray';
    const statusText = guest.is_inside_venue ? 'Inside Venue' : 'Outside Venue';
    
    content.innerHTML = `
        <div class="text-center mb-4">
            <h4 class="text-xl font-bold">${escapeHtml(guest.guest_name)}</h4>
            <p class="text-sm text-gray-400 capitalize">${guest.entry_type} Entry</p>
            <span class="inline-block mt-2 px-3 py-1 rounded-full text-sm bg-${statusColor}-900/30 text-${statusColor}-400 border border-${statusColor}-600/30">
                ${statusText}
            </span>
        </div>
        <div class="space-y-2 text-sm mb-4">
            <div class="flex justify-between">
                <span class="text-gray-400">Mobile:</span>
                <span>${guest.mobile_number}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Entry Count:</span>
                <span>${guest.entry_count || 0}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Status:</span>
                <span>${guest.status}</span>
            </div>
        </div>
        <div class="flex gap-2">
            ${!guest.is_inside_venue ? `
                <button onclick="processEntryFromLookup('${guest.id}')" class="vamosfesta-button success flex-1">
                    <i class="fas fa-sign-in-alt mr-1"></i>Entry
                </button>
            ` : `
                <button onclick="processExitFromLookup('${guest.id}')" class="vamosfesta-button danger flex-1">
                    <i class="fas fa-sign-out-alt mr-1"></i>Exit
                </button>
            `}
            <button onclick="closeModal('guestLookupModal')" class="vamosfesta-button secondary flex-1">Cancel</button>
        </div>
    `;
    
    openModal('guestLookupModal');
}

window.processEntryFromLookup = async function(guestId) {
    closeModal('guestLookupModal');
    const { data: guest } = await supabase.from('guests').select('*').eq('id', guestId).single();
    if (guest) await processEntry(guest);
    document.getElementById('manualMobile').value = '';
};

window.processExitFromLookup = async function(guestId) {
    closeModal('guestLookupModal');
    const { data: guest } = await supabase.from('guests').select('*').eq('id', guestId).single();
    if (guest) await processExit(guest);
    document.getElementById('manualMobile').value = '';
};

function showCheckinResult(success, title, message, type = null) {
    const resultType = type || (success ? 'success' : 'error');
    const icon = resultType === 'success' ? 'fa-check-circle text-green-400' : 
                 resultType === 'warning' ? 'fa-exclamation-triangle text-yellow-400' : 
                 'fa-times-circle text-red-400';
    const bgColor = resultType === 'success' ? 'bg-green-900/30 border-green-600' : 
                    resultType === 'warning' ? 'bg-yellow-900/30 border-yellow-600' :
                    'bg-red-900/30 border-red-600';
    
    const content = document.getElementById('checkinResultContent');
    if (content) {
        content.innerHTML = `
            <div class="p-6 ${bgColor} border-2 rounded-xl mb-4">
                <i class="fas ${icon} text-6xl mb-4"></i>
                <h3 class="text-2xl font-bold mb-2">${title}</h3>
                <p class="text-gray-300">${message}</p>
            </div>
        `;
    }
    
    openModal('checkinResultModal');
    
    if (success) {
        setTimeout(() => closeModal('checkinResultModal'), 3000);
    }
}

// =====================================================
// GATE MANAGEMENT (Super Admin)
// =====================================================

async function loadGates() {
    try {
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .order('gate_name');
        
        if (error) throw error;
        
        const container = document.getElementById('gatesListSettings');
        if (!container) return;
        
        if (!gates || gates.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No gates configured</p>';
            return;
        }
        
        container.innerHTML = gates.map(gate => `
            <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                    <span class="font-semibold">${escapeHtml(gate.gate_name)}</span>
                    <span class="text-xs text-yellow-400 ml-2">(${gate.gate_code})</span>
                    ${!gate.is_active ? '<span class="text-xs text-red-400 ml-2">[Inactive]</span>' : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="editGate('${gate.id}')" class="text-blue-400 hover:text-blue-300 text-sm">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteGate('${gate.id}')" class="text-red-400 hover:text-red-300 text-sm">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading gates:', error);
    }
}

window.openGateModal = function(gateId = null) {
    document.getElementById('editGateId').value = '';
    document.getElementById('gateName').value = '';
    document.getElementById('gateCode').value = '';
    document.getElementById('gateDescription').value = '';
    document.getElementById('gateActive').checked = true;
    document.getElementById('gateModalTitle').textContent = 'Add Entry Gate';
    
    openModal('gateModal');
};

window.editGate = async function(gateId) {
    try {
        const { data: gate, error } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('id', gateId)
            .single();
        
        if (error) throw error;
        
        document.getElementById('editGateId').value = gate.id;
        document.getElementById('gateName').value = gate.gate_name;
        document.getElementById('gateCode').value = gate.gate_code;
        document.getElementById('gateDescription').value = gate.description || '';
        document.getElementById('gateActive').checked = gate.is_active;
        document.getElementById('gateModalTitle').textContent = 'Edit Entry Gate';
        
        openModal('gateModal');
        
    } catch (error) {
        console.error('Error loading gate:', error);
        showToast('Failed to load gate', 'error');
    }
};

window.deleteGate = async function(gateId) {
    if (!confirm('Are you sure you want to delete this gate?')) return;
    
    try {
        const { error } = await supabase
            .from('entry_gates')
            .delete()
            .eq('id', gateId);
        
        if (error) throw error;
        
        showToast('Gate deleted', 'success');
        await loadGates();
        
    } catch (error) {
        console.error('Error deleting gate:', error);
        showToast('Failed to delete gate', 'error');
    }
};

// Gate form submission
document.getElementById('gateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const gateId = document.getElementById('editGateId').value;
    const gateData = {
        gate_name: document.getElementById('gateName').value,
        gate_code: document.getElementById('gateCode').value.toUpperCase(),
        description: document.getElementById('gateDescription').value || null,
        is_active: document.getElementById('gateActive').checked
    };
    
    try {
        if (gateId) {
            const { error } = await supabase
                .from('entry_gates')
                .update(gateData)
                .eq('id', gateId);
            if (error) throw error;
        } else {
            gateData.created_by = currentUser?.id;
            const { error } = await supabase
                .from('entry_gates')
                .insert(gateData);
            if (error) throw error;
        }
        
        showToast('Gate saved successfully', 'success');
        closeModal('gateModal');
        await loadGates();
        
    } catch (error) {
        console.error('Error saving gate:', error);
        showToast('Failed to save gate: ' + error.message, 'error');
    }
});

// =====================================================
// VENUE STATUS (Admin/Super Admin Statistics)
// =====================================================

window.refreshGateManagement = async function() {
    await loadGateManagement();
    showToast('Gate management refreshed', 'success');
};

async function loadGateManagement() {
    try {
        // Get guests inside venue
        const { count: insideCount } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .eq('is_inside_venue', true);
        
        // Get guests who have exited
        const { count: checkedInCount } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'checked_in');
        
        const exitedCount = (checkedInCount || 0) - (insideCount || 0);
        
        // Get marshalls on duty
        const { count: marshallCount } = await supabase
            .from('marshall_duties')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'on_duty');
        
        // Get active gates
        const { count: gateCount } = await supabase
            .from('entry_gates')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        
        // Update displays for Gate Management tab
        const insideEl = document.getElementById('gateVenueInside');
        const exitedEl = document.getElementById('gateVenueExited');
        const marshallsEl = document.getElementById('gateMarshallCount');
        const gatesEl = document.getElementById('gateActiveCount');
        
        if (insideEl) insideEl.textContent = insideCount || 0;
        if (exitedEl) exitedEl.textContent = exitedCount >= 0 ? exitedCount : 0;
        if (marshallsEl) marshallsEl.textContent = marshallCount || 0;
        if (gatesEl) gatesEl.textContent = gateCount || 0;
        
        // Load gate cards
        await loadGateCards();
        
        // Load marshalls on duty list
        await loadGateMarshallsList();
        
        // Load gate configuration (for super admin)
        await loadGateConfig();
        
    } catch (error) {
        console.error('Error loading gate management:', error);
    }
}

async function loadGateCards() {
    try {
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('is_active', true);
        
        if (error) throw error;
        
        const container = document.getElementById('gateCardsContainer');
        if (!container) return;
        
        if (!gates || gates.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm col-span-full text-center py-4">No gates configured. Add gates in Settings.</p>';
            return;
        }
        
        let html = '';
        
        for (const gate of gates) {
            // Get marshalls at this gate
            const { data: marshalls } = await supabase
                .from('marshall_duties')
                .select('*, marshall:marshall_id(full_name)')
                .eq('gate_id', gate.id)
                .eq('status', 'on_duty');
            
            // Get entries at this gate
            const { count: entryCount } = await supabase
                .from('guest_movements')
                .select('*', { count: 'exact', head: true })
                .eq('gate_id', gate.id)
                .eq('movement_type', 'entry');
            
            // Get exits at this gate
            const { count: exitCount } = await supabase
                .from('guest_movements')
                .select('*', { count: 'exact', head: true })
                .eq('gate_id', gate.id)
                .eq('movement_type', 'exit');
            
            const marshallNames = marshalls?.map(m => m.marshall?.full_name).filter(Boolean).join(', ') || 'No marshalls';
            const hasMarshall = marshalls && marshalls.length > 0;
            
            html += `
                <div class="p-4 bg-gray-800/50 rounded-lg border ${hasMarshall ? 'border-green-600/30' : 'border-gray-700'}">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h5 class="font-semibold text-yellow-400">${escapeHtml(gate.gate_name)}</h5>
                            <span class="text-xs text-gray-500">${gate.gate_code}</span>
                        </div>
                        ${hasMarshall ? '<span class="px-2 py-1 text-xs bg-green-900/50 text-green-400 rounded">Active</span>' : '<span class="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">Unmanned</span>'}
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                        <div class="text-center p-2 bg-green-900/20 rounded">
                            <span class="block text-lg font-bold text-green-400">${entryCount || 0}</span>
                            <span class="text-xs text-gray-400">Entries</span>
                        </div>
                        <div class="text-center p-2 bg-red-900/20 rounded">
                            <span class="block text-lg font-bold text-red-400">${exitCount || 0}</span>
                            <span class="text-xs text-gray-400">Exits</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400">
                        <i class="fas fa-user-shield mr-1"></i>${marshallNames}
                    </p>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading gate cards:', error);
    }
}

async function loadGateMarshallsList() {
    try {
        const { data: duties, error } = await supabase
            .from('marshall_duties')
            .select('*, marshall:marshall_id(full_name, mobile_number), gate:entry_gates(gate_name, gate_code)')
            .eq('status', 'on_duty')
            .order('clock_in_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('gateMarshallsList');
        if (!container) return;
        
        if (!duties || duties.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No marshalls on duty</p>';
            return;
        }
        
        container.innerHTML = duties.map(d => {
            const clockIn = new Date(d.clock_in_at);
            const duration = Math.floor((Date.now() - clockIn.getTime()) / 60000);
            const durationText = duration < 60 ? `${duration}m` : `${Math.floor(duration/60)}h ${duration%60}m`;
            
            return `
                <div class="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-600/30">
                    <div>
                        <span class="font-semibold">${escapeHtml(d.marshall?.full_name || 'Unknown')}</span>
                        <span class="text-xs text-gray-400 ml-2">${d.marshall?.mobile_number || ''}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-sm text-yellow-400">${d.gate?.gate_name || 'Unknown Gate'}</span>
                        <span class="block text-xs text-gray-500">${durationText} on duty</span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading gate marshalls list:', error);
    }
}

async function loadGateConfig() {
    try {
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .order('gate_name');
        
        if (error) throw error;
        
        const container = document.getElementById('gateConfigList');
        if (!container) return;
        
        if (!gates || gates.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No gates configured</p>';
            return;
        }
        
        container.innerHTML = gates.map(gate => `
            <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                    <span class="font-semibold">${escapeHtml(gate.gate_name)}</span>
                    <span class="text-xs text-yellow-400 ml-2">(${gate.gate_code})</span>
                    ${!gate.is_active ? '<span class="text-xs text-red-400 ml-2">[Inactive]</span>' : '<span class="text-xs text-green-400 ml-2">[Active]</span>'}
                </div>
                <div class="flex gap-2">
                    <button onclick="editGate('${gate.id}')" class="text-blue-400 hover:text-blue-300 text-sm">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteGate('${gate.id}')" class="text-red-400 hover:text-red-300 text-sm">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading gate config:', error);
    }
}

window.refreshVenueStatus = async function() {
    await loadVenueStatus();
    showToast('Venue status refreshed', 'success');
};

async function loadVenueStatus() {
    try {
        // Get guests inside venue
        const { count: insideCount } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .eq('is_inside_venue', true);
        
        // Get guests who have exited
        const { count: checkedInCount } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'checked_in');
        
        const exitedCount = (checkedInCount || 0) - (insideCount || 0);
        
        // Get marshalls on duty
        const { count: marshallCount } = await supabase
            .from('marshall_duties')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'on_duty');
        
        // Get active gates
        const { count: gateCount } = await supabase
            .from('entry_gates')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        
        // Update displays
        const insideEl = document.getElementById('venueGuestsInside');
        const exitedEl = document.getElementById('venueGuestsExited');
        const marshallsEl = document.getElementById('venueMarshallsOnDuty');
        const gatesEl = document.getElementById('venueActiveGates');
        
        if (insideEl) insideEl.textContent = insideCount || 0;
        if (exitedEl) exitedEl.textContent = exitedCount >= 0 ? exitedCount : 0;
        if (marshallsEl) marshallsEl.textContent = marshallCount || 0;
        if (gatesEl) gatesEl.textContent = gateCount || 0;
        
        // Load gate stats
        await loadGateStats();
        
        // Load marshalls on duty list
        await loadMarshallsOnDuty();
        
    } catch (error) {
        console.error('Error loading venue status:', error);
    }
}

async function loadGateStats() {
    try {
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('is_active', true);
        
        if (error) throw error;
        
        const container = document.getElementById('gateStatsContainer');
        if (!container) return;
        
        if (!gates || gates.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm col-span-full text-center py-4">No gates configured</p>';
            return;
        }
        
        let html = '';
        
        for (const gate of gates) {
            // Get marshalls at this gate
            const { data: marshalls } = await supabase
                .from('marshall_duties')
                .select('*, marshall:marshall_id(full_name)')
                .eq('gate_id', gate.id)
                .eq('status', 'on_duty');
            
            // Get entries at this gate
            const { count: entryCount } = await supabase
                .from('guest_movements')
                .select('*', { count: 'exact', head: true })
                .eq('gate_id', gate.id)
                .eq('movement_type', 'entry');
            
            // Get exits at this gate
            const { count: exitCount } = await supabase
                .from('guest_movements')
                .select('*', { count: 'exact', head: true })
                .eq('gate_id', gate.id)
                .eq('movement_type', 'exit');
            
            const marshallNames = marshalls?.map(m => m.marshall?.full_name).filter(Boolean).join(', ') || 'No marshalls';
            const hasMarshall = marshalls && marshalls.length > 0;
            
            html += `
                <div class="p-4 bg-gray-800/50 rounded-lg border ${hasMarshall ? 'border-green-600/30' : 'border-gray-700'}">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h5 class="font-semibold text-yellow-400">${escapeHtml(gate.gate_name)}</h5>
                            <span class="text-xs text-gray-500">${gate.gate_code}</span>
                        </div>
                        ${hasMarshall ? '<span class="px-2 py-1 text-xs bg-green-900/50 text-green-400 rounded">Active</span>' : '<span class="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">Unmanned</span>'}
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                        <div class="text-center p-2 bg-green-900/20 rounded">
                            <span class="block text-lg font-bold text-green-400">${entryCount || 0}</span>
                            <span class="text-xs text-gray-400">Entries</span>
                        </div>
                        <div class="text-center p-2 bg-red-900/20 rounded">
                            <span class="block text-lg font-bold text-red-400">${exitCount || 0}</span>
                            <span class="text-xs text-gray-400">Exits</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400">
                        <i class="fas fa-user-shield mr-1"></i>${marshallNames}
                    </p>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading gate stats:', error);
    }
}

async function loadMarshallsOnDuty() {
    try {
        const { data: duties, error } = await supabase
            .from('marshall_duties')
            .select('*, marshall:marshall_id(full_name, mobile_number), gate:entry_gates(gate_name, gate_code)')
            .eq('status', 'on_duty')
            .order('clock_in_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('marshallsOnDutyList');
        if (!container) return;
        
        if (!duties || duties.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No marshalls on duty</p>';
            return;
        }
        
        container.innerHTML = duties.map(d => {
            const clockIn = new Date(d.clock_in_at);
            const duration = Math.floor((Date.now() - clockIn.getTime()) / 60000);
            const durationText = duration < 60 ? `${duration}m` : `${Math.floor(duration/60)}h ${duration%60}m`;
            
            return `
                <div class="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-600/30">
                    <div>
                        <span class="font-semibold">${escapeHtml(d.marshall?.full_name || 'Unknown')}</span>
                        <span class="text-xs text-gray-400 ml-2">${d.marshall?.mobile_number || ''}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-sm text-yellow-400">${d.gate?.gate_name || 'Unknown Gate'}</span>
                        <span class="block text-xs text-gray-500">${durationText} on duty</span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading marshalls on duty:', error);
    }
}

// =====================================================
// SUPER ADMIN: ADMIN & OVERSEER MANAGEMENT
// =====================================================

async function loadAdmins() {
    try {
        const { data: admins, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'admin')
            .eq('is_active', true)
            .order('full_name');
        
        if (error) throw error;
        
        // Get overseer assignments for each admin
        const { data: assignments, error: assignError } = await supabase
            .from('overseer_assignments')
            .select('*, entry_gates(gate_name, gate_code)');
        
        if (assignError) throw assignError;
        
        const tbody = document.getElementById('adminsTableBody');
        if (!admins || admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No admins found. Create one using the button above.</td></tr>';
            return;
        }
        
        tbody.innerHTML = admins.map(admin => {
            const adminAssignments = assignments?.filter(a => a.overseer_id === admin.id) || [];
            const isOverseer = admin.is_gate_overseer;
            const isSiptokenOverseer = admin.is_siptoken_overseer;
            const leadAssignments = adminAssignments.filter(a => a.is_lead_overseer);
            
            const gatesText = adminAssignments.length > 0
                ? adminAssignments.map(a => {
                    const lead = a.is_lead_overseer ? '⭐' : '';
                    return `${lead}${a.entry_gates.gate_name}`;
                }).join(', ')
                : '<span class="text-gray-500">None</span>';
            
            const overseerBadge = isOverseer
                ? `<span class="status-badge" style="background: #f59e0b; color: white;"><i class="fas fa-shield-alt mr-1"></i>Gate Overseer</span>`
                : '';
            
            const siptokenBadge = isSiptokenOverseer
                ? `<span class="status-badge" style="background: #3b82f6; color: white;"><i class="fas fa-coins mr-1"></i>SipToken</span>`
                : '';
            
            const badges = [overseerBadge, siptokenBadge].filter(b => b).join(' ') || '<span class="text-gray-500">Regular Admin</span>';
            
            return `
                <tr>
                    <td class="font-semibold">${escapeHtml(admin.username)}</td>
                    <td>${escapeHtml(admin.full_name)}</td>
                    <td>${admin.mobile_number}</td>
                    <td>${badges}</td>
                    <td class="text-sm">${gatesText}</td>
                    <td>
                        <div class="flex flex-wrap gap-1">
                            ${!isOverseer ? `
                                <button onclick="toggleOverseerStatus('${admin.id}', true)" class="vamosfesta-button text-xs py-1" title="Make Gate Overseer">
                                    <i class="fas fa-shield-alt"></i>
                                </button>
                            ` : `
                                <button onclick="showAssignGatesModal('${admin.id}')" class="vamosfesta-button success text-xs py-1" title="Assign Gates">
                                    <i class="fas fa-door-open"></i>
                                </button>
                                <button onclick="toggleOverseerStatus('${admin.id}', false)" class="vamosfesta-button danger text-xs py-1" title="Remove Gate Overseer">
                                    <i class="fas fa-shield-alt"></i>
                                </button>
                            `}
                            ${!isSiptokenOverseer ? `
                                <button onclick="toggleSiptokenOverseerStatus('${admin.id}', true)" class="vamosfesta-button secondary text-xs py-1" title="Make SipToken Overseer" style="background: #3b82f6; border-color: #3b82f6;">
                                    <i class="fas fa-coins"></i>
                                </button>
                            ` : `
                                <button onclick="toggleSiptokenOverseerStatus('${admin.id}', false)" class="vamosfesta-button danger text-xs py-1" title="Remove SipToken Overseer">
                                    <i class="fas fa-coins"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Load gate overseer assignments view
        await loadGateOverseerAssignments();
        
    } catch (error) {
        console.error('Error loading admins:', error);
        showToast('Failed to load admins', 'error');
    }
}

async function loadGateOverseerAssignments() {
    try {
        const { data: gates, error: gatesError } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('is_active', true)
            .order('gate_name');
        
        if (gatesError) throw gatesError;
        
        const { data: assignments, error: assignError } = await supabase
            .from('overseer_assignments')
            .select('*, users!overseer_assignments_overseer_id_fkey(full_name), entry_gates(gate_name, gate_code)');
        
        if (assignError) throw assignError;
        
        const container = document.getElementById('gateOverseersList');
        if (!gates || gates.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">No gates configured</p>';
            return;
        }
        
        container.innerHTML = gates.map(gate => {
            const gateAssignments = assignments?.filter(a => a.gate_id === gate.id) || [];
            const leadOverseer = gateAssignments.find(a => a.is_lead_overseer);
            
            return `
                <div class="card ${gateAssignments.length > 0 ? 'bg-green-900/20 border-green-600/30' : 'bg-gray-800/50 border-gray-700'}">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-semibold text-yellow-400">${escapeHtml(gate.gate_name)} <span class="text-xs text-gray-500">(${gate.gate_code})</span></h4>
                            <p class="text-sm text-gray-400 mt-1">
                                ${gateAssignments.length > 0 
                                    ? `<strong>Overseers:</strong> ${gateAssignments.map(a => {
                                        const lead = a.is_lead_overseer ? '⭐ ' : '';
                                        return `${lead}${escapeHtml(a.users.full_name)}`;
                                    }).join(', ')}`
                                    : '<span class="text-gray-500">No overseers assigned</span>'
                                }
                            </p>
                            ${leadOverseer ? `<p class="text-xs text-orange-400 mt-1"><i class="fas fa-star mr-1"></i>Lead: ${escapeHtml(leadOverseer.users.full_name)}</p>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading gate overseer assignments:', error);
    }
}

window.showAddAdminModal = function() {
    document.getElementById('adminForm').reset();
    
    // Reset checkboxes
    const gateOverseerCheckbox = document.getElementById('adminIsGateOverseer');
    const siptokenOverseerCheckbox = document.getElementById('adminIsSiptokenOverseer');
    const siptokenSalesCheckbox = document.getElementById('adminIsSiptokenSales');
    const barmanCheckbox = document.getElementById('adminIsBarman');
    if (gateOverseerCheckbox) gateOverseerCheckbox.checked = false;
    if (siptokenOverseerCheckbox) siptokenOverseerCheckbox.checked = false;
    if (siptokenSalesCheckbox) siptokenSalesCheckbox.checked = false;
    if (barmanCheckbox) barmanCheckbox.checked = false;
    
    openModal('adminModal');
};

document.getElementById('adminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const adminData = {
        username: document.getElementById('adminUsername').value.trim(),
        password: document.getElementById('adminPassword').value,
        full_name: document.getElementById('adminFullName').value.trim(),
        mobile_number: document.getElementById('adminMobile').value.trim(),
        role: 'admin',
        created_by: currentUser.id,
        // Gate Overseer
        is_gate_overseer: document.getElementById('adminIsGateOverseer')?.checked || false,
        // SipToken roles
        is_siptoken_overseer: document.getElementById('adminIsSiptokenOverseer')?.checked || false,
        is_siptoken_sales: document.getElementById('adminIsSiptokenSales')?.checked || false,
        is_barman: document.getElementById('adminIsBarman')?.checked || false
    };
    
    if (adminData.password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('users')
            .insert(adminData);
        
        if (error) throw error;
        
        showToast('Admin created successfully', 'success');
        closeModal('adminModal');
        await loadAdmins();
        
    } catch (error) {
        console.error('Error creating admin:', error);
        showToast('Failed to create admin: ' + error.message, 'error');
    }
});

window.toggleOverseerStatus = async function(adminId, makeOverseer) {
    const action = makeOverseer ? 'designate as Overseer' : 'remove Overseer status from';
    if (!confirm(`Are you sure you want to ${action} this admin?`)) return;
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ is_gate_overseer: makeOverseer })
            .eq('id', adminId);
        
        if (error) throw error;
        
        // If removing overseer status, also remove all gate assignments
        if (!makeOverseer) {
            await supabase
                .from('overseer_assignments')
                .delete()
                .eq('overseer_id', adminId);
        }
        
        showToast(makeOverseer ? 'Admin designated as Overseer' : 'Overseer status removed', 'success');
        await loadAdmins();
        
    } catch (error) {
        console.error('Error toggling overseer status:', error);
        showToast('Failed to update overseer status', 'error');
    }
};

// Toggle SipToken Overseer status
window.toggleSiptokenOverseerStatus = async function(adminId, makeOverseer) {
    const action = makeOverseer ? 'designate as SipToken Overseer' : 'remove SipToken Overseer status from';
    if (!confirm(`Are you sure you want to ${action} this admin?`)) return;
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ is_siptoken_overseer: makeOverseer })
            .eq('id', adminId);
        
        if (error) throw error;
        
        showToast(makeOverseer ? 'Admin designated as SipToken Overseer' : 'SipToken Overseer status removed', 'success');
        await loadAdmins();
        
    } catch (error) {
        console.error('Error toggling SipToken overseer status:', error);
        showToast('Failed to update SipToken overseer status', 'error');
    }
};

window.showAssignGatesModal = async function(overseerId) {
    try {
        // Load all gates
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('is_active', true)
            .order('gate_name');
        
        if (error) throw error;
        
        // Load existing assignments
        const { data: assignments } = await supabase
            .from('overseer_assignments')
            .select('*')
            .eq('overseer_id', overseerId);
        
        const assignedGateIds = new Set(assignments?.map(a => a.gate_id) || []);
        const hasLeadAssignment = assignments?.some(a => a.is_lead_overseer);
        
        const checkboxList = document.getElementById('gateCheckboxList');
        checkboxList.innerHTML = gates.map(gate => `
            <label class="flex items-center p-2 hover:bg-gray-700/30 rounded cursor-pointer">
                <input type="checkbox" name="gates" value="${gate.id}" ${assignedGateIds.has(gate.id) ? 'checked' : ''} class="mr-2">
                <span>${escapeHtml(gate.gate_name)} <span class="text-xs text-gray-500">(${gate.gate_code})</span></span>
            </label>
        `).join('');
        
        document.getElementById('isLeadOverseer').checked = hasLeadAssignment;
        document.getElementById('assignOverseerId').value = overseerId;
        
        openModal('assignGatesModal');
        
    } catch (error) {
        console.error('Error loading assign gates modal:', error);
        showToast('Failed to load gates', 'error');
    }
};

document.getElementById('assignGatesForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const overseerId = document.getElementById('assignOverseerId').value;
    const checkboxes = document.querySelectorAll('input[name="gates"]:checked');
    const selectedGateIds = Array.from(checkboxes).map(cb => cb.value);
    const isLead = document.getElementById('isLeadOverseer').checked;
    
    if (selectedGateIds.length === 0) {
        showToast('Please select at least one gate', 'error');
        return;
    }
    
    try {
        // Remove existing assignments
        await supabase
            .from('overseer_assignments')
            .delete()
            .eq('overseer_id', overseerId);
        
        // Insert new assignments
        const assignments = selectedGateIds.map(gateId => ({
            overseer_id: overseerId,
            gate_id: gateId,
            is_lead_overseer: isLead,
            assigned_by: currentUser.id
        }));
        
        const { error } = await supabase
            .from('overseer_assignments')
            .insert(assignments);
        
        if (error) throw error;
        
        showToast('Gates assigned successfully', 'success');
        closeModal('assignGatesModal');
        await loadAdmins();
        
    } catch (error) {
        console.error('Error assigning gates:', error);
        showToast('Failed to assign gates: ' + error.message, 'error');
    }
});

// =====================================================
// OVERSEER: MARSHALL MANAGEMENT
// =====================================================

async function loadOverseerGates() {
    if (!currentUser || !currentUser.is_gate_overseer) return;
    
    try {
        const { data: assignments, error } = await supabase
            .from('overseer_assignments')
            .select('*, entry_gates(*)')
            .eq('overseer_id', currentUser.id);
        
        if (error) throw error;
        
        const container = document.getElementById('overseerGatesList');
        if (!assignments || assignments.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4 col-span-full">No gates assigned to you</p>';
            return;
        }
        
        container.innerHTML = assignments.map(a => {
            const gate = a.entry_gates;
            const isLead = a.is_lead_overseer;
            
            return `
                <div class="card ${isLead ? 'bg-yellow-900/20 border-yellow-600/30' : 'bg-green-900/20 border-green-600/30'}">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="font-semibold text-yellow-400">${escapeHtml(gate.gate_name)}</h4>
                            <p class="text-xs text-gray-500">${gate.gate_code}</p>
                        </div>
                        ${isLead ? '<span class="status-badge" style="background: #f59e0b; color: white;"><i class="fas fa-star mr-1"></i>Lead</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-400">${gate.description || 'No description'}</p>
                </div>
            `;
        }).join('');
        
        // Load marshall roster
        await loadMarshallRoster();
        await loadClockinTokens();
        await loadClockoutRequests();
        
    } catch (error) {
        console.error('Error loading overseer gates:', error);
        showToast('Failed to load gates', 'error');
    }
}

async function loadMarshallRoster() {
    try {
        const { data: marshalls, error: marshallsError } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'entry_marshall')
            .eq('is_active', true);
        
        if (marshallsError) throw marshallsError;
        
        const { data: roster, error: rosterError } = await supabase
            .from('gate_roster')
            .select('*, entry_gates(gate_name, gate_code)');
        
        if (rosterError) throw rosterError;
        
        const { data: duties, error: dutiesError } = await supabase
            .from('marshall_duties')
            .select('marshall_id, status')
            .eq('status', 'on_duty');
        
        if (dutiesError) throw dutiesError;
        
        const onDutyMarshalls = new Set(duties?.map(d => d.marshall_id) || []);
        
        const tbody = document.getElementById('marshallRosterBody');
        if (!marshalls || marshalls.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No entry marshalls found</td></tr>';
            return;
        }
        
        tbody.innerHTML = marshalls.map(marshall => {
            const assignment = roster?.find(r => r.marshall_id === marshall.id);
            const isOnDuty = onDutyMarshalls.has(marshall.id);
            
            const statusBadge = isOnDuty 
                ? '<span class="status-badge" style="background: #10b981; color: white;"><i class="fas fa-broadcast-tower mr-1"></i>On Duty</span>'
                : '<span class="status-badge" style="background: #6b7280; color: white;">Off Duty</span>';
            
            return `
                <tr>
                    <td class="font-semibold">${escapeHtml(marshall.full_name)}</td>
                    <td>${marshall.mobile_number}</td>
                    <td>${assignment ? `${escapeHtml(assignment.entry_gates.gate_name)} <span class="text-xs text-gray-500">(${assignment.entry_gates.gate_code})</span>` : '<span class="text-gray-500">Not assigned</span>'}</td>
                    <td>${statusBadge}</td>
                    <td>
                        ${!assignment ? `
                            <button onclick="showAssignMarshallModal('${marshall.id}')" class="vamosfesta-button text-sm">
                                <i class="fas fa-plus mr-1"></i>Assign
                            </button>
                        ` : `
                            <button onclick="unassignMarshall('${marshall.id}')" class="vamosfesta-button danger text-sm">
                                <i class="fas fa-times mr-1"></i>Unassign
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading marshall roster:', error);
        showToast('Failed to load marshall roster', 'error');
    }
}

window.showAssignMarshallModal = async function(marshallId) {
    try {
        // Load overseer's gates
        const { data: assignments, error } = await supabase
            .from('overseer_assignments')
            .select('*, entry_gates(*)')
            .eq('overseer_id', currentUser.id);
        
        if (error) throw error;
        
        const gateSelect = document.getElementById('gateAssignSelect');
        gateSelect.innerHTML = '<option value="">-- Select Gate --</option>' +
            assignments.map(a => `<option value="${a.gate_id}">${escapeHtml(a.entry_gates.gate_name)} (${a.entry_gates.gate_code})</option>`).join('');
        
        // Store marshall ID in hidden field or data attribute
        document.getElementById('assignMarshallForm').dataset.marshallId = marshallId;
        
        openModal('assignMarshallModal');
        
    } catch (error) {
        console.error('Error loading assign modal:', error);
        showToast('Failed to load assign modal', 'error');
    }
};

document.getElementById('assignMarshallForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const marshallId = e.target.dataset.marshallId;
    const gateId = document.getElementById('gateAssignSelect').value;
    const notes = document.getElementById('assignmentNotes').value.trim();
    
    if (!gateId) {
        showToast('Please select a gate', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('gate_roster')
            .insert({
                marshall_id: marshallId,
                gate_id: gateId,
                assigned_by: currentUser.id,
                notes: notes || null
            });
        
        if (error) throw error;
        
        showToast('Marshall assigned successfully', 'success');
        closeModal('assignMarshallModal');
        await loadMarshallRoster();
        
    } catch (error) {
        console.error('Error assigning marshall:', error);
        showToast('Failed to assign marshall: ' + error.message, 'error');
    }
});

window.unassignMarshall = async function(marshallId) {
    if (!confirm('Remove this marshall from their assigned gate?')) return;
    
    try {
        const { error } = await supabase
            .from('gate_roster')
            .delete()
            .eq('marshall_id', marshallId);
        
        if (error) throw error;
        
        showToast('Marshall unassigned', 'success');
        await loadMarshallRoster();
        
    } catch (error) {
        console.error('Error unassigning marshall:', error);
        showToast('Failed to unassign marshall', 'error');
    }
};

async function loadClockinTokens() {
    try {
        const { data: tokens, error } = await supabase
            .from('clockin_tokens')
            .select('*, entry_gates(gate_name, gate_code)')
            .eq('overseer_id', currentUser.id)
            .is('used_at', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('clockinTokensList');
        if (!tokens || tokens.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">No active tokens</p>';
            return;
        }
        
        container.innerHTML = tokens.map(token => {
            const expiresAt = new Date(token.expires_at);
            const now = new Date();
            const minsRemaining = Math.floor((expiresAt - now) / 60000);
            
            return `
                <div class="card bg-green-900/20 border-green-600/30">
                    <div class="flex justify-between items-center">
                        <div>
                            <h5 class="font-semibold text-yellow-400">${escapeHtml(token.entry_gates.gate_name)}</h5>
                            <p class="text-xs text-gray-500">Token: ${token.token.substring(0, 8)}...</p>
                            <p class="text-xs text-orange-400 mt-1">
                                <i class="fas fa-clock mr-1"></i>Expires in ${minsRemaining} minutes
                            </p>
                        </div>
                        <button onclick="showTokenQR('${token.token}')" class="vamosfesta-button text-sm">
                            <i class="fas fa-qrcode"></i> Show QR
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading clockin tokens:', error);
    }
}

window.showGenerateTokenModal = async function() {
    try {
        // Load overseer's gates
        const { data: assignments, error } = await supabase
            .from('overseer_assignments')
            .select('*, entry_gates(*)')
            .eq('overseer_id', currentUser.id);
        
        if (error) throw error;
        
        const gateSelect = document.getElementById('tokenGateSelect');
        gateSelect.innerHTML = '<option value="">-- Select Gate --</option>' +
            assignments.map(a => `<option value="${a.gate_id}">${escapeHtml(a.entry_gates.gate_name)} (${a.entry_gates.gate_code})</option>`).join('');
        
        document.getElementById('tokenPreview').classList.add('hidden');
        openModal('generateTokenModal');
        
    } catch (error) {
        console.error('Error loading token modal:', error);
        showToast('Failed to load token modal', 'error');
    }
};

document.getElementById('generateTokenForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const gateId = document.getElementById('tokenGateSelect').value;
    const validity = parseInt(document.getElementById('tokenValidity').value);
    
    if (!gateId) {
        showToast('Please select a gate', 'error');
        return;
    }
    
    try {
        // Generate random token
        const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        const expiresAt = new Date(Date.now() + validity * 60000).toISOString();
        
        const { error } = await supabase
            .from('clockin_tokens')
            .insert({
                gate_id: gateId,
                overseer_id: currentUser.id,
                token: token,
                expires_at: expiresAt
            });
        
        if (error) throw error;
        
        // Generate QR code
        const qrData = JSON.stringify({
            type: 'clockin_token',
            token: token,
            gate_id: gateId
        });
        
        const qrCodeDiv = document.getElementById('tokenQRCode');
        qrCodeDiv.innerHTML = '';
        
        const qrCodeDataURL = await QRCode.toDataURL(qrData, {
            width: 200,
            margin: 2,
            color: { dark: '#0a0a0a', light: '#ffffff' }
        });
        
        qrCodeDiv.innerHTML = `<img src="${qrCodeDataURL}" alt="Clock-in Token QR">`;
        document.getElementById('tokenCode').textContent = token.substring(0, 16) + '...';
        document.getElementById('tokenPreview').classList.remove('hidden');
        
        showToast('Token generated successfully', 'success');
        await loadClockinTokens();
        
    } catch (error) {
        console.error('Error generating token:', error);
        showToast('Failed to generate token: ' + error.message, 'error');
    }
});

async function loadClockoutRequests() {
    try {
        // Get gates overseen by this overseer
        const { data: assignments } = await supabase
            .from('overseer_assignments')
            .select('gate_id')
            .eq('overseer_id', currentUser.id);
        
        const gateIds = assignments?.map(a => a.gate_id) || [];
        
        if (gateIds.length === 0) {
            document.getElementById('clockoutRequestsList').innerHTML = 
                '<p class="text-center text-gray-500 py-4">No gates assigned</p>';
            return;
        }
        
        const { data: requests, error } = await supabase
            .from('clockout_requests')
            .select('*, users(full_name), entry_gates(gate_name, gate_code)')
            .in('gate_id', gateIds)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('clockoutRequestsList');
        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">No pending requests</p>';
            return;
        }
        
        container.innerHTML = requests.map(req => {
            const requestTime = new Date(req.created_at);
            const timeAgo = formatTimeAgo(req.created_at);
            
            return `
                <div class="card bg-orange-900/20 border-orange-600/30">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h5 class="font-semibold">${escapeHtml(req.users.full_name)}</h5>
                            <p class="text-xs text-gray-500">${escapeHtml(req.entry_gates.gate_name)} (${req.entry_gates.gate_code})</p>
                            <p class="text-xs text-gray-400 mt-1"><i class="fas fa-clock mr-1"></i>${timeAgo}</p>
                        </div>
                        <span class="status-badge" style="background: #f59e0b; color: white;">Pending</span>
                    </div>
                    <p class="text-sm mb-3"><strong>Reason:</strong> ${escapeHtml(req.reason)}</p>
                    <div class="flex gap-2">
                        <button onclick="approveClockout('${req.id}')" class="vamosfesta-button success flex-1 text-sm">
                            <i class="fas fa-check mr-1"></i>Approve
                        </button>
                        <button onclick="rejectClockout('${req.id}')" class="vamosfesta-button danger flex-1 text-sm">
                            <i class="fas fa-times mr-1"></i>Reject
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading clockout requests:', error);
    }
}

window.approveClockout = async function(requestId) {
    try {
        // Get request details
        const { data: request, error: fetchError } = await supabase
            .from('clockout_requests')
            .select('duty_id')
            .eq('id', requestId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Update duty status
        await supabase
            .from('marshall_duties')
            .update({
                status: 'off_duty',
                clock_out_at: new Date().toISOString()
            })
            .eq('id', request.duty_id);
        
        // Update request status
        const { error } = await supabase
            .from('clockout_requests')
            .update({
                status: 'approved',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', requestId);
        
        if (error) throw error;
        
        showToast('Clockout approved', 'success');
        await loadClockoutRequests();
        
    } catch (error) {
        console.error('Error approving clockout:', error);
        showToast('Failed to approve clockout', 'error');
    }
};

window.rejectClockout = async function(requestId) {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    
    try {
        const { error } = await supabase
            .from('clockout_requests')
            .update({
                status: 'rejected',
                rejection_reason: reason,
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', requestId);
        
        if (error) throw error;
        
        showToast('Clockout rejected', 'success');
        await loadClockoutRequests();
        
    } catch (error) {
        console.error('Error rejecting clockout:', error);
        showToast('Failed to reject clockout', 'error');
    }
};

// =====================================================
// PWA: OFFLINE MODE HANDLING
// =====================================================

function initializeOfflineMode() {
    // Create offline indicator
    const offlineIndicator = document.createElement('div');
    offlineIndicator.id = 'offlineIndicator';
    offlineIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 8px 16px;
        background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
        color: white;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: none;
        align-items: center;
        gap: 8px;
        animation: pulse 2s ease-in-out infinite;
    `;
    offlineIndicator.innerHTML = `
        <i class="fas fa-wifi" style="transform: rotate(180deg);"></i>
        <span>Offline Mode</span>
    `;
    document.body.appendChild(offlineIndicator);
    
    // Update online/offline status
    function updateOnlineStatus() {
        const isOnline = navigator.onLine;
        offlineIndicator.style.display = isOnline ? 'none' : 'flex';
        
        if (isOnline) {
            console.log('🟢 Back online - syncing pending data...');
            syncPendingData();
        } else {
            console.log('🔴 Offline mode activated');
            showToast('You are offline. Data will sync when connection returns.', 'warning');
        }
    }
    
    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial check
    updateOnlineStatus();
}

async function syncPendingData() {
    try {
        // Trigger background sync if available
        if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-registrations');
            await registration.sync.register('sync-scans');
            console.log('✅ Background sync registered');
        }
        
        // Manual sync fallback
        await syncPendingRegistrations();
        await syncPendingScans();
        
        showToast('✅ All pending data synced', 'success');
    } catch (error) {
        console.error('Sync error:', error);
    }
}

async function syncPendingRegistrations() {
    // Get pending registrations from localStorage
    const pending = JSON.parse(localStorage.getItem('pending_registrations') || '[]');
    
    if (pending.length === 0) return;
    
    console.log(`Syncing ${pending.length} pending registrations...`);
    
    const synced = [];
    const failed = [];
    
    for (const reg of pending) {
        try {
            const { error } = await supabase
                .from('guests')
                .insert(reg.data);
            
            if (!error) {
                synced.push(reg.id);
            } else {
                failed.push(reg.id);
            }
        } catch (error) {
            failed.push(reg.id);
        }
    }
    
    // Remove synced registrations
    const remaining = pending.filter(r => !synced.includes(r.id));
    localStorage.setItem('pending_registrations', JSON.stringify(remaining));
    
    if (synced.length > 0) {
        console.log(`✅ Synced ${synced.length} registrations`);
        await loadMySales();
    }
}

async function syncPendingScans() {
    const pending = JSON.parse(localStorage.getItem('pending_scans') || '[]');
    
    if (pending.length === 0) return;
    
    console.log(`Syncing ${pending.length} pending scans...`);
    
    const synced = [];
    
    for (const scan of pending) {
        try {
            const { error } = await supabase
                .from('guest_movements')
                .insert(scan.data);
            
            if (!error) {
                synced.push(scan.id);
            }
        } catch (error) {
            console.error('Scan sync failed:', error);
        }
    }
    
    const remaining = pending.filter(s => !synced.includes(s.id));
    localStorage.setItem('pending_scans', JSON.stringify(remaining));
    
    if (synced.length > 0) {
        console.log(`✅ Synced ${synced.length} scans`);
    }
}

// Save registration offline
async function saveRegistrationOffline(guestData) {
    const pending = JSON.parse(localStorage.getItem('pending_registrations') || '[]');
    
    const offlineReg = {
        id: Date.now().toString(),
        data: guestData,
        timestamp: new Date().toISOString()
    };
    
    pending.push(offlineReg);
    localStorage.setItem('pending_registrations', JSON.stringify(pending));
    
    console.log('📥 Registration saved offline');
    showToast('✅ Registration saved offline. Will sync when online.', 'info');
}

// Save scan offline
async function saveScanOffline(scanData) {
    const pending = JSON.parse(localStorage.getItem('pending_scans') || '[]');
    
    const offlineScan = {
        id: Date.now().toString(),
        data: scanData,
        timestamp: new Date().toISOString()
    };
    
    pending.push(offlineScan);
    localStorage.setItem('pending_scans', JSON.stringify(pending));
    
    console.log('📥 Scan saved offline');
    showToast('✅ Scan saved offline. Will sync when online.', 'info');
}

// Check if user has pending offline data
function hasPendingData() {
    const pendingRegs = JSON.parse(localStorage.getItem('pending_registrations') || '[]');
    const pendingScans = JSON.parse(localStorage.getItem('pending_scans') || '[]');
    return pendingRegs.length > 0 || pendingScans.length > 0;
}

// Install prompt for PWA
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install button
    const installBtn = document.createElement('button');
    installBtn.className = 'vamosfesta-button';
    installBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(212, 168, 83, 0.4);
    `;
    installBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Install App';
    installBtn.onclick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User ${outcome} the install prompt`);
            deferredPrompt = null;
            installBtn.remove();
        }
    };
    
    // Only show if not already installed
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        document.body.appendChild(installBtn);
        
        // Auto-remove after 10 seconds
        setTimeout(() => installBtn.remove(), 10000);
    }
});

window.addEventListener('appinstalled', () => {
    console.log('✅ PWA installed successfully');
    showToast('✅ App installed! Launch from your home screen.', 'success');
    deferredPrompt = null;
});

// Load gates and venue status when statistics tab is shown
const originalLoadStatistics = loadStatistics;
loadStatistics = async function() {
    await originalLoadStatistics();
    await loadVenueStatus();
    await loadGates();
};

// Make functions globally available
window.loadMySales = loadMySales;
window.loadVerificationQueue = loadVerificationQueue;
window.loadAllRegistrations = loadAllRegistrations;
window.loadSellers = loadSellers;
window.loadStatistics = loadStatistics;
window.loadEntryStats = loadEntryStats;
window.loadVenueStatus = loadVenueStatus;
window.loadGates = loadGates;
window.loadGateManagement = loadGateManagement;
window.loadAdmins = loadAdmins;
window.loadOverseerGates = loadOverseerGates;

// =====================================================
// SIPTOKEN MODULE INTEGRATION
// =====================================================

// SipToken Initialization
window.siptokenRate = 10; // Default rate

async function initializeSipToken() {
    console.log('🔄 Initializing SipToken...');
    
    // Load token rate from settings
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        if (data && data.setting_value) {
            window.siptokenRate = parseInt(data.setting_value) || 10;
        }
    } catch (e) {
        console.warn('Could not load token rate, using default:', e);
    }
    
    console.log('✅ SipToken initialized with rate: ₹' + window.siptokenRate);
}

// Search guest for token purchase
window.searchGuestForTokens = async function() {
    const phone = document.getElementById('guestPhoneSearch')?.value?.trim();
    
    if (!phone || phone.length < 10) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        return;
    }
    
    showToast('Searching...', 'info');
    
    try {
        // Find guest by phone
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*')
            .eq('phone', phone)
            .single();
        
        if (error || !guest) {
            showToast('Guest not found with this phone number', 'error');
            return;
        }
        
        // Check if guest is verified
        if (!['verified', 'pass_sent', 'checked_in'].includes(guest.status)) {
            showToast('Guest pass not verified yet. Cannot sell tokens.', 'error');
            return;
        }
        
        // Find or create wallet
        let { data: wallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('guest_phone', phone)
            .single();
        
        if (!wallet) {
            const { data: newWallet, error: walletError } = await supabase
                .from('token_wallets')
                .insert({
                    guest_id: guest.id,
                    guest_name: guest.guest_name,
                    guest_phone: phone,
                    token_balance: 0
                })
                .select()
                .single();
            
            if (walletError) throw walletError;
            wallet = newWallet;
        }
        
        // Store globally
        window.currentTokenWallet = wallet;
        window.currentTokenGuest = guest;
        
        // Show purchase modal
        showTokenPurchaseModal(guest, wallet);
        
    } catch (error) {
        console.error('Guest search error:', error);
        showToast('Failed to search guest', 'error');
    }
};

// Show token purchase modal
function showTokenPurchaseModal(guest, wallet) {
    document.getElementById('purchaseGuestName').textContent = guest.guest_name;
    document.getElementById('purchaseGuestPhone').textContent = guest.phone;
    document.getElementById('purchaseCurrentBalance').textContent = wallet.token_balance || 0;
    document.getElementById('purchaseTokenRate').textContent = '₹' + (window.siptokenRate || 10);
    document.getElementById('purchaseTokenAmount').value = '';
    document.getElementById('purchaseTotalAmount').textContent = '₹0';
    document.getElementById('purchasePaymentMethod').value = 'cash';
    
    openModal('tokenPurchaseModal');
}

// Calculate purchase amount
window.calculatePurchaseAmount = function() {
    const tokens = parseInt(document.getElementById('purchaseTokenAmount').value) || 0;
    const rate = window.siptokenRate || 10;
    const amount = tokens * rate;
    document.getElementById('purchaseTotalAmount').textContent = '₹' + amount;
};

// Process token purchase
window.processTokenPurchase = async function() {
    const tokens = parseInt(document.getElementById('purchaseTokenAmount').value);
    const paymentMethod = document.getElementById('purchasePaymentMethod').value;
    
    if (!tokens || tokens < 1) {
        showToast('Please enter a valid token amount', 'error');
        return;
    }
    
    if (!window.currentTokenWallet) {
        showToast('No guest selected', 'error');
        return;
    }
    
    const rate = window.siptokenRate || 10;
    const amount = tokens * rate;
    
    try {
        // Record purchase
        const { data: purchase, error } = await supabase
            .from('token_purchases')
            .insert({
                wallet_id: window.currentTokenWallet.id,
                seller_id: currentUser.id,
                tokens_purchased: tokens,
                amount_paid: amount,
                payment_method: paymentMethod,
                transaction_status: 'completed'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update wallet balance
        const newBalance = (window.currentTokenWallet.token_balance || 0) + tokens;
        
        const { error: walletError } = await supabase
            .from('token_wallets')
            .update({ token_balance: newBalance })
            .eq('id', window.currentTokenWallet.id);
        
        if (walletError) throw walletError;
        
        showToast(`✅ ${tokens} tokens sold successfully! New balance: ${newBalance}`, 'success');
        closeModal('tokenPurchaseModal');
        
        // Clear search
        document.getElementById('guestPhoneSearch').value = '';
        
        // Refresh stats
        await loadSalesStaffStats();
        
    } catch (error) {
        console.error('Purchase error:', error);
        showToast('Failed to process purchase: ' + error.message, 'error');
    }
};

// =====================================================
// SIPTOKEN QR SCANNERS
// =====================================================

let siptokenScanner = null;

// Start Guest QR Scanner
window.startGuestQRScanner = async function() {
    const modal = document.getElementById('guestQRScannerModal');
    const video = document.getElementById('guestScanVideo');
    
    if (!modal || !video) {
        showToast('Scanner not available', 'error');
        return;
    }
    
    openModal('guestQRScannerModal');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        await video.play();
        
        // Start scanning loop
        siptokenScanner = setInterval(() => {
            scanGuestQR(video);
        }, 500);
        
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Unable to access camera. Please check permissions.', 'error');
        closeModal('guestQRScannerModal');
    }
};

// Stop Guest QR Scanner
window.stopGuestQRScanner = function() {
    const video = document.getElementById('guestScanVideo');
    
    if (siptokenScanner) {
        clearInterval(siptokenScanner);
        siptokenScanner = null;
    }
    
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    closeModal('guestQRScannerModal');
};

// Scan Guest QR Code
async function scanGuestQR(video) {
    if (!window.jsQR) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
        stopGuestQRScanner();
        
        try {
            const qrData = JSON.parse(code.data);
            
            if (qrData.type === 'guest_pass' && qrData.guest_id) {
                // Found guest pass
                const { data: guest, error } = await supabase
                    .from('guests')
                    .select('*')
                    .eq('id', qrData.guest_id)
                    .single();
                
                if (guest) {
                    // Find or create wallet
                    let { data: wallet } = await supabase
                        .from('token_wallets')
                        .select('*')
                        .eq('guest_id', guest.id)
                        .single();
                    
                    if (!wallet) {
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
                        wallet = newWallet;
                    }
                    
                    window.currentTokenWallet = wallet;
                    window.currentTokenGuest = guest;
                    
                    showTokenPurchaseModal(guest, wallet);
                } else {
                    showToast('Guest not found', 'error');
                }
            } else {
                showToast('Invalid guest pass QR code', 'error');
            }
        } catch (e) {
            showToast('Invalid QR code format', 'error');
        }
    }
}

// Start Barman Scanner
window.startBarmanScanner = async function() {
    const modal = document.getElementById('barmanScannerModal');
    const video = document.getElementById('barmanScanVideo');
    
    if (!modal || !video) {
        showToast('Scanner not available', 'error');
        return;
    }
    
    openModal('barmanScannerModal');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        await video.play();
        
        // Start scanning loop
        siptokenScanner = setInterval(() => {
            scanOrderQR(video);
        }, 500);
        
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Unable to access camera', 'error');
        closeModal('barmanScannerModal');
    }
};

// Stop Barman Scanner
window.stopBarmanScanner = function() {
    const video = document.getElementById('barmanScanVideo');
    
    if (siptokenScanner) {
        clearInterval(siptokenScanner);
        siptokenScanner = null;
    }
    
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    closeModal('barmanScannerModal');
};

// Scan Order QR Code
async function scanOrderQR(video) {
    if (!window.jsQR) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
        stopBarmanScanner();
        
        try {
            const qrData = JSON.parse(code.data);
            
            if (qrData.type === 'token_order' && qrData.order_id) {
                // Load order details
                const { data: order, error } = await supabase
                    .from('token_orders')
                    .select('*, token_wallets(guest_name, guest_phone, token_balance), order_items:token_order_items(*, beverage_menu(name))')
                    .eq('id', qrData.order_id)
                    .single();
                
                if (error || !order) {
                    showToast('Order not found', 'error');
                    return;
                }
                
                // Check if expired (5 minutes)
                const orderTime = new Date(order.created_at);
                const now = new Date();
                const diffSeconds = (now - orderTime) / 1000;
                
                if (diffSeconds > 300) {
                    showToast('Order QR has expired. Ask guest to create new order.', 'error');
                    return;
                }
                
                if (order.status !== 'pending') {
                    showToast(`Order already ${order.status}`, 'error');
                    return;
                }
                
                // Show order confirmation modal
                showOrderConfirmationModal(order);
                
            } else {
                showToast('Invalid order QR code', 'error');
            }
        } catch (e) {
            showToast('Invalid QR code format', 'error');
        }
    }
}

// Show Order Confirmation Modal
function showOrderConfirmationModal(order) {
    document.getElementById('orderGuestName').textContent = order.token_wallets?.guest_name || 'Unknown';
    document.getElementById('orderTotalTokens').textContent = order.total_tokens || 0;
    
    // Show items
    const itemsContainer = document.getElementById('orderItemsList');
    if (order.order_items && order.order_items.length > 0) {
        itemsContainer.innerHTML = order.order_items.map(item => `
            <div class="flex justify-between py-2 border-b border-gray-700">
                <span>${item.beverage_menu?.name || 'Item'} × ${item.quantity}</span>
                <span class="text-yellow-400">${(item.token_price || 0) * item.quantity} tokens</span>
            </div>
        `).join('');
    } else {
        itemsContainer.innerHTML = '<p class="text-gray-500">No items listed</p>';
    }
    
    // Store order info
    document.getElementById('currentOrderId').value = order.id;
    document.getElementById('currentWalletId').value = order.wallet_id;
    
    openModal('orderConfirmationModal');
}

// Serve Order
window.serveOrder = async function() {
    const orderId = document.getElementById('currentOrderId').value;
    const walletId = document.getElementById('currentWalletId').value;
    
    if (!orderId) return;
    
    try {
        // Get order details
        const { data: order } = await supabase
            .from('token_orders')
            .select('total_tokens')
            .eq('id', orderId)
            .single();
        
        // Get wallet
        const { data: wallet } = await supabase
            .from('token_wallets')
            .select('token_balance')
            .eq('id', walletId)
            .single();
        
        // Calculate new balance
        const newBalance = (wallet?.token_balance || 0) - (order?.total_tokens || 0);
        
        // Update wallet
        await supabase
            .from('token_wallets')
            .update({ token_balance: Math.max(0, newBalance) })
            .eq('id', walletId);
        
        // Update order status
        await supabase
            .from('token_orders')
            .update({ 
                status: 'served',
                barman_id: currentUser.id,
                served_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        showToast('✅ Order served! Tokens deducted.', 'success');
        closeModal('orderConfirmationModal');
        
        // Refresh stats
        loadBarmanStats();
        
    } catch (error) {
        console.error('Serve error:', error);
        showToast('Failed to process order', 'error');
    }
};

// Reject Order
window.rejectOrder = async function() {
    const orderId = document.getElementById('currentOrderId').value;
    
    if (!orderId) return;
    
    const reason = prompt('Reason for rejection (optional):');
    
    try {
        await supabase
            .from('token_orders')
            .update({ 
                status: 'rejected',
                barman_id: currentUser.id,
                rejection_reason: reason || 'No reason provided'
            })
            .eq('id', orderId);
        
        showToast('Order rejected. No tokens deducted.', 'info');
        closeModal('orderConfirmationModal');
        
        loadBarmanStats();
        
    } catch (error) {
        console.error('Reject error:', error);
        showToast('Failed to reject order', 'error');
    }
};

// Load barman stats
window.loadBarmanStats = async function() {
    if (!currentUser || !currentUser.is_barman) return;
    
    try {
        // Get today's orders
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: orders, error } = await supabase
            .from('beverage_orders')
            .select('*')
            .eq('barman_id', currentUser.id)
            .gte('created_at', today.toISOString());
        
        if (error) throw error;
        
        const totalOrders = orders?.length || 0;
        const totalTokens = orders?.reduce((sum, o) => sum + (o.tokens_spent || 0), 0) || 0;
        
        document.getElementById('barmanOrdersToday').textContent = totalOrders;
        document.getElementById('barmanTokensProcessed').textContent = totalTokens;
        
        // Load recent orders
        loadBarmanRecentOrders(orders);
        
    } catch (error) {
        console.error('Error loading barman stats:', error);
    }
};

function loadBarmanRecentOrders(orders) {
    const container = document.getElementById('barmanOrdersList');
    if (!container) return;
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No orders yet</p>';
        return;
    }
    
    container.innerHTML = orders.slice(0, 10).map(order => `
        <div class="card bg-gray-800/50 mb-2">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold">${order.items?.description || 'Order'}</p>
                    <p class="text-sm text-gray-400">${new Date(order.created_at).toLocaleTimeString()}</p>
                </div>
                <span class="text-yellow-500 font-bold">${order.tokens_spent} tokens</span>
            </div>
        </div>
    `).join('');
}

// Load sales staff stats
window.loadSalesStaffStats = async function() {
    if (!currentUser || !currentUser.is_siptoken_sales) return;
    
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: purchases, error } = await supabase
            .from('token_purchases')
            .select('*')
            .eq('seller_id', currentUser.id)
            .gte('created_at', today.toISOString());
        
        if (error) throw error;
        
        const totalTokens = purchases?.reduce((sum, p) => sum + (p.tokens_purchased || 0), 0) || 0;
        const totalRevenue = purchases?.reduce((sum, p) => sum + (p.amount_paid || 0), 0) || 0;
        
        document.getElementById('salesStaffTokensSold').textContent = totalTokens;
        document.getElementById('salesStaffRevenue').textContent = `₹${totalRevenue.toFixed(2)}`;
        document.getElementById('salesStaffTransactions').textContent = purchases?.length || 0;
        
    } catch (error) {
        console.error('Error loading sales stats:', error);
    }
};

// Load overseer stats and duty sessions
window.loadOverseerStats = async function() {
    if (!currentUser || !currentUser.is_siptoken_overseer) return;
    
    try {
        // Get active duty sessions
        const { data: sessions, error: sessionsError } = await supabase
            .from('siptoken_duty_sessions')
            .select('*, staff:staff_id(full_name)')
            .eq('status', 'on_duty');
        
        if (sessionsError) throw sessionsError;
        
        document.getElementById('overseerStaffOnDuty').textContent = sessions?.length || 0;
        
        // Load duty sessions list
        loadDutySessions(sessions);
        
        // Get today's analytics
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: purchases } = await supabase
            .from('token_purchases')
            .select('*')
            .gte('created_at', today.toISOString());
        
        const { data: orders } = await supabase
            .from('beverage_orders')
            .select('*')
            .gte('created_at', today.toISOString());
        
        const totalTokens = purchases?.reduce((sum, p) => sum + (p.tokens_purchased || 0), 0) || 0;
        const totalRevenue = purchases?.reduce((sum, p) => sum + (p.amount_paid || 0), 0) || 0;
        
        document.getElementById('overseerTotalTokens').textContent = totalTokens;
        document.getElementById('overseerTotalOrders').textContent = orders?.length || 0;
        document.getElementById('overseerTotalRevenue').textContent = `₹${totalRevenue.toFixed(2)}`;
        
    } catch (error) {
        console.error('Error loading overseer stats:', error);
    }
};

window.loadDutySessions = async function(sessions) {
    const container = document.getElementById('overseerDutySessions');
    if (!container) return;
    
    if (!sessions) {
        const { data, error } = await supabase
            .from('siptoken_duty_sessions')
            .select('*, users(full_name)')
            .eq('status', 'on_duty')
            .order('clock_in_time', { ascending: false });
        
        if (error) {
            console.error('Error loading sessions:', error);
            return;
        }
        sessions = data;
    }
    
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No active staff</p>';
        return;
    }
    
    container.innerHTML = sessions.map(session => {
        const duration = Math.floor((new Date() - new Date(session.clock_in_time)) / 1000 / 60);
        return `
            <div class="card bg-gray-800/50 mb-3">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-bold">${session.users.full_name}</h4>
                        <p class="text-sm text-gray-400">${session.counter_name}</p>
                        <p class="text-xs text-gray-500">
                            ${session.staff_role === 'token_sales' ? '💰 Sales Staff' : '🍹 Barman'}
                        </p>
                    </div>
                    <span class="status-badge" style="background: #22c55e;">On Duty</span>
                </div>
                <p class="text-xs text-gray-500 mb-2">
                    <i class="fas fa-clock mr-1"></i> ${duration} min
                </p>
                <button onclick="showClockOutModal('${session.id}')" class="vamosfesta-button danger w-full text-sm">
                    <i class="fas fa-sign-out-alt mr-2"></i>Clock Out
                </button>
            </div>
        `;
    }).join('');
};

// Add to role data loading
const originalLoadRoleData = loadRoleData;
async function loadRoleDataWithSipToken() {
    await originalLoadRoleData();
    
    // Initialize SipToken
    await initializeSipToken();
    
    // Load role-specific SipToken data
    if (currentUser.is_siptoken_sales) {
        await loadSalesStaffStats();
    } else if (currentUser.is_barman) {
        await loadBarmanStats();
    } else if (currentUser.is_siptoken_overseer) {
        await loadOverseerStats();
    }
}

// Override loadRoleData
loadRoleData = loadRoleDataWithSipToken;

// Add SipToken tab to navigation
function addSipTokenTab() {
    const tabContainer = document.querySelector('.tab-buttons');
    if (!tabContainer) return;
    
    const siptokenButton = document.createElement('button');
    siptokenButton.className = 'tab-button';
    siptokenButton.setAttribute('data-tab', 'siptokenTab');
    siptokenButton.innerHTML = '<i class="fas fa-coins mr-2"></i>SipToken';
    siptokenButton.onclick = () => showTab('siptokenTab');
    
    tabContainer.appendChild(siptokenButton);
}

// Show appropriate SipToken role content
function showSipTokenRoleContent() {
    const allRoleContent = document.querySelectorAll('.role-content');
    allRoleContent.forEach(el => el.classList.add('hidden'));
    
    if (currentUser.is_siptoken_sales) {
        document.querySelector('.sales-staff-content')?.classList.remove('hidden');
    } else if (currentUser.is_barman) {
        document.querySelector('.barman-content')?.classList.remove('hidden');
    } else if (currentUser.is_siptoken_overseer) {
        document.querySelector('.overseer-content')?.classList.remove('hidden');
        // Initialize overseer dashboard with staff section by default
        showOverseerSection('staff');
        loadOverseerDashboardStats();
    }
}

// Hook into tab showing
const originalShowTab = showTab;
function showTabWithSipToken(tabName) {
    originalShowTab(tabName);
    
    if (tabName === 'siptokenTab') {
        showSipTokenRoleContent();
    }
    
    // Load menu when settings tab is shown (for Super Admin)
    if (tabName === 'settings' && currentUser?.role === 'super_admin') {
        loadMenuItems();
        loadTokenRate();
    }
}

showTab = showTabWithSipToken;

console.log('✅ SipToken integration loaded');

// =====================================================
// SIPTOKEN MENU MANAGEMENT (Super Admin Settings)
// =====================================================

let menuItemsCache = [];
let currentMenuFilter = 'all';

// Load token rate
async function loadTokenRate() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        if (data) {
            document.getElementById('settingTokenRate').value = data.setting_value;
        }
    } catch (error) {
        console.error('Error loading token rate:', error);
    }
}

// Save token rate
window.saveTokenRate = async function() {
    const rate = parseInt(document.getElementById('settingTokenRate').value);
    
    if (!rate || rate < 1) {
        showToast('Please enter a valid token rate', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('settings')
            .upsert({ key: 'token_rate', value: rate.toString() }, { onConflict: 'key' });
        
        if (error) throw error;
        showToast('Token rate saved: ₹' + rate + ' per token', 'success');
    } catch (error) {
        console.error('Error saving token rate:', error);
        showToast('Failed to save token rate', 'error');
    }
};

// Load menu items
async function loadMenuItems() {
    try {
        const { data, error } = await supabase
            .from('beverage_menu')
            .select('*')
            .order('category')
            .order('name');
        
        if (error) throw error;
        
        menuItemsCache = data || [];
        renderMenuItems();
    } catch (error) {
        console.error('Error loading menu items:', error);
        document.getElementById('menuItemsList').innerHTML = 
            '<p class="text-red-400 text-sm text-center py-4">Failed to load menu</p>';
    }
}

// Filter menu by category
window.filterMenuCategory = function(category) {
    currentMenuFilter = category;
    
    // Update button styles
    document.querySelectorAll('.menu-cat-btn').forEach(btn => {
        btn.classList.remove('bg-gray-700');
        btn.classList.add('bg-gray-800');
    });
    document.querySelector(`.menu-cat-btn[data-cat="${category}"]`)?.classList.remove('bg-gray-800');
    document.querySelector(`.menu-cat-btn[data-cat="${category}"]`)?.classList.add('bg-gray-700');
    
    renderMenuItems();
};

// Render menu items
function renderMenuItems() {
    const container = document.getElementById('menuItemsList');
    
    let items = menuItemsCache;
    if (currentMenuFilter !== 'all') {
        items = items.filter(item => item.category === currentMenuFilter);
    }
    
    if (items.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No items in this category</p>';
        return;
    }
    
    const categoryIcons = {
        'alcoholic': '🍺',
        'non_alcoholic': '🥤',
        'snacks': '🍿'
    };
    
    container.innerHTML = items.map(item => `
        <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg ${!item.is_available ? 'opacity-50' : ''}">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span>${categoryIcons[item.category] || '🍽️'}</span>
                    <span class="font-semibold">${escapeHtml(item.name)}</span>
                    ${item.measure ? `<span class="text-xs text-gray-400">(${escapeHtml(item.measure)})</span>` : ''}
                </div>
                <div class="text-sm text-yellow-400 mt-1">
                    <i class="fas fa-coins mr-1"></i>${item.token_price} tokens
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="toggleMenuItemAvailability('${item.id}', ${item.is_available})" 
                        class="px-2 py-1 rounded text-xs ${item.is_available ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}">
                    ${item.is_available ? '✓ Available' : '✗ Unavailable'}
                </button>
                <button onclick="editMenuItem('${item.id}')" class="text-blue-400 hover:text-blue-300 p-1">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteMenuItem('${item.id}', '${escapeHtml(item.name)}')" class="text-red-400 hover:text-red-300 p-1">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Open modal to add new item
window.openMenuItemModal = function() {
    document.getElementById('menuItemModalTitle').textContent = 'Add Menu Item';
    document.getElementById('menuItemForm').reset();
    document.getElementById('editMenuItemId').value = '';
    document.getElementById('menuItemAvailable').checked = true;
    openModal('menuItemModal');
};

// Edit existing item
window.editMenuItem = async function(itemId) {
    const item = menuItemsCache.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('menuItemModalTitle').textContent = 'Edit Menu Item';
    document.getElementById('editMenuItemId').value = itemId;
    document.getElementById('menuItemCategory').value = item.category;
    document.getElementById('menuItemName').value = item.name;
    document.getElementById('menuItemMeasure').value = item.measure || '';
    document.getElementById('menuItemTokens').value = item.token_price;
    document.getElementById('menuItemAvailable').checked = item.is_available;
    
    openModal('menuItemModal');
};

// Save menu item (add or update)
window.saveMenuItem = async function(event) {
    event.preventDefault();
    
    const itemId = document.getElementById('editMenuItemId').value;
    const isEdit = !!itemId;
    
    const itemData = {
        category: document.getElementById('menuItemCategory').value,
        name: document.getElementById('menuItemName').value.trim(),
        measure: document.getElementById('menuItemMeasure').value.trim() || null,
        token_price: parseInt(document.getElementById('menuItemTokens').value),
        is_available: document.getElementById('menuItemAvailable').checked
    };
    
    if (!itemData.name) {
        showToast('Please enter item name', 'error');
        return;
    }
    
    if (!itemData.token_price || itemData.token_price < 0) {
        showToast('Please enter valid token price', 'error');
        return;
    }
    
    try {
        if (isEdit) {
            const { error } = await supabase
                .from('beverage_menu')
                .update(itemData)
                .eq('id', itemId);
            
            if (error) throw error;
            showToast('Menu item updated!', 'success');
        } else {
            const { error } = await supabase
                .from('beverage_menu')
                .insert([itemData]);
            
            if (error) throw error;
            showToast('Menu item added!', 'success');
        }
        
        closeModal('menuItemModal');
        await loadMenuItems();
    } catch (error) {
        console.error('Error saving menu item:', error);
        showToast('Failed to save menu item', 'error');
    }
};

// Toggle item availability
window.toggleMenuItemAvailability = async function(itemId, currentStatus) {
    try {
        const { error } = await supabase
            .from('beverage_menu')
            .update({ is_available: !currentStatus })
            .eq('id', itemId);
        
        if (error) throw error;
        
        showToast(currentStatus ? 'Item marked unavailable' : 'Item marked available', 'success');
        await loadMenuItems();
    } catch (error) {
        console.error('Error toggling availability:', error);
        showToast('Failed to update item', 'error');
    }
};

// Delete menu item
window.deleteMenuItem = async function(itemId, itemName) {
    if (!confirm(`Delete "${itemName}" from the menu?`)) return;
    
    try {
        const { error } = await supabase
            .from('beverage_menu')
            .delete()
            .eq('id', itemId);
        
        if (error) throw error;
        
        showToast('Menu item deleted', 'success');
        await loadMenuItems();
    } catch (error) {
        console.error('Error deleting menu item:', error);
        showToast('Failed to delete item', 'error');
    }
};

console.log('✅ SipToken Menu Management loaded');

// =====================================================
// USERNAME NAMING PROTOCOL SYSTEM
// =====================================================

// Role prefix mapping
const ROLE_PREFIXES = {
    'super_admin': 'Admin',
    'admin': 'Viewer',
    'gate_overseer': 'GateOvr',
    'siptoken_overseer': 'TokenOvr',
    'presales_seller': 'PreSales',
    'event_seller': 'EventSales',
    'seller': 'EventSales',  // Legacy support
    'entry_marshall': 'Marshall',
    'token_sales': 'TokenSales',
    'barman': 'BevServe'
};

// Role metadata for preview
const ROLE_METADATA = {
    'super_admin': {
        icon: '👑',
        title: 'Super Admin',
        desc: 'Full system access, back office operations',
        reportsTo: 'Event Committee',
        color: 'border-yellow-500'
    },
    'admin': {
        icon: '📊',
        title: 'Admin (Read-Only)',
        desc: 'View reports and statistics only',
        reportsTo: 'Super Admin',
        color: 'border-blue-500'
    },
    'gate_overseer': {
        icon: '🚪',
        title: 'Gate Overseer',
        desc: 'Manages Entry Marshalls & Venue Sellers',
        reportsTo: 'Super Admin',
        color: 'border-cyan-500'
    },
    'siptoken_overseer': {
        icon: '👔',
        title: 'SipToken Overseer',
        desc: 'Manages Token Sales & Barmen',
        reportsTo: 'Super Admin',
        color: 'border-purple-500'
    },
    'presales_seller': {
        icon: '🎫',
        title: 'Pre-Event Sales',
        desc: 'Off-site ticket sales before event',
        reportsTo: 'Super Admin',
        color: 'border-green-500'
    },
    'event_seller': {
        icon: '🎟️',
        title: 'Event Sales (Venue)',
        desc: 'On-site ticket sales at venue entrance',
        reportsTo: 'Gate Overseer',
        color: 'border-green-500'
    },
    'seller': {
        icon: '🎟️',
        title: 'Event Sales',
        desc: 'Guest registration and ticket sales',
        reportsTo: 'Gate Overseer',
        color: 'border-green-500'
    },
    'entry_marshall': {
        icon: '🚧',
        title: 'Entry Marshall',
        desc: 'Scans guest passes at gates',
        reportsTo: 'Gate Overseer',
        color: 'border-yellow-500'
    },
    'token_sales': {
        icon: '💰',
        title: 'Token Sales Staff',
        desc: 'Sells SipTokens to guests',
        reportsTo: 'SipToken Overseer',
        color: 'border-orange-500'
    },
    'barman': {
        icon: '🍹',
        title: 'Barman (Bev Service)',
        desc: 'Serves drinks, scans order QR codes',
        reportsTo: 'SipToken Overseer',
        color: 'border-purple-500'
    }
};

// Update role selection - shows preview and updates username
window.updateRoleSelection = function() {
    const roleSelect = document.getElementById('userRoleSelect');
    const selectedRole = roleSelect.value;
    const previewCard = document.getElementById('rolePreviewCard');
    const prefixSpan = document.getElementById('usernamePrefix');
    
    if (!selectedRole) {
        previewCard?.classList.add('hidden');
        if (prefixSpan) prefixSpan.textContent = '---';
        return;
    }
    
    const metadata = ROLE_METADATA[selectedRole];
    const prefix = ROLE_PREFIXES[selectedRole] || 'User';
    
    // Update prefix display
    if (prefixSpan) {
        prefixSpan.textContent = prefix;
    }
    
    // Update preview card
    if (previewCard && metadata) {
        previewCard.classList.remove('hidden');
        previewCard.className = `card border-2 ${metadata.color}`;
        
        document.getElementById('rolePreviewIcon').textContent = metadata.icon;
        document.getElementById('rolePreviewTitle').textContent = metadata.title;
        document.getElementById('rolePreviewDesc').textContent = metadata.desc;
        document.getElementById('roleReportsTo').textContent = metadata.reportsTo;
    }
    
    // Regenerate username
    generateUsername();
};

// Generate username from role prefix + first name
window.generateUsername = function() {
    const roleSelect = document.getElementById('userRoleSelect');
    const firstNameInput = document.getElementById('userFirstName');
    const usernameValueSpan = document.getElementById('usernameValue');
    const usernameHidden = document.getElementById('userUsername');
    
    const selectedRole = roleSelect?.value;
    const firstName = firstNameInput?.value?.trim().replace(/\s+/g, '');
    
    if (!selectedRole || !firstName) {
        if (usernameValueSpan) usernameValueSpan.textContent = '---';
        if (usernameHidden) usernameHidden.value = '';
        return;
    }
    
    const prefix = ROLE_PREFIXES[selectedRole] || 'User';
    
    // Sanitize first name - remove special characters, capitalize first letter
    const sanitizedName = firstName
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^./, c => c.toUpperCase());
    
    const username = `${prefix}-${sanitizedName}`;
    
    if (usernameValueSpan) usernameValueSpan.textContent = sanitizedName || '---';
    if (usernameHidden) usernameHidden.value = username;
    
    return username;
};

// Toggle password visibility
window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    const icon = input?.nextElementSibling?.querySelector('i');
    
    if (input) {
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            if (icon) icon.className = 'fas fa-eye';
        }
    }
};

// Check username availability
async function checkUsernameAvailability(username) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        
        return !data; // Available if no user found
    } catch (e) {
        return true; // Assume available on error
    }
}

// Handle user form submission with new naming protocol
document.getElementById('userForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId')?.value;
    const role = document.getElementById('userRoleSelect').value;
    const firstName = document.getElementById('userFirstName').value.trim();
    const username = document.getElementById('userUsername').value;
    const fullName = document.getElementById('userFullName').value.trim();
    const password = document.getElementById('userPassword').value;
    const mobile = document.getElementById('userMobile').value.trim();
    const clubName = document.getElementById('userClubName')?.value?.trim() || null;
    const clubNumber = document.getElementById('userClubNumber')?.value?.trim() || null;
    
    // Validation
    if (!role) {
        showToast('Please select a role', 'error');
        return;
    }
    
    if (!firstName || firstName.length < 2) {
        showToast('Please enter a valid first name (min 2 characters)', 'error');
        return;
    }
    
    if (!username) {
        showToast('Username not generated. Please select role and enter name.', 'error');
        return;
    }
    
    if (!fullName) {
        showToast('Please enter full name', 'error');
        return;
    }
    
    if (!userId && (!password || password.length < 6)) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    if (!mobile || mobile.length !== 10) {
        showToast('Please enter valid 10-digit mobile number', 'error');
        return;
    }
    
    // Check username availability (for new users)
    if (!userId) {
        const isAvailable = await checkUsernameAvailability(username);
        if (!isAvailable) {
            showToast(`Username "${username}" already exists. Try a different name.`, 'error');
            return;
        }
    }
    
    // Map role to database fields
    const userData = {
        username: username,
        full_name: fullName,
        phone: mobile,
        club_name: clubName,
        club_number: clubNumber,
        // Base role (for legacy compatibility)
        role: mapRoleToBaseRole(role),
        // Specific role flags
        is_gate_overseer: role === 'gate_overseer',
        is_siptoken_overseer: role === 'siptoken_overseer',
        is_siptoken_sales: role === 'token_sales',
        is_barman: role === 'barman',
        is_entry_marshall: role === 'entry_marshall'
    };
    
    if (!userId) {
        userData.password = password;
    }
    
    try {
        if (userId) {
            // Update existing user
            const { error } = await supabase
                .from('users')
                .update(userData)
                .eq('id', userId);
            
            if (error) throw error;
            showToast('User updated successfully!', 'success');
        } else {
            // Create new user
            const { data, error } = await supabase
                .from('users')
                .insert([userData])
                .select()
                .single();
            
            if (error) throw error;
            showToast(`User "${username}" created successfully!`, 'success');
            
            // Optionally create staff badge
            if (['entry_marshall', 'token_sales', 'barman', 'event_seller', 'gate_overseer', 'siptoken_overseer'].includes(role)) {
                await createStaffBadge(data.id, fullName, role);
            }
        }
        
        closeModal('userModal');
        document.getElementById('userForm').reset();
        
        // Refresh user lists
        if (typeof loadSellers === 'function') await loadSellers();
        if (typeof loadAdmins === 'function') await loadAdmins();
        
    } catch (error) {
        console.error('Error saving user:', error);
        showToast('Failed to save user: ' + error.message, 'error');
    }
});

// Map new role system to legacy base roles
function mapRoleToBaseRole(role) {
    const roleMap = {
        'super_admin': 'super_admin',
        'admin': 'admin',
        'gate_overseer': 'admin',  // Base as admin, flag determines overseer
        'siptoken_overseer': 'admin',
        'presales_seller': 'seller',
        'event_seller': 'seller',
        'seller': 'seller',
        'entry_marshall': 'entry_marshall',
        'token_sales': 'seller',  // Base as seller, flag determines token sales
        'barman': 'seller'  // Base as seller, flag determines barman
    };
    return roleMap[role] || 'seller';
}

// Create staff badge for new user
async function createStaffBadge(userId, fullName, designation) {
    try {
        const prefix = {
            'guest_seller': 'VF-GS',
            'event_seller': 'VF-ES',
            'entry_marshall': 'VF-EM',
            'token_sales': 'VF-TS',
            'barman': 'VF-BM',
            'gate_overseer': 'VF-GO',
            'siptoken_overseer': 'VF-SO'
        }[designation] || 'VF-XX';
        
        const year = new Date().getFullYear();
        
        // Get next badge number
        const { data: existing } = await supabase
            .from('staff_badges')
            .select('badge_code')
            .like('badge_code', `${prefix}-${year}-%`);
        
        const nextNum = (existing?.length || 0) + 1;
        const badgeCode = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;
        
        const qrData = JSON.stringify({
            type: 'staff_badge',
            badge_code: badgeCode,
            user_id: userId,
            designation: designation,
            name: fullName
        });
        
        await supabase.from('staff_badges').insert({
            user_id: userId,
            badge_code: badgeCode,
            designation: designation,
            qr_data: qrData,
            created_by: currentUser?.id
        });
        
        console.log(`✅ Badge ${badgeCode} created for ${fullName}`);
        
    } catch (error) {
        console.error('Error creating badge:', error);
    }
}

// Open user modal for adding new user
window.openAddUserModal = function() {
    document.getElementById('userForm').reset();
    document.getElementById('editUserId').value = '';
    document.getElementById('userModalTitle').textContent = 'Add New Staff Member';
    document.getElementById('usernamePrefix').textContent = '---';
    document.getElementById('usernameValue').textContent = '---';
    document.getElementById('rolePreviewCard')?.classList.add('hidden');
    openModal('userModal');
};

// Edit existing user
window.editUser = async function(userId) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error || !user) {
            showToast('User not found', 'error');
            return;
        }
        
        document.getElementById('editUserId').value = userId;
        document.getElementById('userModalTitle').textContent = 'Edit User';
        
        // Determine role from flags
        let role = user.role;
        if (user.is_siptoken_overseer) role = 'siptoken_overseer';
        else if (user.is_gate_overseer) role = 'gate_overseer';
        else if (user.is_barman) role = 'barman';
        else if (user.is_siptoken_sales) role = 'token_sales';
        else if (user.is_entry_marshall) role = 'entry_marshall';
        
        document.getElementById('userRoleSelect').value = role;
        
        // Extract first name from username
        const namePart = user.username.split('-')[1] || '';
        document.getElementById('userFirstName').value = namePart;
        
        document.getElementById('userFullName').value = user.full_name || '';
        document.getElementById('userPassword').value = '';  // Don't show password
        document.getElementById('userMobile').value = user.phone || '';
        document.getElementById('userClubName').value = user.club_name || '';
        document.getElementById('userClubNumber').value = user.club_number || '';
        
        updateRoleSelection();
        
        openModal('userModal');
        
    } catch (error) {
        console.error('Error loading user:', error);
        showToast('Failed to load user', 'error');
    }
};

console.log('✅ Username Naming Protocol System loaded');

// =====================================================
// SELLER INVOICE FLOW - Token Sales Staff Dashboard
// =====================================================

// State for token sales
let selectedGuestForTokens = null;
let currentTokenRate = 10;
let pendingInvoicesCache = [];

// Initialize token sales dashboard
async function initTokenSalesDashboard() {
    await loadTokenRateForSales();
    await loadPendingInvoices();
    await loadSalesStaffStats();
    await loadRecentConfirmedSales();
}

// Load token rate from settings
async function loadTokenRateForSales() {
    try {
        const { data } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        if (data) {
            currentTokenRate = parseInt(data.setting_value) || 10;
            const rateEl = document.getElementById('invoiceTokenRate');
            if (rateEl) rateEl.textContent = currentTokenRate;
            calculateInvoiceTotal();
        }
    } catch (error) {
        console.log('Using default token rate:', currentTokenRate);
    }
}

// Search guest by phone number
window.searchGuestForTokens = async function() {
    const phone = document.getElementById('guestPhoneSearch')?.value?.trim();
    
    if (!phone || phone.length !== 10) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        return;
    }
    
    try {
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*, token_wallets(*)')
            .eq('phone', phone)
            .single();
        
        if (error || !guest) {
            showToast('Guest not found with this phone number', 'error');
            return;
        }
        
        // Check if guest has entry
        if (guest.entry_status !== 'entered') {
            showToast('Guest has not entered the venue yet', 'warning');
        }
        
        selectGuestForTokenSale(guest);
        
    } catch (error) {
        console.error('Error searching guest:', error);
        showToast('Failed to search guest', 'error');
    }
};

// Start QR scanner for guest pass
window.startGuestQRScanner = function() {
    openModal('qrScannerModal');
    
    // Initialize scanner if html5-qrcode is available
    if (typeof Html5Qrcode !== 'undefined') {
        const scanner = new Html5Qrcode('qrScannerPreview');
        
        scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                scanner.stop();
                closeModal('qrScannerModal');
                
                try {
                    const qrData = JSON.parse(decodedText);
                    
                    if (qrData.type === 'guest_pass' && qrData.guest_id) {
                        // Fetch guest by ID
                        const { data: guest, error } = await supabase
                            .from('guests')
                            .select('*, token_wallets(*)')
                            .eq('id', qrData.guest_id)
                            .single();
                        
                        if (error || !guest) {
                            showToast('Guest not found', 'error');
                            return;
                        }
                        
                        selectGuestForTokenSale(guest);
                    } else {
                        showToast('Invalid guest pass QR code', 'error');
                    }
                } catch (e) {
                    showToast('Could not read QR code', 'error');
                }
            },
            (error) => {
                // Scan error - ignore
            }
        ).catch(err => {
            console.error('Scanner error:', err);
            showToast('Could not start camera', 'error');
        });
    } else {
        // Fallback: Manual entry
        const guestId = prompt('Enter Guest ID (QR scanner not available):');
        if (guestId) {
            searchGuestById(guestId);
        }
    }
};

// Search guest by ID (fallback)
async function searchGuestById(guestId) {
    try {
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*, token_wallets(*)')
            .eq('id', guestId)
            .single();
        
        if (error || !guest) {
            showToast('Guest not found', 'error');
            return;
        }
        
        selectGuestForTokenSale(guest);
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to find guest', 'error');
    }
}

// Select guest for token sale
function selectGuestForTokenSale(guest) {
    selectedGuestForTokens = guest;
    
    // Get wallet balance
    const wallet = guest.token_wallets?.[0] || guest.token_wallets;
    const balance = wallet?.balance || 0;
    
    // Update UI
    document.getElementById('invoiceGuestName').textContent = guest.name || 'Guest';
    document.getElementById('invoiceGuestPhone').textContent = guest.phone || '-';
    document.getElementById('invoiceGuestBalance').innerHTML = `${balance} <span class="text-sm">tokens</span>`;
    
    // Show step 2, keep step 1 visible but collapsed
    document.getElementById('tokenSalesStep1').classList.add('opacity-50');
    document.getElementById('tokenSalesStep2').classList.remove('hidden');
    
    // Reset token quantity
    document.getElementById('invoiceTokenQty').value = 10;
    calculateInvoiceTotal();
    
    showToast(`Guest found: ${guest.name}`, 'success');
}

// Clear selected guest
window.clearSelectedGuest = function() {
    selectedGuestForTokens = null;
    document.getElementById('tokenSalesStep1').classList.remove('opacity-50');
    document.getElementById('tokenSalesStep2').classList.add('hidden');
    document.getElementById('guestPhoneSearch').value = '';
};

// Adjust token quantity
window.adjustTokenQty = function(delta) {
    const input = document.getElementById('invoiceTokenQty');
    let qty = parseInt(input.value) || 0;
    qty = Math.max(1, Math.min(500, qty + delta));
    input.value = qty;
    calculateInvoiceTotal();
};

// Set specific token quantity
window.setTokenQty = function(qty) {
    document.getElementById('invoiceTokenQty').value = qty;
    calculateInvoiceTotal();
};

// Calculate invoice total
window.calculateInvoiceTotal = function() {
    const qty = parseInt(document.getElementById('invoiceTokenQty')?.value) || 0;
    const total = qty * currentTokenRate;
    const totalEl = document.getElementById('invoiceTotal');
    if (totalEl) totalEl.textContent = total;
};

// Send invoice to guest via WhatsApp
window.sendInvoiceToGuest = async function() {
    if (!selectedGuestForTokens) {
        showToast('Please select a guest first', 'error');
        return;
    }
    
    const tokenQty = parseInt(document.getElementById('invoiceTokenQty').value) || 0;
    
    if (tokenQty < 1) {
        showToast('Please enter token quantity', 'error');
        return;
    }
    
    const totalAmount = tokenQty * currentTokenRate;
    
    try {
        // Generate invoice number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const { count } = await supabase
            .from('siptoken_invoices')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', new Date().toISOString().slice(0, 10));
        
        const invoiceNumber = `INV-${today}-${String((count || 0) + 1).padStart(4, '0')}`;
        
        // Create invoice in database
        const { data: invoice, error } = await supabase
            .from('siptoken_invoices')
            .insert({
                invoice_number: invoiceNumber,
                guest_id: selectedGuestForTokens.id,
                seller_id: currentUser.id,
                tokens_requested: tokenQty,
                token_rate: currentTokenRate,
                amount: totalAmount,
                status: 'pending',
                expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min expiry
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Generate WhatsApp message with payment link
        const guestPhone = selectedGuestForTokens.phone;
        const guestName = selectedGuestForTokens.name;
        
        // Payment link (will be a page where guest selects Cash/UPI)
        const paymentLink = `${window.location.origin}/payment.html?inv=${invoice.id}`;
        
        const message = `🎉 *Vamos Festa - Token Invoice*

Hi ${guestName}!

Invoice: *${invoiceNumber}*
Tokens: *${tokenQty}*
Amount: *₹${totalAmount}*

💳 Select your payment method:
${paymentLink}

⏰ Valid for 30 minutes

_41'ers Clubs of India - Area 8_`;

        // Open WhatsApp
        const whatsappUrl = `https://wa.me/91${guestPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        
        showToast(`Invoice ${invoiceNumber} sent to ${guestName}`, 'success');
        
        // Clear and refresh
        clearSelectedGuest();
        loadPendingInvoices();
        loadSalesStaffStats();
        
    } catch (error) {
        console.error('Error creating invoice:', error);
        showToast('Failed to create invoice: ' + error.message, 'error');
    }
};

// Load pending invoices for this seller
window.loadPendingInvoices = async function() {
    if (!currentUser) return;
    
    try {
        const { data: invoices, error } = await supabase
            .from('siptoken_invoices')
            .select('*, guests(name, phone)')
            .eq('seller_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        pendingInvoicesCache = invoices || [];
        
        // Update pending count
        document.getElementById('salesStaffPending').textContent = pendingInvoicesCache.length;
        
        const container = document.getElementById('pendingInvoicesList');
        if (!container) return;
        
        if (pendingInvoicesCache.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No pending invoices</p>';
            return;
        }
        
        container.innerHTML = pendingInvoicesCache.map(inv => {
            const guest = inv.guests;
            const createdAt = new Date(inv.created_at);
            const expiresAt = new Date(inv.expires_at);
            const isExpired = expiresAt < new Date();
            const timeAgo = getTimeAgo(createdAt);
            
            return `
                <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg mb-2 ${isExpired ? 'opacity-50' : ''}">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-sm text-orange-400">${inv.invoice_number}</span>
                            ${isExpired ? '<span class="text-xs bg-red-600 px-2 py-0.5 rounded">EXPIRED</span>' : ''}
                        </div>
                        <p class="text-white font-medium">${guest?.name || 'Guest'}</p>
                        <p class="text-xs text-gray-400">${inv.tokens_requested} tokens • ₹${inv.amount} • ${timeAgo}</p>
                    </div>
                    <div class="flex gap-2">
                        ${!isExpired ? `
                            <button onclick="confirmPayment('${inv.id}', 'cash')" class="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium">
                                <i class="fas fa-money-bill-wave mr-1"></i>Cash
                            </button>
                            <button onclick="confirmPayment('${inv.id}', 'upi')" class="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
                                <i class="fas fa-mobile-alt mr-1"></i>UPI
                            </button>
                        ` : `
                            <button onclick="cancelInvoice('${inv.id}')" class="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm">
                                <i class="fas fa-times mr-1"></i>Remove
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading pending invoices:', error);
    }
};

// Confirm payment and credit tokens
window.confirmPayment = async function(invoiceId, paymentMethod) {
    if (!confirm(`Confirm ${paymentMethod.toUpperCase()} payment received?`)) return;
    
    try {
        // Get invoice details
        const { data: invoice, error: fetchError } = await supabase
            .from('siptoken_invoices')
            .select('*, guests(id, name, phone)')
            .eq('id', invoiceId)
            .single();
        
        if (fetchError || !invoice) throw new Error('Invoice not found');
        
        if (invoice.status !== 'pending') {
            showToast('Invoice already processed', 'warning');
            loadPendingInvoices();
            return;
        }
        
        // Update invoice status
        const { error: updateError } = await supabase
            .from('siptoken_invoices')
            .update({
                status: 'confirmed',
                payment_method: paymentMethod,
                confirmed_at: new Date().toISOString(),
                confirmed_by: currentUser.id
            })
            .eq('id', invoiceId);
        
        if (updateError) throw updateError;
        
        // Get or create wallet for guest
        let { data: wallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('guest_id', invoice.guest_id)
            .single();
        
        if (!wallet) {
            // Create wallet
            const { data: newWallet, error: walletError } = await supabase
                .from('token_wallets')
                .insert({
                    guest_id: invoice.guest_id,
                    balance: 0
                })
                .select()
                .single();
            
            if (walletError) throw walletError;
            wallet = newWallet;
        }
        
        // Credit tokens to wallet
        const newBalance = (wallet.balance || 0) + invoice.tokens_requested;
        
        const { error: creditError } = await supabase
            .from('token_wallets')
            .update({ 
                balance: newBalance,
                last_purchase_at: new Date().toISOString()
            })
            .eq('id', wallet.id);
        
        if (creditError) throw creditError;
        
        // Record the purchase
        await supabase.from('token_purchases').insert({
            wallet_id: wallet.id,
            invoice_id: invoiceId,
            tokens: invoice.tokens_requested,
            amount: invoice.amount,
            payment_method: paymentMethod,
            seller_id: currentUser.id
        });
        
        // Send confirmation WhatsApp
        const guestPhone = invoice.guests?.phone;
        const guestName = invoice.guests?.name;
        const portalLink = `${window.location.origin}/guest.html?guest=${invoice.guest_id}`;
        
        const confirmMsg = `✅ *Payment Confirmed!*

Hi ${guestName}!

${invoice.tokens_requested} tokens added to your wallet.
💰 New Balance: *${newBalance} tokens*

🍹 Order drinks here:
${portalLink}

Enjoy the party! 🎉
_Vamos Festa_`;

        const whatsappUrl = `https://wa.me/91${guestPhone}?text=${encodeURIComponent(confirmMsg)}`;
        window.open(whatsappUrl, '_blank');
        
        showToast(`${invoice.tokens_requested} tokens credited to ${guestName}!`, 'success');
        
        // Refresh lists
        loadPendingInvoices();
        loadRecentConfirmedSales();
        loadSalesStaffStats();
        
    } catch (error) {
        console.error('Error confirming payment:', error);
        showToast('Failed to confirm payment: ' + error.message, 'error');
    }
};

// Cancel/remove expired invoice
window.cancelInvoice = async function(invoiceId) {
    try {
        await supabase
            .from('siptoken_invoices')
            .update({ status: 'cancelled' })
            .eq('id', invoiceId);
        
        showToast('Invoice removed', 'success');
        loadPendingInvoices();
        
    } catch (error) {
        console.error('Error:', error);
    }
};

// Load sales staff statistics
async function loadSalesStaffStats() {
    if (!currentUser) return;
    
    try {
        const today = new Date().toISOString().slice(0, 10);
        
        // Get today's confirmed invoices
        const { data: sales } = await supabase
            .from('siptoken_invoices')
            .select('tokens_requested, amount')
            .eq('seller_id', currentUser.id)
            .eq('status', 'confirmed')
            .gte('created_at', today);
        
        const totalTokens = sales?.reduce((sum, s) => sum + s.tokens_requested, 0) || 0;
        const totalRevenue = sales?.reduce((sum, s) => sum + s.amount, 0) || 0;
        const totalTransactions = sales?.length || 0;
        
        document.getElementById('salesStaffTokensSold').textContent = totalTokens;
        document.getElementById('salesStaffRevenue').textContent = `₹${totalRevenue}`;
        document.getElementById('salesStaffTransactions').textContent = totalTransactions;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load recent confirmed sales
async function loadRecentConfirmedSales() {
    if (!currentUser) return;
    
    try {
        const { data: sales } = await supabase
            .from('siptoken_invoices')
            .select('*, guests(name, phone)')
            .eq('seller_id', currentUser.id)
            .eq('status', 'confirmed')
            .order('confirmed_at', { ascending: false })
            .limit(10);
        
        const container = document.getElementById('salesStaffRecentSales');
        if (!container) return;
        
        if (!sales || sales.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No confirmed sales yet</p>';
            return;
        }
        
        container.innerHTML = sales.map(sale => {
            const guest = sale.guests;
            const timeAgo = getTimeAgo(new Date(sale.confirmed_at));
            
            return `
                <div class="flex items-center justify-between p-2 border-b border-gray-800 last:border-0">
                    <div>
                        <p class="text-white font-medium">${guest?.name || 'Guest'}</p>
                        <p class="text-xs text-gray-500">${timeAgo} • ${sale.payment_method?.toUpperCase() || 'Cash'}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-green-400 font-bold">${sale.tokens_requested} tokens</p>
                        <p class="text-xs text-gray-400">₹${sale.amount}</p>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent sales:', error);
    }
}

// Helper function for time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
    return date.toLocaleDateString();
}

// Hook into role content display
const originalShowSipTokenRoleContent = showSipTokenRoleContent;
showSipTokenRoleContent = function() {
    originalShowSipTokenRoleContent();
    
    // Initialize token sales dashboard when sales staff content is shown
    if (currentUser?.is_siptoken_sales) {
        initTokenSalesDashboard();
    }
    
    // Initialize barman dashboard when barman content is shown
    if (currentUser?.is_barman) {
        initBarmanDashboard();
    }
};

console.log('✅ Seller Invoice Flow loaded');

// =====================================================
// BARMAN ORDER QUEUE - Beverage Service Dashboard
// =====================================================

// State for barman dashboard
let barmanCounterAssignment = null;
let barmanOrdersCache = [];
let barmanOrderSubscription = null;

// Initialize barman dashboard
async function initBarmanDashboard() {
    await loadBarmanCounterAssignment();
    await loadBarmanOrders();
    await loadBarmanStats();
    setupBarmanRealtime();
}

// Load barman's counter assignment
async function loadBarmanCounterAssignment() {
    if (!currentUser) return;
    
    try {
        // Get active assignment for this barman
        const { data: assignment, error } = await supabase
            .from('counter_assignments')
            .select('*, bar_counters(*)')
            .eq('user_id', currentUser.id)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            console.error('Error loading assignment:', error);
        }
        
        barmanCounterAssignment = assignment;
        
        // Update UI
        const counterName = document.getElementById('barmanCounterName');
        const counterCode = document.getElementById('barmanCounterCode');
        const banner = document.getElementById('barmanCounterBanner');
        
        if (assignment && assignment.bar_counters) {
            counterName.textContent = assignment.bar_counters.counter_name;
            counterCode.textContent = assignment.bar_counters.counter_code;
            banner.classList.remove('border-red-600/50', 'bg-red-900/30');
            banner.classList.add('border-purple-600/50', 'bg-purple-900/30');
        } else {
            counterName.textContent = 'Not Assigned';
            counterCode.textContent = 'Contact Overseer';
            banner.classList.remove('border-purple-600/50', 'bg-purple-900/30');
            banner.classList.add('border-red-600/50', 'bg-red-900/30');
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// Load orders for this barman's counter
window.loadBarmanOrders = async function() {
    if (!currentUser || !barmanCounterAssignment?.bar_counters?.id) {
        console.log('No counter assignment');
        return;
    }
    
    const counterId = barmanCounterAssignment.bar_counters.id;
    
    try {
        // Load pending orders
        const { data: pendingOrders } = await supabase
            .from('token_orders')
            .select(`
                *,
                token_wallets(guest_id, guests(name, phone)),
                token_order_items(*, beverage_menu(name, emoji))
            `)
            .eq('counter_id', counterId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });
        
        // Load accepted orders (being prepared)
        const { data: acceptedOrders } = await supabase
            .from('token_orders')
            .select(`
                *,
                token_wallets(guest_id, guests(name, phone)),
                token_order_items(*, beverage_menu(name, emoji))
            `)
            .eq('counter_id', counterId)
            .eq('status', 'accepted')
            .eq('accepted_by', currentUser.id)
            .order('accepted_at', { ascending: true });
        
        // Load recently served (last 10)
        const { data: servedOrders } = await supabase
            .from('token_orders')
            .select(`
                *,
                token_wallets(guest_id, guests(name, phone)),
                token_order_items(*, beverage_menu(name, emoji))
            `)
            .eq('counter_id', counterId)
            .eq('status', 'served')
            .eq('served_by', currentUser.id)
            .order('served_at', { ascending: false })
            .limit(10);
        
        // Update UI
        renderPendingOrders(pendingOrders || []);
        renderAcceptedOrders(acceptedOrders || []);
        renderServedOrders(servedOrders || []);
        
        // Update badges
        document.getElementById('pendingOrdersBadge').textContent = pendingOrders?.length || 0;
        document.getElementById('acceptedOrdersBadge').textContent = acceptedOrders?.length || 0;
        document.getElementById('barmanPendingCount').textContent = pendingOrders?.length || 0;
        document.getElementById('barmanAcceptedCount').textContent = acceptedOrders?.length || 0;
        
    } catch (error) {
        console.error('Error loading orders:', error);
    }
};

// Render pending orders
function renderPendingOrders(orders) {
    const container = document.getElementById('pendingOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-4xl mb-3 opacity-30"></i>
                <p>No pending orders</p>
                <p class="text-xs mt-1">New orders will appear here automatically</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const guest = order.token_wallets?.guests;
        const items = order.token_order_items || [];
        const itemSummary = items.map(i => `${i.beverage_menu?.emoji || '🍹'} ${i.quantity}x`).join(' ');
        const timeAgo = getTimeAgo(new Date(order.created_at));
        
        return `
            <div class="bg-orange-900/20 border border-orange-600/30 rounded-xl p-4 mb-3 animate-pulse-slow">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <span class="font-mono text-sm text-orange-400">${order.order_number}</span>
                        <p class="text-white font-bold">${guest?.name || 'Guest'}</p>
                        <p class="text-xs text-gray-400">${timeAgo}</p>
                    </div>
                    <div class="text-right">
                        <span class="bg-orange-600 text-white text-xs px-2 py-1 rounded-full">PENDING</span>
                        <p class="text-xl font-bold text-orange-400 mt-1">${order.total_tokens} <span class="text-xs">tokens</span></p>
                    </div>
                </div>
                
                <div class="bg-black/20 rounded-lg p-2 mb-3">
                    <p class="text-sm">${itemSummary}</p>
                    <p class="text-xs text-gray-500 mt-1">${items.length} item(s)</p>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="acceptOrder('${order.id}')" class="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium text-sm">
                        <i class="fas fa-check mr-1"></i> Accept
                    </button>
                    <button onclick="viewOrderDetails('${order.id}')" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="openRejectModal('${order.id}')" class="px-4 py-2 bg-red-600/50 hover:bg-red-600 rounded-lg text-sm">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Render accepted orders (being prepared)
function renderAcceptedOrders(orders) {
    const container = document.getElementById('acceptedOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6 text-gray-500">
                <p class="text-sm">No orders being prepared</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const guest = order.token_wallets?.guests;
        const items = order.token_order_items || [];
        const itemList = items.map(i => `${i.beverage_menu?.emoji || '🍹'} ${i.quantity}x ${i.beverage_menu?.name || 'Item'}`).join(', ');
        const acceptedTime = getTimeAgo(new Date(order.accepted_at));
        
        return `
            <div class="bg-blue-900/20 border border-blue-600/30 rounded-xl p-4 mb-3">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <span class="font-mono text-sm text-blue-400">${order.order_number}</span>
                        <p class="text-white font-bold">${guest?.name || 'Guest'}</p>
                        <p class="text-xs text-gray-400">Accepted ${acceptedTime}</p>
                    </div>
                    <div class="text-right">
                        <span class="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">PREPARING</span>
                    </div>
                </div>
                
                <div class="bg-black/20 rounded-lg p-2 mb-3">
                    <p class="text-sm">${itemList}</p>
                </div>
                
                <button onclick="markOrderServed('${order.id}')" class="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold">
                    <i class="fas fa-check-double mr-2"></i> Mark as Served
                </button>
            </div>
        `;
    }).join('');
}

// Render served orders
function renderServedOrders(orders) {
    const container = document.getElementById('servedOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Served orders will appear here</p>';
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const guest = order.token_wallets?.guests;
        const servedTime = getTimeAgo(new Date(order.served_at));
        
        return `
            <div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                    <p class="text-white font-medium">${guest?.name || 'Guest'}</p>
                    <p class="text-xs text-gray-500">${order.order_number} • ${servedTime}</p>
                </div>
                <div class="text-right">
                    <span class="text-green-400 text-sm"><i class="fas fa-check-circle mr-1"></i>Served</span>
                    <p class="text-xs text-gray-400">${order.total_tokens} tokens</p>
                </div>
            </div>
        `;
    }).join('');
}

// Accept order
window.acceptOrder = async function(orderId) {
    if (!currentUser) return;
    
    try {
        // Update order status
        const { error } = await supabase
            .from('token_orders')
            .update({
                status: 'accepted',
                accepted_by: currentUser.id,
                accepted_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('status', 'pending');
        
        if (error) throw error;
        
        // Get order details for notification
        const { data: order } = await supabase
            .from('token_orders')
            .select('*, token_wallets(guests(name, phone)), bar_counters(counter_name)')
            .eq('id', orderId)
            .single();
        
        if (order) {
            // Send WhatsApp notification to guest
            const guestPhone = order.token_wallets?.guests?.phone;
            const guestName = order.token_wallets?.guests?.name;
            const counterName = order.bar_counters?.counter_name || 'Counter';
            
            const message = `🍹 *Order Accepted!*

Hi ${guestName}!

Your order *${order.order_number}* is being prepared at *${counterName}*.

Served by: ${currentUser.full_name}

Please wait nearby - we'll notify you when it's ready!

_Vamos Festa_`;

            const whatsappUrl = `https://wa.me/91${guestPhone}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        }
        
        showToast('Order accepted! Preparing...', 'success');
        
        // Refresh orders
        loadBarmanOrders();
        loadBarmanStats();
        
        // Log to audit
        logBarmanAction('order_accepted', orderId);
        
    } catch (error) {
        console.error('Error accepting order:', error);
        showToast('Failed to accept order', 'error');
    }
};

// Mark order as served
window.markOrderServed = async function(orderId) {
    if (!currentUser) return;
    
    try {
        // Get order details first
        const { data: order } = await supabase
            .from('token_orders')
            .select('*, token_wallets(id, balance, guests(name, phone))')
            .eq('id', orderId)
            .single();
        
        if (!order) throw new Error('Order not found');
        
        // Update order status
        const { error: updateError } = await supabase
            .from('token_orders')
            .update({
                status: 'served',
                served_by: currentUser.id,
                served_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (updateError) throw updateError;
        
        // Deduct tokens from wallet (trigger should handle this, but let's be safe)
        const wallet = order.token_wallets;
        if (wallet) {
            const newBalance = Math.max(0, (wallet.balance || 0) - order.total_tokens);
            
            await supabase
                .from('token_wallets')
                .update({ balance: newBalance })
                .eq('id', wallet.id);
        }
        
        // Send WhatsApp notification to guest
        const guestPhone = order.token_wallets?.guests?.phone;
        const guestName = order.token_wallets?.guests?.name;
        const newBalance = Math.max(0, (wallet?.balance || 0) - order.total_tokens);
        
        const message = `✅ *Order Served!*

Hi ${guestName}!

Your order *${order.order_number}* is ready!

💰 ${order.total_tokens} tokens deducted
💳 Remaining balance: *${newBalance} tokens*

Enjoy! 🎉
_Vamos Festa_`;

        const whatsappUrl = `https://wa.me/91${guestPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        
        showToast('Order served! Guest notified.', 'success');
        
        // Refresh
        loadBarmanOrders();
        loadBarmanStats();
        
        // Log to audit
        logBarmanAction('order_served', orderId);
        
    } catch (error) {
        console.error('Error marking order served:', error);
        showToast('Failed to mark as served', 'error');
    }
};

// Open reject modal
window.openRejectModal = function(orderId) {
    document.getElementById('rejectOrderId').value = orderId;
    document.querySelectorAll('input[name="rejectReason"]').forEach(r => r.checked = false);
    document.getElementById('rejectReasonOther').classList.add('hidden');
    openModal('rejectOrderModal');
};

// Handle reject reason selection
document.addEventListener('change', (e) => {
    if (e.target.name === 'rejectReason') {
        const otherInput = document.getElementById('rejectReasonOther');
        if (e.target.value === 'other') {
            otherInput.classList.remove('hidden');
        } else {
            otherInput.classList.add('hidden');
        }
    }
});

// Confirm reject order
window.confirmRejectOrder = async function() {
    const orderId = document.getElementById('rejectOrderId').value;
    const selectedReason = document.querySelector('input[name="rejectReason"]:checked');
    
    if (!selectedReason) {
        showToast('Please select a reason', 'error');
        return;
    }
    
    let reason = selectedReason.value;
    if (reason === 'other') {
        reason = document.getElementById('rejectReasonOther').value.trim();
        if (!reason) {
            showToast('Please enter a reason', 'error');
            return;
        }
    }
    
    try {
        // Get order details
        const { data: order } = await supabase
            .from('token_orders')
            .select('*, token_wallets(guests(name, phone))')
            .eq('id', orderId)
            .single();
        
        // Update order status
        const { error } = await supabase
            .from('token_orders')
            .update({
                status: 'rejected',
                rejected_by: currentUser.id,
                rejected_at: new Date().toISOString(),
                rejection_reason: reason
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        // Notify guest
        if (order) {
            const guestPhone = order.token_wallets?.guests?.phone;
            const guestName = order.token_wallets?.guests?.name;
            
            const reasonText = {
                'item_unavailable': 'Item(s) currently unavailable',
                'counter_closed': 'Counter is closing',
                'too_busy': 'Counter too busy - please try another'
            }[reason] || reason;
            
            const message = `❌ *Order Could Not Be Processed*

Hi ${guestName},

Sorry, your order *${order.order_number}* could not be fulfilled.

Reason: ${reasonText}

💰 No tokens were deducted.

Please try ordering from another counter.

_Vamos Festa_`;

            const whatsappUrl = `https://wa.me/91${guestPhone}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        }
        
        closeModal('rejectOrderModal');
        showToast('Order rejected', 'warning');
        
        loadBarmanOrders();
        logBarmanAction('order_rejected', orderId, { reason });
        
    } catch (error) {
        console.error('Error rejecting order:', error);
        showToast('Failed to reject order', 'error');
    }
};

// View order details
window.viewOrderDetails = async function(orderId) {
    try {
        const { data: order } = await supabase
            .from('token_orders')
            .select(`
                *,
                token_wallets(guests(name, phone)),
                token_order_items(*, beverage_menu(name, emoji, token_price, measure)),
                bar_counters(counter_name)
            `)
            .eq('id', orderId)
            .single();
        
        if (!order) {
            showToast('Order not found', 'error');
            return;
        }
        
        const guest = order.token_wallets?.guests;
        const items = order.token_order_items || [];
        
        // Populate modal
        document.getElementById('orderDetailNumber').textContent = order.order_number;
        document.getElementById('orderDetailGuestName').textContent = guest?.name || 'Guest';
        document.getElementById('orderDetailGuestPhone').textContent = guest?.phone || '-';
        document.getElementById('orderDetailTotal').textContent = order.total_tokens;
        document.getElementById('orderDetailTime').textContent = getTimeAgo(new Date(order.created_at));
        
        // Status badge
        const statusEl = document.getElementById('orderDetailStatus');
        const statusColors = {
            'pending': 'bg-orange-500',
            'accepted': 'bg-blue-500',
            'served': 'bg-green-500',
            'rejected': 'bg-red-500'
        };
        statusEl.className = `px-3 py-1 rounded-full text-xs font-bold ${statusColors[order.status] || 'bg-gray-500'}`;
        statusEl.textContent = order.status.toUpperCase();
        
        // Items list
        const itemsContainer = document.getElementById('orderDetailItems');
        itemsContainer.innerHTML = items.map(item => `
            <div class="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${item.beverage_menu?.emoji || '🍹'}</span>
                    <div>
                        <p class="text-white font-medium">${item.beverage_menu?.name || 'Item'}</p>
                        <p class="text-xs text-gray-400">${item.beverage_menu?.measure || ''}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-white font-bold">×${item.quantity}</p>
                    <p class="text-xs text-gray-400">${item.tokens_subtotal} tokens</p>
                </div>
            </div>
        `).join('');
        
        // Action buttons based on status
        const actionsContainer = document.getElementById('orderDetailActions');
        if (order.status === 'pending') {
            actionsContainer.innerHTML = `
                <button onclick="acceptOrder('${orderId}'); closeModal('orderDetailModal');" class="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold">
                    <i class="fas fa-check mr-2"></i>Accept Order
                </button>
                <button onclick="closeModal('orderDetailModal'); openRejectModal('${orderId}');" class="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-bold">
                    <i class="fas fa-times mr-2"></i>Reject
                </button>
            `;
        } else if (order.status === 'accepted') {
            actionsContainer.innerHTML = `
                <button onclick="markOrderServed('${orderId}'); closeModal('orderDetailModal');" class="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold">
                    <i class="fas fa-check-double mr-2"></i>Mark as Served
                </button>
            `;
        } else {
            actionsContainer.innerHTML = `
                <button onclick="closeModal('orderDetailModal')" class="flex-1 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg font-bold">
                    Close
                </button>
            `;
        }
        
        openModal('orderDetailModal');
        
    } catch (error) {
        console.error('Error loading order details:', error);
        showToast('Failed to load order', 'error');
    }
};

// Show counter QR code
window.showCounterQR = async function() {
    if (!barmanCounterAssignment?.bar_counters) {
        showToast('No counter assigned', 'error');
        return;
    }
    
    const counter = barmanCounterAssignment.bar_counters;
    
    document.getElementById('counterQRName').textContent = counter.counter_name;
    document.getElementById('counterQRCodeText').textContent = counter.counter_code;
    
    // Generate QR
    const qrContainer = document.getElementById('counterQRCode');
    qrContainer.innerHTML = '';
    
    const qrData = JSON.stringify({
        type: 'bar_counter',
        counter_id: counter.id,
        counter_code: counter.counter_code,
        counter_name: counter.counter_name
    });
    
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: qrData,
            width: 200,
            height: 200,
            colorDark: '#1A1A2E',
            colorLight: '#ffffff'
        });
    }
    
    openModal('counterQRModal');
};

// Load barman statistics
async function loadBarmanStats() {
    if (!currentUser) return;
    
    try {
        const today = new Date().toISOString().slice(0, 10);
        
        // Get today's served orders
        const { data: served } = await supabase
            .from('token_orders')
            .select('total_tokens')
            .eq('served_by', currentUser.id)
            .eq('status', 'served')
            .gte('served_at', today);
        
        const servedCount = served?.length || 0;
        const tokensProcessed = served?.reduce((sum, o) => sum + o.total_tokens, 0) || 0;
        
        document.getElementById('barmanServedToday').textContent = servedCount;
        document.getElementById('barmanTokensProcessed').textContent = tokensProcessed;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Setup realtime subscription for new orders
function setupBarmanRealtime() {
    if (!barmanCounterAssignment?.bar_counters?.id) return;
    
    // Clean up existing subscription
    if (barmanOrderSubscription) {
        supabase.removeChannel(barmanOrderSubscription);
    }
    
    const counterId = barmanCounterAssignment.bar_counters.id;
    
    // Subscribe to order changes for this counter
    barmanOrderSubscription = supabase
        .channel(`orders-${counterId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'token_orders',
                filter: `counter_id=eq.${counterId}`
            },
            (payload) => {
                console.log('Order change:', payload);
                
                // Play notification sound for new orders
                if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
                    playNotificationSound();
                    showToast('New order received!', 'info');
                }
                
                // Refresh orders
                loadBarmanOrders();
            }
        )
        .subscribe();
    
    console.log('✅ Barman realtime subscription active');
}

// Play notification sound
function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp2Xh3VoYW55kKOvq5mEcmVkb4KVpq+rl4RxZGZvg5eoq6mWg3BjZG+DlKmrqZaDcGNlcIOXqaypln9uY2ZwhJerqqiUfm5jZnCFl6urqJR9bmJlcIaXq6uolH1uYmVwhZarq6iUfG5iZXGFl6yrp5N8bWJlcYaXrKunknttYmVxhpesq6aSe21iZXKHl62qppF6bGFkcoiYraqmkHlsYWRyiJmtqqWPeWthZHKJma2ppI94a2FkcomZramkjndrYWRzipmtqaSNd2thZHOKmq2po4x2amBjdIuarKmii3ZqYGN0jJqsqKKKdWpgY3WMm6yooYl0aWBjdYybrKihiXNpX2N2jZusqKCIc2lfY3aNnKynnoZyaF9id42craeehXFoX2J3jpyspp2EcGdfYniPnaylnINwZ19ieI+crKWbgnBmXmJ5kJ2spZuBb2VdYnqRnqylmoFuZV1iepKerKSZf25kXGJ7kp+so5h+bWRcYXuTn6yjl31sY1xhe5SgrKOWfGxjW2B8lKCso5V7a2JbYH2VoasslHprYlpgfZWhq6KSempgWmB+lqKroZF5aV9ZYH+Xoqqgj3hoX1lgf5eiqqCOd2dfWWCAl6OqoI12Zl5YYIGYo6qfjHVmXldhgZmkqZ6LdGVdV2GCmaWpnYpzZV1XYoKapamciHJkXFdjhJqlqJuHcWRcV2OFm6WnmYZwY1tWY4acp6eYhW9jW1Zkh52nppeDb2JaVWWInaemlINuYlpVZomep6WWgm1hWVVni5+mpZSAbGBZVWiMoKWkkn9rYFhUaYyhpZOQfmpfWFRqjaKkko9+aV5YVGuOo6SRjXxoXlhUbI+jpJCMfGheV1NtkKSjj4p6Z11XU22Ro6OOiHlmXVdTbpKkoY6GdmVcVlNvk6ShjoV1ZFxWU3CUpKCNhHRkW1VTcZWloI2CcmNbVVRylqWfjYFxYlpUVHOXpp6MgHBiWlRUdJimnYt/b2FZVFRil6adjH9uYVlTU2WYpp2Le25gWVNTZpmmnIp8bWBYU1JnmqabinyLX1dSUmiaq5t9e4peVlFRaZyrmn15il1WUVFqnayaeHmJXVVRUWudq5p3eIhcVFFRa52smnZ3h1tUUFFsnqyZdXeHW1NQUGyfq5l0dYZaU09Qba+smHR0hVlST09usKyXc3OEWVJPTm+xq5dycYNYUU5OcLKrlnFwglhQTk5xsquVcG+BWFBNTXKzq5Rvb4FXUE1Nc7SrlG5tgFdPTEt0tatTbWx/Vk9MS3W2qpRsanhWT0tKeLatklpqc31VTkpJeLerlGhqcn1TTUpIebqrkmhpdHtSTklIertqkmZodXpRT0hHe7yrkmdmdn1QUEVG fryqkWZmdnxPT0VGfbyqkGVkd3pOT0VFgL2qj2RieHlOTkRFgL6pjmNheXhNTkREgsCojmJgeHhLTUREg8GnjWFeeHZLTURDhMKmjF9cdnZJS0NDhcOmjV5adXRJSkJDhsSmjFxYdHNISkJCiMWljVxWdHJHSUFBicaliWBWcnFGSUFBismkiWBVcW9FSEBAi8mji2BUcG5ESEA/jcmhi2FUbm1DR0A/j8qgiGNTbGxCRj8+kMugh2RTbGpBRT4+ksuhhmVTamlBRD09lMyghmZTaGhAQz09lc2ehWdUZ2Y/Qjw8l82chGlVZmU+QTw8mc6bhWpWZGQ9QDs7m8+ahGxYYmI8Pzo7nc+YhG5ZYGE7Pjo6n9CXg3BbX149PTk5odGWgnJcXV08PDg4otKVgnRdXFw7Ozc3pNOUgHZfWlo6Ojc2ptSRgHliWFg5OTY1qNWQfntkVlY3ODU0qtaPfX5mVFQ2NzQzrNeMfYFoUlI1NjMzrdeLfINqUFA0NTIysFVrf4ZsTk4zNDEwslVpfolwTEsyMzAwAAAA');
        audio.volume = 0.5;
        audio.play();
    } catch (e) {
        console.log('Could not play notification sound');
    }
}

// =====================================================
// SIPTOKEN OVERSEER SECTION FUNCTIONS
// =====================================================

// Show Overseer Section (tabs within SipToken)
window.showOverseerSection = function(section) {
    // Hide all sections
    document.querySelectorAll('.overseer-section').forEach(s => s.classList.add('hidden'));
    
    // Remove active styling from all tabs
    document.querySelectorAll('.overseer-tab').forEach(t => {
        t.style.background = 'rgba(31, 41, 55, 1)';
        t.style.borderBottom = 'none';
        t.style.color = '#9ca3af';
    });
    
    // Show selected section
    const sectionId = 'overseer' + section.charAt(0).toUpperCase() + section.slice(1) + 'Section';
    const sectionEl = document.getElementById(sectionId);
    if (sectionEl) sectionEl.classList.remove('hidden');
    
    // Activate tab
    const tab = document.querySelector(`.overseer-tab[data-section="${section}"]`);
    if (tab) {
        tab.style.background = 'rgba(139, 92, 246, 0.2)';
        tab.style.borderBottom = '2px solid #8b5cf6';
        tab.style.color = '#a78bfa';
    }
    
    // Load section data
    switch(section) {
        case 'staff':
            loadOverseerDutySessions();
            break;
        case 'counters':
            loadBarCounters();
            break;
        case 'menu':
            loadOverseerMenu();
            break;
        case 'settings':
            loadOverseerSettings();
            break;
    }
};

// Filter Menu for Overseer
window.filterOverseerMenu = function(category) {
    document.querySelectorAll('.overseer-menu-cat').forEach(btn => {
        btn.style.background = 'rgba(31, 41, 55, 1)';
        btn.style.color = '#9ca3af';
    });
    
    const activeBtn = document.querySelector(`.overseer-menu-cat[data-cat="${category}"]`);
    if (activeBtn) {
        activeBtn.style.background = 'rgba(212, 168, 83, 0.3)';
        activeBtn.style.color = '#fcd34d';
    }
    
    // Filter items
    document.querySelectorAll('#overseerMenuList .menu-item').forEach(item => {
        if (category === 'all' || item.dataset.category === category) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
};

// Save Token Rate (Overseer version)
window.saveOverseerTokenRate = async function() {
    const rateInput = document.getElementById('overseerTokenRate');
    const rate = rateInput?.value;
    
    if (!rate || rate < 1) {
        showToast('Please enter a valid token rate', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('settings')
            .upsert({ 
                setting_key: 'token_rate',
                setting_value: rate.toString(),
                description: 'Price per token in INR',
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            }, { onConflict: 'setting_key' });
        
        if (error) throw error;
        
        // Update display
        const display = document.getElementById('currentTokenRateDisplay');
        if (display) display.textContent = rate;
        
        showToast('Token rate updated to ₹' + rate, 'success');
        
    } catch (error) {
        console.error('Error saving token rate:', error);
        showToast('Failed to save token rate', 'error');
    }
};

// Load Overseer Settings
async function loadOverseerSettings() {
    try {
        const { data } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        const rate = data?.setting_value || '10';
        
        const rateInput = document.getElementById('overseerTokenRate');
        const rateDisplay = document.getElementById('currentTokenRateDisplay');
        
        if (rateInput) rateInput.value = rate;
        if (rateDisplay) rateDisplay.textContent = rate;
        
        // Load today's summary
        await loadOverseerTodaySummary();
        
    } catch (error) {
        console.log('Using default token rate');
        // Set defaults
        const rateInput = document.getElementById('overseerTokenRate');
        const rateDisplay = document.getElementById('currentTokenRateDisplay');
        if (rateInput) rateInput.value = '10';
        if (rateDisplay) rateDisplay.textContent = '10';
    }
}

// Load Today's Summary for Overseer
async function loadOverseerTodaySummary() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        
        // Get today's token purchases (using token_purchases table)
        const { data: sales } = await supabase
            .from('token_purchases')
            .select('tokens_purchased, amount_paid')
            .eq('transaction_status', 'completed')
            .gte('created_at', today);
        
        // Get today's orders (using beverage_orders_v2)
        const { count: orderCount } = await supabase
            .from('beverage_orders_v2')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'served')
            .gte('served_at', today);
        
        // Get active staff count
        const { count: activeStaff } = await supabase
            .from('siptoken_duty_sessions')
            .select('*', { count: 'exact', head: true })
            .is('clock_out_time', null)
            .eq('status', 'on_duty');
        
        const totalTokens = sales?.reduce((sum, s) => sum + (s.tokens_purchased || 0), 0) || 0;
        const totalRevenue = sales?.reduce((sum, s) => sum + (parseFloat(s.amount_paid) || 0), 0) || 0;
        
        // Update displays
        const updates = {
            'overseerTodayTokens': totalTokens,
            'overseerTodayRevenue': '₹' + totalRevenue,
            'overseerTodayOrders': orderCount || 0,
            'overseerActiveStaff': activeStaff || 0
        };
        
        for (const [id, value] of Object.entries(updates)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
        
    } catch (error) {
        console.error('Error loading today summary:', error);
    }
}

// Load Bar Counters from dedicated table
async function loadBarCounters() {
    try {
        const { data: counters, error } = await supabase
            .from('bar_counters')
            .select('*')
            .order('counter_name');
        
        if (error) throw error;
        
        const container = document.getElementById('barCountersList');
        if (!container) return;
        
        if (!counters || counters.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No bar counters configured. Click "Add Counter" to create one.</p>';
            return;
        }
        
        container.innerHTML = counters.map(c => `
            <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                        <i class="fas fa-glass-martini-alt text-blue-400"></i>
                    </div>
                    <div>
                        <p class="font-semibold text-white">${escapeHtml(c.counter_name)}</p>
                        <p class="text-xs text-gray-500 font-mono">${c.counter_code}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-2 py-1 rounded text-xs ${c.is_active ? 'bg-green-600' : 'bg-red-600'}">
                        ${c.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button onclick="editBarCounter('${c.id}')" class="p-2 text-gray-400 hover:text-white">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Also load counter assignments
        loadCounterAssignments();
        
    } catch (error) {
        console.error('Error loading counters:', error);
        const container = document.getElementById('barCountersList');
        if (container) container.innerHTML = '<p class="text-red-400 text-sm text-center py-4">Failed to load counters</p>';
    }
}

// Load Counter Assignments (which staff are at which counters)
async function loadCounterAssignments() {
    try {
        const { data: assignments, error } = await supabase
            .from('siptoken_duty_sessions')
            .select(`
                id,
                staff_role,
                counter_name,
                staff:staff_id(username, full_name),
                counter:counter_id(counter_name, counter_code)
            `)
            .is('clock_out_time', null)
            .eq('status', 'on_duty');
        
        if (error) throw error;
        
        const container = document.getElementById('counterAssignmentsList');
        if (!container) return;
        
        if (!assignments || assignments.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No active assignments</p>';
            return;
        }
        
        container.innerHTML = assignments.map(a => {
            const staffName = a.staff?.full_name || a.staff?.username || 'Unknown';
            const counterName = a.counter?.counter_name || a.counter_name || 'Unassigned';
            const roleIcon = a.staff_role === 'barman' ? 'fa-cocktail' : 'fa-coins';
            const roleColor = a.staff_role === 'barman' ? 'purple' : 'green';
            
            return `
                <div class="flex items-center justify-between p-2 bg-gray-800/30 rounded">
                    <div class="flex items-center gap-2">
                        <i class="fas ${roleIcon} text-${roleColor}-400 text-sm"></i>
                        <span class="text-sm text-white">${escapeHtml(staffName)}</span>
                    </div>
                    <span class="text-xs text-gray-400">${escapeHtml(counterName)}</span>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading assignments:', error);
    }
}

// Load Overseer Menu
async function loadOverseerMenu() {
    try {
        const { data: items, error } = await supabase
            .from('beverage_menu')
            .select('*')
            .order('category')
            .order('name');
        
        if (error) throw error;
        
        const container = document.getElementById('overseerMenuList');
        if (!container) return;
        
        if (!items || items.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No menu items configured. Click "Add Item" to create one.</p>';
            return;
        }
        
        const categoryIcons = {
            'alcoholic': '🍺',
            'non_alcoholic': '🥤',
            'snacks': '🍿',
            'beverages': '🍹'
        };
        
        container.innerHTML = items.map(item => `
            <div class="menu-item flex items-center justify-between p-3 bg-gray-800/50 rounded-lg" data-category="${item.category}">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${categoryIcons[item.category] || '🍹'}</span>
                    <div>
                        <p class="font-semibold text-white">${escapeHtml(item.name)}</p>
                        <p class="text-xs text-gray-500">${item.description || '-'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-yellow-400 font-bold">${item.token_price} tokens</span>
                    <span class="px-2 py-1 rounded text-xs ${item.is_available ? 'bg-green-600' : 'bg-red-600'}">
                        ${item.is_available ? 'Available' : 'Out'}
                    </span>
                    <button onclick="editMenuItem('${item.id}')" class="p-2 text-gray-400 hover:text-white">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading menu:', error);
        const container = document.getElementById('overseerMenuList');
        if (container) container.innerHTML = '<p class="text-red-400 text-sm text-center py-4">Failed to load menu</p>';
    }
}

// Load Overseer Duty Sessions
async function loadOverseerDutySessions() {
    try {
        // Using actual schema: staff_id, overseer_id, staff_role, counter_name/counter_id
        const { data: sessions, error } = await supabase
            .from('siptoken_duty_sessions')
            .select(`
                *,
                users!staff_id(username, full_name),
                bar_counters!counter_id(counter_name, counter_code)
            `)
            .is('clock_out_time', null)
            .eq('status', 'on_duty')
            .order('clock_in_time', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('overseerDutySessions');
        if (!container) return;
        
        if (!sessions || sessions.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No staff currently on duty</p>';
            
            // Update stats
            const statsEl = document.getElementById('overseerStaffOnDuty');
            if (statsEl) statsEl.textContent = '0';
            return;
        }
        
        container.innerHTML = sessions.map(s => {
            const startTime = new Date(s.clock_in_time);
            const now = new Date();
            const diffMs = now - startTime;
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
            
            const roleIcon = s.staff_role === 'barman' ? 'fa-cocktail' : 'fa-coins';
            const roleColor = s.staff_role === 'barman' ? 'purple' : 'green';
            const userName = s.users?.full_name || s.users?.username || 'Staff';
            // Try counter from join first, fallback to counter_name text field
            const counterName = s.bar_counters?.counter_name || s.counter_name || 'No counter';
            
            return `
                <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-${roleColor}-600/20 flex items-center justify-center">
                            <i class="fas ${roleIcon} text-${roleColor}-400"></i>
                        </div>
                        <div>
                            <p class="font-semibold text-white">${escapeHtml(userName)}</p>
                            <p class="text-xs text-gray-500">
                                ${escapeHtml(counterName)} • ${duration}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs bg-${roleColor}-600 capitalize">
                            ${s.staff_role === 'barman' ? 'Barman' : 'Sales'}
                        </span>
                        <button onclick="endDutySession('${s.id}')" class="p-2 text-red-400 hover:text-red-300" title="End Session">
                            <i class="fas fa-stop-circle"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Update stats
        const statsEl = document.getElementById('overseerStaffOnDuty');
        if (statsEl) statsEl.textContent = sessions.length;
        
    } catch (error) {
        console.error('Error loading duty sessions:', error);
        const container = document.getElementById('overseerDutySessions');
        if (container) container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No active sessions</p>';
    }
}

// End duty session
window.endDutySession = async function(sessionId) {
    if (!confirm('End this staff member\'s duty session?')) return;
    
    try {
        const { error } = await supabase
            .from('siptoken_duty_sessions')
            .update({ 
                clock_out_time: new Date().toISOString(),
                status: 'clocked_out'
            })
            .eq('id', sessionId);
        
        if (error) throw error;
        
        showToast('Duty session ended', 'success');
        loadOverseerDutySessions();
        loadOverseerDashboardStats();
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to end session', 'error');
    }
};

// Bar Counter Modal
window.openBarCounterModal = function(counterId = null) {
    // Check if modal exists
    let modal = document.getElementById('barCounterModal');
    if (!modal) {
        // Create modal
        const modalHtml = `
            <div id="barCounterModal" class="modal">
                <div class="modal-content max-w-md">
                    <div class="flex justify-between items-center mb-4">
                        <h3 id="barCounterModalTitle" class="text-xl font-bold text-blue-400">
                            <i class="fas fa-store mr-2"></i>Add Bar Counter
                        </h3>
                        <button onclick="closeModal('barCounterModal')" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <form id="barCounterForm" onsubmit="saveBarCounter(event)" class="space-y-4">
                        <input type="hidden" id="editBarCounterId">
                        <div>
                            <label class="block text-sm mb-1">Counter Name *</label>
                            <input type="text" id="barCounterName" class="vamosfesta-input" required placeholder="e.g., Main Bar">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">Counter Code *</label>
                            <input type="text" id="barCounterCode" class="vamosfesta-input" required placeholder="e.g., BAR-1" style="text-transform: uppercase;">
                            <p class="text-xs text-gray-500 mt-1">Unique identifier for this counter</p>
                        </div>
                        <div>
                            <label class="block text-sm mb-1">Description</label>
                            <input type="text" id="barCounterDescription" class="vamosfesta-input" placeholder="e.g., Main floor bar">
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="barCounterActive" checked class="w-4 h-4 accent-green-500">
                            <label for="barCounterActive" class="text-sm">Counter is Active</label>
                        </div>
                        <button type="submit" class="vamosfesta-button w-full py-3">
                            <i class="fas fa-save mr-2"></i>Save Counter
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // Reset form
    const form = document.getElementById('barCounterForm');
    if (form) form.reset();
    
    const editIdField = document.getElementById('editBarCounterId');
    if (editIdField) editIdField.value = '';
    
    const title = document.getElementById('barCounterModalTitle');
    if (title) title.innerHTML = '<i class="fas fa-store mr-2"></i>Add Bar Counter';
    
    openModal('barCounterModal');
};

window.editBarCounter = async function(counterId) {
    openBarCounterModal();
    
    try {
        const { data: counter, error } = await supabase
            .from('bar_counters')
            .select('*')
            .eq('id', counterId)
            .single();
        
        if (error) throw error;
        
        document.getElementById('editBarCounterId').value = counterId;
        document.getElementById('barCounterName').value = counter.counter_name || '';
        document.getElementById('barCounterCode').value = counter.counter_code || '';
        document.getElementById('barCounterDescription').value = counter.description || '';
        document.getElementById('barCounterActive').checked = counter.is_active;
        
        const title = document.getElementById('barCounterModalTitle');
        if (title) title.innerHTML = '<i class="fas fa-edit mr-2"></i>Edit Bar Counter';
        
    } catch (error) {
        console.error('Error loading counter:', error);
        showToast('Failed to load counter details', 'error');
    }
};

window.saveBarCounter = async function(e) {
    e.preventDefault();
    
    const counterId = document.getElementById('editBarCounterId').value;
    const counterData = {
        counter_name: document.getElementById('barCounterName').value.trim(),
        counter_code: document.getElementById('barCounterCode').value.trim().toUpperCase(),
        description: document.getElementById('barCounterDescription')?.value?.trim() || null,
        is_active: document.getElementById('barCounterActive').checked,
        updated_at: new Date().toISOString()
    };
    
    if (!counterData.counter_name || !counterData.counter_code) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        if (counterId) {
            // Update existing
            const { error } = await supabase
                .from('bar_counters')
                .update(counterData)
                .eq('id', counterId);
            if (error) throw error;
            showToast('Bar counter updated!', 'success');
        } else {
            // Create new
            counterData.created_by = currentUser?.id;
            counterData.created_at = new Date().toISOString();
            
            const { error } = await supabase
                .from('bar_counters')
                .insert([counterData]);
            if (error) throw error;
            showToast('Bar counter created!', 'success');
        }
        
        closeModal('barCounterModal');
        loadBarCounters();
        
    } catch (error) {
        console.error('Error saving counter:', error);
        if (error.message?.includes('duplicate') || error.code === '23505') {
            showToast('Counter code already exists', 'error');
        } else {
            showToast('Failed to save counter: ' + error.message, 'error');
        }
    }
};

// Initialize overseer dashboard stats
async function loadOverseerDashboardStats() {
    try {
        // Get active staff count
        const { count: staffCount } = await supabase
            .from('siptoken_duty_sessions')
            .select('*', { count: 'exact', head: true })
            .is('clock_out_time', null)
            .eq('status', 'on_duty');
        
        // Get today's data
        const today = new Date().toISOString().slice(0, 10);
        
        // Tokens sold today (using token_purchases)
        const { data: sales } = await supabase
            .from('token_purchases')
            .select('tokens_purchased, amount_paid')
            .eq('transaction_status', 'completed')
            .gte('created_at', today);
        
        // Orders processed today (using beverage_orders_v2)
        const { count: orderCount } = await supabase
            .from('beverage_orders_v2')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'served')
            .gte('served_at', today);
        
        const totalTokens = sales?.reduce((sum, s) => sum + (s.tokens_purchased || 0), 0) || 0;
        const totalRevenue = sales?.reduce((sum, s) => sum + (parseFloat(s.amount_paid) || 0), 0) || 0;
        
        // Update UI
        const updates = {
            'overseerStaffOnDuty': staffCount || 0,
            'overseerTotalTokens': totalTokens,
            'overseerTotalOrders': orderCount || 0,
            'overseerTotalRevenue': '₹' + totalRevenue
        };
        
        for (const [id, value] of Object.entries(updates)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
        
    } catch (error) {
        console.error('Error loading overseer stats:', error);
    }
}

console.log('✅ Vamos Festa v2.0 with SipToken Overseer loaded');

// Log barman action to audit
async function logBarmanAction(action, orderId, details = {}) {
    try {
        await supabase.from('audit_log').insert({
            event_type: action,
            actor_id: currentUser.id,
            target_type: 'token_order',
            target_id: orderId,
            details: {
                ...details,
                counter_id: barmanCounterAssignment?.bar_counters?.id,
                counter_name: barmanCounterAssignment?.bar_counters?.counter_name
            }
        });
    } catch (e) {
        console.error('Audit log error:', e);
    }
}

console.log('✅ Barman Order Queue loaded');