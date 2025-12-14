// =====================================================
// SIPTOKEN MODULE V2.0 - Complete Beverage Sales System
// Vamos Festa Event Management
// =====================================================

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { 
    sendTokenPurchaseMessage, 
    sendOrderServedMessage, 
    sendOrderRejectedMessage, 
    sendRefundMessage 
} from './whatsapp-service.js';

// Supabase Configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bruwwqxeevqnbhunrhia.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJydXd3cXhlZXZxbmJodW5yaGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MzIwMjksImV4cCI6MjA4MTEwODAyOX0.dhmkH6aUudxm3eUZblRe9Iah1RWEr5fz8PzcPNqh4tw';
const supabase = createClient(supabaseUrl, supabaseKey);

// Global State
let tokenSettings = { token_rate: 10, qr_expiry_seconds: 300 };
let currentTokenWallet = null;
let barmanScanner = null;
let currentScannedOrder = null;

// Export tokenSettings for use in main.js
export { tokenSettings };

// =====================================================
// INITIALIZATION
// =====================================================

export async function initializeSipToken() {
    // Load token settings
    const { data, error } = await supabase
        .from('siptoken_settings')
        .select('*')
        .single();
    
    if (data) {
        tokenSettings = data;
    }
    
    console.log('✅ SipToken V2 initialized');
}

// =====================================================
// TOKEN SALES (Sales Staff)
// =====================================================

// Search guest by phone for token purchase
window.searchGuestForTokens = async function() {
    const searchInput = document.getElementById('tokenGuestSearch');
    const phone = searchInput.value.trim();
    
    if (!phone || phone.length < 10) {
        showToast('Enter valid phone number', 'error');
        return;
    }
    
    try {
        // Find guest
        const { data: guest, error } = await supabase
            .from('guests')
            .select('*')
            .eq('phone', phone)
            .single();
        
        if (error || !guest) {
            showToast('Guest not found with this phone number', 'error');
            return;
        }
        
        // Find or create wallet
        let { data: wallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('guest_phone', phone)
            .single();
        
        if (!wallet) {
            const { data: newWallet } = await supabase
                .from('token_wallets')
                .insert({
                    guest_id: guest.id,
                    guest_name: guest.guest_name,
                    guest_phone: phone,
                    token_balance: 0
                })
                .select()
                .single();
            wallet = newWallet;
        }
        
        currentTokenWallet = wallet;
        
        // Show purchase modal
        document.getElementById('purchaseGuestName').textContent = guest.guest_name;
        document.getElementById('purchaseGuestPhone').textContent = phone;
        document.getElementById('purchaseCurrentBalance').textContent = wallet.token_balance;
        document.getElementById('purchaseTokenAmount').value = '';
        document.getElementById('purchaseTotalAmount').textContent = '₹0';
        
        openModal('tokenPurchaseModal');
        
    } catch (error) {
        console.error('Search error:', error);
        showToast('Error searching for guest', 'error');
    }
};

// Calculate purchase amount
window.calculatePurchaseAmount = function() {
    const tokens = parseInt(document.getElementById('purchaseTokenAmount').value) || 0;
    const amount = tokens * tokenSettings.token_rate;
    document.getElementById('purchaseTotalAmount').textContent = `₹${amount}`;
};

// Process token purchase
window.processTokenPurchase = async function() {
    const tokens = parseInt(document.getElementById('purchaseTokenAmount').value);
    const paymentMethod = document.getElementById('purchasePaymentMethod').value;
    
    if (!tokens || tokens < 1) {
        showToast('Enter valid token amount', 'error');
        return;
    }
    
    const amount = tokens * tokenSettings.token_rate;
    
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
        
        // Wait for trigger to update balance
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload wallet
        const { data: updatedWallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('id', currentTokenWallet.id)
            .single();
        
        // Send WhatsApp notification
        try {
            await sendTokenPurchaseMessage(
                currentTokenWallet.guest_phone,
                currentTokenWallet.guest_name,
                currentTokenWallet.guest_id,
                tokens,
                amount,
                updatedWallet.token_balance
            );
        } catch (whatsappError) {
            console.warn('WhatsApp notification failed:', whatsappError);
        }
        
        showToast(`✅ ${tokens} tokens purchased successfully!`, 'success');
        closeModal('tokenPurchaseModal');
        
        // Refresh stats
        if (window.loadSalesStaffStats) {
            await window.loadSalesStaffStats();
        }
        
    } catch (error) {
        console.error('Purchase error:', error);
        showToast('Failed to process purchase', 'error');
    }
};

// =====================================================
// BARMAN - QR SCANNER
// =====================================================

// Start barman scanner
window.startBarmanOrderScanner = async function() {
    const video = document.getElementById('barmanOrderVideo');
    const modal = document.getElementById('barmanOrderScannerModal');
    
    if (!modal || !video) {
        console.error('Scanner elements not found');
        return;
    }
    
    openModal('barmanOrderScannerModal');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        video.play();
        
        // Start scanning
        barmanScanner = setInterval(() => {
            scanBarmanQR(video);
        }, 500);
        
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Unable to access camera', 'error');
        closeModal('barmanOrderScannerModal');
    }
};

// Stop barman scanner
window.stopBarmanOrderScanner = function() {
    const video = document.getElementById('barmanOrderVideo');
    
    if (barmanScanner) {
        clearInterval(barmanScanner);
        barmanScanner = null;
    }
    
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    closeModal('barmanOrderScannerModal');
};

// Scan QR code
async function scanBarmanQR(video) {
    try {
        // Use jsQR or similar library
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Check if jsQR is available
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code && code.data) {
                await processScannedOrder(code.data);
            }
        }
    } catch (error) {
        // Silently ignore scan errors
    }
}

// Process scanned order QR
async function processScannedOrder(qrData) {
    try {
        const data = JSON.parse(qrData);
        
        if (data.type !== 'beverage_order') {
            showToast('Invalid QR code - not an order', 'error');
            return;
        }
        
        // Stop scanner
        stopBarmanOrderScanner();
        
        // Fetch order from database
        const { data: order, error } = await supabase
            .from('beverage_orders_v2')
            .select('*, order_items(*)')
            .eq('id', data.order_id)
            .single();
        
        if (error || !order) {
            showToast('Order not found', 'error');
            return;
        }
        
        // Check order status
        if (order.status !== 'pending') {
            showToast(`Order already ${order.status}`, 'error');
            return;
        }
        
        // Check if expired
        if (new Date(order.qr_expires_at) < new Date()) {
            showToast('QR code has expired', 'error');
            
            // Mark as expired
            await supabase
                .from('beverage_orders_v2')
                .update({ status: 'expired' })
                .eq('id', order.id);
            
            return;
        }
        
        // Show order confirmation
        currentScannedOrder = order;
        showScannedOrderModal(order);
        
    } catch (error) {
        console.error('QR processing error:', error);
        showToast('Invalid QR code format', 'error');
    }
}

// Show scanned order for barman confirmation
function showScannedOrderModal(order) {
    const modal = document.getElementById('barmanOrderConfirmModal');
    if (!modal) return;
    
    document.getElementById('scannedOrderNumber').textContent = `#${order.order_number}`;
    document.getElementById('scannedGuestName').textContent = order.guest_name;
    document.getElementById('scannedTotalTokens').textContent = order.total_tokens;
    
    // Display order items
    const itemsContainer = document.getElementById('scannedOrderItems');
    itemsContainer.innerHTML = order.order_items.map(item => `
        <div class="scanned-item">
            <span class="item-qty">${item.quantity}x</span>
            <span class="item-name">${item.item_name}</span>
            <span class="item-tokens">${item.total_tokens} 🪙</span>
        </div>
    `).join('');
    
    // Update order status to scanned
    supabase
        .from('beverage_orders_v2')
        .update({ status: 'scanned' })
        .eq('id', order.id);
    
    openModal('barmanOrderConfirmModal');
}

// Barman serves order
window.serveOrder = async function() {
    if (!currentScannedOrder) return;
    
    try {
        // Update order status
        const { error } = await supabase
            .from('beverage_orders_v2')
            .update({
                status: 'served',
                barman_id: window.currentUser?.id,
                barman_name: window.currentUser?.full_name,
                served_at: new Date().toISOString()
            })
            .eq('id', currentScannedOrder.id);
        
        if (error) throw error;
        
        // Get updated wallet balance
        const { data: wallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('id', currentScannedOrder.wallet_id)
            .single();
        
        // Send WhatsApp notification
        try {
            const items = currentScannedOrder.order_items
                .map(i => `${i.quantity}x ${i.item_name}`)
                .join(', ');
            
            await sendOrderServedMessage(
                currentScannedOrder.guest_phone,
                currentScannedOrder.guest_name,
                currentScannedOrder.order_number,
                items,
                currentScannedOrder.total_tokens,
                wallet?.token_balance || 0
            );
        } catch (whatsappError) {
            console.warn('WhatsApp notification failed:', whatsappError);
        }
        
        showToast('✅ Order served successfully!', 'success');
        closeModal('barmanOrderConfirmModal');
        currentScannedOrder = null;
        
        // Refresh barman stats
        if (window.loadBarmanStats) {
            await window.loadBarmanStats();
        }
        
    } catch (error) {
        console.error('Serve error:', error);
        showToast('Failed to process order', 'error');
    }
};

// Barman rejects order
window.rejectOrder = async function() {
    if (!currentScannedOrder) return;
    
    const reason = prompt('Reason for rejection (optional):');
    
    try {
        // Update order status
        const { error } = await supabase
            .from('beverage_orders_v2')
            .update({
                status: 'rejected',
                barman_id: window.currentUser?.id,
                barman_name: window.currentUser?.full_name,
                rejection_reason: reason || 'Not specified'
            })
            .eq('id', currentScannedOrder.id);
        
        if (error) throw error;
        
        // Send WhatsApp notification
        try {
            await sendOrderRejectedMessage(
                currentScannedOrder.guest_phone,
                currentScannedOrder.guest_name,
                currentScannedOrder.order_number,
                reason
            );
        } catch (whatsappError) {
            console.warn('WhatsApp notification failed:', whatsappError);
        }
        
        showToast('Order rejected', 'success');
        closeModal('barmanOrderConfirmModal');
        currentScannedOrder = null;
        
    } catch (error) {
        console.error('Reject error:', error);
        showToast('Failed to reject order', 'error');
    }
};

// =====================================================
// REFUND PANEL (Overseer/Sales Staff)
// =====================================================

// Search for refund
window.searchForRefund = async function() {
    const searchInput = document.getElementById('refundSearch');
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
        showToast('Enter phone number or order ID', 'error');
        return;
    }
    
    try {
        let guest = null;
        let orders = [];
        
        // Check if it's an order number
        if (searchTerm.toUpperCase().startsWith('VF-')) {
            const { data: order, error } = await supabase
                .from('beverage_orders_v2')
                .select('*, order_items(*)')
                .eq('order_number', searchTerm.toUpperCase())
                .single();
            
            if (order) {
                orders = [order];
                
                // Get guest info
                const { data: guestData } = await supabase
                    .from('guests')
                    .select('*')
                    .eq('id', order.guest_id)
                    .single();
                guest = guestData;
            }
        } else {
            // Search by phone
            const { data: guestData, error } = await supabase
                .from('guests')
                .select('*')
                .eq('phone', searchTerm)
                .single();
            
            if (guestData) {
                guest = guestData;
                
                // Get all orders
                const { data: ordersData } = await supabase
                    .from('beverage_orders_v2')
                    .select('*, order_items(*)')
                    .eq('guest_id', guest.id)
                    .in('status', ['served', 'refunded'])
                    .order('created_at', { ascending: false })
                    .limit(20);
                
                orders = ordersData || [];
            }
        }
        
        if (!guest) {
            showToast('Guest not found', 'error');
            return;
        }
        
        // Display results
        displayRefundResults(guest, orders);
        
    } catch (error) {
        console.error('Search error:', error);
        showToast('Search failed', 'error');
    }
};

// Display refund search results
function displayRefundResults(guest, orders) {
    const container = document.getElementById('refundResultsContainer');
    
    // Get wallet
    supabase
        .from('token_wallets')
        .select('*')
        .eq('guest_phone', guest.phone)
        .single()
        .then(({ data: wallet }) => {
            let html = `
                <div class="refund-guest-info card">
                    <h4><i class="fas fa-user"></i> ${guest.guest_name}</h4>
                    <p>Phone: ${guest.phone}</p>
                    <p>Balance: <strong>${wallet?.token_balance || 0} tokens</strong></p>
                </div>
                
                <h4 class="mt-4 mb-2"><i class="fas fa-receipt"></i> Orders</h4>
            `;
            
            if (orders.length === 0) {
                html += '<p class="text-gray-500">No refundable orders found</p>';
            } else {
                html += '<div class="refund-orders-list">';
                
                orders.forEach(order => {
                    const items = order.order_items?.map(i => `${i.quantity}x ${i.item_name}`).join(', ') || '';
                    const date = new Date(order.created_at).toLocaleString();
                    const isRefunded = order.status === 'refunded';
                    
                    html += `
                        <div class="refund-order-item ${isRefunded ? 'refunded' : ''}" onclick="${!isRefunded ? `showRefundModal('${order.id}')` : ''}">
                            <div class="order-header">
                                <span class="order-number">#${order.order_number}</span>
                                <span class="order-status status-${order.status}">${order.status}</span>
                            </div>
                            <div class="order-items">${items}</div>
                            <div class="order-footer">
                                <span>${order.total_tokens} tokens</span>
                                <span>${date}</span>
                            </div>
                            ${!isRefunded ? '<button class="refund-btn">Refund</button>' : '<span class="refunded-badge">Already Refunded</span>'}
                        </div>
                    `;
                });
                
                html += '</div>';
            }
            
            container.innerHTML = html;
        });
}

// Show refund modal for specific order
window.showRefundModal = async function(orderId) {
    try {
        const { data: order, error } = await supabase
            .from('beverage_orders_v2')
            .select('*, order_items(*)')
            .eq('id', orderId)
            .single();
        
        if (error || !order) {
            showToast('Order not found', 'error');
            return;
        }
        
        currentScannedOrder = order;
        
        // Populate modal
        document.getElementById('refundOrderNumber').textContent = `#${order.order_number}`;
        document.getElementById('refundGuestName').textContent = order.guest_name;
        document.getElementById('refundTotalTokens').textContent = order.total_tokens;
        
        // Show items with checkboxes for partial refund
        const itemsContainer = document.getElementById('refundOrderItems');
        itemsContainer.innerHTML = order.order_items.map(item => `
            <div class="refund-item ${item.is_refunded ? 'already-refunded' : ''}">
                <label>
                    <input type="checkbox" 
                           class="refund-item-checkbox" 
                           value="${item.id}" 
                           data-tokens="${item.total_tokens}"
                           ${item.is_refunded ? 'disabled checked' : 'checked'}
                           onchange="calculateRefundTotal()">
                    <span>${item.quantity}x ${item.item_name}</span>
                </label>
                <span class="item-tokens">${item.total_tokens} tokens ${item.is_refunded ? '(refunded)' : ''}</span>
            </div>
        `).join('');
        
        calculateRefundTotal();
        openModal('processRefundModal');
        
    } catch (error) {
        console.error('Error loading order:', error);
        showToast('Error loading order', 'error');
    }
};

// Calculate refund total based on selected items
window.calculateRefundTotal = function() {
    const checkboxes = document.querySelectorAll('.refund-item-checkbox:checked:not(:disabled)');
    let total = 0;
    
    checkboxes.forEach(cb => {
        total += parseInt(cb.dataset.tokens) || 0;
    });
    
    document.getElementById('refundTokensAmount').textContent = total;
};

// Process refund
window.processRefund = async function() {
    if (!currentScannedOrder) return;
    
    const reason = document.getElementById('refundReason').value;
    const notes = document.getElementById('refundNotes').value;
    const checkboxes = document.querySelectorAll('.refund-item-checkbox:checked:not(:disabled)');
    
    if (checkboxes.length === 0) {
        showToast('Select at least one item to refund', 'error');
        return;
    }
    
    let tokensToRefund = 0;
    const itemIds = [];
    
    checkboxes.forEach(cb => {
        tokensToRefund += parseInt(cb.dataset.tokens) || 0;
        itemIds.push(cb.value);
    });
    
    if (!confirm(`Refund ${tokensToRefund} tokens to ${currentScannedOrder.guest_name}?`)) {
        return;
    }
    
    try {
        // Determine refund type
        const totalItems = currentScannedOrder.order_items.filter(i => !i.is_refunded).length;
        const refundType = itemIds.length === totalItems ? 'full' : 'partial';
        
        // Create refund record
        const { error: refundError } = await supabase
            .from('token_refunds')
            .insert({
                order_id: currentScannedOrder.id,
                order_number: currentScannedOrder.order_number,
                guest_id: currentScannedOrder.guest_id,
                guest_phone: currentScannedOrder.guest_phone,
                wallet_id: currentScannedOrder.wallet_id,
                refund_type: refundType,
                tokens_refunded: tokensToRefund,
                reason: reason,
                notes: notes,
                processed_by: window.currentUser?.id,
                processed_by_name: window.currentUser?.full_name
            });
        
        if (refundError) throw refundError;
        
        // Mark items as refunded
        await supabase
            .from('order_items')
            .update({ is_refunded: true, refunded_at: new Date().toISOString() })
            .in('id', itemIds);
        
        // Update order status if full refund
        if (refundType === 'full') {
            await supabase
                .from('beverage_orders_v2')
                .update({ status: 'refunded' })
                .eq('id', currentScannedOrder.id);
        }
        
        // Get updated wallet balance
        const { data: wallet } = await supabase
            .from('token_wallets')
            .select('*')
            .eq('id', currentScannedOrder.wallet_id)
            .single();
        
        // Send WhatsApp notification
        try {
            await sendRefundMessage(
                currentScannedOrder.guest_phone,
                currentScannedOrder.guest_name,
                currentScannedOrder.guest_id,
                currentScannedOrder.order_number,
                tokensToRefund,
                wallet?.token_balance || 0,
                reason
            );
        } catch (whatsappError) {
            console.warn('WhatsApp notification failed:', whatsappError);
        }
        
        showToast(`✅ Refunded ${tokensToRefund} tokens successfully!`, 'success');
        closeModal('processRefundModal');
        currentScannedOrder = null;
        
        // Refresh search results
        document.getElementById('refundSearch').dispatchEvent(new Event('search'));
        
    } catch (error) {
        console.error('Refund error:', error);
        showToast('Failed to process refund', 'error');
    }
};

// =====================================================
// MENU MANAGEMENT (Super Admin)
// =====================================================

// Load menu items for management
window.loadMenuManagement = async function() {
    try {
        const { data: items, error } = await supabase
            .from('beverage_menu')
            .select('*')
            .order('display_order');
        
        if (error) throw error;
        
        const container = document.getElementById('menuManagementList');
        if (!container) return;
        
        if (!items || items.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">No menu items. Add some!</p>';
            return;
        }
        
        const categories = {
            'alcoholic': { title: '🍺 Alcoholic', items: [] },
            'non_alcoholic': { title: '🥤 Non-Alcoholic', items: [] },
            'snacks': { title: '🍿 Snacks', items: [] }
        };
        
        items.forEach(item => {
            const cat = categories[item.category] || categories['snacks'];
            cat.items.push(item);
        });
        
        let html = '';
        
        Object.entries(categories).forEach(([key, category]) => {
            if (category.items.length === 0) return;
            
            html += `
                <div class="menu-category-section">
                    <h4 class="category-header">${category.title}</h4>
                    <div class="menu-items-list">
                        ${category.items.map(item => `
                            <div class="menu-manage-item ${!item.is_available ? 'unavailable' : ''}">
                                <div class="item-info">
                                    <span class="item-name">${item.name}</span>
                                    <span class="item-price">${item.token_price} tokens</span>
                                </div>
                                <div class="item-actions">
                                    <button onclick="toggleMenuItemAvailability('${item.id}', ${!item.is_available})" 
                                            class="btn-icon ${item.is_available ? 'success' : 'danger'}"
                                            title="${item.is_available ? 'Mark Unavailable' : 'Mark Available'}">
                                        <i class="fas fa-${item.is_available ? 'check' : 'times'}"></i>
                                    </button>
                                    <button onclick="editMenuItem('${item.id}')" class="btn-icon" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="deleteMenuItem('${item.id}')" class="btn-icon danger" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading menu:', error);
    }
};

// Add/Edit menu item
window.showAddMenuItemModal = function() {
    document.getElementById('menuItemForm').reset();
    document.getElementById('menuItemId').value = '';
    document.getElementById('menuItemModalTitle').textContent = 'Add Menu Item';
    openModal('menuItemModal');
};

window.editMenuItem = async function(itemId) {
    try {
        const { data: item, error } = await supabase
            .from('beverage_menu')
            .select('*')
            .eq('id', itemId)
            .single();
        
        if (error || !item) {
            showToast('Item not found', 'error');
            return;
        }
        
        document.getElementById('menuItemId').value = item.id;
        document.getElementById('menuItemName').value = item.name;
        document.getElementById('menuItemDescription').value = item.description || '';
        document.getElementById('menuItemCategory').value = item.category;
        document.getElementById('menuItemPrice').value = item.token_price;
        document.getElementById('menuItemOrder').value = item.display_order;
        document.getElementById('menuItemAvailable').checked = item.is_available;
        
        document.getElementById('menuItemModalTitle').textContent = 'Edit Menu Item';
        openModal('menuItemModal');
        
    } catch (error) {
        console.error('Error loading item:', error);
    }
};

window.saveMenuItem = async function(event) {
    event.preventDefault();
    
    const itemId = document.getElementById('menuItemId').value;
    const itemData = {
        name: document.getElementById('menuItemName').value.trim(),
        description: document.getElementById('menuItemDescription').value.trim(),
        category: document.getElementById('menuItemCategory').value,
        token_price: parseInt(document.getElementById('menuItemPrice').value) || 0,
        display_order: parseInt(document.getElementById('menuItemOrder').value) || 0,
        is_available: document.getElementById('menuItemAvailable').checked
    };
    
    try {
        if (itemId) {
            // Update existing
            const { error } = await supabase
                .from('beverage_menu')
                .update(itemData)
                .eq('id', itemId);
            
            if (error) throw error;
            showToast('Menu item updated', 'success');
        } else {
            // Create new
            const { error } = await supabase
                .from('beverage_menu')
                .insert(itemData);
            
            if (error) throw error;
            showToast('Menu item added', 'success');
        }
        
        closeModal('menuItemModal');
        loadMenuManagement();
        
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save menu item', 'error');
    }
};

window.toggleMenuItemAvailability = async function(itemId, isAvailable) {
    try {
        const { error } = await supabase
            .from('beverage_menu')
            .update({ is_available: isAvailable })
            .eq('id', itemId);
        
        if (error) throw error;
        
        loadMenuManagement();
        
    } catch (error) {
        console.error('Toggle error:', error);
        showToast('Failed to update availability', 'error');
    }
};

window.deleteMenuItem = async function(itemId) {
    if (!confirm('Delete this menu item?')) return;
    
    try {
        const { error } = await supabase
            .from('beverage_menu')
            .delete()
            .eq('id', itemId);
        
        if (error) throw error;
        
        showToast('Menu item deleted', 'success');
        loadMenuManagement();
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete item', 'error');
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

window.closeModal = closeModal;

function showToast(message, type = 'info') {
    if (window.showToast && typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

console.log('✅ SipToken V2 module loaded');