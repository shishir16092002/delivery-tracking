'use strict';

/**
 * locationService.js
 *
 * All SQL that touches the rider_locations table lives here.
 * Controllers call these functions; they never write SQL themselves.
 *
 * WHY PARAMETERIZED QUERIES?
 * --------------------------
 * Never build SQL by string interpolation:
 *
 *   BAD:  `INSERT INTO rider_locations VALUES ('${riderId}', ...)`
 *
 * If riderId were  '; DROP TABLE rider_locations; --  an attacker could
 * destroy your data.  This is SQL injection — one of the most common
 * and destructive web vulnerabilities.
 *
 * Parameterized queries ($1, $2, ...) send the SQL template and the data
 * values separately over the wire.  PostgreSQL treats the values as data,
 * never as executable SQL — regardless of what characters they contain.
 *
 *   GOOD: pool.query('INSERT INTO rider_locations ... VALUES ($1, $2)', [riderId, ...])
 *
 * There is also a secondary benefit: PostgreSQL can cache the query plan
 * for the parameterized template and reuse it, which is slightly faster
 * than re-parsing a dynamically built string every time.
 */

const pool = require('../db/pool');

/**
 * Insert one GPS location event into rider_locations.
 *
 * @param {{ riderId, routeId, latitude, longitude, timestamp }} location
 * @returns {Promise<{ id: string, created_at: string }>}
 */
async function insertLocation({ riderId, routeId, latitude, longitude, timestamp }) {
  const result = await pool.query(
    `INSERT INTO rider_locations (rider_id, route_id, latitude, longitude, timestamp)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [riderId, routeId, latitude, longitude, timestamp],
  );
  return result.rows[0];
}

/**
 * Fetch a paginated list of locations for one rider, ordered by timestamp.
 *
 * @param {string} riderId
 * @param {{ limit: number, offset: number }} pagination
 * @returns {Promise<Array<{ latitude, longitude, timestamp }>>}
 */
async function getLocationsByRider(riderId, { limit = 100, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT latitude, longitude, timestamp
     FROM   rider_locations
     WHERE  rider_id = $1
     ORDER  BY timestamp ASC
     LIMIT  $2
     OFFSET $3`,
    [riderId, limit, offset],
  );
  return result.rows;
}

/**
 * Count total stored locations for a rider (used for pagination metadata).
 *
 * @param {string} riderId
 * @returns {Promise<number>}
 */
async function countLocationsByRider(riderId) {
  const result = await pool.query(
    `SELECT COUNT(*) AS total
     FROM   rider_locations
     WHERE  rider_id = $1`,
    [riderId],
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Retrieve the latest known location for each rider in PostgreSQL.
 * Powers the live map view showing all riders simultaneously.
 */
async function getLatestLocationsForAllRiders() {
  const result = await pool.query(
    `SELECT DISTINCT ON (rider_id)
       rider_id  AS "riderId",
       route_id  AS "routeId",
       latitude,
       longitude,
       timestamp
     FROM   rider_locations
     ORDER  BY rider_id, timestamp DESC`,
  );
  return result.rows;
}

module.exports = { insertLocation, getLocationsByRider, countLocationsByRider, getLatestLocationsForAllRiders };
