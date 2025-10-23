const API_BASE = '/api';

// DOM Elements
const plansGrid = document.getElementById('plansGrid');
const paymentModal = document.getElementById('paymentModal');
const paymentForm = document.getElementById('paymentForm');
const planSummary = document.getElementById('planSummary');
const paymentResult = document.getElementById('paymentResult');
const closeModal = document.querySelector('.close');

// Subscription plans data
const subscriptionPlans = {
    'netflix': { name: 'Netflix Premium', price: 220, duration: '1 Month', icon: 'fas fa-film' },
    'spotify': { name: 'Spotify Premium', price: 180, duration: '1 Month', icon: 'fab fa-spotify' },
    'showmax': { name: 'Showmax Pro', price: 150, duration: '1 Month', icon: 'fas fa-tv' },
    'primevideo': { name: 'Prime Video', price: 200, duration: '1 Month', icon: 'fab fa-amazon' },
    'expressvpn': { name: 'ExpressVPN', price: 150, duration: '1 Month', icon: 'fas fa-shield-alt' },
    'nordvpn': { name: 'NordVPN', price: 250, duration: '1 Month', icon: 'fas fa-user-shield' },
    'surfshark': { name: 'Surfshark VPN', price: 300, duration: '1 Month', icon: 'fas fa-wave-square' },
    'whatsappbot': { name: 'WhatsApp Bot', price: 60, duration: 'Lifetime', icon: 'fab fa-whatsapp' },
    'hdopremium': { name: 'HDO Box Premium', price: 150, duration: '1 Month', icon: 'fas fa-box' },
    'unlimitedpanels': { name: 'Unlimited Panels', price: 100, duration: 'Lifetime', icon: 'fas fa-infinity' },
    'canvapro': { name: 'Canva Pro', price: 80, duration: '1 Month', icon: 'fas fa-palette' },
    'capcutpro': { name: 'CapCut Pro', price: 300, duration: '1 Month', icon: 'fas fa-video' }
};

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    loadSubscriptionPlans();
    setupEventListeners();
});

function loadSubscriptionPlans() {
    plansGrid.innerHTML = '';
    
    Object.entries(subscriptionPlans).forEach(([planId, plan]) => {
        const planCard = createPlanCard(planId, plan);
        plansGrid.appendChild(planCard);
    });
}

function createPlanCard(planId, plan) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    card.innerHTML = `
        <div class="plan-icon">
            <i class="${plan.icon}"></i>
        </div>
        <h3 class="plan-name">${plan.name}</h3>
        <div class="plan-price">KES ${plan.price}</div>
        <div class="plan-duration">${plan.duration}</div>
        <ul class="plan-features">
            <li><i class="fas fa-check"></i> Instant Activation</li>
            <li><i class="fas fa-check"></i> 24/7 Support</li>
            <li><i class="fas fa-check"></i> Full Features</li>
        </ul>
        <button class="btn-subscribe" data-plan="${planId}">
            Subscribe Now
        </button>
    `;
    
    return card;
}

function setupEventListeners() {
    // Subscribe buttons
    plansGrid.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-subscribe')) {
            const planId = e.target.getAttribute('data-plan');
            openPaymentModal(planId);
        }
    });
    
    // Close modal
    closeModal.addEventListener('click', closePaymentModal);
    window.addEventListener('click', function(e) {
        if (e.target === paymentModal) {
            closePaymentModal();
        }
    });
    
    // Payment form submission
    paymentForm.addEventListener('submit', handlePaymentSubmission);
    
    // Phone number formatting
    document.getElementById('phoneNumber').addEventListener('blur', function(e) {
        let phone = e.target.value.trim();
        if (phone.startsWith('0')) phone = '254' + phone.substring(1);
        else if (phone.startsWith('+')) phone = phone.substring(1);
        e.target.value = phone;
    });
}

let currentPlanId = null;

function openPaymentModal(planId) {
    currentPlanId = planId;
    const plan = subscriptionPlans[planId];
    
    // Update plan summary
    planSummary.innerHTML = `
        <div class="summary-item">
            <span>Subscription:</span>
            <span>${plan.name}</span>
        </div>
        <div class="summary-item">
            <span>Duration:</span>
            <span>${plan.duration}</span>
        </div>
        <div class="summary-item summary-total">
            <span>Total:</span>
            <span>KES ${plan.price}</span>
        </div>
    `;
    
    // Reset form and results
    paymentForm.reset();
    paymentResult.style.display = 'none';
    paymentModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closePaymentModal() {
    paymentModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentPlanId = null;
}

async function handlePaymentSubmission(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('payButton');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    // Get form data
    const formData = new FormData(paymentForm);
    const customerName = formData.get('customerName');
    const email = formData.get('email');
    const phoneNumber = formData.get('phoneNumber');
    
    // Validation
    if (!phoneNumber.startsWith('254')) {
        showPaymentResult('Please enter a valid M-Pesa number in format 2547XXXXXXXX', false);
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        showPaymentResult('🔄 Initiating payment... Please wait.', true, 'info');
        
        const response = await fetch(`${API_BASE}/initiate-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planId: currentPlanId,
                phoneNumber: phoneNumber,
                customerName: customerName,
                email: email
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showPaymentResult(`✅ ${result.data.checkoutMessage}<br>Check your phone for M-Pesa prompt.`, true);
            
            // Start polling for payment status
            const reference = result.data.reference;
            pollPaymentStatus(reference);
            
        } else {
            showPaymentResult(`❌ ${result.error}`, false);
        }
        
    } catch (error) {
        showPaymentResult(`❌ Network error: ${error.message}`, false);
    } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

async function pollPaymentStatus(reference) {
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes (10-second intervals)
    
    const poll = async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_BASE}/check-payment/${reference}`);
            const result = await response.json();
            
            if (result.success && result.status === 'success') {
                showPaymentResult(`🎉 ${result.message}`, true);
                
                // Redirect to WhatsApp after 3 seconds
                setTimeout(() => {
                    window.location.href = result.whatsappUrl;
                }, 3000);
                
                return;
            }
            
            if (attempts < maxAttempts) {
                // Continue polling
                setTimeout(poll, 10000); // Check every 10 seconds
            } else {
                showPaymentResult('⏰ Payment check timeout. Please contact support if payment was made.', false);
            }
            
        } catch (error) {
            console.error('Polling error:', error);
            if (attempts < maxAttempts) {
                setTimeout(poll, 10000);
            }
        }
    };
    
    // Start polling
    setTimeout(poll, 10000); // First check after 10 seconds
}

function showPaymentResult(message, isSuccess, type = 'success') {
    paymentResult.innerHTML = message;
    paymentResult.className = `payment-result ${type}`;
    paymentResult.style.display = 'block';
    
    // Scroll to result
    paymentResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Service health check on load
async function checkServiceHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const result = await response.json();
        console.log('Service status:', result);
    } catch (error) {
        console.error('Service health check failed:', error);
    }
}

// Initialize health check
checkServiceHealth();
