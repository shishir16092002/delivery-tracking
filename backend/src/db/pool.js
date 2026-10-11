'use strict';

/**
 * pool.js — PostgreSQL connection pool
 *
 * WHY A POOL?
 * -----------
 * Opening a PostgreSQL connection is expensive:
 *   • TCP handshake
 *   • TLS negotiation
 *   • PostgreSQL authentication round-trip
 *   • Server-side session memory allocation
 *
 * This can take 20–100 ms per connection.  With 100 riders sending a GPS
 * ping every 2 seconds, we would be opening and closing ~50 connections/s
 * if we used one connection per request.  The database would spend most of
 * its time on handshakes rather than queries.
 *
 * HOW THE POOL WORKS
 * ------------------
 * The pool pre-creates up to `max` connections and keeps them open.
 * When a request arrives:
 *   1. The pool lends one idle connection to the caller.
 *   2. The caller runs its query.
 *   3. The caller releases the connection back to the pool.
 *   4. The next request reuses that same TCP socket.
 *
 * Connection overhead is paid once at startup, not once per request.
 *
 * WHY `pg` POOL SPECIFICALLY
 * --------------------------
 * `pg.Pool` is the standard PostgreSQL pool for Node.js.  It handles:
 *   • Connection lifecycle
 *   • Automatic reconnection on transient failures
 *   • Waiting queues when all connections are busy
 *   • Idle connection cleanup via idleTimeoutMillis
 */

const { Pool } = require('pg');
const config   = require('../config');

const pool = new Pool(config.db);

// Surface idle-client errors so they don't silently swallow problems.
pool.on('error', (err) => {
  console.error('[pool] Unexpected error on idle client:', err.message);
  // We intentionally do NOT call process.exit() here — the pool will
  // attempt to create a replacement connection automatically.
});

module.exports = pool;
