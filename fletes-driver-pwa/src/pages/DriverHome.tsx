import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listJobs } from '../lib/api';
import type { Job } from '../lib/types';
import { getScheduledAtMs, isStartWindowOpen } from '../lib/utils';
import { Play } from 'lucide-react';
import { clearDriverSession, getDriverSession, type DriverSession } from '../lib/driverSession';
import { getNetworkProfile } from '../lib/network';
import { useDriverLocationSync } from '../hooks/useDriverLocationSync';
import { useGeoLocation } from '../hooks/useGeoLocation';
export default function DriverHome() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<DriverSession | null>(null);
  const { coords } = useGeoLocation();

  useEffect(() => {
    const current = getDriverSession();
    if (!current) {
      navigate('/driver/login', { replace: true });
      return;
    }
    setSession(current);
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await listJobs({ driverId: session.driverId });
        if (active) setJobs(data);
      } catch {
        if (active) setJobs([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const { saveData } = getNetworkProfile();
    const intervalMs = saveData ? 30000 : 15000;
    const id = window.setInterval(load, intervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session]);
  const active = jobs.find((job) => job.status !== 'DONE' && job.status !== 'PENDING');
  useDriverLocationSync({ session, jobId: active?.id ?? null, coords });
  const pending = jobs.filter((job) => job.status === 'PENDING');
  const nowMs = Date.now();
  const pendingWithSchedule = pending?.map((job) => {
    const scheduledAtMs = getScheduledAtMs(job.scheduledDate, job.scheduledTime, job.scheduledAt);
    const windowOpen = scheduledAtMs == null ? true : nowMs >= scheduledAtMs - 60 * 60 * 1000;
    return { job, scheduledAtMs, windowOpen };
  }) ?? [];
  const windowOpenJobs = pendingWithSchedule.filter((item) => item.windowOpen);
  const candidates = windowOpenJobs.length > 0 ? windowOpenJobs : pendingWithSchedule;
  const next = candidates
    .slice()
    .sort((a, b) => {
      const aKey = a.scheduledAtMs ?? Number.NEGATIVE_INFINITY;
      const bKey = b.scheduledAtMs ?? Number.NEGATIVE_INFINITY;
      if (aKey !== bKey) return aKey - bKey;
      return new Date(a.job.createdAt).getTime() - new Date(b.job.createdAt).getTime();
    })[0]?.job;
  const job = active || next;
  const isPending = !!job && !active;
  const scheduledAtMs = isPending ? getScheduledAtMs(job?.scheduledDate, job?.scheduledTime, job?.scheduledAt) : null;
  const startAvailable = isPending ? isStartWindowOpen(job?.scheduledDate, job?.scheduledTime, new Date(), job?.scheduledAt) : true;
  const availableAt = scheduledAtMs != null ? new Date(scheduledAtMs - 60 * 60 * 1000) : null;
  return (
    <div className="h-full flex flex-col items-center justify-center space-y-6">
      <div className="w-full max-w-xs space-y-1 text-center">
        <h1 className="text-2xl font-bold">Mis Viajes</h1>
        {session && <p className="text-xs text-gray-500">Conductor: {session.name}</p>}
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
      {loading && <p className="text-sm text-gray-500">Cargando fletes...</p>}
      {!loading && job ? (
        <div className="w-full max-w-xs space-y-4">
          <div className="p-4 bg-white shadow rounded">
            <p className="text-blue-600 font-bold">{active ? 'EN CURSO' : 'PENDIENTE'}</p>
            <p className="text-lg">{job.clientName}</p>
            <p className="text-sm text-gray-600">Fecha: {job.scheduledDate || 'Sin fecha'} | Hora: {job.scheduledTime || 'Sin hora'}</p>
          </div>
          <button
            onClick={() => navigate('/job/' + job.id)}
            disabled={isPending && !startAvailable}
            className="w-full bg-blue-600 text-white p-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={20} /> {active ? 'CONTINUAR' : startAvailable ? 'EMPEZAR' : 'PROGRAMADO'}
          </button>
          {isPending && !startAvailable && availableAt && (
            <p className="text-xs text-gray-500 text-center">Disponible desde {availableAt.toLocaleString()}</p>
          )}
        </div>
      ) : null}
      {!loading && !job && <p>No hay fletes asignados</p>}
    </div>
  );
}
