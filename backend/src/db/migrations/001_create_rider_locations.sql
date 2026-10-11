-- =============================================================================
-- Migration 001 — Create rider_locations table
-- =============================================================================
-- Run once against the delivery_tracking database.
-- Safe to run again: all statements use IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rider_locations (
  -- Surrogate primary key.  BIGSERIAL because 100 riders × 30 pings/min ×
  -- hours of operation will exceed INTEGER range over a long run.
  id          BIGSERIAL        PRIMARY KEY,

  -- The rider this ping belongs to (e.g. "rider-001").
  -- VARCHAR(50) is generous; change to 100 if your IDs are longer.
  rider_id    VARCHAR(50)      NOT NULL,

  -- The active route for this rider at the time of the ping.
  route_id    VARCHAR(50)      NOT NULL,

  -- DOUBLE PRECISION = 64-bit IEEE 754 float.
  -- Gives ~15 significant digits — more than enough for GPS (6 decimal
  -- places ≈ 0.1 m precision).
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,

  -- The timestamp the rider's device (or simulator) reports.
  -- TIMESTAMPTZ stores UTC and handles timezone conversions transparently.
  timestamp   TIMESTAMPTZ      NOT NULL,

  -- Server-side insertion time.  Useful for auditing lag between event
  -- generation and storage.
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================
-- We only add indexes that are justified by actual query patterns:
--
--   Query 1:  GET /riders/:riderId/locations
--             → WHERE rider_id = $1  ORDER BY timestamp ASC
--             → Covered by the composite index below (rider_id + timestamp).
--
--   Query 2:  POST /locations  (INSERT only — no index helps an INSERT).
--
-- We deliberately DO NOT add an index on (route_id), (latitude), (longitude),
-- or (created_at) because no query filters on those columns yet.
-- Unnecessary indexes slow down every INSERT.
-- =============================================================================

-- Supports the WHERE rider_id = $1 filter and the ORDER BY timestamp ASC
-- sort in a single index scan — no separate sort step needed.
CREATE INDEX IF NOT EXISTS idx_rider_locations_rider_timestamp
  ON rider_locations (rider_id, timestamp ASC);
