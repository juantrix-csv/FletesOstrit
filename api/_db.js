import { sql } from '@vercel/postgres';

const BA_UTC_OFFSET_HOURS = 3;

const defaultFlags = {
  nearPickupSent: false,
  arrivedPickupSent: false,
  nearDropoffSent: false,
  arrivedDropoffSent: false,
};

export const ensureSchema = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      pickup JSONB NOT NULL,
      dropoff JSONB NOT NULL,
      notes TEXT,
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
  pickup: row.pickup,
  dropoff: row.dropoff,
  notes: row.notes ?? undefined,
  status: row.status,
  flags: row.flags ?? defaultFlags,
  timestamps: row.timestamps ?? {},
  scheduledDate: row.scheduled_date ?? undefined,
  scheduledTime: row.scheduled_time ?? undefined,
  scheduledAt: row.scheduled_at != null ? Number(row.scheduled_at) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listJobs = async () => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
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

  await sql`
    INSERT INTO jobs (
      id, client_name, client_phone, pickup, dropoff, notes, status,
      flags, timestamps, scheduled_date, scheduled_time, scheduled_at,
      created_at, updated_at
    ) VALUES (
      ${job.id},
      ${job.clientName},
      ${job.clientPhone ?? null},
      ${job.pickup},
      ${job.dropoff},
      ${job.notes ?? null},
      ${job.status},
      ${flags},
      ${timestamps},
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

  await sql`
    UPDATE jobs SET
      client_name = ${next.clientName},
      client_phone = ${next.clientPhone ?? null},
      pickup = ${next.pickup},
      dropoff = ${next.dropoff},
      notes = ${next.notes ?? null},
      status = ${next.status},
      flags = ${next.flags ?? defaultFlags},
      timestamps = ${next.timestamps ?? {}},
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
