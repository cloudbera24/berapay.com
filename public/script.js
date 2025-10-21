// BERA PAY Frontend JavaScript

// Global variables
let currentDeveloper = null;
let authToken = localStorage.getItem('beraPayToken');

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 Checking authentication status...');
    console.log('Token exists:', !!authToken);
    
    // Check authentication for dashboard
    if (window.location.pathname === '/dashboard') {
        if (!authToken) {
            console.log('❌ No token found, redirecting to home');
            window.location.href = '/';
            return;
        }
        console.log('✅ Token found, loading dashboard...');
        loadDashboardData();
    } else if (window.location.pathname === '/' && authToken) {
        // If user is logged in and visits home, redirect to dashboard
        console.log('✅ User is logged in, redirecting to dashboard');
        window.location.href = '/dashboard';
    }
    
    // Initialize modals
    initModals();
    
    // Initialize forms
    initForms();
});

// Modal Functions
function openRegisterModal() {
    document.getElementById('registerModal').style.display = 'block';
}

function closeRegisterModal() {
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('registerResult').innerHTML = '';
    document.getElementById('registerForm').reset();
}

function openLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginResult').innerHTML = '';
    document.getElementById('loginForm').reset();
}

// Close modals when clicking outside
window.onclick = function(event) {
    const registerModal = document.getElementById('registerModal');
    const loginModal = document.getElementById('loginModal');
    
    if (event.target === registerModal) {
        closeRegisterModal();
    }
    if (event.target === loginModal) {
        closeLoginModal();
    }
}

// Initialize modals
function initModals() {
    // Registration form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
}

// Initialize forms
function initForms() {
    // STK Push form
    const stkForm = document.getElementById('stkForm');
    if (stkForm) {
        stkForm.addEventListener('submit', handleSTKPush);
    }
    
    // Payout form
    const payoutForm = document.getElementById('payoutForm');
    if (payoutForm) {
        payoutForm.addEventListener('submit', handlePayout);
    }
}

// Registration Handler
async function handleRegister(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        password: formData.get('password')
    };
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    try {
        submitBtn.innerHTML = '🔄 Creating Account...';
        submitBtn.disabled = true;
        
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        const resultDiv = document.getElementById('registerResult');
        
        if (result.success) {
            resultDiv.className = 'result success';
            resultDiv.innerHTML = `
                ✅ Registration successful!<br>
                <strong>API Key:</strong> <code style="background: rgba(0,0,0,0.1); padding: 2px 5px; border-radius: 3px;">${result.data.api_key}</code><br>
                <small style="color: #666;">Save this key securely - it won't be shown again.</small><br><br>
                <strong>Auto-login in 3 seconds...</strong>
            `;
            
            // Store token and redirect to dashboard
            localStorage.setItem('beraPayToken', result.data.token);
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 3000);
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        const resultDiv = document.getElementById('registerResult');
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Registration failed. Please try again.';
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Login Handler
async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        email: formData.get('email'),
        password: formData.get('password')
    };
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    try {
        submitBtn.innerHTML = '🔄 Logging in...';
        submitBtn.disabled = true;
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        const resultDiv = document.getElementById('loginResult');
        
        if (result.success) {
            resultDiv.className = 'result success';
            resultDiv.textContent = '✅ Login successful! Redirecting...';
            
            // Store token and redirect
            localStorage.setItem('beraPayToken', result.data.token);
            console.log('🔐 Token stored:', result.data.token.substring(0, 20) + '...');
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        const resultDiv = document.getElementById('loginResult');
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Login failed. Please try again.';
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Logout Function
function logout() {
    console.log('🚪 Logging out...');
    localStorage.removeItem('beraPayToken');
    window.location.href = '/';
}

// Dashboard Functions
async function loadDashboardData() {
    console.log('📊 Loading dashboard data...');
    
    try {
        const response = await fetch('/api/dashboard', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('📡 Dashboard response status:', response.status);
        
        if (response.status === 401) {
            console.log('❌ Token invalid, logging out...');
            logout();
            return;
        }
        
        const result = await response.json();
        console.log('📊 Dashboard result:', result);
        
        if (result.success) {
            currentDeveloper = result.data.developer;
            updateDashboardUI(result.data);
        } else {
            console.log('❌ Dashboard API error:', result.error);
            if (result.error.includes('Invalid API key') || result.error.includes('unauthorized')) {
                logout();
            } else {
                showNotification('Failed to load dashboard data: ' + result.error, 'error');
            }
        }
    } catch (error) {
        console.error('💥 Failed to load dashboard:', error);
        showNotification('Network error loading dashboard', 'error');
    }
}

function updateDashboardUI(data) {
    console.log('🎨 Updating dashboard UI with data:', data);
    
    // Update stats
    if (document.getElementById('balance')) {
        document.getElementById('balance').textContent = `KES ${(data.developer.balance || 0).toLocaleString()}`;
    }
    if (document.getElementById('totalTx')) {
        document.getElementById('totalTx').textContent = (data.stats.total_transactions || 0).toLocaleString();
    }
    if (document.getElementById('totalVolume')) {
        document.getElementById('totalVolume').textContent = `KES ${(data.stats.total_volume || 0).toLocaleString()}`;
    }
    if (document.getElementById('totalCommission')) {
        document.getElementById('totalCommission').textContent = `KES ${(data.stats.total_commission || 0).toLocaleString()}`;
    }
    
    // Update withdraw balance
    if (document.getElementById('withdrawBalance')) {
        document.getElementById('withdrawBalance').textContent = `KES ${(data.developer.balance || 0).toLocaleString()}`;
    }
    
    // Update API key
    if (document.getElementById('apiKeyDisplay')) {
        document.getElementById('apiKeyDisplay').textContent = data.developer.api_key || 'Not available';
    }
    
    // Update recent transactions
    if (document.getElementById('recentTransactions')) {
        updateRecentTransactions(data.recent_transactions || []);
    }
    
    // Update recent payouts
    if (document.getElementById('recentPayouts')) {
        updateRecentPayouts(data.recent_payouts || []);
    }
    
    console.log('✅ Dashboard UI updated successfully');
}

function updateRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactions');
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<p class="text-muted">No transactions yet</p>';
        return;
    }
    
    container.innerHTML = transactions.map(tx => `
        <div class="transaction-item">
            <div>
                <div class="transaction-reference">${tx.reference || 'N/A'}</div>
                <small>${tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'Unknown date'}</small>
            </div>
            <div>
                <div class="transaction-amount">KES ${tx.amount || 0}</div>
                <span class="transaction-status status-${tx.status || 'pending'}">${tx.status || 'pending'}</span>
            </div>
        </div>
    `).join('');
}

function updateRecentPayouts(payouts) {
    const container = document.getElementById('recentPayouts');
    
    if (!payouts || payouts.length === 0) {
        container.innerHTML = '<p class="text-muted">No payouts yet</p>';
        return;
    }
    
    container.innerHTML = payouts.map(payout => `
        <div class="payout-item">
            <div>
                <div class="payout-reference">${payout.reference || 'N/A'}</div>
                <small>${payout.createdAt ? new Date(payout.createdAt).toLocaleDateString() : 'Unknown date'}</small>
            </div>
            <div>
                <div class="transaction-amount">KES ${payout.amount || 0}</div>
                <span class="transaction-status status-${payout.status || 'pending'}">${payout.status || 'pending'}</span>
            </div>
        </div>
    `).join('');
}

// STK Push Handler
async function handleSTKPush(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        phone_number: formData.get('phone'),
        amount: parseFloat(formData.get('amount')),
        reference: formData.get('reference') || undefined
    };
    
    const resultDiv = document.getElementById('stkResult');
    resultDiv.innerHTML = '🔄 Initiating payment...';
    resultDiv.className = 'result';
    
    try {
        const response = await fetch('/api/stk-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            resultDiv.className = 'result success';
            resultDiv.innerHTML = `
                ✅ STK Push initiated!<br>
                <strong>Reference:</strong> ${result.data.reference}<br>
                <strong>Amount:</strong> KES ${result.data.amount}<br>
                <strong>Commission:</strong> KES ${result.data.commission}<br>
                <strong>You receive:</strong> KES ${result.data.net_amount}<br>
                <small>Customer should check their phone to complete payment</small>
            `;
            
            // Reload dashboard data after a delay
            setTimeout(loadDashboardData, 2000);
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
            
            // If unauthorized, logout
            if (result.error.includes('Invalid API key') || result.error.includes('unauthorized')) {
                setTimeout(logout, 2000);
            }
        }
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Failed to initiate payment. Please try again.';
    }
}

// Payout Handler
async function handlePayout(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        phone_number: formData.get('phone'),
        amount: parseFloat(formData.get('amount'))
    };
    
    const resultDiv = document.getElementById('payoutResult');
    resultDiv.innerHTML = '🔄 Processing payout...';
    resultDiv.className = 'result';
    
    try {
        const response = await fetch('/api/b2c-payout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            resultDiv.className = 'result success';
            resultDiv.innerHTML = `
                ✅ Payout initiated!<br>
                <strong>Reference:</strong> ${result.data.reference}<br>
                <strong>Amount:</strong> KES ${result.data.amount}<br>
                <small>Funds should arrive in your M-Pesa shortly</small>
            `;
            
            // Reload dashboard data
            setTimeout(loadDashboardData, 2000);
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
        }
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Failed to process payout. Please try again.';
    }
}

// Check Transaction Status
async function checkTransactionStatus() {
    const reference = document.getElementById('statusReference').value.trim();
    const resultDiv = document.getElementById('statusResult');
    
    if (!reference) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Please enter a transaction reference';
        return;
    }
    
    resultDiv.innerHTML = '🔄 Checking status...';
    resultDiv.className = 'result';
    
    try {
        const response = await fetch(`/api/transaction-status/${reference}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            const tx = result.data;
            resultDiv.className = 'result success';
            resultDiv.innerHTML = `
                <strong>Reference:</strong> ${tx.reference}<br>
                <strong>Amount:</strong> KES ${tx.amount}<br>
                <strong>Status:</strong> <span class="transaction-status status-${tx.status}">${tx.status}</span><br>
                <strong>Commission:</strong> KES ${tx.commission}<br>
                <strong>Net Amount:</strong> KES ${tx.net_amount}<br>
                <strong>Date:</strong> ${tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'Unknown'}
            `;
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
        }
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Failed to check status. Please try again.';
    }
}

// Copy API Key
function copyApiKey() {
    const apiKey = document.getElementById('apiKeyDisplay').textContent;
    navigator.clipboard.writeText(apiKey).then(() => {
        showNotification('API key copied to clipboard!', 'success');
    });
}

// Dashboard Navigation
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Add active class to clicked menu item
    event.target.classList.add('active');
}

// Utility Functions
function scrollToFeatures() {
    document.getElementById('features').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    if (type === 'success') {
        notification.style.background = '#10b981';
    } else if (type === 'error') {
        notification.style.background = '#ef4444';
    } else {
        notification.style.background = '#3b82f6';
    }
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .text-muted {
        color: #64748b;
    }
    
    .transaction-status {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 500;
    }
    
    .status-pending {
        background: #fef3c7;
        color: #d97706;
    }
    
    .status-completed {
        background: #d1fae5;
        color: #059669;
    }
    
    .status-failed {
        background: #fee2e2;
        color: #dc2626;
    }
    
    .status-initiated {
        background: #dbeafe;
        color: #1d4ed8;
    }
    
    .status-processed {
        background: #ddd6fe;
        color: #7c3aed;
    }
`;
document.head.appendChild(style);

// Add periodic dashboard refresh when on dashboard
if (window.location.pathname === '/dashboard') {
    setInterval(() => {
        console.log('🔄 Auto-refreshing dashboard data...');
        loadDashboardData();
    }, 30000); // Refresh every 30 seconds
}
