'use strict';

/**
 * locationRoutes.js
 *
 * Maps URL patterns to controller functions.
 * No business logic here — that belongs in the controller/service layers.
 */

const { Router }    = require('express');
const controller    = require('../controllers/locationController');

const router = Router();

// POST /api/v1/locations
// Ingest one GPS event from the simulator (or any GPS source).
router.post('/', controller.postLocation);

// GET /api/v1/locations/riders
// Retrieve latest location of all riders currently active.
router.get('/riders', controller.getAllRidersLatest);

// GET /api/v1/locations/riders/:riderId/locations
// Retrieve the stored location history for one rider.
router.get('/riders/:riderId/locations', controller.getRiderLocations);

// GET /api/v1/locations/config
// Return current dynamic simulation configuration.
router.get('/config', controller.getConfig);

// POST /api/v1/locations/config
// Update simulation speedMultiplier in real time from UI.
router.post('/config', controller.updateConfig);

module.exports = router;
