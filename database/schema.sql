-- BERA PAY Database Schema

CREATE DATABASE IF NOT EXISTS bera_pay;
USE bera_pay;

CREATE TABLE developers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  api_key VARCHAR(255) UNIQUE,
  commission_rate FLOAT DEFAULT 0.02,
  balance FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  developer_id INT,
  amount FLOAT NOT NULL,
  commission FLOAT NOT NULL,
  net_amount FLOAT NOT NULL,
  reference VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20),
  status VARCHAR(50) DEFAULT 'pending',
  payhero_reference VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
);

CREATE TABLE payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  developer_id INT,
  amount FLOAT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  reference VARCHAR(255) UNIQUE NOT NULL,
  payhero_reference VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_developer_id ON transactions(developer_id);
CREATE INDEX idx_payouts_reference ON payouts(reference);
CREATE INDEX idx_payouts_developer_id ON payouts(developer_id);
CREATE INDEX idx_developers_api_key ON developers(api_key);
