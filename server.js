require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'bera-pay-secret-key';

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/api/', apiLimiter);

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bera_pay'
};

let db;

async function initDB() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// Initialize PayHero Client
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// Utility functions
function generateApiKey() {
  return 'bera_' + require('crypto').randomBytes(32).toString('hex');
}

function calculateCommission(amount) {
  if (amount <= 100) return 6;
  if (amount <= 500) return 24;
  if (amount <= 1000) return 48;
  return amount * 0.05;
}

function formatPhoneNumber(phone) {
  let formatted = phone.trim();
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  } else if (formatted.startsWith('+')) {
    formatted = formatted.substring(1);
  }
  return formatted;
}

// Authentication middleware
async function authenticateDeveloper(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'API key required' });
  }

  const apiKey = authHeader.substring(7);
  
  try {
    const [developers] = await db.execute(
      'SELECT * FROM developers WHERE api_key = ?',
      [apiKey]
    );
    
    if (developers.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    
    req.developer = developers[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

// Routes

// Developer Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, phone, and password are required'
      });
    }

    const apiKey = generateApiKey();
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      'INSERT INTO developers (name, email, phone, api_key) VALUES (?, ?, ?, ?)',
      [name, email, phone, apiKey]
    );

    const token = jwt.sign({ developerId: result.insertId }, JWT_SECRET);

    res.json({
      success: true,
      message: 'Developer registered successfully',
      data: {
        developer_id: result.insertId,
        api_key: apiKey,
        token: token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Developer Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const [developers] = await db.execute(
      'SELECT * FROM developers WHERE email = ?',
      [email]
    );

    if (developers.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const developer = developers[0];
    const isValidPassword = await bcrypt.compare(password, developer.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const token = jwt.sign({ developerId: developer.id }, JWT_SECRET);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        developer: {
          id: developer.id,
          name: developer.name,
          email: developer.email,
          phone: developer.phone,
          balance: developer.balance,
          api_key: developer.api_key
        },
        token: token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// STK Push Endpoint
app.post('/api/stk-push', authenticateDeveloper, async (req, res) => {
  try {
    const { phone_number, amount, reference } = req.body;
    const developer = req.developer;

    // Validation
    if (!phone_number || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    const formattedPhone = formatPhoneNumber(phone_number);
    
    if (!formattedPhone.startsWith('254')) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in format 2547XXXXXXXX'
      });
    }

    const amountNum = parseFloat(amount);
    if (amountNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least 1 KES'
      });
    }

    // Calculate commission
    const commission = calculateCommission(amountNum);
    const netAmount = amountNum - commission;

    // Generate unique reference if not provided
    const transactionRef = reference || `BERA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store transaction in database
    const [transactionResult] = await db.execute(
      'INSERT INTO transactions (developer_id, amount, commission, net_amount, reference, phone_number, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [developer.id, amountNum, commission, netAmount, transactionRef, formattedPhone, 'pending']
    );

    // Initiate REAL STK Push
    const stkPayload = {
      phone_number: formattedPhone,
      amount: amountNum,
      provider: process.env.DEFAULT_PROVIDER || 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: transactionRef,
      customer_name: 'Customer'
    };

    console.log('🔄 Initiating REAL STK Push for developer:', developer.id, stkPayload);
    
    const response = await client.stkPush(stkPayload);
    
    console.log('✅ STK Push Response:', response);

    // Update transaction with PayHero reference
    await db.execute(
      'UPDATE transactions SET payhero_reference = ?, status = ? WHERE id = ?',
      [response.reference, 'initiated', transactionResult.insertId]
    );

    res.json({
      success: true,
      message: 'STK push initiated successfully',
      data: {
        reference: transactionRef,
        payhero_reference: response.reference,
        amount: amountNum,
        commission: commission,
        net_amount: netAmount
      }
    });

  } catch (error) {
    console.error('❌ STK Push Error:', error);
    
    // Update transaction status to failed
    if (req.body.reference) {
      try {
        await db.execute(
          'UPDATE transactions SET status = ? WHERE reference = ?',
          ['failed', req.body.reference]
        );
      } catch (dbError) {
        console.error('Failed to update transaction status:', dbError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate STK push'
    });
  }
});

// Transaction Status Endpoint
app.get('/api/transaction-status/:reference', authenticateDeveloper, async (req, res) => {
  try {
    const { reference } = req.params;
    const developer = req.developer;
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Transaction reference is required'
      });
    }

    // Get transaction from database
    const [transactions] = await db.execute(
      'SELECT * FROM transactions WHERE reference = ? AND developer_id = ?',
      [reference, developer.id]
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const transaction = transactions[0];

    // If we have PayHero reference, check actual status
    if (transaction.payhero_reference) {
      try {
        console.log('🔄 Checking REAL transaction status:', transaction.payhero_reference);
        const payheroStatus = await client.transactionStatus(transaction.payhero_reference);
        console.log('✅ Status Response:', payheroStatus);
        
        // Update transaction status based on PayHero response
        if (payheroStatus.status !== transaction.status) {
          await db.execute(
            'UPDATE transactions SET status = ? WHERE id = ?',
            [payheroStatus.status, transaction.id]
          );

          // If payment is successful, update developer balance
          if (payheroStatus.status === 'completed' && transaction.status !== 'completed') {
            await db.execute(
              'UPDATE developers SET balance = balance + ? WHERE id = ?',
              [transaction.net_amount, developer.id]
            );
          }
          
          transaction.status = payheroStatus.status;
        }
        
        transaction.payhero_data = payheroStatus;
      } catch (statusError) {
        console.error('❌ Status check error:', statusError);
        // Continue with database status if PayHero check fails
      }
    }

    res.json({
      success: true,
      data: transaction
    });

  } catch (error) {
    console.error('❌ Transaction Status Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transaction status'
    });
  }
});

// B2C Payout Endpoint
app.post('/api/b2c-payout', authenticateDeveloper, async (req, res) => {
  try {
    const { phone_number, amount } = req.body;
    const developer = req.developer;

    if (!phone_number || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    const formattedPhone = formatPhoneNumber(phone_number);
    const amountNum = parseFloat(amount);

    if (amountNum > developer.balance) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance'
      });
    }

    if (amountNum < 10) {
      return res.status(400).json({
        success: false,
        error: 'Minimum payout amount is 10 KES'
      });
    }

    // Generate payout reference
    const payoutRef = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create payout record
    const [payoutResult] = await db.execute(
      'INSERT INTO payouts (developer_id, amount, phone, reference) VALUES (?, ?, ?, ?)',
      [developer.id, amountNum, formattedPhone, payoutRef]
    );

    // Initiate B2C payout via PayHero
    const payoutPayload = {
      phone_number: formattedPhone,
      amount: amountNum,
      channel_id: process.env.CHANNEL_ID,
      external_reference: payoutRef,
      recipient_name: developer.name
    };

    console.log('🔄 Initiating B2C Payout:', payoutPayload);
    
    const response = await client.b2cPayout(payoutPayload);
    
    console.log('✅ B2C Payout Response:', response);

    // Update payout record
    await db.execute(
      'UPDATE payouts SET payhero_reference = ?, status = ? WHERE id = ?',
      [response.reference, 'processed', payoutResult.insertId]
    );

    // Deduct from developer balance
    await db.execute(
      'UPDATE developers SET balance = balance - ? WHERE id = ?',
      [amountNum, developer.id]
    );

    res.json({
      success: true,
      message: 'Payout initiated successfully',
      data: {
        reference: payoutRef,
        payhero_reference: response.reference,
        amount: amountNum
      }
    });

  } catch (error) {
    console.error('❌ B2C Payout Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payout'
    });
  }
});

// Developer Dashboard Data
app.get('/api/dashboard', authenticateDeveloper, async (req, res) => {
  try {
    const developer = req.developer;

    // Get recent transactions
    const [transactions] = await db.execute(
      'SELECT * FROM transactions WHERE developer_id = ? ORDER BY created_at DESC LIMIT 10',
      [developer.id]
    );

    // Get recent payouts
    const [payouts] = await db.execute(
      'SELECT * FROM payouts WHERE developer_id = ? ORDER BY created_at DESC LIMIT 10',
      [developer.id]
    );

    // Calculate stats
    const [totalResult] = await db.execute(
      'SELECT COUNT(*) as total_tx, SUM(amount) as total_volume, SUM(commission) as total_commission FROM transactions WHERE developer_id = ? AND status = "completed"',
      [developer.id]
    );

    res.json({
      success: true,
      data: {
        developer: {
          id: developer.id,
          name: developer.name,
          email: developer.email,
          phone: developer.phone,
          balance: developer.balance,
          api_key: developer.api_key
        },
        stats: {
          total_transactions: totalResult[0].total_tx || 0,
          total_volume: totalResult[0].total_volume || 0,
          total_commission: totalResult[0].total_commission || 0
        },
        recent_transactions: transactions,
        recent_payouts: payouts
      }
    });

  } catch (error) {
    console.error('❌ Dashboard Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get dashboard data'
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await db.execute('SELECT 1');
    
    // Test PayHero connection
    const balance = await client.serviceWalletBalance();
    
    res.json({
      success: true,
      message: 'BERA PAY Gateway is running',
      services: {
        database: 'connected',
        payhero: 'connected'
      },
      account_id: process.env.CHANNEL_ID,
      timestamp: new Date().toISOString(),
      balance: balance
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Gateway running but some services are down',
      error: error.message
    });
  }
});

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/docs', (req, res) => {
  res.sendFile(__dirname + '/public/docs.html');
});

// Initialize and start server
async function startServer() {
  await initDB();
  
  app.listen(port, () => {
    console.log('🚀 BERA PAY - Complete Payment Gateway');
    console.log('📍 Server running on port:', port);
    console.log('🔑 Account ID:', process.env.CHANNEL_ID);
    console.log('💳 Commission Model: Tiered (6, 24, 48, 5%)');
    console.log('🌐 Access: http://localhost:' + port);
    console.log('📊 Dashboard: http://localhost:' + port + '/dashboard');
    console.log('📚 Docs: http://localhost:' + port + '/docs');
    console.log('❤️  Health: http://localhost:' + port + '/api/health');
  });
}

startServer().catch(console.error);
