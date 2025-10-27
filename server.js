require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// PayHero API configuration
const PAYHERO_CONFIG = {
  baseURL: 'https://api.payhero.co.ke',
  authToken: process.env.AUTH_TOKEN,
  channelId: process.env.CHANNEL_ID,
  defaultProvider: process.env.DEFAULT_PROVIDER || 'm-pesa'
};

// PayHero API functions
const payheroAPI = {
  async stkPush(phoneNumber, amount, reference, description) {
    try {
      const response = await fetch(`${PAYHERO_CONFIG.baseURL}/v1/stk/push`, {
        method: 'POST',
        headers: {
          'Authorization': PAYHERO_CONFIG.authToken,
          'Content-Type': 'application/json',
          'Channel-ID': PAYHERO_CONFIG.channelId
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          amount: amount,
          reference: reference,
          description: description,
          provider: PAYHERO_CONFIG.defaultProvider
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'STK Push failed');
      }

      return data;
    } catch (error) {
      throw new Error(`PayHero STK Push error: ${error.message}`);
    }
  },

  async b2cPayout(phoneNumber, amount, reference, description) {
    try {
      const response = await fetch(`${PAYHERO_CONFIG.baseURL}/v1/b2c/payout`, {
        method: 'POST',
        headers: {
          'Authorization': PAYHERO_CONFIG.authToken,
          'Content-Type': 'application/json',
          'Channel-ID': PAYHERO_CONFIG.channelId
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          amount: amount,
          reference: reference,
          description: description,
          provider: PAYHERO_CONFIG.defaultProvider
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'B2C Payout failed');
      }

      return data;
    } catch (error) {
      throw new Error(`PayHero B2C Payout error: ${error.message}`);
    }
  },

  async healthCheck() {
    try {
      const response = await fetch(`${PAYHERO_CONFIG.baseURL}/v1/health`, {
        method: 'GET',
        headers: {
          'Authorization': PAYHERO_CONFIG.authToken,
          'Channel-ID': PAYHERO_CONFIG.channelId
        }
      });

      return {
        status: response.ok ? 'connected' : 'disconnected',
        statusCode: response.status
      };
    } catch (error) {
      return {
        status: 'disconnected',
        error: error.message
      };
    }
  }
};

// Database setup
const db = new sqlite3.Database('bera_pay.db');

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'merchant',
    wallet_balance DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Transactions table
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    phone_number TEXT,
    amount DECIMAL(15,2) NOT NULL,
    status TEXT DEFAULT 'pending',
    reference TEXT UNIQUE,
    payhero_reference TEXT,
    description TEXT,
    commission_rate DECIMAL(5,2) DEFAULT 2.00,
    commission_amount DECIMAL(15,2) DEFAULT 0.00,
    net_amount DECIMAL(15,2) DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Commissions table
  db.run(`CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_reference TEXT,
    gross_amount DECIMAL(15,2) NOT NULL,
    net_amount DECIMAL(15,2) NOT NULL,
    commission_amount DECIMAL(15,2) NOT NULL,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Webhook logs table
  db.run(`CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create admin user if not exists
  const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  db.run(`INSERT OR IGNORE INTO users (name, email, password_hash, role, wallet_balance) 
          VALUES (?, ?, ?, ?, ?)`, 
    ['Admin User', process.env.ADMIN_EMAIL, adminPasswordHash, 'admin', 100000.00]);
});

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Utility functions
const generateReference = () => `BERA${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();

// Auth Routes
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    db.run(`INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
      [name, email, passwordHash],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: 'Registration failed' });
        }

        const token = jwt.sign(
          { id: this.lastID, email, role: 'merchant' },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.json({ 
          message: 'Registration successful', 
          token,
          user: { id: this.lastID, name, email, role: 'merchant', wallet_balance: 0.00 }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(`SELECT * FROM users WHERE email = ? AND is_active = 1`, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        wallet_balance: user.wallet_balance
      }
    });
  });
});

// Payment Routes
app.post('/api/stk-push', authenticateToken, async (req, res) => {
  try {
    const { phone_number, amount, description } = req.body;
    const userId = req.user.id;

    if (!phone_number || !amount) {
      return res.status(400).json({ error: 'Phone number and amount are required' });
    }

    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const commissionRate = 2.00; // 2%
    const commissionAmount = (numericAmount * commissionRate) / 100;
    const netAmount = numericAmount - commissionAmount;

    const reference = generateReference();

    // Store transaction in database
    db.run(`INSERT INTO transactions (user_id, type, phone_number, amount, status, reference, description, commission_rate, commission_amount, net_amount) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'C2B', phone_number, numericAmount, 'initiated', reference, description, commissionRate, commissionAmount, netAmount],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create transaction' });
        }

        // Initiate PayHero STK Push
        payheroAPI.stkPush(phone_number, numericAmount, reference, description || 'Payment via Bera Pay')
        .then(response => {
          // Update transaction with PayHero reference
          db.run(`UPDATE transactions SET payhero_reference = ?, status = ? WHERE reference = ?`,
            [response.reference, 'pending', reference]);

          res.json({
            message: 'STK Push initiated',
            reference: reference,
            payhero_reference: response.reference,
            status: 'pending'
          });
        })
        .catch(error => {
          // Update transaction status to failed
          db.run(`UPDATE transactions SET status = ? WHERE reference = ?`, ['failed', reference]);
          res.status(500).json({ error: error.message });
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error during STK Push' });
  }
});

app.post('/api/payout/b2c', authenticateToken, (req, res) => {
  try {
    const { phone_number, amount, description } = req.body;
    const userId = req.user.id;

    if (!phone_number || !amount) {
      return res.status(400).json({ error: 'Phone number and amount are required' });
    }

    const numericAmount = parseFloat(amount);
    
    // Check if user has sufficient balance
    db.get(`SELECT wallet_balance FROM users WHERE id = ?`, [userId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (user.wallet_balance < numericAmount) {
        return res.status(400).json({ error: 'Insufficient wallet balance' });
      }

      const reference = generateReference();

      // Store transaction
      db.run(`INSERT INTO transactions (user_id, type, phone_number, amount, status, reference, description) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, 'B2C', phone_number, numericAmount, 'initiated', reference, description],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create transaction' });
          }

          // Initiate B2C payout via PayHero
          payheroAPI.b2cPayout(phone_number, numericAmount, reference, description || 'Payout via Bera Pay')
          .then(response => {
            // Deduct from user's wallet immediately
            db.run(`UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?`, 
              [numericAmount, userId]);

            db.run(`UPDATE transactions SET payhero_reference = ?, status = ? WHERE reference = ?`,
              [response.reference, 'pending', reference]);

            res.json({
              message: 'B2C payout initiated',
              reference: reference,
              payhero_reference: response.reference,
              status: 'pending'
            });
          })
          .catch(error => {
            db.run(`UPDATE transactions SET status = ? WHERE reference = ?`, ['failed', reference]);
            res.status(500).json({ error: error.message });
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during B2C payout' });
  }
});

app.post('/api/transfer/b2b', authenticateToken, (req, res) => {
  try {
    const { recipient_email, amount, description } = req.body;
    const senderId = req.user.id;

    if (!recipient_email || !amount) {
      return res.status(400).json({ error: 'Recipient email and amount are required' });
    }

    const numericAmount = parseFloat(amount);
    
    if (recipient_email === req.user.email) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // Check sender balance
    db.get(`SELECT wallet_balance FROM users WHERE id = ?`, [senderId], (err, sender) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (sender.wallet_balance < numericAmount) {
        return res.status(400).json({ error: 'Insufficient wallet balance' });
      }

      // Find recipient
      db.get(`SELECT id, name FROM users WHERE email = ? AND is_active = 1`, [recipient_email], (err, recipient) => {
        if (err || !recipient) {
          return res.status(404).json({ error: 'Recipient not found' });
        }

        const reference = generateReference();

        // Perform transfer within transaction
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');

          // Deduct from sender
          db.run(`UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?`, [numericAmount, senderId]);
          
          // Add to recipient
          db.run(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`, [numericAmount, recipient.id]);
          
          // Record transaction
          db.run(`INSERT INTO transactions (user_id, type, amount, status, reference, description) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            [senderId, 'B2B', numericAmount, 'completed', reference, 
             `Transfer to ${recipient.name} - ${description || ''}`]);

          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Transfer failed' });
            }

            res.json({
              message: 'Transfer completed successfully',
              reference: reference,
              amount: numericAmount,
              recipient: recipient.name
            });
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during transfer' });
  }
});

// Webhook endpoint for PayHero callbacks
app.post('/api/webhook', (req, res) => {
  const payload = req.body;
  
  // Log webhook payload
  db.run(`INSERT INTO webhook_logs (payload) VALUES (?)`, [JSON.stringify(payload)], function(err) {
    if (err) {
      console.error('Failed to log webhook:', err);
    }
  });

  // Process webhook based on PayHero documentation
  if (payload.reference && payload.status) {
    // Update transaction status
    db.run(`UPDATE transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE payhero_reference = ?`,
      [payload.status, payload.reference],
      function(err) {
        if (err) {
          console.error('Failed to update transaction:', err);
        }

        // If payment is successful and it's a C2B transaction, update user wallet
        if (payload.status === 'success' || payload.status === 'completed') {
          db.get(`SELECT user_id, net_amount, type FROM transactions WHERE payhero_reference = ?`, 
            [payload.reference], (err, transaction) => {
              if (!err && transaction && transaction.type === 'C2B') {
                db.run(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
                  [transaction.net_amount, transaction.user_id]);

                // Record commission
                db.get(`SELECT amount, commission_amount FROM transactions WHERE payhero_reference = ?`,
                  [payload.reference], (err, trans) => {
                    if (!err && trans) {
                      db.run(`INSERT INTO commissions (transaction_reference, gross_amount, net_amount, commission_amount, user_id) 
                              VALUES (?, ?, ?, ?, ?)`,
                        [payload.reference, trans.amount, trans.net_amount, trans.commission_amount, transaction.user_id]);
                    }
                  });
              }
            });
        }
      });
  }

  res.status(200).json({ received: true });
});

// Transaction status check
app.get('/api/transaction-status/:ref', authenticateToken, (req, res) => {
  const reference = req.params.ref;

  db.get(`SELECT * FROM transactions WHERE reference = ? AND user_id = ?`, 
    [reference, req.user.id], (err, transaction) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json({ transaction });
    });
});

// Commission total
app.get('/api/commission-total', authenticateToken, (req, res) => {
  const query = req.user.role === 'admin' 
    ? `SELECT SUM(commission_amount) as total FROM commissions`
    : `SELECT SUM(commission_amount) as total FROM commissions WHERE user_id = ?`;

  const params = req.user.role === 'admin' ? [] : [req.user.id];

  db.get(query, params, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ total_commissions: result.total || 0 });
  });
});

// Admin routes
app.get('/api/admin/transactions', authenticateToken, isAdmin, (req, res) => {
  const { page = 1, limit = 50, search = '' } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT t.*, u.name as user_name, u.email as user_email 
    FROM transactions t 
    LEFT JOIN users u ON t.user_id = u.id 
  `;
  let countQuery = `SELECT COUNT(*) as total FROM transactions t LEFT JOIN users u ON t.user_id = u.id `;
  let params = [];

  if (search) {
    query += ` WHERE t.reference LIKE ? OR t.phone_number LIKE ? OR u.name LIKE ? OR u.email LIKE ? `;
    countQuery += ` WHERE t.reference LIKE ? OR t.phone_number LIKE ? OR u.name LIKE ? OR u.email LIKE ? `;
    const searchParam = `%${search}%`;
    params = [searchParam, searchParam, searchParam, searchParam];
  }

  query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ? `;
  params.push(parseInt(limit), parseInt(offset));

  db.get(countQuery, params.slice(0, search ? 4 : 0), (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    db.all(query, params, (err, transactions) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        transactions,
        total: countResult.total,
        page: parseInt(page),
        totalPages: Math.ceil(countResult.total / limit)
      });
    });
  });
});

app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
  db.all(`SELECT id, name, email, role, wallet_balance, is_active, created_at FROM users ORDER BY created_at DESC`, 
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ users });
    });
});

app.put('/api/admin/users/:id/toggle', authenticateToken, isAdmin, (req, res) => {
  const userId = req.params.id;

  db.run(`UPDATE users SET is_active = NOT is_active WHERE id = ? AND role != 'admin'`, 
    [userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found or cannot modify admin' });
      }

      res.json({ message: 'User status updated successfully' });
    });
});

app.post('/api/admin/wallet/topup', authenticateToken, isAdmin, (req, res) => {
  const { user_id, amount, description } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ error: 'User ID and amount are required' });
  }

  const numericAmount = parseFloat(amount);

  db.run(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
    [numericAmount, user_id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Record the adjustment
      const reference = generateReference();
      db.run(`INSERT INTO transactions (user_id, type, amount, status, reference, description) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, 'ADJUSTMENT', numericAmount, 'completed', reference, 
         `Admin top-up: ${description || 'No description'}`]);

      res.json({ message: 'Wallet top-up successful', new_balance: 'Updated' });
    });
});

// Export CSV
app.get('/api/admin/export/transactions', authenticateToken, isAdmin, (req, res) => {
  const { start_date, end_date } = req.query;

  let query = `
    SELECT t.reference, t.type, t.phone_number, t.amount, t.status, 
           t.commission_amount, t.net_amount, u.name as user_name, u.email,
           t.created_at, t.updated_at
    FROM transactions t 
    LEFT JOIN users u ON t.user_id = u.id 
  `;
  let params = [];

  if (start_date && end_date) {
    query += ` WHERE DATE(t.created_at) BETWEEN DATE(?) AND DATE(?) `;
    params.push(start_date, end_date);
  }

  query += ` ORDER BY t.created_at DESC`;

  db.all(query, params, (err, transactions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Convert to CSV
    const headers = ['Reference', 'Type', 'Phone', 'Amount', 'Status', 'Commission', 'Net Amount', 'User', 'Email', 'Created At', 'Updated At'];
    let csv = headers.join(',') + '\n';

    transactions.forEach(trans => {
      const row = [
        trans.reference,
        trans.type,
        trans.phone_number || '',
        trans.amount,
        trans.status,
        trans.commission_amount,
        trans.net_amount,
        trans.user_name,
        trans.email,
        trans.created_at,
        trans.updated_at
      ].map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(',');
      
      csv += row + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    res.send(csv);
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Test PayHero connection
    const health = await payheroAPI.healthCheck();
    
    // Test database connection
    db.get('SELECT 1 as test', (err) => {
      const dbStatus = err ? 'unhealthy' : 'healthy';
      
      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        payhero: health.status || 'connected',
        database: dbStatus,
        uptime: process.uptime()
      });
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      payhero: 'disconnected',
      database: 'unknown',
      uptime: process.uptime(),
      error: error.message
    });
  }
});

// User dashboard data
app.get('/api/dashboard', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const isAdminUser = req.user.role === 'admin';

  const queries = {
    wallet_balance: `SELECT wallet_balance FROM users WHERE id = ?`,
    total_transactions: `SELECT COUNT(*) as count FROM transactions WHERE user_id = ?`,
    successful_transactions: `SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND status = 'completed'`,
    total_volume: `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND status = 'completed'`,
    recent_transactions: `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`
  };

  if (isAdminUser) {
    queries.wallet_balance = `SELECT SUM(wallet_balance) as wallet_balance FROM users WHERE role = 'merchant'`;
    queries.total_transactions = `SELECT COUNT(*) as count FROM transactions`;
    queries.successful_transactions = `SELECT COUNT(*) as count FROM transactions WHERE status = 'completed'`;
    queries.total_volume = `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE status = 'completed'`;
    queries.recent_transactions = `SELECT t.*, u.name as user_name FROM transactions t 
                                  LEFT JOIN users u ON t.user_id = u.id 
                                  ORDER BY t.created_at DESC LIMIT 10`;
  }

  db.get(queries.wallet_balance, isAdminUser ? [] : [userId], (err, balance) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    db.get(queries.total_transactions, isAdminUser ? [] : [userId], (err, totalTrans) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      db.get(queries.successful_transactions, isAdminUser ? [] : [userId], (err, successTrans) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        db.get(queries.total_volume, isAdminUser ? [] : [userId], (err, volume) => {
          if (err) return res.status(500).json({ error: 'Database error' });

          db.all(queries.recent_transactions, isAdminUser ? [] : [userId], (err, recent) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            res.json({
              wallet_balance: balance.wallet_balance || 0,
              total_transactions: totalTrans.count || 0,
              successful_transactions: successTrans.count || 0,
              total_volume: volume.total || 0,
              recent_transactions: recent || []
            });
          });
        });
      });
    });
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Bera Pay server running on port ${PORT}`);
  console.log(`PayHero configured with channel: ${PAYHERO_CONFIG.channelId}`);
});
