// Donation functionality
const donationModal = document.getElementById('donationModal');
const donationForm = document.getElementById('donationForm');
const donationResult = document.getElementById('donationResult');
const openDonationModalBtn = document.getElementById('openDonationModal');
const donationAmountInput = document.getElementById('donationAmount');
const donationOptions = document.querySelectorAll('.donation-option');

// Initialize donation functionality
function setupDonationEvents() {
    // Open donation modal
    openDonationModalBtn.addEventListener('click', openDonationModal);
    
    // Donation amount buttons
    donationOptions.forEach(option => {
        option.addEventListener('click', function() {
            const amount = this.getAttribute('data-amount');
            donationAmountInput.value = amount;
            
            // Update active state
            donationOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Donation form submission
    donationForm.addEventListener('submit', handleDonationSubmission);
    
    // Close donation modal
    document.querySelector('#donationModal .close').addEventListener('click', closeDonationModal);
    window.addEventListener('click', function(e) {
        if (e.target === donationModal) {
            closeDonationModal();
        }
    });
}

function openDonationModal() {
    donationForm.reset();
    donationResult.style.display = 'none';
    donationModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Remove active states
    donationOptions.forEach(opt => opt.classList.remove('active'));
}

function closeDonationModal() {
    donationModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function handleDonationSubmission(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('donateButton');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    // Get form data
    const formData = new FormData(donationForm);
    const amount = formData.get('donationAmount');
    const donorName = formData.get('donorName');
    const donorMessage = formData.get('donorMessage');
    const donorPhone = formData.get('donorPhone');
    
    // Validation
    if (!donorPhone.startsWith('254')) {
        showDonationResult('Please enter a valid M-Pesa number in format 2547XXXXXXXX', false);
        return;
    }
    
    if (amount < 1) {
        showDonationResult('Minimum donation amount is KES 1', false);
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        showDonationResult('🔄 Processing your donation... Please wait.', true, 'info');
        
        const response = await fetch(`${API_BASE}/donate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: donorPhone,
                amount: amount,
                customerName: donorName,
                message: donorMessage
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showDonationResult(`✅ ${result.data.checkoutMessage}<br>${result.data.thankYouMessage}`, true);
            
            // Start polling for donation status
            const reference = result.data.reference;
            pollDonationStatus(reference);
            
        } else {
            showDonationResult(`❌ ${result.error}`, false);
        }
        
    } catch (error) {
        showDonationResult(`❌ Network error: ${error.message}`, false);
    } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

async function pollDonationStatus(reference) {
    let attempts = 0;
    const maxAttempts = 30;
    
    const poll = async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_BASE}/check-payment/${reference}`);
            const result = await response.json();
            
            if (result.success && result.status === 'success') {
                showDonationResult(`🎉 Thank you for your donation! Your support means a lot to us.`, true);
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(poll, 10000);
            } else {
                showDonationResult('⏰ Donation check timeout. Thank you for your support!', true);
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

function showDonationResult(message, isSuccess, type = 'success') {
    donationResult.innerHTML = message;
    donationResult.className = `payment-result ${type}`;
    donationResult.style.display = 'block';
    donationResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Update the existing DOMContentLoaded function
document.addEventListener('DOMContentLoaded', function() {
    loadSubscriptionPlans();
    setupEventListeners();
    setupDonationEvents(); // Add this line
});
