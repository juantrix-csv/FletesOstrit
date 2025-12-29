import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import AddressAutocomplete from '../components/AddressAutocomplete';
import MapLocationPicker from '../components/MapLocationPicker';
import DriversOverviewMap from '../components/DriversOverviewMap';
import DriverRouteMap from '../components/DriverRouteMap';
import type { Driver, DriverLocation, Job, LocationData } from '../lib/types';
import {
  createDriver,
  createJob,
  deleteDriver,
  deleteJob,
  downloadJobsHistory,
  getHelperHourlyRate,
  getHourlyRate,
  listDriverLocations,
  listDrivers,
  listJobs,
  setHelperHourlyRate,
  setHourlyRate,
  updateDriver,
  updateJob,
} from '../lib/api';
import { cn, formatDuration, getScheduledAtMs } from '../lib/utils';
import { reorderList } from '../lib/reorder';

const buildDriverCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const monthShortFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
const dayLongFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const calendarStartHour = 6;
const calendarEndHour = 22;
const calendarHours = Array.from({ length: calendarEndHour - calendarStartHour }, (_, index) => calendarStartHour + index);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
const startOfWeek = (date: Date) => {
  const base = startOfDay(date);
  const weekday = base.getDay();
  const diff = (weekday + 6) % 7;
  return addDays(base, -diff);
};
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const buildDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const getDayOverlapRange = (start: Date, end: Date, day: Date) => {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const rangeStart = start > dayStart ? start : dayStart;
  const rangeEnd = end < dayEnd ? end : dayEnd;
  if (rangeEnd <= rangeStart) return null;
  return { rangeStart, rangeEnd };
};
const getHourSlotsForDay = (start: Date, end: Date, day: Date) => {
  const overlap = getDayOverlapRange(start, end, day);
  if (!overlap) return [];
  const slots: number[] = [];
  let cursor = new Date(overlap.rangeStart);
  cursor.setMinutes(0, 0, 0);
  while (cursor < overlap.rangeEnd) {
    slots.push(cursor.getHours());
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
      cursor.getHours() + 1,
      0,
      0,
      0,
    );
  }
  return slots;
};
const formatJobRangeForDay = (start: Date, end: Date, day: Date) => {
  const overlap = getDayOverlapRange(start, end, day);
  if (!overlap) return '';
  return `${timeFormatter.format(overlap.rangeStart)}-${timeFormatter.format(overlap.rangeEnd)}`;
};

const parseHourlyRate = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const parseMoneyInput = (value: string) => parseHourlyRate(value);
const parseDurationHours = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseTimestampMs = (value?: string) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const getJobStartMs = (job: Job) =>
  parseTimestampMs(job.timestamps.startJobAt)
  ?? parseTimestampMs(job.timestamps.startLoadingAt)
  ?? parseTimestampMs(job.timestamps.startTripAt)
  ?? parseTimestampMs(job.timestamps.startUnloadingAt)
  ?? null;

const getJobEndMs = (job: Job) =>
  parseTimestampMs(job.timestamps.endUnloadingAt)
  ?? parseTimestampMs(job.timestamps.endTripAt)
  ?? null;

const formatDurationMs = (ms: number) => {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const getBilledHours = (ms: number | null) => {
  if (ms == null) return null;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 3600000);
};

type CalendarJob = {
  job: Job;
  start: Date;
  end: Date;
  scheduledAt: number;
  durationMinutes: number;
};

const getEstimatedDurationMinutes = (job: Job) => {
  if (Number.isFinite(job.estimatedDurationMinutes) && (job.estimatedDurationMinutes as number) > 0) {
    return job.estimatedDurationMinutes as number;
  }
  return 60;
};

export default function AdminJobs() {
  const [tab, setTab] = useState<'jobs' | 'drivers' | 'calendar' | 'analytics'>('jobs');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('week');
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [dropoff, setDropoff] = useState<LocationData | null>(null);
  const [extraStops, setExtraStops] = useState<LocationData[]>([]);
  const [extraStopDraft, setExtraStopDraft] = useState<LocationData | null>(null);
  const [extraStopKey, setExtraStopKey] = useState(0);
  const [draggedStopIndex, setDraggedStopIndex] = useState<number | null>(null);
  const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff' | 'extra'>('pickup');
  const [driverName, setDriverName] = useState('');
  const [driverCode, setDriverCode] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [hourlyRateInput, setHourlyRateInput] = useState('');
  const [helperHourlyRateInput, setHelperHourlyRateInput] = useState('');
  const [savingHourlyRate, setSavingHourlyRate] = useState(false);
  const [savingHelperHourlyRate, setSavingHelperHourlyRate] = useState(false);
  const [chargedAmountDrafts, setChargedAmountDrafts] = useState<Record<string, string>>({});
  const [savingChargedAmountId, setSavingChargedAmountId] = useState<string | null>(null);
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const locationsLoadedRef = useRef(false);

  const driversById = useMemo(() => {
    const map = new Map<string, Driver>();
    drivers.forEach((driver) => map.set(driver.id, driver));
    return map;
  }, [drivers]);
  const hourlyRateValue = useMemo(() => parseHourlyRate(hourlyRateInput), [hourlyRateInput]);
  const helperHourlyRateValue = useMemo(() => parseHourlyRate(helperHourlyRateInput), [helperHourlyRateInput]);

  const loadJobs = async () => {
    try {
      setLoadingJobs(true);
      const data = await listJobs();
      setJobs(data);
    } catch {
      toast.error('No se pudieron cargar los fletes');
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadDrivers = async () => {
    try {
      setLoadingDrivers(true);
      const data = await listDrivers();
      setDrivers(data);
    } catch {
      toast.error('No se pudieron cargar los conductores');
    } finally {
      setLoadingDrivers(false);
    }
  };

  const loadDriverLocations = async () => {
    try {
      if (!locationsLoadedRef.current) {
        setLoadingLocations(true);
      }
      const data = await listDriverLocations();
      setDriverLocations(data);
    } catch {
      // Keep last known positions on transient errors.
    } finally {
      if (!locationsLoadedRef.current) {
        locationsLoadedRef.current = true;
        setLoadingLocations(false);
      }
    }
  };

  const loadHourlyRate = async () => {
    try {
      const data = await getHourlyRate();
      setHourlyRateInput(data.hourlyRate != null ? String(data.hourlyRate) : '');
    } catch {
      toast.error('No se pudo cargar el precio hora');
    }
  };

  const loadHelperHourlyRate = async () => {
    try {
      const data = await getHelperHourlyRate();
      setHelperHourlyRateInput(data.hourlyRate != null ? String(data.hourlyRate) : '');
    } catch {
      toast.error('No se pudo cargar el precio hora del ayudante');
    }
  };

  const addExtraStop = (location: LocationData | null) => {
    if (!location) return;
    setExtraStops((prev) => [...prev, location]);
    setExtraStopDraft(null);
    setExtraStopKey((prev) => prev + 1);
  };

  const removeExtraStop = (index: number) => {
    setExtraStops((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleReorderStop = (targetIndex: number) => {
    if (draggedStopIndex == null || draggedStopIndex === targetIndex) return;
    setExtraStops((prev) => reorderList(prev, draggedStopIndex, targetIndex));
    setDraggedStopIndex(null);
  };

  useEffect(() => {
    loadJobs();
    loadDrivers();
    loadDriverLocations();
    loadHourlyRate();
    loadHelperHourlyRate();
    const id = window.setInterval(loadDriverLocations, 12000);
    return () => clearInterval(id);
  }, []);

  const addJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pickup || !dropoff) {
      toast.error('Selecciona origen y destino (lista o mapa)');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const scheduledDate = String(fd.get('scheduledDate') || '');
    const scheduledTime = String(fd.get('scheduledTime') || '');
    const description = String(fd.get('description') || '').trim();
    const estimatedDurationRaw = String(fd.get('estimatedDurationHours') || '').trim();
    const estimatedHours = parseDurationHours(estimatedDurationRaw);
    const helpersCountRaw = String(fd.get('helpersCount') || '').trim();
    const helpersCount = helpersCountRaw ? Number.parseInt(helpersCountRaw, 10) : undefined;
    if (helpersCountRaw && (!Number.isInteger(helpersCount) || (helpersCount ?? 0) < 0)) {
      toast.error('Cantidad de ayudantes invalida');
      return;
    }
    if (estimatedHours == null) {
      toast.error('Duracion estimada invalida');
      return;
    }
    const estimatedDurationMinutes = Math.max(1, Math.round(estimatedHours * 60));
    const scheduledAt = getScheduledAtMs(scheduledDate, scheduledTime);
    const driverIdValue = String(fd.get('driverId') || '').trim();
    try {
      await createJob({
        id: uuidv4(),
        clientName: String(fd.get('cn') || ''),
        description: description || undefined,
        estimatedDurationMinutes,
        scheduledDate,
        scheduledTime,
        scheduledAt: scheduledAt ?? undefined,
        pickup,
        dropoff,
        extraStops,
        helpersCount,
        driverId: driverIdValue || undefined,
        status: 'PENDING',
        flags: { nearPickupSent: false, arrivedPickupSent: false, nearDropoffSent: false, arrivedDropoffSent: false },
        timestamps: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Creado');
      setOpen(false);
      setPickup(null);
      setDropoff(null);
      setExtraStops([]);
      setExtraStopDraft(null);
      setExtraStopKey((prev) => prev + 1);
      setMapTarget('pickup');
      await loadJobs();
    } catch {
      toast.error('No se pudo crear el flete');
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await deleteJob(id);
      setJobs((prev) => prev.filter((job) => job.id !== id));
    } catch {
      toast.error('No se pudo eliminar el flete');
    }
  };

  const handleAssignJob = async (job: Job, driverId: string) => {
    try {
      const updated = await updateJob(job.id, { driverId: driverId || null });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? updated : item)));
      toast.success('Asignacion guardada');
    } catch {
      toast.error('No se pudo asignar el conductor');
    }
  };

  const handleCreateDriver = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!driverName.trim() || !driverCode.trim()) {
      toast.error('Nombre y codigo son obligatorios');
      return;
    }
    try {
      const created = await createDriver({
        id: uuidv4(),
        name: driverName.trim(),
        code: driverCode.trim().toUpperCase(),
        phone: driverPhone.trim() || undefined,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setDrivers((prev) => [created, ...prev]);
      setDriverName('');
      setDriverCode('');
      setDriverPhone('');
      toast.success('Conductor creado');
    } catch {
      toast.error('No se pudo crear el conductor');
    }
  };

  const handleToggleDriver = async (driver: Driver) => {
    try {
      const updated = await updateDriver(driver.id, { active: !driver.active });
      setDrivers((prev) => prev.map((item) => (item.id === driver.id ? updated : item)));
    } catch {
      toast.error('No se pudo actualizar el conductor');
    }
  };

  const handleDeleteDriver = async (id: string) => {
    try {
      await deleteDriver(id);
      setDrivers((prev) => prev.filter((driver) => driver.id !== id));
      await loadJobs();
    } catch {
      toast.error('No se pudo eliminar el conductor');
    }
  };

  const handleSelectDriverMap = (driverId: string) => {
    setSelectedDriverId(driverId);
    loadDriverLocations();
  };

  const handleSaveHourlyRate = async () => {
    const parsed = parseHourlyRate(hourlyRateInput);
    if (hourlyRateInput.trim() && parsed == null) {
      toast.error('Precio hora invalido');
      return;
    }
    try {
      setSavingHourlyRate(true);
      const saved = await setHourlyRate(parsed);
      setHourlyRateInput(saved.hourlyRate != null ? String(saved.hourlyRate) : '');
      toast.success('Precio hora actualizado');
    } catch {
      toast.error('No se pudo guardar el precio hora');
    } finally {
      setSavingHourlyRate(false);
    }
  };

  const handleSaveHelperHourlyRate = async () => {
    const parsed = parseHourlyRate(helperHourlyRateInput);
    if (helperHourlyRateInput.trim() && parsed == null) {
      toast.error('Precio hora ayudante invalido');
      return;
    }
    try {
      setSavingHelperHourlyRate(true);
      const saved = await setHelperHourlyRate(parsed);
      setHelperHourlyRateInput(saved.hourlyRate != null ? String(saved.hourlyRate) : '');
      toast.success('Precio hora ayudante actualizado');
    } catch {
      toast.error('No se pudo guardar el precio hora ayudante');
    } finally {
      setSavingHelperHourlyRate(false);
    }
  };

  const handleSaveChargedAmount = async (job: Job) => {
    const raw = chargedAmountDrafts[job.id] ?? (job.chargedAmount != null ? String(job.chargedAmount) : '');
    const parsed = parseMoneyInput(raw);
    if (raw.trim() && parsed == null) {
      toast.error('Monto cobrado invalido');
      return;
    }
    try {
      setSavingChargedAmountId(job.id);
      const updated = await updateJob(job.id, { chargedAmount: raw.trim() ? parsed : null });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? updated : item)));
      setChargedAmountDrafts((prev) => {
        const next = { ...prev };
        if (raw.trim()) {
          next[job.id] = String(parsed);
        } else {
          delete next[job.id];
        }
        return next;
      });
      toast.success('Cobro actualizado');
    } catch {
      toast.error('No se pudo actualizar el cobro');
    } finally {
      setSavingChargedAmountId(null);
    }
  };

  const handleClearChargedAmount = async (job: Job) => {
    try {
      setSavingChargedAmountId(job.id);
      const updated = await updateJob(job.id, { chargedAmount: null });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? updated : item)));
      setChargedAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      toast.success('Cobro eliminado');
    } catch {
      toast.error('No se pudo eliminar el cobro');
    } finally {
      setSavingChargedAmountId(null);
    }
  };

  const handleDownloadHistory = async () => {
    try {
      const blob = await downloadJobsHistory();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'historial-fletes.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el historial');
    }
  };

  const totalJobs = jobs.length;
  const activeDrivers = drivers.filter((driver) => driver.active).length;
  const assignedJobs = jobs.filter((job) => job.driverId).length;
  const activeJobs = jobs.filter((job) => job.status !== 'DONE').length;
  const unassignedJobs = totalJobs - assignedJobs;
  const completedHistory = useMemo(() => {
    const entries = jobs
      .filter((job) => job.status === 'DONE')
      .map((job) => {
        const startMs = getJobStartMs(job);
        const endMs = getJobEndMs(job);
        const durationMs = startMs != null && endMs != null ? Math.max(0, endMs - startMs) : null;
        return { job, startMs, endMs, durationMs };
      });
    entries.sort((a, b) => (b.endMs ?? 0) - (a.endMs ?? 0));
    return entries;
  }, [jobs]);
  const hasChargeOverrides = useMemo(
    () => completedHistory.some((entry) => entry.job.chargedAmount != null),
    [completedHistory],
  );
  const getEntryTotal = (entry: { job: Job; durationMs: number | null }) => {
    if (entry.job.chargedAmount != null) return entry.job.chargedAmount;
    if (hourlyRateValue == null || entry.durationMs == null) return null;
    const billedHours = getBilledHours(entry.durationMs);
    if (billedHours == null) return null;
    const helpersCount = entry.job.helpersCount ?? 0;
    const helpersValue = helperHourlyRateValue != null && helpersCount > 0
      ? billedHours * helperHourlyRateValue * helpersCount
      : 0;
    return billedHours * hourlyRateValue + helpersValue;
  };
  const averageDurationMs = useMemo(() => {
    const durations = completedHistory.map((entry) => entry.durationMs).filter((value): value is number => value != null);
    if (durations.length === 0) return null;
    const total = durations.reduce((sum, value) => sum + value, 0);
    return total / durations.length;
  }, [completedHistory]);
  const totalRevenue = useMemo(() => {
    if (hourlyRateValue == null && !hasChargeOverrides) return null;
    return completedHistory.reduce((sum, entry) => {
      const total = getEntryTotal(entry);
      return total != null ? sum + total : sum;
    }, 0);
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue, hasChargeOverrides]);
  const totalHelperCost = useMemo(() => {
    if (helperHourlyRateValue == null) return null;
    return completedHistory.reduce((sum, entry) => {
      if (entry.durationMs == null) return sum;
      const helpersCount = entry.job.helpersCount ?? 0;
      if (helpersCount <= 0) return sum;
      const billedHours = getBilledHours(entry.durationMs);
      if (billedHours == null) return sum;
      return sum + billedHours * helperHourlyRateValue * helpersCount;
    }, 0);
  }, [completedHistory, helperHourlyRateValue]);
  const hourlyRateLabel = hourlyRateValue != null ? currencyFormatter.format(hourlyRateValue) : '--';
  const helperHourlyRateLabel = helperHourlyRateValue != null ? currencyFormatter.format(helperHourlyRateValue) : '--';
  const averageDurationLabel = averageDurationMs != null ? formatDurationMs(averageDurationMs) : 'N/D';
  const totalRevenueLabel = totalRevenue != null ? currencyFormatter.format(totalRevenue) : 'Configura el precio';
  const totalRevenueCaption = hasChargeOverrides ? 'Total cobrado' : 'Total estimado';
  const totalHelperCostLabel = totalHelperCost != null ? currencyFormatter.format(totalHelperCost) : 'Configura el precio';
  const currentMonthLabel = monthFormatter.format(new Date());
  const monthlyGrossTotal = useMemo(() => {
    if (hourlyRateValue == null && !hasChargeOverrides) return null;
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return completedHistory.reduce((sum, entry) => {
      if (entry.endMs == null) return sum;
      const endDate = new Date(entry.endMs);
      if (endDate.getMonth() !== month || endDate.getFullYear() !== year) return sum;
      const total = getEntryTotal(entry);
      return total != null ? sum + total : sum;
    }, 0);
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue, hasChargeOverrides]);
  const monthlyGrossLabel = monthlyGrossTotal != null
    ? currencyFormatter.format(monthlyGrossTotal)
    : 'Configura el precio';
  const dailyRevenueSeries = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const series = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { key, day, total: 0 };
    });
    const byKey = new Map(series.map((item) => [item.key, item]));
    completedHistory.forEach((entry) => {
      if (entry.endMs == null) return;
      const endDate = new Date(entry.endMs);
      if (endDate.getMonth() !== month || endDate.getFullYear() !== year) return;
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      const target = byKey.get(key);
      if (!target) return;
      const total = getEntryTotal(entry);
      if (total == null) return;
      target.total += total;
    });
    let runningTotal = 0;
    return series.map((item) => {
      runningTotal += item.total;
      return { ...item, total: runningTotal };
    });
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue]);
  const dailyRevenueMaxValue = useMemo(() => {
    const maxValue = Math.max(0, ...dailyRevenueSeries.map((item) => item.total));
    return maxValue;
  }, [dailyRevenueSeries]);
  const dailyTotalLabel = dailyRevenueSeries.length > 0
    ? currencyFormatter.format(dailyRevenueSeries[dailyRevenueSeries.length - 1].total)
    : currencyFormatter.format(0);
  const dailyRevenueScaleMax = dailyRevenueMaxValue > 0 ? dailyRevenueMaxValue : 1;
  const dailyRevenueTicks = useMemo(() => {
    const steps = 4;
    const maxValue = dailyRevenueMaxValue;
    return Array.from({ length: steps + 1 }, (_, index) => {
      const value = maxValue > 0 ? (maxValue * (steps - index)) / steps : 0;
      return { value, label: currencyFormatter.format(value) };
    });
  }, [dailyRevenueMaxValue]);
  const monthlyRevenueSeries = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthShortFormatter.format(date)} ${String(date.getFullYear()).slice(-2)}`;
      return { key, label, total: 0 };
    });
    const byKey = new Map(months.map((item) => [item.key, item]));
    completedHistory.forEach((entry) => {
      if (entry.endMs == null) return;
      const endDate = new Date(entry.endMs);
      const key = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
      const target = byKey.get(key);
      if (!target) return;
      const total = getEntryTotal(entry);
      if (total == null) return;
      target.total += total;
    });
    return months;
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue]);
  const monthlyRevenueMaxValue = useMemo(() => {
    const maxValue = Math.max(0, ...monthlyRevenueSeries.map((item) => item.total));
    return maxValue;
  }, [monthlyRevenueSeries]);
  const yearlyTotalLabel = monthlyRevenueSeries.length > 0
    ? currencyFormatter.format(monthlyRevenueSeries.reduce((sum, item) => sum + item.total, 0))
    : currencyFormatter.format(0);
  const monthlyRevenueScaleMax = monthlyRevenueMaxValue > 0 ? monthlyRevenueMaxValue : 1;
  const monthlyRevenueTicks = useMemo(() => {
    const steps = 4;
    const maxValue = monthlyRevenueMaxValue;
    return Array.from({ length: steps + 1 }, (_, index) => {
      const value = maxValue > 0 ? (maxValue * (steps - index)) / steps : 0;
      return { value, label: currencyFormatter.format(value) };
    });
  }, [monthlyRevenueMaxValue]);
  const hasMonthlyPricing = hourlyRateValue != null || helperHourlyRateValue != null || hasChargeOverrides;
  const driverLocationsById = useMemo(() => {
    const map = new Map<string, DriverLocation>();
    driverLocations.forEach((loc) => map.set(loc.driverId, loc));
    return map;
  }, [driverLocations]);
  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (assignedFilter === 'assigned') {
      result = result.filter((job) => job.driverId);
    } else if (assignedFilter === 'unassigned') {
      result = result.filter((job) => !job.driverId);
    }
    if (statusFilter === 'pending') {
      result = result.filter((job) => job.status === 'PENDING');
    }
    if (dateFilter) {
      result = result.filter((job) => job.scheduledDate === dateFilter);
    }
    if (driverFilter) {
      result = result.filter((job) => job.driverId === driverFilter);
    }
    return result;
  }, [jobs, assignedFilter, statusFilter, dateFilter, driverFilter]);
  const hasFilters = assignedFilter !== 'all' || statusFilter !== 'all' || dateFilter !== '' || driverFilter !== '';
  const selectedDriver = selectedDriverId ? driversById.get(selectedDriverId) : null;
  const selectedLocation = selectedDriverId ? driverLocationsById.get(selectedDriverId) ?? null : null;
  const selectedJob = useMemo(() => {
    if (!selectedDriverId) return null;
    if (selectedLocation?.jobId) {
      return jobs.find((job) => job.id === selectedLocation.jobId) ?? null;
    }
    const driverJobs = jobs.filter((job) => job.driverId === selectedDriverId);
    const active = driverJobs.find((job) => job.status !== 'DONE' && job.status !== 'PENDING');
    if (active) return active;
    return driverJobs
      .slice()
      .sort((a, b) => {
        const aKey = a.scheduledAt ?? Number.NEGATIVE_INFINITY;
        const bKey = b.scheduledAt ?? Number.NEGATIVE_INFINITY;
        if (aKey !== bKey) return aKey - bKey;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })[0] ?? null;
  }, [jobs, selectedDriverId, selectedLocation?.jobId]);
  const mapTargetLabel = mapTarget === 'pickup' ? 'origen' : mapTarget === 'dropoff' ? 'destino' : 'parada extra';
  const scheduledJobs = useMemo(() => {
    return jobs
      .filter((job) => job.status !== 'DONE')
      .map((job) => {
        const scheduledAt = getScheduledAtMs(job.scheduledDate, job.scheduledTime, job.scheduledAt);
        if (scheduledAt == null) return null;
        const durationMinutes = getEstimatedDurationMinutes(job);
        const start = new Date(scheduledAt);
        const end = new Date(scheduledAt + durationMinutes * 60000);
        return { job, start, end, scheduledAt, durationMinutes };
      })
      .filter((item): item is CalendarJob => item != null)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }, [jobs]);
  const scheduledJobsByDay = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    scheduledJobs.forEach((item) => {
      const endInclusive = new Date(item.end.getTime() - 1);
      if (endInclusive < item.start) return;
      let cursor = startOfDay(item.start);
      const lastDay = startOfDay(endInclusive);
      while (cursor <= lastDay) {
        const key = buildDateKey(cursor);
        const bucket = map.get(key);
        if (bucket) {
          bucket.push(item);
        } else {
          map.set(key, [item]);
        }
        cursor = addDays(cursor, 1);
      }
    });
    map.forEach((items) => items.sort((a, b) => a.scheduledAt - b.scheduledAt));
    return map;
  }, [scheduledJobs]);
  const getDayJobs = (date: Date) => scheduledJobsByDay.get(buildDateKey(date)) ?? [];
  const calendarToday = startOfDay(new Date());
  const weekStart = startOfWeek(calendarDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthStart = startOfMonth(calendarDate);
  const monthGridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));
  const calendarRangeLabel = calendarView === 'day'
    ? dayLongFormatter.format(calendarDate)
    : calendarView === 'week'
      ? `${dayFormatter.format(weekDays[0])} - ${dayFormatter.format(weekDays[6])}`
      : monthFormatter.format(calendarDate);
  const handleCalendarToday = () => setCalendarDate(new Date());
  const moveCalendar = (direction: -1 | 1) => {
    setCalendarDate((prev) => {
      if (calendarView === 'day') return addDays(prev, direction);
      if (calendarView === 'week') return addDays(prev, direction * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
    });
  };
  const dayJobs = getDayJobs(calendarDate);
  const dayJobsByHour = new Map<number, CalendarJob[]>();
  const dayBlockedHours = new Set<number>();
  dayJobs.forEach((item) => {
    const hours = getHourSlotsForDay(item.start, item.end, calendarDate);
    hours.forEach((hour) => {
      if (hour < calendarStartHour || hour >= calendarEndHour) return;
      dayBlockedHours.add(hour);
      const bucket = dayJobsByHour.get(hour);
      if (bucket) {
        bucket.push(item);
      } else {
        dayJobsByHour.set(hour, [item]);
      }
    });
  });
  dayJobsByHour.forEach((items) => items.sort((a, b) => a.scheduledAt - b.scheduledAt));
  const dayFreeHours = calendarHours.filter((hour) => !dayBlockedHours.has(hour));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-blue-500">Panel Admin</p>
          <h1 className="text-2xl font-bold text-gray-900">Gestion de fletes</h1>
          <p className="text-sm text-gray-500">Asignaciones, conductores, calendario y analiticas.</p>
        </div>
        <div className="hidden lg:flex gap-2">
          <span className="rounded-full border px-3 py-1 text-xs text-gray-600">Fletes activos: {activeJobs}</span>
          <span className="rounded-full border px-3 py-1 text-xs text-gray-600">Sin asignar: {unassignedJobs}</span>
          <span className="rounded-full border px-3 py-1 text-xs text-gray-600">Conductores: {activeDrivers}</span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400">Total fletes</p>
          <p className="text-2xl font-semibold text-gray-900">{totalJobs}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400">Asignados</p>
          <p className="text-2xl font-semibold text-gray-900">{assignedJobs}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400">Sin asignar</p>
          <p className="text-2xl font-semibold text-gray-900">{unassignedJobs}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400">Conductores activos</p>
          <p className="text-2xl font-semibold text-gray-900">{activeDrivers}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-3">
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <button
              type="button"
              onClick={() => setTab('jobs')}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                tab === 'jobs' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
              )}
            >
              Fletes
            </button>
            <button
              type="button"
              onClick={() => setTab('drivers')}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                tab === 'drivers' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
              )}
            >
              Conductores
            </button>
            <button
              type="button"
              onClick={() => setTab('calendar')}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                tab === 'calendar' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
              )}
            >
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setTab('analytics')}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                tab === 'analytics' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
              )}
            >
              Analiticas
            </button>
          </div>
          <div className="hidden lg:block rounded-2xl border bg-white p-3 text-xs text-gray-500">
            <p className="font-semibold text-gray-700">Atajos</p>
            <p>Usa los tabs para navegar entre fletes, conductores, calendario y analiticas.</p>
            <p className="mt-2">Desde PC podes asignar rapido y crear fletes en paralelo.</p>
          </div>
        </aside>

        <section className="space-y-4">
          {tab === 'jobs' && (
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                <button onClick={() => setOpen(!open)} className="w-full rounded bg-blue-600 p-3 text-white">
                  {open ? 'Cerrar' : 'Nuevo Flete'}
                </button>
                {open && (
                  <form onSubmit={addJob} className="space-y-2 rounded bg-white p-4 shadow">
                    <input name="cn" placeholder="Cliente" className="w-full border p-2" required />
                    <textarea
                      name="description"
                      placeholder="Descripcion del flete"
                      className="w-full border p-2 text-sm"
                      rows={2}
                    />
                    <input
                      name="helpersCount"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Ayudantes requeridos"
                      className="w-full border p-2"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input name="scheduledDate" type="date" className="w-full border p-2" required />
                      <input name="scheduledTime" type="time" className="w-full border p-2" required />
                    </div>
                    <input
                      name="estimatedDurationHours"
                      type="number"
                      min="0.5"
                      step="0.5"
                      placeholder="Duracion estimada (horas)"
                      className="w-full border p-2"
                      required
                    />
                    <AddressAutocomplete label="Origen" placeholder="Buscar origen" onSelect={setPickup} selected={pickup} />
                    <AddressAutocomplete label="Destino" placeholder="Buscar destino" onSelect={setDropoff} selected={dropoff} />
                    <div className="rounded border bg-gray-50 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Paradas extra</p>
                        <span className="text-xs text-gray-400">{extraStops.length} agregadas</span>
                      </div>
                      <AddressAutocomplete
                        key={extraStopKey}
                        label="Agregar parada"
                        placeholder="Buscar parada extra"
                        onSelect={setExtraStopDraft}
                        selected={extraStopDraft}
                      />
                      <button
                        type="button"
                        onClick={() => addExtraStop(extraStopDraft)}
                        disabled={!extraStopDraft}
                        className="w-full rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Agregar parada
                      </button>
                      {extraStops.length === 0 ? (
                        <p className="text-xs text-gray-500">Sin paradas extra.</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-[11px] text-gray-400">Arrastra para reordenar.</p>
                          {extraStops.map((stop, index) => (
                            <div
                              key={`${stop.lat}-${stop.lng}-${index}`}
                              draggable
                              onDragStart={() => setDraggedStopIndex(index)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => handleReorderStop(index)}
                              onDragEnd={() => setDraggedStopIndex(null)}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs text-gray-600",
                                draggedStopIndex === index ? "opacity-60" : "cursor-grab"
                              )}
                            >
                              <span className="truncate">{stop.address}</span>
                              <button
                                type="button"
                                onClick={() => removeExtraStop(index)}
                                className="text-amber-600"
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <select name="driverId" className="w-full border p-2">
                      <option value="">Sin asignar</option>
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} ({driver.code})
                        </option>
                      ))}
                    </select>
                    <div className="rounded border bg-gray-50 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Seleccion en mapa</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMapTarget('pickup')}
                            className={cn(
                              "rounded border px-2 py-1 text-xs",
                              mapTarget === 'pickup' ? "border-green-600 bg-green-600 text-white" : "bg-white text-gray-600"
                            )}
                          >
                            Origen
                          </button>
                          <button
                            type="button"
                            onClick={() => setMapTarget('dropoff')}
                            className={cn(
                              "rounded border px-2 py-1 text-xs",
                              mapTarget === 'dropoff' ? "border-red-600 bg-red-600 text-white" : "bg-white text-gray-600"
                            )}
                          >
                            Destino
                          </button>
                          <button
                            type="button"
                            onClick={() => setMapTarget('extra')}
                            className={cn(
                              "rounded border px-2 py-1 text-xs",
                              mapTarget === 'extra' ? "border-amber-500 bg-amber-500 text-white" : "bg-white text-gray-600"
                            )}
                          >
                            Parada
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Click en el mapa para asignar {mapTargetLabel}.</p>
                      <MapLocationPicker
                        pickup={pickup}
                        dropoff={dropoff}
                        extraStops={extraStops}
                        active={mapTarget}
                        onSelect={(kind, location) => {
                          if (kind === 'pickup') {
                            setPickup(location);
                          } else if (kind === 'dropoff') {
                            setDropoff(location);
                          } else {
                            setExtraStops((prev) => [...prev, location]);
                            setExtraStopDraft(null);
                            setExtraStopKey((prev) => prev + 1);
                          }
                        }}
                      />
                    </div>
                    <button className="w-full rounded bg-green-600 p-2 text-white">Guardar</button>
                  </form>
                )}
              </div>

              <div className="space-y-3">
                {!loadingJobs && (
                  <div className="rounded-2xl border bg-white p-3 shadow-sm space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wide text-gray-400">Filtros</p>
                      {hasFilters && (
                        <button
                          type="button"
                          onClick={() => {
                            setAssignedFilter('all');
                            setStatusFilter('all');
                            setDateFilter('');
                            setDriverFilter('');
                          }}
                          className="text-xs font-semibold text-blue-600"
                        >
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs text-gray-500">
                        Asignacion
                        <select
                          value={assignedFilter}
                          onChange={(event) => setAssignedFilter(event.target.value as typeof assignedFilter)}
                          className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                        >
                          <option value="all">Todos</option>
                          <option value="assigned">Asignados</option>
                          <option value="unassigned">Sin asignar</option>
                        </select>
                      </label>
                      <label className="text-xs text-gray-500">
                        Estado
                        <select
                          value={statusFilter}
                          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                          className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                        >
                          <option value="all">Todos</option>
                          <option value="pending">Pendientes</option>
                        </select>
                      </label>
                      <label className="text-xs text-gray-500">
                        Fecha
                        <input
                          type="date"
                          value={dateFilter}
                          onChange={(event) => setDateFilter(event.target.value)}
                          className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                        />
                      </label>
                      <label className="text-xs text-gray-500">
                        Conductor
                        <select
                          value={driverFilter}
                          onChange={(event) => setDriverFilter(event.target.value)}
                          disabled={assignedFilter === 'unassigned'}
                          className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                        >
                          <option value="">Todos</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name} ({driver.code})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                )}
                {loadingJobs && <p className="text-sm text-gray-500">Cargando fletes...</p>}
                {!loadingJobs && jobs?.length === 0 && <p className="text-sm text-gray-500">No hay fletes cargados.</p>}
                {!loadingJobs && jobs?.length > 0 && filteredJobs.length === 0 && (
                  <p className="text-sm text-gray-500">No hay fletes para los filtros seleccionados.</p>
                )}
                {!loadingJobs && filteredJobs?.map((job) => {
                  const tripStart = job.timestamps.startTripAt ?? job.timestamps.endLoadingAt;
                  const tripEnd = job.timestamps.endTripAt ?? job.timestamps.startUnloadingAt;
                  const loading = formatDuration(job.timestamps.startLoadingAt, job.timestamps.endLoadingAt);
                  const trip = formatDuration(tripStart, tripEnd);
                  const unloading = formatDuration(job.timestamps.startUnloadingAt, job.timestamps.endUnloadingAt);
                  const total = formatDuration(job.timestamps.startLoadingAt, job.timestamps.endUnloadingAt);
                  const estimatedLabel = Number.isFinite(job.estimatedDurationMinutes)
                    ? formatDurationMs((job.estimatedDurationMinutes as number) * 60000)
                    : 'N/D';
                  const driver = job.driverId ? driversById.get(job.driverId) : null;
                  return (
                    <div key={job.id} className="space-y-2 rounded border-l-4 border-blue-500 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{job.clientName}</p>
                          <p className="text-xs text-gray-700">Fecha: {job.scheduledDate || 'Sin fecha'} | Hora: {job.scheduledTime || 'Sin hora'}</p>
                          <p className="text-xs">{job.status}</p>
                          {job.description && (
                            <p className="text-xs text-gray-600">Descripcion: {job.description}</p>
                          )}
                          <p className="text-xs text-gray-600">Estimado: {estimatedLabel}</p>
                          <p className="text-xs text-gray-600">Ayudantes: {job.helpersCount ?? 0}</p>
                          {job.extraStops && job.extraStops.length > 0 && (
                            <p className="text-xs text-gray-600">Paradas extra: {job.extraStops.length}</p>
                          )}
                          <p className="text-xs text-gray-600">Carga: {loading} | Viaje: {trip} | Descarga: {unloading} | Total: {total}</p>
                        </div>
                        <button onClick={() => handleDeleteJob(job.id)} className="text-red-500 text-sm" aria-label="Eliminar">Eliminar</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-gray-500">Conductor:</label>
                        <select
                          value={job.driverId ?? ''}
                          onChange={(e) => handleAssignJob(job, e.target.value)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="">Sin asignar</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name} ({driver.code})
                            </option>
                          ))}
                        </select>
                        {driver && <span className="text-xs text-gray-500">Activo: {driver.active ? 'Si' : 'No'}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'calendar' && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Calendario</p>
                    <h2 className="text-lg font-semibold text-gray-900">Agenda de fletes</h2>
                    <p className="text-xs text-gray-500">Visualiza huecos disponibles para agendar.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCalendarToday}
                      className="rounded-full border px-3 py-1 text-xs font-semibold text-gray-600"
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCalendar(-1)}
                      className="rounded-full border px-3 py-1 text-xs font-semibold text-gray-600"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCalendar(1)}
                      className="rounded-full border px-3 py-1 text-xs font-semibold text-gray-600"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-700">{calendarRangeLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCalendarView('day')}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        calendarView === 'day' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
                      )}
                    >
                      Dia
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarView('week')}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        calendarView === 'week' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
                      )}
                    >
                      Semana
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarView('month')}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        calendarView === 'month' ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600"
                      )}
                    >
                      Mes
                    </button>
                  </div>
                </div>

                {calendarView === 'day' && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
                    <div className="space-y-2">
                      {calendarHours.map((hour) => {
                        const hourJobs = dayJobsByHour.get(hour) ?? [];
                        return (
                          <div key={hour} className="flex items-start gap-3 rounded border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="w-16 text-xs font-semibold text-gray-500">
                              {String(hour).padStart(2, '0')}:00
                            </div>
                            {hourJobs.length === 0 ? (
                              <p className="text-xs text-gray-400">Libre</p>
                            ) : (
                              <div className="space-y-1">
                                {hourJobs.map((item) => (
                                  <div key={item.job.id} className="rounded bg-white px-2 py-1 text-xs text-gray-700 shadow-sm">
                                    <span className="font-semibold">{item.job.clientName}</span>
                                    <span className="text-gray-400"> - {formatJobRangeForDay(item.start, item.end, calendarDate)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Huecos disponibles</p>
                      {dayFreeHours.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No hay huecos libres para este dia.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {dayFreeHours.map((hour) => (
                            <span
                              key={hour}
                              className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-700"
                            >
                              {String(hour).padStart(2, '0')}:00
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {calendarView === 'week' && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                    {weekDays.map((day) => {
                      const items = getDayJobs(day);
                      const blockedHours = new Set<number>();
                      items.forEach((item) => {
                        getHourSlotsForDay(item.start, item.end, day).forEach((hour) => {
                          if (hour < calendarStartHour || hour >= calendarEndHour) return;
                          blockedHours.add(hour);
                        });
                      });
                      const freeHours = calendarHours.filter((hour) => !blockedHours.has(hour));
                      const isToday = isSameDay(day, calendarToday);
                      return (
                        <div
                          key={buildDateKey(day)}
                          className={cn(
                            "rounded-2xl border p-3 text-xs",
                            isToday ? "border-blue-500 bg-blue-50/40" : "border-gray-100 bg-white"
                          )}
                        >
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">{dayFormatter.format(day)}</p>
                          <p className="mt-1 text-[11px] text-gray-500">Huecos: {freeHours.length}</p>
                          <div className="mt-2 space-y-1">
                            {items.length === 0 ? (
                              <p className="text-xs text-gray-400">Libre</p>
                            ) : (
                              items.map((item) => (
                                <div
                                  key={item.job.id}
                                  className="truncate rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700"
                                >
                                  {formatJobRangeForDay(item.start, item.end, day)} - {item.job.clientName}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {calendarView === 'month' && (
                  <div className="mt-4">
                    <div className="grid grid-cols-7 gap-2 text-[11px] uppercase tracking-wide text-gray-400">
                      <span>Lun</span>
                      <span>Mar</span>
                      <span>Mie</span>
                      <span>Jue</span>
                      <span>Vie</span>
                      <span>Sab</span>
                      <span>Dom</span>
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-2">
                      {monthDays.map((day) => {
                        const items = getDayJobs(day);
                        const isCurrentMonth = isSameMonth(day, calendarDate);
                        const isToday = isSameDay(day, calendarToday);
                        return (
                          <div
                            key={buildDateKey(day)}
                            className={cn(
                              "min-h-[90px] rounded-2xl border p-2 text-[11px]",
                              isCurrentMonth ? "border-gray-100 bg-white" : "border-gray-100 bg-gray-50 text-gray-400"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn("text-xs font-semibold", isToday ? "text-blue-600" : "text-gray-700")}>
                                {day.getDate()}
                              </span>
                              {items.length > 0 && (
                                <span className="rounded-full bg-blue-50 px-2 py-[2px] text-[10px] text-blue-600">
                                  {items.length} {items.length === 1 ? 'flete' : 'fletes'}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 space-y-1">
                              {items.slice(0, 3).map((item) => (
                                <div key={item.job.id} className="truncate rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-700">
                                  {formatJobRangeForDay(item.start, item.end, day)} {item.job.clientName}
                                </div>
                              ))}
                              {items.length > 3 && (
                                <p className="text-[10px] text-gray-400">+{items.length - 3} mas</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="mt-4 text-[11px] text-gray-400">
                  Huecos estimados por bloques de 1 hora entre {String(calendarStartHour).padStart(2, '0')}:00 y {String(calendarEndHour - 1).padStart(2, '0')}:00,
                  segun la duracion estimada de cada flete. Solo se muestran fletes con fecha y hora definida.
                </p>
              </div>
            </div>
          )}

          {tab === 'drivers' && (
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <form onSubmit={handleCreateDriver} className="space-y-2 rounded bg-white p-4 shadow">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Nombre del conductor"
                    className="w-full border p-2"
                    required
                  />
                  <div className="flex gap-2">
                    <input
                      value={driverCode}
                      onChange={(e) => setDriverCode(e.target.value.toUpperCase())}
                      placeholder="Codigo"
                      className="w-full border p-2"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setDriverCode(buildDriverCode())}
                      className="rounded border px-3 text-xs"
                    >
                      Generar
                    </button>
                  </div>
                  <input
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="Telefono (opcional)"
                    className="w-full border p-2 sm:col-span-2"
                  />
                </div>
                <button className="w-full rounded bg-green-600 p-2 text-white">Guardar conductor</button>
              </form>
              <div className="space-y-3">
                <div className="rounded-2xl border bg-white p-3 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">Mapa general</p>
                    <span className="text-xs text-gray-400">Actualiza cada 12s</span>
                  </div>
                  <div className="relative">
                    <DriversOverviewMap locations={driverLocations} drivers={drivers} />
                    {loadingLocations && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-xs text-gray-500">
                        Cargando ubicaciones...
                      </div>
                    )}
                  </div>
                </div>
                {loadingDrivers && <p className="text-sm text-gray-500">Cargando conductores...</p>}
                {!loadingDrivers && drivers.length === 0 && <p className="text-sm text-gray-500">No hay conductores registrados.</p>}
                {!loadingDrivers && drivers.map((driver) => (
                  <div key={driver.id} className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-3 shadow-sm">
                    <div>
                      <p className="font-semibold text-gray-900">{driver.name}</p>
                      <p className="text-xs text-gray-500">Codigo: <span className="font-mono">{driver.code}</span></p>
                      <p className="text-xs text-gray-500">{driver.phone || 'Sin telefono'}</p>
                      <p className="text-xs text-gray-400">
                        Ubicacion: {driverLocationsById.has(driver.id) ? 'Disponible' : 'Sin datos'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectDriverMap(driver.id)}
                        className="rounded border px-2 py-1 text-xs text-blue-600"
                      >
                        Ver mapa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleDriver(driver)}
                        className={cn(
                          "rounded border px-2 py-1 text-xs",
                          driver.active ? "border-emerald-500 text-emerald-600" : "border-gray-300 text-gray-500"
                        )}
                      >
                        {driver.active ? 'Activo' : 'Inactivo'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDriver(driver.id)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-500"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Total fletes</p>
                  <p className="text-2xl font-semibold text-gray-900">{totalJobs}</p>
                  <p className="text-xs text-gray-500">Incluye activos y completados.</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Conductores activos</p>
                  <p className="text-2xl font-semibold text-gray-900">{activeDrivers}</p>
                  <p className="text-xs text-gray-500">Disponibilidad actual.</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Tiempo promedio</p>
                  <p className="text-2xl font-semibold text-gray-900">{averageDurationLabel}</p>
                  <p className="text-xs text-gray-500">
                    {completedHistory.length === 0 ? 'Aun no hay historicos.' : `Sobre ${completedHistory.length} completados.`}
                  </p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Precio hora actual</p>
                  <p className="text-2xl font-semibold text-gray-900">{hourlyRateLabel}</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="Ej: 15000"
                    value={hourlyRateInput}
                    onChange={(event) => setHourlyRateInput(event.target.value)}
                    className="mt-2 w-full rounded border px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSaveHourlyRate}
                    disabled={savingHourlyRate}
                    className="mt-2 w-full rounded border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingHourlyRate ? 'Guardando...' : 'Guardar precio hora'}
                  </button>
                  <p className="mt-2 text-xs text-gray-500">{totalRevenueCaption}: {totalRevenueLabel}</p>
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Precio hora ayudante</p>
                    <p className="text-lg font-semibold text-gray-900">{helperHourlyRateLabel}</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="Ej: 8000"
                      value={helperHourlyRateInput}
                      onChange={(event) => setHelperHourlyRateInput(event.target.value)}
                      className="mt-2 w-full rounded border px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSaveHelperHourlyRate}
                      disabled={savingHelperHourlyRate}
                      className="mt-2 w-full rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingHelperHourlyRate ? 'Guardando...' : 'Guardar precio ayudante'}
                    </button>
                    <p className="mt-2 text-xs text-gray-500">Total ayudantes estimado: {totalHelperCostLabel}</p>
                  </div>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Fletes activos</p>
                  <p className="text-2xl font-semibold text-gray-900">{activeJobs}</p>
                  <p className="text-xs text-gray-500">En curso y pendientes.</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Sin asignar</p>
                  <p className="text-2xl font-semibold text-gray-900">{unassignedJobs}</p>
                  <p className="text-xs text-gray-500">Pendientes de conductor.</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Ingresos diarios acumulados</p>
                    <p className="text-lg font-semibold text-gray-900">Progreso del mes: {currentMonthLabel}</p>
                  </div>
                  {!hasMonthlyPricing && (
                    <span className="text-xs text-amber-600">Configura precios para ver montos</span>
                  )}
                </div>
                <div className="mt-3 text-3xl font-semibold text-emerald-600">
                  {dailyTotalLabel}
                </div>
                <div className="mt-4">
                  <svg viewBox="0 0 720 240" className="h-44 w-full">
                    <defs>
                      <linearGradient id="daily-line" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    {dailyRevenueTicks.map((tick, index) => {
                      const y = 20 + (150 * index) / (dailyRevenueTicks.length - 1);
                      return (
                        <g key={tick.value}>
                          <line x1="60" y1={y} x2="700" y2={y} stroke="#e5e7eb" strokeDasharray="4 6" />
                          <text x="6" y={y + 4} fontSize="10" fill="#6b7280">
                            {tick.label}
                          </text>
                        </g>
                      );
                    })}
                    <polyline
                      fill="url(#daily-line)"
                      stroke="none"
                      points={[
                        `60,170`,
                        ...dailyRevenueSeries.map((item, index) => {
                          const x = 60 + (640 * (dailyRevenueSeries.length === 1 ? 0.5 : index / (dailyRevenueSeries.length - 1)));
                          const y = 20 + (150 * (1 - item.total / dailyRevenueScaleMax));
                          return `${x},${y}`;
                        }),
                        `700,170`,
                      ].join(' ')}
                    />
                    <polyline
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={dailyRevenueSeries.map((item, index) => {
                        const x = 60 + (640 * (dailyRevenueSeries.length === 1 ? 0.5 : index / (dailyRevenueSeries.length - 1)));
                        const y = 20 + (150 * (1 - item.total / dailyRevenueScaleMax));
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                    {dailyRevenueSeries.map((item, index) => {
                      const x = 60 + (640 * (dailyRevenueSeries.length === 1 ? 0.5 : index / (dailyRevenueSeries.length - 1)));
                      const y = 20 + (150 * (1 - item.total / dailyRevenueScaleMax));
                      const showLabel = item.day === 1 || item.day % 5 === 0 || index === dailyRevenueSeries.length - 1;
                      return (
                        <g key={item.key}>
                          <circle cx={x} cy={y} r="3.5" fill="#0284c7" />
                          {showLabel && (
                            <text x={x} y="208" textAnchor="middle" fontSize="9" fill="#6b7280">
                              {item.day}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Ingresos por mes</p>
                    <p className="text-lg font-semibold text-gray-900">Progreso de los ultimos 12 meses</p>
                  </div>
                  {!hasMonthlyPricing && (
                    <span className="text-xs text-amber-600">Configura precios para ver montos</span>
                  )}
                </div>
                <div className="mt-3 text-3xl font-semibold text-emerald-600">
                  {yearlyTotalLabel}
                </div>
                <div className="mt-4">
                  <svg viewBox="0 0 600 220" className="h-44 w-full">
                    <defs>
                      <linearGradient id="monthly-line" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    {monthlyRevenueTicks.map((tick, index) => {
                      const y = 20 + (140 * index) / (monthlyRevenueTicks.length - 1);
                      return (
                        <g key={tick.value}>
                          <line x1="60" y1={y} x2="590" y2={y} stroke="#e5e7eb" strokeDasharray="4 6" />
                          <text x="6" y={y + 4} fontSize="10" fill="#6b7280">
                            {tick.label}
                          </text>
                        </g>
                      );
                    })}
                    <polyline
                      fill="url(#monthly-line)"
                      stroke="none"
                      points={[
                        `60,160`,
                        ...monthlyRevenueSeries.map((item, index) => {
                          const x = 60 + (530 * (monthlyRevenueSeries.length === 1 ? 0.5 : index / (monthlyRevenueSeries.length - 1)));
                          const y = 20 + (140 * (1 - item.total / monthlyRevenueScaleMax));
                          return `${x},${y}`;
                        }),
                        `590,160`,
                      ].join(' ')}
                    />
                    <polyline
                      fill="none"
                      stroke="#059669"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={monthlyRevenueSeries.map((item, index) => {
                        const x = 60 + (530 * (monthlyRevenueSeries.length === 1 ? 0.5 : index / (monthlyRevenueSeries.length - 1)));
                        const y = 20 + (140 * (1 - item.total / monthlyRevenueScaleMax));
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                    {monthlyRevenueSeries.map((item, index) => {
                      const x = 60 + (530 * (monthlyRevenueSeries.length === 1 ? 0.5 : index / (monthlyRevenueSeries.length - 1)));
                      const y = 20 + (140 * (1 - item.total / monthlyRevenueScaleMax));
                      return (
                        <g key={item.key}>
                          <circle cx={x} cy={y} r="5" fill="#059669" />
                          <text x={x} y="198" textAnchor="middle" fontSize="10" fill="#6b7280">
                            {item.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Historial</p>
                    <p className="text-lg font-semibold text-gray-900">Fletes realizados</p>
                    <p className="text-xs text-gray-500">Total bruto {currentMonthLabel}: {monthlyGrossLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{completedHistory.length} completados</span>
                    <button
                      type="button"
                      onClick={handleDownloadHistory}
                      className="rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700"
                    >
                      Descargar Excel
                    </button>
                  </div>
                </div>
                {completedHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">No hay fletes completados aun.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {completedHistory.map((entry) => {
                      const driver = entry.job.driverId ? driversById.get(entry.job.driverId) : null;
                      const durationLabel = entry.durationMs != null ? formatDurationMs(entry.durationMs) : 'Sin tiempos';
                      const helpersCount = entry.job.helpersCount ?? 0;
                      const billedHours = getBilledHours(entry.durationMs);
                      const jobValue = hourlyRateValue != null && entry.durationMs != null
                        ? (billedHours ?? 0) * hourlyRateValue
                        : null;
                      const helpersValue = helperHourlyRateValue != null && entry.durationMs != null && helpersCount > 0
                        ? (billedHours ?? 0) * helperHourlyRateValue * helpersCount
                        : null;
                      const totalValue = jobValue != null || helpersValue != null
                        ? (jobValue ?? 0) + (helpersValue ?? 0)
                        : null;
                      const chargedAmount = entry.job.chargedAmount ?? null;
                      const chargedAmountLabel = chargedAmount != null ? currencyFormatter.format(chargedAmount) : null;
                      const jobValueLabel = jobValue != null
                        ? currencyFormatter.format(jobValue)
                        : hourlyRateValue == null
                          ? 'Defini precio hora'
                          : 'Sin tiempos';
                      const helpersValueLabel = helpersValue != null
                        ? currencyFormatter.format(helpersValue)
                        : helperHourlyRateValue == null
                          ? 'Defini precio ayudante'
                          : helpersCount > 0
                            ? 'Sin tiempos'
                            : 'Sin ayudantes';
                      const computedTotalLabel = totalValue != null ? currencyFormatter.format(totalValue) : 'N/D';
                      const displayTotalLabel = chargedAmountLabel ?? computedTotalLabel;
                      const endLabel = entry.endMs != null ? new Date(entry.endMs).toLocaleString() : 'Sin datos';
                      const chargedInputValue = chargedAmountDrafts[entry.job.id] ?? (chargedAmount != null ? String(chargedAmount) : '');
                      const isSavingCharge = savingChargedAmountId === entry.job.id;
                      return (
                        <div key={entry.job.id} className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{entry.job.clientName}</p>
                              {entry.job.description && (
                                <p className="text-xs text-gray-500">Descripcion: {entry.job.description}</p>
                              )}
                              <p className="text-xs text-gray-500">Conductor: {driver ? driver.name : 'Sin asignar'}</p>
                              <p className="text-xs text-gray-500">Ayudantes: {helpersCount}</p>
                              <p className="text-xs text-gray-500">Finalizado: {endLabel}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">{displayTotalLabel}</p>
                              {chargedAmountLabel && (
                                <p className="text-xs text-emerald-600">Cobrado</p>
                              )}
                              {chargedAmountLabel && totalValue != null && (
                                <p className="text-xs text-gray-500">Estimado: {computedTotalLabel}</p>
                              )}
                              <p className="text-xs text-gray-500">Flete: {jobValueLabel}</p>
                              <p className="text-xs text-gray-500">Ayudantes: {helpersValueLabel}</p>
                              <p className="text-xs text-gray-500">Duracion: {durationLabel}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-[11px] uppercase tracking-wide text-gray-400">Cobrado</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              placeholder="Ej: 30000"
                              value={chargedInputValue}
                              onChange={(event) => {
                                const value = event.target.value;
                                setChargedAmountDrafts((prev) => ({ ...prev, [entry.job.id]: value }));
                              }}
                              className="w-28 rounded border px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveChargedAmount(entry.job)}
                              disabled={isSavingCharge}
                              className="rounded border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSavingCharge ? 'Guardando...' : 'Guardar'}
                            </button>
                            {chargedAmount != null && (
                              <button
                                type="button"
                                onClick={() => handleClearChargedAmount(entry.job)}
                                disabled={isSavingCharge}
                                className="rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedDriverId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl space-y-3 rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-500">Mapa del conductor</p>
                <h2 className="text-lg font-semibold text-gray-900">{selectedDriver?.name ?? 'Conductor'}</h2>
                {selectedLocation && (
                  <p className="text-xs text-gray-500">Actualizado: {new Date(selectedLocation.updatedAt).toLocaleString()}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDriverId(null)}
                className="rounded border px-3 py-1 text-xs text-gray-600"
              >
                Cerrar
              </button>
            </div>
            {!selectedLocation && (
              <p className="text-sm text-gray-500">No hay ubicacion reportada por este conductor.</p>
            )}
            {selectedLocation && (
              <DriverRouteMap location={selectedLocation} job={selectedJob} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
