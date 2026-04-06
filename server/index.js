import express from 'express';
import cors from 'cors';

import geocodeHandler from '../api/geocode.js';
import routeHandler from '../api/route.js';
import reverseGeocodeHandler from '../api/reverse-geocode.js';
import driverLocationsIndexHandler from '../api/v1/driver-locations/index.js';
import driversByIdHandler from '../api/v1/drivers/[id].js';
import driversIndexHandler from '../api/v1/drivers/index.js';
import jobsByIdHandler from '../api/v1/jobs/[id].js';
import jobsIndexHandler from '../api/v1/jobs/index.js';
import jobsHistoryHandler from '../api/v1/jobs/history/[action].js';
import leadsByIdHandler from '../api/v1/leads/[id].js';
import leadsIndexHandler from '../api/v1/leads/index.js';
import settingsByKeyHandler from '../api/v1/settings/[key].js';
import vehiclesByIdHandler from '../api/v1/vehicles/[id].js';
import vehiclesIndexHandler from '../api/v1/vehicles/index.js';

const PORT = Number(process.env.PORT) || 4000;

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const wrapHandler = (handler) => async (req, res, next) => {
  const mergedQuery = {
    ...(req.query ?? {}),
    ...(req.params ?? {}),
  };
  const wrappedReq = Object.create(req);
  wrappedReq.query = mergedQuery;

  try {
    await handler(wrappedReq, res);
  } catch (error) {
    next(error);
  }
};

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.all('/api/geocode', wrapHandler(geocodeHandler));
app.all('/api/route', wrapHandler(routeHandler));
app.all('/api/reverse-geocode', wrapHandler(reverseGeocodeHandler));

app.all('/api/v1/jobs/history/:action', wrapHandler(jobsHistoryHandler));
app.all('/api/v1/jobs/:id', wrapHandler(jobsByIdHandler));
app.all('/api/v1/jobs', wrapHandler(jobsIndexHandler));

app.all('/api/v1/drivers/:id', wrapHandler(driversByIdHandler));
app.all('/api/v1/drivers', wrapHandler(driversIndexHandler));

app.all('/api/v1/vehicles/:id', wrapHandler(vehiclesByIdHandler));
app.all('/api/v1/vehicles', wrapHandler(vehiclesIndexHandler));

app.all('/api/v1/settings/:key', wrapHandler(settingsByKeyHandler));
app.all('/api/v1/driver-locations', wrapHandler(driverLocationsIndexHandler));

app.all('/api/v1/leads/:id', wrapHandler(leadsByIdHandler));
app.all('/api/v1/leads', wrapHandler(leadsIndexHandler));

app.use((error, _req, res, _next) => {
  const detail = error instanceof Error ? error.message : 'Unknown error';
  console.error('[api]', error);
  res.status(500).json({ error: 'Server error', detail });
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
