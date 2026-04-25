import { getBilledHoursFromDurationMs } from './billing.js';

export const FINANCE_SETTING_KEYS = [
  'hourlyRate',
  'helperHourlyRate',
  'fixedMonthlyCost',
  'advertisingMonthlyCost',
  'advertisingMonthlyCosts',
  'tripCostPerHour',
  'tripCostPerKm',
  'ownerVehicleDriverShare',
  'driverVehicleDriverShare',
];

const OWNER_ACCOUNT_DRIVER_CODE = '6666';
const BA_UTC_OFFSET = '-03:00';

const roundMoney = (value) => Number(Number(value).toFixed(2));
const roundNumber = (value, decimals = 2) => Number(Number(value).toFixed(decimals));
const isFiniteNumber = (value) => Number.isFinite(value);
const toFiniteNumberOrNull = (value) => (isFiniteNumber(value) ? Number(value) : null);
const toArray = (value) => (Array.isArray(value) ? value : []);

const parseTimestampMs = (value) => {
  if (value == null || value === '') return null;
  if (Number.isFinite(value)) return Number(value);
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const parseDateBoundaryMs = (value, boundary) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const time = boundary === 'end' ? '23:59:59.999' : '00:00:00.000';
    return parseTimestampMs(`${trimmed}T${time}${BA_UTC_OFFSET}`);
  }
  return parseTimestampMs(trimmed);
};

export const resolveFinanceFilters = (query = {}) => {
  const rawStatus = typeof query.status === 'string' ? query.status : '';
  const statuses = rawStatus
    ? new Set(rawStatus.split(',').map((status) => status.trim().toUpperCase()).filter(Boolean))
    : null;

  return {
    from: typeof query.from === 'string' && query.from.trim() ? query.from.trim() : null,
    to: typeof query.to === 'string' && query.to.trim() ? query.to.trim() : null,
    fromMs: parseDateBoundaryMs(query.from, 'start'),
    toMs: parseDateBoundaryMs(query.to, 'end'),
    status: rawStatus || null,
    statuses,
    driverId: typeof query.driverId === 'string' && query.driverId.trim() ? query.driverId.trim() : null,
  };
};

export const getConfiguredFinanceReadApiKey = () => (
  process.env.FINANCE_READ_API_KEY?.trim()
  || process.env.MAIN_API_KEY?.trim()
  || ''
);

const getHeader = (headers = {}, key) => {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(key) ?? '';
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  return Array.isArray(direct) ? direct[0] ?? '' : direct ?? '';
};

export const getRequestApiKey = (req = {}) => {
  const headerKey = String(getHeader(req.headers, 'x-api-key') ?? '').trim();
  if (headerKey) return headerKey;

  const authorization = String(getHeader(req.headers, 'authorization') ?? '').trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();
  return '';
};

export const authorizeFinanceRead = (req, expectedKey = getConfiguredFinanceReadApiKey()) => {
  const configuredKey = String(expectedKey ?? '').trim();
  if (!configuredKey) {
    return {
      ok: false,
      status: 503,
      error: 'Finance read API key is not configured',
    };
  }

  if (getRequestApiKey(req) !== configuredKey) {
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized',
    };
  }

  return { ok: true };
};

const getJobStartMs = (job) =>
  parseTimestampMs(job?.timestamps?.startLoadingAt)
  ?? parseTimestampMs(job?.timestamps?.startJobAt)
  ?? parseTimestampMs(job?.timestamps?.startTripAt)
  ?? parseTimestampMs(job?.timestamps?.startUnloadingAt)
  ?? null;

const getJobEndMs = (job) =>
  parseTimestampMs(job?.timestamps?.endUnloadingAt)
  ?? parseTimestampMs(job?.timestamps?.endTripAt)
  ?? null;

const getJobDurationMs = (job) => {
  const startMs = getJobStartMs(job);
  const endMs = getJobEndMs(job);
  if (startMs == null || endMs == null) return null;
  return Math.max(0, endMs - startMs);
};

const getJobAccountingMs = (job) => {
  if (job?.status === 'DONE') {
    return getJobEndMs(job) ?? parseTimestampMs(job.updatedAt) ?? parseTimestampMs(job.createdAt);
  }
  return parseTimestampMs(job?.scheduledAt)
    ?? parseTimestampMs(job?.updatedAt)
    ?? parseTimestampMs(job?.createdAt);
};

const getPaymentBreakdown = (job) => {
  const cashAmount = toFiniteNumberOrNull(job?.cashAmount);
  const transferAmount = toFiniteNumberOrNull(job?.transferAmount);
  const hasBreakdown = cashAmount != null || transferAmount != null;
  const chargedAmount = toFiniteNumberOrNull(job?.chargedAmount);
  const totalCollected = hasBreakdown
    ? roundMoney((cashAmount ?? 0) + (transferAmount ?? 0))
    : chargedAmount;
  const paymentMethod = hasBreakdown
    ? cashAmount != null && transferAmount != null
      ? 'mixed'
      : cashAmount != null
        ? 'cash'
        : 'transfer'
    : chargedAmount != null
      ? 'unassigned'
      : 'unpaid';

  return {
    cashAmount,
    transferAmount,
    chargedAmount,
    paymentMethod,
    unassignedAmount: !hasBreakdown ? chargedAmount : null,
    totalCollected,
  };
};

const getSettingsValue = (settings, key) => {
  const value = settings?.[key];
  return Number.isFinite(value) ? Number(value) : null;
};

const normalizeSettings = (settings = {}) => ({
  hourlyRate: getSettingsValue(settings, 'hourlyRate'),
  helperHourlyRate: getSettingsValue(settings, 'helperHourlyRate'),
  fixedMonthlyCost: getSettingsValue(settings, 'fixedMonthlyCost'),
  advertisingMonthlyCost: getSettingsValue(settings, 'advertisingMonthlyCost'),
  advertisingMonthlyCosts: settings.advertisingMonthlyCosts && typeof settings.advertisingMonthlyCosts === 'object'
    && !Array.isArray(settings.advertisingMonthlyCosts)
    ? settings.advertisingMonthlyCosts
    : {},
  tripCostPerHour: getSettingsValue(settings, 'tripCostPerHour'),
  tripCostPerKm: getSettingsValue(settings, 'tripCostPerKm'),
  ownerVehicleDriverShare: getSettingsValue(settings, 'ownerVehicleDriverShare'),
  driverVehicleDriverShare: getSettingsValue(settings, 'driverVehicleDriverShare'),
});

const buildFinanceJob = (job, context) => {
  const driver = job.driverId ? context.driversById.get(job.driverId) ?? null : null;
  const vehicle = job.vehicleId
    ? context.vehiclesById.get(job.vehicleId) ?? null
    : driver?.vehicleId
      ? context.vehiclesById.get(driver.vehicleId) ?? null
      : null;
  const effectiveHourlyRate = toFiniteNumberOrNull(vehicle?.hourlyRate) ?? context.settings.hourlyRate;
  const startMs = getJobStartMs(job);
  const endMs = getJobEndMs(job);
  const durationMs = getJobDurationMs(job);
  const billedHours = toFiniteNumberOrNull(job.hourlyBilledHours)
    ?? getBilledHoursFromDurationMs(durationMs);
  const helpersCount = Math.max(0, Number.isFinite(job.helpersCount) ? Number(job.helpersCount) : 0);
  const hourlyBaseAmount = toFiniteNumberOrNull(job.hourlyBaseAmount)
    ?? (effectiveHourlyRate != null && billedHours != null
      ? roundMoney(effectiveHourlyRate * billedHours)
      : null);
  const helpersAmount = context.settings.helperHourlyRate != null && billedHours != null && helpersCount > 0
    ? roundMoney(context.settings.helperHourlyRate * billedHours * helpersCount)
    : 0;
  const expectedTotal = hourlyBaseAmount != null ? roundMoney(hourlyBaseAmount + helpersAmount) : null;
  const payment = getPaymentBreakdown(job);
  const totalBilled = payment.totalCollected ?? expectedTotal;
  const durationHours = durationMs != null ? durationMs / 3600000 : null;
  const distanceKm = toFiniteNumberOrNull(job.distanceKm)
    ?? (Number.isFinite(job.distanceMeters) ? Number(job.distanceMeters) / 1000 : null);
  const tripCostByHour = context.settings.tripCostPerHour != null && durationHours != null
    ? roundMoney(context.settings.tripCostPerHour * durationHours)
    : null;
  const tripCostByKm = context.settings.tripCostPerKm != null && distanceKm != null
    ? roundMoney(context.settings.tripCostPerKm * distanceKm)
    : null;
  const driverShareAmount = toFiniteNumberOrNull(job.driverShareAmount);
  const companyShareAmount = toFiniteNumberOrNull(job.companyShareAmount);
  const variableCost = roundMoney(
    (tripCostByHour ?? 0)
    + (tripCostByKm ?? 0)
    + (driverShareAmount ?? 0),
  );
  const estimatedNetBeforeFixedCosts = totalBilled != null
    ? roundMoney(totalBilled - variableCost)
    : null;
  const accountingMs = getJobAccountingMs(job);

  return {
    id: job.id,
    status: job.status,
    clientName: job.clientName ?? null,
    clientPhone: job.clientPhone ?? null,
    description: job.description ?? null,
    notes: job.notes ?? null,
    scheduledDate: job.scheduledDate ?? null,
    scheduledTime: job.scheduledTime ?? null,
    scheduledAt: job.scheduledAt ?? null,
    accountingDate: accountingMs != null ? new Date(accountingMs).toISOString() : null,
    pickup: job.pickup ?? null,
    dropoff: job.dropoff ?? null,
    extraStops: toArray(job.extraStops),
    driver: driver ? {
      id: driver.id,
      name: driver.name,
      code: driver.code,
      phone: driver.phone ?? null,
    } : null,
    vehicle: vehicle ? {
      id: vehicle.id,
      name: vehicle.name,
      size: vehicle.size,
      ownershipType: vehicle.ownershipType ?? 'owner',
      hourlyRate: toFiniteNumberOrNull(vehicle.hourlyRate),
    } : null,
    helpersCount,
    distanceMeters: toFiniteNumberOrNull(job.distanceMeters),
    distanceKm: distanceKm != null ? roundNumber(distanceKm, 3) : null,
    durationMinutes: durationMs != null ? Math.round(durationMs / 60000) : null,
    durationHours: durationHours != null ? roundNumber(durationHours, 2) : null,
    billedHours,
    hourlyRate: effectiveHourlyRate,
    hourlyBaseAmount,
    helpersAmount,
    expectedTotal,
    payment,
    totalBilled,
    shares: {
      driverShareAmount,
      companyShareAmount,
      driverShareRatio: toFiniteNumberOrNull(job.driverShareRatio),
      shareSource: job.shareSource ?? null,
    },
    costs: {
      tripCostByHour,
      tripCostByKm,
      variableCost,
      estimatedNetBeforeFixedCosts,
    },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
};

const emptyTotals = () => ({
  jobs: 0,
  completedJobs: 0,
  totalBilled: 0,
  cashAmount: 0,
  transferAmount: 0,
  unassignedAmount: 0,
  hourlyBaseAmount: 0,
  helpersAmount: 0,
  driverShareAmount: 0,
  companyShareAmount: 0,
  tripCostByHour: 0,
  tripCostByKm: 0,
  variableCost: 0,
  estimatedNetBeforeFixedCosts: 0,
  durationHours: 0,
  billedHours: 0,
  distanceKm: 0,
});

const addMoney = (target, key, value) => {
  if (Number.isFinite(value)) target[key] += Number(value);
};

const finalizeTotals = (totals) => Object.fromEntries(
  Object.entries(totals).map(([key, value]) => [
    key,
    typeof value === 'number' ? roundMoney(value) : value,
  ]),
);

const getMonthKey = (isoDate) => {
  if (typeof isoDate !== 'string' || isoDate.length < 7) return null;
  return isoDate.slice(0, 7);
};

const isOwnerAccountDriver = (driver) => String(driver?.code ?? '').trim() === OWNER_ACCOUNT_DRIVER_CODE;
const isExternalDriver = (driver) => Boolean(driver) && !isOwnerAccountDriver(driver);

const buildSummaries = ({ financeJobs, drivers, vehicles, leads, settings }) => {
  const totals = emptyTotals();
  const paymentMethods = {
    cash: 0,
    transfer: 0,
    mixed: 0,
    unassigned: 0,
    unpaid: 0,
  };
  const byMonth = new Map();
  const byDriver = new Map(drivers.map((driver) => [driver.id, {
    id: driver.id,
    name: driver.name,
    code: driver.code,
    phone: driver.phone ?? null,
    active: driver.active,
    vehicleId: driver.vehicleId ?? null,
    ownerDebtSettledAmount: toFiniteNumberOrNull(driver.ownerDebtSettledAmount) ?? 0,
    ownerDebtSettledAt: driver.ownerDebtSettledAt ?? null,
    totals: emptyTotals(),
    driverKeptAmount: 0,
    grossOwnerDebt: 0,
    outstandingOwnerDebt: 0,
  }]));
  const byVehicle = new Map(vehicles.map((vehicle) => [vehicle.id, {
    id: vehicle.id,
    name: vehicle.name,
    size: vehicle.size,
    ownershipType: vehicle.ownershipType ?? 'owner',
    hourlyRate: toFiniteNumberOrNull(vehicle.hourlyRate),
    costPerKm: toFiniteNumberOrNull(vehicle.costPerKm) ?? 0,
    fixedMonthlyCost: toFiniteNumberOrNull(vehicle.fixedMonthlyCost) ?? 0,
    totals: emptyTotals(),
  }]));

  financeJobs.forEach((job) => {
    totals.jobs += 1;
    if (job.status === 'DONE') totals.completedJobs += 1;
    if (paymentMethods[job.payment.paymentMethod] != null) paymentMethods[job.payment.paymentMethod] += 1;

    addMoney(totals, 'totalBilled', job.totalBilled);
    addMoney(totals, 'cashAmount', job.payment.cashAmount);
    addMoney(totals, 'transferAmount', job.payment.transferAmount);
    addMoney(totals, 'unassignedAmount', job.payment.unassignedAmount);
    addMoney(totals, 'hourlyBaseAmount', job.hourlyBaseAmount);
    addMoney(totals, 'helpersAmount', job.helpersAmount);
    addMoney(totals, 'driverShareAmount', job.shares.driverShareAmount);
    addMoney(totals, 'companyShareAmount', job.shares.companyShareAmount);
    addMoney(totals, 'tripCostByHour', job.costs.tripCostByHour);
    addMoney(totals, 'tripCostByKm', job.costs.tripCostByKm);
    addMoney(totals, 'variableCost', job.costs.variableCost);
    addMoney(totals, 'estimatedNetBeforeFixedCosts', job.costs.estimatedNetBeforeFixedCosts);
    addMoney(totals, 'durationHours', job.durationHours);
    addMoney(totals, 'billedHours', job.billedHours);
    addMoney(totals, 'distanceKm', job.distanceKm);

    const monthKey = getMonthKey(job.accountingDate);
    if (monthKey) {
      const monthly = byMonth.get(monthKey) ?? emptyTotals();
      monthly.jobs += 1;
      if (job.status === 'DONE') monthly.completedJobs += 1;
      addMoney(monthly, 'totalBilled', job.totalBilled);
      addMoney(monthly, 'cashAmount', job.payment.cashAmount);
      addMoney(monthly, 'transferAmount', job.payment.transferAmount);
      addMoney(monthly, 'unassignedAmount', job.payment.unassignedAmount);
      addMoney(monthly, 'driverShareAmount', job.shares.driverShareAmount);
      addMoney(monthly, 'companyShareAmount', job.shares.companyShareAmount);
      addMoney(monthly, 'variableCost', job.costs.variableCost);
      addMoney(monthly, 'estimatedNetBeforeFixedCosts', job.costs.estimatedNetBeforeFixedCosts);
      byMonth.set(monthKey, monthly);
    }

    if (job.driver?.id) {
      const driverSummary = byDriver.get(job.driver.id);
      if (driverSummary) {
        driverSummary.totals.jobs += 1;
        if (job.status === 'DONE') driverSummary.totals.completedJobs += 1;
        addMoney(driverSummary.totals, 'totalBilled', job.totalBilled);
        addMoney(driverSummary.totals, 'cashAmount', job.payment.cashAmount);
        addMoney(driverSummary.totals, 'transferAmount', job.payment.transferAmount);
        addMoney(driverSummary.totals, 'driverShareAmount', job.shares.driverShareAmount);
        addMoney(driverSummary.totals, 'companyShareAmount', job.shares.companyShareAmount);
        const grossOwnerDebt = isExternalDriver(driverSummary)
          ? Math.max(0, Math.min(job.totalBilled ?? 0, job.shares.companyShareAmount ?? 0))
          : 0;
        driverSummary.grossOwnerDebt += grossOwnerDebt;
        driverSummary.driverKeptAmount += Math.max(0, (job.totalBilled ?? 0) - grossOwnerDebt);
      }
    }

    if (job.vehicle?.id) {
      const vehicleSummary = byVehicle.get(job.vehicle.id);
      if (vehicleSummary) {
        vehicleSummary.totals.jobs += 1;
        if (job.status === 'DONE') vehicleSummary.totals.completedJobs += 1;
        addMoney(vehicleSummary.totals, 'totalBilled', job.totalBilled);
        addMoney(vehicleSummary.totals, 'driverShareAmount', job.shares.driverShareAmount);
        addMoney(vehicleSummary.totals, 'companyShareAmount', job.shares.companyShareAmount);
        addMoney(vehicleSummary.totals, 'distanceKm', job.distanceKm);
      }
    }
  });

  const leadLossReasons = {};
  toArray(leads).forEach((lead) => {
    const reason = lead.lossReason ?? 'UNSPECIFIED';
    leadLossReasons[reason] = (leadLossReasons[reason] ?? 0) + 1;
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentAdvertisingMonthlyCost = Number.isFinite(settings.advertisingMonthlyCosts[currentMonth])
    ? Number(settings.advertisingMonthlyCosts[currentMonth])
    : settings.advertisingMonthlyCost;

  return {
    totals: finalizeTotals(totals),
    paymentMethods,
    byMonth: Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, item]) => ({ month, totals: finalizeTotals(item) })),
    byDriver: Array.from(byDriver.values()).map((item) => ({
      ...item,
      totals: finalizeTotals(item.totals),
      driverKeptAmount: roundMoney(item.driverKeptAmount),
      grossOwnerDebt: roundMoney(item.grossOwnerDebt),
      outstandingOwnerDebt: roundMoney(Math.max(0, item.grossOwnerDebt - item.ownerDebtSettledAmount)),
    })),
    byVehicle: Array.from(byVehicle.values()).map((item) => ({
      ...item,
      totals: finalizeTotals(item.totals),
    })),
    leads: {
      lostCount: toArray(leads).length,
      lossReasons: leadLossReasons,
    },
    configuredMonthlyCosts: {
      fixedMonthlyCost: settings.fixedMonthlyCost,
      advertisingMonthlyCost: currentAdvertisingMonthlyCost,
    },
  };
};

const filterJobs = (jobs, filters) => toArray(jobs).filter((job) => {
  if (filters?.statuses && !filters.statuses.has(String(job.status ?? '').toUpperCase())) return false;
  if (filters?.driverId && job.driverId !== filters.driverId) return false;
  const accountingMs = getJobAccountingMs(job);
  if (filters?.fromMs != null && (accountingMs == null || accountingMs < filters.fromMs)) return false;
  if (filters?.toMs != null && (accountingMs == null || accountingMs > filters.toMs)) return false;
  return true;
});

const normalizeDrivers = (drivers, vehiclesById) => toArray(drivers).map((driver) => ({
  id: driver.id,
  name: driver.name,
  code: driver.code,
  phone: driver.phone ?? null,
  active: driver.active,
  vehicleId: driver.vehicleId ?? null,
  vehicle: driver.vehicleId ? vehiclesById.get(driver.vehicleId) ?? null : null,
  ownerDebtSettledAmount: toFiniteNumberOrNull(driver.ownerDebtSettledAmount) ?? 0,
  ownerDebtSettledAt: driver.ownerDebtSettledAt ?? null,
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
}));

const normalizeVehicles = (vehicles) => toArray(vehicles).map((vehicle) => ({
  id: vehicle.id,
  name: vehicle.name,
  size: vehicle.size,
  ownershipType: vehicle.ownershipType ?? 'owner',
  hourlyRate: toFiniteNumberOrNull(vehicle.hourlyRate),
  costPerKm: toFiniteNumberOrNull(vehicle.costPerKm) ?? 0,
  fixedMonthlyCost: toFiniteNumberOrNull(vehicle.fixedMonthlyCost) ?? 0,
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
}));

const normalizeLeads = (leads) => toArray(leads).map((lead) => ({
  id: lead.id,
  clientName: lead.clientName,
  clientPhone: lead.clientPhone ?? null,
  description: lead.description ?? null,
  requestedSlot: lead.requestedSlot ?? null,
  originZone: lead.originZone ?? null,
  destinationZone: lead.destinationZone ?? null,
  jobType: lead.jobType ?? null,
  status: lead.status,
  lossReason: lead.lossReason ?? null,
  notes: lead.notes ?? null,
  closedAt: lead.closedAt ?? null,
  createdAt: lead.createdAt,
  updatedAt: lead.updatedAt,
}));

export const buildFinanceResponse = (resource, input = {}) => {
  const normalizedResource = resource || 'snapshot';
  const settings = normalizeSettings(input.settings ?? {});
  const filters = input.filters ?? resolveFinanceFilters();
  const vehicles = normalizeVehicles(input.vehicles ?? []);
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const drivers = normalizeDrivers(input.drivers ?? [], vehiclesById);
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const filteredJobs = filterJobs(input.jobs ?? [], filters);
  const financeJobs = filteredJobs.map((job) => buildFinanceJob(job, {
    settings,
    driversById,
    vehiclesById,
  }));
  const leads = normalizeLeads(input.leads ?? []);
  const summary = buildSummaries({
    financeJobs,
    drivers,
    vehicles,
    leads,
    settings,
  });

  const base = {
    generatedAt: new Date(input.generatedAt ?? Date.now()).toISOString(),
    currency: 'ARS',
    filters: {
      from: filters.from,
      to: filters.to,
      status: filters.status,
      driverId: filters.driverId,
    },
  };

  if (normalizedResource === 'jobs') {
    return { ...base, jobs: financeJobs };
  }
  if (normalizedResource === 'drivers') {
    return { ...base, drivers: summary.byDriver };
  }
  if (normalizedResource === 'vehicles') {
    return { ...base, vehicles: summary.byVehicle };
  }
  if (normalizedResource === 'leads') {
    return { ...base, summary: summary.leads, leads };
  }
  if (normalizedResource === 'settings') {
    return { ...base, settings };
  }
  if (normalizedResource === 'summary') {
    return { ...base, settings, summary };
  }
  if (normalizedResource === 'snapshot') {
    return {
      ...base,
      settings,
      summary,
      jobs: financeJobs,
      drivers,
      vehicles,
      leads,
    };
  }

  return null;
};
