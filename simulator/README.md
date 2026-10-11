# 🛵 Rider GPS Simulator — Phase 1

> This is Phase 1 of the [Rider Live Location & Delivery Tracking System](../README.md).  
> In this phase, you have no server, no database, and no real riders — and that's the point.

---

## What Does This Do?

This simulator reads a dataset of **100 pre-built Noida delivery routes** and replays them as a stream of GPS position updates — printed to your terminal, one ping every 2 seconds.

Each rider moves **smoothly** between waypoints using linear interpolation, respects the route's estimated travel time, and runs completely independently of every other rider.

Think of it as a fake GPS device you can run on your laptop. Every phase after this one will plug into this same event stream — the simulator itself never changes.

---

## Why Start Here?

In a real delivery app, GPS data comes from a rider's phone. You can't build and test a tracking backend if you need a physical rider on the road every time.

The simulator solves this. It gives you a **controlled, deterministic, infinitely repeatable** source of GPS events so you can build and test the rest of the system at your desk.

---

## The Single Source of Truth

All route data lives in one place:

```
data/noida_rider_routes_100.json
```

The simulator **never hardcodes** any coordinate, sector name, or route. If you change the dataset file, the simulator picks it up automatically. The code only knows *how* to play a route — the dataset says *what* the route is.

---

## Quick Start

**You only need Node.js ≥ 18. No npm install, no external packages.**

```bash
cd delivery-tracking/simulator
node src/simulator.js
```

You'll see this:

```
How many riders do you want to simulate? (1–100):
```

Enter any number from 1 to 100 and watch the GPS events start flowing.

---

## Configuration

You can tune the simulator without touching any code — just set environment variables before running:

| Variable | Default | What it does |
|---|---|---|
| `SIMULATION_INTERVAL_MS` | `2000` | How often a GPS ping fires, in milliseconds |
| `SPEED_MULTIPLIER` | `60` | Compresses time. At 60×, a 30-minute route completes in 30 seconds |
| `ROUTE_LOOP` | `false` | Set to `true` and riders restart their route after reaching the destination |

**Examples:**

```bash
# Default — 60× speed, stops when done
node src/simulator.js

# Faster — 120× speed (30-min route finishes in 15 sec)
SPEED_MULTIPLIER=120 node src/simulator.js

# Loop mode — riders restart after completing their route
ROUTE_LOOP=true node src/simulator.js

# Real-time — 1× speed, ping every 5 seconds
SPEED_MULTIPLIER=1 SIMULATION_INTERVAL_MS=5000 node src/simulator.js
```

Or use the built-in npm scripts:

```bash
npm start              # default
npm run start:fast     # 120× speed
npm run start:loop     # loop mode
npm run start:realtime # 1× real-time
```

---

## What the Output Looks Like

```
──────────────────────────────────────────────────────────────────────
 🛵  Rider GPS Simulator  —  Phase 1
──────────────────────────────────────────────────────────────────────

Configuration:
  SIMULATION_INTERVAL_MS : 2000 ms
  SPEED_MULTIPLIER       : 60×
  ROUTE_LOOP             : false

✓ Dataset loaded — 100 riders available.

How many riders do you want to simulate? (1–100): 3

  Rider summary:
    rider-001 → Botanical Garden Metro → Noida Electronic City Metro  (30.8 min, ~0.5 min at 60×)
    rider-002 → Noida City Centre Metro → Sector 137 Metro            (28.4 min, ~0.5 min at 60×)
    rider-003 → Sector 18 Metro → Sector 76 Metro                     (25.1 min, ~0.4 min at 60×)

  Press Ctrl+C to stop at any time.

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

Each line tells you the rider ID, route ID, current coordinates, which waypoint segment they're in, their sequence number, and a visual progress bar.

Press **Ctrl+C** at any time for a clean shutdown with a summary of how many riders completed vs. were still in flight.

---

## How It Works Internally

### Project structure

```
simulator/
├── data/
│   └── noida_rider_routes_100.json   ← dataset (never modified)
└── src/
    ├── config.js          ← reads env vars, validates them, exports settings
    ├── interpolation.js   ← pure math, no I/O
    ├── routePlayer.js     ← state machine for a single rider
    └── simulator.js       ← entry point: loads data, prompts, drives the tick loop
```

Each file has **one job only**. There's no circular dependency and nothing is hardcoded.

---

### How smooth movement works

The dataset gives you a list of GPS waypoints along a road. The simulator doesn't jump from one to the next — it **interpolates** between them.

Between any two consecutive waypoints `A` and `B`:

```
P(t) = A + t × (B − A)     where t is between 0 and 1
```

- At `t = 0` you're exactly at A
- At `t = 0.5` you're at the midpoint
- At `t = 1` you're exactly at B

The rider's overall route progress goes from `0.0` (start) to `1.0` (destination). That progress value is mapped across all waypoint segments automatically, so the rider glides continuously through the entire route.

**Concrete example:**

```
A = { lat: 28.5642, lng: 77.3348 }   ← Botanical Garden Metro
B = { lat: 28.5715, lng: 77.3520 }   ← next waypoint

t = 0.0  →  lat: 28.5642, lng: 77.3348   (at A)
t = 0.5  →  lat: 28.5679, lng: 77.3434   (midpoint)
t = 1.0  →  lat: 28.5715, lng: 77.3520   (at B)
```

---

### How route duration is respected

Each route in the dataset has an `estimatedDurationMinutes` field. The simulator converts this to milliseconds and uses it to control how quickly the rider advances through the route:

```
Each tick advances by:  intervalMs × speedMultiplier  (simulated milliseconds)
Route finishes when:    total elapsed ÷ durationMs = 1.0
```

So at `SPEED_MULTIPLIER = 60`, every 1 real second = 60 simulated seconds.  
A 30-minute route finishes in exactly **30 real seconds** — and every single coordinate along the way is correctly calculated.

Riders with longer routes simply take more ticks to finish. They run completely independently of each other.

---

## Input Validation

The simulator rejects bad input and tells you why:

| You type | What happens |
|---|---|
| `0` | Rejected — must be at least 1 |
| `-5` | Rejected — must be a positive number |
| `101` | Rejected — only 100 riders in the dataset |
| `abc` | Rejected — must be a whole number |
| `1.5` | Rejected — must be a whole number |

It keeps asking until you give a valid answer.

---

## What's Coming Next

**Phase 2: Simulator → Express API → PostgreSQL**

Right now, every GPS event lives for a fraction of a second in your terminal and then disappears. The moment you stop the simulator, that data is gone.

Phase 2 fixes this. It adds a small Node.js HTTP server and a PostgreSQL table that stores every GPS event as it arrives. You'll be able to query the full history of any rider's trip after the fact.

The simulator itself won't change much — it'll just POST events to the server instead of printing them. Everything else (interpolation, RoutePlayer, config) stays exactly the same.

---

## Project Roadmap

```
Phase 1  ✅  GPS Simulator → Console
Phase 2  🔜  Simulator → Express API → PostgreSQL
Phase 3       Latest Location → Redis
Phase 4       Live Updates → WebSockets
Phase 5       Multiple Servers → Redis Pub/Sub
Phase 6       Durable Streaming → Kafka
Phase 7       Geospatial Queries (nearby riders)
Phase 8       ETA & Routing Intelligence
Phase 9       Load Testing & Scaling
```
