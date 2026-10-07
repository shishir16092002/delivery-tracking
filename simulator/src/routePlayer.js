'use strict';

/**
 * routePlayer.js
 *
 * Manages a single rider's journey through their assigned route.
 *
 * Responsibilities:
 *   - Track how much time has elapsed for this rider
 *   - Convert elapsed time → overall route progress (0 → 1)
 *   - Delegate coordinate calculation to interpolation.js
 *   - Emit structured GPS event objects
 *   - Report when the rider has reached the destination
 *
 * This class knows NOTHING about timers or I/O.  The simulator.js
 * calls tick() on every interval and handles all printing.
 */

const { interpolatePosition } = require('./interpolation');

class RoutePlayer {
  /**
   * @param {object} riderData  – one element from dataset.riders[]
   * @param {object} config     – the global config object
   */
  constructor(riderData, config) {
    // --- Route identity ---------------------------------------------------
    this.riderId  = riderData.riderId;
    this.routeId  = riderData.routeId;
    this.waypoints = riderData.waypoints;

    // --- Duration in milliseconds (real-world time for a SPEED_MULTIPLIER of 1) ---
    this.durationMs = riderData.estimatedDurationMinutes * 60 * 1000;

    // --- Config snapshot --------------------------------------------------
    this.intervalMs     = config.SIMULATION_INTERVAL_MS;
    this.speedMultiplier = config.SPEED_MULTIPLIER;
    this.loop            = config.ROUTE_LOOP;

    // --- State ------------------------------------------------------------
    this.elapsedMs   = 0;       // how much simulated time has passed
    this.sequence    = 0;       // monotonically increasing event counter
    this.completed   = false;   // true once the rider reaches the destination
    this.loopCount   = 0;       // how many times the route has been restarted

    // Validate
    if (!this.waypoints || this.waypoints.length < 2) {
      throw new Error(`${this.riderId}: route must have at least 2 waypoints`);
    }
    if (this.durationMs <= 0) {
      throw new Error(`${this.riderId}: estimatedDurationMinutes must be > 0`);
    }
  }

  /**
   * Advance the simulation by one interval and return a GPS event object,
   * or null if the rider has stopped (completed & no loop).
   *
   * @returns {object|null}
   */
  tick() {
    if (this.completed) return null;

    // Advance simulated time by one interval scaled by speed
    this.elapsedMs += this.intervalMs * this.speedMultiplier;

    // Overall progress: 0.0 (start) → 1.0 (destination)
    const progress = Math.min(1, this.elapsedMs / this.durationMs);

    // Get interpolated position
    const { latitude, longitude, waypointIndex, localT } =
      interpolatePosition(this.waypoints, progress);

    this.sequence++;

    const event = {
      riderId:       this.riderId,
      routeId:       this.routeId,
      latitude,
      longitude,
      timestamp:     new Date().toISOString(),
      sequence:      this.sequence,
      progress:      parseFloat(progress.toFixed(4)),  // 0.0000 – 1.0000
      waypointIndex,
      localT,
      loopCount:     this.loopCount,
    };

    // --- Check completion -------------------------------------------------
    if (progress >= 1) {
      if (this.loop) {
        // Restart: reset elapsed time, keep sequence counter growing
        this.elapsedMs = 0;
        this.loopCount++;
        event._completed = true;   // flag this tick as the final one of the trip
      } else {
        this.completed = true;
        event._completed = true;
      }
    }

    return event;
  }

  /** Human-readable label for log lines */
  get label() {
    return `[${this.riderId}/${this.routeId}]`;
  }
}

module.exports = RoutePlayer;
