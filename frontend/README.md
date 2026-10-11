# 🖥️ Rider Live Location Map UI — Frontend Service

> Standalone Map UI dashboard running on its own dedicated port (`http://localhost:5173`).  
> Visualizes live rider locations, animated delivery motorcycles, heading rotation, and telemetry.

---

## Architecture: Multi-Port Separation

In production systems, the web UI and the backend API run on separate ports and processes:

```text
┌──────────────────────┐          ┌──────────────────────┐
│  Rider GPS Simulator │          │  Frontend UI Service │
│  (CLI Process)       │          │  (Port 5173)         │
└──────────┬───────────┘          └──────────┬───────────┘
           │ HTTP POST                       │ HTTP GET (CORS)
           ▼                                 ▼
┌────────────────────────────────────────────────────────┐
│  Node.js Express Backend API (Port 3000)               │
└──────────────────────────┬─────────────────────────────┘
                           │ Parameterized SQL
                           ▼
┌────────────────────────────────────────────────────────┐
│  PostgreSQL Database (Port 5432)                       │
│  Table: rider_locations                                │
└────────────────────────────────────────────────────────┘
```

- **Frontend (Port 5173):** Dedicated UI web server serving the Leaflet map and animation dashboard.
- **Backend (Port 3000):** Pure JSON REST API managing data validation and database queries.
- **PostgreSQL (Port 5432):** Relational database storing location breadcrumbs.

---

## Quick Start

### 1. Start the Frontend Server
From the `delivery-tracking/frontend` directory:

```bash
cd delivery-tracking/frontend
npm start
```

Output:
```text
======================================================
🛵  Rider Live Location Map UI
======================================================
  Frontend running at: http://localhost:5173
  Backend API target:  http://localhost:3000
======================================================
```

### 2. Open in Your Browser
Visit:
```text
http://localhost:5173
```

---

## Features
- **Leaflet + OpenStreetMap + CARTO Basemaps**: Real road maps across Noida.
- **Smooth Delivery Motorcycle Animation**: Dynamic heading calculation ($\theta$) turns the bike into corners.
- **Pulsing Radar Sonar Ring**: CSS ripple animation under the bike marker.
- **Traveled vs Planned Trail**: Visualizing path history in real time.
- **Dual Source Modes**: Direct simulator playback of any of the 100 routes or live polling from PostgreSQL.
