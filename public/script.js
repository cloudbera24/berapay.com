// API Configuration
const API_BASE = '/api';

// Global State
let currentPlanId = null;
let currentPlanData = null;
let currentCategory = null;

// DOM Elements
const categoriesContainer = document.getElementById('categoriesContainer');
const paymentModal = document.getElementById('paymentModal');
const donationModal = document.getElementById('donationModal');
const paymentForm = document.getElementById('paymentForm');
const donationForm = document.getElementById('donationForm');
const planSummary = document.getElementById('planSummary');
const paymentResult = document.getElementById('paymentResult');
const donationResult = document.getElementById('donationResult');

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    await loadSubscriptionPlans();
    setupEventListeners();
    setupDonationEvents();
    checkServiceHealth();
}

// Load Subscription Plans from API
async function loadSubscriptionPlans() {
    try {
        showLoadingState();
        
        const response = await fetch(`${API_BASE}/plans`);
        const result = await response.json();
        
        if (result.success) {
            displayCategories(result.categories);
        } else {
            showError('Failed to load subscription plans');
        }
    } catch (error) {
        console.error('Error loading plans:', error);
        showError('Network error loading plans');
    }
}

function displayCategories(categories) {
    categoriesContainer.innerHTML = '';
    
    Object.entries(categories).forEach(([categoryKey, categoryData]) => {
        const categorySection = createCategorySection(categoryKey, categoryData);
        categoriesContainer.appendChild(categorySection);
    });
}

function createCategorySection(categoryKey, categoryData) {
    const section = document.createElement('div');
    section.className = 'category-section';
    
    section.innerHTML = `
        <div class="category-header">
            <div class="category-icon" style="background: ${categoryData.color}">
                <i class="${categoryData.icon}"></i>
            </div>
            <h3 class="category-title">${categoryData.category}</h3>
        </div>
        <div class="plans-grid" id="plans-${categoryKey}">
            ${Object.entries(categoryData.plans).map(([planId, plan]) => createPlanCard(planId, plan, categoryData.color)).join('')}
        </div>
    `;
    
    return section;
}

function createPlanCard(planId, plan, categoryColor) {
    const popularBadge = plan.popular ? 'popular' : '';
    
    return `
        <div class="plan-card ${popularBadge}" data-plan="${planId}">
            <div class="plan-header">
                <div>
                    <h4 class="plan-name">${plan.name}</h4>
                    <div class="plan-price">KES ${plan.price}</div>
                    <div class="plan-duration">${plan.duration}</div>
                </div>
            </div>
            <ul class="plan-features">
                ${plan.features.map(feature => `
                    <li>
                        <i class="fas fa-check"></i>
                        ${feature}
                    </li>
                `).join('')}
            </ul>
            <button class="subscribe-btn" onclick="openPaymentModal('${planId}')">
                <i class="fas fa-shopping-cart"></i>
                Subscribe Now
            </button>
        </div>
    `;
}

// Event Listeners
function setupEventListeners() {
    // Payment modal close
    document.getElementById('closePaymentModal').addEventListener('click', closePaymentModal);
    
    // Donation modal close
    document.getElementById('closeDonationModal').addEventListener('click', closeDonationModal);
    
    // Outside click to close modals
    window.addEventListener('click', function(e) {
        if (e.target === paymentModal) closePaymentModal();
        if (e.target === donationModal) closeDonationModal();
    });
    
    // Payment form submission
    paymentForm.addEventListener('submit', handlePaymentSubmission);
    
    // Phone number formatting
    document.getElementById('phoneNumber').addEventListener('blur', formatPhoneNumber);
    document.getElementById('donorPhone').addEventListener('blur', formatDonorPhone);
}

// Donation Functionality
function setupDonationEvents() {
    // Open donation modal
    document.getElementById('openDonationModal').addEventListener('click', openDonationModal);
    
    // Donation amount suggestions
    document.querySelectorAll('.amount-suggestion').forEach(suggestion => {
        suggestion.addEventListener('click', function() {
            const amount = this.getAttribute('data-amount');
            document.getElementById('donationAmount').value = amount;
            highlightActiveSuggestion(this);
        });
    });
    
    // Donation options
    document.querySelectorAll('.donation-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.id !== 'customDonation') {
                const amount = this.getAttribute('data-amount');
                document.getElementById('donationAmount').value = amount;
                highlightActiveDonationOption(this);
            }
        });
    });
    
    // Donation form submission
    donationForm.addEventListener('submit', handleDonationSubmission);
}

function highlightActiveSuggestion(activeElement) {
    document.querySelectorAll('.amount-suggestion').forEach(el => {
        el.style.background = '';
        el.style.color = '';
        el.style.borderColor = '';
    });
    
    activeElement.style.background = 'var(--primary)';
    activeElement.style.color = 'var(--white)';
    activeElement.style.borderColor = 'var(--primary)';
}

function highlightActiveDonationOption(activeElement) {
    document.querySelectorAll('.donation-option').forEach(el => {
        el.classList.remove('active');
    });
    
    activeElement.classList.add('active');
}

// Payment Modal Functions
function openPaymentModal(planId) {
    // Find plan data
    let planData = null;
    let categoryName = '';
    
    fetch(`${API_BASE}/plans`)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                for (const [category, categoryData] of Object.entries(result.categories)) {
                    if (categoryData.plans[planId]) {
                        planData = categoryData.plans[planId];
                        categoryName = categoryData.category;
                        break;
                    }
                }
                
                if (planData) {
                    currentPlanId = planId;
                    currentPlanData = planData;
                    currentCategory = categoryName;
                    
                    updatePlanSummary(planData, categoryName);
                    paymentForm.reset();
                    paymentResult.style.display = 'none';
                    paymentModal.style.display = 'flex';
                    document.body.style.overflow = 'hidden';
                }
            }
        });
}

function updatePlanSummary(plan, category) {
    planSummary.innerHTML = `
        <div class="summary-item">
            <span>Category:</span>
            <span>${category}</span>
        </div>
        <div class="summary-item">
            <span>Plan:</span>
            <span>${plan.name}</span>
        </div>
        <div class="summary-item">
            <span>Duration:</span>
            <span>${plan.duration}</span>
        </div>
        <div class="summary-item summary-total">
            <span>Total Amount:</span>
            <span>KES ${plan.price}</span>
        </div>
    `;
}

function closePaymentModal() {
    paymentModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentPlanId = null;
    currentPlanData = null;
}

// Donation Modal Functions
function openDonationModal() {
    donationForm.reset();
    donationResult.style.display = 'none';
    
    // Reset active states
    document.querySelectorAll('.amount-suggestion').forEach(el => {
        el.style.background = '';
        el.style.color = '';
        el.style.borderColor = '';
    });
    
    document.querySelectorAll('.donation-option').forEach(el => {
        el.classList.remove('active');
    });
    
    donationModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeDonationModal() {
    donationModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Payment Processing
async function handlePaymentSubmission(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('payButton');
    const btnContent = submitBtn.querySelector('.btn-content');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    // Get form data
    const formData = new FormData(paymentForm);
    const customerName = formData.get('customerName');
    const email = formData.get('email');
    const phoneNumber = formData.get('phoneNumber');
    
    // Validation
    if (!validatePhoneNumber(phoneNumber)) {
        showPaymentResult('Please enter a valid M-Pesa number in format 2547XXXXXXXX (12 digits)', false);
        return;
    }
    
    if (!customerName || !email) {
        showPaymentResult('Please fill in all required fields', false);
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    btnContent.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        showPaymentResult('🔄 Initiating secure payment... Please wait.', true, 'info');
        
        const response = await fetch(`${API_BASE}/initiate-payment`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                planId: currentPlanId,
                phoneNumber: phoneNumber,
                customerName: customerName,
                email: email
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showPaymentResult(`
                <div style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">✅</div>
                    <strong>${result.data.checkoutMessage}</strong>
                    <p style="margin-top: 0.5rem; color: var(--gray-600);">Check your phone for M-Pesa prompt</p>
                </div>
            `, true);
            
            // Start polling for payment status
            const reference = result.data.reference;
            await pollPaymentStatus(reference);
            
        } else {
            showPaymentResult(`
                <div style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                    <strong>Payment Failed</strong>
                    <p style="margin-top: 0.5rem;">${result.error}</p>
                </div>
            `, false);
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        showPaymentResult(`
            <div style="text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <strong>Network Error</strong>
                <p style="margin-top: 0.5rem;">Please check your connection and try again</p>
            </div>
        `, false);
    } finally {
        submitBtn.disabled = false;
        btnContent.style.display = 'flex';
        btnLoading.style.display = 'none';
    }
}

// Donation Processing
async function handleDonationSubmission(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('donateButton');
    const btnContent = submitBtn.querySelector('.btn-content');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    // Get form data
    const formData = new FormData(donationForm);
    const amount = formData.get('donationAmount');
    const donorName = formData.get('donorName');
    const donorMessage = formData.get('donorMessage');
    const donorPhone = formData.get('donorPhone');
    
    // Validation
    if (!validatePhoneNumber(donorPhone)) {
        showDonationResult('Please enter a valid M-Pesa number in format 2547XXXXXXXX (12 digits)', false);
        return;
    }
    
    if (!amount || amount < 1) {
        showDonationResult('Please enter a valid donation amount (minimum KES 1)', false);
        return;
    }
    
    if (amount > 150000) {
        showDonationResult('Maximum donation amount is KES 150,000', false);
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    btnContent.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        showDonationResult('🔄 Processing your generous donation... Please wait.', true, 'info');
        
        const response = await fetch(`${API_BASE}/donate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phoneNumber: donorPhone,
                amount: parseFloat(amount),
                customerName: donorName,
                message: donorMessage
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showDonationResult(`
                <div style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">💝</div>
                    <strong>${result.data.checkoutMessage}</strong>
                    <p style="margin-top: 0.5rem; color: var(--gray-600);">${result.data.thankYouMessage}</p>
                    <p style="margin-top: 1rem; font-size: 0.9rem;">Check your phone for M-Pesa prompt</p>
                </div>
            `, true);
            
            // Start polling for donation status
            const reference = result.data.reference;
            await pollDonationStatus(reference);
            
        } else {
            showDonationResult(`
                <div style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                    <strong>Donation Failed</strong>
                    <p style="margin-top: 0.5rem;">${result.error}</p>
                </div>
            `, false);
        }
        
    } catch (error) {
        console.error('Donation error:', error);
        showDonationResult(`
            <div style="text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <strong>Network Error</strong>
                <p style="margin-top: 0.5rem;">Please check your connection and try again</p>
            </div>
        `, false);
    } finally {
        submitBtn.disabled = false;
        btnContent.style.display = 'flex';
        btnLoading.style.display = 'none';
    }
}

// Payment Status Polling
async function pollPaymentStatus(reference) {
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes (10-second intervals)
    
    const poll = async () => {
        attempts++;
        
        try {
            showPaymentResult(`
                <div style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
                    <strong>Waiting for Payment Confirmation</strong>
                    <p style="margin-top: 0.5rem; color: var(--gray-600);">
                        Attempt ${attempts} of ${maxAttempts}<br>
                        Please complete the payment on your phone
                    </p>
                </div>
            `, true, 'info');
            
            const response = await fetch(`${API_BASE}/check-payment/${reference}`);
            const result = await response.json();
            
            if (result.success && result.status === 'success') {
                showPaymentResult(`
                    <div style="text-align: center;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
                        <strong>Payment Successful!</strong>
                        <p style="margin-top: 0.5rem; color: var(--gray-600);">${result.message}</p>
                        <p style="margin-top: 1rem; font-size: 0.9rem;">Redirecting to WhatsApp...</p>
                    </div>
                `, true);
                
                // Redirect to WhatsApp after 3 seconds
                setTimeout(() => {
                    window.location.href = result.whatsappUrl;
                }, 3000);
                
                return;
            }
            
            if (result.success && result.status !== 'success' && attempts < maxAttempts) {
                // Continue polling
                setTimeout(poll, 10000); // Check every 10 seconds
            } else if (attempts >= maxAttempts) {
                showPaymentResult(`
                    <div style="text-align: center;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;">⏰</div>
                        <strong>Payment Check Timeout</strong>
                        <p style="margin-top: 0.5rem; color: var(--gray-600);">
                            Please contact support if payment was made
                        </p>
                        <a href="https://wa.me/254743982206" 
                           style="display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: var(--success); color: white; text-decoration: none; border-radius: 8px;">
                            Contact Support
                        </a>
                    </div>
                `, false);
            }
            
        } catch (error) {
            console.error('Polling error:', error);
            if (attempts < maxAttempts) {
                setTimeout(poll, 10000);
            }
        }
    };
    
    // Start polling after 10 seconds
    setTimeout(poll, 10000);
}

// Donation Status Polling
async function pollDonationStatus(reference) {
    let attempts = 0;
    const maxAttempts = 20; // ~3.5 minutes
    
    const poll = async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_BASE}/check-payment/${reference}`);
            const result = await response.json();
            
            if (result.success && result.status === 'success') {
                showDonationResult(`
                    <div style="text-align: center;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🙏</div>
                        <strong>Thank You for Your Generosity!</strong>
                        <p style="margin-top: 0.5rem; color: var(--gray-600);">
                            Your donation has been confirmed successfully
                        </p>
                        <p style="margin-top: 1rem; font-size: 0.9rem;">
                            We truly appreciate your support in helping us grow and improve our services.
                        </p>
                    </div>
                `, true);
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(poll, 10000);
            } else {
                showDonationResult(`
                    <div style="text-align: center;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;">⏰</div>
                        <strong>Donation Check Complete</strong>
                        <p style="margin-top: 0.5rem; color: var(--gray-600);">
                            Thank you for your support! If you made a donation, it will be processed shortly.
                        </p>
                    </div>
                `, true);
            }
            
        } catch (error) {
            console.error('Donation polling error:', error);
            if (attempts < maxAttempts) {
                setTimeout(poll, 10000);
            }
        }
    };
    
    setTimeout(poll, 10000);
}

// Utility Functions
function validatePhoneNumber(phone) {
    const regex = /^254[17]\d{8}$/;
    return regex.test(phone);
}

function formatPhoneNumber(e) {
    let phone = e.target.value.trim();
    phone = phone.replace(/\D/g, ''); // Remove non-digits
    
    if (phone.startsWith('0') && phone.length === 10) {
        phone = '254' + phone.substring(1);
    } else if (phone.startsWith('7') && phone.length === 9) {
        phone = '254' + phone;
    } else if (phone.startsWith('254') && phone.length === 12) {
        // Already correct format
    } else {
        return; // Invalid format
    }
    
    e.target.value = phone;
}

function formatDonorPhone(e) {
    formatPhoneNumber(e);
}

function showPaymentResult(message, isSuccess, type = 'success') {
    paymentResult.innerHTML = message;
    paymentResult.className = `payment-result ${isSuccess ? type : 'error'}`;
    paymentResult.style.display = 'block';
    paymentResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showDonationResult(message, isSuccess, type = 'success') {
    donationResult.innerHTML = message;
    donationResult.className = `payment-result ${isSuccess ? type : 'error'}`;
    donationResult.style.display = 'block';
    donationResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showLoadingState() {
    categoriesContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
            <div style="font-size: 2rem; margin-bottom: 1rem;">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <p>Loading premium services...</p>
        </div>
    `;
}

function showError(message) {
    categoriesContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--error);">
            <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
            <p>${message}</p>
            <button onclick="location.reload()" 
                    style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer;">
                Retry
            </button>
        </div>
    `;
}

// Service Health Check
async function checkServiceHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const result = await response.json();
        
        if (!result.success) {
            console.warn('Service health check warning:', result.message);
        }
    } catch (error) {
        console.error('Service health check failed:', error);
    }
}

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add loading animation to buttons
document.addEventListener('submit', function(e) {
    if (e.target.matches('form')) {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            const btnContent = submitBtn.querySelector('.btn-content');
            const btnLoading = submitBtn.querySelector('.btn-loading');
            
            if (btnContent && btnLoading) {
                btnContent.style.display = 'none';
                btnLoading.style.display = 'inline';
            }
        }
    }
});
