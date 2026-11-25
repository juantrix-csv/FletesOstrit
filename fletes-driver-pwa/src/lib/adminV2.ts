import type { Driver, Job, Vehicle } from './types';
import { getBilledHoursFromMinutes } from './billing';
import { calculateDistance } from './utils';

export type CalendarCostSettings = {
  hourlyRate: number | null;
  helperHourlyRate: number | null;
  tripCostPerHour: number | null;
  tripCostPerKm: number | null;
  ownerVehicleDriverShare: number | null;
  driverVehicleDriverShare: number | null;
};

export const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const shortDate = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' });
export const longDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const shiftDate = (key: string, days: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
export const jobDay = (job: Job) => job.scheduledDate || (Number.isFinite(job.scheduledAt) ? dateKey(new Date(job.scheduledAt!)) : '');
export const jobCompletedDay = (job: Job) => {
  const timestamp = job.timestamps.endUnloadingAt ?? job.timestamps.endTripAt;
  return timestamp ? dateKey(new Date(timestamp)) : jobDay(job);
};
export const jobTime = (job: Job) => job.scheduledTime?.slice(0, 5) || (Number.isFinite(job.scheduledAt) ? new Date(job.scheduledAt!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const driverName = (job: Job, drivers: Driver[]) => drivers.find((driver) => driver.id === job.driverId)?.name ?? 'Sin asignar';
export const vehicleName = (job: Job, vehicles: Vehicle[]) => vehicles.find((vehicle) => vehicle.id === job.vehicleId)?.name ?? 'Sin vehículo';
export const jobGross = (job: Job) => Number.isFinite(job.chargedAmount) ? Number(job.chargedAmount) : Number.isFinite(job.manualPrice) ? Number(job.manualPrice) : null;
export const jobCollected = (job: Job) => {
  if (Number.isFinite(job.cashAmount) || Number.isFinite(job.transferAmount)) return Number(job.cashAmount ?? 0) + Number(job.transferAmount ?? 0);
  return Number.isFinite(job.chargedAmount) ? Number(job.chargedAmount) : null;
};
export const jobOwnerShare = (job: Job, drivers: Driver[]) => {
  if (job.status !== 'DONE') return null;
  const driver = drivers.find((item) => item.id === job.driverId);
  const isOwner = driver?.code === '6666' || driver?.name?.trim().toLowerCase() === 'juan';
  if (job.isLongDistance && !isOwner && Number.isFinite(job.manualPrice)) return Math.round(Number(job.manualPrice) * .3);
  if (!isOwner && Number.isFinite(job.companyShareAmount)) return Number(job.companyShareAmount);
  return isOwner ? jobGross(job) : null;
};
export const jobCalendarAmount = (job: Job, drivers: Driver[], vehicles: Vehicle[], costs?: Partial<CalendarCostSettings>) => {
  const confirmed = jobOwnerShare(job, drivers);
  if (confirmed != null) return confirmed;
  const driver = drivers.find((item) => item.id === job.driverId);
  const isExternal = Boolean(driver && driver.code !== '6666' && driver.name.trim().toLowerCase() !== 'juan');
  if (job.isLongDistance && Number.isFinite(job.manualPrice)) return isExternal ? Math.round(Number(job.manualPrice) * .3) : Number(job.manualPrice);
  const vehicleId = job.vehicleId ?? driver?.vehicleId;
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  const hours = getBilledHoursFromMinutes(job.estimatedDurationMinutes ?? 60);
  const rate = job.hourlyRateSnapshot ?? vehicle?.hourlyRate ?? costs?.hourlyRate;
  const hourlyBase = rate != null && hours != null ? hours * rate : null;
  if (isExternal && vehicle?.ownershipType === 'driver' && hours != null) return Math.round(Math.min(hourlyBase ?? Infinity, hours * (vehicle.companyHourlyMargin ?? 10000)));
  if (isExternal && hourlyBase != null) return Math.round(hourlyBase * (1 - (costs?.ownerVehicleDriverShare ?? 1 / 3)));
  if (!isExternal && Number.isFinite(job.manualPrice)) return Number(job.manualPrice);
  if (!isExternal && hourlyBase != null) return Math.round(hourlyBase + hours! * (job.helperHourlyRateSnapshot ?? costs?.helperHourlyRate ?? 0) * (job.helpersCount ?? 0));
  return null;
};

export const jobCalendarNet = (job: Job, drivers: Driver[], vehicles: Vehicle[], costs: CalendarCostSettings): number | null => {
  const driver = drivers.find((item) => item.id === job.driverId);
  const isOwner = driver?.code === '6666';
  const isExternal = Boolean(driver && !isOwner);
  if (isExternal) return jobCalendarAmount(job, drivers, vehicles, costs);

  const vehicle = vehicles.find((item) => item.id === (job.vehicleId ?? driver?.vehicleId));
  const minutes = job.estimatedDurationMinutes && job.estimatedDurationMinutes > 0 ? job.estimatedDurationMinutes : 60;
  const billedHours = getBilledHoursFromMinutes(minutes);
  if (billedHours == null) return null;
  const hourlyRate = job.hourlyRateSnapshot ?? vehicle?.hourlyRate ?? costs.hourlyRate;
  const helperRate = job.helperHourlyRateSnapshot ?? costs.helperHourlyRate;
  const base = hourlyRate == null ? null : billedHours * hourlyRate;
  const helpers = job.helpersCount ?? 0;
  const estimatedTotal = Number.isFinite(job.manualPrice)
    ? Number(job.manualPrice)
    : jobCollected(job) ?? (base == null ? null : base + (helperRate == null ? 0 : billedHours * helperRate * helpers));
  if (estimatedTotal == null) return null;

  const shareRatio = isOwner ? 0 : vehicle?.ownershipType === 'driver'
    ? costs.driverVehicleDriverShare ?? 2 / 3
    : costs.ownerVehicleDriverShare ?? 1 / 3;
  const companyBase = job.isLongDistance ? estimatedTotal : base == null ? estimatedTotal : base * (1 - shareRatio);
  const helperRevenue = job.isLongDistance || base == null ? 0 : Math.max(0, estimatedTotal - base);
  const paidHelpers = isOwner ? (helpers >= 2 ? helpers - 1 : helpers) : 0;
  const helperCost = job.isLongDistance || helperRate == null ? 0 : billedHours * helperRate * paidHelpers;
  const points = [job.pickup, ...(job.extraStops ?? []), job.dropoff].filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  let distanceKm = Number.isFinite(job.distanceKm) ? Number(job.distanceKm) : Number.isFinite(job.distanceMeters) ? Number(job.distanceMeters) / 1000 : 0;
  if (!distanceKm && points.length >= 2) {
    for (let index = 1; index < points.length; index += 1) distanceKm += calculateDistance(points[index - 1].lat, points[index - 1].lng, points[index].lat, points[index].lng) / 1000;
  }
  const fuelCost = distanceKm * (vehicle?.costPerKm ?? costs.tripCostPerKm ?? 0);
  const timeCost = minutes / 60 * (costs.tripCostPerHour ?? 0);
  return Math.round((companyBase + helperRevenue - helperCost - fuelCost - timeCost - 4000) * 100) / 100;
};
export const statusLabel: Record<Job['status'], string> = {
  PENDING: 'Pendiente', TO_PICKUP: 'En camino', LOADING: 'Cargando', TO_DROPOFF: 'En viaje', UNLOADING: 'Descargando', DONE: 'Finalizado',
};
export const statusTone: Record<Job['status'], string> = {
  PENDING: 'pending', TO_PICKUP: 'active', LOADING: 'active', TO_DROPOFF: 'active', UNLOADING: 'active', DONE: 'done',
};
