# 🛵 Rider Live Location & Delivery Tracking System

> An incremental, production-style engineering project building a real-time rider tracking platform layer by layer — from a GPS simulator to a distributed streaming architecture.

---

## What Is This?

This is an **incremental engineering project** that builds a production-grade delivery tracking system across 9 phases.

Instead of dumping a huge microservices stack on you at once, each phase introduces **exactly one new technology** and **solves exactly one concrete engineering bottleneck**. By working through the phases, you understand *why* each architectural component exists and *what happens without it*.

---

## System Evolution Roadmap

```text
Phase 1: GPS Simulation → Console
         (Solved: Created a deterministic, realistic source of GPS coordinates)

Phase 2: GPS Simulator → Node.js Backend (Express) → PostgreSQL
         (Solved: Durable persistence and historical location auditing)

Phase 3: Latest Location → Redis Cache
         (Problem to solve: O(1) current location lookups without scanning millions of DB rows)

Phase 4: Live Updates → WebSockets
         (Problem to solve: Push updates to client browsers instead of heavy polling)

Phase 5: Multiple Backend Servers → Redis Pub/Sub
         (Problem to solve: Horizontal scaling across multiple API nodes)

Phase 6: Durable Event Streaming → Apache Kafka
         (Problem to solve: Decoupled, fault-tolerant event streaming with replay capability)

Phase 7: Geospatial Queries → Nearby Riders (PostGIS / Redis GEO)
         (Problem to solve: Finding nearby riders within radius efficiently)

Phase 8: ETA & Routing Intelligence
         (Problem to solve: Road-network aware routing & live arrival estimations)

Phase 9: Load Testing, Profiling & Scaling
         (Problem to solve: Bottleneck analysis under tens of thousands of concurrent riders)
```

---

## Phase Status Summary

| Phase | Status | Architecture | Problem Solved |
|---|---|---|---|
| **Phase 1** | ✅ Complete | GPS Simulator → Console | Generated smooth coordinate movements along real Noida routes using linear interpolation. |
| **Phase 2** | ✅ Complete | GPS Simulator → Express API → PostgreSQL | Persisted incoming location events durably with parameterized queries and connection pooling. |
| **Phase 3** | 🔜 Next | Latest Location → Redis | Eliminates heavy relational DB table scans for "where is rider X right now?". |
| **Phase 4** | ⬜ Planned | Live Updates → WebSockets | Real-time push updates to consumer apps without client-side polling. |
| **Phase 5** | ⬜ Planned | Multi-Node Backend → Redis Pub/Sub | Cross-server event synchronization for horizontally scaled backends. |
| **Phase 6** | ⬜ Planned | Event Streaming → Kafka | Durable message broker handling backpressure, replays, and service fan-out. |
| **Phase 7** | ⬜ Planned | Geospatial Indexing | Radius searches (`ST_DWithin` / `GEOSEARCH`) to match orders with nearest riders. |
| **Phase 8** | ⬜ Planned | Routing & Real ETA | Accurate road routing taking into account real road topologies and speeds. |
| **Phase 9** | ⬜ Planned | High-Load Stress Testing | Benchmarking thousands of writes/sec and resolving system failure modes. |

---

## Phase 2 Architecture

```text
┌─────────────────────────┐
│   Rider GPS Simulator   │  (noida_rider_routes_100.json)
└────────────┬────────────┘
             │ HTTP POST /api/v1/locations
             ▼
┌─────────────────────────┐
│   Node.js Backend       │  (Express + pg Pool)
│   - Schema Validation   │
│   - Parameterized SQL   │
└────────────┬────────────┘
             │ SQL INSERT
             ▼
┌─────────────────────────┐
│       PostgreSQL        │
│   (rider_locations)     │
└─────────────────────────┘
```

### Why PostgreSQL for Phase 2?
In Phase 1, GPS events only existed in terminal memory. The moment the process exited, all location data disappeared. 

PostgreSQL gives us:
1. **Durable Persistence**: GPS updates survive process crashes and machine restarts.
2. **Historical Audit Trail**: We can inspect every waypoint visited during a delivery run.
3. **Structured Querying**: Fast relational queries (`WHERE rider_id = $1 ORDER BY timestamp ASC`).
4. **Data Integrity**: Strong typing, NOT NULL constraints, and schema enforcement.

### Current Architectural Limitation (The Motivation for Phase 3)
In Phase 2, PostgreSQL is forced to serve two conflicting roles:
1. **High-throughput write sink**: Ingesting hundreds of sequential GPS events per minute.
2. **Latest location lookup**: Answering "where is rider X right now?".

To find a rider's current location, PostgreSQL must execute:
```sql
SELECT latitude, longitude, timestamp 
FROM rider_locations 
WHERE rider_id = $1 
ORDER BY timestamp DESC 
LIMIT 1;
```
As millions of rows accumulate, constantly reading from disk and scanning indexes for real-time tracking will cause high disk I/O and latency spikes. This exact bottleneck will motivate **Phase 3: Redis In-Memory Caching**.

---

## Project Structure

```text
delivery-tracking/
│
├── simulator/                      ← Phase 1: GPS Simulator
│   ├── data/
│   │   └── noida_rider_routes_100.json   ← Authoritative route dataset
│   ├── src/
│   │   ├── config.js               ← Simulator configurations & env overrides
│   │   ├── interpolation.js         ← Coordinate math (P(t) = A + t(B - A))
│   │   ├── routePlayer.js          ← Rider progress state machine
│   │   └── simulator.js            ← Tick engine & HTTP dispatcher
│   ├── package.json
│   ├── README.md
│   └── .gitignore
│
├── backend/                        ← Phase 2: Location Ingestion Backend
│   ├── src/
│   │   ├── server.js               ← Express server, middleware, error handling
│   │   ├── config.js               ← Database & port configurations
│   │   ├── routes/
│   │   │   └── locationRoutes.js   ← REST endpoint routing
│   │   ├── controllers/
│   │   │   └── locationController.js ← Input validation & HTTP responses
│   │   ├── services/
│   │   │   └── locationService.js  ← Parameterized PostgreSQL queries
│   │   └── db/
│   │       ├── pool.js             ← PostgreSQL connection pool
│   │       ├── migrate.js          ← Database migration runner
│   │       └── migrations/
│   │           └── 001_create_rider_locations.sql
│   ├── package.json
│   ├── .env.example
│   ├── README.md
│   └── .gitignore
│
├── .gitignore                      ← Repository-wide git ignore
└── README.md                       ← You are here
```

---

## Quick Start (Running Phase 2)

### 1. Start PostgreSQL & Run Migrations
Ensure PostgreSQL is running on port `5432` with a database named `delivery_tracking`.
```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials (e.g., password)
npm run migrate
```

### 2. Start the Backend API
```bash
npm start
```
The API is live at `http://localhost:3000`. Test health:
```bash
curl http://localhost:3000/health
```

### 3. Run the Simulator
In a separate terminal window:
```bash
cd simulator
node src/simulator.js
```
Choose the number of riders (e.g. `5` or `10`). The simulator will output GPS events to the console **and** stream them via HTTP POST to the backend.

### 4. Query Location History
```bash
curl http://localhost:3000/api/v1/riders/rider-001/locations
```

---

## License

MIT
