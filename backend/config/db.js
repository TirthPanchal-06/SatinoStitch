const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error on client:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log('[SQL]', { text, duration, rows: res.rowCount });
  }
  return res;
}

async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT current_database(), current_user, NOW() as time, version();');
    client.release();
    return {
      success: true,
      database: res.rows[0].current_database,
      user: res.rows[0].current_user,
      time: res.rows[0].time,
      version: res.rows[0].version
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  pool,
  query,
  testConnection
};

