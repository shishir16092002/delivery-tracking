# 🗄️ Location Ingestion Backend — Phase 2

> This is Phase 2 of the [Rider Live Location & Delivery Tracking System](../README.md).  
> In this phase, GPS events stop disappearing when the simulator stops — they are permanently stored in PostgreSQL.

---

## What Does This Do?

This is a small Node.js/Express server with one job: **receive GPS location events and write them to a database.**

Every time the simulator generates a GPS ping for a rider, it sends an HTTP POST to this server. The server validates the data and inserts it into a PostgreSQL table. That's it.

Because of this separation, the backend doesn't know — and doesn't care — that the events come from a simulator. Tomorrow it could receive events from a real rider's phone, a third-party GPS provider, or anything else that can make an HTTP POST request.

---

## Prerequisites

- **Node.js ≥ 18**
- **PostgreSQL** running (locally or via Docker)
- The simulator from Phase 1 (in `../simulator/`)

---

## Setup

### 1. Install dependencies

```bash
cd delivery-tracking/backend
npm install
```

### 2. Create the database

Connect to PostgreSQL (via pgAdmin, psql, or any client) and run:

```sql
CREATE DATABASE delivery_tracking;
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your PostgreSQL credentials:

```env
PORT=3000

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=delivery_tracking
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password_here
```

### 4. Run the database migration

This creates the `rider_locations` table and its indexes. Safe to run more than once.

```bash
npm run migrate
```

You should see:

```
[migrate] Running: 001_create_rider_locations.sql
[migrate] ✓ Done:    001_create_rider_locations.sql

[migrate] All migrations complete.
```

### 5. Start the backend

```bash
npm start
```

```
[server] 🚀  Backend running on http://localhost:3000
[server]     Health:    GET  http://localhost:3000/health
[server]     Ingest:    POST http://localhost:3000/api/v1/locations
[server]     History:   GET  http://localhost:3000/api/v1/riders/:riderId/locations
```

---

## API Reference

### `GET /health`

Quick check that the server is up and the database is reachable.

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok", "database": "connected" }
```

---

### `POST /api/v1/locations`

Store one GPS location event.

```bash
curl -X POST http://localhost:3000/api/v1/locations \
  -H "Content-Type: application/json" \
  -d '{
    "riderId":   "rider-001",
    "routeId":   "route-001",
    "latitude":  28.565965,
    "longitude": 77.341895,
    "timestamp": "2026-10-08T00:00:00.000Z"
  }'
```

**Success — `201 Created`:**
```json
{ "success": true, "message": "Location stored successfully" }
```

**Validation failure — `400 Bad Request`:**
```json
{
  "success": false,
  "errors": [
    "latitude must be a number between -90 and 90",
    "timestamp is required and must be a valid ISO 8601 date string"
  ]
}
```

**What gets validated:**

| Field | Rules |
|---|---|
| `riderId` | Required, non-empty string |
| `routeId` | Required, non-empty string |
| `latitude` | Required number, `-90` to `90` |
| `longitude` | Required number, `-180` to `180` |
| `timestamp` | Required, valid ISO 8601 date string |

---

### `GET /api/v1/riders/:riderId/locations`

Retrieve the full location history for one rider, ordered by timestamp.

```bash
curl "http://localhost:3000/api/v1/riders/rider-001/locations"
```

```json
{
  "riderId": "rider-001",
  "total": 16,
  "limit": 100,
  "offset": 0,
  "locations": [
    { "latitude": 28.565965, "longitude": 77.341895, "timestamp": "2026-10-08T00:00:00.000Z" },
    { "latitude": 28.568751, "longitude": 77.348209, "timestamp": "2026-10-08T00:00:02.000Z" }
  ]
}
```

**Pagination** (optional query params):

```bash
curl "http://localhost:3000/api/v1/riders/rider-001/locations?limit=50&offset=0"
```

| Param | Default | Max |
|---|---|---|
| `limit` | `100` | `500` |
| `offset` | `0` | — |

---

## Database Schema

```sql
CREATE TABLE rider_locations (
  id          BIGSERIAL        PRIMARY KEY,
  rider_id    VARCHAR(50)      NOT NULL,
  route_id    VARCHAR(50)      NOT NULL,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  timestamp   TIMESTAMPTZ      NOT NULL,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
```

**Why these types?**

| Column | Type | Reason |
|---|---|---|
| `id` | `BIGSERIAL` | Auto-incrementing. `BIGINT` instead of `INT` because 100 riders × thousands of pings = millions of rows over time. |
| `rider_id` / `route_id` | `VARCHAR(50)` | Fixed-length IDs. Short and consistent. |
| `latitude` / `longitude` | `DOUBLE PRECISION` | 64-bit float gives ~15 significant digits — more than enough for GPS (6 decimals ≈ 0.1 m accuracy). |
| `timestamp` | `TIMESTAMPTZ` | The device's reported time, stored in UTC. Timezone-aware. |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Server insertion time. Useful for measuring ingestion lag. |

**Indexes:**

Only one composite index is added, because it's the only one justified by the queries we actually run:

```sql
CREATE INDEX idx_rider_locations_rider_timestamp
  ON rider_locations (rider_id, timestamp ASC);
```

This single index covers:
- The `WHERE rider_id = $1` filter in `GET /riders/:riderId/locations`
- The `ORDER BY timestamp ASC` sort — no separate sort step needed

Unnecessary indexes would slow down every `INSERT` without helping any query.

---

## Running with the Simulator

Start the backend first, then the simulator:

**Terminal 1 — backend:**
```bash
cd delivery-tracking/backend
npm start
```

**Terminal 2 — simulator:**
```bash
cd delivery-tracking/simulator
node src/simulator.js
# Enter: 1 (or any number up to 100)
```

The simulator now POSTs every GPS event to the backend. You'll see `[backend]` error lines in the simulator if the backend isn't reachable — but the simulation itself keeps running.

After the simulation completes, verify the data was stored:

```bash
curl http://localhost:3000/api/v1/riders/rider-001/locations
```

---

## Project Structure

```
backend/
├── src/
│   ├── server.js                    ← Express app, health check, error handler
│   ├── config.js                    ← All env vars in one place
│   ├── routes/
│   │   └── locationRoutes.js        ← URL → controller mapping
│   ├── controllers/
│   │   └── locationController.js    ← Validation + response shaping
│   ├── services/
│   │   └── locationService.js       ← All SQL (always parameterized)
│   └── db/
│       ├── pool.js                  ← pg connection pool
│       ├── migrate.js               ← Migration runner
│       └── migrations/
│           └── 001_create_rider_locations.sql
├── package.json
├── .env.example
└── README.md                        ← you are here
```

---

## npm Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the backend server |
| `npm run migrate` | Run all pending database migrations |
| `npm run dev` | Start with `--watch` (auto-restarts on file changes, Node 18+) |

---

## What's Coming Next — Phase 3

After Phase 2, you can run 100 riders and every GPS ping lands in PostgreSQL. But there's a problem hiding in plain sight.

Open your database and run this query:

```sql
SELECT rider_id, latitude, longitude, timestamp
FROM rider_locations
WHERE rider_id = 'rider-001'
ORDER BY timestamp DESC
LIMIT 1;
```

That's how you find out where `rider-001` is **right now**. It works — but it scans the entire `rider_locations` table for that rider just to return one row.

Now imagine a customer app asking "where's my rider?" every second for 100 active deliveries simultaneously. That's 100 queries/second, each scanning potentially millions of rows, all for the same answer: the **latest** location of each rider.

This is the problem Phase 3 solves: putting the latest location of every rider in **Redis** — an in-memory store where a single lookup takes microseconds, regardless of how many historical rows exist in PostgreSQL.

We won't introduce Redis until the problem is real and visible. Phase 3 is where it becomes visible.
