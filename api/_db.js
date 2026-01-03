import { sql } from '@vercel/postgres';

const BA_UTC_OFFSET_HOURS = 3;

const defaultFlags = {
  nearPickupSent: false,
  arrivedPickupSent: false,
  nearDropoffSent: false,
  arrivedDropoffSent: false,
};

const toJson = (value, fallback) => {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  const source = value ?? fallback;
  try {
    return JSON.stringify(source);
  } catch {
    return JSON.stringify(fallback);
  }
};

export const ensureSchema = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      description TEXT,
      pickup JSONB NOT NULL,
      dropoff JSONB NOT NULL,
      extra_stops JSONB,
      stop_index INTEGER,
      notes TEXT,
      driver_id TEXT,
      helpers_count INTEGER,
      estimated_duration_minutes INTEGER,
      charged_amount DOUBLE PRECISION,
      status TEXT NOT NULL,
      flags JSONB NOT NULL,
      timestamps JSONB NOT NULL,
      scheduled_date TEXT,
      scheduled_time TEXT,
      scheduled_at BIGINT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS driver_id TEXT;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS extra_stops JSONB;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stop_index INTEGER;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description TEXT;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helpers_count INTEGER;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS charged_amount DOUBLE PRECISION;`;
  await sql`
    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      phone TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS driver_locations (
      driver_id TEXT PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      accuracy DOUBLE PRECISION,
      heading DOUBLE PRECISION,
      speed DOUBLE PRECISION,
      job_id TEXT,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB
    );
  `;
};

export const computeScheduledAt = (date, time) => {
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

const normalizeRow = (row) => ({
  id: row.id,
  clientName: row.client_name,
  clientPhone: row.client_phone ?? undefined,
  description: row.description ?? undefined,
  pickup: row.pickup,
  dropoff: row.dropoff,
  extraStops: Array.isArray(row.extra_stops) ? row.extra_stops : [],
  stopIndex: row.stop_index != null ? Number(row.stop_index) : undefined,
  notes: row.notes ?? undefined,
  driverId: row.driver_id ?? undefined,
  helpersCount: row.helpers_count != null ? Number(row.helpers_count) : undefined,
  estimatedDurationMinutes: row.estimated_duration_minutes != null ? Number(row.estimated_duration_minutes) : undefined,
  chargedAmount: row.charged_amount != null ? Number(row.charged_amount) : undefined,
  status: row.status,
  flags: row.flags ?? defaultFlags,
  timestamps: row.timestamps ?? {},
  scheduledDate: row.scheduled_date ?? undefined,
  scheduledTime: row.scheduled_time ?? undefined,
  scheduledAt: row.scheduled_at != null ? Number(row.scheduled_at) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listJobs = async (opts = {}) => {
  await ensureSchema();
  if (opts.driverId) {
    const { rows } = await sql`SELECT * FROM jobs WHERE driver_id = ${opts.driverId} ORDER BY created_at DESC`;
    return rows.map(normalizeRow);
  }
  const { rows } = await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
  return rows.map(normalizeRow);
};

export const listCompletedJobs = async () => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM jobs WHERE status = 'DONE' ORDER BY updated_at DESC`;
  return rows.map(normalizeRow);
};

export const getJobById = async (id) => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM jobs WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return normalizeRow(rows[0]);
};

export const createJob = async (job) => {
  await ensureSchema();
  const scheduledAt = Number.isFinite(job.scheduledAt)
    ? job.scheduledAt
    : computeScheduledAt(job.scheduledDate, job.scheduledTime);
  const createdAt = job.createdAt ?? new Date().toISOString();
  const updatedAt = job.updatedAt ?? createdAt;
  const flags = job.flags ?? defaultFlags;
  const timestamps = job.timestamps ?? {};
  const stopIndex = Number.isInteger(job.stopIndex) && job.stopIndex >= 0 ? job.stopIndex : 0;
  const pickupJson = toJson(job.pickup, {});
  const dropoffJson = toJson(job.dropoff, {});
  const extraStopsJson = toJson(Array.isArray(job.extraStops) ? job.extraStops : [], []);
  const flagsJson = toJson(flags, defaultFlags);
  const timestampsJson = toJson(timestamps, {});

  await sql`
    INSERT INTO jobs (
      id, client_name, client_phone, description, pickup, dropoff, extra_stops, stop_index, notes, driver_id, helpers_count, estimated_duration_minutes, charged_amount, status,
      flags, timestamps, scheduled_date, scheduled_time, scheduled_at,
      created_at, updated_at
    ) VALUES (
      ${job.id},
      ${job.clientName},
      ${job.clientPhone ?? null},
      ${job.description ?? null},
      ${pickupJson}::jsonb,
      ${dropoffJson}::jsonb,
      ${extraStopsJson}::jsonb,
      ${stopIndex},
      ${job.notes ?? null},
      ${job.driverId ?? null},
      ${Number.isFinite(job.helpersCount) ? job.helpersCount : null},
      ${Number.isFinite(job.estimatedDurationMinutes) ? job.estimatedDurationMinutes : null},
      ${Number.isFinite(job.chargedAmount) ? job.chargedAmount : null},
      ${job.status},
      ${flagsJson}::jsonb,
      ${timestampsJson}::jsonb,
      ${job.scheduledDate ?? null},
      ${job.scheduledTime ?? null},
      ${scheduledAt ?? null},
      ${createdAt},
      ${updatedAt}
    )
  `;

  return getJobById(job.id);
};

export const updateJob = async (id, patch) => {
  const current = await getJobById(id);
  if (!current) return null;

  const scheduledDate = patch.scheduledDate ?? current.scheduledDate;
  const scheduledTime = patch.scheduledTime ?? current.scheduledTime;
  let scheduledAt = Number.isFinite(patch.scheduledAt) ? patch.scheduledAt : current.scheduledAt;
  if ((patch.scheduledDate || patch.scheduledTime) && !Number.isFinite(patch.scheduledAt)) {
    scheduledAt = computeScheduledAt(scheduledDate, scheduledTime);
  }
  const baseStopIndex = Number.isInteger(current.stopIndex) && current.stopIndex >= 0 ? current.stopIndex : 0;
  const requestedStopIndex = Number.isInteger(patch.stopIndex) && patch.stopIndex >= 0 ? patch.stopIndex : baseStopIndex;

  const next = {
    ...current,
    ...patch,
    scheduledDate,
    scheduledTime,
    scheduledAt,
    stopIndex: requestedStopIndex,
    flags: patch.flags ? { ...current.flags, ...patch.flags } : current.flags,
    timestamps: patch.timestamps ? { ...current.timestamps, ...patch.timestamps } : current.timestamps,
    updatedAt: new Date().toISOString(),
  };
  const pickupJson = toJson(next.pickup, {});
  const dropoffJson = toJson(next.dropoff, {});
  const extraStopsJson = toJson(Array.isArray(next.extraStops) ? next.extraStops : [], []);
  const flagsJson = toJson(next.flags ?? defaultFlags, defaultFlags);
  const timestampsJson = toJson(next.timestamps ?? {}, {});

  await sql`
    UPDATE jobs SET
      client_name = ${next.clientName},
      client_phone = ${next.clientPhone ?? null},
      description = ${next.description ?? null},
      pickup = ${pickupJson}::jsonb,
      dropoff = ${dropoffJson}::jsonb,
      extra_stops = ${extraStopsJson}::jsonb,
      stop_index = ${Number.isInteger(next.stopIndex) && next.stopIndex >= 0 ? next.stopIndex : 0},
      notes = ${next.notes ?? null},
      driver_id = ${next.driverId ?? null},
      helpers_count = ${Number.isFinite(next.helpersCount) ? next.helpersCount : null},
      estimated_duration_minutes = ${Number.isFinite(next.estimatedDurationMinutes) ? next.estimatedDurationMinutes : null},
      charged_amount = ${Number.isFinite(next.chargedAmount) ? next.chargedAmount : null},
      status = ${next.status},
      flags = ${flagsJson}::jsonb,
      timestamps = ${timestampsJson}::jsonb,
      scheduled_date = ${next.scheduledDate ?? null},
      scheduled_time = ${next.scheduledTime ?? null},
      scheduled_at = ${next.scheduledAt ?? null},
      created_at = ${next.createdAt},
      updated_at = ${next.updatedAt}
    WHERE id = ${id}
  `;

  return getJobById(id);
};

export const deleteJob = async (id) => {
  await ensureSchema();
  const result = await sql`DELETE FROM jobs WHERE id = ${id}`;
  return result.rowCount > 0;
};

const normalizeSettingValue = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

export const getSetting = async (key) => {
  await ensureSchema();
  const { rows } = await sql`SELECT value FROM settings WHERE key = ${key}`;
  if (rows.length === 0) return null;
  return normalizeSettingValue(rows[0].value);
};

export const setSetting = async (key, value) => {
  await ensureSchema();
  await sql`
    INSERT INTO settings (key, value)
    VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `;
  return getSetting(key);
};

const normalizeLocationRow = (row) => ({
  driverId: row.driver_id,
  lat: Number(row.lat),
  lng: Number(row.lng),
  accuracy: row.accuracy != null ? Number(row.accuracy) : null,
  heading: row.heading != null ? Number(row.heading) : null,
  speed: row.speed != null ? Number(row.speed) : null,
  jobId: row.job_id ?? null,
  updatedAt: row.updated_at,
});

export const listDriverLocations = async () => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM driver_locations ORDER BY updated_at DESC`;
  return rows.map(normalizeLocationRow);
};

export const upsertDriverLocation = async (location) => {
  await ensureSchema();
  const updatedAt = location.updatedAt ?? new Date().toISOString();
  await sql`
    INSERT INTO driver_locations (
      driver_id, lat, lng, accuracy, heading, speed, job_id, updated_at
    ) VALUES (
      ${location.driverId},
      ${location.lat},
      ${location.lng},
      ${location.accuracy ?? null},
      ${location.heading ?? null},
      ${location.speed ?? null},
      ${location.jobId ?? null},
      ${updatedAt}
    )
    ON CONFLICT (driver_id) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      accuracy = EXCLUDED.accuracy,
      heading = EXCLUDED.heading,
      speed = EXCLUDED.speed,
      job_id = EXCLUDED.job_id,
      updated_at = EXCLUDED.updated_at;
  `;
  const { rows } = await sql`SELECT * FROM driver_locations WHERE driver_id = ${location.driverId}`;
  if (rows.length === 0) return null;
  return normalizeLocationRow(rows[0]);
};

const normalizeDriverRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  phone: row.phone ?? undefined,
  active: row.active === true,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listDrivers = async () => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM drivers ORDER BY created_at DESC`;
  return rows.map(normalizeDriverRow);
};

export const getDriverById = async (id) => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM drivers WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return normalizeDriverRow(rows[0]);
};

export const getDriverByCode = async (code) => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM drivers WHERE code = ${code}`;
  if (rows.length === 0) return null;
  return normalizeDriverRow(rows[0]);
};

export const createDriver = async (driver) => {
  await ensureSchema();
  const createdAt = driver.createdAt ?? new Date().toISOString();
  const updatedAt = driver.updatedAt ?? createdAt;
  const active = typeof driver.active === 'boolean' ? driver.active : true;
  await sql`
    INSERT INTO drivers (
      id, name, code, phone, active, created_at, updated_at
    ) VALUES (
      ${driver.id},
      ${driver.name},
      ${driver.code},
      ${driver.phone ?? null},
      ${active},
      ${createdAt},
      ${updatedAt}
    )
  `;
  return getDriverById(driver.id);
};

export const updateDriver = async (id, patch) => {
  const current = await getDriverById(id);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    active: typeof patch.active === 'boolean' ? patch.active : current.active,
    updatedAt: new Date().toISOString(),
  };
  await sql`
    UPDATE drivers SET
      name = ${next.name},
      code = ${next.code},
      phone = ${next.phone ?? null},
      active = ${next.active},
      created_at = ${next.createdAt},
      updated_at = ${next.updatedAt}
    WHERE id = ${id}
  `;
  return getDriverById(id);
};

export const deleteDriver = async (id) => {
  await ensureSchema();
  await sql`UPDATE jobs SET driver_id = NULL WHERE driver_id = ${id}`;
  const result = await sql`DELETE FROM drivers WHERE id = ${id}`;
  return result.rowCount > 0;
};
