'use strict';

/**
 * locationController.js
 *
 * Handles HTTP request/response for location endpoints.
 *
 * Responsibilities:
 *   - Validate incoming request body / params / query strings
 *   - Call the appropriate service function
 *   - Shape the HTTP response
 *   - Forward unexpected errors to Express's centralized error handler
 *
 * This layer knows nothing about SQL.
 * The service layer knows nothing about HTTP.
 */

const locationService = require('../services/locationService');

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidLatitude(v) {
  return typeof v === 'number' && !isNaN(v) && v >= -90 && v <= 90;
}

function isValidLongitude(v) {
  return typeof v === 'number' && !isNaN(v) && v >= -180 && v <= 180;
}

function isValidTimestamp(v) {
  if (typeof v !== 'string' || !v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

// ---------------------------------------------------------------------------
// POST /api/v1/locations
// ---------------------------------------------------------------------------

/**
 * Accept one GPS location event from the simulator (or any GPS provider)
 * and persist it in PostgreSQL.
 *
 * Expected body:
 *   { riderId, routeId, latitude, longitude, timestamp }
 */
async function postLocation(req, res, next) {
  try {
    const { riderId, routeId, latitude, longitude, timestamp } = req.body ?? {};

    // --- Collect all validation failures before responding -----------------
    const errors = [];

    if (!isNonEmptyString(riderId))
      errors.push('riderId is required and must be a non-empty string');

    if (!isNonEmptyString(routeId))
      errors.push('routeId is required and must be a non-empty string');

    if (latitude === undefined || latitude === null)
      errors.push('latitude is required');
    else if (!isValidLatitude(latitude))
      errors.push('latitude must be a number between -90 and 90');

    if (longitude === undefined || longitude === null)
      errors.push('longitude is required');
    else if (!isValidLongitude(longitude))
      errors.push('longitude must be a number between -180 and 180');

    if (!isValidTimestamp(timestamp))
      errors.push('timestamp is required and must be a valid ISO 8601 date string');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // --- Persist -----------------------------------------------------------
    await locationService.insertLocation({
      riderId:   riderId.trim(),
      routeId:   routeId.trim(),
      latitude,
      longitude,
      timestamp,
    });

    return res.status(201).json({ success: true, message: 'Location stored successfully' });

  } catch (err) {
    next(err); // hand off to centralized error handler in server.js
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/riders/:riderId/locations
// ---------------------------------------------------------------------------

/**
 * Return the full location history of one rider, ordered by timestamp.
 * Supports simple limit/offset pagination via query params.
 *
 * Examples:
 *   GET /api/v1/riders/rider-001/locations
 *   GET /api/v1/riders/rider-001/locations?limit=50&offset=100
 */
async function getRiderLocations(req, res, next) {
  try {
    const { riderId } = req.params;

    if (!isNonEmptyString(riderId)) {
      return res.status(400).json({ success: false, error: 'riderId must be a non-empty string' });
    }

    // Clamp pagination to sensible bounds
    const limit  = Math.min(Math.max(parseInt(req.query.limit  ?? '100', 10), 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);

    // Run count + data fetch in parallel — one extra round-trip but gives
    // the caller a total so they can compute page counts client-side.
    const [locations, total] = await Promise.all([
      locationService.getLocationsByRider(riderId, { limit, offset }),
      locationService.countLocationsByRider(riderId),
    ]);

    return res.json({
      riderId,
      total,
      limit,
      offset,
      locations,
    });

  } catch (err) {
    next(err);
  }
}

module.exports = { postLocation, getRiderLocations };
