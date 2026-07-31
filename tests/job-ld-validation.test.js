import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '..', '.temp-test-db');
const tempDbPath = path.join(tempDir, 'fletes-test-validation.db');

fs.mkdirSync(tempDir, { recursive: true });
if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
process.env.DB_PATH = tempDbPath;

const db = await import('../fletes-backend/src/db.js');
const { handleCreateJob, handleUpdateJob } = await import('../fletes-backend/src/index.js');

const mockReq = (body, params = {}) => ({ body, params, query: {} });
const mockRes = () => {
  const res = { _status: 200, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (data) => { res._body = data; return res; };
  return res;
};

const cleanup = () => {
  const drivers = db.listDrivers();
  for (const d of drivers) db.deleteDriver(d.id);
  const jobs = db.listJobs();
  for (const j of jobs) db.deleteJob(j.id);
  const vehicles = db.listVehicles();
  for (const v of vehicles) db.deleteVehicle(v.id);
};

process.on('exit', () => {
  try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch {}
});

const baseJob = (overrides = {}) => ({
  id: 'job-test',
  clientName: 'Cliente',
  pickup: { address: 'A', lat: -34.6, lng: -58.4 },
  dropoff: { address: 'B', lat: -34.7, lng: -58.5 },
  status: 'PENDING',
  flags: { nearPickupSent: false, arrivedPickupSent: false, nearDropoffSent: false, arrivedDropoffSent: false },
  timestamps: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('Job LD manualPrice validation (actual handlers)', () => {
  beforeEach(cleanup);

  describe('POST /jobs', () => {
    it('rejects new LD job without manualPrice', () => {
      const req = mockReq(baseJob({ isLongDistance: true }));
      const res = mockRes();
      handleCreateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('manualPrice'));
    });

    it('rejects new LD job with manualPrice null', () => {
      const req = mockReq(baseJob({ isLongDistance: true, manualPrice: null }));
      const res = mockRes();
      handleCreateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('manualPrice'));
    });

    it('rejects new LD job with manualPrice 0', () => {
      const req = mockReq(baseJob({ isLongDistance: true, manualPrice: 0 }));
      const res = mockRes();
      handleCreateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('manualPrice'));
    });

    it('accepts new LD job with valid manualPrice', () => {
      const req = mockReq(baseJob({ isLongDistance: true, manualPrice: 50000 }));
      const res = mockRes();
      handleCreateJob(req, res);
      assert.strictEqual(res._status, 201);
      assert.strictEqual(res._body.manualPrice, 50000);
    });

    it('accepts non-LD job without manualPrice', () => {
      const req = mockReq(baseJob());
      const res = mockRes();
      handleCreateJob(req, res);
      assert.strictEqual(res._status, 201);
      assert.strictEqual(res._body.manualPrice, undefined);
    });
  });

  describe('PATCH /jobs/:id', () => {
    beforeEach(() => {
      db.createVehicle({
        id: 'v1', name: 'Camion', size: 'large', ownershipType: 'owner',
        hourlyRate: 15000, costPerKm: 100, fixedMonthlyCost: 0, pricePerLongDistanceKm: 500,
      });
      db.createDriver({ id: 'd1', name: 'Chofer', code: 'CH01', vehicleId: 'v1' });
    });

    it('rejects non-LD -> LD without manualPrice', () => {
      db.createJob(baseJob({ id: 'j1' }));
      const req = mockReq({ isLongDistance: true }, { id: 'j1' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('switching to long-distance'));
    });

    it('rejects non-LD -> LD with manualPrice null', () => {
      db.createJob(baseJob({ id: 'j2' }));
      const req = mockReq({ isLongDistance: true, manualPrice: null }, { id: 'j2' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('switching to long-distance'));
    });

    it('rejects non-LD -> LD with manualPrice 0', () => {
      db.createJob(baseJob({ id: 'j3' }));
      const req = mockReq({ isLongDistance: true, manualPrice: 0 }, { id: 'j3' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('switching to long-distance'));
    });

    it('accepts non-LD -> LD with valid manualPrice', () => {
      db.createJob(baseJob({ id: 'j4' }));
      const req = mockReq({ isLongDistance: true, manualPrice: 50000 }, { id: 'j4' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.manualPrice, 50000);
    });

    it('allows legacy LD unrelated PATCH', () => {
      db.createJob(baseJob({
        id: 'j5', isLongDistance: true, driverId: 'd1', vehicleId: 'v1',
        distanceMeters: 383000, chargedAmount: 200000,
      }));
      const req = mockReq({ description: 'updated' }, { id: 'j5' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.description, 'updated');
    });

    it('rejects clearing manualPrice on compliant LD job', () => {
      db.createJob(baseJob({
        id: 'j6', isLongDistance: true, manualPrice: 50000,
        driverId: 'd1', vehicleId: 'v1',
      }));
      const req = mockReq({ manualPrice: null }, { id: 'j6' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 400);
      assert.ok(res._body.error.includes('cannot clear manualPrice'));
    });

    it('allows explicit null on legacy LD job without manualPrice', () => {
      db.createJob(baseJob({
        id: 'j7', isLongDistance: true, driverId: 'd1', vehicleId: 'v1',
      }));
      const req = mockReq({ manualPrice: null }, { id: 'j7' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.manualPrice, undefined);
    });

    it('accepts updating manualPrice on compliant LD job', () => {
      db.createJob(baseJob({
        id: 'j8', isLongDistance: true, manualPrice: 50000,
        driverId: 'd1', vehicleId: 'v1',
      }));
      const req = mockReq({ manualPrice: 75000 }, { id: 'j8' });
      const res = mockRes();
      handleUpdateJob(req, res);
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._body.manualPrice, 75000);
    });
  });
});

/**
 * PostgreSQL handler contract test limitation:
 *
 * The PostgreSQL handlers (api/v1/jobs/index.js, api/v1/jobs/[id].js) import
 * api/_db.js which eagerly requires POSTGRES_URL and creates a pg.Pool. They
 * cannot be imported without a live PostgreSQL connection string.
 *
 * Their validation logic is structurally identical to the SQLite handlers
 * tested above (same resulting-state check, same error messages, same
 * conditions). Both backends are kept in sync by this test suite and the
 * shared debt-refresh.test.js formula assertions.
 *
 * To test PostgreSQL handlers directly in CI: set POSTGRES_URL to a test
 * database, then import and invoke handleDefaultExport(req, res) from each
 * handler file with the same mock req/res pattern used above.
 */
