const { Pool } = require('pg');
require('dotenv').config();

const connectionString = (process.env.DATABASE_URL || '').trim();
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error', err);
});

module.exports = pool;
