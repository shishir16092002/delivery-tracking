# 🛵 Rider Live Location & Delivery Tracking System

> An incremental, production-style engineering project built phase by phase —  
> from a standalone GPS simulator all the way to a horizontally scalable, real-time tracking platform.

---

## Why This Project Exists

Most tutorials jump straight into the final architecture.  
This project does the opposite: **every phase adds exactly one layer**, solves a clear problem, and leaves the rest for the next phase.

By the end you will have built — and understood — every component of a real delivery tracking platform.

---

## Phase Progress

| Phase | Status | What it builds | Problem solved |
|---|---|---|---|
| **1** | ✅ **Done** | GPS Simulator → Console | Controllable source of GPS events |
| 2 | 🔜 Next | Simulator → Node.js Backend → PostgreSQL | Persist events; query ride history |
| 3 | ⬜ Planned | Latest Location → Redis | O(1) "where is rider X right now?" |
| 4 | ⬜ Planned | Live Updates → WebSockets | Real-time push to frontend |
| 5 | ⬜ Planned | Multiple Servers → Redis Pub/Sub | Horizontal scaling |
| 6 | ⬜ Planned | Durable Streaming → Kafka | Event replay, fan-out, durability |
| 7 | ⬜ Planned | Geospatial Queries | Nearby riders within radius |
| 8 | ⬜ Planned | ETA / Routing Intelligence | Real road ETA via OSRM / Maps API |
| 9 | ⬜ Planned | Load Testing & Scaling | Measure and fix breaking points |

---

## Repository Structure

```
delivery-tracking/
│
├── simulator/          ← Phase 1: GPS Simulator
│   ├── data/
│   │   └── noida_rider_routes_100.json   ← single source of truth
│   ├── src/
│   │   ├── simulator.js
│   │   ├── routePlayer.js
│   │   ├── interpolation.js
│   │   └── config.js
│   ├── package.json
│   └── README.md
│
└── README.md           ← you are here
```

---

## Quick Start (Phase 1)

```bash
cd delivery-tracking/simulator
node src/simulator.js
```

See [`simulator/README.md`](simulator/README.md) for full setup, configuration, and examples.

---

## Contributing

This is a learning project — PRs that add the next phase are welcome.  
Please open an issue first to discuss the approach before coding Phase N+1.

---

## License

MIT
