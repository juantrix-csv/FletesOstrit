import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { calculateDistance, getScheduledAtMs, isStartWindowOpen } from '../lib/utils';
import { useGeoLocation } from '../hooks/useGeoLocation';
import MapRoute from '../components/MapRoute';
import toast from 'react-hot-toast';

export default function JobWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = useLiveQuery(() => db.jobs.get(id!));
  const { coords } = useGeoLocation();
  const [dist, setDist] = useState<number|null>(null);

  useEffect(() => {
    if (!job || !coords || job.status === 'DONE') return;
    const target = job.status.includes('PICKUP') ? job.pickup : job.dropoff;
    const d = calculateDistance(coords.lat, coords.lng, target.lat, target.lng);
    setDist(d);
    if (d < 100) toast.success("Estás en el punto", { id: 'at-point' });
  }, [coords, job]);

  if (!job) return <div>Cargando...</div>;
  const startAvailable = isStartWindowOpen(job.scheduledDate, job.scheduledTime, new Date(), job.scheduledAt);
  const scheduledAtMs = getScheduledAtMs(job.scheduledDate, job.scheduledTime, job.scheduledAt);
  const availableAt = scheduledAtMs != null ? new Date(scheduledAtMs - 60 * 60 * 1000) : null;

  const next = async (st: any, extra: Record<string, string> = {}) => {
    const now = new Date().toISOString();
    const patch: Record<string, string> = { status: st, updatedAt: now, ...extra };
    if (st === 'LOADING') {
      patch['timestamps.startLoadingAt'] ??= now;
    }
    if (st === 'TO_DROPOFF') {
      patch['timestamps.endLoadingAt'] ??= now;
      patch['timestamps.startTripAt'] ??= now;
    }
    if (st === 'UNLOADING') {
      patch['timestamps.endTripAt'] ??= now;
      patch['timestamps.startUnloadingAt'] ??= now;
    }
    if (st === 'DONE') {
      patch['timestamps.endUnloadingAt'] ??= now;
    }
    await db.jobs.update(job.id, patch);
    if (st === 'DONE') navigate('/');
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border rounded-xl">
        <h2 className="font-bold text-blue-800">{job.status}</h2>
        <p className="text-xl">{job.status.includes('PICKUP') ? job.pickup.address : job.dropoff.address}</p>
        <p className="text-sm">Distancia: {dist}m</p>
      </div>

      <MapRoute jobId={job.id} />
      
      {job.status === 'PENDING' && (
        <div className="space-y-2">
          <button
            onClick={() => next('TO_PICKUP')}
            disabled={!startAvailable}
            className="w-full bg-blue-600 text-white p-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {startAvailable ? 'Iniciar Viaje' : 'Programado'}
          </button>
          {!startAvailable && availableAt && (
            <p className="text-xs text-gray-600 text-center">Disponible desde {availableAt.toLocaleString()}</p>
          )}
        </div>
      )}
      {job.status === 'TO_PICKUP' && <button onClick={() => next('LOADING', { 'timestamps.startLoadingAt': new Date().toISOString() })} className="w-full bg-blue-600 text-white p-4 rounded">Llegué / Cargar</button>}
      {job.status === 'LOADING' && <button onClick={() => next('TO_DROPOFF', { 'timestamps.endLoadingAt': new Date().toISOString() })} className="w-full bg-green-600 text-white p-4 rounded">Carga Lista</button>}
      {job.status === 'TO_DROPOFF' && <button onClick={() => next('UNLOADING', { 'timestamps.startUnloadingAt': new Date().toISOString() })} className="w-full bg-orange-600 text-white p-4 rounded">Llegué / Descargar</button>}
      {job.status === 'UNLOADING' && <button onClick={() => next('DONE', { 'timestamps.endUnloadingAt': new Date().toISOString() })} className="w-full bg-black text-white p-4 rounded">Finalizar</button>}
    </div>
  );
}
