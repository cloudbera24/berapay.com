require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Initialize PayHero Client
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// Enhanced Subscription plans data with categories
const subscriptionPlans = {
  'streaming': {
    category: 'Streaming Services',
    icon: 'fas fa-play-circle',
    color: '#FF6B6B',
    plans: {
      'netflix': { name: 'Netflix Premium', price: 220, duration: '1 Month', features: ['4K Ultra HD', '4 Screens', 'Unlimited Content'], popular: true },
      'spotify': { name: 'Spotify Premium', price: 180, duration: '1 Month', features: ['Ad-free Music', 'Offline Downloads', 'High Quality Audio'] },
      'showmax': { name: 'Showmax Pro', price: 150, duration: '1 Month', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'] },
      'primevideo': { name: 'Prime Video', price: 200, duration: '1 Month', features: ['4K Streaming', 'Amazon Originals', 'Offline Viewing'] },
      'hdopremium': { name: 'HDO Box Premium', price: 150, duration: '1 Month', features: ['No Ads', 'All Content Unlocked', 'HD Streaming'] }
    }
  },
  'security': {
    category: 'VPN & Security',
    icon: 'fas fa-shield-alt',
    color: '#4ECDC4',
    plans: {
      'expressvpn': { name: 'ExpressVPN', price: 150, duration: '1 Month', features: ['Lightning Fast', 'Secure Browsing', 'Global Servers'] },
      'nordvpn': { name: 'NordVPN', price: 250, duration: '1 Month', features: ['Military Encryption', '6 Devices', 'No Logs Policy'], popular: true },
      'surfshark': { name: 'Surfshark VPN', price: 300, duration: '1 Month', features: ['Unlimited Devices', 'CleanWeb', 'Whitelister'] }
    }
  },
  'productivity': {
    category: 'Productivity Tools',
    icon: 'fas fa-briefcase',
    color: '#45B7D1',
    plans: {
      'whatsappbot': { name: 'WhatsApp Bot', price: 60, duration: 'Lifetime', features: ['Auto Replies', 'Bulk Messaging', '24/7 Support'] },
      'unlimitedpanels': { name: 'Unlimited Panels', price: 100, duration: 'Lifetime', features: ['All Services', 'Auto Updates', 'Premium Support'] },
      'canvapro': { name: 'Canva Pro', price: 80, duration: '1 Month', features: ['Premium Templates', 'Background Remover', 'Magic Resize'] },
      'capcutpro': { name: 'CapCut Pro', price: 300, duration: '1 Month', features: ['Premium Effects', 'No Watermark', 'Cloud Storage'], popular: true }
    }
  }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  res.json({ success: true, categories: subscriptionPlans });
});

app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { planId, phoneNumber, customerName, email } = req.body;

    // Find plan in categories
    let plan = null;
    let categoryName = '';
    
    for (const [category, data] of Object.entries(subscriptionPlans)) {
      if (data.plans[planId]) {
        plan = data.plans[planId];
        categoryName = data.category;
        break;
      }
    }

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription plan'
      });
    }

    // Format phone number
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in format 2547XXXXXXXX (12 digits)'
      });
    }

    // Generate unique reference
    const reference = `BERA-${planId.toUpperCase()}-${Date.now()}`;

    // Initiate STK Push
    const stkPayload = {
      phone_number: formattedPhone,
      amount: plan.price,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'Bera Tech Customer'
    };

    console.log('🔄 Initiating payment for:', plan.name);
    const response = await client.stkPush(stkPayload);

    res.json({
      success: true,
      message: `Payment initiated for ${plan.name}`,
      data: {
        reference,
        plan: plan.name,
        category: categoryName,
        amount: plan.price,
        duration: plan.duration,
        checkoutMessage: `You will receive an M-Pesa prompt to pay KES ${plan.price} for ${plan.name}`
      }
    });

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment'
    });
  }
});

// Enhanced Donation Endpoint
app.post('/api/donate', async (req, res) => {
  try {
    const { phoneNumber, amount, customerName, message } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    // Format phone number
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in format 2547XXXXXXXX (12 digits)'
      });
    }

    // Validate amount
    const donationAmount = parseFloat(amount);
    if (donationAmount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Minimum donation amount is KES 1'
      });
    }

    if (donationAmount > 150000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum donation amount is KES 150,000'
      });
    }

    // Generate unique reference
    const reference = `DONATION-${Date.now()}`;

    // Initiate STK Push for donation
    const stkPayload = {
      phone_number: formattedPhone,
      amount: donationAmount,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'Bera Tech Supporter'
    };

    console.log('💝 Processing donation:', { amount: donationAmount, phone: formattedPhone });
    const response = await client.stkPush(stkPayload);

    res.json({
      success: true,
      message: `Donation of KES ${donationAmount} initiated successfully`,
      data: {
        reference,
        amount: donationAmount,
        checkoutMessage: `You will receive an M-Pesa prompt to donate KES ${donationAmount}`,
        thankYouMessage: 'Thank you for supporting Bera Tech! Your contribution helps us improve our services.',
        isDonation: true
      }
    });

  } catch (error) {
    console.error('❌ Donation initiation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process donation'
    });
  }
});

app.get('/api/check-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    const status = await client.transactionStatus(reference);
    
    if (status.status === 'success') {
      const isDonation = reference.startsWith('DONATION');
      let whatsappUrl = '';
      
      if (isDonation) {
        whatsappUrl = `https://wa.me/254743982206?text=Thank%20you%20for%20your%20donation%20${reference}!%20Your%20support%20means%20a%20lot.`;
      } else {
        whatsappUrl = `https://wa.me/254743982206?text=Payment%20Successful%20for%20${reference}.%20Please%20provide%20my%20account%20details.`;
      }
      
      return res.json({
        success: true,
        status: 'success',
        whatsappUrl: whatsappUrl,
        isDonation: isDonation,
        message: isDonation ? 
          'Donation confirmed! Thank you for your support.' : 
          'Payment confirmed! Redirecting to WhatsApp for account details...'
      });
    }
    
    res.json({
      success: true,
      status: status.status,
      message: `Payment status: ${status.status}`
    });
    
  } catch (error) {
    console.error('❌ Payment check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check payment status'
    });
  }
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const balance = await client.serviceWalletBalance();
    res.json({
      success: true,
      message: 'Bera Tech Premium Service is running optimally',
      data: {
        account_id: process.env.CHANNEL_ID,
        timestamp: new Date().toISOString(),
        status: 'operational',
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service experiencing connectivity issues',
      error: error.message
    });
  }
});

// Start server
app.listen(port, () => {
  console.log('🚀 Bera Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('🌐 URL: http://localhost:' + port);
  console.log('💝 Donation system: ACTIVE');
  console.log('🎯 Categories: Streaming, Security, Productivity');
});
