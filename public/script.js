// BERA PAY Frontend JavaScript

// Global variables
let currentDeveloper = null;
let authToken = localStorage.getItem('beraPayToken');

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication for dashboard
    if (window.location.pathname === '/dashboard') {
        if (!authToken) {
            window.location.href = '/';
            return;
        }
        loadDashboardData();
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
    
    try {
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
                <strong>API Key:</strong> ${result.data.api_key}<br>
                <small>Save this key securely - it won't be shown again.</small>
            `;
            
            // Store token and redirect to dashboard
            localStorage.setItem('beraPayToken', result.data.token);
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 3000);
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
        }
    } catch (error) {
        const resultDiv = document.getElementById('registerResult');
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Registration failed. Please try again.';
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
    
    try {
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
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
            
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ ${result.error}`;
        }
    } catch (error) {
        const resultDiv = document.getElementById('loginResult');
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Login failed. Please try again.';
    }
}

// Logout Function
function logout() {
    localStorage.removeItem('beraPayToken');
    window.location.href = '/';
}

// Dashboard Functions
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentDeveloper = result.data.developer;
            updateDashboardUI(result.data);
        } else {
            // Token might be invalid
            logout();
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showNotification('Failed to load dashboard data', 'error');
    }
}

function updateDashboardUI(data) {
    // Update stats
    document.getElementById('balance').textContent = `KES ${data.developer.balance.toLocaleString()}`;
    document.getElementById('totalTx').textContent = data.stats.total_transactions.toLocaleString();
    document.getElementById('totalVolume').textContent = `KES ${data.stats.total_volume.toLocaleString()}`;
    document.getElementById('totalCommission').textContent = `KES ${data.stats.total_commission.toLocaleString()}`;
    
    // Update withdraw balance
    document.getElementById('withdrawBalance').textContent = `KES ${data.developer.balance.toLocaleString()}`;
    
    // Update API key
    document.getElementById('apiKeyDisplay').textContent = data.developer.api_key;
    
    // Update recent transactions
    updateRecentTransactions(data.recent_transactions);
    
    // Update recent payouts
    updateRecentPayouts(data.recent_payouts);
}

function updateRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactions');
    
    if (transactions.length === 0) {
        container.innerHTML = '<p class="text-muted">No transactions yet</p>';
        return;
    }
    
    container.innerHTML = transactions.map(tx => `
        <div class="transaction-item">
            <div>
                <div class="transaction-reference">${tx.reference}</div>
                <small>${new Date(tx.created_at).toLocaleDateString()}</small>
            </div>
            <div>
                <div class="transaction-amount">KES ${tx.amount}</div>
                <span class="transaction-status status-${tx.status}">${tx.status}</span>
            </div>
        </div>
    `).join('');
}

function updateRecentPayouts(payouts) {
    const container = document.getElementById('recentPayouts');
    
    if (payouts.length === 0) {
        container.innerHTML = '<p class="text-muted">No payouts yet</p>';
        return;
    }
    
    container.innerHTML = payouts.map(payout => `
        <div class="payout-item">
            <div>
                <div class="payout-reference">${payout.reference}</div>
                <small>${new Date(payout.created_at).toLocaleDateString()}</small>
            </div>
            <div>
                <div class="transaction-amount">KES ${payout.amount}</div>
                <span class="transaction-status status-${payout.status}">${payout.status}</span>
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
                <strong>Date:</strong> ${new Date(tx.created_at).toLocaleString()}
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
            document.body.removeChild(notification);
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
`;
document.head.appendChild(style);
