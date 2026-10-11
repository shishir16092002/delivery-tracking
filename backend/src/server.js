'use strict';

/**
 * server.js — Phase 2 backend entry point
 *
 * Responsibilities:
 *   1. Bootstrap dotenv so config.js sees env vars
 *   2. Create the Express application
 *   3. Mount middleware (JSON parser, routes)
 *   4. Define the /health endpoint
 *   5. Provide centralized error handling
 *   6. Start listening
 *   7. Shut down gracefully on SIGINT / SIGTERM
 */

require('dotenv').config();

const express        = require('express');
const config         = require('./config');
const pool           = require('./db/pool');
const locationRoutes = require('./routes/locationRoutes');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Parse application/json request bodies.
// Any request with a malformed JSON body will be caught below in the
// SyntaxError branch of the error handler.
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * GET /health
 *
 * Quick liveness probe used by operators and load balancers.
 * Also verifies database connectivity so infrastructure can detect
 * "server is up but database is down" as a distinct failure state.
 */
app.get('/health', async (req, res) => {
  try {
    // A trivial query — just confirms the pool can reach PostgreSQL.
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    // 503 = Service Unavailable — correct when a dependency is down.
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use('/api/v1/locations', locationRoutes);

// ---------------------------------------------------------------------------
// 404 — unknown route
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `No route found for ${req.method} ${req.path}`,
  });
});

// ---------------------------------------------------------------------------
// Centralized error handler
// Express identifies this as the error handler because it has 4 parameters.
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed JSON — the built-in JSON parser throws a SyntaxError.
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ success: false, error: 'Request body is not valid JSON' });
  }

  // Log full error server-side (including stack for debugging).
  console.error('[server] Unhandled error:', err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Never expose internal error messages or stack traces to API consumers.
  // A generic message is safe; the server log has the details.
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = app.listen(config.PORT, () => {
  console.log(`\n[server] 🚀  Backend running on http://localhost:${config.PORT}`);
  console.log(`[server]     Health:    GET  http://localhost:${config.PORT}/health`);
  console.log(`[server]     Ingest:    POST http://localhost:${config.PORT}/api/v1/locations`);
  console.log(`[server]     History:   GET  http://localhost:${config.PORT}/api/v1/riders/:riderId/locations`);
  console.log(`[server]\n  Press Ctrl+C to stop.\n`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down…`);

  // Stop accepting new requests first.
  server.close(async () => {
    console.log('[server] HTTP server closed.');

    // Drain the connection pool cleanly so in-flight queries can finish.
    await pool.end();
    console.log('[server] Database pool closed. Goodbye.');
    process.exit(0);
  });
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app; // exported for testing
