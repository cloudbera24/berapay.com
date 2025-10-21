require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'bera-pay-secret-key-change-in-production';

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

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bera-pay';
let db;

async function initDB() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    console.log('✅ Connected to MongoDB successfully');

    // Create indexes
    await db.collection('developers').createIndex({ email: 1 }, { unique: true });
    await db.collection('developers').createIndex({ api_key: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ reference: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ developer_id: 1 });
    await db.collection('payouts').createIndex({ reference: 1 }, { unique: true });
    await db.collection('payouts').createIndex({ developer_id: 1 });

    console.log('✅ Database indexes created');

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    // For development, create a simple in-memory fallback
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Using in-memory storage for development');
      await setupInMemoryDB();
    } else {
      console.error('💥 Critical: Database connection required for production');
      process.exit(1);
    }
  }
}

// Simple in-memory database for development fallback
let inMemoryDB = {
  developers: [],
  transactions: [],
  payouts: [],
  nextIds: { developers: 1, transactions: 1, payouts: 1 }
};

async function setupInMemoryDB() {
  console.log('💾 Using in-memory database (data will reset on server restart)');
  
  // Mock MongoDB-like interface
  db = {
    collection: (name) => {
      return {
        findOne: async (query) => {
          const collection = inMemoryDB[name];
          return collection.find(item => {
            for (const key in query) {
              if (item[key] !== query[key]) return false;
            }
            return true;
          });
        },
        find: (query) => {
          const collection = inMemoryDB[name];
          let results = collection;
          
          if (query) {
            results = collection.filter(item => {
              for (const key in query) {
                if (item[key] !== query[key]) return false;
              }
              return true;
            });
          }
          
          return {
            sort: (sort) => {
              results.sort((a, b) => {
                for (const key in sort) {
                  if (a[key] < b[key]) return -1 * sort[key];
                  if (a[key] > b[key]) return 1 * sort[key];
                }
                return 0;
              });
              return this;
            },
            limit: (limit) => {
              results = results.slice(0, limit);
              return this;
            },
            toArray: async () => results
          };
        },
        insertOne: async (doc) => {
          const collection = inMemoryDB[name];
          const newDoc = { _id: inMemoryDB.nextIds[name]++, ...doc, createdAt: new Date() };
          collection.push(newDoc);
          return { insertedId: newDoc._id };
        },
        updateOne: async (filter, update) => {
          const collection = inMemoryDB[name];
          const item = collection.find(item => {
            for (const key in filter) {
              if (item[key] !== filter[key]) return false;
            }
            return true;
          });
          
          if (item && update.$set) {
            Object.assign(item, update.$set, { updatedAt: new Date() });
            return { modifiedCount: 1 };
          }
          return { modifiedCount: 0 };
        },
        createIndex: async () => true // Mock index creation
      };
    }
  };
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
    const developer = await db.collection('developers').findOne({ api_key: apiKey });
    
    if (!developer) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    
    req.developer = developer;
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

    const result = await db.collection('developers').insertOne({
      name,
      email,
      phone,
      password: hashedPassword,
      api_key: apiKey,
      commission_rate: 0.02,
      balance: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const token = jwt.sign({ developerId: result.insertedId.toString() }, JWT_SECRET);

    res.json({
      success: true,
      message: 'Developer registered successfully',
      data: {
        developer_id: result.insertedId,
        api_key: apiKey,
        token: token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
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

    const developer = await db.collection('developers').findOne({ email });

    if (!developer) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const isValidPassword = await bcrypt.compare(password, developer.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const token = jwt.sign({ developerId: developer._id.toString() }, JWT_SECRET);

    // Remove password from response
    const { password: _, ...developerWithoutPassword } = developer;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        developer: developerWithoutPassword,
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
    const transactionResult = await db.collection('transactions').insertOne({
      developer_id: developer._id,
      amount: amountNum,
      commission: commission,
      net_amount: netAmount,
      reference: transactionRef,
      phone_number: formattedPhone,
      status: 'pending',
      createdAt: new Date()
    });

    // Initiate REAL STK Push
    const stkPayload = {
      phone_number: formattedPhone,
      amount: amountNum,
      provider: process.env.DEFAULT_PROVIDER || 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: transactionRef,
      customer_name: 'Customer'
    };

    console.log('🔄 Initiating REAL STK Push for developer:', developer._id, stkPayload);
    
    const response = await client.stkPush(stkPayload);
    
    console.log('✅ STK Push Response:', response);

    // Update transaction with PayHero reference
    await db.collection('transactions').updateOne(
      { _id: transactionResult.insertedId },
      { 
        $set: { 
          payhero_reference: response.reference, 
          status: 'initiated',
          updatedAt: new Date()
        } 
      }
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
        await db.collection('transactions').updateOne(
          { reference: req.body.reference },
          { 
            $set: { 
              status: 'failed',
              updatedAt: new Date()
            } 
          }
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
    const transaction = await db.collection('transactions').findOne({ 
      reference: reference,
      developer_id: developer._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // If we have PayHero reference, check actual status
    if (transaction.payhero_reference) {
      try {
        console.log('🔄 Checking REAL transaction status:', transaction.payhero_reference);
        const payheroStatus = await client.transactionStatus(transaction.payhero_reference);
        console.log('✅ Status Response:', payheroStatus);
        
        // Update transaction status based on PayHero response
        if (payheroStatus.status !== transaction.status) {
          await db.collection('transactions').updateOne(
            { _id: transaction._id },
            { 
              $set: { 
                status: payheroStatus.status,
                updatedAt: new Date()
              } 
            }
          );

          // If payment is successful, update developer balance
          if (payheroStatus.status === 'completed' && transaction.status !== 'completed') {
            await db.collection('developers').updateOne(
              { _id: developer._id },
              { 
                $inc: { balance: transaction.net_amount },
                $set: { updatedAt: new Date() }
              }
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
    const payoutResult = await db.collection('payouts').insertOne({
      developer_id: developer._id,
      amount: amountNum,
      phone: formattedPhone,
      reference: payoutRef,
      status: 'pending',
      createdAt: new Date()
    });

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
    await db.collection('payouts').updateOne(
      { _id: payoutResult.insertedId },
      { 
        $set: { 
          payhero_reference: response.reference, 
          status: 'processed',
          updatedAt: new Date()
        } 
      }
    );

    // Deduct from developer balance
    await db.collection('developers').updateOne(
      { _id: developer._id },
      { 
        $inc: { balance: -amountNum },
        $set: { updatedAt: new Date() }
      }
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
    const transactions = await db.collection('transactions')
      .find({ developer_id: developer._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Get recent payouts
    const payouts = await db.collection('payouts')
      .find({ developer_id: developer._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Calculate stats
    const completedTransactions = await db.collection('transactions')
      .find({ 
        developer_id: developer._id, 
        status: 'completed' 
      })
      .toArray();

    const stats = {
      total_transactions: completedTransactions.length,
      total_volume: completedTransactions.reduce((sum, tx) => sum + tx.amount, 0),
      total_commission: completedTransactions.reduce((sum, tx) => sum + tx.commission, 0)
    };

    // Remove password from developer object
    const { password: _, ...developerWithoutPassword } = developer;

    res.json({
      success: true,
      data: {
        developer: developerWithoutPassword,
        stats: stats,
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
    await db.collection('developers').findOne({});
    
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
    console.log('🚀 BERA PAY - Complete Payment Gateway (MongoDB)');
    console.log('📍 Server running on port:', port);
    console.log('🗄️ Database:', process.env.MONGODB_URI ? 'MongoDB Atlas' : 'Local MongoDB');
    console.log('🔑 Account ID:', process.env.CHANNEL_ID);
    console.log('💳 Commission Model: Tiered (6, 24, 48, 5%)');
    console.log('🌐 Access: http://localhost:' + port);
    console.log('📊 Dashboard: http://localhost:' + port + '/dashboard');
    console.log('📚 Docs: http://localhost:' + port + '/docs');
    console.log('❤️  Health: http://localhost:' + port + '/api/health');
  });
}

startServer().catch(console.error);
