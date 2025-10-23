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
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Initialize PayHero Client
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// Subscription plans data
const subscriptionPlans = {
  'netflix': { name: 'Netflix Premium', price: 220, duration: '1 Month', features: ['4K Ultra HD', '4 Screens Simultaneous', 'Unlimited Movies & TV Shows'] },
  'spotify': { name: 'Spotify Premium', price: 180, duration: '1 Month', features: ['Ad-free Music', 'Download Songs', 'High Quality Audio'] },
  'showmax': { name: 'Showmax Pro', price: 150, duration: '1 Month', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'] },
  'primevideo': { name: 'Prime Video', price: 200, duration: '1 Month', features: ['4K Streaming', 'Amazon Originals', 'Offline Viewing'] },
  'expressvpn': { name: 'ExpressVPN', price: 150, duration: '1 Month', features: ['Lightning Fast', 'Secure Browsing', 'Global Servers'] },
  'nordvpn': { name: 'NordVPN', price: 250, duration: '1 Month', features: ['Military Grade Encryption', '6 Devices', 'No Logs Policy'] },
  'surfshark': { name: 'Surfshark VPN', price: 300, duration: '1 Month', features: ['Unlimited Devices', 'CleanWeb', 'Whitelister'] },
  'whatsappbot': { name: 'WhatsApp Bot', price: 60, duration: 'Lifetime', features: ['Auto Replies', 'Bulk Messaging', '24/7 Support'] },
  'hdopremium': { name: 'HDO Box Premium', price: 150, duration: '1 Month', features: ['No Ads', 'All Content Unlocked', 'HD Streaming'] },
  'unlimitedpanels': { name: 'Unlimited Panels', price: 100, duration: 'Lifetime', features: ['All Services', 'Automatic Updates', 'Premium Support'] },
  'canvapro': { name: 'Canva Pro', price: 80, duration: '1 Month', features: ['Premium Templates', 'Background Remover', 'Magic Resize'] },
  'capcutpro': { name: 'CapCut Pro', price: 300, duration: '1 Month', features: ['Premium Effects', 'No Watermark', 'Cloud Storage'] }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  res.json({ success: true, plans: subscriptionPlans });
});

app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { planId, phoneNumber, customerName, email } = req.body;

    if (!subscriptionPlans[planId]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription plan'
      });
    }

    const plan = subscriptionPlans[planId];
    
    // Format phone number
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (!formattedPhone.startsWith('254')) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in format 2547XXXXXXXX'
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
    
    // Store transaction details (in production, use a database)
    const transaction = {
      reference,
      planId,
      planName: plan.name,
      amount: plan.price,
      customerName,
      email,
      phone: formattedPhone,
      status: 'initiated',
      timestamp: new Date()
    };

    res.json({
      success: true,
      message: `Payment initiated for ${plan.name}`,
      data: {
        reference,
        plan: plan.name,
        amount: plan.price,
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

app.get('/api/check-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    const status = await client.transactionStatus(reference);
    
    if (status.status === 'success') {
      // Payment successful - redirect to WhatsApp
      const whatsappUrl = `https://wa.me/254743982206?text=Payment%20Successful%20for%20${reference}.%20Please%20provide%20my%20account%20details.`;
      
      return res.json({
        success: true,
        status: 'success',
        whatsappUrl: whatsappUrl,
        message: 'Payment confirmed! Redirecting to WhatsApp for account details...'
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

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const balance = await client.serviceWalletBalance();
    res.json({
      success: true,
      message: 'Bera Tech Subscription Service is running',
      account_id: process.env.CHANNEL_ID,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Service running but PayHero connection failed',
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log('🚀 Bera Tech Subscription Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('🌐 URL: http://localhost:' + port);
});
