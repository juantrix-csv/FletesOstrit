import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { getScheduledAtMs, isStartWindowOpen } from '../lib/utils';
import { Play } from 'lucide-react';
export default function DriverHome() {
  const navigate = useNavigate();
  const active = useLiveQuery(() => db.jobs.filter(j => j.status !== 'DONE' && j.status !== 'PENDING').first());
  const pending = useLiveQuery(() => db.jobs.where('status').equals('PENDING').toArray());
  const nowMs = Date.now();
  const pendingWithSchedule = pending?.map((job) => ({
    job,
    scheduledAtMs: getScheduledAtMs(job.scheduledDate, job.scheduledTime, job.scheduledAt),
  })) ?? [];
  const upcoming = pendingWithSchedule.filter((item) => item.scheduledAtMs != null && item.scheduledAtMs >= nowMs);
  const candidates = upcoming.length > 0 ? upcoming : pendingWithSchedule;
  const next = candidates
    .slice()
    .sort((a, b) => {
      const aKey = a.scheduledAtMs ?? Number.POSITIVE_INFINITY;
      const bKey = b.scheduledAtMs ?? Number.POSITIVE_INFINITY;
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
      <h1 className="text-2xl font-bold">Mis Viajes</h1>
      {job ? (
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
      ) : <p>No hay fletes asignados</p>}
    </div>
  );
}
