import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { Flag, MapPin, MoreVertical } from 'lucide-react';
import AddressAutocomplete from '../components/AddressAutocomplete';
import MapLocationPicker from '../components/MapLocationPicker';
import DriversOverviewMap from '../components/DriversOverviewMap';
import DriverRouteMap from '../components/DriverRouteMap';
import JobRoutePreviewMap from '../components/JobRoutePreviewMap';
import type { Driver, DriverLocation, Job, JobStatus, LocationData } from '../lib/types';
import {
  createDriver,
  createJob,
  deleteDriver,
  deleteJob,
  downloadJobsHistory,
  getFixedMonthlyCost,
  getHelperHourlyRate,
  getHourlyRate,
  getTripCostPerHour,
  getTripCostPerKm,
  listDriverLocations,
  listDrivers,
  listJobs,
  setFixedMonthlyCost,
  setHelperHourlyRate,
  setHourlyRate,
  setTripCostPerHour,
  setTripCostPerKm,
  updateDriver,
  updateJob,
} from '../lib/api';
import { calculateDistance, cn, formatDuration, getScheduledAtMs } from '../lib/utils';
import { reorderList } from '../lib/reorder';

const buildDriverCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 });
const decimalFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const monthShortFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
const dayLongFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const calendarStartHour = 6;
const calendarEndHour = 22;
const calendarHourHeight = 56;
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
const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const getMinutesIntoDay = (date: Date) => date.getHours() * 60 + date.getMinutes();
const getEventBlockStyle = (start: Date, end: Date, day: Date) => {
  const overlap = getDayOverlapRange(start, end, day);
  if (!overlap) return null;
  const startMinutes = getMinutesIntoDay(overlap.rangeStart);
  const endMinutes = getMinutesIntoDay(overlap.rangeEnd);
  const minMinutes = calendarStartHour * 60;
  const maxMinutes = calendarEndHour * 60;
  const clampedStart = clampNumber(startMinutes, minMinutes, maxMinutes);
  const clampedEnd = clampNumber(endMinutes, minMinutes, maxMinutes);
  if (clampedEnd <= clampedStart) return null;
  const top = ((clampedStart - minMinutes) / 60) * calendarHourHeight;
  const height = Math.max(24, ((clampedEnd - clampedStart) / 60) * calendarHourHeight);
  return { top, height };
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

type AdminTab = 'jobs' | 'drivers' | 'calendar' | 'analytics' | 'settings';

const resolveAdminTab = (value?: string | null): AdminTab | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'jobs':
    case 'job':
    case 'fletes':
      return 'jobs';
    case 'drivers':
    case 'driver':
    case 'conductores':
      return 'drivers';
    case 'calendar':
    case 'calendario':
      return 'calendar';
    case 'analytics':
    case 'analiticas':
    case 'analitica':
      return 'analytics';
    case 'settings':
    case 'config':
    case 'configuracion':
      return 'settings';
    default:
      return null;
  }
};

type EditJobDraft = {
  clientName: string;
  description: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedDurationHours: string;
  helpersCount: string;
  driverId: string;
};

const emptyEditDraft: EditJobDraft = {
  clientName: '',
  description: '',
  scheduledDate: '',
  scheduledTime: '',
  estimatedDurationHours: '',
  helpersCount: '',
  driverId: '',
};

const getEstimatedDurationMinutes = (job: Job) => {
  if (Number.isFinite(job.estimatedDurationMinutes) && (job.estimatedDurationMinutes as number) > 0) {
    return job.estimatedDurationMinutes as number;
  }
  return 60;
};

const formatDurationHours = (minutes?: number | null) => {
  if (!Number.isFinite(minutes) || (minutes as number) <= 0) return '1';
  const hours = (minutes as number) / 60;
  return hours.toFixed(2).replace(/\.?0+$/, '');
};

const isValidLocation = (loc?: LocationData | null) =>
  !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);

const getJobDistanceKm = (job: Job) => {
  if (Number.isFinite(job.distanceKm)) return job.distanceKm as number;
  if (Number.isFinite(job.distanceMeters)) return (job.distanceMeters as number) / 1000;
  const points = [job.pickup, ...(job.extraStops ?? []), job.dropoff].filter(isValidLocation);
  if (points.length < 2) return null;
  let meters = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    meters += calculateDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  if (!Number.isFinite(meters)) return null;
  return meters / 1000;
};

const getStatusBadge = (status: JobStatus) => {
  if (status === 'DONE') {
    return { label: 'Completado', className: 'bg-emerald-100 text-emerald-700' };
  }
  if (status === 'PENDING') {
    return { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' };
  }
  return { label: 'En curso', className: 'bg-blue-100 text-blue-700' };
};

export default function AdminJobs() {
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const tab = useMemo<AdminTab>(() => (
    resolveAdminTab(searchParams.get('tab')) ?? resolveAdminTab(section) ?? 'jobs'
  ), [searchParams, section]);
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('week');
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [nowTick, setNowTick] = useState(() => Date.now());
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
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedMapJobId, setSelectedMapJobId] = useState<string | null>(null);
  const [openJobMenuId, setOpenJobMenuId] = useState<string | null>(null);
  const [mapSearchLocation, setMapSearchLocation] = useState<LocationData | null>(null);
  const [hourlyRateInput, setHourlyRateInput] = useState('');
  const [helperHourlyRateInput, setHelperHourlyRateInput] = useState('');
  const [fixedMonthlyCostInput, setFixedMonthlyCostInput] = useState('');
  const [tripCostPerHourInput, setTripCostPerHourInput] = useState('');
  const [tripCostPerKmInput, setTripCostPerKmInput] = useState('');
  const [savingHourlyRate, setSavingHourlyRate] = useState(false);
  const [savingHelperHourlyRate, setSavingHelperHourlyRate] = useState(false);
  const [savingFixedMonthlyCost, setSavingFixedMonthlyCost] = useState(false);
  const [savingTripCostPerHour, setSavingTripCostPerHour] = useState(false);
  const [savingTripCostPerKm, setSavingTripCostPerKm] = useState(false);
  const [chargedAmountDrafts, setChargedAmountDrafts] = useState<Record<string, string>>({});
  const [savingChargedAmountId, setSavingChargedAmountId] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditJobDraft>(emptyEditDraft);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
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
  const fixedMonthlyCostValue = useMemo(() => parseHourlyRate(fixedMonthlyCostInput), [fixedMonthlyCostInput]);
  const tripCostPerHourValue = useMemo(() => parseHourlyRate(tripCostPerHourInput), [tripCostPerHourInput]);
  const tripCostPerKmValue = useMemo(() => parseHourlyRate(tripCostPerKmInput), [tripCostPerKmInput]);

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

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);


  useEffect(() => {
    if (!openJobMenuId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest('[data-job-menu]')) return;
      setOpenJobMenuId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openJobMenuId]);

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

  const loadFixedMonthlyCost = async () => {
    try {
      const data = await getFixedMonthlyCost();
      setFixedMonthlyCostInput(data.value != null ? String(data.value) : '');
    } catch {
      toast.error('No se pudo cargar el costo fijo mensual');
    }
  };

  const loadTripCostPerHour = async () => {
    try {
      const data = await getTripCostPerHour();
      setTripCostPerHourInput(data.value != null ? String(data.value) : '');
    } catch {
      toast.error('No se pudo cargar el costo por hora');
    }
  };

  const loadTripCostPerKm = async () => {
    try {
      const data = await getTripCostPerKm();
      setTripCostPerKmInput(data.value != null ? String(data.value) : '');
    } catch {
      toast.error('No se pudo cargar el costo por km');
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
    loadFixedMonthlyCost();
    loadTripCostPerHour();
    loadTripCostPerKm();
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

  const startEditJob = (job: Job) => {
    setEditingJobId(job.id);
    setEditDraft({
      clientName: job.clientName ?? '',
      description: job.description ?? '',
      scheduledDate: job.scheduledDate ?? '',
      scheduledTime: job.scheduledTime ?? '',
      estimatedDurationHours: formatDurationHours(job.estimatedDurationMinutes),
      helpersCount: Number.isFinite(job.helpersCount) ? String(job.helpersCount) : '',
      driverId: job.driverId ?? '',
    });
  };

  const cancelEditJob = () => {
    setEditingJobId(null);
    setEditDraft(emptyEditDraft);
  };

  const handleSaveEditJob = async (job: Job) => {
    const clientName = editDraft.clientName.trim();
    if (!clientName) {
      toast.error('Nombre del cliente requerido');
      return;
    }
    if (!editDraft.scheduledDate || !editDraft.scheduledTime) {
      toast.error('Fecha y hora requeridas');
      return;
    }
    const estimatedHours = parseDurationHours(editDraft.estimatedDurationHours);
    if (estimatedHours == null) {
      toast.error('Duracion estimada invalida');
      return;
    }
    const helpersCountRaw = editDraft.helpersCount.trim();
    const helpersCount = helpersCountRaw ? Number.parseInt(helpersCountRaw, 10) : undefined;
    if (helpersCountRaw && (!Number.isInteger(helpersCount) || (helpersCount ?? 0) < 0)) {
      toast.error('Cantidad de ayudantes invalida');
      return;
    }
    try {
      setSavingEditId(job.id);
      const updated = await updateJob(job.id, {
        clientName,
        description: editDraft.description.trim() || undefined,
        scheduledDate: editDraft.scheduledDate,
        scheduledTime: editDraft.scheduledTime,
        estimatedDurationMinutes: Math.max(1, Math.round(estimatedHours * 60)),
        helpersCount: helpersCountRaw ? helpersCount : undefined,
        driverId: editDraft.driverId ? editDraft.driverId : null,
      });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? updated : item)));
      toast.success('Flete actualizado');
      cancelEditJob();
    } catch {
      toast.error('No se pudo actualizar el flete');
    } finally {
      setSavingEditId(null);
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
      setDriverModalOpen(false);
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

  const handleSaveFixedMonthlyCost = async () => {
    const parsed = parseHourlyRate(fixedMonthlyCostInput);
    if (fixedMonthlyCostInput.trim() && parsed == null) {
      toast.error('Costo fijo mensual invalido');
      return;
    }
    try {
      setSavingFixedMonthlyCost(true);
      const saved = await setFixedMonthlyCost(parsed);
      setFixedMonthlyCostInput(saved.value != null ? String(saved.value) : '');
      toast.success('Costo fijo mensual actualizado');
    } catch {
      toast.error('No se pudo guardar el costo fijo');
    } finally {
      setSavingFixedMonthlyCost(false);
    }
  };

  const handleSaveTripCostPerHour = async () => {
    const parsed = parseHourlyRate(tripCostPerHourInput);
    if (tripCostPerHourInput.trim() && parsed == null) {
      toast.error('Costo por hora invalido');
      return;
    }
    try {
      setSavingTripCostPerHour(true);
      const saved = await setTripCostPerHour(parsed);
      setTripCostPerHourInput(saved.value != null ? String(saved.value) : '');
      toast.success('Costo por hora actualizado');
    } catch {
      toast.error('No se pudo guardar el costo por hora');
    } finally {
      setSavingTripCostPerHour(false);
    }
  };

  const handleSaveTripCostPerKm = async () => {
    const parsed = parseHourlyRate(tripCostPerKmInput);
    if (tripCostPerKmInput.trim() && parsed == null) {
      toast.error('Costo por km invalido');
      return;
    }
    try {
      setSavingTripCostPerKm(true);
      const saved = await setTripCostPerKm(parsed);
      setTripCostPerKmInput(saved.value != null ? String(saved.value) : '');
      toast.success('Costo por km actualizado');
    } catch {
      toast.error('No se pudo guardar el costo por km');
    } finally {
      setSavingTripCostPerKm(false);
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
  const jobDistanceKmById = useMemo(() => {
    const map = new Map<string, number>();
    jobs.forEach((job) => {
      const km = getJobDistanceKm(job);
      if (km != null && Number.isFinite(km)) {
        map.set(job.id, km);
      }
    });
    return map;
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
  const getEntryBilledHours = (entry: { job: Job; durationMs: number | null }) => {
    if (entry.durationMs != null) return getBilledHours(entry.durationMs);
    if (Number.isFinite(entry.job.estimatedDurationMinutes)) {
      return getBilledHours((entry.job.estimatedDurationMinutes as number) * 60000);
    }
    return null;
  };
  const getEntryNetTotal = (entry: { job: Job; durationMs: number | null }) => {
    const revenue = getEntryTotal(entry);
    if (revenue == null) return null;
    const billedHours = getEntryBilledHours(entry);
    const helpersCount = entry.job.helpersCount ?? 0;
    const helpersCost = helperHourlyRateValue != null && helpersCount > 0 && billedHours != null
      ? billedHours * helperHourlyRateValue * helpersCount
      : 0;
    const distanceKm = jobDistanceKmById.get(entry.job.id) ?? null;
    const fuelCost = tripCostPerKmValue != null && distanceKm != null
      ? distanceKm * tripCostPerKmValue
      : 0;
    return revenue - helpersCost - fuelCost;
  };
  const getJobEstimatedTotal = (job: Job) => {
    if (job.chargedAmount != null) return job.chargedAmount;
    if (hourlyRateValue == null) return null;
    const estimatedHours = getEstimatedDurationMinutes(job) / 60;
    if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) return null;
    const helpersCount = job.helpersCount ?? 0;
    const helpersValue = helperHourlyRateValue != null && helpersCount > 0
      ? estimatedHours * helperHourlyRateValue * helpersCount
      : 0;
    return estimatedHours * hourlyRateValue + helpersValue;
  };
  const hourlyRateLabel = hourlyRateValue != null ? currencyFormatter.format(hourlyRateValue) : '--';
  const helperHourlyRateLabel = helperHourlyRateValue != null ? currencyFormatter.format(helperHourlyRateValue) : '--';
  const now = new Date();
  const currentMonthLabel = monthFormatter.format(now);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysElapsedInMonth = Math.max(1, now.getDate());
  const completedThisMonth = useMemo(() => (
    completedHistory.filter((entry) => {
      if (entry.endMs == null) return false;
      const endDate = new Date(entry.endMs);
      return endDate.getMonth() === currentMonth && endDate.getFullYear() === currentYear;
    })
  ), [completedHistory, currentMonth, currentYear]);
  const distanceStats = useMemo(() => {
    let total = 0;
    let count = 0;
    let realCount = 0;
    completedThisMonth.forEach((entry) => {
      const km = jobDistanceKmById.get(entry.job.id);
      if (km == null || !Number.isFinite(km)) return;
      total += km;
      count += 1;
      if (Number.isFinite(entry.job.distanceKm) || Number.isFinite(entry.job.distanceMeters)) {
        realCount += 1;
      }
    });
    const average = count > 0 ? total / count : null;
    return { total: count > 0 ? total : null, average, count, realCount };
  }, [completedThisMonth, jobDistanceKmById]);
  const tripsToday = useMemo(() => {
    const today = startOfDay(now);
    return completedHistory.filter((entry) => entry.endMs != null && isSameDay(new Date(entry.endMs), today)).length;
  }, [completedHistory, now]);
  const tripsPerDayAvg = completedThisMonth.length / daysElapsedInMonth;
  const fixedCostPerTrip = fixedMonthlyCostValue != null && completedThisMonth.length > 0
    ? fixedMonthlyCostValue / completedThisMonth.length
    : 0;
  const realHourlyStats = useMemo(() => {
    let revenueTotal = 0;
    let hoursTotal = 0;
    let trips = 0;
    completedHistory.forEach((entry) => {
      const revenue = getEntryTotal(entry);
      if (revenue == null || entry.durationMs == null) return;
      const hours = entry.durationMs / 3600000;
      if (!Number.isFinite(hours) || hours <= 0) return;
      revenueTotal += revenue;
      hoursTotal += hours;
      trips += 1;
    });
    const value = hoursTotal > 0 ? revenueTotal / hoursTotal : null;
    return { value, hoursTotal, trips };
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue]);
  const netMarginStats = useMemo(() => {
    let total = 0;
    let count = 0;
    completedThisMonth.forEach((entry) => {
      const revenue = getEntryTotal(entry);
      if (revenue == null) return;
      const durationHours = entry.durationMs != null
        ? entry.durationMs / 3600000
        : Number.isFinite(entry.job.estimatedDurationMinutes)
          ? (entry.job.estimatedDurationMinutes as number) / 60
          : null;
      const distanceKm = jobDistanceKmById.get(entry.job.id) ?? null;
      let variableCost = 0;
      if (tripCostPerHourValue != null) {
        if (durationHours == null || !Number.isFinite(durationHours)) return;
        variableCost += durationHours * tripCostPerHourValue;
      }
      if (tripCostPerKmValue != null) {
        if (distanceKm == null || !Number.isFinite(distanceKm)) return;
        variableCost += distanceKm * tripCostPerKmValue;
      }
      const net = revenue - variableCost - fixedCostPerTrip;
      total += net;
      count += 1;
    });
    return { average: count > 0 ? total / count : null, count };
  }, [completedThisMonth, fixedCostPerTrip, jobDistanceKmById, tripCostPerHourValue, tripCostPerKmValue, hourlyRateValue, helperHourlyRateValue]);
  const recurringClientStats = useMemo(() => {
    const counts = new Map<string, number>();
    completedHistory.forEach((entry) => {
      const rawPhone = entry.job.clientPhone?.trim();
      if (!rawPhone) return;
      const normalized = rawPhone.replace(/\D/g, '');
      const key = normalized || rawPhone;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const total = counts.size;
    let recurring = 0;
    counts.forEach((count) => {
      if (count > 1) recurring += 1;
    });
    const percent = total > 0 ? recurring / total : null;
    return { percent, total, recurring };
  }, [completedHistory]);
  const realHourlyLabel = realHourlyStats.value != null ? `${currencyFormatter.format(realHourlyStats.value)}/h` : 'N/D';
  const netMarginLabel = netMarginStats.average != null ? currencyFormatter.format(netMarginStats.average) : 'N/D';
  const tripsPerDayLabel = Number.isFinite(tripsPerDayAvg) ? decimalFormatter.format(tripsPerDayAvg) : 'N/D';
  const distanceTotalLabel = distanceStats.total != null ? `${decimalFormatter.format(distanceStats.total)} km` : 'N/D';
  const distanceAvgLabel = distanceStats.average != null ? `${decimalFormatter.format(distanceStats.average)} km/viaje` : 'N/D';
  const recurringPercentLabel = recurringClientStats.percent != null
    ? percentFormatter.format(recurringClientStats.percent)
    : 'N/D';
  const fixedMonthlyCostLabel = fixedMonthlyCostValue != null
    ? currencyFormatter.format(fixedMonthlyCostValue)
    : 'Sin configurar';
  const costPerHourLabel = tripCostPerHourValue != null ? `${currencyFormatter.format(tripCostPerHourValue)}/h` : null;
  const costPerKmLabel = tripCostPerKmValue != null ? `${currencyFormatter.format(tripCostPerKmValue)}/km` : null;
  const variableCostLabel = [costPerHourLabel, costPerKmLabel].filter(Boolean).join(' + ');
  const realHourlyMeta = realHourlyStats.trips > 0
    ? `Basado en ${realHourlyStats.trips} viajes y ${decimalFormatter.format(realHourlyStats.hoursTotal)} h.`
    : 'Sin tiempos suficientes.';
  const netMarginMeta = netMarginStats.count > 0
    ? `Promedio ${currentMonthLabel}, ${netMarginStats.count} viajes.`
    : 'Sin datos para calcular margen.';
  const tripsPerDayMeta = `Promedio ${currentMonthLabel}. Hoy: ${tripsToday}.`;
  const distanceMeta = distanceStats.count > 0 && distanceStats.average != null
    ? `Promedio ${currentMonthLabel}: ${distanceAvgLabel}${distanceStats.realCount < distanceStats.count ? ` (${distanceStats.realCount} con GPS)` : ''}`
    : `Sin datos de distancia ${currentMonthLabel}.`;
  const recurringMeta = recurringClientStats.total > 0
    ? `${recurringClientStats.recurring} de ${recurringClientStats.total} con telefono.`
    : 'Sin telefonos cargados.';
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
      return { key, day, total: 0, net: 0 };
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
      const net = getEntryNetTotal(entry);
      if (net != null) {
        target.net += net;
      }
    });
    let runningTotal = 0;
    let runningNet = 0;
    return series.map((item) => {
      runningTotal += item.total;
      runningNet += item.net;
      return { ...item, total: runningTotal, net: runningNet };
    });
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue, tripCostPerKmValue, jobDistanceKmById]);
  const dailyRevenueMaxValue = useMemo(() => {
    const maxValue = Math.max(0, ...dailyRevenueSeries.map((item) => Math.max(item.total, item.net)));
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
      return { key, label, total: 0, net: 0 };
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
      const net = getEntryNetTotal(entry);
      if (net != null) {
        target.net += net;
      }
    });
    return months;
  }, [completedHistory, hourlyRateValue, helperHourlyRateValue, tripCostPerKmValue, jobDistanceKmById]);
  const monthlyRevenueMaxValue = useMemo(() => {
    const maxValue = Math.max(0, ...monthlyRevenueSeries.map((item) => Math.max(item.total, item.net)));
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
  const selectedMapJob = useMemo(() => {
    if (selectedMapJobId) {
      return filteredJobs.find((job) => job.id === selectedMapJobId) ?? null;
    }
    return filteredJobs[0] ?? null;
  }, [filteredJobs, selectedMapJobId]);

  useEffect(() => {
    if (!selectedMapJobId) return;
    if (filteredJobs.some((job) => job.id === selectedMapJobId)) return;
    setSelectedMapJobId(filteredJobs[0]?.id ?? null);
  }, [filteredJobs, selectedMapJobId]);
  const selectedDriver = selectedDriverId ? driversById.get(selectedDriverId) : null;
  const selectedLocation = selectedDriverId ? driverLocationsById.get(selectedDriverId) ?? null : null;
  const selectedDriverJob = useMemo(() => {
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
  const selectedJobDetail = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((job) => job.id === selectedJobId) ?? null;
  }, [jobs, selectedJobId]);
  const selectedJobDriver = selectedJobDetail?.driverId ? driversById.get(selectedJobDetail.driverId) : null;
  const mapTargetLabel = mapTarget === 'pickup' ? 'origen' : mapTarget === 'dropoff' ? 'destino' : 'parada extra';
  const selectedJobDurations = useMemo(() => {
    if (!selectedJobDetail) return null;
    const tripStart = selectedJobDetail.timestamps.startTripAt ?? selectedJobDetail.timestamps.endLoadingAt;
    const tripEnd = selectedJobDetail.timestamps.endTripAt ?? selectedJobDetail.timestamps.startUnloadingAt;
    return {
      loading: formatDuration(selectedJobDetail.timestamps.startLoadingAt, selectedJobDetail.timestamps.endLoadingAt),
      trip: formatDuration(tripStart, tripEnd),
      unloading: formatDuration(selectedJobDetail.timestamps.startUnloadingAt, selectedJobDetail.timestamps.endUnloadingAt),
      total: formatDuration(selectedJobDetail.timestamps.startLoadingAt, selectedJobDetail.timestamps.endUnloadingAt),
    };
  }, [selectedJobDetail]);
  const selectedJobEstimateLabel = selectedJobDetail && Number.isFinite(selectedJobDetail.estimatedDurationMinutes)
    ? formatDurationMs((selectedJobDetail.estimatedDurationMinutes as number) * 60000)
    : 'N/D';
  const selectedJobChargedLabel = selectedJobDetail?.chargedAmount != null
    ? currencyFormatter.format(selectedJobDetail.chargedAmount)
    : 'Sin cargar';
  const scheduledJobs = useMemo(() => {
    return jobs
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
  const calendarEstimateSummary = useMemo(() => {
    const rangeStart = calendarView === 'day'
      ? startOfDay(calendarDate)
      : calendarView === 'week'
        ? startOfWeek(calendarDate)
        : startOfMonth(calendarDate);
    const rangeEnd = calendarView === 'day'
      ? addDays(rangeStart, 1)
      : calendarView === 'week'
        ? addDays(rangeStart, 7)
        : new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
    const startMs = rangeStart.getTime();
    const endMs = rangeEnd.getTime();
    let total = 0;
    let missing = 0;
    let count = 0;
    let totalMinutes = 0;
    scheduledJobs.forEach((item) => {
      if (item.scheduledAt < startMs || item.scheduledAt >= endMs) return;
      count += 1;
      totalMinutes += item.durationMinutes;
      const estimate = getJobEstimatedTotal(item.job);
      if (estimate == null) {
        missing += 1;
        return;
      }
      total += estimate;
    });
    return { total, missing, count, totalMinutes };
  }, [calendarView, calendarDate, scheduledJobs, hourlyRateValue, helperHourlyRateValue]);
  const handleCalendarToday = () => setCalendarDate(new Date());
  const moveCalendar = (direction: -1 | 1) => {
    setCalendarDate((prev) => {
      if (calendarView === 'day') return addDays(prev, direction);
      if (calendarView === 'week') return addDays(prev, direction * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
    });
  };
  const openJobDetail = (jobId: string) => setSelectedJobId(jobId);
  const dayJobs = getDayJobs(calendarDate);
  const dayBlockedHours = new Set<number>();
  dayJobs.forEach((item) => {
    const hours = getHourSlotsForDay(item.start, item.end, calendarDate);
    hours.forEach((hour) => {
      if (hour < calendarStartHour || hour >= calendarEndHour) return;
      dayBlockedHours.add(hour);
    });
  });
  const dayFreeHours = calendarHours.filter((hour) => !dayBlockedHours.has(hour));
  const calendarGridHeight = calendarHours.length * calendarHourHeight;
  const nowDate = new Date(nowTick);
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const calendarStartMinutes = calendarStartHour * 60;
  const calendarEndMinutes = calendarEndHour * 60;
  const nowWithinCalendar = nowMinutes >= calendarStartMinutes && nowMinutes <= calendarEndMinutes;
  const nowTop = nowWithinCalendar ? ((nowMinutes - calendarStartMinutes) / 60) * calendarHourHeight : null;
  const nowTimeLabel = timeFormatter.format(nowDate);
  const calendarEstimateLabel = calendarEstimateSummary.count === 0
    ? currencyFormatter.format(0)
    : calendarEstimateSummary.missing > 0
      ? 'Configura precios'
      : currencyFormatter.format(calendarEstimateSummary.total);
  const calendarEstimateTone = calendarEstimateSummary.missing > 0
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const calendarJobsLabel = calendarEstimateSummary.count === 1
    ? '1 flete'
    : `${calendarEstimateSummary.count} fletes`;
  const calendarTotalHoursLabel = `${decimalFormatter.format(calendarEstimateSummary.totalMinutes / 60)} h`;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <section className="space-y-4">
          {tab === 'jobs' && (
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <div className="flex min-h-[70vh] flex-col gap-3">
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
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
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

                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
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
                    const distanceKm = getJobDistanceKm(job);
                    const hasRealDistance = Number.isFinite(job.distanceKm) || Number.isFinite(job.distanceMeters);
                    const distanceLabel = distanceKm != null ? `${decimalFormatter.format(distanceKm)} km` : 'N/D';
                    const driver = job.driverId ? driversById.get(job.driverId) : null;
                    const isEditing = editingJobId === job.id;
                    const statusBadge = getStatusBadge(job.status);
                    const isMapActive = selectedMapJob?.id === job.id;
                    return (
                      <div
                        key={job.id}
                        onClick={() => setSelectedMapJobId(job.id)}
                        className={cn(
                          "space-y-2 rounded border bg-white p-3 shadow-sm transition",
                          isMapActive ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-100 hover:border-blue-200"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900 truncate">{job.clientName}</p>
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", statusBadge.className)}>
                                {statusBadge.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">Fecha: {job.scheduledDate || 'Sin fecha'} | Hora: {job.scheduledTime || 'Sin hora'}</p>
                            {job.description && (
                              <p className="text-xs text-gray-600">Descripcion: {job.description}</p>
                            )}
                            <div className="mt-1 space-y-1">
                              <div className="flex items-start gap-2 text-xs text-gray-600">
                                <MapPin size={12} className="mt-0.5 text-emerald-600" />
                                <span className="truncate">{job.pickup.address}</span>
                              </div>
                              <div className="flex items-start gap-2 text-xs text-gray-600">
                                <Flag size={12} className="mt-0.5 text-rose-600" />
                                <span className="truncate">{job.dropoff.address}</span>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                              <span>Estimado: {estimatedLabel}</span>
                              <span>Ayudantes: {job.helpersCount ?? 0}</span>
                              {job.extraStops && job.extraStops.length > 0 && (
                                <span>Paradas: {job.extraStops.length}</span>
                              )}
                              {distanceKm != null && (
                                <span>{hasRealDistance ? 'Km reales' : 'Km estimados'}: {distanceLabel}</span>
                              )}
                              <span>Carga: {loading}</span>
                              <span>Viaje: {trip}</span>
                              <span>Descarga: {unloading}</span>
                              <span>Total: {total}</span>
                            </div>
                          </div>
                          <div className="relative" data-job-menu>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenJobMenuId((prev) => (prev === job.id ? null : job.id));
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openJobMenuId === job.id && (
                              <div className="absolute right-0 mt-2 w-32 rounded-lg border bg-white py-1 text-xs shadow" data-job-menu>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedJobId(job.id);
                                    setOpenJobMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100"
                                >
                                  Detalle
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (isEditing) cancelEditJob();
                                    else startEditJob(job);
                                    setOpenJobMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100"
                                >
                                  {isEditing ? 'Cancelar' : 'Editar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteJob(job.id);
                                    setOpenJobMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {!isEditing && (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-gray-500">Conductor:</label>
                            <select
                              value={job.driverId ?? ''}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => handleAssignJob(job, event.target.value)}
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
                        )}
                        {isEditing && (
                          <div className="rounded border bg-gray-50 p-3" onClick={(event) => event.stopPropagation()}>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="text-xs text-gray-500">
                                Cliente
                                <input
                                  type="text"
                                  value={editDraft.clientName}
                                  onChange={(event) => setEditDraft((prev) => ({ ...prev, clientName: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                                />
                              </label>
                              <label className="text-xs text-gray-500">
                                Fecha
                                <input
                                  type="date"
                                  value={editDraft.scheduledDate}
                                  onChange={(event) => setEditDraft((prev) => ({ ...prev, scheduledDate: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                                />
                              </label>
                              <label className="text-xs text-gray-500">
                                Hora
                                <input
                                  type="time"
                                  value={editDraft.scheduledTime}
                                  onChange={(event) => setEditDraft((prev) => ({ ...prev, scheduledTime: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                                />
                              </label>
                              <label className="text-xs text-gray-500">
                                Duracion estimada (horas)
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={editDraft.estimatedDurationHours}
                                  onChange={(event) => setEditDraft((prev) => ({ ...prev, estimatedDurationHours: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                                />
                              </label>
                              <label className="text-xs text-gray-500">
                                Ayudantes
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editDraft.helpersCount}
                                  onChange={(event) => setEditDraft((prev) => ({ ...prev, helpersCount: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                                />
                              </label>
                              <label className="text-xs text-gray-500">
                                Conductor
                                <select
                                  value={editDraft.driverId}
                                  onChange={(event) => setEditDraft((prev) => ({ ...prev, driverId: event.target.value }))}
                                  className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                                >
                                  <option value="">Sin asignar</option>
                                  {drivers.map((driver) => (
                                    <option key={driver.id} value={driver.id}>
                                      {driver.name} ({driver.code})
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label className="mt-2 block text-xs text-gray-500">
                              Descripcion
                              <textarea
                                value={editDraft.description}
                                onChange={(event) => setEditDraft((prev) => ({ ...prev, description: event.target.value }))}
                                rows={2}
                                className="mt-1 w-full rounded border px-2 py-1 text-xs text-gray-700"
                              />
                            </label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveEditJob(job)}
                                disabled={savingEditId === job.id}
                                className="rounded border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEditId === job.id ? 'Guardando...' : 'Guardar cambios'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditJob}
                                className="rounded border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative min-h-[70vh] rounded-2xl border bg-white shadow-sm">
                <div className="absolute left-4 right-4 top-4 z-10">
                  <div className="rounded-xl bg-white/95 p-3 shadow">
                    <AddressAutocomplete
                      label="Buscar direccion"
                      placeholder="Buscar direccion"
                      onSelect={setMapSearchLocation}
                      selected={mapSearchLocation}
                    />
                  </div>
                </div>
                {selectedMapJob ? (
                  <JobRoutePreviewMap
                    job={selectedMapJob}
                    focusLocation={mapSearchLocation}
                    className="h-full min-h-[70vh]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    No hay fletes para mostrar.
                  </div>
                )}
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
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold text-gray-700">{calendarRangeLabel}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">Total estimado</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", calendarEstimateTone)}>
                        {calendarEstimateLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">Fletes agendados</span>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        {calendarJobsLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">Horas totales</span>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        {calendarTotalHoursLabel}
                      </span>
                    </div>
                  </div>
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
                    <div className="rounded-2xl border bg-white p-3">
                      <div className="grid grid-cols-[56px_1fr]">
                        <div className="flex flex-col" style={{ height: calendarGridHeight }}>
                          {calendarHours.map((hour) => (
                            <div
                              key={hour}
                              className="pr-2 text-right text-[11px] text-gray-400"
                              style={{ height: calendarHourHeight }}
                            >
                              <div className="pt-0.5">{String(hour).padStart(2, '0')}:00</div>
                            </div>
                          ))}
                        </div>
                        <div className="relative border-l border-gray-100" style={{ height: calendarGridHeight }}>
                          <div
                            className="absolute inset-0 grid"
                            style={{ gridTemplateRows: `repeat(${calendarHours.length}, ${calendarHourHeight}px)` }}
                          >
                            {calendarHours.map((hour) => (
                              <div key={hour} className="border-t border-gray-100" />
                            ))}
                          </div>
                          {isSameDay(calendarDate, calendarToday) && nowTop != null && (
                            <div className="absolute left-0 right-0 z-20" style={{ top: nowTop }}>
                              <div className="relative">
                                <div className="h-0.5 bg-rose-500" />
                                <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-rose-500" />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 text-[10px] font-semibold text-rose-500 shadow">
                                  {nowTimeLabel}
                                </span>
                              </div>
                            </div>
                          )}
                          {dayJobs.map((item) => {
                            const style = getEventBlockStyle(item.start, item.end, calendarDate);
                            const estimateValue = getJobEstimatedTotal(item.job);
                            const estimateLabel = estimateValue != null ? currencyFormatter.format(estimateValue) : null;
                            if (!style) return null;
                            return (
                              <div
                                key={item.job.id}
                                onClick={() => openJobDetail(item.job.id)}
                                className="absolute left-2 right-2 cursor-pointer rounded-lg border border-blue-200 bg-blue-50 pl-2 pr-12 py-1 text-[11px] text-blue-800 shadow-sm hover:bg-blue-100"
                                style={{ top: style.top, height: style.height }}
                              >
                                {estimateLabel && (
                                  <span className="absolute right-1 top-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 whitespace-nowrap">
                                    {estimateLabel}
                                  </span>
                                )}
                                <div className="font-semibold truncate">{item.job.clientName}</div>
                                <div className="text-[10px] text-blue-600">
                                  {formatJobRangeForDay(item.start, item.end, calendarDate)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
                  <div className="mt-4 rounded-2xl border bg-white p-3">
                    <div className="overflow-x-auto">
                      <div className="min-w-[960px]">
                        <div className="grid grid-cols-[56px_repeat(7,1fr)] text-[11px] text-gray-500">
                          <div />
                          {weekDays.map((day) => {
                            const isToday = isSameDay(day, calendarToday);
                            return (
                              <div
                                key={buildDateKey(day)}
                                className={cn(
                                  "px-2 py-1 text-center font-semibold",
                                  isToday ? "text-blue-600" : "text-gray-600"
                                )}
                              >
                                {dayFormatter.format(day)}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 grid grid-cols-[56px_repeat(7,1fr)]">
                          <div className="flex flex-col" style={{ height: calendarGridHeight }}>
                            {calendarHours.map((hour) => (
                              <div
                                key={hour}
                                className="pr-2 text-right text-[11px] text-gray-400"
                                style={{ height: calendarHourHeight }}
                              >
                                <div className="pt-0.5">{String(hour).padStart(2, '0')}:00</div>
                              </div>
                            ))}
                          </div>
                          {weekDays.map((day) => {
                            const items = getDayJobs(day);
                            const isToday = isSameDay(day, calendarToday);
                            return (
                              <div
                                key={buildDateKey(day)}
                                className={cn(
                                  "relative border-l border-gray-100",
                                  isToday ? "bg-blue-50/40" : "bg-white"
                                )}
                                style={{ height: calendarGridHeight }}
                              >
                                <div
                                  className="absolute inset-0 grid"
                                  style={{ gridTemplateRows: `repeat(${calendarHours.length}, ${calendarHourHeight}px)` }}
                                >
                                  {calendarHours.map((hour) => (
                                    <div key={hour} className="border-t border-gray-100" />
                                  ))}
                                </div>
                                {isToday && nowTop != null && (
                                  <div className="absolute left-0 right-0 z-20" style={{ top: nowTop }}>
                                    <div className="h-0.5 bg-rose-500" />
                                  </div>
                                )}
                                {items.map((item) => {
                                  const style = getEventBlockStyle(item.start, item.end, day);
                                  const estimateValue = getJobEstimatedTotal(item.job);
                                  const estimateLabel = estimateValue != null ? currencyFormatter.format(estimateValue) : null;
                                  if (!style) return null;
                                  return (
                                    <div
                                      key={item.job.id}
                                      onClick={() => openJobDetail(item.job.id)}
                                      className="absolute left-1 right-1 cursor-pointer rounded-md border border-blue-200 bg-blue-50 pl-1.5 pr-11 py-1 text-[10px] text-blue-800 shadow-sm hover:bg-blue-100"
                                      style={{ top: style.top, height: style.height }}
                                    >
                                      {estimateLabel && (
                                        <span className="absolute right-0.5 top-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-700 whitespace-nowrap">
                                          {estimateLabel}
                                        </span>
                                      )}
                                      <div className="font-semibold truncate">{item.job.clientName}</div>
                                      <div className="text-[9px] text-blue-600">
                                        {formatJobRangeForDay(item.start, item.end, day)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
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
                              {items.slice(0, 3).map((item) => {
                                const estimateValue = getJobEstimatedTotal(item.job);
                                const estimateLabel = estimateValue != null ? currencyFormatter.format(estimateValue) : null;
                                return (
                                  <div
                                    key={item.job.id}
                                    onClick={() => openJobDetail(item.job.id)}
                                    className="relative truncate rounded bg-gray-100 pl-2 pr-12 py-1 text-[10px] text-gray-700 cursor-pointer hover:bg-gray-200"
                                  >
                                    {estimateLabel && (
                                      <span className="absolute right-1 top-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-700 whitespace-nowrap">
                                        {estimateLabel}
                                      </span>
                                    )}
                                    {formatJobRangeForDay(item.start, item.end, day)} {item.job.clientName}
                                  </div>
                                );
                              })}
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
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Conductores</p>
                  <h2 className="text-lg font-semibold text-gray-900">Gestion de conductores</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDriverModalOpen(true)}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
                >
                  Agregar Conductor
                </button>
              </div>

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
              {!loadingDrivers && drivers.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {drivers.map((driver) => {
                    const isActive = driver.active;
                    return (
                      <div key={driver.id} className="flex h-full flex-col justify-between rounded-xl border bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-gray-900">{driver.name}</p>
                            <p className="text-sm font-semibold text-gray-800">
                              Codigo: <span className="font-mono">{driver.code}</span>
                            </p>
                            <p className="text-xs text-gray-500">{driver.phone || 'Sin telefono'}</p>
                            <p className="text-xs text-gray-400">
                              Ubicacion: {driverLocationsById.has(driver.id) ? 'Disponible' : 'Sin datos'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActive}
                              onClick={() => handleToggleDriver(driver)}
                              className={cn(
                                "relative inline-flex h-6 w-11 items-center rounded-full transition",
                                isActive ? "bg-emerald-500" : "bg-gray-300"
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                                  isActive ? "translate-x-5" : "translate-x-1"
                                )}
                              />
                            </button>
                            <span className={cn("text-[11px] font-semibold", isActive ? "text-emerald-600" : "text-gray-500")}>
                              {isActive ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectDriverMap(driver.id)}
                            className="rounded border px-2 py-1 text-xs font-semibold text-blue-600"
                          >
                            Ver mapa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDriver(driver.id)}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-500"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {driverModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-blue-500">Nuevo conductor</p>
                        <h3 className="text-lg font-semibold text-gray-900">Agregar Conductor</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDriverModalOpen(false)}
                        className="rounded border px-3 py-1 text-xs text-gray-600"
                      >
                        Cerrar
                      </button>
                    </div>
                    <form onSubmit={handleCreateDriver} className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="text-xs text-gray-500">Nombre</label>
                          <input
                            value={driverName}
                            onChange={(e) => setDriverName(e.target.value)}
                            placeholder="Nombre del conductor"
                            className="mt-1 w-full rounded border px-3 py-2 text-sm"
                            required
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs text-gray-500">Codigo</label>
                          <div className="mt-1 flex gap-2">
                            <input
                              value={driverCode}
                              onChange={(e) => setDriverCode(e.target.value.toUpperCase())}
                              placeholder="Codigo"
                              className="w-full rounded border px-3 py-2 text-sm"
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
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs text-gray-500">Telefono (opcional)</label>
                          <input
                            value={driverPhone}
                            onChange={(e) => setDriverPhone(e.target.value)}
                            placeholder="Telefono (opcional)"
                            className="mt-1 w-full rounded border px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDriverModalOpen(false)}
                          className="rounded border px-3 py-2 text-xs text-gray-600"
                        >
                          Cancelar
                        </button>
                        <button className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white">
                          Guardar conductor
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Ingreso por hora real</p>
                  <p className="text-2xl font-semibold text-gray-900">{realHourlyLabel}</p>
                  <p className="text-xs text-gray-500">{realHourlyMeta}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Margen neto por viaje</p>
                  <p className="text-2xl font-semibold text-gray-900">{netMarginLabel}</p>
                  <p className="text-xs text-gray-500">{netMarginMeta}</p>
                  {variableCostLabel && (
                    <p className="text-[11px] text-gray-400">Costos: {variableCostLabel}</p>
                  )}
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Viajes por dia</p>
                  <p className="text-2xl font-semibold text-gray-900">{tripsPerDayLabel}</p>
                  <p className="text-xs text-gray-500">{tripsPerDayMeta}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Km reales del mes</p>
                  <p className="text-2xl font-semibold text-gray-900">{distanceTotalLabel}</p>
                  <p className="text-xs text-gray-500">{distanceMeta}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Clientes recurrentes</p>
                  <p className="text-2xl font-semibold text-gray-900">{recurringPercentLabel}</p>
                  <p className="text-xs text-gray-500">{recurringMeta}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Costo fijo mensual</p>
                  <p className="text-2xl font-semibold text-gray-900">{fixedMonthlyCostLabel}</p>
                  <p className="text-xs text-gray-500">Se prorratea en el margen.</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Ingresos diarios acumulados</p>
                    <p className="text-lg font-semibold text-gray-900">Progreso del mes: {currentMonthLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {!hasMonthlyPricing && (
                      <span className="text-xs text-amber-600">Configura precios para ver montos</span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-sky-600" />
                        Bruto
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                        Neto
                      </span>
                    </div>
                  </div>
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
                    <polyline
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={dailyRevenueSeries.map((item, index) => {
                        const x = 60 + (640 * (dailyRevenueSeries.length === 1 ? 0.5 : index / (dailyRevenueSeries.length - 1)));
                        const netValue = Math.max(0, item.net);
                        const y = 20 + (150 * (1 - netValue / dailyRevenueScaleMax));
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
                    {dailyRevenueSeries.map((item, index) => {
                      const x = 60 + (640 * (dailyRevenueSeries.length === 1 ? 0.5 : index / (dailyRevenueSeries.length - 1)));
                      const netValue = Math.max(0, item.net);
                      const y = 20 + (150 * (1 - netValue / dailyRevenueScaleMax));
                      return (
                        <circle key={`${item.key}-net`} cx={x} cy={y} r="2.5" fill="#f97316" />
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
                  <div className="flex flex-wrap items-center gap-3">
                    {!hasMonthlyPricing && (
                      <span className="text-xs text-amber-600">Configura precios para ver montos</span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        Bruto
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                        Neto
                      </span>
                    </div>
                  </div>
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
                    <polyline
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={monthlyRevenueSeries.map((item, index) => {
                        const x = 60 + (530 * (monthlyRevenueSeries.length === 1 ? 0.5 : index / (monthlyRevenueSeries.length - 1)));
                        const netValue = Math.max(0, item.net);
                        const y = 20 + (140 * (1 - netValue / monthlyRevenueScaleMax));
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
                    {monthlyRevenueSeries.map((item, index) => {
                      const x = 60 + (530 * (monthlyRevenueSeries.length === 1 ? 0.5 : index / (monthlyRevenueSeries.length - 1)));
                      const netValue = Math.max(0, item.net);
                      const y = 20 + (140 * (1 - netValue / monthlyRevenueScaleMax));
                      return (
                        <circle key={`${item.key}-net`} cx={x} cy={y} r="3" fill="#f97316" />
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
                              <button
                                type="button"
                                onClick={() => openJobDetail(entry.job.id)}
                                className="mb-1 rounded border px-2 py-1 text-[11px] font-semibold text-blue-600"
                              >
                                Detalle
                              </button>
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
          {tab === 'settings' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Configuracion</p>
                  <h2 className="text-lg font-semibold text-gray-900">Parametros del sistema</h2>
                  <p className="text-xs text-gray-500">Precios y costos que impactan en analiticas.</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Tarifas</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Precio hora</p>
                      <p className="text-xs text-gray-500">Actual: {hourlyRateLabel}</p>
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
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Precio ayudante</p>
                      <p className="text-xs text-gray-500">Actual: {helperHourlyRateLabel}</p>
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
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Costos</p>
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Costo fijo mensual</p>
                      <p className="text-xs text-gray-500">Actual: {fixedMonthlyCostLabel}</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="Ej: 450000"
                        value={fixedMonthlyCostInput}
                        onChange={(event) => setFixedMonthlyCostInput(event.target.value)}
                        className="mt-2 w-full rounded border px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleSaveFixedMonthlyCost}
                        disabled={savingFixedMonthlyCost}
                        className="mt-2 w-full rounded border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingFixedMonthlyCost ? 'Guardando...' : 'Guardar costo fijo'}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Costo por hora</p>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="Ej: 9000"
                          value={tripCostPerHourInput}
                          onChange={(event) => setTripCostPerHourInput(event.target.value)}
                          className="mt-2 w-full rounded border px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTripCostPerHour}
                          disabled={savingTripCostPerHour}
                          className="mt-2 w-full rounded border border-violet-200 px-2 py-1 text-xs font-semibold text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingTripCostPerHour ? 'Guardando...' : 'Guardar costo hora'}
                        </button>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Costo por km</p>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="Ej: 120"
                          value={tripCostPerKmInput}
                          onChange={(event) => setTripCostPerKmInput(event.target.value)}
                          className="mt-2 w-full rounded border px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTripCostPerKm}
                          disabled={savingTripCostPerKm}
                          className="mt-2 w-full rounded border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingTripCostPerKm ? 'Guardando...' : 'Guardar costo km'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Estos costos se usan para calcular el margen neto por viaje.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
      </section>

      {selectedJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl space-y-4 rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-500">Detalle del flete</p>
                <h2 className="text-lg font-semibold text-gray-900">{selectedJobDetail?.clientName ?? 'Flete'}</h2>
                {selectedJobDetail && (
                  <p className="text-xs text-gray-500">Estado: {selectedJobDetail.status}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedJobId(null)}
                className="rounded border px-3 py-1 text-xs text-gray-600"
              >
                Cerrar
              </button>
            </div>
            {!selectedJobDetail && (
              <p className="text-sm text-gray-500">No se encontro el flete.</p>
            )}
            {selectedJobDetail && (
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <JobRoutePreviewMap job={selectedJobDetail} />
                <div className="space-y-3">
                  <div className="rounded-xl border bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Resumen</p>
                    <div className="mt-2 space-y-1 text-sm text-gray-700">
                      <p>
                        <span className="font-medium text-gray-900">Programado:</span>{' '}
                        {selectedJobDetail.scheduledDate || 'Sin fecha'} | {selectedJobDetail.scheduledTime || 'Sin hora'}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">Conductor:</span>{' '}
                        {selectedJobDriver ? `${selectedJobDriver.name} (${selectedJobDriver.code})` : 'Sin asignar'}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">Ayudantes:</span> {selectedJobDetail.helpersCount ?? 0}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">Duracion estimada:</span> {selectedJobEstimateLabel}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">Cobrado:</span> {selectedJobChargedLabel}
                      </p>
                      {selectedJobDetail.clientPhone && (
                        <p>
                          <span className="font-medium text-gray-900">Contacto:</span> {selectedJobDetail.clientPhone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Direcciones</p>
                    <div className="mt-2 space-y-2 text-sm text-gray-700">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Origen</p>
                        <p>{selectedJobDetail.pickup.address}</p>
                      </div>
                      {selectedJobDetail.extraStops && selectedJobDetail.extraStops.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-400">Paradas extra</p>
                          <ul className="mt-1 space-y-1">
                            {selectedJobDetail.extraStops.map((stop, index) => (
                              <li key={`${stop.lat}-${stop.lng}-${index}`} className="text-sm text-gray-700">
                                {stop.address}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Destino</p>
                        <p>{selectedJobDetail.dropoff.address}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Tiempos</p>
                    <div className="mt-2 space-y-1 text-sm text-gray-700">
                      <p>Carga: {selectedJobDurations?.loading ?? 'N/A'}</p>
                      <p>Viaje: {selectedJobDurations?.trip ?? 'N/A'}</p>
                      <p>Descarga: {selectedJobDurations?.unloading ?? 'N/A'}</p>
                      <p>Total: {selectedJobDurations?.total ?? 'N/A'}</p>
                    </div>
                  </div>
                  {(selectedJobDetail.description || selectedJobDetail.notes) && (
                    <div className="rounded-xl border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">Detalles</p>
                      {selectedJobDetail.description && (
                        <p className="mt-2 text-sm text-gray-700">Descripcion: {selectedJobDetail.description}</p>
                      )}
                      {selectedJobDetail.notes && (
                        <p className="mt-2 text-sm text-gray-700">Notas: {selectedJobDetail.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              <DriverRouteMap location={selectedLocation} job={selectedDriverJob} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
