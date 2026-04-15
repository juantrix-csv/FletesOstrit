import pg from 'pg';
import { getBilledHoursFromDurationMs } from '../lib/billing.js';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_URL ?? '';
if (!connectionString.trim()) {
  throw new Error('Missing POSTGRES_URL');
}

const pool = new Pool({ connectionString });

const sql = async (strings, ...values) => {
  let text = '';
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index];
    if (index < values.length) {
      text += `$${index + 1}`;
    }
  }
  return pool.query(text, values);
};

const BA_UTC_OFFSET_HOURS = 3;

const defaultFlags = {
  nearPickupSent: false,
  arrivedPickupSent: false,
  nearDropoffSent: false,
  arrivedDropoffSent: false,
};

const ACTIVE_JOB_STATUSES = new Set(['TO_PICKUP', 'LOADING', 'TO_DROPOFF', 'UNLOADING']);
const LEAD_STATUSES = new Set(['LOST']);
const LEAD_LOSS_REASONS = new Set([
  'NO_AVAILABILITY',
  'OUT_OF_AREA',
  'NO_RESPONSE',
  'PRICE',
  'HIRED_OTHER',
  'NOT_OUR_SERVICE',
  'OTHER',
]);
const LEAD_REQUESTED_SLOTS = new Set([
  'NOW',
  'TODAY',
  'TOMORROW',
  'THIS_WEEK',
  'UNSPECIFIED',
]);
const LEAD_JOB_TYPES = new Set([
  'FLETE_SIMPLE',
  'MUDANZA',
  'CON_AYUDANTE',
  'RETIRO_ENTREGA',
  'UNSPECIFIED',
]);
const MAX_TRACK_ACCURACY_METERS = 60;
const MIN_TRACK_DISTANCE_METERS = 6;
const MAX_TRACK_SPEED_MPS = 45;
const MAX_TRACK_INTERVAL_MS = 5 * 60 * 1000;
const OWNER_ACCOUNT_DRIVER_CODE = '6666';
const leadStatusLabels = {
  LOST: 'Perdido',
};
const leadLossReasonLabels = {
  NO_AVAILABILITY: 'Sin disponibilidad',
  OUT_OF_AREA: 'Zona lejana',
  NO_RESPONSE: 'Dejo de responder',
  PRICE: 'Precio',
  HIRED_OTHER: 'Eligio otra opcion',
  NOT_OUR_SERVICE: 'No era para nosotros',
  OTHER: 'Otro',
};
const leadRequestedSlotLabels = {
  NOW: 'Ahora',
  TODAY: 'Hoy',
  TOMORROW: 'Manana',
  THIS_WEEK: 'Esta semana',
  UNSPECIFIED: 'Sin definir',
};
const leadJobTypeLabels = {
  FLETE_SIMPLE: 'Flete simple',
  MUDANZA: 'Mudanza',
  CON_AYUDANTE: 'Con ayudante',
  RETIRO_ENTREGA: 'Retiro y entrega',
  UNSPECIFIED: 'Sin definir',
};

const toRadians = (value) => (value * Math.PI) / 180;
const calculateDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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

const toMoneyOrNull = (value) => {
  if (!Number.isFinite(value) || value < 0) return null;
  return Number(Number(value).toFixed(2));
};

const sumMoney = (...values) => {
  const total = values.reduce((sum, value) => sum + (value ?? 0), 0);
  return Number(total.toFixed(2));
};

const resolvePaymentFields = ({ current = null, patch = {}, useCurrent = false } = {}) => {
  const hasCashPatch = Object.prototype.hasOwnProperty.call(patch, 'cashAmount');
  const hasTransferPatch = Object.prototype.hasOwnProperty.call(patch, 'transferAmount');
  const hasChargedPatch = Object.prototype.hasOwnProperty.call(patch, 'chargedAmount');

  if (hasCashPatch || hasTransferPatch) {
    const cashAmount = hasCashPatch
      ? toMoneyOrNull(patch.cashAmount)
      : toMoneyOrNull(current?.cashAmount);
    const transferAmount = hasTransferPatch
      ? toMoneyOrNull(patch.transferAmount)
      : toMoneyOrNull(current?.transferAmount);
    return {
      cashAmount,
      transferAmount,
      chargedAmount: cashAmount != null || transferAmount != null
        ? sumMoney(cashAmount, transferAmount)
        : null,
    };
  }

  if (hasChargedPatch) {
    return {
      cashAmount: null,
      transferAmount: null,
      chargedAmount: toMoneyOrNull(patch.chargedAmount),
    };
  }

  if (useCurrent) {
    return {
      cashAmount: toMoneyOrNull(current?.cashAmount),
      transferAmount: toMoneyOrNull(current?.transferAmount),
      chargedAmount: toMoneyOrNull(current?.chargedAmount),
    };
  }

  return {
    cashAmount: null,
    transferAmount: null,
    chargedAmount: toMoneyOrNull(patch.chargedAmount),
  };
};

const normalizeLeadStatus = (value) => (LEAD_STATUSES.has(value) ? value : 'LOST');

const normalizeLeadLossReason = (value) => (LEAD_LOSS_REASONS.has(value) ? value : null);
const normalizeLeadRequestedSlot = (value) => (LEAD_REQUESTED_SLOTS.has(value) ? value : 'UNSPECIFIED');
const normalizeLeadJobType = (value) => (LEAD_JOB_TYPES.has(value) ? value : 'UNSPECIFIED');
const buildLeadRecordName = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Venta perdida';
  const dateLabel = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  const timeLabel = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `Perdido ${dateLabel} ${timeLabel}`;
};

const sanitizeLeadHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry, index) => {
      const createdAt = typeof entry?.createdAt === 'string' ? entry.createdAt : new Date().toISOString();
      const status = normalizeLeadStatus(entry?.status);
      const lossReason = normalizeLeadLossReason(entry?.lossReason);
      const type = entry?.type === 'CREATED' ? 'CREATED' : 'UPDATED';
      const message = typeof entry?.message === 'string' && entry.message.trim()
        ? entry.message.trim()
        : type === 'CREATED'
          ? 'Lead creado'
          : 'Lead actualizado';
      return {
        id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id : `history-${createdAt}-${index}`,
        type,
        message,
        status,
        lossReason,
        note: typeof entry?.note === 'string' && entry.note.trim() ? entry.note.trim() : null,
        createdAt,
      };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

const buildLeadHistoryEntry = ({
  type = 'UPDATED',
  status = 'LOST',
  lossReason = null,
  note = null,
  message,
  createdAt = new Date().toISOString(),
} = {}) => ({
  id: `lead-history-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  message: typeof message === 'string' && message.trim()
    ? message.trim()
    : type === 'CREATED'
      ? 'Lead creado'
      : 'Lead actualizado',
  status: normalizeLeadStatus(status),
  lossReason: normalizeLeadLossReason(lossReason),
  note: typeof note === 'string' && note.trim() ? note.trim() : null,
  createdAt,
});

const formatLeadStatusLabel = (status) => leadStatusLabels[normalizeLeadStatus(status)] ?? 'Nuevo';

const formatLeadLossReasonLabel = (reason) => leadLossReasonLabels[reason] ?? 'Otro';
const formatLeadRequestedSlotLabel = (slot) => leadRequestedSlotLabels[normalizeLeadRequestedSlot(slot)] ?? 'Sin definir';
const formatLeadJobTypeLabel = (jobType) => leadJobTypeLabels[normalizeLeadJobType(jobType)] ?? 'Sin definir';

const buildLeadChangeMessage = ({ current = null, next, historyNote = null }) => {
  const changes = [];
  if (!current) {
    changes.push(`Venta perdida registrada como ${formatLeadLossReasonLabel(next.lossReason)}`);
  } else {
    if ((current.lossReason ?? null) !== (next.lossReason ?? null)) {
      const nextReasonLabel = next.lossReason ? formatLeadLossReasonLabel(next.lossReason) : 'sin motivo';
      changes.push(`Motivo: ${nextReasonLabel}`);
    }
    if ((current.requestedSlot ?? 'UNSPECIFIED') !== (next.requestedSlot ?? 'UNSPECIFIED')) {
      changes.push(`Franja: ${formatLeadRequestedSlotLabel(next.requestedSlot)}`);
    }
    if ((current.originZone ?? null) !== (next.originZone ?? null) || (current.destinationZone ?? null) !== (next.destinationZone ?? null)) {
      changes.push('Zona actualizada');
    }
    if ((current.jobType ?? 'UNSPECIFIED') !== (next.jobType ?? 'UNSPECIFIED')) {
      changes.push(`Tipo: ${formatLeadJobTypeLabel(next.jobType)}`);
    }
  }
  if (typeof historyNote === 'string' && historyNote.trim()) {
    changes.push(`Seguimiento: ${historyNote.trim()}`);
  }
  if (changes.length === 0) return 'Venta perdida actualizada';
  return changes.join('. ');
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
      distance_meters DOUBLE PRECISION,
      last_track_lat DOUBLE PRECISION,
      last_track_lng DOUBLE PRECISION,
      last_track_at BIGINT,
      notes TEXT,
      driver_id TEXT,
      vehicle_id TEXT,
      helpers_count INTEGER,
      estimated_duration_minutes INTEGER,
      charged_amount DOUBLE PRECISION,
      cash_amount DOUBLE PRECISION,
      transfer_amount DOUBLE PRECISION,
      hourly_billed_hours DOUBLE PRECISION,
      hourly_base_amount DOUBLE PRECISION,
      driver_share_amount DOUBLE PRECISION,
      company_share_amount DOUBLE PRECISION,
      driver_share_ratio DOUBLE PRECISION,
      share_source TEXT,
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
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vehicle_id TEXT;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS extra_stops JSONB;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stop_index INTEGER;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_track_lat DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_track_lng DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_track_at BIGINT;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description TEXT;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helpers_count INTEGER;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS charged_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cash_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS transfer_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hourly_billed_hours DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hourly_base_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS driver_share_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_share_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS driver_share_ratio DOUBLE PRECISION;`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS share_source TEXT;`;
  await sql`
    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      phone TEXT,
      vehicle_id TEXT,
      owner_debt_settled_amount DOUBLE PRECISION,
      owner_debt_settled_at TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_id TEXT;`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS owner_debt_settled_amount DOUBLE PRECISION;`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS owner_debt_settled_at TEXT;`;
  await sql`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      ownership_type TEXT NOT NULL DEFAULT 'owner',
      hourly_rate DOUBLE PRECISION,
      cost_per_km DOUBLE PRECISION NOT NULL,
      fixed_monthly_cost DOUBLE PRECISION NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ownership_type TEXT;`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS hourly_rate DOUBLE PRECISION;`;
  await sql`UPDATE vehicles SET ownership_type = 'owner' WHERE ownership_type IS NULL;`;
  await sql`ALTER TABLE vehicles ALTER COLUMN ownership_type SET DEFAULT 'owner';`;
  await sql`ALTER TABLE vehicles ALTER COLUMN ownership_type SET NOT NULL;`;
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
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      description TEXT,
      requested_date TEXT,
      requested_time TEXT,
      requested_slot TEXT,
      origin_zone TEXT,
      destination_zone TEXT,
      job_type TEXT,
      status TEXT NOT NULL,
      loss_reason TEXT,
      notes TEXT,
      history JSONB NOT NULL,
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_phone TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS description TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS requested_date TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS requested_time TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS requested_slot TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin_zone TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS destination_zone TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_type TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS loss_reason TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS history JSONB;`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_at TEXT;`;
  await sql`UPDATE leads SET requested_slot = 'UNSPECIFIED' WHERE requested_slot IS NULL;`;
  await sql`UPDATE leads SET job_type = 'UNSPECIFIED' WHERE job_type IS NULL;`;
  await sql`UPDATE leads SET history = '[]'::jsonb WHERE history IS NULL;`;
  await sql`ALTER TABLE leads ALTER COLUMN history SET DEFAULT '[]'::jsonb;`;
  await sql`ALTER TABLE leads ALTER COLUMN history SET NOT NULL;`;
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

const normalizeRow = (row) => {
  const distanceMeters = row.distance_meters != null ? Number(row.distance_meters) : undefined;
  const cashAmount = row.cash_amount != null ? Number(row.cash_amount) : undefined;
  const transferAmount = row.transfer_amount != null ? Number(row.transfer_amount) : undefined;
  const fallbackChargedAmount = cashAmount != null || transferAmount != null
    ? sumMoney(cashAmount ?? null, transferAmount ?? null)
    : undefined;
  return {
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone ?? undefined,
    description: row.description ?? undefined,
    pickup: row.pickup,
    dropoff: row.dropoff,
    extraStops: Array.isArray(row.extra_stops) ? row.extra_stops : [],
    stopIndex: row.stop_index != null ? Number(row.stop_index) : undefined,
    distanceMeters,
    distanceKm: distanceMeters != null ? distanceMeters / 1000 : undefined,
    notes: row.notes ?? undefined,
    driverId: row.driver_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    helpersCount: row.helpers_count != null ? Number(row.helpers_count) : undefined,
    estimatedDurationMinutes: row.estimated_duration_minutes != null ? Number(row.estimated_duration_minutes) : undefined,
    chargedAmount: row.charged_amount != null ? Number(row.charged_amount) : fallbackChargedAmount,
    cashAmount,
    transferAmount,
    hourlyBilledHours: row.hourly_billed_hours != null ? Number(row.hourly_billed_hours) : undefined,
    hourlyBaseAmount: row.hourly_base_amount != null ? Number(row.hourly_base_amount) : undefined,
    driverShareAmount: row.driver_share_amount != null ? Number(row.driver_share_amount) : undefined,
    companyShareAmount: row.company_share_amount != null ? Number(row.company_share_amount) : undefined,
    driverShareRatio: row.driver_share_ratio != null ? Number(row.driver_share_ratio) : undefined,
    shareSource: row.share_source ?? undefined,
    status: row.status,
    flags: row.flags ?? defaultFlags,
    timestamps: row.timestamps ?? {},
    scheduledDate: row.scheduled_date ?? undefined,
    scheduledTime: row.scheduled_time ?? undefined,
    scheduledAt: row.scheduled_at != null ? Number(row.scheduled_at) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const parseTimestampMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const getBilledHoursFromTimestamps = (timestamps) => {
  const startMs = parseTimestampMs(timestamps?.startJobAt)
    ?? parseTimestampMs(timestamps?.startLoadingAt)
    ?? parseTimestampMs(timestamps?.startTripAt)
    ?? parseTimestampMs(timestamps?.startUnloadingAt)
    ?? null;
  const endMs = parseTimestampMs(timestamps?.endUnloadingAt)
    ?? parseTimestampMs(timestamps?.endTripAt)
    ?? null;
  if (startMs == null || endMs == null) return null;
  return getBilledHoursFromDurationMs(Math.max(0, endMs - startMs));
};

const toFiniteOrNull = (value) => (Number.isFinite(value) ? value : null);

const resolveJobVehicle = async (job, driver = null) => {
  if (job.vehicleId) {
    return getVehicleById(job.vehicleId);
  }
  if (driver?.vehicleId) {
    return getVehicleById(driver.vehicleId);
  }
  return null;
};

const resolveDriverShareRatio = async (job, driver, vehicle) => {
  if (!job.driverId) {
    return { ratio: 0, source: 'no_driver' };
  }

  if (!driver) {
    return { ratio: 0, source: 'driver_not_found' };
  }

  if (String(driver.code ?? '').trim() === OWNER_ACCOUNT_DRIVER_CODE) {
    return { ratio: 0, source: 'owner_account' };
  }

  const ownerVehicleSetting = await getSetting('ownerVehicleDriverShare');
  const driverVehicleSetting = await getSetting('driverVehicleDriverShare');
  const ownerVehicleRatio = Number.isFinite(ownerVehicleSetting) && ownerVehicleSetting >= 0 && ownerVehicleSetting <= 1
    ? ownerVehicleSetting
    : (1 / 3);
  const driverVehicleRatio = Number.isFinite(driverVehicleSetting) && driverVehicleSetting >= 0 && driverVehicleSetting <= 1
    ? driverVehicleSetting
    : (2 / 3);

  if (!vehicle) {
    return { ratio: ownerVehicleRatio, source: 'owner_vehicle_no_assignment' };
  }

  if (vehicle?.ownershipType === 'driver') {
    return { ratio: driverVehicleRatio, source: 'driver_vehicle' };
  }
  return { ratio: ownerVehicleRatio, source: 'owner_vehicle' };
};

const buildJobShareSnapshot = async (job) => {
  if (job.status !== 'DONE') {
    return {
      hourlyBilledHours: null,
      hourlyBaseAmount: null,
      driverShareAmount: null,
      companyShareAmount: null,
      driverShareRatio: null,
      shareSource: null,
    };
  }

  const billedHours = getBilledHoursFromTimestamps(job.timestamps);
  const driver = job.driverId ? await getDriverById(job.driverId) : null;
  const vehicle = await resolveJobVehicle(job, driver);
  const vehicleHourlyRate = Number.isFinite(vehicle?.hourlyRate) ? Number(vehicle.hourlyRate) : null;
  const hourlyRateSetting = await getSetting('hourlyRate');
  const hourlyRate = vehicleHourlyRate ?? (Number.isFinite(hourlyRateSetting) ? hourlyRateSetting : null);
  const baseAmount = billedHours != null && hourlyRate != null
    ? Number((billedHours * hourlyRate).toFixed(2))
    : null;

  const { ratio, source } = await resolveDriverShareRatio(job, driver, vehicle);

  if (baseAmount == null) {
    return {
      hourlyBilledHours: billedHours,
      hourlyBaseAmount: null,
      driverShareAmount: null,
      companyShareAmount: null,
      driverShareRatio: ratio,
      shareSource: source,
    };
  }

  const driverShareAmount = Number((baseAmount * ratio).toFixed(2));
  const companyShareAmount = Number((baseAmount - driverShareAmount).toFixed(2));

  return {
    hourlyBilledHours: billedHours,
    hourlyBaseAmount: baseAmount,
    driverShareAmount,
    companyShareAmount,
    driverShareRatio: ratio,
    shareSource: source,
  };
};

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
  const distanceMeters = Number.isFinite(job.distanceMeters) ? job.distanceMeters : 0;
  const pickupJson = toJson(job.pickup, {});
  const dropoffJson = toJson(job.dropoff, {});
  const extraStopsJson = toJson(Array.isArray(job.extraStops) ? job.extraStops : [], []);
  const flagsJson = toJson(flags, defaultFlags);
  const timestampsJson = toJson(timestamps, {});
  const payment = resolvePaymentFields({ patch: job });
  const shareSnapshot = await buildJobShareSnapshot({
    ...job,
    timestamps,
  });

  await sql`
    INSERT INTO jobs (
      id, client_name, client_phone, description, pickup, dropoff, extra_stops, stop_index, distance_meters, last_track_lat, last_track_lng, last_track_at, notes, driver_id, vehicle_id, helpers_count, estimated_duration_minutes, charged_amount, cash_amount, transfer_amount,
      hourly_billed_hours, hourly_base_amount, driver_share_amount, company_share_amount, driver_share_ratio, share_source, status,
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
      ${distanceMeters},
      ${null},
      ${null},
      ${null},
      ${job.notes ?? null},
      ${job.driverId ?? null},
      ${job.vehicleId ?? null},
      ${Number.isFinite(job.helpersCount) ? job.helpersCount : null},
      ${Number.isFinite(job.estimatedDurationMinutes) ? job.estimatedDurationMinutes : null},
      ${payment.chargedAmount},
      ${payment.cashAmount},
      ${payment.transferAmount},
      ${toFiniteOrNull(shareSnapshot.hourlyBilledHours)},
      ${toFiniteOrNull(shareSnapshot.hourlyBaseAmount)},
      ${toFiniteOrNull(shareSnapshot.driverShareAmount)},
      ${toFiniteOrNull(shareSnapshot.companyShareAmount)},
      ${toFiniteOrNull(shareSnapshot.driverShareRatio)},
      ${shareSnapshot.shareSource ?? null},
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
  const payment = resolvePaymentFields({
    current,
    patch,
    useCurrent: !Object.prototype.hasOwnProperty.call(patch, 'cashAmount')
      && !Object.prototype.hasOwnProperty.call(patch, 'transferAmount')
      && !Object.prototype.hasOwnProperty.call(patch, 'chargedAmount'),
  });
  next.chargedAmount = payment.chargedAmount;
  next.cashAmount = payment.cashAmount;
  next.transferAmount = payment.transferAmount;
  const pickupJson = toJson(next.pickup, {});
  const dropoffJson = toJson(next.dropoff, {});
  const extraStopsJson = toJson(Array.isArray(next.extraStops) ? next.extraStops : [], []);
  const flagsJson = toJson(next.flags ?? defaultFlags, defaultFlags);
  const timestampsJson = toJson(next.timestamps ?? {}, {});
  let shareSnapshot = null;
  if (next.status !== 'DONE') {
    shareSnapshot = {
      hourlyBilledHours: null,
      hourlyBaseAmount: null,
      driverShareAmount: null,
      companyShareAmount: null,
      driverShareRatio: null,
      shareSource: null,
    };
  } else {
    const mustRecomputeShare = current.status !== 'DONE'
      || Object.prototype.hasOwnProperty.call(patch, 'status')
      || Object.prototype.hasOwnProperty.call(patch, 'driverId')
      || Object.prototype.hasOwnProperty.call(patch, 'vehicleId')
      || Object.prototype.hasOwnProperty.call(patch, 'timestamps');

    if (mustRecomputeShare) {
      shareSnapshot = await buildJobShareSnapshot(next);
    } else {
      shareSnapshot = {
        hourlyBilledHours: toFiniteOrNull(current.hourlyBilledHours),
        hourlyBaseAmount: toFiniteOrNull(current.hourlyBaseAmount),
        driverShareAmount: toFiniteOrNull(current.driverShareAmount),
        companyShareAmount: toFiniteOrNull(current.companyShareAmount),
        driverShareRatio: toFiniteOrNull(current.driverShareRatio),
        shareSource: current.shareSource ?? null,
      };
    }
  }

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
      vehicle_id = ${next.vehicleId ?? null},
      helpers_count = ${Number.isFinite(next.helpersCount) ? next.helpersCount : null},
      estimated_duration_minutes = ${Number.isFinite(next.estimatedDurationMinutes) ? next.estimatedDurationMinutes : null},
      charged_amount = ${payment.chargedAmount},
      cash_amount = ${payment.cashAmount},
      transfer_amount = ${payment.transferAmount},
      hourly_billed_hours = ${toFiniteOrNull(shareSnapshot.hourlyBilledHours)},
      hourly_base_amount = ${toFiniteOrNull(shareSnapshot.hourlyBaseAmount)},
      driver_share_amount = ${toFiniteOrNull(shareSnapshot.driverShareAmount)},
      company_share_amount = ${toFiniteOrNull(shareSnapshot.companyShareAmount)},
      driver_share_ratio = ${toFiniteOrNull(shareSnapshot.driverShareRatio)},
      share_source = ${shareSnapshot.shareSource ?? null},
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

const normalizeLeadRow = (row) => ({
  id: row.id,
  clientName: row.client_name,
  clientPhone: row.client_phone ?? null,
  description: row.description ?? null,
  requestedSlot: normalizeLeadRequestedSlot(row.requested_slot),
  originZone: row.origin_zone ?? null,
  destinationZone: row.destination_zone ?? null,
  jobType: normalizeLeadJobType(row.job_type),
  status: normalizeLeadStatus(row.status),
  lossReason: normalizeLeadLossReason(row.loss_reason),
  notes: row.notes ?? null,
  history: sanitizeLeadHistory(row.history),
  closedAt: row.closed_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listLeads = async () => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM leads WHERE status = 'LOST' ORDER BY updated_at DESC, created_at DESC`;
  return rows.map(normalizeLeadRow);
};

export const getLeadById = async (id) => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM leads WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return normalizeLeadRow(rows[0]);
};

export const createLead = async (lead) => {
  await ensureSchema();
  const createdAt = lead.createdAt ?? new Date().toISOString();
  const updatedAt = lead.updatedAt ?? createdAt;
  const status = 'LOST';
  const lossReason = normalizeLeadLossReason(lead.lossReason);
  const closedAt = lead.closedAt ?? updatedAt;
  const notes = typeof lead.notes === 'string' && lead.notes.trim() ? lead.notes.trim() : null;
  const requestedSlot = normalizeLeadRequestedSlot(lead.requestedSlot);
  const jobType = normalizeLeadJobType(lead.jobType);
  const clientName = typeof lead.clientName === 'string' && lead.clientName.trim()
    ? lead.clientName.trim()
    : buildLeadRecordName(createdAt);
  const history = sanitizeLeadHistory(lead.history);
  const initialHistory = history.length > 0
    ? history
    : [buildLeadHistoryEntry({
      type: 'CREATED',
      status,
      lossReason,
      note: notes,
      message: buildLeadChangeMessage({
        next: {
          ...lead,
          clientName,
          status,
          lossReason,
          requestedSlot,
          jobType,
          notes,
        },
      }),
      createdAt,
    })];

  await sql`
    INSERT INTO leads (
      id, client_name, client_phone, description, requested_date, requested_time, requested_slot, origin_zone, destination_zone,
      job_type, status, loss_reason, notes, history, closed_at, created_at, updated_at
    ) VALUES (
      ${lead.id},
      ${clientName},
      ${lead.clientPhone ?? null},
      ${lead.description ?? null},
      ${null},
      ${null},
      ${requestedSlot},
      ${lead.originZone ?? null},
      ${lead.destinationZone ?? null},
      ${jobType},
      ${status},
      ${lossReason},
      ${notes},
      ${toJson(initialHistory, [])}::jsonb,
      ${closedAt},
      ${createdAt},
      ${updatedAt}
    )
  `;

  return getLeadById(lead.id);
};

export const updateLead = async (id, patch) => {
  const current = await getLeadById(id);
  if (!current) return null;

  const nextStatus = 'LOST';
  const nextLossReason = Object.prototype.hasOwnProperty.call(patch, 'lossReason')
    ? normalizeLeadLossReason(patch.lossReason)
    : current.lossReason;
  const updatedAt = new Date().toISOString();
  const next = {
    ...current,
    ...patch,
    clientPhone: Object.prototype.hasOwnProperty.call(patch, 'clientPhone') ? (patch.clientPhone ?? null) : current.clientPhone,
    description: Object.prototype.hasOwnProperty.call(patch, 'description') ? (patch.description ?? null) : current.description,
    requestedSlot: Object.prototype.hasOwnProperty.call(patch, 'requestedSlot')
      ? normalizeLeadRequestedSlot(patch.requestedSlot)
      : current.requestedSlot,
    originZone: Object.prototype.hasOwnProperty.call(patch, 'originZone') ? (patch.originZone ?? null) : current.originZone,
    destinationZone: Object.prototype.hasOwnProperty.call(patch, 'destinationZone') ? (patch.destinationZone ?? null) : current.destinationZone,
    jobType: Object.prototype.hasOwnProperty.call(patch, 'jobType')
      ? normalizeLeadJobType(patch.jobType)
      : current.jobType,
    status: nextStatus,
    lossReason: nextLossReason,
    notes: Object.prototype.hasOwnProperty.call(patch, 'notes') ? (patch.notes ?? null) : current.notes,
    updatedAt,
  };
  next.closedAt = current.closedAt ?? updatedAt;
  const historyMessage = buildLeadChangeMessage({
    current,
    next,
    historyNote: patch.historyNote,
  });
  const hasHistoryChange = historyMessage !== 'Venta perdida actualizada'
    || (typeof patch.historyNote === 'string' && patch.historyNote.trim().length > 0);
  const nextHistory = hasHistoryChange
    ? [
      ...sanitizeLeadHistory(current.history),
      buildLeadHistoryEntry({
        type: 'UPDATED',
        status: next.status,
        lossReason: next.lossReason,
        note: typeof patch.historyNote === 'string' ? patch.historyNote : null,
        message: historyMessage,
        createdAt: updatedAt,
      }),
    ]
    : sanitizeLeadHistory(current.history);

  await sql`
    UPDATE leads SET
      client_name = ${next.clientName},
      client_phone = ${next.clientPhone ?? null},
      description = ${next.description ?? null},
      requested_date = ${null},
      requested_time = ${null},
      requested_slot = ${next.requestedSlot},
      origin_zone = ${next.originZone ?? null},
      destination_zone = ${next.destinationZone ?? null},
      job_type = ${next.jobType},
      status = ${next.status},
      loss_reason = ${next.lossReason},
      notes = ${next.notes ?? null},
      history = ${toJson(nextHistory, [])}::jsonb,
      closed_at = ${next.closedAt ?? null},
      updated_at = ${next.updatedAt}
    WHERE id = ${id}
  `;

  return getLeadById(id);
};

export const deleteLead = async (id) => {
  await ensureSchema();
  const result = await sql`DELETE FROM leads WHERE id = ${id}`;
  return result.rowCount > 0;
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

export const recordJobLocation = async ({ jobId, lat, lng, accuracy, recordedAt }) => {
  await ensureSchema();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { rows } = await sql`
    SELECT status, distance_meters, last_track_lat, last_track_lng, last_track_at
    FROM jobs
    WHERE id = ${jobId}
  `;
  if (rows.length === 0) return null;
  const job = rows[0];
  if (!ACTIVE_JOB_STATUSES.has(job.status)) return null;

  const nowMs = Number.isFinite(recordedAt) ? Number(recordedAt) : Date.now();
  const lastAtValue = Number(job.last_track_at);
  const lastLatValue = Number(job.last_track_lat);
  const lastLngValue = Number(job.last_track_lng);
  const distanceValue = Number(job.distance_meters);
  const lastAt = Number.isFinite(lastAtValue) ? lastAtValue : null;
  const lastLat = Number.isFinite(lastLatValue) ? lastLatValue : null;
  const lastLng = Number.isFinite(lastLngValue) ? lastLngValue : null;
  const distanceMeters = Number.isFinite(distanceValue) ? distanceValue : 0;
  const accuracyValue = Number.isFinite(accuracy) ? accuracy : null;
  const accuracyOk = accuracyValue == null || accuracyValue <= MAX_TRACK_ACCURACY_METERS;

  if (lastAt == null || lastLat == null || lastLng == null || nowMs - lastAt > MAX_TRACK_INTERVAL_MS) {
    await sql`
      UPDATE jobs
      SET last_track_lat = ${lat}, last_track_lng = ${lng}, last_track_at = ${nowMs}
      WHERE id = ${jobId}
    `;
    return { distanceMeters };
  }

  const elapsedMs = nowMs - lastAt;
  if (elapsedMs <= 0 || !accuracyOk) return { distanceMeters };

  const distance = calculateDistanceMeters(lastLat, lastLng, lat, lng);
  if (distance < MIN_TRACK_DISTANCE_METERS) {
    await sql`
      UPDATE jobs
      SET last_track_lat = ${lat}, last_track_lng = ${lng}, last_track_at = ${nowMs}
      WHERE id = ${jobId}
    `;
    return { distanceMeters };
  }

  const speed = distance / (elapsedMs / 1000);
  if (speed > MAX_TRACK_SPEED_MPS) return { distanceMeters };

  const nextDistance = distanceMeters + distance;
  await sql`
    UPDATE jobs
    SET distance_meters = ${nextDistance}, last_track_lat = ${lat}, last_track_lng = ${lng}, last_track_at = ${nowMs}
    WHERE id = ${jobId}
  `;
  return { distanceMeters: nextDistance };
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
  if (location.jobId) {
    await recordJobLocation({
      jobId: location.jobId,
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
    });
  }
  const { rows } = await sql`SELECT * FROM driver_locations WHERE driver_id = ${location.driverId}`;
  if (rows.length === 0) return null;
  return normalizeLocationRow(rows[0]);
};

const normalizeDriverRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  phone: row.phone ?? undefined,
  vehicleId: row.vehicle_id ?? undefined,
  ownerDebtSettledAmount: row.owner_debt_settled_amount != null ? Number(row.owner_debt_settled_amount) : undefined,
  ownerDebtSettledAt: row.owner_debt_settled_at ?? undefined,
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
      id, name, code, phone, vehicle_id, owner_debt_settled_amount, owner_debt_settled_at, active, created_at, updated_at
    ) VALUES (
      ${driver.id},
      ${driver.name},
      ${driver.code},
      ${driver.phone ?? null},
      ${driver.vehicleId ?? null},
      ${Number.isFinite(driver.ownerDebtSettledAmount) ? Number(driver.ownerDebtSettledAmount) : null},
      ${driver.ownerDebtSettledAt ?? null},
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
    ownerDebtSettledAmount: Number.isFinite(patch.ownerDebtSettledAmount)
      ? Number(Number(patch.ownerDebtSettledAmount).toFixed(2))
      : patch.ownerDebtSettledAmount === null
        ? null
        : current.ownerDebtSettledAmount ?? null,
    ownerDebtSettledAt: Object.prototype.hasOwnProperty.call(patch, 'ownerDebtSettledAt')
      ? (patch.ownerDebtSettledAt ?? null)
      : (current.ownerDebtSettledAt ?? null),
    updatedAt: new Date().toISOString(),
  };
  await sql`
    UPDATE drivers SET
      name = ${next.name},
      code = ${next.code},
      phone = ${next.phone ?? null},
      vehicle_id = ${next.vehicleId ?? null},
      owner_debt_settled_amount = ${next.ownerDebtSettledAmount},
      owner_debt_settled_at = ${next.ownerDebtSettledAt},
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

const normalizeVehicleRow = (row) => ({
  id: row.id,
  name: row.name,
  size: row.size,
  ownershipType: row.ownership_type === 'driver' ? 'driver' : 'owner',
  hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
  costPerKm: row.cost_per_km != null ? Number(row.cost_per_km) : 0,
  fixedMonthlyCost: row.fixed_monthly_cost != null ? Number(row.fixed_monthly_cost) : 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listVehicles = async () => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM vehicles ORDER BY created_at DESC`;
  return rows.map(normalizeVehicleRow);
};

export const getVehicleById = async (id) => {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM vehicles WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return normalizeVehicleRow(rows[0]);
};

export const createVehicle = async (vehicle) => {
  await ensureSchema();
  const createdAt = vehicle.createdAt ?? new Date().toISOString();
  const updatedAt = vehicle.updatedAt ?? createdAt;
  await sql`
    INSERT INTO vehicles (
      id, name, size, ownership_type, hourly_rate, cost_per_km, fixed_monthly_cost, created_at, updated_at
    ) VALUES (
      ${vehicle.id},
      ${vehicle.name},
      ${vehicle.size},
      ${vehicle.ownershipType ?? 'owner'},
      ${Number.isFinite(vehicle.hourlyRate) ? Number(vehicle.hourlyRate) : null},
      ${vehicle.costPerKm},
      ${vehicle.fixedMonthlyCost},
      ${createdAt},
      ${updatedAt}
    )
  `;
  return getVehicleById(vehicle.id);
};

export const updateVehicle = async (id, patch) => {
  const current = await getVehicleById(id);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await sql`
    UPDATE vehicles SET
      name = ${next.name},
      size = ${next.size},
      ownership_type = ${next.ownershipType ?? 'owner'},
      hourly_rate = ${Number.isFinite(next.hourlyRate) ? Number(next.hourlyRate) : null},
      cost_per_km = ${next.costPerKm},
      fixed_monthly_cost = ${next.fixedMonthlyCost},
      created_at = ${next.createdAt},
      updated_at = ${next.updatedAt}
    WHERE id = ${id}
  `;
  return getVehicleById(id);
};

export const deleteVehicle = async (id) => {
  await ensureSchema();
  await sql`UPDATE jobs SET vehicle_id = NULL WHERE vehicle_id = ${id}`;
  await sql`UPDATE drivers SET vehicle_id = NULL WHERE vehicle_id = ${id}`;
  const result = await sql`DELETE FROM vehicles WHERE id = ${id}`;
  return result.rowCount > 0;
};
