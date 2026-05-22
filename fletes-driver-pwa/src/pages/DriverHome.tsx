import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverByCodeQueryKey, getDriverByCode, jobsListQueryKey, listJobs } from '../lib/api';
import type { Driver, Job, JobStatus } from '../lib/types';
import { getScheduledAtMs } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clearDriverSession, getDriverSession, type DriverSession } from '../lib/driverSession';
import { getNetworkProfile } from '../lib/network';
import { useDriverLocationSync } from '../hooks/useDriverLocationSync';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { useCachedQuery } from '../hooks/useCachedQuery';

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const shiftDateKey = (value: string, delta: number) => {
  const parsed = parseDateKey(value) ?? new Date();
  parsed.setDate(parsed.getDate() + delta);
  return toDateKey(parsed);
};

const formatDateLabel = (value: string) => {
  const parsed = parseDateKey(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
};

const statusMeta: Record<JobStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  TO_PICKUP: { label: 'A recoger', className: 'bg-blue-100 text-blue-700' },
  LOADING: { label: 'Cargando', className: 'bg-indigo-100 text-indigo-700' },
  TO_DROPOFF: { label: 'En ruta', className: 'bg-emerald-100 text-emerald-700' },
  UNLOADING: { label: 'Descargando', className: 'bg-teal-100 text-teal-700' },
  DONE: { label: 'Finalizado', className: 'bg-gray-200 text-gray-600' }
};

const formatJobTime = (job: Job, scheduledAtMs: number | null) => {
  if (job.scheduledTime) return job.scheduledTime.slice(0, 5);
  if (scheduledAtMs == null) return 'Sin hora';
  return new Date(scheduledAtMs).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const OWNER_ACCOUNT_DRIVER_CODE = '6666';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const roundMoney = (value: number) => Number(value.toFixed(2));

const toStoredMoney = (value?: number | null) => (Number.isFinite(value) ? Number(value) : null);

const getCollectedPaymentTotal = (job: Job) => {
  const cashAmount = toStoredMoney(job.cashAmount);
  const transferAmount = toStoredMoney(job.transferAmount);
  const hasBreakdown = cashAmount != null || transferAmount != null;
  const chargedAmount = toStoredMoney(job.chargedAmount);
  return hasBreakdown ? roundMoney((cashAmount ?? 0) + (transferAmount ?? 0)) : chargedAmount;
};

const getDriverDebtSummary = (jobs: Job[], driver: Driver | null) => {
  const settledAmount = Number.isFinite(driver?.ownerDebtSettledAmount)
    ? Number(driver?.ownerDebtSettledAmount)
    : 0;

  if (!driver || String(driver.code ?? '').trim() === OWNER_ACCOUNT_DRIVER_CODE) {
    return {
      collectedTrips: 0,
      grossOwnerDebt: 0,
      settledAmount: roundMoney(settledAmount),
      outstandingDebt: 0,
    };
  }

  const summary = jobs.reduce(
    (current, job) => {
      if (job.status !== 'DONE') return current;
      const collectedTotal = getCollectedPaymentTotal(job);
      if (collectedTotal == null) return current;

      const driverShare = Math.max(0, toStoredMoney(job.driverShareAmount) ?? 0);
      const hourlyBaseAmount = toStoredMoney(job.hourlyBaseAmount);
      const helperRevenue = hourlyBaseAmount != null ? Math.max(0, collectedTotal - hourlyBaseAmount) : 0;
      const driverKept = roundMoney(Math.min(collectedTotal, driverShare + helperRevenue));

      current.collectedTrips += 1;
      current.grossOwnerDebt += Math.max(0, collectedTotal - driverKept);
      return current;
    },
    { collectedTrips: 0, grossOwnerDebt: 0 },
  );

  const grossOwnerDebt = roundMoney(summary.grossOwnerDebt);
  return {
    collectedTrips: summary.collectedTrips,
    grossOwnerDebt,
    settledAmount: roundMoney(settledAmount),
    outstandingDebt: roundMoney(Math.max(0, grossOwnerDebt - settledAmount)),
  };
};

export default function DriverHome() {
  const navigate = useNavigate();
  const [session, setSession] = useState<DriverSession | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const { coords } = useGeoLocation();
  const { saveData } = getNetworkProfile();
  const jobsQuery = useCachedQuery<Job[]>({
    key: session ? jobsListQueryKey({ driverId: session.driverId }) : 'jobs:list:disabled',
    enabled: !!session,
    loader: () => listJobs({ driverId: session!.driverId }),
    staleMs: saveData ? 120000 : 60000,
  });
  const driverQuery = useCachedQuery<Driver>({
    key: session ? driverByCodeQueryKey(session.code) : 'driver:code:disabled',
    enabled: !!session,
    loader: () => getDriverByCode(session!.code),
    staleMs: saveData ? 60000 : 5000,
    refreshIntervalMs: saveData ? 60000 : 15000,
  });
  const jobs = jobsQuery.data ?? [];
  const currentDriver = driverQuery.data ?? null;
  const debtSummary = useMemo(() => getDriverDebtSummary(jobs, currentDriver), [jobs, currentDriver]);
  const loading = jobsQuery.loading;

  useEffect(() => {
    const current = getDriverSession();
    if (!current) {
      navigate('/driver/login', { replace: true });
      return;
    }
    setSession(current);
  }, [navigate]);
  const activeJob = jobs.find((job) => job.status !== 'DONE' && job.status !== 'PENDING');
  useDriverLocationSync({ session, jobId: activeJob?.id ?? null, coords });
  const jobsForDay = jobs
    .map((job) => {
      const scheduledAtMs = getScheduledAtMs(job.scheduledDate, job.scheduledTime, job.scheduledAt);
      const dateKey = job.scheduledDate || (scheduledAtMs != null ? toDateKey(new Date(scheduledAtMs)) : null);
      return { job, scheduledAtMs, dateKey };
    })
    .filter((item) => item.dateKey === selectedDate)
    .sort((a, b) => {
      const aKey = a.scheduledAtMs ?? Number.POSITIVE_INFINITY;
      const bKey = b.scheduledAtMs ?? Number.POSITIVE_INFINITY;
      if (aKey !== bKey) return aKey - bKey;
      return new Date(a.job.createdAt).getTime() - new Date(b.job.createdAt).getTime();
    });
  return (
    <div className="h-full w-full max-w-md mx-auto flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Mis viajes</h1>
          {session && <p className="text-xs text-gray-500">Conductor: {session.name}</p>}
        </div>
        {session && (
          <button
            type="button"
            onClick={() => {
              clearDriverSession();
              navigate('/driver/login', { replace: true });
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cerrar sesion
          </button>
        )}
      </div>
      <div className="space-y-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-amber-700">Deuda con el dueno</p>
              <p className="mt-1 text-2xl font-bold text-amber-950">{currencyFormatter.format(debtSummary.outstandingDebt)}</p>
            </div>
            <div className="text-right text-[11px] text-amber-800">
              <p>{debtSummary.collectedTrips} cobrados</p>
              <p>Liquidado {currencyFormatter.format(debtSummary.settledAmount)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-amber-800">
            Total a favor del dueno {currencyFormatter.format(debtSummary.grossOwnerDebt)}
            {driverQuery.refreshing ? ' | Actualizando...' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate((prev) => shiftDateKey(prev, -1))}
            className="rounded-xl border bg-white p-2 text-gray-600"
            aria-label="Dia anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <label className="flex-1">
            <span className="block text-[11px] uppercase tracking-wide text-gray-400">Dia seleccionado</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) setSelectedDate(value);
                }}
                className="w-full bg-transparent text-sm font-semibold text-gray-900 focus:outline-none"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => setSelectedDate((prev) => shiftDateKey(prev, 1))}
            className="rounded-xl border bg-white p-2 text-gray-600"
            aria-label="Dia siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{formatDateLabel(selectedDate)}</span>
          <button
            type="button"
            onClick={() => setSelectedDate(toDateKey(new Date()))}
            className="rounded-full border bg-white px-3 py-1 text-xs text-gray-600"
          >
            Hoy
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {loading && <p className="text-sm text-gray-500">Cargando fletes...</p>}
        {!loading && jobsForDay.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-gray-500">
            No hay viajes para este dia.
          </div>
        )}
        {!loading && jobsForDay.map(({ job, scheduledAtMs }) => {
          const status = statusMeta[job.status];
          const isActive = activeJob?.id === job.id;
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => navigate('/job/' + job.id)}
              className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition ${isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-16 shrink-0 text-center">
                  <p className="text-sm font-semibold text-gray-900">{formatJobTime(job, scheduledAtMs)}</p>
                  <p className="text-[11px] text-gray-400">Hora</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900">{job.clientName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {job.pickup?.address || 'Sin direccion'}{' -> '}{job.dropoff?.address || 'Sin direccion'}
                  </p>
                </div>
                <div className="pt-1 text-gray-300">
                  <ChevronRight size={18} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
