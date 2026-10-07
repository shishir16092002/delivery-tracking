'use strict';

/**
 * interpolation.js
 *
 * Pure coordinate math — zero side effects, zero I/O.
 *
 * Formula used throughout:
 *   P(t) = A + t * (B - A)     where t ∈ [0, 1]
 *
 * This gives a smooth linear path between any two GPS points.
 * It does NOT model road curvature — that is intentional for Phase 1.
 * Future phases can swap in a proper road-snapping step without changing
 * anything else in the simulator.
 */

/**
 * Linearly interpolate between two GPS waypoints.
 *
 * @param {{ latitude: number, longitude: number }} pointA  – start waypoint
 * @param {{ latitude: number, longitude: number }} pointB  – end waypoint
 * @param {number} t  – progress fraction in [0, 1]
 * @returns {{ latitude: number, longitude: number }}
 */
function lerp(pointA, pointB, t) {
  return {
    latitude:  pointA.latitude  + t * (pointB.latitude  - pointA.latitude),
    longitude: pointA.longitude + t * (pointB.longitude - pointA.longitude),
  };
}

/**
 * Given a flat list of waypoints and an overall progress fraction [0, 1],
 * return the exact interpolated position.
 *
 * Strategy:
 *   1. Each pair of consecutive waypoints represents one equal-length "segment"
 *      in terms of progress.  (This approximation keeps the code simple;
 *      Phase 8 can weight segments by actual distance.)
 *   2. Map globalT → which segment we are in + local t within that segment.
 *   3. Apply lerp() for the final coordinate.
 *
 * @param {Array<{ latitude: number, longitude: number }>} waypoints
 * @param {number} globalT  – overall route progress in [0, 1]
 * @returns {{
 *   latitude:      number,
 *   longitude:     number,
 *   waypointIndex: number,   // index of segment start waypoint (0-based)
 *   localT:        number,   // how far into that segment [0, 1]
 * }}
 */
function interpolatePosition(waypoints, globalT) {
  if (waypoints.length === 0) {
    throw new Error('interpolatePosition: waypoints array must not be empty');
  }

  // Clamp to [0, 1] to avoid floating-point overshoot
  const t = Math.min(1, Math.max(0, globalT));

  // Edge case: already at the destination
  if (t === 1 || waypoints.length === 1) {
    const last = waypoints[waypoints.length - 1];
    return {
      latitude:      last.latitude,
      longitude:     last.longitude,
      waypointIndex: waypoints.length - 1,
      localT:        1,
    };
  }

  const segmentCount = waypoints.length - 1;        // number of edges
  const segmentLength = 1 / segmentCount;           // each edge's share of [0,1]

  const segmentIndex = Math.min(
    Math.floor(t / segmentLength),
    segmentCount - 1,                               // guard against t === 1.0 edge case
  );

  const localT = (t - segmentIndex * segmentLength) / segmentLength;

  const pointA = waypoints[segmentIndex];
  const pointB = waypoints[segmentIndex + 1];

  const { latitude, longitude } = lerp(pointA, pointB, localT);

  return {
    latitude:      parseFloat(latitude.toFixed(6)),
    longitude:     parseFloat(longitude.toFixed(6)),
    waypointIndex: segmentIndex,
    localT:        parseFloat(localT.toFixed(6)),
  };
}

module.exports = { lerp, interpolatePosition };
