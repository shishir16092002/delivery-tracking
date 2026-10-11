'use strict';

/**
 * migrate.js
 *
 * One-time script that sets up the database schema.
 * Run it once before starting the backend for the first time,
 * and again whenever a new migration file is added.
 *
 * Usage:
 *   node src/db/migrate.js
 */

const fs   = require('fs');
const path = require('path');

// Load .env before anything else
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('./pool');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // runs in alphabetical/numerical order: 001_, 002_, ...

  if (files.length === 0) {
    console.log('[migrate] No migration files found.');
    return;
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql      = fs.readFileSync(filePath, 'utf8');

    console.log(`[migrate] Running: ${file}`);
    await pool.query(sql);
    console.log(`[migrate] ✓ Done:    ${file}`);
  }

  console.log('\n[migrate] All migrations complete.');
}

migrate()
  .catch(err => {
    console.error('\n[migrate] ✗ Migration failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
