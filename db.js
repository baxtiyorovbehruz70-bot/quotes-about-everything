'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { makeKey } = require('./lib/parse');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000 // Neon can take a moment to wake up from sleep
});

pool.on('error', (err) => console.error('Idle database client error:', err.message));

const query = (text, params) => pool.query(text, params);

/* Creates the table and, on the very first run, fills it with the starter quotes. */
async function init() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add your Neon connection string (see README.md).');
  }

  await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));

  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM quotes');
  if (Number(rows[0].n) > 0) return;

  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'quotes.json'), 'utf8'));
  const values = [];
  const placeholders = seed.map((q, i) => {
    const b = i * 4;
    values.push(q[0], q[1], q[2] || '', makeKey(q[0]));
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
  });
  await pool.query(
    `INSERT INTO quotes (text, author, note, text_key) VALUES ${placeholders.join(', ')}
     ON CONFLICT (text_key) DO NOTHING`,
    values
  );
  console.log(`Seeded the database with ${seed.length} quotes.`);
}

module.exports = { pool, query, init };
