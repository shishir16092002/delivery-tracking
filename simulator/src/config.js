'use strict';

/**
 * config.js
 *
 * Single place for all simulator tunables.
 * Override any value via environment variables — the dataset is NEVER touched.
 *
 * Environment variables:
 *   SIMULATION_INTERVAL_MS  – how often a GPS tick fires (default: 2000 ms)
 *   SPEED_MULTIPLIER        – compress real-world time (default: 1.0 = real-time)
 *   ROUTE_LOOP              – 'true' restarts a rider after completing; 'false' stops it
 */

const config = {
  /**
   * How frequently (ms) the simulator emits a GPS position update per rider.
   * Lower = smoother animation; higher = fewer log lines.
   */
  SIMULATION_INTERVAL_MS: parseInt(process.env.SIMULATION_INTERVAL_MS ?? '2000', 10),

  /**
   * Speed-up factor applied to route playback.
   *
   * Examples:
   *   1.0  → real-time  (a 30-min route plays for 30 min)
   *   10.0 → 10× faster (a 30-min route plays in 3 min)
   *   60.0 → 60× faster (a 30-min route plays in 30 sec)
   *
   * The simulator adjusts how much route progress advances per tick so that
   * the total playback duration ≈ estimatedDurationMinutes / SPEED_MULTIPLIER.
   */
  SPEED_MULTIPLIER: parseFloat(process.env.SPEED_MULTIPLIER ?? '60.0'),

  /**
   * When true, riders restart their route from the beginning after completion.
   * When false (default), riders stop after one complete trip.
   */
  ROUTE_LOOP: (process.env.ROUTE_LOOP ?? 'false').toLowerCase() === 'true',

  /**
   * Path to the dataset file (relative to the simulator/ directory).
   * Do NOT change this unless you rename the file.
   */
  DATASET_PATH: '../data/noida_rider_routes_100.json',
};

// --- Validation ----------------------------------------------------------

if (isNaN(config.SIMULATION_INTERVAL_MS) || config.SIMULATION_INTERVAL_MS < 100) {
  throw new Error(`SIMULATION_INTERVAL_MS must be ≥ 100 ms (got ${process.env.SIMULATION_INTERVAL_MS})`);
}

if (isNaN(config.SPEED_MULTIPLIER) || config.SPEED_MULTIPLIER <= 0) {
  throw new Error(`SPEED_MULTIPLIER must be > 0 (got ${process.env.SPEED_MULTIPLIER})`);
}

module.exports = config;
