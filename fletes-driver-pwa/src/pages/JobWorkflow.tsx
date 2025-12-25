import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Job, JobStatus } from '../lib/types';
import { getJob, updateJob } from '../lib/api';
import { LocateFixed, Route } from 'lucide-react';
import { calculateDistance, getScheduledAtMs, isStartWindowOpen } from '../lib/utils';
import { useGeoLocation } from '../hooks/useGeoLocation';
import MapRoute, { type MapRouteHandle } from '../components/MapRoute';
import SlideToConfirm from '../components/SlideToConfirm';
import toast from 'react-hot-toast';

export default function JobWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapRouteHandle | null>(null);
  const { coords } = useGeoLocation();
  const [dist, setDist] = useState<number|null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    let active = true;
    if (!id) return;
    (async () => {
      try {
        const data = await getJob(id);
        if (active) setJob(data);
      } catch {
        if (active) setJob(null);
        toast.error('No se pudo cargar el flete');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!job || !coords || job.status === 'DONE') return;
    const target = job.status.includes('PICKUP') ? job.pickup : job.dropoff;
    const d = calculateDistance(coords.lat, coords.lng, target.lat, target.lng);
    setDist(d);
    if (d < 100) toast.success("Estas en el punto", { id: 'at-point' });
  }, [coords, job]);

  useEffect(() => {
    if (!job) return;
    if (!job.timestamps.startJobAt || job.status === 'DONE') return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [job?.id, job?.status, job?.timestamps.startJobAt]);

  if (loading) return <div>Cargando...</div>;
  if (!job) return <div>No se encontro el flete</div>;
  const target = job.status.includes('PICKUP') ? job.pickup : job.dropoff;
  const distanceKm = dist != null ? (dist / 1000) : null;
  const distanceText = distanceKm != null ? `${distanceKm.toFixed(1)} km` : 'N/D';
  const speedMps = coords?.speed ?? null;
  const fallbackSpeedMps = 30 / 3.6;
  const etaMins = dist != null
    ? Math.max(1, Math.round(dist / (speedMps && speedMps > 1 ? speedMps : fallbackSpeedMps) / 60))
    : null;
  const etaLabel = speedMps && speedMps > 1 ? 'ETA' : 'ETA aprox.';
  const etaText = etaMins != null ? `${etaMins} min` : 'N/D';
  const startAvailable = isStartWindowOpen(job.scheduledDate, job.scheduledTime, new Date(), job.scheduledAt);
  const scheduledAtMs = getScheduledAtMs(job.scheduledDate, job.scheduledTime, job.scheduledAt);
  const availableAt = scheduledAtMs != null ? new Date(scheduledAtMs - 60 * 60 * 1000) : null;
  const startTime = job.timestamps.startJobAt ? new Date(job.timestamps.startJobAt).getTime() : null;
  const endTime = job.status === 'DONE' && job.timestamps.endUnloadingAt ? new Date(job.timestamps.endUnloadingAt).getTime() : null;
  const elapsedMs = startTime ? Math.max(0, (endTime ?? nowTick) - startTime) : null;
  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };
  const elapsedLabel = elapsedMs != null ? formatElapsed(elapsedMs) : null;

  const next = async (st: JobStatus) => {
    const now = new Date().toISOString();
    const timestampsPatch: Job['timestamps'] = {};
    if (st === 'TO_PICKUP' && !job.timestamps.startJobAt) {
      timestampsPatch.startJobAt = now;
    }
    if (st === 'LOADING' && !job.timestamps.startLoadingAt) {
      timestampsPatch.startLoadingAt = now;
    }
    if (st === 'TO_DROPOFF') {
      timestampsPatch.endLoadingAt = job.timestamps.endLoadingAt ?? now;
      timestampsPatch.startTripAt = job.timestamps.startTripAt ?? now;
    }
    if (st === 'UNLOADING') {
      timestampsPatch.endTripAt = job.timestamps.endTripAt ?? now;
      timestampsPatch.startUnloadingAt = job.timestamps.startUnloadingAt ?? now;
    }
    if (st === 'DONE') {
      timestampsPatch.endUnloadingAt = job.timestamps.endUnloadingAt ?? now;
    }
    const patch: Partial<Job> = { status: st, updatedAt: now };
    if (Object.keys(timestampsPatch).length > 0) {
      patch.timestamps = timestampsPatch;
    }
    try {
      const updated = await updateJob(job.id, patch);
      setJob(updated);
      if (st === 'DONE') navigate('/');
    } catch {
      toast.error('No se pudo actualizar el flete');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-xl border bg-blue-50/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 min-w-0">
            <span className="text-[10px] uppercase tracking-wide text-blue-700">Estado</span>
            <span>{job.status}</span>
            {elapsedLabel && (
              <>
                <span className="text-gray-400">|</span>
                <span>Tiempo {elapsedLabel}</span>
              </>
            )}
          </div>
          <div className="text-xs text-gray-700 whitespace-nowrap">
            <span className="font-semibold">Distancia {distanceText}</span>
            <span className="text-gray-400"> | </span>
            <span className="font-semibold">{etaLabel} {etaText}</span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Cliente</p>
            <p className="text-sm font-semibold truncate">{job.clientName}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Direccion actual</p>
            <p className="text-sm font-semibold truncate">{target.address}</p>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <MapRoute ref={mapRef} job={job} className="h-full min-h-[240px]" />
        <button
          type="button"
          onClick={() => {
            const ok = mapRef.current?.centerOnUser();
            if (!ok) toast.error('GPS no disponible');
          }}
          className="absolute left-3 top-3 h-16 w-16 rounded-full border bg-white/95 text-gray-700 shadow flex items-center justify-center"
          aria-label="Centrar en mi"
          title="Centrar en mi"
        >
          <LocateFixed size={28} />
        </button>
        <button
          type="button"
          onClick={() => {
            const ok = mapRef.current?.fitRoute();
            if (!ok) toast.error('Mapa no listo');
          }}
          className="absolute right-3 top-3 h-16 w-16 rounded-full border bg-white/95 text-gray-700 shadow flex items-center justify-center"
          aria-label="Ver recorrido"
          title="Ver recorrido"
        >
          <Route size={28} />
        </button>
      </div>
      
      {job.status === 'PENDING' && (
        <div className="space-y-2">
          <SlideToConfirm
            label="Desliza para iniciar"
            disabled={!startAvailable}
            disabledLabel="Programado"
            onConfirm={() => next('TO_PICKUP')}
          />
          {!startAvailable && availableAt && (
            <p className="text-xs text-gray-600 text-center">Disponible desde {availableAt.toLocaleString()}</p>
          )}
        </div>
      )}
      {job.status === 'TO_PICKUP' && <SlideToConfirm label="Desliza para cargar" onConfirm={() => next('LOADING')} />}
      {job.status === 'LOADING' && <SlideToConfirm label="Desliza para salir" onConfirm={() => next('TO_DROPOFF')} />}
      {job.status === 'TO_DROPOFF' && <SlideToConfirm label="Desliza para descargar" onConfirm={() => next('UNLOADING')} />}
      {job.status === 'UNLOADING' && <SlideToConfirm label="Desliza para finalizar" onConfirm={() => next('DONE')} />}
    </div>
  );
}



