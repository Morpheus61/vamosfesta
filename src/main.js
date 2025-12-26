// =====================================================
// VAMOS FESTA - Main Application v2.0
// Multi-Seller Workflow with Payment Verification
// =====================================================

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

// Supabase Configuration - Use environment variables or fallback to hardcoded values
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bruwwqxeevqnbhunrhia.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJydXd3cXhlZXZxbmJodW5yaGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MzIwMjksImV4cCI6MjA4MTEwODAyOX0.dhmkH6aUudxm3eUZblRe9Iah1RWEr5fz8PzcPNqh4tw';

// Create Supabase client (without session token initially)
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
    
    // Check for existing session token
    const savedUser = sessionStorage.getItem('vamosfesta_user');
    const savedToken = sessionStorage.getItem('vamosfesta_session_token');
    
    if (savedUser && savedToken) {
        currentUser = JSON.parse(savedUser);
        await initializeApp();
    } else {
        // Show login screen if no valid session
        document.getElementById('loginScreen')?.classList.remove('hidden');
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
    
    // Add 'overseer' class ONLY for Gate Overseers (not SipToken Overseers)
    if (currentUser.is_gate_overseer) {
        bodyClass += ' overseer';
    }
    // Add separate class for SipToken Overseer (but NOT 'overseer')
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
                           'view-registrations', 'view-sellers', 'statistics', 'overseer-management'];
        
        tabsToHide.forEach(tabName => {
            // Hide nav tabs
            const navTab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
            if (navTab) navTab.style.display = 'none';
            
            // Hide ALL mobile menu items with this data-tab (there may be multiple)
            const mobileItems = document.querySelectorAll(`.mobile-menu-item[data-tab="${tabName}"]`);
            mobileItems.forEach(item => item.style.display = 'none');
        });
        
        console.log('✅ SipToken Overseer: Hidden admin tabs - user has access only to SipToken management');
        
        // Also hide the Gate Management and Marshall Management tab content
        const gateManagementTab = document.getElementById('tab-gate-management');
        if (gateManagementTab) gateManagementTab.style.display = 'none';
        
        const marshallManagementTab = document.getElementById('tab-overseer-management');
        if (marshallManagementTab) marshallManagementTab.style.display = 'none';
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
    
    // Show proper role badge with precise role definition
    let roleBadgeText = formatRole(currentUser.role);
    
    // Override with specific SipToken roles if applicable
    if (currentUser.is_siptoken_sales && !currentUser.is_siptoken_overseer) {
        roleBadgeText = 'Token Sales';
    } else if (currentUser.is_barman && !currentUser.is_siptoken_overseer) {
        roleBadgeText = 'Barman';
    }
    
    // Add Overseer designation if applicable
    if (currentUser.is_gate_overseer && currentUser.is_siptoken_overseer) {
        roleBadgeText = `${formatRole(currentUser.role)} (Gate & SipToken Overseer)`;
    } else if (currentUser.is_gate_overseer) {
        roleBadgeText = `${formatRole(currentUser.role)} (Gate Overseer)`;
    } else if (currentUser.is_siptoken_overseer) {
        roleBadgeText = `${formatRole(currentUser.role)} (SipToken Overseer)`;
    }
    
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
    
    // Super Admin always gets full access - check role first
    if (currentUser.role === 'super_admin') {
        defaultTab = 'verification-queue';
        showTab(defaultTab);
        return;
    }
    
    // SipToken staff and overseers (non-super-admin) get SipToken tab by default
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
    message += `_Viva La Fesa_\n\n`;
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
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // Disable submit button to prevent double-clicks
    if (submitBtn) submitBtn.disabled = true;
    
    try {
        // Verify username and password using regular anon client (no RLS issues)
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .eq('is_active', true)
            .single();
        
        if (userError || !userData) {
            throw new Error('Invalid username or password');
        }
        
        // Store session data
        currentUser = userData;
        sessionStorage.setItem('vamosfesta_user', JSON.stringify(currentUser));
        
        errorDiv.classList.add('hidden');
        document.getElementById('loginScreen').classList.add('hidden');
        await initializeApp();
        
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed';
        errorDiv.classList.remove('hidden');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('vamosfesta_user');
    sessionStorage.removeItem('vamosfesta_session_token');
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

// =====================================================
// GUEST TYPE SELECTION (Tablers vs 41'ers)
// =====================================================

window.selectGuestType = function(type) {
    const guestTypeInput = document.getElementById('guestType');
    const registrationFieldsContainer = document.getElementById('registrationFieldsContainer');
    const tablerFields = document.getElementById('tablerFields');
    const fortyonerFields = document.getElementById('fortyonerFields');
    const btnTabler = document.getElementById('btnTabler');
    const btn41er = document.getElementById('btn41er');
    
    // Set the guest type
    guestTypeInput.value = type;
    
    // Show the registration fields container
    registrationFieldsContainer.classList.remove('hidden');
    
    // Update button styles
    if (type === 'tabler') {
        btnTabler.classList.remove('secondary');
        btnTabler.classList.add('active');
        btn41er.classList.add('secondary');
        btn41er.classList.remove('active');
        
        // Show tabler fields, hide 41'er fields
        tablerFields.classList.remove('hidden');
        fortyonerFields.classList.add('hidden');
        
        // Set required attributes
        document.getElementById('tableName').required = true;
        document.getElementById('tableNumber').required = true;
        document.getElementById('guestClubName').required = false;
        document.getElementById('guestClubNumber').required = false;
        
        // Clear 41'er fields
        document.getElementById('guestClubName').value = '';
        document.getElementById('guestClubNumber').value = '';
    } else {
        btn41er.classList.remove('secondary');
        btn41er.classList.add('active');
        btnTabler.classList.add('secondary');
        btnTabler.classList.remove('active');
        
        // Show 41'er fields, hide tabler fields
        fortyonerFields.classList.remove('hidden');
        tablerFields.classList.add('hidden');
        
        // Set required attributes
        document.getElementById('guestClubName').required = true;
        document.getElementById('guestClubNumber').required = true;
        document.getElementById('tableName').required = false;
        document.getElementById('tableNumber').required = false;
        
        // Clear tabler fields
        document.getElementById('tableName').value = '';
        document.getElementById('tableNumber').value = '';
    }
}

// Reset guest type selection when form is reset
window.resetGuestTypeSelection = function() {
    const guestTypeInput = document.getElementById('guestType');
    const registrationFieldsContainer = document.getElementById('registrationFieldsContainer');
    const tablerFields = document.getElementById('tablerFields');
    const fortyonerFields = document.getElementById('fortyonerFields');
    const btnTabler = document.getElementById('btnTabler');
    const btn41er = document.getElementById('btn41er');
    
    // Reset guest type
    if (guestTypeInput) guestTypeInput.value = '';
    
    // Hide fields container
    if (registrationFieldsContainer) registrationFieldsContainer.classList.add('hidden');
    if (tablerFields) tablerFields.classList.add('hidden');
    if (fortyonerFields) fortyonerFields.classList.add('hidden');
    
    // Reset button styles
    if (btnTabler) {
        btnTabler.classList.remove('active');
        btnTabler.classList.add('secondary');
    }
    if (btn41er) {
        btn41er.classList.add('secondary');
        btn41er.classList.remove('active');
    }
}

async function handleRegistration(e) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    
    // Check if we're editing an existing guest
    const editingGuestId = e.target.dataset.editingGuestId;
    const isEditing = !!editingGuestId;
    
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${isEditing ? 'Updating...' : 'Submitting...'}`;
    
    try {
        const guestType = document.getElementById('guestType').value;
        const entryType = document.getElementById('entryType').value;
        
        // Validate guest type
        if (!guestType) {
            showToast('Please select a guest type (Tabler or 41\'er)', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-${isEditing ? 'save' : 'paper-plane'} mr-2"></i>${isEditing ? 'Update Guest' : 'Submit Registration'}`;
            return;
        }
        
        const ticketPrice = entryType === 'stag' 
            ? parseInt(settings.stag_price || 2750) 
            : parseInt(settings.couple_price || 4750);
        
        // Build guest data based on guest type
        const guestData = {
            guest_name: document.getElementById('guestName').value.trim(),
            mobile_number: document.getElementById('guestMobile').value.trim(),
            entry_type: entryType,
            guest_type: guestType,
            payment_mode: document.getElementById('paymentMode').value,
            payment_reference: document.getElementById('paymentReference')?.value.trim() || null,
            ticket_price: ticketPrice
        };
        
        // Only set registered_by and status for new guests
        if (!isEditing) {
            guestData.registered_by = currentUser.id;
            guestData.status = 'pending_verification';
        }
        
        // Add type-specific fields
        if (guestType === 'tabler') {
            const tableName = document.getElementById('tableName').value.trim();
            const tableNumber = document.getElementById('tableNumber').value.trim();
            
            if (!tableName || !tableNumber) {
                showToast('Please fill in Table Name and Table Number for Tablers', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-${isEditing ? 'save' : 'paper-plane'} mr-2"></i>${isEditing ? 'Update Guest' : 'Submit Registration'}`;
                return;
            }
            
            guestData.table_name = tableName;
            guestData.table_number = tableNumber;
            guestData.club_name = null;
            guestData.club_number = null;
        } else {
            const clubName = document.getElementById('guestClubName').value.trim();
            const clubNumber = document.getElementById('guestClubNumber').value.trim();
            
            if (!clubName || !clubNumber) {
                showToast('Please fill in Club Name and Club Number for 41\'ers', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-${isEditing ? 'save' : 'paper-plane'} mr-2"></i>${isEditing ? 'Update Guest' : 'Submit Registration'}`;
                return;
            }
            
            guestData.club_name = clubName;
            guestData.club_number = clubNumber;
            guestData.table_name = null;
            guestData.table_number = null;
        }
        
        if (isEditing) {
            // Update existing guest
            const { error } = await supabase
                .from('guests')
                .update(guestData)
                .eq('id', editingGuestId);
            
            if (error) throw error;
            
            showToast('Guest updated successfully!', 'success');
            
            // Clear editing mode
            delete e.target.dataset.editingGuestId;
            
            // Refresh the view
            if (currentUser.role === 'super_admin') {
                await loadAllRegistrations(currentStatusFilter);
            }
        } else {
            // Create new guest
            const { data, error } = await supabase
                .from('guests')
                .insert([guestData])
                .select();
            
            if (error) throw error;
            
            showToast('Registration submitted successfully!', 'success');
            
            // Refresh my sales
            await loadMySales();
        }
        
        // Reset form
        e.target.reset();
        document.getElementById('priceDisplay').classList.add('hidden');
        document.getElementById('paymentRefSection').classList.add('hidden');
        
        // Reset guest type selection
        resetGuestTypeSelection();
        
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Failed to ' + (isEditing ? 'update' : 'submit') + ' registration: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Submit Registration';
        // Clear any editing mode
        delete e.target.dataset.editingGuestId;
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
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded text-xs ${g.guest_type === '41er' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}">
                                ${g.guest_type === '41er' ? "41'er" : 'Tabler'}
                            </span>
                            <span class="text-xs text-gray-500 capitalize">${g.entry_type}</span>
                        </div>
                        <h4 class="font-semibold text-white truncate mt-1">${escapeHtml(g.guest_name)}</h4>
                        <p class="text-sm text-gray-400">${g.mobile_number}</p>
                        <p class="text-xs text-gray-500 mt-1">
                            ${g.guest_type === 'tabler' ? `📋 ${escapeHtml(g.table_name || '')} #${escapeHtml(g.table_number || '')}` : `🏛️ ${escapeHtml(g.club_name || '')} #${escapeHtml(g.club_number || '')}`}
                        </p>
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
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded text-xs ${g.guest_type === '41er' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}">
                                ${g.guest_type === '41er' ? "41'er" : 'Tabler'}
                            </span>
                            <span class="text-xs text-gray-500 capitalize">${g.entry_type}</span>
                        </div>
                        <h4 class="font-semibold text-white truncate">${escapeHtml(g.guest_name)}</h4>
                        <p class="text-sm text-gray-400">${g.mobile_number}</p>
                        <p class="text-xs text-gray-500 mt-1">
                            ${g.guest_type === 'tabler' ? `📋 ${escapeHtml(g.table_name || '')} #${escapeHtml(g.table_number || '')}` : `🏛️ ${escapeHtml(g.club_name || '')} #${escapeHtml(g.club_number || '')}`}
                        </p>
                    </div>
                    <div class="flex flex-col items-end gap-2 ml-3">
                        <span class="px-2 py-1 rounded text-xs ${g.payment_mode === 'cash' ? 'bg-green-900/50 text-green-400' : g.payment_mode === 'upi' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}">
                            ${g.payment_mode === 'cash' ? '💵' : g.payment_mode === 'upi' ? '📱' : '🏦'} ${g.payment_mode.toUpperCase()}
                        </span>
                        <span class="text-yellow-400 font-bold">₹${g.ticket_price?.toLocaleString()}</span>
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
            
            // Super Admin edit/delete options (always show for SuperAdmin)
            if (currentUser && currentUser.role === 'super_admin') {
                actionButtons += `
                    <div class="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                        <button onclick="closeModal('guestDetailModal'); editGuest('${guest.id}')" class="vamosfesta-button secondary flex-1 py-2 text-sm">
                            <i class="fas fa-edit mr-2"></i>Edit Guest
                        </button>
                        <button onclick="closeModal('guestDetailModal'); deleteGuest('${guest.id}', '${escapeHtml(guest.guest_name)}')" class="vamosfesta-button danger flex-1 py-2 text-sm">
                            <i class="fas fa-trash mr-2"></i>Delete
                        </button>
                    </div>
                `;
            }
        }
        
        const content = `
            <!-- Guest Info Header -->
            <div class="text-center mb-4 pb-4 border-b border-gray-700">
                <div class="w-16 h-16 mx-auto rounded-full ${guest.guest_type === '41er' ? 'bg-purple-600/20' : 'bg-blue-600/20'} flex items-center justify-center mb-3">
                    <i class="fas ${guest.guest_type === '41er' ? 'fa-user-friends text-purple-400' : 'fa-users text-blue-400'} text-2xl"></i>
                </div>
                <h4 class="text-xl font-bold text-white">${escapeHtml(guest.guest_name)}</h4>
                <p class="text-gray-400">${guest.mobile_number}</p>
                <span class="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${guest.guest_type === '41er' ? 'bg-purple-900/50 text-purple-400 border border-purple-600/30' : 'bg-blue-900/50 text-blue-400 border border-blue-600/30'}">
                    ${guest.guest_type === '41er' ? "41'er" : 'Tabler'}
                </span>
                <div class="mt-2">${getStatusBadge(guest.status)}</div>
            </div>
            
            <!-- Guest Details -->
            <div class="space-y-3">
                ${guest.guest_type === 'tabler' ? `
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Table Name</span>
                    <span class="font-semibold text-blue-400">${escapeHtml(guest.table_name || '-')}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Table Number</span>
                    <span class="font-semibold">${escapeHtml(guest.table_number || '-')}</span>
                </div>
                ` : `
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Club Name</span>
                    <span class="font-semibold text-purple-400">${escapeHtml(guest.club_name || '-')}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Club Number</span>
                    <span class="font-semibold">${escapeHtml(guest.club_number || '-')}</span>
                </div>
                `}
                <div class="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span class="text-gray-400">Registration Type</span>
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
        
        // Send welcome message with portal link
        try {
            const { data: guest } = await supabase
                .from('guests')
                .select('*')
                .eq('id', guestId)
                .single();
            
            if (guest) {
                const { sendGuestWelcomeMessage } = await import('./whatsapp-service.js');
                await sendGuestWelcomeMessage(
                    guest.mobile_number,
                    guest.guest_name,
                    guest.id,
                    guest.entry_type
                );
                showToast('Welcome message sent to guest!', 'success');
            }
        } catch (whatsappError) {
            console.warn('WhatsApp welcome message failed:', whatsappError);
        }
        
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

// Edit Guest Function
window.editGuest = async function(guestId) {
    try {
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*')
            .eq('id', guestId)
            .single();
        
        if (error) throw error;
        
        // Pre-fill the registration form with guest data
        document.getElementById('guestName').value = guest.guest_name || '';
        document.getElementById('mobileNumber').value = guest.mobile_number || '';
        document.getElementById('entryType').value = guest.entry_type || '';
        document.getElementById('ticketPrice').value = guest.ticket_price || '';
        document.getElementById('paymentMode').value = guest.payment_mode || '';
        
        // Set guest type
        if (guest.guest_type === 'tabler') {
            selectGuestType('tabler');
            document.getElementById('tableName').value = guest.table_name || '';
            document.getElementById('tableNumber').value = guest.table_number || '';
        } else {
            selectGuestType('41er');
            document.getElementById('clubName').value = guest.club_name || '';
            document.getElementById('clubNumber').value = guest.club_number || '';
        }
        
        // Store guest ID for update
        document.getElementById('registrationForm').dataset.editingGuestId = guestId;
        
        // Update form button text
        const submitBtn = document.querySelector('#registrationForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Update Guest';
        }
        
        // Switch to registration tab
        showTab('tab-registration');
        showToast('Editing guest - update details and save', 'info');
        
    } catch (error) {
        console.error('Error loading guest for edit:', error);
        showToast('Failed to load guest details', 'error');
    }
};

// Delete Guest Function
window.deleteGuest = async function(guestId, guestName) {
    if (!confirm(`⚠️ DELETE GUEST?\n\nAre you sure you want to permanently delete "${guestName}"?\n\nThis action CANNOT be undone!`)) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('guests')
            .delete()
            .eq('id', guestId);
        
        if (error) throw error;
        
        showToast(`Guest "${guestName}" deleted successfully`, 'success');
        
        // Refresh the current view
        if (currentUser.role === 'super_admin') {
            await loadAllRegistrations(currentStatusFilter);
        }
        
    } catch (error) {
        console.error('Error deleting guest:', error);
        showToast('Failed to delete guest', 'error');
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
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 rounded text-xs ${g.guest_type === '41er' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}">
                            ${g.guest_type === '41er' ? "41'er" : 'Tabler'}
                        </span>
                        <span class="text-xs text-gray-500 capitalize">${g.entry_type}</span>
                    </div>
                    <h4 class="font-semibold text-white truncate">${escapeHtml(g.guest_name)}</h4>
                    <p class="text-sm text-gray-400">${g.mobile_number}</p>
                    <p class="text-xs text-gray-500 mt-1">
                        ${g.guest_type === 'tabler' ? `📋 ${escapeHtml(g.table_name || '')} #${escapeHtml(g.table_number || '')}` : `🏛️ ${escapeHtml(g.club_name || '')} #${escapeHtml(g.club_number || '')}`}
                    </p>
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
        const eventTagline = settings.event_tagline || 'Viva La Festa';
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
                    <p style="color: #f5d76e; font-size: 18px; margin: 10px 0 0;">🎫 ${guest.guest_type === '41er' ? "41'ER" : 'TABLER'} PASS</p>
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
                        ${guest.guest_type === 'tabler' ? `
                        <div style="margin-bottom: 12px;">
                            <p style="color: #d4a853; font-size: 11px; margin: 0;">TABLE</p>
                            <p style="font-size: 14px; margin: 2px 0 0;">${escapeHtml(guest.table_name || '')} #${escapeHtml(guest.table_number || '')}</p>
                        </div>
                        ` : `
                        <div style="margin-bottom: 12px;">
                            <p style="color: #d4a853; font-size: 11px; margin: 0;">CLUB</p>
                            <p style="font-size: 14px; margin: 2px 0 0;">${escapeHtml(guest.club_name || '')} #${escapeHtml(guest.club_number || '')}</p>
                        </div>
                        `}
                        <div style="margin-bottom: 12px;">
                            <p style="color: #d4a853; font-size: 11px; margin: 0;">REGISTRATION TYPE</p>
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
        
        const guestTypeLabel = currentGuestForPass.guest_type === '41er' ? "41'er" : 'Tabler';
        const orgInfo = currentGuestForPass.guest_type === 'tabler' 
            ? `• Table: ${currentGuestForPass.table_name || ''} #${currentGuestForPass.table_number || ''}`
            : `• Club: ${currentGuestForPass.club_name || ''} #${currentGuestForPass.club_number || ''}`;
        
        const message = `🎸 *${eventName.toUpperCase()} - ${guestTypeLabel.toUpperCase()} PASS* 🎸

Hello ${currentGuestForPass.guest_name}!

Your registration is confirmed! ✅

📋 *Details:*
• Name: ${currentGuestForPass.guest_name}
• Type: ${guestTypeLabel}
${orgInfo}
• Registration: ${currentGuestForPass.entry_type.toUpperCase()}
• Mobile: ${currentGuestForPass.mobile_number}

📅 Date: ${eventDate}
📍 Venue: ${eventVenue}

Please show this pass and QR code at the entrance.

See you at the event! 🎵

_Viva La Festa_`;
        
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
        // Get filter selection
        const filter = document.getElementById('userStatusFilter')?.value || 'active';
        
        let query = supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        // Apply filter
        if (filter === 'active') {
            query = query.eq('is_active', true);
        } else if (filter === 'inactive') {
            query = query.eq('is_active', false);
        }
        
        const { data: users, error: userError } = await query;
        
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
        
        const container = document.getElementById('usersListContainer');
        if (!container) return;
        
        if (usersWithStats.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">No users found.</div>';
            return;
        }
        
        // Create clean card list - clickable to expand
        container.innerHTML = usersWithStats.map(u => {
            // Detect role: Check database role FIRST for super_admin, then username prefix (longest first), then flags
            let roleConfig = null;
            
            // Priority 1: If database role is super_admin, use that
            if (u.role === 'super_admin') {
                roleConfig = ROLE_CONFIG['super_admin'];
            }
            
            // Priority 2: Check username prefix (longest matches first to avoid Admin matching before SuperAdmin)
            if (!roleConfig) {
                const prefixes = Object.values(ROLE_CONFIG).map(r => r.prefix).sort((a, b) => b.length - a.length);
                for (const prefix of prefixes) {
                    if (u.username.startsWith(prefix)) {
                        roleConfig = Object.values(ROLE_CONFIG).find(r => r.prefix === prefix);
                        break;
                    }
                }
            }
            
            // Priority 3: Check flags (overseer, barman, etc.)
            if (!roleConfig) {
                roleConfig = Object.values(ROLE_CONFIG).find(r => r.flags && Object.keys(r.flags).some(k => u[k]));
            }
            
            // Priority 4: Fallback to database role
            if (!roleConfig) {
                roleConfig = Object.values(ROLE_CONFIG).find(r => r.dbRole === u.role);
            }
            
            const roleDisplay = roleConfig ? `${roleConfig.icon} ${roleConfig.desc}` : formatRole(u.role);
            
            const statusBadge = !u.is_active 
                ? '<span class="status-badge" style="background: #ef4444;"><i class="fas fa-ban mr-1"></i>DEACTIVATED</span>'
                : '';
            
            const uniqueId = `user-${u.id}`;
            
            return `
                <div class="card hover:border-yellow-500 transition-all cursor-pointer ${!u.is_active ? 'opacity-60' : ''}" 
                     onclick="toggleUserDetails('${uniqueId}')">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold text-lg">${escapeHtml(u.full_name || u.username)}</h4>
                                ${statusBadge}
                            </div>
                            <div class="flex items-center gap-4 text-sm text-gray-400">
                                <span><i class="fas fa-user-tag mr-1"></i><span class="role-badge role-${u.role}">${formatRole(u.role)}</span></span>
                                <span><i class="fas fa-phone mr-1"></i>${u.mobile_number || '-'}</span>
                                ${u.club_name ? `<span><i class="fas fa-users mr-1"></i>${escapeHtml(u.club_name)}</span>` : ''}
                            </div>
                        </div>
                        <i id="${uniqueId}-icon" class="fas fa-chevron-down text-gray-400 transition-transform"></i>
                    </div>
                    
                    <!-- Expandable Details -->
                    <div id="${uniqueId}-details" class="hidden mt-4 pt-4 border-t border-gray-700 space-y-3">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Username:</span>
                                <span class="text-white font-mono ml-2">${escapeHtml(u.username)}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Role:</span>
                                <span class="text-white ml-2">${roleDisplay}</span>
                            </div>
                            ${u.club_name ? `
                                <div>
                                    <span class="text-gray-500">Club:</span>
                                    <span class="text-yellow-400 ml-2">${escapeHtml(u.club_name)}</span>
                                </div>
                            ` : ''}
                            ${u.club_number ? `
                                <div>
                                    <span class="text-gray-500">Club #:</span>
                                    <span class="text-white ml-2">${escapeHtml(u.club_number)}</span>
                                </div>
                            ` : ''}
                            ${u.total_registrations > 0 ? `
                                <div>
                                    <span class="text-gray-500">Registrations:</span>
                                    <span class="text-white ml-2">${u.total_registrations || 0}</span>
                                </div>
                                <div>
                                    <span class="text-gray-500">Verified Amount:</span>
                                    <span class="text-green-400 ml-2">₹${(u.total_verified_amount || 0).toLocaleString()}</span>
                                </div>
                            ` : ''}
                            ${!u.is_active && u.deactivation_reason ? `
                                <div class="col-span-2">
                                    <span class="text-gray-500">Deactivation Reason:</span>
                                    <span class="text-red-400 ml-2">${u.deactivation_reason.replace('_', ' ')}</span>
                                    ${u.deactivated_at ? ` <span class="text-gray-500 text-xs">(${new Date(u.deactivated_at).toLocaleDateString()})</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex flex-wrap gap-2 pt-3">
                            ${u.is_active ? `
                                <button onclick="event.stopPropagation(); editUser('${u.id}')" 
                                        class="vamosfesta-button secondary text-xs">
                                    <i class="fas fa-edit mr-1"></i>Edit
                                </button>
                                <button onclick="event.stopPropagation(); deactivateUser('${u.id}', '${escapeHtml(u.username)}', '${escapeHtml(u.full_name || u.username)}')" 
                                        class="vamosfesta-button danger text-xs">
                                    <i class="fas fa-user-slash mr-1"></i>Deactivate
                                </button>
                                <button onclick="event.stopPropagation(); deleteUser('${u.id}', '${escapeHtml(u.username)}', '${escapeHtml(u.full_name || u.username)}')" 
                                        class="vamosfesta-button danger text-xs ml-auto">
                                    <i class="fas fa-trash mr-1"></i>Delete
                                </button>
                            ` : `
                                <button onclick="event.stopPropagation(); reactivateUser('${u.id}', '${escapeHtml(u.username)}', '${escapeHtml(u.full_name || u.username)}')" 
                                        class="vamosfesta-button success text-xs">
                                    <i class="fas fa-user-check mr-1"></i>Reactivate
                                </button>
                                <button onclick="event.stopPropagation(); deleteUser('${u.id}', '${escapeHtml(u.username)}', '${escapeHtml(u.full_name || u.username)}')" 
                                        class="vamosfesta-button danger text-xs ml-auto">
                                    <i class="fas fa-trash mr-1"></i>Delete
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading sellers:', error);
    }
}

// Toggle user details expand/collapse
window.toggleUserDetails = function(uniqueId) {
    const details = document.getElementById(`${uniqueId}-details`);
    const icon = document.getElementById(`${uniqueId}-icon`);
    
    if (!details || !icon) return;
    
    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    } else {
        details.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
};

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

// ============================================
// ADMIN MODAL FUNCTIONS
// ============================================

// Admin-specific role configuration (subset of ROLE_CONFIG for admin types only)
const ADMIN_ROLE_MAPPING = {
    'admin': 'admin',
    'gate_overseer': 'gate_overseer',
    'siptoken_overseer': 'siptoken_overseer'
};

// Update admin role selection - show preview and update username prefix
window.updateAdminRoleSelection = function() {
    const select = document.getElementById('adminTypeSelect');
    const roleKey = select.value;
    const previewCard = document.getElementById('adminRolePreviewCard');
    
    if (!roleKey) {
        previewCard.classList.add('hidden');
        document.getElementById('adminUsernamePrefix').textContent = '---';
        document.getElementById('adminUsernameValue').textContent = '---';
        document.getElementById('adminUsername').value = '';
        return;
    }
    
    // Get config from main ROLE_CONFIG
    const mappedRole = ADMIN_ROLE_MAPPING[roleKey];
    const config = ROLE_CONFIG[mappedRole];
    if (!config) return;
    
    // Show preview card
    previewCard.classList.remove('hidden');
    previewCard.className = `card border-2 ${config.color}`;
    
    // Update preview content
    document.getElementById('adminRolePreviewIcon').textContent = config.icon;
    document.getElementById('adminRolePreviewTitle').textContent = config.desc;
    document.getElementById('adminRolePreviewDesc').textContent = 
        roleKey === 'admin' ? 'Read-only access to reports and analytics' :
        roleKey === 'gate_overseer' ? 'Manages entry marshalls and venue operations' :
        'Manages token sales staff and barmen, handles reconciliation';
    document.getElementById('adminRoleReportsTo').textContent = config.reportsTo;
    document.getElementById('adminRolePrefix').textContent = config.prefix;
    
    // Update username prefix
    document.getElementById('adminUsernamePrefix').textContent = config.prefix;
    
    // Regenerate username if name exists
    generateAdminUsername();
};

// Generate username for admin
window.generateAdminUsername = function() {
    const roleKey = document.getElementById('adminTypeSelect').value;
    const firstName = document.getElementById('adminFirstName').value.trim();
    
    if (!roleKey || !firstName) {
        document.getElementById('adminUsernameValue').textContent = '---';
        document.getElementById('adminUsername').value = '';
        return;
    }
    
    // Get config from main ROLE_CONFIG
    const mappedRole = ADMIN_ROLE_MAPPING[roleKey];
    const config = ROLE_CONFIG[mappedRole];
    if (!config) return;
    
    // Clean first name: remove spaces, special chars, capitalize first letter
    const cleanName = firstName.replace(/[^a-zA-Z]/g, '');
    const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    
    // Generate username: Prefix-Name
    const username = `${config.prefix}-${formattedName}`;
    
    // Update display and hidden input
    document.getElementById('adminUsernameValue').textContent = formattedName;
    document.getElementById('adminUsername').value = username;
};

// ============================================
// END ADMIN MODAL FUNCTIONS
// ============================================

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
        // Check username uniqueness (skip check if editing and username unchanged)
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
        } else {
            // For edits, check if username changed and if new username exists
            const { data: currentUser } = await supabase
                .from('users')
                .select('username')
                .eq('id', userId)
                .single();
            
            if (currentUser && currentUser.username !== username) {
                const { data: existing } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', username)
                    .single();
                
                if (existing) {
                    showToast('Username already exists! Cannot change to this role/name combination.', 'error');
                    return;
                }
            }
        }
        
        if (isEdit) {
            // Update user including username (RBAC protocol requires username to match role)
            console.log('Updating user with data:', userData);
            const { data: result, error } = await supabase
                .from('users')
                .update(userData)
                .eq('id', userId)
                .select();
            
            if (error) {
                console.error('Update error details:', error);
                throw error;
            }
            console.log('User updated successfully:', result);
            showToast('User role and details updated successfully!', 'success');
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

// Delete user permanently
window.deleteUser = async function(userId, username, fullName) {
    const displayName = fullName || username;
    
    if (!confirm(`⚠️ PERMANENT DELETE\n\nAre you sure you want to permanently delete user "${displayName}"?\n\nThis will:\n- Remove the user account\n- Delete all associated data\n- Cannot be undone\n\nType "DELETE" to confirm.`)) {
        return;
    }
    
    // Double confirmation
    const confirmation = prompt(`Type "DELETE" to confirm permanent deletion of ${displayName}:`);
    if (confirmation !== 'DELETE') {
        showToast('Deletion cancelled', 'info');
        return;
    }
    
    try {
        // Check if user has any registrations
        const { data: registrations, error: checkError } = await supabase
            .from('guests')
            .select('id')
            .eq('registered_by', userId);
        
        if (checkError) throw checkError;
        
        if (registrations && registrations.length > 0) {
            if (!confirm(`This user has ${registrations.length} guest registration(s). Delete anyway?`)) {
                return;
            }
        }
        
        // Prevent deleting yourself
        if (currentUser.id === userId) {
            showToast('Cannot delete your own account', 'error');
            return;
        }
        
        // Clear all foreign key references before deleting to avoid constraint errors
        try {
            // Update guests registered by this user
            await supabase.from('guests').update({ registered_by: null }).eq('registered_by', userId);
            
            // Update beverage orders
            await supabase.from('beverage_orders').update({ barman_id: null }).eq('barman_id', userId);
            
            // Update token orders
            await supabase.from('token_orders').update({ barman_id: null }).eq('barman_id', userId);
            await supabase.from('token_orders').update({ accepted_by: null }).eq('accepted_by', userId);
            
            // Update gate activity logs
            await supabase.from('gate_activity_log').update({ marshall_id: null }).eq('marshall_id', userId);
            
            // Update marshall duties
            await supabase.from('marshall_duties').update({ marshall_id: null }).eq('marshall_id', userId);
            
            // Update token purchases
            await supabase.from('token_purchases').update({ sold_by: null }).eq('sold_by', userId);
            
            // Update bar counters (created_by foreign key)
            await supabase.from('bar_counters').update({ created_by: null }).eq('created_by', userId);
            
            // Update clockin_tokens
            await supabase.from('clockin_tokens').update({ created_by: null }).eq('created_by', userId);
            
            // Update entry_gates
            await supabase.from('entry_gates').update({ created_by: null }).eq('created_by', userId);
            
            // Update users table references (deactivated_by, created_by)
            await supabase.from('users').update({ deactivated_by: null }).eq('deactivated_by', userId);
            await supabase.from('users').update({ created_by: null }).eq('created_by', userId);
            
            console.log('Cleared all foreign key references for user:', userId);
        } catch (fkError) {
            console.warn('Warning while clearing foreign keys:', fkError);
            // Continue with deletion even if some FKs fail to clear
        }
        
        // Delete user
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
        
        if (error) {
            console.error('Delete error details:', error);
            throw new Error(`Database error: ${error.message}. Code: ${error.code}`);
        }
        
        showToast(`User "${displayName}" deleted permanently`, 'success');
        await loadSellers();
        
    } catch (error) {
        console.error('Error deleting user:', error);
        
        // Provide more specific error messages
        let errorMsg = error.message;
        if (error.message.includes('violates foreign key constraint')) {
            errorMsg = 'Cannot delete user: Still has linked records in database. Contact developer.';
        } else if (error.code === '42501') {
            errorMsg = 'Permission denied. Only Super Admin can delete users.';
        } else if (error.code === '23503') {
            errorMsg = 'Cannot delete: User has dependent records that must be removed first.';
        }
        
        showToast('Failed to delete user: ' + errorMsg, 'error');
    }
};

// =====================================================
// ADMIN: READ-ONLY VIEWS
// =====================================================

let adminRegistrationsCache = [];

async function loadAdminRegistrations() {
    try {
        const { data: guests, error} = await supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        adminRegistrationsCache = guests || [];
        renderAdminRegistrations(adminRegistrationsCache);
        
    } catch (error) {
        console.error('Error loading admin registrations:', error);
        document.getElementById('adminRegListContainer').innerHTML = 
            '<div class="text-center py-8 text-red-400">Error loading registrations</div>';
    }
}

function renderAdminRegistrations(guests) {
    const container = document.getElementById('adminRegListContainer');
    
    if (!guests || guests.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No registrations found</div>';
        return;
    }
    
    container.innerHTML = guests.map((g, index) => {
        const uniqueId = `admin-reg-${g.id || index}`;
        const statusClass = g.status === 'payment_verified' ? 'bg-green-900/20 border-green-600/30' :
                           g.status === 'pending_verification' ? 'bg-orange-900/20 border-orange-600/30' :
                           'bg-gray-900/20 border-gray-600/30';
        
        return `
            <div class="card ${statusClass} cursor-pointer hover:border-yellow-600/50 transition-all" onclick="toggleAdminRegDetails('${uniqueId}')">
                <!-- Collapsed View -->
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <h4 class="font-semibold text-white">${escapeHtml(g.guest_name)}</h4>
                                <p class="text-sm text-gray-400">📱 ${g.mobile_number}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-sm capitalize">${g.entry_type}</p>
                                <p class="font-bold text-yellow-400">₹${g.ticket_price?.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <i id="chevron-${uniqueId}" class="fas fa-chevron-down text-gray-500 ml-3 transition-transform"></i>
                </div>
                
                <!-- Expanded Details -->
                <div id="details-${uniqueId}" class="hidden mt-4 pt-4 border-t border-gray-700 space-y-3">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-gray-400">Payment:</span>
                            <p class="font-semibold">${formatPaymentMode(g.payment_mode)}</p>
                        </div>
                        <div>
                            <span class="text-gray-400">Reference:</span>
                            <p class="font-semibold">${g.payment_reference || '-'}</p>
                        </div>
                        <div>
                            <span class="text-gray-400">Seller:</span>
                            <p class="font-semibold">${g.seller?.full_name || g.seller?.username || '-'}</p>
                        </div>
                        <div>
                            <span class="text-gray-400">Status:</span>
                            <p>${getStatusBadge(g.status)}</p>
                        </div>
                        <div class="col-span-2">
                            <span class="text-gray-400">Registered:</span>
                            <p class="font-semibold">${formatDate(g.created_at)}</p>
                        </div>
                        ${g.verified_at ? `<div class="col-span-2">
                            <span class="text-gray-400">Verified:</span>
                            <p class="font-semibold">${formatDate(g.verified_at)}</p>
                        </div>` : ''}
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="flex gap-2 pt-3">
                        <button onclick="event.stopPropagation(); editGuest('${g.id}')" 
                                class="flex-1 btn-secondary text-sm py-2">
                            <i class="fas fa-edit mr-1"></i> Edit Guest
                        </button>
                        <button onclick="event.stopPropagation(); deleteGuest('${g.id}')" 
                                class="flex-1 btn-danger text-sm py-2">
                            <i class="fas fa-trash mr-1"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle function for admin registrations
window.toggleAdminRegDetails = function(uniqueId) {
    const details = document.getElementById(`details-${uniqueId}`);
    const chevron = document.getElementById(`chevron-${uniqueId}`);
    
    if (details && chevron) {
        details.classList.toggle('hidden');
        chevron.classList.toggle('fa-chevron-down');
        chevron.classList.toggle('fa-chevron-up');
    }
};

// Filter function for admin registrations
window.filterAdminRegistrations = function() {
    const searchTerm = document.getElementById('adminSearchReg')?.value.toLowerCase() || '';
    const filtered = adminRegistrationsCache.filter(g => 
        g.guest_name.toLowerCase().includes(searchTerm) ||
        g.mobile_number.includes(searchTerm) ||
        (g.seller?.full_name || '').toLowerCase().includes(searchTerm) ||
        (g.seller?.username || '').toLowerCase().includes(searchTerm)
    );
    renderAdminRegistrations(filtered);
};

let adminSellersCache = [];

async function loadAdminSellerStats() {
    try {
        const { data: stats, error } = await supabase
            .from('seller_stats')
            .select('*');
        
        if (error) throw error;
        
        adminSellersCache = stats || [];
        renderAdminSellers(adminSellersCache);
        
    } catch (error) {
        console.error('Error loading admin seller stats:', error);
        document.getElementById('adminSellersListContainer').innerHTML = 
            '<div class="text-center py-8 text-red-400">Error loading seller stats</div>';
    }
}

function renderAdminSellers(sellers) {
    const container = document.getElementById('adminSellersListContainer');
    
    if (!sellers || sellers.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No seller data available</div>';
        return;
    }
    
    container.innerHTML = sellers.map((s, index) => {
        const uniqueId = `admin-seller-${s.seller_id || index}`;
        const hasClub = s.club_name && s.club_name.trim() !== '';
        
        return `
            <div class="card cursor-pointer hover:border-yellow-600/50 transition-all" onclick="toggleAdminSellerDetails('${uniqueId}')">
                <!-- Collapsed View -->
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <h4 class="font-semibold text-white">${escapeHtml(s.full_name || s.username)}</h4>
                                ${hasClub ? `<p class="text-sm text-yellow-400">🏷️ ${escapeHtml(s.club_name)}</p>` : '<p class="text-sm text-gray-500">Guest Registration</p>'}
                            </div>
                            <div class="text-right">
                                <p class="text-2xl font-bold text-green-400">${s.total_registrations || 0}</p>
                                <p class="text-xs text-gray-400">registrations</p>
                            </div>
                        </div>
                    </div>
                    <i id="chevron-${uniqueId}" class="fas fa-chevron-down text-gray-500 ml-3 transition-transform"></i>
                </div>
                
                <!-- Expanded Details -->
                <div id="details-${uniqueId}" class="hidden mt-4 pt-4 border-t border-gray-700">
                    <!-- Status Breakdown -->
                    <div class="grid grid-cols-3 gap-3 mb-4">
                        <div class="text-center p-3 bg-orange-900/20 rounded-lg">
                            <p class="text-2xl font-bold text-orange-400">${s.pending_count || 0}</p>
                            <p class="text-xs text-gray-400">Pending</p>
                        </div>
                        <div class="text-center p-3 bg-green-900/20 rounded-lg">
                            <p class="text-2xl font-bold text-green-400">${s.verified_count || 0}</p>
                            <p class="text-xs text-gray-400">Verified</p>
                        </div>
                        <div class="text-center p-3 bg-blue-900/20 rounded-lg">
                            <p class="text-2xl font-bold text-blue-400">${s.rejected_count || 0}</p>
                            <p class="text-xs text-gray-400">Rejected</p>
                        </div>
                    </div>
                    
                    <!-- Entry Types -->
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="p-3 bg-gray-800/50 rounded-lg">
                            <p class="text-sm text-gray-400">Stag Entries</p>
                            <p class="text-xl font-bold text-white">${s.stag_count || 0}</p>
                        </div>
                        <div class="p-3 bg-gray-800/50 rounded-lg">
                            <p class="text-sm text-gray-400">Couple Entries</p>
                            <p class="text-xl font-bold text-white">${s.couple_count || 0}</p>
                        </div>
                    </div>
                    
                    <!-- Payment Breakdown -->
                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-400">💵 Cash:</span>
                            <span class="font-semibold">₹${(s.cash_collected || 0).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-400">📱 UPI:</span>
                            <span class="font-semibold">₹${(s.upi_collected || 0).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-400">🏦 Bank:</span>
                            <span class="font-semibold">₹${(s.bank_collected || 0).toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <!-- Total Revenue -->
                    <div class="p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                        <div class="flex justify-between items-center">
                            <span class="text-green-400 font-semibold">Total Revenue:</span>
                            <span class="text-2xl font-bold text-green-400">₹${(s.total_verified_amount || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle function for admin sellers
window.toggleAdminSellerDetails = function(uniqueId) {
    const details = document.getElementById(`details-${uniqueId}`);
    const chevron = document.getElementById(`chevron-${uniqueId}`);
    
    if (details && chevron) {
        details.classList.toggle('hidden');
        chevron.classList.toggle('fa-chevron-down');
        chevron.classList.toggle('fa-chevron-up');
    }
};

// Filter function for admin sellers
window.filterAdminSellers = function() {
    const searchTerm = document.getElementById('adminSearchSeller')?.value.toLowerCase() || '';
    const filtered = adminSellersCache.filter(s => 
        (s.full_name || '').toLowerCase().includes(searchTerm) ||
        (s.username || '').toLowerCase().includes(searchTerm) ||
        (s.club_name || '').toLowerCase().includes(searchTerm)
    );
    renderAdminSellers(filtered);
};

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
            'Guest Type': g.guest_type === '41er' ? "41'er" : 'Tabler',
            'Table Name': g.table_name || '',
            'Table Number': g.table_number || '',
            'Club Name': g.club_name || '',
            'Club Number': g.club_number || '',
            'Registration Type': g.entry_type,
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
    try {
        showToast('Generating report...', 'info');
        
        // Fetch all data
        const { data: guests, error: guestsError } = await supabase
            .from('guests')
            .select(`*, seller:registered_by(username, full_name)`)
            .order('created_at', { ascending: false });
        
        if (guestsError) throw guestsError;
        
        // Calculate statistics
        const stats = {
            totalRegistrations: guests.length,
            totalPax: guests.reduce((sum, g) => sum + (g.entry_type === 'couple' ? 2 : 1), 0),
            pendingVerification: guests.filter(g => g.status === 'pending_verification').length,
            paymentVerified: guests.filter(g => g.status === 'payment_verified').length,
            passGenerated: guests.filter(g => g.status === 'pass_generated').length,
            passSent: guests.filter(g => g.status === 'pass_sent').length,
            checkedIn: guests.filter(g => g.status === 'checked_in').length,
            rejected: guests.filter(g => g.status === 'rejected').length,
            stagCount: guests.filter(g => g.entry_type === 'stag').length,
            coupleCount: guests.filter(g => g.entry_type === 'couple').length,
            verifiedRevenue: guests
                .filter(g => ['payment_verified', 'pass_generated', 'pass_sent', 'checked_in'].includes(g.status))
                .reduce((sum, g) => sum + (parseFloat(g.ticket_price) || 0), 0),
            cashRevenue: guests
                .filter(g => ['payment_verified', 'pass_generated', 'pass_sent', 'checked_in'].includes(g.status) && g.payment_mode === 'cash')
                .reduce((sum, g) => sum + (parseFloat(g.ticket_price) || 0), 0),
            upiRevenue: guests
                .filter(g => ['payment_verified', 'pass_generated', 'pass_sent', 'checked_in'].includes(g.status) && g.payment_mode === 'upi')
                .reduce((sum, g) => sum + (parseFloat(g.ticket_price) || 0), 0),
            bankRevenue: guests
                .filter(g => ['payment_verified', 'pass_generated', 'pass_sent', 'checked_in'].includes(g.status) && g.payment_mode === 'bank')
                .reduce((sum, g) => sum + (parseFloat(g.ticket_price) || 0), 0)
        };
        
        // Get event details from settings
        const eventName = settings.event_name || 'Vamos Festa';
        const eventDate = settings.event_date || 'TBD';
        const eventVenue = settings.event_venue || 'TBD';
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // === SUMMARY SHEET ===
        const summaryData = [
            ['VAMOS FESTA'],
            ['EVENT STATISTICS REPORT'],
            [''],
            ['Event Name:', eventName],
            ['Event Date:', eventDate],
            ['Venue:', eventVenue],
            ['Report Generated:', new Date().toLocaleString()],
            [''],
            ['OVERVIEW STATISTICS'],
            ['Metric', 'Value'],
            ['Total Registrations', stats.totalRegistrations],
            ['Total PAX', stats.totalPax],
            ['Verified Revenue', `₹${stats.verifiedRevenue.toFixed(2)}`],
            ['Checked In', stats.checkedIn],
            [''],
            ['STATUS BREAKDOWN'],
            ['Status', 'Count'],
            ['Pending Verification', stats.pendingVerification],
            ['Payment Verified', stats.paymentVerified],
            ['Pass Generated', stats.passGenerated],
            ['Pass Sent', stats.passSent],
            ['Checked In', stats.checkedIn],
            ['Rejected', stats.rejected],
            [''],
            ['ENTRY TYPE BREAKDOWN'],
            ['Entry Type', 'Count'],
            ['Stag Entries', stats.stagCount],
            ['Couple Entries', stats.coupleCount],
            [''],
            ['PAYMENT METHOD BREAKDOWN'],
            ['Payment Mode', 'Amount'],
            ['Cash', `₹${stats.cashRevenue.toFixed(2)}`],
            ['UPI', `₹${stats.upiRevenue.toFixed(2)}`],
            ['Bank Transfer', `₹${stats.bankRevenue.toFixed(2)}`],
            ['Total Verified', `₹${stats.verifiedRevenue.toFixed(2)}`]
        ];
        
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        
        // Set column widths for summary
        wsSummary['!cols'] = [
            { wch: 25 },
            { wch: 30 }
        ];
        
        // Merge cells for header
        wsSummary['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, // VAMOS FESTA
            { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }  // EVENT STATISTICS REPORT
        ];
        
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
        
        // === REGISTRATIONS SHEET ===
        const registrationsData = [
            ['VAMOS FESTA - REGISTRATIONS DATA'],
            ['Event:', eventName, 'Date:', eventDate, 'Venue:', eventVenue],
            [''],
            [
                'Guest Name',
                'Mobile',
                'Guest Type',
                'Table Name',
                'Table Number',
                'Club Name',
                'Club Number',
                'Entry Type',
                'Amount',
                'Payment Mode',
                'Payment Ref',
                'Seller',
                'Status',
                'Registered At',
                'Verified At'
            ]
        ];
        
        // Add guest data or empty row
        if (guests.length > 0) {
            guests.forEach(g => {
                registrationsData.push([
                    g.guest_name,
                    g.mobile_number,
                    g.guest_type === '41er' ? "41'er" : 'Tabler',
                    g.table_name || '',
                    g.table_number || '',
                    g.club_name || '',
                    g.club_number || '',
                    g.entry_type,
                    g.ticket_price,
                    g.payment_mode,
                    g.payment_reference || '',
                    g.seller?.full_name || g.seller?.username || '',
                    g.status,
                    formatDate(g.created_at),
                    g.verified_at ? formatDate(g.verified_at) : ''
                ]);
            });
        } else {
            registrationsData.push(['No registrations yet', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        }
        
        const wsRegistrations = XLSX.utils.aoa_to_sheet(registrationsData);
        
        // Set column widths
        wsRegistrations['!cols'] = [
            { wch: 20 }, // Guest Name
            { wch: 12 }, // Mobile
            { wch: 12 }, // Guest Type
            { wch: 15 }, // Table Name
            { wch: 12 }, // Table Number
            { wch: 20 }, // Club Name
            { wch: 12 }, // Club Number
            { wch: 10 }, // Entry Type
            { wch: 10 }, // Amount
            { wch: 12 }, // Payment Mode
            { wch: 15 }, // Payment Ref
            { wch: 15 }, // Seller
            { wch: 18 }, // Status
            { wch: 18 }, // Registered At
            { wch: 18 }  // Verified At
        ];
        
        // Merge cells for header
        wsRegistrations['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } } // Title
        ];
        
        XLSX.utils.book_append_sheet(wb, wsRegistrations, 'Registrations');
        
        // Generate Excel file
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VamosFesta-Report-${formatDateForFile()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Report downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error generating report:', error);
        showToast('Failed to generate report', 'error');
    }
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

// Show Marshall Clock-in Token QR Code
window.showTokenQR = async function(tokenString) {
    try {
        const modalHtml = `
            <div class="modal active" id="tokenQRModal" style="z-index: 10000;">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">Clock-in Token QR</h3>
                        <button onclick="closeTokenQRModal()" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div class="flex flex-col items-center">
                        <div id="tokenQRCode" class="bg-white p-4 rounded"></div>
                        <p class="text-sm text-gray-400 mt-4 text-center">Scan this QR to clock in</p>
                        <p class="text-xs text-gray-500 mt-2 break-all">${tokenString.substring(0, 20)}...</p>
                    </div>
                    <button onclick="closeTokenQRModal()" class="vamosfesta-button w-full mt-4">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('tokenQRModal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Generate QR code
        const qrContainer = document.getElementById('tokenQRCode');
        new QRCode(qrContainer, {
            text: tokenString,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        
    } catch (error) {
        console.error('Error showing token QR:', error);
        showToast('Failed to display QR code', 'error');
    }
};

window.closeTokenQRModal = function() {
    const modal = document.getElementById('tokenQRModal');
    if (modal) modal.remove();
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
        // Get filter selection
        const filter = document.getElementById('adminStatusFilter')?.value || 'active';
        
        let query = supabase
            .from('users')
            .select('*')
            .eq('role', 'admin')
            .order('full_name');
        
        // Apply filter
        if (filter === 'active') {
            query = query.eq('is_active', true);
        } else if (filter === 'inactive') {
            query = query.eq('is_active', false);
        }
        
        const { data: admins, error } = await query;
        
        if (error) throw error;
        
        // Get overseer assignments for each admin
        const { data: assignments, error: assignError } = await supabase
            .from('overseer_assignments')
            .select('*, entry_gates(gate_name, gate_code)');
        
        if (assignError) throw assignError;
        
        const container = document.getElementById('adminsListContainer');
        if (!admins || admins.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">No admins found. Create one using the button above.</div>';
            return;
        }
        
        // Create simplified card list - clickable to expand
        container.innerHTML = admins.map(admin => {
            const adminAssignments = assignments?.filter(a => a.overseer_id === admin.id) || [];
            const isOverseer = admin.is_gate_overseer;
            const isSiptokenOverseer = admin.is_siptoken_overseer;
            
            // Determine role badge
            let roleBadge = '';
            let roleText = 'Admin';
            
            if (isOverseer && isSiptokenOverseer) {
                roleBadge = '<span class="status-badge" style="background: #f59e0b;"><i class="fas fa-door-open mr-1"></i>Gate</span> <span class="status-badge" style="background: #3b82f6;"><i class="fas fa-coins mr-1"></i>SipToken</span>';
                roleText = 'Gate & SipToken Overseer';
            } else if (isOverseer) {
                roleBadge = '<span class="status-badge" style="background: #f59e0b;"><i class="fas fa-door-open mr-1"></i>Gate Overseer</span>';
                roleText = 'Gate Overseer';
            } else if (isSiptokenOverseer) {
                roleBadge = '<span class="status-badge" style="background: #3b82f6;"><i class="fas fa-coins mr-1"></i>SipToken Overseer</span>';
                roleText = 'SipToken Overseer';
            } else {
                roleBadge = '<span class="text-gray-400 text-sm">Read-Only Admin</span>';
                roleText = 'Admin (Read-Only)';
            }
            
            const statusBadge = !admin.is_active 
                ? '<span class="status-badge" style="background: #ef4444;"><i class="fas fa-ban mr-1"></i>DEACTIVATED</span>'
                : '';
            
            const uniqueId = `admin-${admin.id}`;
            
            return `
                <div class="card hover:border-yellow-500 transition-all cursor-pointer ${!admin.is_active ? 'opacity-60' : ''}" 
                     onclick="toggleAdminDetails('${uniqueId}')">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold text-lg">${escapeHtml(admin.full_name)}</h4>
                                ${statusBadge}
                            </div>
                            <div class="flex items-center gap-4 text-sm text-gray-400">
                                <span><i class="fas fa-user-tag mr-1"></i>${roleBadge}</span>
                                <span><i class="fas fa-phone mr-1"></i>${admin.mobile_number}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <i id="${uniqueId}-icon" class="fas fa-chevron-down text-gray-400 transition-transform"></i>
                        </div>
                    </div>
                    
                    <!-- Expandable Details -->
                    <div id="${uniqueId}-details" class="hidden mt-4 pt-4 border-t border-gray-700 space-y-3">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Username:</span>
                                <span class="text-white font-mono ml-2">${escapeHtml(admin.username)}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Role:</span>
                                <span class="text-white ml-2">${roleText}</span>
                            </div>
                            ${admin.club_name ? `
                                <div>
                                    <span class="text-gray-500">Club:</span>
                                    <span class="text-white ml-2">${escapeHtml(admin.club_name)}</span>
                                </div>
                            ` : ''}
                            ${admin.club_number ? `
                                <div>
                                    <span class="text-gray-500">Club #:</span>
                                    <span class="text-white ml-2">${escapeHtml(admin.club_number)}</span>
                                </div>
                            ` : ''}
                            ${!admin.is_active && admin.deactivation_reason ? `
                                <div class="col-span-2">
                                    <span class="text-gray-500">Deactivation Reason:</span>
                                    <span class="text-red-400 ml-2">${admin.deactivation_reason.replace('_', ' ')}</span>
                                    ${admin.deactivated_at ? ` <span class="text-gray-500 text-xs">(${new Date(admin.deactivated_at).toLocaleDateString()})</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        
                        ${isOverseer && adminAssignments.length > 0 ? `
                            <div>
                                <span class="text-gray-500 text-sm">Assigned Gates:</span>
                                <div class="flex flex-wrap gap-1 mt-1">
                                    ${adminAssignments.map(a => `
                                        <span class="px-2 py-1 bg-yellow-900/30 border border-yellow-600/50 rounded text-xs">
                                            ${a.is_lead_overseer ? '⭐ ' : ''}${a.entry_gates.gate_name}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Action Buttons -->
                        <div class="flex flex-wrap gap-2 pt-3">
                            ${admin.is_active ? `
                                ${!isOverseer ? `
                                    <button onclick="event.stopPropagation(); toggleOverseerStatus('${admin.id}', true)" 
                                            class="vamosfesta-button text-xs">
                                        <i class="fas fa-door-open mr-1"></i>Make Gate Overseer
                                    </button>
                                ` : `
                                    <button onclick="event.stopPropagation(); showAssignGatesModal('${admin.id}')" 
                                            class="vamosfesta-button success text-xs">
                                        <i class="fas fa-tasks mr-1"></i>Assign Gates
                                    </button>
                                    <button onclick="event.stopPropagation(); toggleOverseerStatus('${admin.id}', false)" 
                                            class="vamosfesta-button danger text-xs">
                                        <i class="fas fa-times mr-1"></i>Remove Gate Role
                                    </button>
                                `}
                                ${!isSiptokenOverseer ? `
                                    <button onclick="event.stopPropagation(); toggleSiptokenOverseerStatus('${admin.id}', true)" 
                                            class="vamosfesta-button text-xs" style="background: #3b82f6; border-color: #3b82f6;">
                                        <i class="fas fa-coins mr-1"></i>Make SipToken Overseer
                                    </button>
                                ` : `
                                    <button onclick="event.stopPropagation(); toggleSiptokenOverseerStatus('${admin.id}', false)" 
                                            class="vamosfesta-button danger text-xs">
                                        <i class="fas fa-times mr-1"></i>Remove SipToken Role
                                    </button>
                                `}
                                <button onclick="event.stopPropagation(); deactivateUser('${admin.id}', '${escapeHtml(admin.username)}', '${escapeHtml(admin.full_name)}')" 
                                        class="vamosfesta-button danger text-xs ml-auto">
                                    <i class="fas fa-user-slash mr-1"></i>Deactivate
                                </button>
                            ` : `
                                <button onclick="event.stopPropagation(); reactivateUser('${admin.id}', '${escapeHtml(admin.username)}', '${escapeHtml(admin.full_name)}')" 
                                        class="vamosfesta-button success text-xs">
                                    <i class="fas fa-user-check mr-1"></i>Reactivate User
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Load gate overseer assignments view
        await loadGateOverseerAssignments();
        
    } catch (error) {
        console.error('Error loading admins:', error);
        showToast('Failed to load admins', 'error');
    }
}

// Toggle admin details expand/collapse
window.toggleAdminDetails = function(uniqueId) {
    const details = document.getElementById(`${uniqueId}-details`);
    const icon = document.getElementById(`${uniqueId}-icon`);
    
    if (details.classList.contains('hidden')) {
        // Expand
        details.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    } else {
        // Collapse
        details.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
};

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
    
    // Reset username display
    document.getElementById('adminUsernamePrefix').textContent = '---';
    document.getElementById('adminUsernameValue').textContent = '---';
    document.getElementById('adminUsername').value = '';
    
    // Hide role preview card
    document.getElementById('adminRolePreviewCard').classList.add('hidden');
    
    // Reset checkboxes
    const siptokenSalesCheckbox = document.getElementById('adminIsSiptokenSales');
    const barmanCheckbox = document.getElementById('adminIsBarman');
    if (siptokenSalesCheckbox) siptokenSalesCheckbox.checked = false;
    if (barmanCheckbox) barmanCheckbox.checked = false;
    
    openModal('adminModal');
};

document.getElementById('adminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const roleType = document.getElementById('adminTypeSelect').value;
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const fullName = document.getElementById('adminFullName').value.trim();
    const mobile = document.getElementById('adminMobile').value.trim();
    
    // Validate required fields
    if (!roleType) {
        showToast('Please select admin type', 'error');
        return;
    }
    
    if (!username) {
        showToast('Please enter first name to generate username', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    // Prepare admin data
    const adminData = {
        username: username,
        password: password,
        full_name: fullName,
        mobile_number: mobile,
        role: 'admin', // Base role is always admin
        created_by: currentUser.id,
        is_gate_overseer: false,
        is_siptoken_overseer: false,
        is_siptoken_sales: false,
        is_barman: false
    };
    
    // Set overseer flags based on role type
    if (roleType === 'gate_overseer') {
        adminData.is_gate_overseer = true;
    } else if (roleType === 'siptoken_overseer') {
        adminData.is_siptoken_overseer = true;
    }
    
    // Add SipToken operational roles (available to all admin types)
    if (document.getElementById('adminIsSiptokenSales')?.checked) {
        adminData.is_siptoken_sales = true;
    }
    if (document.getElementById('adminIsBarman')?.checked) {
        adminData.is_barman = true;
    }
    
    try {
        // Check if username already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existingUser) {
            showToast('Username already exists. Please use a different first name.', 'error');
            return;
        }
        
        const { error } = await supabase
            .from('users')
            .insert(adminData);
        
        if (error) throw error;
        
        showToast(`Admin created successfully! Username: ${username}`, 'success');
        closeModal('adminModal');
        
        // Reset form
        document.getElementById('adminForm').reset();
        document.getElementById('adminRolePreviewCard').classList.add('hidden');
        document.getElementById('adminUsernamePrefix').textContent = '---';
        document.getElementById('adminUsernameValue').textContent = '---';
        
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

// ============================================
// USER DEACTIVATION / REACTIVATION SYSTEM
// ============================================

window.deactivateUser = async function(userId, username, fullName) {
    // Show confirmation modal with reason selection
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content max-w-md">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-red-400">
                    <i class="fas fa-exclamation-triangle mr-2"></i>Deactivate User
                </h3>
                <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="card bg-red-900/20 border-red-600/30 mb-4">
                <p class="text-sm">
                    <strong class="text-white">${escapeHtml(fullName)}</strong><br>
                    <span class="text-gray-400">Username: ${escapeHtml(username)}</span>
                </p>
            </div>
            <p class="text-sm text-gray-300 mb-4">This user will:</p>
            <ul class="text-sm text-gray-400 mb-4 space-y-1 list-disc list-inside">
                <li>No longer be able to login</li>
                <li>Be removed from active rosters</li>
                <li>Retain all historical data for reports</li>
            </ul>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm mb-2 font-semibold">Reason for Deactivation *</label>
                    <select id="deactivationReason" class="vamosfesta-input" required>
                        <option value="">-- Select Reason --</option>
                        <option value="resigned">Resigned</option>
                        <option value="terminated">Terminated</option>
                        <option value="contract_ended">Contract Ended</option>
                        <option value="performance_issues">Performance Issues</option>
                        <option value="no_show">No Show / Abandoned</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm mb-2">Additional Notes (Optional)</label>
                    <textarea id="deactivationNotes" class="vamosfesta-input" rows="3" 
                              placeholder="Enter any additional details..."></textarea>
                </div>
            </div>
            <div class="mt-6 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded text-xs">
                <i class="fas fa-info-circle text-yellow-400 mr-1"></i>
                This action can be reversed by Super Admin
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="confirmDeactivation('${userId}')" class="vamosfesta-button danger flex-1">
                    <i class="fas fa-user-slash mr-2"></i>Deactivate User
                </button>
                <button onclick="this.closest('.modal').remove()" class="vamosfesta-button secondary flex-1">
                    Cancel
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.confirmDeactivation = async function(userId) {
    const reason = document.getElementById('deactivationReason').value;
    const notes = document.getElementById('deactivationNotes').value.trim();
    
    if (!reason) {
        showToast('Please select a reason for deactivation', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                is_active: false,
                deactivated_at: new Date().toISOString(),
                deactivated_by: currentUser.id,
                deactivation_reason: reason,
                deactivation_notes: notes || null
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        showToast('User deactivated successfully', 'success');
        
        // Close modal
        document.querySelector('.modal').remove();
        
        // Reload appropriate list
        if (typeof loadAdmins === 'function') await loadAdmins();
        if (typeof loadStaffRoster === 'function') await loadStaffRoster();
        
    } catch (error) {
        console.error('Error deactivating user:', error);
        showToast('Failed to deactivate user: ' + error.message, 'error');
    }
};

window.reactivateUser = async function(userId, username, fullName) {
    if (!confirm(`Reactivate ${fullName} (${username})?\n\nThey will be able to login again immediately.`)) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                is_active: true,
                deactivated_at: null,
                deactivated_by: null,
                deactivation_reason: null,
                deactivation_notes: null
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        showToast('User reactivated successfully', 'success');
        
        // Reload appropriate list
        if (typeof loadAdmins === 'function') await loadAdmins();
        if (typeof loadStaffRoster === 'function') await loadStaffRoster();
        
    } catch (error) {
        console.error('Error reactivating user:', error);
        showToast('Failed to reactivate user: ' + error.message, 'error');
    }
};

// Check if current user has permission to deactivate a target user
window.canDeactivateUser = function(targetUser) {
    if (currentUser.role === 'super_admin') {
        return true; // Super admin can deactivate anyone
    }
    
    if (currentUser.is_gate_overseer) {
        // Gate overseers can deactivate entry marshalls only
        return targetUser.role === 'entry_marshall';
    }
    
    if (currentUser.is_siptoken_overseer) {
        // SipToken overseers can deactivate token sales staff and barmen
        return targetUser.is_siptoken_sales || targetUser.is_barman;
    }
    
    return false; // Others cannot deactivate
};

// ============================================
// INVENTORY ACCESS CONTROL SYSTEM
// ============================================

window.hasInventoryAccess = function(accessLevel) {
    if (!currentUser) return false;
    
    switch (accessLevel) {
        case 'full':
            // Full control: Super Admin only
            return currentUser.role === 'super_admin';
            
        case 'operational':
            // Operational control: Super Admin + SipToken Overseer
            return currentUser.role === 'super_admin' || currentUser.is_siptoken_overseer;
            
        case 'view':
            // View access: Super Admin, SipToken Overseer, Barmen
            return currentUser.role === 'super_admin' || 
                   currentUser.is_siptoken_overseer || 
                   currentUser.is_barman;
            
        case 'none':
        default:
            return false;
    }
};

window.checkInventoryPermission = function(action) {
    const permissions = {
        'setup_beverages': 'full',           // Create/edit beverage master
        'set_opening_stock': 'operational',  // Enter opening stock
        'view_live_dashboard': 'operational',// Monitor during event
        'enter_closing_stock': 'operational',// Enter closing count
        'reconcile': 'operational',          // Perform reconciliation
        'approve_reconciliation': 'full',    // Final approval
        'view_reports': 'operational',       // View inventory reports
        'view_own_stats': 'view'            // Barmen view their consumption
    };
    
    const requiredLevel = permissions[action];
    if (!requiredLevel) return false;
    
    return hasInventoryAccess(requiredLevel);
};

window.showInventoryAccessDenied = function() {
    showToast('Access Denied: You do not have permission to access inventory features', 'error');
};

// Initialize inventory menu visibility based on user role
window.updateInventoryMenuVisibility = function() {
    const inventoryMenu = document.getElementById('inventoryMenuItem');
    if (!inventoryMenu) return;
    
    if (hasInventoryAccess('view')) {
        inventoryMenu.style.display = 'block';
    } else {
        inventoryMenu.style.display = 'none';
    }
};

// ============================================
// END DEACTIVATION & INVENTORY CONTROL
// ============================================

window.showAssignGatesModal = async function(overseerId) {
    try {
        // Load all gates
        const { data: gates, error } = await supabase
            .from('entry_gates')
            .select('*')
            .eq('is_active', true)
            .order('gate_name');
        
        if (error) throw error;
        
        if (!gates || gates.length === 0) {
            showToast('No active gates found. Please create gates first in Gate Management.', 'error');
            return;
        }
        
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

async function loadMarshalls() {
    try {
        // Get filter selection
        const filter = document.getElementById('marshallStatusFilter')?.value || 'active';
        
        let query = supabase
            .from('users')
            .select('*')
            .eq('role', 'entry_marshall')
            .order('full_name', { ascending: true });
        
        // Apply filter
        if (filter === 'active') {
            query = query.eq('is_active', true);
        } else if (filter === 'inactive') {
            query = query.eq('is_active', false);
        }
        
        const { data: marshalls, error: marshallsError } = await query;
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
        
        const container = document.getElementById('marshallsListContainer');
        if (!container) return;
        
        if (!marshalls || marshalls.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">No entry marshalls found.</div>';
            return;
        }
        
        // Create clean card list - clickable to expand
        container.innerHTML = marshalls.map(marshall => {
            const assignment = roster?.find(r => r.marshall_id === marshall.id);
            const isOnDuty = onDutyMarshalls.has(marshall.id);
            
            const dutyBadge = isOnDuty 
                ? '<span class="status-badge" style="background: #10b981;"><i class="fas fa-broadcast-tower mr-1"></i>ON DUTY</span>'
                : '';
            
            const statusBadge = !marshall.is_active 
                ? '<span class="status-badge" style="background: #ef4444;"><i class="fas fa-ban mr-1"></i>DEACTIVATED</span>'
                : '';
            
            const uniqueId = `marshall-${marshall.id}`;
            
            return `
                <div class="card hover:border-orange-500 transition-all cursor-pointer ${!marshall.is_active ? 'opacity-60' : ''}" 
                     onclick="toggleMarshallDetails('${uniqueId}')">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold text-lg">${escapeHtml(marshall.full_name)}</h4>
                                ${dutyBadge}
                                ${statusBadge}
                            </div>
                            <div class="flex items-center gap-4 text-sm text-gray-400">
                                <span><i class="fas fa-user-shield mr-1"></i><span class="role-badge role-entry_marshall">Entry Marshall</span></span>
                                <span><i class="fas fa-phone mr-1"></i>${marshall.mobile_number || '-'}</span>
                                ${assignment ? `<span><i class="fas fa-door-open mr-1"></i>${escapeHtml(assignment.entry_gates.gate_name)}</span>` : ''}
                            </div>
                        </div>
                        <i id="${uniqueId}-icon" class="fas fa-chevron-down text-gray-400 transition-transform"></i>
                    </div>
                    
                    <!-- Expandable Details -->
                    <div id="${uniqueId}-details" class="hidden mt-4 pt-4 border-t border-gray-700 space-y-3">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Username:</span>
                                <span class="text-white font-mono ml-2">${escapeHtml(marshall.username)}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Status:</span>
                                <span class="ml-2">${isOnDuty ? '<span class="text-green-400">On Duty</span>' : '<span class="text-gray-400">Off Duty</span>'}</span>
                            </div>
                            ${assignment ? `
                                <div>
                                    <span class="text-gray-500">Assigned Gate:</span>
                                    <span class="text-orange-400 ml-2">${escapeHtml(assignment.entry_gates.gate_name)}</span>
                                </div>
                                <div>
                                    <span class="text-gray-500">Gate Code:</span>
                                    <span class="text-white ml-2">${assignment.entry_gates.gate_code}</span>
                                </div>
                            ` : '<div class="col-span-2 text-gray-500">Not assigned to any gate</div>'}
                            ${!marshall.is_active && marshall.deactivation_reason ? `
                                <div class="col-span-2">
                                    <span class="text-gray-500">Deactivation Reason:</span>
                                    <span class="text-red-400 ml-2">${marshall.deactivation_reason.replace('_', ' ')}</span>
                                    ${marshall.deactivated_at ? ` <span class="text-gray-500 text-xs">(${new Date(marshall.deactivated_at).toLocaleDateString()})</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex flex-wrap gap-2 pt-3">
                            ${marshall.is_active ? `
                                ${!assignment ? `
                                    <button onclick="event.stopPropagation(); showAssignMarshallModal('${marshall.id}')" 
                                            class="vamosfesta-button text-xs">
                                        <i class="fas fa-plus mr-1"></i>Assign to Gate
                                    </button>
                                ` : `
                                    <button onclick="event.stopPropagation(); unassignMarshall('${marshall.id}')" 
                                            class="vamosfesta-button secondary text-xs">
                                        <i class="fas fa-times mr-1"></i>Unassign Gate
                                    </button>
                                `}
                                <button onclick="event.stopPropagation(); deactivateUser('${marshall.id}', '${escapeHtml(marshall.username)}', '${escapeHtml(marshall.full_name)}'))" 
                                        class="vamosfesta-button danger text-xs ml-auto">
                                    <i class="fas fa-user-slash mr-1"></i>Deactivate
                                </button>
                            ` : `
                                <button onclick="event.stopPropagation(); reactivateUser('${marshall.id}', '${escapeHtml(marshall.username)}', '${escapeHtml(marshall.full_name)}')}" 
                                        class="vamosfesta-button success text-xs">
                                    <i class="fas fa-user-check mr-1"></i>Reactivate
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading marshalls:', error);
        showToast('Failed to load marshalls', 'error');
    }
}

// Toggle marshall details expand/collapse
window.toggleMarshallDetails = function(uniqueId) {
    const details = document.getElementById(`${uniqueId}-details`);
    const icon = document.getElementById(`${uniqueId}-icon`);
    
    if (!details || !icon) return;
    
    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    } else {
        details.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
};

// Keep old function for backward compatibility
async function loadMarshallRoster() {
    await loadMarshalls();
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
            .select('*, users!user_id(full_name), entry_gates!gate_id(gate_name, gate_code)')
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
window.minTokenPurchase = 15; // Default minimum

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
    
    // Load minimum token purchase from settings
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'min_token_purchase')
            .single();
        
        if (data && data.setting_value) {
            window.minTokenPurchase = parseInt(data.setting_value) || 15;
        }
    } catch (e) {
        console.warn('Could not load min token purchase, using default:', e);
    }
    
    console.log(`✅ SipToken initialized - Rate: ₹${window.siptokenRate}, Min: ${window.minTokenPurchase} tokens`);
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
            .eq('mobile_number', phone)
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
    document.getElementById('purchaseGuestPhone').textContent = guest.mobile_number;
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

// QR Scanner functionality moved to line 7195 to avoid duplication

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
            .select('*, users!staff_id(full_name, username)')
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
            .select('*, users!staff_id(full_name)')
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
        const staffName = session.users?.full_name || session.users?.username || 'Unknown Staff';
        return `
            <div class="card bg-gray-800/50 mb-3">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-bold">${staffName}</h4>
                        <p class="text-sm text-gray-400">${session.counter_name || 'No Counter'}</p>
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
// SIPTOKEN STAFF CLOCK-IN MODAL
// =====================================================

window.showClockInModal = function(staffRole) {
    // Store the role for clock-in
    window.pendingClockInRole = staffRole;
    
    // Set modal title
    const modalTitle = staffRole === 'token_sales' ? 'Clock In Sales Staff' : 'Clock In Barman';
    document.getElementById('clockInModalTitle').textContent = modalTitle;
    
    // Reset form
    document.getElementById('clockInStaffSelect').innerHTML = '<option value="">Select staff member...</option>';
    document.getElementById('clockInCounterSelect').innerHTML = '<option value="">Select counter...</option>';
    document.getElementById('clockInOpeningCash').value = '';
    
    // Load staff members with this role
    loadClockInStaffList(staffRole);
    
    // Load counters
    loadClockInCounters();
    
    // Show modal
    openModal('clockInModal');
};

async function loadClockInStaffList(role) {
    try {
        const roleField = role === 'token_sales' ? 'is_siptoken_sales' : 'is_barman';
        const { data: users, error } = await supabase
            .from('users')
            .select('id, full_name, username')
            .eq(roleField, true)
            .eq('is_active', true)
            .order('full_name');
        
        if (error) throw error;
        
        // Get active duty sessions to check who's already clocked in
        const { data: activeSessions } = await supabase
            .from('siptoken_duty_sessions')
            .select('staff_id, bar_counters!counter_id(counter_name)')
            .is('clock_out_time', null)
            .eq('status', 'on_duty');
        
        // Create a map of clocked-in staff
        const clockedInMap = {};
        (activeSessions || []).forEach(session => {
            clockedInMap[session.staff_id] = session.bar_counters?.counter_name || 'Unknown Counter';
        });
        
        const select = document.getElementById('clockInStaffSelect');
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            
            if (clockedInMap[user.id]) {
                // Staff is already clocked in - disable and show status
                option.textContent = `${user.full_name} - 🟢 ON DUTY at ${clockedInMap[user.id]}`;
                option.disabled = true;
                option.style.color = '#22c55e';
            } else {
                option.textContent = `${user.full_name} (${user.username})`;
            }
            
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading staff:', error);
        showToast('Failed to load staff list', 'error');
    }
}

async function loadClockInCounters() {
    try {
        const { data: counters, error } = await supabase
            .from('bar_counters')
            .select('id, counter_name, counter_code')
            .eq('is_active', true)
            .order('counter_name');
        
        if (error) throw error;
        
        const select = document.getElementById('clockInCounterSelect');
        
        // Filter counters based on staff role
        const staffRole = window.pendingClockInRole;
        const filteredCounters = counters.filter(counter => {
            if (staffRole === 'token_sales') {
                // For token sales staff, show counters with "Token" or "Sales" in name
                return counter.counter_name.toLowerCase().includes('token') || 
                       counter.counter_name.toLowerCase().includes('sales');
            } else {
                // For barman, show beverage/bar counters (exclude token sales counters)
                return !(counter.counter_name.toLowerCase().includes('token') || 
                        counter.counter_name.toLowerCase().includes('sales'));
            }
        });
        
        if (filteredCounters.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = staffRole === 'token_sales' 
                ? 'No token sales counters available' 
                : 'No bar counters available';
            option.disabled = true;
            select.appendChild(option);
            return;
        }
        
        filteredCounters.forEach(counter => {
            const option = document.createElement('option');
            option.value = counter.id;
            option.textContent = `${counter.counter_name} (${counter.counter_code})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading counters:', error);
        showToast('Failed to load counters', 'error');
    }
}

// =====================================================
// COMPLETE REPLACEMENT FOR processClockIn FUNCTION
// This uses the RPC function approach (RECOMMENDED)
// Replace in main.js around line 6179
// =====================================================

window.processClockIn = async function() {
    const staffId = document.getElementById('clockInStaffSelect').value;
    const counterId = document.getElementById('clockInCounterSelect').value;
    const openingCash = document.getElementById('clockInOpeningCash').value;
    
    // Validation
    if (!staffId) {
        showToast('Please select a staff member', 'error');
        return;
    }
    
    if (!counterId) {
        showToast('Please select a counter', 'error');
        return;
    }
    
    const staffRole = window.pendingClockInRole;
    
    console.log('🔄 Attempting clock-in:', {
        staffId,
        counterId,
        staffRole,
        openingCash,
        currentUserId: currentUser?.id
    });
    
    try {
        // Use the RPC function instead of direct INSERT
        // This bypasses RLS and provides better error handling
        const { data, error } = await supabase
            .rpc('clock_in_siptoken_staff', {
                p_staff_id: staffId,
                p_overseer_id: currentUser.id,
                p_staff_role: staffRole,
                p_counter_id: counterId,
                p_opening_cash: openingCash ? parseFloat(openingCash) : 0
            });
        
        if (error) {
            console.error('❌ RPC error:', error);
            throw error;
        }
        
        console.log('📊 RPC response:', data);
        
        // Check if function returned an error
        if (data && data.success === false) {
            console.error('❌ Function returned error:', data.error);
            throw new Error(data.error || 'Failed to clock in staff');
        }
        
        // Success!
        console.log('✅ Clock-in successful:', data);
        
        const successMessage = data.message || 
            `✅ ${data.staff_name || 'Staff'} clocked in successfully!`;
        
        showToast(successMessage, 'success');
        
        // Close modal
        closeModal('clockInModal');
        
        // Reload data
        if (typeof loadOverseerDutySessions === 'function') {
            await loadOverseerDutySessions();
        }
        if (typeof loadOverseerDashboardStats === 'function') {
            await loadOverseerDashboardStats();
        }
        
        // Clear form
        document.getElementById('clockInStaffSelect').value = '';
        document.getElementById('clockInCounterSelect').value = '';
        document.getElementById('clockInOpeningCash').value = '';
        
    } catch (error) {
        console.error('❌ Error clocking in staff:', error);
        
        // Provide user-friendly error messages
        let errorMessage = 'Failed to clock in staff';
        
        if (error.message.includes('Only SipToken Overseers')) {
            errorMessage = 'Permission denied: Only SipToken Overseers can clock in staff';
        } else if (error.message.includes('already clocked in')) {
            errorMessage = '⚠️ This staff member is already clocked in. Please find them in "Active Duty Sessions" below and clock them out first, then try again.';
        } else if (error.message.includes('Invalid staff member')) {
            errorMessage = 'Invalid staff member or role mismatch';
        } else if (error.message.includes('Invalid counter')) {
            errorMessage = 'Invalid counter selected';
        } else if (error.message.includes('function clock_in_siptoken_staff')) {
            errorMessage = 'Database function not found. Please contact administrator.';
        } else if (error.message) {
            errorMessage += ': ' + error.message;
        }
        
        showToast(errorMessage, 'error');
    }
};

// =====================================================
// ALTERNATE VERSION: If you prefer to keep direct INSERT
// Use this ONLY if you fix RLS policies properly
// =====================================================

/*
window.processClockInWithDirectInsert = async function() {
    const staffId = document.getElementById('clockInStaffSelect').value;
    const counterId = document.getElementById('clockInCounterSelect').value;
    const openingCash = document.getElementById('clockInOpeningCash').value;
    
    if (!staffId) {
        showToast('Please select a staff member', 'error');
        return;
    }
    
    if (!counterId) {
        showToast('Please select a counter', 'error');
        return;
    }
    
    const staffRole = window.pendingClockInRole;
    
    try {
        // Check if already clocked in
        const { data: existing } = await supabase
            .from('siptoken_duty_sessions')
            .select('id, counter_name')
            .eq('staff_id', staffId)
            .eq('status', 'on_duty')
            .maybeSingle();
        
        if (existing) {
            showToast(`Staff is already clocked in at ${existing.counter_name}`, 'warning');
            return;
        }
        
        // Get staff name for success message
        const { data: staff } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', staffId)
            .single();
        
        // Direct INSERT (requires proper RLS policies)
        const { data, error } = await supabase
            .from('siptoken_duty_sessions')
            .insert([{
                staff_id: staffId,
                overseer_id: currentUser.id,
                staff_role: staffRole,
                counter_id: counterId,
                opening_cash: openingCash ? parseFloat(openingCash) : null,
                status: 'on_duty'
            }])
            .select()
            .single();
        
        if (error) {
            if (error.code === '42501') {
                throw new Error('Permission denied. RLS policy preventing insert.');
            }
            throw error;
        }
        
        showToast(`✅ ${staff?.full_name || 'Staff'} clocked in successfully!`, 'success');
        closeModal('clockInModal');
        loadOverseerDutySessions();
        loadOverseerDashboardStats();
        
    } catch (error) {
        console.error('Error clocking in staff:', error);
        showToast('Failed to clock in staff: ' + error.message, 'error');
    }
};
*/

// =====================================================
// SIPTOKEN MENU MANAGEMENT (Super Admin Settings)
// =====================================================

let menuItemsCache = [];
let currentMenuFilter = 'all';

// Load token rate
async function loadTokenRate() {
    try {
        // Load token rate
        const { data: rateData, error: rateError } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        if (rateData) {
            document.getElementById('settingTokenRate').value = rateData.setting_value;
        }
        
        // Load minimum token purchase
        const { data: minTokenData, error: minTokenError } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'min_token_purchase')
            .single();
        
        if (minTokenData) {
            document.getElementById('settingMinTokens').value = minTokenData.setting_value;
        }
    } catch (error) {
        console.error('Error loading token settings:', error);
    }
}

// Save token rate
window.saveTokenRate = async function() {
    // Authorization: Only Super Admin can modify token rate from Settings
    if (!currentUser || currentUser.role !== 'super_admin') {
        showToast('Unauthorized: Only Super Admin can modify token rate', 'error');
        return;
    }
    
    const rate = parseInt(document.getElementById('settingTokenRate').value);
    const minTokens = parseInt(document.getElementById('settingMinTokens').value);
    
    if (!rate || rate < 1) {
        showToast('Please enter a valid token rate', 'error');
        return;
    }
    
    if (!minTokens || minTokens < 1) {
        showToast('Please enter a valid minimum token purchase', 'error');
        return;
    }
    
    try {
        // Update token_rate in settings table
        const { error: settingsError } = await supabase
            .from('settings')
            .upsert({ 
                setting_key: 'token_rate', 
                setting_value: rate.toString(),
                description: 'Price per token in INR',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });
        
        if (settingsError) throw settingsError;
        
        // Update min_token_purchase in settings table
        const { error: minTokensError } = await supabase
            .from('settings')
            .upsert({ 
                setting_key: 'min_token_purchase', 
                setting_value: minTokens.toString(),
                description: 'Minimum tokens that can be purchased at once',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });
        
        if (minTokensError) throw minTokensError;
        
        // Update siptoken_settings table (get first row dynamically)
        const { data: siptokenData } = await supabase
            .from('siptoken_settings')
            .select('id')
            .limit(1)
            .single();
        
        if (siptokenData) {
            const { error: siptokenError } = await supabase
                .from('siptoken_settings')
                .update({ 
                    token_rate: rate.toString(),
                    min_token_purchase: minTokens,
                    updated_at: new Date().toISOString()
                })
                .eq('id', siptokenData.id);
            
            if (siptokenError) console.warn('SipToken settings update failed:', siptokenError);
        }
        
        // Update global variables
        window.siptokenRate = rate;
        window.minTokenPurchase = minTokens;
        
        showToast(`Configuration saved: ₹${rate}/token, Min: ${minTokens} tokens`, 'success');
    } catch (error) {
        console.error('Error saving token configuration:', error);
        showToast('Failed to save configuration', 'error');
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
                    ${item.description ? `<span class="text-xs text-gray-400">(${escapeHtml(item.description)})</span>` : ''}
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
    document.getElementById('menuItemMeasure').value = item.description || '';
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
        description: document.getElementById('menuItemMeasure').value.trim() || null,
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
            console.log('🔵 EDIT MODE - Updating menu item');
            console.log('Item ID:', itemId);
            console.log('Item Data:', itemData);
            
            const { data, error, count } = await supabase
                .from('beverage_menu')
                .update(itemData)
                .eq('id', itemId)
                .select();
            
            console.log('Update response - data:', data, 'error:', error, 'count:', count);
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                console.warn('⚠️ Update succeeded but no rows returned. Checking if row exists...');
                const { data: checkData } = await supabase
                    .from('beverage_menu')
                    .select('*')
                    .eq('id', itemId);
                console.log('Row check:', checkData);
            }
            
            showToast('Menu item updated!', 'success');
        } else {
            const { error } = await supabase
                .from('beverage_menu')
                .insert([itemData]);
            
            if (error) throw error;
            showToast('Menu item added!', 'success');
        }
        
        closeModal('menuItemModal');
        // Reload the appropriate menu view based on user role
        if (currentUser.is_siptoken_overseer && currentUser.role !== 'super_admin') {
            await loadOverseerMenu();
        } else {
            await loadMenuItems();
        }
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
        is_barman: role === 'barman'
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
        // entry_marshall is stored in role field, not as a flag
        else if (role === 'entry_marshall') role = 'entry_marshall';
        
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
        // Load token rate
        const { data: rateData } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        if (rateData) {
            currentTokenRate = parseInt(rateData.setting_value) || 10;
            const rateEl = document.getElementById('invoiceTokenRate');
            if (rateEl) rateEl.textContent = currentTokenRate;
        }
        
        // Load minimum token purchase
        const { data: minTokenData } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'min_token_purchase')
            .single();
        
        if (minTokenData) {
            window.minTokenPurchase = parseInt(minTokenData.setting_value) || 15;;
            const minTokenEl = document.getElementById('minTokenDisplay');
            if (minTokenEl) minTokenEl.textContent = window.minTokenPurchase;
            
            // Update input min attribute
            const inputEl = document.getElementById('invoiceTokenQty');
            if (inputEl) {
                inputEl.setAttribute('min', window.minTokenPurchase);
                // Ensure current value is not below minimum
                if (parseInt(inputEl.value) < window.minTokenPurchase) {
                    inputEl.value = window.minTokenPurchase;
                }
            }
        }
        
        calculateInvoiceTotal();
    } catch (error) {
        console.log('Using default settings - Token rate:', currentTokenRate, 'Min tokens:', window.minTokenPurchase || 15);
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
            .eq('mobile_number', phone)
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

// Global scanner instance
let guestQRScanner = null;

// Start QR scanner for guest pass
window.startGuestQRScanner = function() {
    openModal('guestQRScannerModal');
    
    // Initialize scanner if html5-qrcode is available
    if (typeof Html5Qrcode !== 'undefined') {
        guestQRScanner = new Html5Qrcode('guestScannerPreview');
        
        guestQRScanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                await stopGuestQRScanner();
                
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

// Stop QR scanner for guest pass
window.stopGuestQRScanner = async function() {
    if (guestQRScanner) {
        try {
            await guestQRScanner.stop();
            guestQRScanner.clear();
            guestQRScanner = null;
        } catch (err) {
            console.error('Error stopping scanner:', err);
        }
    }
    closeModal('guestQRScannerModal');
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
    const balance = wallet?.token_balance || 0;
    
    // Update UI
    document.getElementById('invoiceGuestName').textContent = guest.guest_name || guest.name || 'Guest';
    document.getElementById('invoiceGuestPhone').textContent = guest.mobile_number || guest.phone || '-';
    document.getElementById('invoiceGuestBalance').innerHTML = `${balance} <span class="text-sm">tokens</span>`;
    
    // Show step 2, keep step 1 visible but collapsed
    document.getElementById('tokenSalesStep1').classList.add('opacity-50');
    document.getElementById('tokenSalesStep2').classList.remove('hidden');
    
    // Reset token quantity to minimum or 10, whichever is higher
    const minTokens = window.minTokenPurchase || 15;
    document.getElementById('invoiceTokenQty').value = Math.max(10, minTokens);
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
    let qty = parseInt(input.value) || window.minTokenPurchase || 15;
    qty = Math.max(window.minTokenPurchase || 15, Math.min(500, qty + delta));
    input.value = qty;
    calculateInvoiceTotal();
};

// Set specific token quantity
window.setTokenQty = function(qty) {
    const minTokens = window.minTokenPurchase || 15;
    if (qty < minTokens) {
        showToast(`Minimum purchase: ${minTokens} tokens`, 'warning');
        qty = minTokens;
    }
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
    const minTokens = window.minTokenPurchase || 15;
    
    if (tokenQty < 1) {
        showToast('Please enter token quantity', 'error');
        return;
    }
    
    if (tokenQty < minTokens) {
        showToast(`Minimum purchase requirement: ${minTokens} tokens (Current: ${tokenQty})`, 'error');
        document.getElementById('invoiceTokenQty').value = minTokens;
        calculateInvoiceTotal();
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
            .from('token_purchases')
            .select('*, token_wallets(guest_name, guest_phone)')
            .eq('seller_id', currentUser.id)
            .eq('transaction_status', 'pending')
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
            .select('*, guests(id, guest_name, mobile_number)')
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
        const newBalance = (wallet.token_balance || 0) + invoice.tokens_requested;
        
        const { error: creditError } = await supabase
            .from('token_wallets')
            .update({ 
                token_balance: newBalance
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
        const guestPhone = invoice.guests?.mobile_number;
        const guestName = invoice.guests?.guest_name;
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
            .select('*, guests(guest_name, mobile_number)')
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

// Notification system
let lastOrderCount = 0;
let notificationPermission = 'default';

// Initialize notification system and request permission
async function initBarmanNotificationSystem() {
    // Request notification permission on first load
    if ('Notification' in window && Notification.permission === 'default') {
        try {
            notificationPermission = await Notification.requestPermission();
            if (notificationPermission === 'granted') {
                showToast('✅ Browser notifications enabled!', 'success');
            } else {
                showToast('ℹ️ Enable notifications for order alerts', 'info');
            }
        } catch (error) {
            console.warn('Notification permission error:', error);
        }
    } else if ('Notification' in window) {
        notificationPermission = Notification.permission;
    }
}

// Trigger multi-modal alert for new orders
function triggerBarmanAlert() {
    // 1. Browser notification (works even when tab is not focused)
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('🔔 New Order Received!', {
            body: 'A new beverage order is waiting for you',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-96.png',
            tag: 'new-order',
            requireInteraction: true, // Stays until dismissed
            silent: false, // Uses device notification sound
            vibrate: [200, 100, 200, 100, 200]
        });
        
        // Auto-close after 10 seconds
        setTimeout(() => notification.close(), 10000);
        
        // Focus window when notification clicked
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
    
    // 2. Vibrate device (mobile only)
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200, 100, 200]);
    }
    
    // 3. Visual flash alert (works even if phone is silent)
    flashOrderAlert();
    
    // 4. In-app toast notification
    showToast('🔔 New order received!', 'info');
}

// Flash visual alert with persistent indicator
function flashOrderAlert() {
    const banner = document.getElementById('barmanCounterBanner');
    const alertIndicator = document.getElementById('alertIndicator');
    if (!banner) return;
    
    // Show persistent flashing bell indicator
    if (alertIndicator) {
        alertIndicator.classList.remove('hidden');
    }
    
    let flashCount = 0;
    const flashInterval = setInterval(() => {
        if (flashCount >= 10) { // Increased from 6 to 10 flashes
            clearInterval(flashInterval);
            banner.style.backgroundColor = '';
            banner.style.borderColor = '';
            return;
        }
        
        // More intense flash colors
        if (flashCount % 2 === 0) {
            banner.style.backgroundColor = '#ff6b35'; // Bright orange
            banner.style.borderColor = '#ff6b35';
        } else {
            banner.style.backgroundColor = '';
            banner.style.borderColor = '';
        }
        flashCount++;
    }, 250); // Faster flash (250ms instead of 300ms)
}

// Hide alert indicator when all pending orders are handled
function hideAlertIndicator() {
    const alertIndicator = document.getElementById('alertIndicator');
    if (alertIndicator) {
        alertIndicator.classList.add('hidden');
    }
}

// Initialize barman dashboard
async function initBarmanDashboard() {
    initBarmanNotificationSystem();
    await loadBarmanCounterAssignment();
    await loadBarmanOrders();
    await loadBarmanStats();
    setupBarmanRealtime();
}

// Load barman's counter assignment
async function loadBarmanCounterAssignment() {
    if (!currentUser) return;
    
    try {
        // Get active duty session for this barman
        const { data: session, error } = await supabase
            .from('siptoken_duty_sessions')
            .select('*, bar_counters!counter_id(*)')
            .eq('staff_id', currentUser.id)
            .eq('staff_role', 'barman')
            .is('clock_out_time', null)
            .eq('status', 'on_duty')
            .order('clock_in_time', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            console.error('Error loading assignment:', error);
        }
        
        // Transform session data to match expected assignment structure
        barmanCounterAssignment = session ? {
            ...session,
            bar_counters: session.bar_counters || {
                id: session.counter_id,
                counter_name: session.counter_name || 'Unknown',
                counter_code: 'N/A'
            }
        } : null;
        
        // Update UI
        const counterName = document.getElementById('barmanCounterName');
        const counterCode = document.getElementById('barmanCounterCode');
        const userName = document.getElementById('barmanUserName');
        const banner = document.getElementById('barmanCounterBanner');
        
        // Always show user name
        if (userName && currentUser) {
            userName.textContent = currentUser.full_name || currentUser.username || 'Barman';
        }
        
        if (barmanCounterAssignment && barmanCounterAssignment.bar_counters) {
            counterName.textContent = barmanCounterAssignment.bar_counters.counter_name;
            counterCode.textContent = barmanCounterAssignment.bar_counters.counter_code || 'N/A';
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
                token_wallets!wallet_id(guest_id, guest_name, guest_phone),
                token_order_items(*, beverage_menu!menu_item_id(name, emoji))
            `)
            .eq('counter_id', counterId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });
        
        // Load accepted orders (being prepared)
        const { data: acceptedOrders } = await supabase
            .from('token_orders')
            .select(`
                *,
                token_wallets!wallet_id(guest_id, guest_name, guest_phone),
                token_order_items(*, beverage_menu!menu_item_id(name, emoji))
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
                token_wallets!wallet_id(guest_id, guest_name, guest_phone),
                token_order_items(*, beverage_menu!menu_item_id(name, emoji))
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
        
        // Check for new orders and trigger alert
        const currentOrderCount = (pendingOrders || []).length;
        if (lastOrderCount > 0 && currentOrderCount > lastOrderCount) {
            // New order arrived!
            triggerBarmanAlert();
        }
        lastOrderCount = currentOrderCount;
        
        // Hide alert indicator if no pending orders
        if (currentOrderCount === 0) {
            hideAlertIndicator();
        }
        
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
            .select('*, token_wallets(guest_name, guest_phone), bar_counters(counter_name)')
            .eq('id', orderId)
            .single();
        
        if (order) {
            // Send automated WhatsApp notification to guest
            const guestPhone = order.token_wallets?.guest_phone;
            const guestName = order.token_wallets?.guest_name;
            const counterName = order.bar_counters?.counter_name || 'Counter';
            
            if (guestPhone && guestName) {
                try {
                    const { sendOrderAcceptedMessage } = await import('./whatsapp-service.js');
                    await sendOrderAcceptedMessage(
                        guestPhone,
                        guestName,
                        order.order_number,
                        counterName,
                        currentUser.full_name
                    );
                } catch (whatsappError) {
                    console.warn('WhatsApp notification failed:', whatsappError);
                }
            }
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
            .select('*, token_wallets(id, token_balance, guest_name, guest_phone)')
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
            const newBalance = Math.max(0, (wallet.token_balance || 0) - order.total_tokens);
            
            await supabase
                .from('token_wallets')
                .update({ token_balance: newBalance })
                .eq('id', wallet.id);
        }
        
        // Send automated WhatsApp notification to guest
        const guestPhone = order.token_wallets?.guest_phone;
        const guestName = order.token_wallets?.guest_name;
        const newBalance = Math.max(0, (wallet?.token_balance || 0) - order.total_tokens);
        
        if (guestPhone && guestName) {
            try {
                // Get order items for notification
                const { data: orderWithItems } = await supabase
                    .from('token_orders')
                    .select('*, token_order_items(*, beverage_menu(name))')
                    .eq('id', orderId)
                    .single();
                
                const itemsList = orderWithItems?.token_order_items
                    ?.map(item => `${item.quantity}x ${item.beverage_menu?.name}`)
                    .join(', ') || 'Items';
                
                const { sendOrderServedMessage } = await import('./whatsapp-service.js');
                await sendOrderServedMessage(
                    guestPhone,
                    guestName,
                    order.order_number,
                    itemsList,
                    order.total_tokens,
                    newBalance
                );
            } catch (whatsappError) {
                console.warn('WhatsApp notification failed:', whatsappError);
            }
        }
        
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
            .select('*, token_wallets(guest_name, guest_phone)')
            .eq('id', orderId)
            .single();
        
        // Send automated WhatsApp notification to guest
        const guestPhone = order.token_wallets?.guest_phone;
        const guestName = order.token_wallets?.guest_name;
        
        if (guestPhone && guestName) {
            try {
                const { sendOrderRejectedMessage } = await import('./whatsapp-service.js');
                await sendOrderRejectedMessage(
                    guestPhone,
                    guestName,
                    order.order_number,
                    reason
                );
            } catch (whatsappError) {
                console.warn('WhatsApp notification failed:', whatsappError);
            }
        }
        
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
            const guestPhone = order.token_wallets?.guest_phone;
            const guestName = order.token_wallets?.guest_name;
            
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
                token_wallets(guest_name, guest_phone),
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
    // Authorization: Only Super Admin or SipToken Overseer can modify token rate
    if (!currentUser || (currentUser.role !== 'super_admin' && !currentUser.is_siptoken_overseer)) {
        showToast('Unauthorized: Only SipToken Overseer can modify token rate', 'error');
        return;
    }
    
    const rateInput = document.getElementById('overseerTokenRate');
    const minTokensInput = document.getElementById('overseerMinTokens');
    const rate = rateInput?.value;
    const minTokens = minTokensInput?.value;
    
    if (!rate || rate < 1) {
        showToast('Please enter a valid token rate', 'error');
        return;
    }
    
    if (!minTokens || minTokens < 1) {
        showToast('Please enter a valid minimum token purchase', 'error');
        return;
    }
    
    try {
        // Update token_rate in settings table
        const { error: settingsError } = await supabase
            .from('settings')
            .upsert({ 
                setting_key: 'token_rate',
                setting_value: rate.toString(),
                description: 'Price per token in INR',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });
        
        if (settingsError) throw settingsError;
        
        // Update min_token_purchase in settings table
        const { error: minTokensError } = await supabase
            .from('settings')
            .upsert({ 
                setting_key: 'min_token_purchase',
                setting_value: minTokens.toString(),
                description: 'Minimum tokens that can be purchased at once',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });
        
        if (minTokensError) throw minTokensError;
        
        // Update siptoken_settings table (get first row dynamically)
        const { data: siptokenData } = await supabase
            .from('siptoken_settings')
            .select('id')
            .limit(1)
            .single();
        
        if (siptokenData) {
            const { error: siptokenError } = await supabase
                .from('siptoken_settings')
                .update({ 
                    token_rate: rate.toString(),
                    min_token_purchase: parseInt(minTokens),
                    updated_at: new Date().toISOString()
                })
                .eq('id', siptokenData.id);
            
            if (siptokenError) console.warn('SipToken settings update failed:', siptokenError);
        }
        
        // Update BOTH display elements
        const rateDisplay = document.getElementById('currentTokenRateDisplay');
        const minTokensDisplay = document.getElementById('currentMinTokensDisplay');
        
        if (rateDisplay) rateDisplay.textContent = rate;
        if (minTokensDisplay) minTokensDisplay.textContent = minTokens;
        
        // Update global variables
        window.siptokenRate = parseInt(rate);
        window.minTokenPurchase = parseInt(minTokens);
        
        showToast(`Configuration updated: ₹${rate}/token, Min: ${minTokens} tokens`, 'success');
        
    } catch (error) {
        console.error('Error saving token configuration:', error);
        showToast('Failed to save configuration', 'error');
    }
};

// Load Overseer Settings
async function loadOverseerSettings() {
    try {
        // Load token rate
        const { data: rateData } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'token_rate')
            .single();
        
        const rate = rateData?.setting_value || '10';
        
        // Load minimum token purchase
        const { data: minTokenData } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'min_token_purchase')
            .single();
        
        const minTokens = minTokenData?.setting_value || '5';
        
        // Update input fields
        const rateInput = document.getElementById('overseerTokenRate');
        const minTokensInput = document.getElementById('overseerMinTokens');
        
        // Update display elements
        const rateDisplay = document.getElementById('currentTokenRateDisplay');
        const minTokensDisplay = document.getElementById('currentMinTokensDisplay');
        
        if (rateInput) rateInput.value = rate;
        if (minTokensInput) minTokensInput.value = minTokens;
        if (rateDisplay) rateDisplay.textContent = rate;
        if (minTokensDisplay) minTokensDisplay.textContent = minTokens;
        
        // Load today's summary
        await loadOverseerTodaySummary();
        
    } catch (error) {
        console.log('Using default settings');
        // Set defaults
        const rateInput = document.getElementById('overseerTokenRate');
        const minTokensInput = document.getElementById('overseerMinTokens');
        const rateDisplay = document.getElementById('currentTokenRateDisplay');
        const minTokensDisplay = document.getElementById('currentMinTokensDisplay');
        
        if (rateInput) rateInput.value = '10';
        if (minTokensInput) minTokensInput.value = '5';
        if (rateDisplay) rateDisplay.textContent = '10';
        if (minTokensDisplay) minTokensDisplay.textContent = '5';
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
        
        // Populate cache so edit/delete functions work
        menuItemsCache = items || [];
        
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
        
        // Check for stale sessions (over 24 hours)
        const staleSessions = sessions.filter(s => {
            const startTime = new Date(s.clock_in_time);
            const hoursOnDuty = (new Date() - startTime) / (1000 * 60 * 60);
            return hoursOnDuty > 24;
        });
        
        if (staleSessions.length > 0) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'bg-yellow-900/30 border border-yellow-600 rounded-lg p-3 mb-3';
            warningDiv.innerHTML = `
                <div class="flex items-start gap-2">
                    <i class="fas fa-exclamation-triangle text-yellow-400 mt-1"></i>
                    <div class="flex-1">
                        <p class="text-yellow-200 font-semibold text-sm">⚠️ Stale Sessions Detected</p>
                        <p class="text-yellow-300 text-xs mt-1">${staleSessions.length} staff member(s) clocked in for over 24 hours</p>
                        <button onclick="clockOutAllStaleSessions()" class="mt-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded">
                            Clock Out All Stale Sessions
                        </button>
                    </div>
                </div>
            `;
            container.insertBefore(warningDiv, container.firstChild);
        }
        
    } catch (error) {
        console.error('Error loading duty sessions:', error);
        const container = document.getElementById('overseerDutySessions');
        if (container) container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No active sessions</p>';
    }
}

window.loadOverseerDutySessions = loadOverseerDutySessions;

// Clock out all stale sessions
window.clockOutAllStaleSessions = async function() {
    if (!confirm('Clock out all staff members who have been on duty for over 24 hours?')) return;
    
    try {
        // Get sessions over 24 hours old
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);
        
        const { data: staleSessions, error: fetchError } = await supabase
            .from('siptoken_duty_sessions')
            .select('id')
            .is('clock_out_time', null)
            .lt('clock_in_time', oneDayAgo.toISOString());
        
        if (fetchError) throw fetchError;
        
        if (!staleSessions || staleSessions.length === 0) {
            showToast('No stale sessions found', 'info');
            return;
        }
        
        // Clock out all stale sessions
        const { error: updateError } = await supabase
            .from('siptoken_duty_sessions')
            .update({ 
                clock_out_time: new Date().toISOString(),
                status: 'clocked_out'
            })
            .is('clock_out_time', null)
            .lt('clock_in_time', oneDayAgo.toISOString());
        
        if (updateError) throw updateError;
        
        showToast(`✅ Clocked out ${staleSessions.length} stale session(s)`, 'success');
        loadOverseerDutySessions();
        loadOverseerDashboardStats();
        
    } catch (error) {
        console.error('Error clocking out stale sessions:', error);
        showToast('Failed to clock out stale sessions', 'error');
    }
};
// End duty session
window.endDutySession = async function(sessionId) {
    try {
        // Get session details first
        const { data: session, error: fetchError } = await supabase
            .from('siptoken_duty_sessions')
            .select('*, users!staff_id(full_name), bar_counters!counter_id(counter_name)')
            .eq('id', sessionId)
            .single();
        
        if (fetchError) throw fetchError;
        
        const staffName = session.users?.full_name || 'Staff member';
        const counterName = session.bar_counters?.counter_name || session.counter_name || 'Unknown counter';
        
        if (!confirm(`Clock out ${staffName} from ${counterName}?`)) return;
        
        const { error } = await supabase
            .from('siptoken_duty_sessions')
            .update({ 
                clock_out_time: new Date().toISOString(),
                status: 'clocked_out'
            })
            .eq('id', sessionId);
        
        if (error) throw error;
        
        showToast(`✅ ${staffName} clocked out successfully`, 'success');
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