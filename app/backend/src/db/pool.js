const { Pool } = require('pg');
require('dotenv').config();

const connectionString = (process.env.DATABASE_URL || '').trim();
const pool = new Pool({
  connectionString,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error', err);
});

module.exports = pool;
