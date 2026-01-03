import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'fletes.db');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    clientName TEXT NOT NULL,
    clientPhone TEXT,
    description TEXT,
    pickup TEXT NOT NULL,
    dropoff TEXT NOT NULL,
    extraStops TEXT,
    stopIndex INTEGER,
    notes TEXT,
    driverId TEXT,
    helpersCount INTEGER,
    estimatedDurationMinutes INTEGER,
    chargedAmount REAL,
    status TEXT NOT NULL,
    flags TEXT NOT NULL,
    timestamps TEXT NOT NULL,
    scheduledDate TEXT,
    scheduledTime TEXT,
    scheduledAt INTEGER,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const ensureJobsColumns = () => {
  const columns = db.prepare('PRAGMA table_info(jobs)').all().map((col) => col.name);
  if (!columns.includes('driverId')) {
    db.exec('ALTER TABLE jobs ADD COLUMN driverId TEXT;');
  }
  if (!columns.includes('extraStops')) {
    db.exec('ALTER TABLE jobs ADD COLUMN extraStops TEXT;');
  }
  if (!columns.includes('stopIndex')) {
    db.exec('ALTER TABLE jobs ADD COLUMN stopIndex INTEGER;');
  }
  if (!columns.includes('description')) {
    db.exec('ALTER TABLE jobs ADD COLUMN description TEXT;');
  }
  if (!columns.includes('helpersCount')) {
    db.exec('ALTER TABLE jobs ADD COLUMN helpersCount INTEGER;');
  }
  if (!columns.includes('estimatedDurationMinutes')) {
    db.exec('ALTER TABLE jobs ADD COLUMN estimatedDurationMinutes INTEGER;');
  }
  if (!columns.includes('chargedAmount')) {
    db.exec('ALTER TABLE jobs ADD COLUMN chargedAmount REAL;');
  }
};

ensureJobsColumns();

db.exec(`
  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS driver_locations (
    driverId TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    accuracy REAL,
    heading REAL,
    speed REAL,
    jobId TEXT,
    updatedAt TEXT NOT NULL
  );
`);

const defaultFlags = {
  nearPickupSent: false,
  arrivedPickupSent: false,
  nearDropoffSent: false,
  arrivedDropoffSent: false,
};

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeExtraStops = (value) => (Array.isArray(value) ? value : []);

const BA_UTC_OFFSET_HOURS = 3;
const BA_TIMEZONE = 'America/Argentina/Buenos_Aires';

const computeScheduledAt = (date, time) => {
  if (!date || !time) return null;
  const dateParts = String(date).split('-').map(Number);
  const timeParts = String(time).split(':').map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  if ([...dateParts, ...timeParts].some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const scheduledAt = new Date(Date.UTC(year, month - 1, day, hour + BA_UTC_OFFSET_HOURS, minute, 0, 0));
  return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt.getTime();
};

const getBuenosAiresNow = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return new Date(year, month - 1, day, hour, minute, second, 0);
};

const toRow = (job) => ({
  id: job.id,
  clientName: job.clientName,
  clientPhone: job.clientPhone ?? null,
  description: job.description ?? null,
  pickup: JSON.stringify(job.pickup),
  dropoff: JSON.stringify(job.dropoff),
  extraStops: JSON.stringify(normalizeExtraStops(job.extraStops)),
  stopIndex: Number.isInteger(job.stopIndex) && job.stopIndex >= 0 ? job.stopIndex : 0,
  notes: job.notes ?? null,
  driverId: job.driverId ?? null,
  helpersCount: Number.isFinite(job.helpersCount) ? job.helpersCount : null,
  estimatedDurationMinutes: Number.isFinite(job.estimatedDurationMinutes) ? job.estimatedDurationMinutes : null,
  chargedAmount: Number.isFinite(job.chargedAmount) ? job.chargedAmount : null,
  status: job.status,
  flags: JSON.stringify(job.flags ?? defaultFlags),
  timestamps: JSON.stringify(job.timestamps ?? {}),
  scheduledDate: job.scheduledDate ?? null,
  scheduledTime: job.scheduledTime ?? null,
  scheduledAt: Number.isFinite(job.scheduledAt) ? job.scheduledAt : null,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

const fromRow = (row) => ({
  id: row.id,
  clientName: row.clientName,
  clientPhone: row.clientPhone ?? undefined,
  description: row.description ?? undefined,
  pickup: parseJson(row.pickup, null),
  dropoff: parseJson(row.dropoff, null),
  extraStops: parseJson(row.extraStops, []),
  stopIndex: Number.isInteger(row.stopIndex) ? row.stopIndex : undefined,
  notes: row.notes ?? undefined,
  driverId: row.driverId ?? undefined,
  helpersCount: Number.isFinite(row.helpersCount) ? row.helpersCount : undefined,
  estimatedDurationMinutes: Number.isFinite(row.estimatedDurationMinutes) ? row.estimatedDurationMinutes : undefined,
  chargedAmount: Number.isFinite(row.chargedAmount) ? row.chargedAmount : undefined,
  status: row.status,
  flags: parseJson(row.flags, defaultFlags),
  timestamps: parseJson(row.timestamps, {}),
  scheduledDate: row.scheduledDate ?? undefined,
  scheduledTime: row.scheduledTime ?? undefined,
  scheduledAt: row.scheduledAt ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const insertStmt = db.prepare(`
  INSERT INTO jobs (
    id, clientName, clientPhone, description, pickup, dropoff, extraStops, stopIndex, notes, driverId, helpersCount, estimatedDurationMinutes, chargedAmount, status,
    flags, timestamps, scheduledDate, scheduledTime, scheduledAt,
    createdAt, updatedAt
  ) VALUES (
    @id, @clientName, @clientPhone, @description, @pickup, @dropoff, @extraStops, @stopIndex, @notes, @driverId, @helpersCount, @estimatedDurationMinutes, @chargedAmount, @status,
    @flags, @timestamps, @scheduledDate, @scheduledTime, @scheduledAt,
    @createdAt, @updatedAt
  );
`);

const updateStmt = db.prepare(`
  UPDATE jobs SET
    clientName = @clientName,
    clientPhone = @clientPhone,
    description = @description,
    pickup = @pickup,
    dropoff = @dropoff,
    extraStops = @extraStops,
    stopIndex = @stopIndex,
    notes = @notes,
    driverId = @driverId,
    helpersCount = @helpersCount,
    estimatedDurationMinutes = @estimatedDurationMinutes,
    chargedAmount = @chargedAmount,
    status = @status,
    flags = @flags,
    timestamps = @timestamps,
    scheduledDate = @scheduledDate,
    scheduledTime = @scheduledTime,
    scheduledAt = @scheduledAt,
    createdAt = @createdAt,
    updatedAt = @updatedAt
  WHERE id = @id;
`);

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertSettingStmt = db.prepare(`
  INSERT INTO settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`);

export const listJobs = (opts = {}) => {
  if (opts.driverId) {
    const rows = db.prepare('SELECT * FROM jobs WHERE driverId = ? ORDER BY createdAt DESC').all(opts.driverId);
    return rows.map(fromRow);
  }
  const rows = db.prepare('SELECT * FROM jobs ORDER BY createdAt DESC').all();
  return rows.map(fromRow);
};

export const listCompletedJobs = () => {
  const rows = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY updatedAt DESC').all('DONE');
  return rows.map(fromRow);
};

export const getJob = (id) => {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return row ? fromRow(row) : null;
};

export const createJob = (job) => {
  const createdAt = job.createdAt ?? new Date().toISOString();
  const updatedAt = job.updatedAt ?? createdAt;
  const scheduledAt = Number.isFinite(job.scheduledAt)
    ? job.scheduledAt
    : computeScheduledAt(job.scheduledDate, job.scheduledTime);
  const row = toRow({
    ...job,
    flags: job.flags ?? defaultFlags,
    timestamps: job.timestamps ?? {},
    driverId: job.driverId ?? null,
    scheduledAt,
    createdAt,
    updatedAt,
  });
  insertStmt.run(row);
  return getJob(job.id);
};

export const updateJob = (id, patch) => {
  const current = getJob(id);
  if (!current) return null;
  const scheduledDate = patch.scheduledDate ?? current.scheduledDate;
  const scheduledTime = patch.scheduledTime ?? current.scheduledTime;
  let scheduledAt = Number.isFinite(patch.scheduledAt) ? patch.scheduledAt : current.scheduledAt;
  if ((patch.scheduledDate || patch.scheduledTime) && !Number.isFinite(patch.scheduledAt)) {
    scheduledAt = computeScheduledAt(scheduledDate, scheduledTime);
  }
  const next = {
    ...current,
    ...patch,
    scheduledDate,
    scheduledTime,
    scheduledAt,
    flags: patch.flags ? { ...current.flags, ...patch.flags } : current.flags,
    timestamps: patch.timestamps ? { ...current.timestamps, ...patch.timestamps } : current.timestamps,
    updatedAt: new Date().toISOString(),
  };
  updateStmt.run(toRow(next));
  return getJob(id);
};

export const deleteJob = (id) => {
  const info = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return info.changes > 0;
};

export const getSetting = (key) => {
  const row = getSettingStmt.get(key);
  if (!row) return null;
  return parseJson(row.value, row.value);
};

export const setSetting = (key, value) => {
  const storedValue = JSON.stringify(value);
  upsertSettingStmt.run(key, storedValue);
  return getSetting(key);
};

const toDriverRow = (driver) => ({
  id: driver.id,
  name: driver.name,
  code: driver.code,
  phone: driver.phone ?? null,
  active: driver.active ? 1 : 0,
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

const fromDriverRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  phone: row.phone ?? undefined,
  active: row.active === 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const insertDriverStmt = db.prepare(`
  INSERT INTO drivers (
    id, name, code, phone, active, createdAt, updatedAt
  ) VALUES (
    @id, @name, @code, @phone, @active, @createdAt, @updatedAt
  );
`);

const updateDriverStmt = db.prepare(`
  UPDATE drivers SET
    name = @name,
    code = @code,
    phone = @phone,
    active = @active,
    createdAt = @createdAt,
    updatedAt = @updatedAt
  WHERE id = @id;
`);

export const listDrivers = () => {
  const rows = db.prepare('SELECT * FROM drivers ORDER BY createdAt DESC').all();
  return rows.map(fromDriverRow);
};

export const getDriverById = (id) => {
  const row = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
  return row ? fromDriverRow(row) : null;
};

export const getDriverByCode = (code) => {
  const row = db.prepare('SELECT * FROM drivers WHERE code = ?').get(code);
  return row ? fromDriverRow(row) : null;
};

export const createDriver = (driver) => {
  const createdAt = driver.createdAt ?? new Date().toISOString();
  const updatedAt = driver.updatedAt ?? createdAt;
  const row = toDriverRow({
    ...driver,
    active: driver.active ?? true,
    createdAt,
    updatedAt,
  });
  insertDriverStmt.run(row);
  return getDriverById(driver.id);
};

export const updateDriver = (id, patch) => {
  const current = getDriverById(id);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    active: typeof patch.active === 'boolean' ? patch.active : current.active,
    updatedAt: new Date().toISOString(),
  };
  updateDriverStmt.run(toDriverRow(next));
  return getDriverById(id);
};

export const deleteDriver = (id) => {
  db.prepare('UPDATE jobs SET driverId = NULL WHERE driverId = ?').run(id);
  const info = db.prepare('DELETE FROM drivers WHERE id = ?').run(id);
  return info.changes > 0;
};

const toLocationRow = (location) => ({
  driverId: location.driverId,
  lat: location.lat,
  lng: location.lng,
  accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null,
  heading: Number.isFinite(location.heading) ? location.heading : null,
  speed: Number.isFinite(location.speed) ? location.speed : null,
  jobId: location.jobId ?? null,
  updatedAt: location.updatedAt,
});

const fromLocationRow = (row) => ({
  driverId: row.driverId,
  lat: row.lat,
  lng: row.lng,
  accuracy: row.accuracy ?? null,
  heading: row.heading ?? null,
  speed: row.speed ?? null,
  jobId: row.jobId ?? null,
  updatedAt: row.updatedAt,
});

const upsertLocationStmt = db.prepare(`
  INSERT INTO driver_locations (
    driverId, lat, lng, accuracy, heading, speed, jobId, updatedAt
  ) VALUES (
    @driverId, @lat, @lng, @accuracy, @heading, @speed, @jobId, @updatedAt
  )
  ON CONFLICT(driverId) DO UPDATE SET
    lat = excluded.lat,
    lng = excluded.lng,
    accuracy = excluded.accuracy,
    heading = excluded.heading,
    speed = excluded.speed,
    jobId = excluded.jobId,
    updatedAt = excluded.updatedAt;
`);

export const upsertDriverLocation = (location) => {
  const updatedAt = location.updatedAt ?? new Date().toISOString();
  upsertLocationStmt.run(toLocationRow({ ...location, updatedAt }));
  return getDriverLocation(location.driverId);
};

export const listDriverLocations = () => {
  const rows = db.prepare('SELECT * FROM driver_locations ORDER BY updatedAt DESC').all();
  return rows.map(fromLocationRow);
};

export const getDriverLocation = (driverId) => {
  const row = db.prepare('SELECT * FROM driver_locations WHERE driverId = ?').get(driverId);
  return row ? fromLocationRow(row) : null;
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (date) => {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
};

const buildJob = (id, clientName, pickup, dropoff, when) => {
  const scheduledDate = formatDate(when);
  const scheduledTime = formatTime(when);
  return {
    id,
    clientName,
    pickup,
    dropoff,
    status: 'PENDING',
    flags: defaultFlags,
    timestamps: {},
    scheduledDate,
    scheduledTime,
    scheduledAt: computeScheduledAt(scheduledDate, scheduledTime),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const seedJobsIfEmpty = () => {
  const count = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
  if (count > 0) return { seeded: false, count };
  const now = getBuenosAiresNow();
  const in45 = new Date(now.getTime() + 45 * 60 * 1000);
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(9, 30, 0, 0);

  const pickupA = { address: 'Plaza Moreno, La Plata', lat: -34.9212, lng: -57.9545 };
  const dropoffA = { address: 'Estacion de La Plata', lat: -34.9089, lng: -57.9508 };
  const pickupB = { address: 'City Bell', lat: -34.8631, lng: -58.0509 };
  const dropoffB = { address: 'Gonnet', lat: -34.8547, lng: -58.0159 };
  const pickupC = { address: 'Universidad Nacional de La Plata', lat: -34.9205, lng: -57.9536 };
  const dropoffC = { address: 'Terminal de Omnibus La Plata', lat: -34.9131, lng: -57.9507 };

  const jobs = [
    buildJob(crypto.randomUUID(), 'Prueba Hoy (menos de 1h)', pickupA, dropoffA, in45),
    buildJob(crypto.randomUUID(), 'Prueba Hoy (+2h)', pickupB, dropoffB, in2h),
    buildJob(crypto.randomUUID(), 'Prueba Manana 9:30', pickupC, dropoffC, tomorrow),
  ];

  jobs.forEach((job) => createJob(job));
  return { seeded: true, count: jobs.length };
};
