'use strict';

/**
 * simulator.js  —  Phase 1 entry point
 *
 * Responsibilities:
 *   1. Load and validate the dataset
 *   2. Prompt the user for rider count
 *   3. Create a RoutePlayer per rider
 *   4. Drive a shared setInterval() tick loop
 *   5. Print GPS events to stdout
 *   6. Handle Ctrl+C gracefully
 *
 * This file orchestrates; it does not compute GPS coordinates itself.
 */

const fs      = require('fs');
const path    = require('path');
const readline = require('readline');

const config      = require('./config');
const RoutePlayer = require('./routePlayer');

// ---------------------------------------------------------------------------
// Colour helpers (works on any terminal; degrades gracefully if not supported)
// ---------------------------------------------------------------------------
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  magenta:'\x1b[35m',
  blue:   '\x1b[34m',
};

function banner(text, colour = C.cyan) {
  const line = '─'.repeat(70);
  console.log(`\n${colour}${C.bold}${line}`);
  console.log(` ${text}`);
  console.log(`${line}${C.reset}\n`);
}

// ---------------------------------------------------------------------------
// Dataset loader + validator
// ---------------------------------------------------------------------------

/**
 * Load and structurally validate noida_rider_routes_100.json.
 * Throws a descriptive Error on any problem so the user gets a clear message.
 *
 * @returns {object} parsed dataset
 */
function loadDataset() {
  const datasetPath = path.resolve(__dirname, config.DATASET_PATH);

  if (!fs.existsSync(datasetPath)) {
    throw new Error(
      `Dataset not found at:\n  ${datasetPath}\n` +
      `Place noida_rider_routes_100.json in simulator/data/ and retry.`
    );
  }

  let raw;
  try {
    raw = fs.readFileSync(datasetPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read dataset: ${err.message}`);
  }

  let dataset;
  try {
    dataset = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Dataset is not valid JSON: ${err.message}`);
  }

  // --- Structural checks ---
  if (!Array.isArray(dataset.riders)) {
    throw new Error(`Dataset missing "riders" array`);
  }
  if (dataset.riders.length === 0) {
    throw new Error(`Dataset "riders" array is empty`);
  }

  dataset.riders.forEach((rider, idx) => {
    const prefix = `riders[${idx}]`;
    if (typeof rider.riderId !== 'string' || !rider.riderId) {
      throw new Error(`${prefix}.riderId is missing or not a string`);
    }
    if (typeof rider.routeId !== 'string' || !rider.routeId) {
      throw new Error(`${prefix}.routeId is missing or not a string`);
    }
    if (typeof rider.estimatedDurationMinutes !== 'number' || rider.estimatedDurationMinutes <= 0) {
      throw new Error(`${prefix}.estimatedDurationMinutes must be a positive number`);
    }
    if (!Array.isArray(rider.waypoints) || rider.waypoints.length < 2) {
      throw new Error(`${prefix}.waypoints must be an array with at least 2 entries`);
    }
    rider.waypoints.forEach((wp, wi) => {
      if (typeof wp.latitude !== 'number' || typeof wp.longitude !== 'number') {
        throw new Error(`${prefix}.waypoints[${wi}] has invalid lat/lng`);
      }
    });
  });

  return dataset;
}

// ---------------------------------------------------------------------------
// User input helper
// ---------------------------------------------------------------------------

/**
 * Ask the user how many riders to simulate.
 * Loops until a valid integer in [1, maxRiders] is given.
 *
 * @param {number} maxRiders
 * @returns {Promise<number>}
 */
function askRiderCount(maxRiders) {
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(
        `${C.bold}${C.yellow}How many riders do you want to simulate? (1–${maxRiders}): ${C.reset}`,
        (answer) => {
          const trimmed = answer.trim();

          // Must be numeric
          if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
            console.log(`${C.red}  ✗ Invalid input. Please enter a whole number.${C.reset}`);
            return ask();
          }

          const n = Number(trimmed);

          if (!Number.isInteger(n)) {
            console.log(`${C.red}  ✗ Please enter a whole number (no decimals).${C.reset}`);
            return ask();
          }
          if (n <= 0) {
            console.log(`${C.red}  ✗ Number must be greater than 0.${C.reset}`);
            return ask();
          }
          if (n > maxRiders) {
            console.log(`${C.red}  ✗ Dataset only contains ${maxRiders} riders.${C.reset}`);
            return ask();
          }

          rl.close();
          resolve(n);
        }
      );
    };
    ask();
  });
}

// ---------------------------------------------------------------------------
// GPS event printer
// ---------------------------------------------------------------------------

/**
 * Print one GPS event to stdout in a clear, scannable format.
 *
 * @param {object} event  – from RoutePlayer.tick()
 */
function printEvent(event) {
  const progressBar = buildProgressBar(event.progress, 20);
  const pct = (event.progress * 100).toFixed(1).padStart(5);

  console.log(
    `${C.cyan}${event.timestamp}${C.reset} ` +
    `${C.bold}${C.magenta}${event.riderId}${C.reset} ` +
    `${C.dim}(${event.routeId})${C.reset} ` +
    `lat=${C.green}${event.latitude.toFixed(6)}${C.reset} ` +
    `lng=${C.green}${event.longitude.toFixed(6)}${C.reset} ` +
    `wp=${C.yellow}${String(event.waypointIndex).padStart(3)}${C.reset} ` +
    `seq=${C.blue}${String(event.sequence).padStart(4)}${C.reset} ` +
    `${progressBar} ${pct}%`
  );
}

/**
 * Build a simple ASCII progress bar.
 *
 * @param {number} progress  – 0.0 to 1.0
 * @param {number} width     – total bar width in characters
 * @returns {string}
 */
function buildProgressBar(progress, width) {
  const filled = Math.round(progress * width);
  const empty  = width - filled;
  return `${C.dim}[${C.reset}${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}]${C.reset}`;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let intervalHandle = null;
let isShuttingDown = false;

function shutdown(players) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  console.log('');
  banner('Simulation stopped (Ctrl+C).  Goodbye!', C.yellow);

  const completed = players.filter(p => p.completed).length;
  const active    = players.filter(p => !p.completed).length;

  console.log(`  ${C.bold}Final status:${C.reset}`);
  console.log(`    Riders completed: ${C.green}${completed}${C.reset}`);
  console.log(`    Riders in-flight: ${C.yellow}${active}${C.reset}`);
  console.log('');

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  banner('🛵  Rider GPS Simulator  —  Phase 1', C.cyan);

  // --- Print active config ------------------------------------------------
  console.log(`${C.bold}Configuration:${C.reset}`);
  console.log(`  SIMULATION_INTERVAL_MS : ${C.yellow}${config.SIMULATION_INTERVAL_MS} ms${C.reset}`);
  console.log(`  SPEED_MULTIPLIER       : ${C.yellow}${config.SPEED_MULTIPLIER}×${C.reset}  (1 real second = ${config.SPEED_MULTIPLIER} simulated seconds)`);
  console.log(`  ROUTE_LOOP             : ${C.yellow}${config.ROUTE_LOOP}${C.reset}`);
  console.log('');

  // --- Load dataset -------------------------------------------------------
  let dataset;
  try {
    dataset = loadDataset();
  } catch (err) {
    console.error(`${C.red}${C.bold}Dataset error:${C.reset} ${err.message}`);
    process.exit(1);
  }

  const maxRiders = dataset.riders.length;
  console.log(`${C.green}✓${C.reset} Dataset loaded — ${C.bold}${maxRiders} riders${C.reset} available.\n`);

  // --- Ask for rider count ------------------------------------------------
  const riderCount = await askRiderCount(maxRiders);
  console.log('');

  // --- Create route players -----------------------------------------------
  const selectedRiders = dataset.riders.slice(0, riderCount);
  const players = selectedRiders.map(
    (rider) => new RoutePlayer(rider, config)
  );

  banner(
    `Starting simulation: ${riderCount} rider${riderCount > 1 ? 's' : ''} | ` +
    `interval=${config.SIMULATION_INTERVAL_MS}ms | ` +
    `speed=${config.SPEED_MULTIPLIER}× | ` +
    `loop=${config.ROUTE_LOOP}`,
    C.green
  );

  // Show rider summary table
  console.log(`${C.bold}  Rider summary:${C.reset}`);
  players.forEach((p, i) => {
    const rider = selectedRiders[i];
    const effectiveDurationMin = (rider.estimatedDurationMinutes / config.SPEED_MULTIPLIER).toFixed(1);
    console.log(
      `    ${C.magenta}${rider.riderId}${C.reset} → ${rider.start?.name ?? 'Start'} ` +
      `→ ${rider.destination?.name ?? 'End'} ` +
      `(${rider.estimatedDurationMinutes} min real-world, ~${effectiveDurationMin} min at ${config.SPEED_MULTIPLIER}×)`
    );
  });
  console.log('');
  console.log(`  ${C.dim}Press Ctrl+C to stop the simulation at any time.${C.reset}\n`);

  // --- Graceful shutdown setup --------------------------------------------
  process.on('SIGINT',  () => shutdown(players));
  process.on('SIGTERM', () => shutdown(players));

  // --- Tick loop ----------------------------------------------------------
  let allStopped = false;

  intervalHandle = setInterval(() => {
    if (isShuttingDown) return;

    let activeCount = 0;

    for (const player of players) {
      const event = player.tick();

      if (event === null) continue;  // rider already stopped

      activeCount++;

      // Print the GPS position event
      printEvent(event);

      // Print completion notice
      if (event._completed) {
        if (player.loop) {
          console.log(
            `  ${C.green}${C.bold}✓ ${player.riderId} completed loop #${event.loopCount} — restarting.${C.reset}`
          );
        } else {
          console.log(
            `  ${C.green}${C.bold}✓ ${player.riderId} reached destination — stopped.${C.reset}`
          );
        }
      }
    }

    // If every rider is done, stop automatically
    if (activeCount === 0 && !allStopped) {
      allStopped = true;
      clearInterval(intervalHandle);
      intervalHandle = null;

      console.log('');
      banner('All riders have reached their destinations!', C.green);
      process.exit(0);
    }
  }, config.SIMULATION_INTERVAL_MS);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err);
  process.exit(1);
});
