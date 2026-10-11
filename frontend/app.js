/**
 * ============================================================================
 * Rider Live Location & Delivery Tracking — Map & Bike Animation Engine
 * ============================================================================
 *
 * Responsibilities:
 *   1. Initialize Leaflet map with dark theme centered on Noida.
 *   2. Render animated Bike marker with calculated heading/bearing rotation.
 *   3. Render pulsing radar sonar ring beneath the bike.
 *   4. Display dynamic breadcrumb path (traveled vs remaining).
 *   5. Support two modes:
 *      - Backend Mode: Live polling from PostgreSQL via Express API.
 *      - Direct Simulator Mode: Instant interactive playback of any of the
 *        100 Noida routes with speed control (1x to 60x).
 * ============================================================================
 */

// Global State
const state = {
  dataset: null,
  selectedRiderId: 'rider-001',
  mode: 'backend', // Default: Live sync with PostgreSQL backend API!
  isPlaying: false, // Only moves when real simulator events arrive from backend
  speedMultiplier: 30, // for offline manual preview mode
  progress: 0,         // 0.0 to 1.0
  followRider: true,
  currentBearing: 0,
  activePollInterval: null,
  animationFrameId: null,
  lastTimestamp: null,
  allBikesMarkers: new Map(),
};

// Map references
let map = null;
let currentBikeMarker = null;
let plannedRoutePolyline = null;
let traveledTrailPolyline = null;
let startPin = null;
let destPin = null;

// Bike SVG Icon Template with Delivery Carrier Box & Helmet Rider
const BIKE_SVG = `
<svg viewBox="0 0 24 24">
  <!-- Scooter Front Wheel -->
  <circle cx="5" cy="18" r="3" stroke="#38bdf8" stroke-width="1.5" fill="#0f172a" />
  <!-- Scooter Rear Wheel -->
  <circle cx="19" cy="18" r="3" stroke="#38bdf8" stroke-width="1.5" fill="#0f172a" />
  <!-- Scooter Frame / Body -->
  <path d="M5 18h4l3-6h4l3 6" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <!-- Front Fork & Handlebar -->
  <path d="M16 12l2-7h-3" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" fill="none" />
  <!-- Delivery Carrier Box on Rear -->
  <rect x="5.5" y="7" width="5.5" height="5.5" rx="1" fill="#f59e0b" stroke="#ffffff" stroke-width="1" />
  <path d="M7 9.5h2.5" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
  <!-- Rider Helmet & Body -->
  <circle cx="13" cy="5" r="2" fill="#38bdf8" />
  <path d="M12 7l1 5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
</svg>
`;

/**
 * Calculate geographical bearing (heading angle 0-360 deg) between two lat/lng coordinates.
 * Formula:
 *   θ = atan2( sin(Δλ) * cos(φ2), cos(φ1)*sin(φ2) − sin(φ1)*cos(φ2)*cos(Δλ) )
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x = Math.cos(rLat1) * Math.sin(rLat2) -
            Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360; // Normalize to 0-360
}

/**
 * Linearly interpolate between two coordinates: P(t) = A + t*(B - A)
 */
function lerpCoord(p1, p2, t) {
  return {
    latitude: p1.latitude + t * (p2.latitude - p1.latitude),
    longitude: p1.longitude + t * (p2.longitude - p1.longitude),
  };
}

/**
 * Map global progress t in [0, 1] to the exact segment and interpolated coordinate.
 */
function getInterpolatedPoint(waypoints, globalT) {
  const t = Math.min(1, Math.max(0, globalT));
  if (t === 1 || waypoints.length === 1) {
    const last = waypoints[waypoints.length - 1];
    return { ...last, segmentIndex: waypoints.length - 1, localT: 1 };
  }

  const segmentCount = waypoints.length - 1;
  const segmentLength = 1 / segmentCount;
  const segmentIndex = Math.min(Math.floor(t / segmentLength), segmentCount - 1);
  const localT = (t - segmentIndex * segmentLength) / segmentLength;

  const p1 = waypoints[segmentIndex];
  const p2 = waypoints[segmentIndex + 1];
  const interp = lerpCoord(p1, p2, localT);

  return {
    latitude: interp.latitude,
    longitude: interp.longitude,
    segmentIndex,
    localT,
    p1,
    p2,
  };
}

/**
 * Create custom HTML DivIcon for the delivery motorcycle.
 */
function createBikeDivIcon(bearing = 0, riderId = 'rider') {
  return L.divIcon({
    className: 'custom-bike-marker',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `
      <div class="bike-marker-container">
        <!-- Pulsing radar sonar ring -->
        <div class="bike-radar-ring"></div>
        <!-- Rotatable bike icon -->
        <div class="bike-icon-rotator" id="bike-rotator" style="transform: rotate(${bearing}deg);">
          <div class="bike-heading-pointer"></div>
          ${BIKE_SVG}
        </div>
      </div>
    `,
  });
}

/**
 * Initialize the Leaflet Map.
 */
function initMap() {
  // Center on Central Noida
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
  }).setView([28.574, 77.356], 13);

  // Zoom control top right
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Official OpenStreetMap Tiles (100% Free, No Watermark, No API Key Required)
  const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });

  // Esri Clean Navigation Street Map (Alternative high-clarity style, No Watermark)
  const esriStreets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
  });

  // Default to standard OpenStreetMap
  osmStandard.addTo(map);

  // Layer control so user can switch between styles anytime
  L.control.layers({
    'OpenStreetMap (Default)': osmStandard,
    'Esri Navigation Streets': esriStreets,
  }, null, { position: 'topright' }).addTo(map);

  // Initialize Route Polylines
  plannedRoutePolyline = L.polyline([], {
    color: '#38bdf8',
    weight: 4,
    opacity: 0.45,
    dashArray: '8, 8',
    lineCap: 'round',
  }).addTo(map);

  traveledTrailPolyline = L.polyline([], {
    color: '#10b981',
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);
}

/**
 * Load dataset (either from local /data path or backend).
 */
async function loadDataset() {
  try {
    const res = await fetch('./data/noida_rider_routes_100.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.dataset = await res.json();
    populateRiderSelect(state.dataset.riders);
    loadSelectedRiderRoute();
  } catch (err) {
    console.error('Failed to load local dataset file, trying simulator data path:', err);
    try {
      const res2 = await fetch('../simulator/data/noida_rider_routes_100.json');
      state.dataset = await res2.json();
      populateRiderSelect(state.dataset.riders);
      loadSelectedRiderRoute();
    } catch (err2) {
      document.getElementById('status-badge').innerHTML = `
        <span class="pulse-dot" style="background:#f43f5e"></span> Error loading routes
      `;
    }
  }
}

/**
 * Populate rider selection dropdown (100 riders).
 */
function populateRiderSelect(riders) {
  const select = document.getElementById('rider-select');
  select.innerHTML = '';
  riders.forEach((r, idx) => {
    const opt = document.createElement('option');
    opt.value = r.riderId;
    opt.textContent = `${r.riderId} (${r.start?.area || 'Start'} → ${r.destination?.area || 'End'})`;
    select.appendChild(opt);
  });

  select.value = state.selectedRiderId;
  select.addEventListener('change', (e) => {
    state.selectedRiderId = e.target.value;
    state.progress = 0;
    loadSelectedRiderRoute();
  });
}

/**
 * Get current rider data object from dataset.
 */
function getSelectedRider() {
  if (!state.dataset || !state.dataset.riders) return null;
  return state.dataset.riders.find(r => r.riderId === state.selectedRiderId) || state.dataset.riders[0];
}

/**
 * Load selected route onto the map.
 */
function loadSelectedRiderRoute() {
  const rider = getSelectedRider();
  if (!rider) return;

  // Update UI metadata cards
  document.getElementById('route-id-badge').textContent = rider.routeId;
  document.getElementById('start-name').textContent = rider.start?.name || rider.start?.area || 'Start';
  document.getElementById('dest-name').textContent = rider.destination?.name || rider.destination?.area || 'Destination';
  document.getElementById('est-duration').textContent = `${rider.estimatedDurationMinutes} min`;
  document.getElementById('est-distance').textContent = `${rider.estimatedDistanceKm || 10} km`;
  document.getElementById('speed-display').textContent = `${rider.averageSpeedKmph || 22} km/h`;

  const waypoints = rider.waypoints;
  const latLngs = waypoints.map(w => [w.latitude, w.longitude]);

  // Set planned route polyline
  plannedRoutePolyline.setLatLngs(latLngs);
  traveledTrailPolyline.setLatLngs([]);

  // Clear existing pins
  if (startPin) map.removeLayer(startPin);
  if (destPin) map.removeLayer(destPin);

  // Add Start Marker (Green Hub)
  startPin = L.circleMarker(latLngs[0], {
    radius: 7,
    color: '#ffffff',
    fillColor: '#10b981',
    fillOpacity: 1,
    weight: 2,
  }).addTo(map).bindTooltip(`Start: ${rider.start?.area || ''}`);

  // Add Destination Marker (Red Flag)
  destPin = L.circleMarker(latLngs[latLngs.length - 1], {
    radius: 7,
    color: '#ffffff',
    fillColor: '#f43f5e',
    fillOpacity: 1,
    weight: 2,
  }).addTo(map).bindTooltip(`Destination: ${rider.destination?.area || ''}`);

  // Auto fit map bounds to route
  map.fitBounds(plannedRoutePolyline.getBounds(), { padding: [50, 50] });

  // Reset or setup Bike Marker
  const startPt = waypoints[0];
  const nextPt = waypoints[1] || waypoints[0];
  state.currentBearing = calculateBearing(startPt.latitude, startPt.longitude, nextPt.latitude, nextPt.longitude);

  if (currentBikeMarker) {
    currentBikeMarker.setLatLng([startPt.latitude, startPt.longitude]);
    currentBikeMarker.setIcon(createBikeDivIcon(state.currentBearing, rider.riderId));
  } else {
    currentBikeMarker = L.marker([startPt.latitude, startPt.longitude], {
      icon: createBikeDivIcon(state.currentBearing, rider.riderId),
      zIndexOffset: 1000,
    }).addTo(map);

    currentBikeMarker.bindTooltip(`${rider.riderId} (Live)`, {
      permanent: false,
      direction: 'top',
      className: 'bike-tooltip',
      offset: [0, -18],
    });
  }

  updateTelemetry(startPt.latitude, startPt.longitude, 0, 0);

  if (state.mode === 'backend') {
    startBackendPolling();
  }
}


/**
 * Update UI Telemetry Cards.
 */
function updateTelemetry(lat, lng, progress, segmentIndex) {
  document.getElementById('lat-display').textContent = lat.toFixed(6);
  document.getElementById('lng-display').textContent = lng.toFixed(6);
  const pct = Math.min(100, Math.round(progress * 100));
  document.getElementById('progress-pct').textContent = `${pct}%`;
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('waypoint-index').textContent = `WP #${segmentIndex + 1}`;
}

/**
 * Direct In-Browser Simulation Loop (requestAnimationFrame).
 */
function startSimulationLoop() {
  function tick(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const deltaMs = timestamp - state.lastTimestamp;
    state.lastTimestamp = timestamp;

    if (state.isPlaying && state.mode === 'simulator') {
      const rider = getSelectedRider();
      if (rider) {
        const totalDurationMs = rider.estimatedDurationMinutes * 60 * 1000;
        const progressIncrement = (deltaMs * state.speedMultiplier) / totalDurationMs;

        state.progress += progressIncrement;

        if (state.progress >= 1) {
          state.progress = 1;
          state.isPlaying = false;
          document.getElementById('play-btn').innerHTML = '<span>▶</span> Resume';
          document.getElementById('status-badge').innerHTML = `
            <span class="pulse-dot" style="background:#10b981"></span> Destination Reached
          `;
        }

        renderSimulatorPosition(state.progress);
      }
    }

    state.animationFrameId = requestAnimationFrame(tick);
  }

  state.animationFrameId = requestAnimationFrame(tick);
}

/**
 * Render bike position for a given progress fraction.
 */
function renderSimulatorPosition(progress) {
  const rider = getSelectedRider();
  if (!rider || !currentBikeMarker) return;

  const current = getInterpolatedPoint(rider.waypoints, progress);

  // Compute bearing to next waypoint for realistic bike direction
  const nextTarget = rider.waypoints[Math.min(current.segmentIndex + 1, rider.waypoints.length - 1)];
  if (nextTarget) {
    const newBearing = calculateBearing(
      current.latitude,
      current.longitude,
      nextTarget.latitude,
      nextTarget.longitude
    );
    // Smooth angle interpolation
    state.currentBearing = newBearing;
  }

  // Update bike position
  const latLng = [current.latitude, current.longitude];
  currentBikeMarker.setLatLng(latLng);

  // Update bike rotation style
  const rotatorEl = document.getElementById('bike-rotator');
  if (rotatorEl) {
    rotatorEl.style.transform = `rotate(${state.currentBearing}deg)`;
  }

  // Update dynamic traveled trail polyline
  const passedWaypoints = rider.waypoints.slice(0, current.segmentIndex + 1).map(w => [w.latitude, w.longitude]);
  passedWaypoints.push(latLng);
  traveledTrailPolyline.setLatLngs(passedWaypoints);

  // Update Telemetry
  updateTelemetry(current.latitude, current.longitude, progress, current.segmentIndex);

  // Follow camera
  if (state.followRider && state.isPlaying) {
    map.panTo(latLng, { animate: true, duration: 0.1 });
  }
}

/**
 * Backend Polling Engine (Fetches live location events from PostgreSQL via Express).
 */
function startBackendPolling() {
  if (state.activePollInterval) clearInterval(state.activePollInterval);

  async function poll() {
    if (state.mode !== 'backend') return;

    try {
      const url = `http://localhost:3000/api/v1/locations/riders/${state.selectedRiderId}/locations?limit=500`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const locations = data.locations || [];

      if (locations.length === 0) {
        document.getElementById('status-badge').innerHTML = `
          <span class="pulse-dot" style="background:#f59e0b"></span> Waiting for Simulator Events (0 in DB)
        `;
        traveledTrailPolyline.setLatLngs([]);
        return;
      }

      document.getElementById('status-badge').innerHTML = `
        <span class="pulse-dot" style="background:#10b981"></span> Live Sync: ${locations.length} pings in DB
      `;

      // The last stored location is the latest GPS ping
      const latest = locations[locations.length - 1];
      const prev = locations.length > 1 ? locations[locations.length - 2] : latest;

      const bearing = calculateBearing(prev.latitude, prev.longitude, latest.latitude, latest.longitude);
      state.currentBearing = bearing;

      const latLng = [latest.latitude, latest.longitude];
      currentBikeMarker.setLatLng(latLng);

      const rotatorEl = document.getElementById('bike-rotator');
      if (rotatorEl) {
        rotatorEl.style.transform = `rotate(${bearing}deg)`;
      }

      // Update trail
      const trail = locations.map(l => [l.latitude, l.longitude]);
      traveledTrailPolyline.setLatLngs(trail);

      updateTelemetry(latest.latitude, latest.longitude, locations.length / 40, locations.length);

      if (state.followRider) {
        map.panTo(latLng, { animate: true, duration: 0.3 });
      }

    } catch (err) {
      document.getElementById('status-badge').innerHTML = `
        <span class="pulse-dot" style="background:#f43f5e"></span> Backend Offline (Port 3000)
      `;
    }
  }

  poll();
  state.activePollInterval = setInterval(poll, 1500);
}


/**
 * Set up UI Event Listeners.
 */
function setupUI() {
  const playBtn = document.getElementById('play-btn');
  const resetBtn = document.getElementById('reset-btn');
  const modeSelect = document.getElementById('mode-select');
  const speedSelect = document.getElementById('speed-select');
  const followBtn = document.getElementById('follow-btn');
  const centerBtn = document.getElementById('center-btn');

  // Play / Pause
  playBtn.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    playBtn.innerHTML = state.isPlaying ? '<span>⏸</span> Pause' : '<span>▶</span> Play';
  });

  // Reset
  resetBtn.addEventListener('click', () => {
    state.progress = 0;
    state.isPlaying = true;
    playBtn.innerHTML = '<span>⏸</span> Pause';
    traveledTrailPolyline.setLatLngs([]);
    renderSimulatorPosition(0);
  });

  // Mode Toggle (Offline Preview vs PostgreSQL Backend)
  modeSelect.addEventListener('change', (e) => {
    state.mode = e.target.value;
    const simControls = document.getElementById('simulator-controls');

    if (state.mode === 'backend') {
      simControls.style.display = 'none';
      state.isPlaying = false;
      document.getElementById('status-badge').innerHTML = `
        <span class="pulse-dot" style="background:#06b6d4"></span> Polling http://localhost:3000
      `;
      startBackendPolling();
    } else {
      simControls.style.display = 'block';
      if (state.activePollInterval) clearInterval(state.activePollInterval);
      document.getElementById('status-badge').innerHTML = `
        <span class="pulse-dot" style="background:#10b981"></span> Offline Route Preview
      `;
      state.progress = 0;
      state.isPlaying = false;
      document.getElementById('play-btn').innerHTML = '<span>▶</span> Play Demo';
      loadSelectedRiderRoute();
    }
  });

  // Live Simulator Speed Multiplier (Syncs with CLI simulator via backend)
  const liveSpeedSelect = document.getElementById('live-speed-select');
  const speedIndicator = document.getElementById('speed-indicator');

  if (liveSpeedSelect) {
    liveSpeedSelect.addEventListener('change', async (e) => {
      const newSpeed = parseFloat(e.target.value);
      if (speedIndicator) speedIndicator.textContent = `${newSpeed}×`;
      state.speedMultiplier = newSpeed;

      try {
        const res = await fetch('http://localhost:3000/api/v1/locations/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speedMultiplier: newSpeed }),
        });
        if (res.ok) {
          const badge = document.getElementById('status-badge');
          if (badge) {
            const prevBadge = badge.innerHTML;
            badge.innerHTML = `<span class="pulse-dot" style="background:#06b6d4"></span> ⚡ Simulator Speed Set to ${newSpeed}×`;
            setTimeout(() => {
              if (state.mode === 'backend' && badge) badge.innerHTML = prevBadge;
            }, 3000);
          }
        }
      } catch (err) {
        console.warn('Backend API offline, speed updated for local view only');
      }
    });
  }

  // Camera Follow Toggle
  followBtn.addEventListener('click', () => {
    state.followRider = !state.followRider;
    followBtn.classList.toggle('btn-active', state.followRider);
    followBtn.textContent = state.followRider ? '🎯 Tracking: ON' : '🎯 Tracking: OFF';
  });

  // Center on Route
  centerBtn.addEventListener('click', () => {
    if (plannedRoutePolyline && plannedRoutePolyline.getLatLngs().length > 0) {
      map.fitBounds(plannedRoutePolyline.getBounds(), { padding: [50, 50] });
    }
  });
}

/**
 * Synchronize initial simulator speed with backend config if running.
 */
async function syncInitialBackendConfig() {
  try {
    const res = await fetch('http://localhost:3000/api/v1/locations/config');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.speedMultiplier === 'number') {
        state.speedMultiplier = data.speedMultiplier;
        const liveSpeedSelect = document.getElementById('live-speed-select');
        const speedIndicator = document.getElementById('speed-indicator');
        if (liveSpeedSelect) liveSpeedSelect.value = String(data.speedMultiplier);
        if (speedIndicator) speedIndicator.textContent = `${data.speedMultiplier}×`;
      }
    }
  } catch (_) {}
}

// Bootstrap Application
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupUI();
  syncInitialBackendConfig();
  loadDataset().then(() => {
    startBackendPolling();
  });
  startSimulationLoop();
});

