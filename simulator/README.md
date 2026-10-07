# 🛵 Rider GPS Simulator — Phase 1

> **Part of an incremental engineering series:**  
> Building a production-style Rider Live Location & Delivery Tracking System from scratch, one phase at a time.

---

## Why This Simulator Exists

In a real delivery platform, GPS data flows from a rider's phone to the backend continuously.  
Before building any backend infrastructure (databases, caches, APIs, message brokers), we need a **controlled, repeatable source of GPS events**.

The simulator plays that role:

- It reads pre-computed routes from a dataset file
- It generates smooth, time-accurate GPS position events
- It prints them to the console right now — and will pipe them into a real backend in later phases

This means every phase after Phase 1 can be developed and tested without needing a physical rider or a phone.

---

## The Single Source of Truth

```
data/noida_rider_routes_100.json
```

This JSON file contains **100 real Noida rider routes** with GPS waypoints.  
**The simulator never hardcodes any coordinate, sector, or route.**  
Every route is driven entirely by what this file contains.

---

## Architecture — Phase 1

```
noida_rider_routes_100.json
          │
          │  read at startup
          ▼
    [ Rider Simulator ]
          │
          │  setInterval() tick every N ms
          ▼
  [ RoutePlayer × N ]          ← one per rider, runs independently
          │
          │  interpolatePosition(waypoints, t)
          │  P(t) = A + t(B - A)
          ▼
  Smooth GPS Events (objects)
          │
          ▼
       Console stdout
```

### Module responsibilities

| File | Responsibility |
|---|---|
| `src/config.js` | All tunables (interval, speed, loop). Read from env vars. |
| `src/interpolation.js` | Pure math: linear interpolation between GPS waypoints. |
| `src/routePlayer.js` | State machine for one rider: tracks progress, calls interpolation. |
| `src/simulator.js` | Entry point: loads data, prompts user, runs tick loop, prints output. |
| `data/noida_rider_routes_100.json` | Dataset — single source of truth. Never modified by the simulator. |

---

## How Interpolation Works

Each route has a list of `waypoints` — real GPS coordinates along the road.  
Between every consecutive pair `(A, B)` we apply **linear interpolation**:

```
P(t) = A + t × (B − A)       where t ∈ [0, 1]
```

Example:
```
A = { lat: 28.564200, lng: 77.334800 }
B = { lat: 28.571523, lng: 77.351961 }

t = 0.0  →  P = A              (at A)
t = 0.5  →  P = { lat: 28.567862, lng: 77.343381 }   (midpoint)
t = 1.0  →  P = B              (at B)
```

The overall route progress `globalT ∈ [0, 1]` is split evenly across all `(N−1)` segments.  
As `globalT` grows from `0` to `1`, the rider moves smoothly from the first waypoint to the last.

---

## How Route Duration Is Respected

Each rider in the dataset has an `estimatedDurationMinutes` field.  
The simulator converts this to milliseconds and advances route progress proportionally per tick:

```
progressPerTick = (intervalMs × speedMultiplier) / durationMs
```

So if a route takes 30 minutes in the real world and `SPEED_MULTIPLIER = 60`,  
the simulation completes it in **30 seconds** — and every in-between coordinate is correct.

---

## Setup & Run

### Prerequisites

- **Node.js ≥ 18** — no external packages required

### Install

```bash
cd delivery-tracking/simulator
# No npm install needed — zero external dependencies
```

### Run

```bash
node src/simulator.js
```

Or use the npm scripts:

```bash
npm start                   # default (60× speed, 2s interval, stop on complete)
npm run start:fast          # 120× speed (30-min route finishes in 15 sec)
npm run start:loop          # riders restart after completing
npm run start:realtime      # real-time speed, 5s interval
```

### Override via environment variables

```bash
SIMULATION_INTERVAL_MS=1000 SPEED_MULTIPLIER=30 ROUTE_LOOP=true node src/simulator.js
```

| Variable | Default | Description |
|---|---|---|
| `SIMULATION_INTERVAL_MS` | `2000` | GPS tick interval in milliseconds |
| `SPEED_MULTIPLIER` | `60.0` | How many simulated seconds per real second |
| `ROUTE_LOOP` | `false` | `true` = restart route after completion |

---

## Example Console Output

```
──────────────────────────────────────────────────────────────────────
 🛵  Rider GPS Simulator  —  Phase 1
──────────────────────────────────────────────────────────────────────

Configuration:
  SIMULATION_INTERVAL_MS : 2000 ms
  SPEED_MULTIPLIER       : 60×  (1 real second = 60 simulated seconds)
  ROUTE_LOOP             : false

✓ Dataset loaded — 100 riders available.

How many riders do you want to simulate? (1–100): 3

──────────────────────────────────────────────────────────────────────
 Starting simulation: 3 riders | interval=2000ms | speed=60× | loop=false
──────────────────────────────────────────────────────────────────────

  Rider summary:
    rider-001 → Botanical Garden Metro Station → Noida Electronic City Metro Station (30.8 min real-world, ~0.5 min at 60×)
    rider-002 → Noida City Centre Metro Station → Sector 137 Metro Station (28.4 min real-world, ~0.5 min at 60×)
    rider-003 → Sector 18 Metro Station → Sector 76 Metro Station (25.1 min real-world, ~0.4 min at 60×)

  Press Ctrl+C to stop the simulation at any time.

2026-10-05T12:00:02.000Z rider-001 (route-001) lat=28.565559 lng=77.340263 wp=  2 seq=   1 [████░░░░░░░░░░░░░░░░]   3.2%
2026-10-05T12:00:02.000Z rider-002 (route-002) lat=28.534120 lng=77.391450 wp=  1 seq=   1 [███░░░░░░░░░░░░░░░░░]   3.5%
2026-10-05T12:00:02.000Z rider-003 (route-003) lat=28.573201 lng=77.325881 wp=  2 seq=   1 [████░░░░░░░░░░░░░░░░]   3.9%
...
  ✓ rider-003 reached destination — stopped.
  ✓ rider-001 reached destination — stopped.
  ✓ rider-002 reached destination — stopped.

──────────────────────────────────────────────────────────────────────
 All riders have reached their destinations!
──────────────────────────────────────────────────────────────────────
```

---

## Validation Checklist

| Test | Expected behaviour |
|---|---|
| 1 rider | Single rider moves smoothly to destination |
| 2 riders | Both progress independently, finish at different times |
| 10 riders | All 10 lines update every 2 seconds |
| 50 riders | 50 riders run concurrently without errors |
| 100 riders | All 100 complete their routes |
| Ctrl+C mid-run | Clean shutdown, shows completed vs in-flight count |
| `ROUTE_LOOP=true` | Riders restart route after reaching destination |
| Bad rider count (0, -1, 101, "abc") | Clear error, re-prompts |

---

## Project Roadmap

This is an **incremental engineering project**.  
Each phase adds exactly one layer of infrastructure and solves one specific problem.

```
Phase 1  (current)
  GPS Simulation → Console
  Problem solved: we have a controllable source of GPS events

Phase 2
  Simulator → Node.js Backend → PostgreSQL
  Problem solved: GPS events are persisted; we can query ride history

Phase 3
  Latest Location → Redis
  Problem solved: instant O(1) "where is rider X right now?" lookups
                  without scanning the full rides table

Phase 4
  Live Updates → WebSockets
  Problem solved: frontend gets real-time location push instead of polling

Phase 5
  Multiple Backend Servers → Redis Pub/Sub
  Problem solved: horizontal scaling; any server can receive and broadcast
                  an event published by any other server

Phase 6
  Durable Event Streaming → Kafka
  Problem solved: GPS events survive server restarts; consumers can
                  replay history; fan-out to many independent services

Phase 7
  Geospatial Queries → Nearby Riders
  Problem solved: "find all riders within 2 km of this point"
                  using PostGIS or Redis GEO commands

Phase 8
  ETA / Routing Intelligence
  Problem solved: replace straight-line estimates with real road ETA
                  using OSRM or Google Maps Distance Matrix

Phase 9
  Load Testing & Scaling
  Problem solved: measure how many riders / requests the system
                  handles before something breaks; then fix it
```

---

## Repository Structure

```
delivery-tracking/
│
├── simulator/                      ← Phase 1 (this folder)
│   ├── data/
│   │   └── noida_rider_routes_100.json   ← single source of truth
│   │
│   ├── src/
│   │   ├── simulator.js            ← entry point & tick loop
│   │   ├── routePlayer.js          ← per-rider state machine
│   │   ├── interpolation.js        ← pure GPS math
│   │   └── config.js               ← all tunables
│   │
│   ├── package.json
│   ├── README.md                   ← you are here
│   └── .gitignore
│
└── README.md                       ← top-level project overview
```
