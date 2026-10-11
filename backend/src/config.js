'use strict';

/**
 * config.js
 *
 * Single place for every backend tunable.
 * All values come from environment variables so the server never has
 * secrets hard-coded.  The .env.example file lists every variable.
 *
 * Call `require('dotenv').config()` ONCE in server.js before this module
 * is first imported; after that all process.env values are available.
 */

const config = {
  /** TCP port the Express server listens on. */
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  /**
   * PostgreSQL connection options passed directly to the `pg` Pool.
   *
   * Pool settings explained:
   *   max                    – maximum simultaneous connections kept open.
   *                            10 is enough for Phase 2 at 100 riders × 0.5 req/s.
   *   idleTimeoutMillis      – a connection sitting idle for >30 s is closed
   *                            and returned to the OS.
   *   connectionTimeoutMillis – if a caller has to wait >2 s for a free slot
   *                            the pool throws immediately rather than queuing
   *                            forever, giving the API a fast failure path.
   */
  db: {
    host:     process.env.DATABASE_HOST     ?? 'localhost',
    port:     parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    database: process.env.DATABASE_NAME     ?? 'delivery_tracking',
    user:     process.env.DATABASE_USER     ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? '',

    max:                     10,
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis: 2_000,
  },
};

module.exports = config;
