import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Job, JobStatus } from '../lib/types';
import { getJob, updateJob } from '../lib/api';
import { ArrowLeft, LocateFixed, MapPin, Phone, Route } from 'lucide-react';
import { calculateDistance, getScheduledAtMs, isStartWindowOpen } from '../lib/utils';
import { useGeoLocation } from '../hooks/useGeoLocation';
import MapRoute, { type MapRouteHandle } from '../components/MapRoute';
import SlideToConfirm from '../components/SlideToConfirm';
import toast from 'react-hot-toast';
import { getDriverSession } from '../lib/driverSession';
import { useDriverLocationSync } from '../hooks/useDriverLocationSync';

const formatAddress = (address: string, maxParts = 3) => {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= maxParts) return address.trim();
  return parts.slice(0, maxParts).join(', ');
};

const isValidLocation = (value?: { lat: number; lng: number } | null) =>
  !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng);

export default function JobWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExpanded, setShowExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const mapRef = useRef<MapRouteHandle | null>(null);
  const { coords } = useGeoLocation();
  const [dist, setDist] = useState<number|null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const extraStopsValid = job?.extraStops?.filter((stop) => isValidLocation(stop)) ?? [];
  const rawStopIndex = typeof job?.stopIndex === 'number' && Number.isInteger(job.stopIndex) && job.stopIndex >= 0
    ? job.stopIndex
    : 0;
  const stopIndex = Math.min(rawStopIndex, extraStopsValid.length);
  const hasPendingStops = job?.status === 'TO_DROPOFF' && stopIndex < extraStopsValid.length;
  const activeStop = hasPendingStops ? extraStopsValid[stopIndex] : null;
  const target = !job
    ? null
    : job.status === 'PENDING' || job.status === 'TO_PICKUP' || job.status === 'LOADING'
      ? job.pickup
      : job.status === 'TO_DROPOFF' && activeStop
        ? activeStop
        : job.dropoff;

  useEffect(() => {
    let active = true;
    if (!id) return;
    const current = getDriverSession();
    if (!current) {
      navigate('/driver/login', { replace: true });
      return;
    }
    (async () => {
      try {
        const data = await getJob(id, { driverId: current.driverId });
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
  }, [id, navigate]);

  useEffect(() => {
    setShowExpanded(false);
    setShowDetails(false);
  }, [id]);

  useEffect(() => {
    if (job?.status !== 'PENDING') setShowExpanded(false);
  }, [job?.status]);

  useEffect(() => {
    if (!job || !coords || job.status === 'DONE') return;
    if (!target || !isValidLocation(target)) {
      setDist(null);
      return;
    }
    const d = calculateDistance(coords.lat, coords.lng, target.lat, target.lng);
    setDist(d);
    if (d < 100) toast.success("Estas en el punto", { id: 'at-point' });
  }, [coords, job?.id, job?.status, target?.lat, target?.lng]);

  useEffect(() => {
    if (!job) return;
    if (!job.timestamps.startJobAt || job.status === 'DONE') return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [job?.id, job?.status, job?.timestamps.startJobAt]);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        wakeLock = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLock && !wakeLock.released) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  useDriverLocationSync({ session: getDriverSession(), jobId: job?.id ?? null, coords });
  if (loading) return <div>Cargando...</div>;
  if (!job) return <div>No se encontro el flete</div>;
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
  const displayAddress = target ? formatAddress(target.address) : 'Direccion no disponible';
  const clientPhone = job.clientPhone?.trim() ?? '';
  const phoneHref = clientPhone ? `tel:${clientPhone.replace(/[^0-9+]/g, '')}` : '';
  const scheduledDateLabel = job.scheduledDate
    ?? (scheduledAtMs != null
      ? new Date(scheduledAtMs).toLocaleDateString('en-GB')
      : 'Sin fecha');
  const scheduledTimeLabel = job.scheduledTime
    ? job.scheduledTime.slice(0, 5)
    : (scheduledAtMs != null
      ? new Date(scheduledAtMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
      : 'Sin hora');
  const scheduleLabel = `${scheduledDateLabel} | ${scheduledTimeLabel}`;
  const estimatedDurationLabel = Number.isFinite(job.estimatedDurationMinutes)
    ? `${Math.round(job.estimatedDurationMinutes as number)} min`
    : 'N/D';
  const distanceValueKm = Number.isFinite(job.distanceKm)
    ? (job.distanceKm as number)
    : Number.isFinite(job.distanceMeters)
      ? (job.distanceMeters as number) / 1000
      : null;
  const distanceLabel = distanceValueKm != null ? `${distanceValueKm.toFixed(1)} km` : 'N/D';
  const extraStops = job.extraStops ?? [];
  const detailsSection = (
    <>
      <div className="rounded-2xl border bg-white p-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Resumen</p>
        <div className="mt-2 grid gap-1 text-sm text-gray-700">
          <p><span className="font-medium text-gray-900">Programado:</span> {scheduleLabel}</p>
          <p><span className="font-medium text-gray-900">Duracion estimada:</span> {estimatedDurationLabel}</p>
          <p><span className="font-medium text-gray-900">Distancia:</span> {distanceLabel}</p>
          <p><span className="font-medium text-gray-900">Ayudantes:</span> {job.helpersCount ?? 0}</p>
          {clientPhone && (
            <p><span className="font-medium text-gray-900">Contacto:</span> {clientPhone}</p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border bg-white p-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Direcciones</p>
        <div className="mt-2 space-y-2 text-sm text-gray-700">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Origen</p>
            <p>{job.pickup?.address || 'Sin direccion'}</p>
          </div>
          {extraStops.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Paradas extra</p>
              <ul className="mt-1 space-y-1">
                {extraStops.map((stop, index) => (
                  <li key={`${stop.lat}-${stop.lng}-${index}`} className="text-sm text-gray-700">
                    {stop.address || 'Sin direccion'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Destino</p>
            <p>{job.dropoff?.address || 'Sin direccion'}</p>
          </div>
        </div>
      </div>
      {(job.description || job.notes) && (
        <div className="rounded-2xl border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Detalles</p>
          {job.description && (
            <p className="mt-2 text-sm text-gray-700">Descripcion: {job.description}</p>
          )}
          {job.notes && (
            <p className="mt-2 text-sm text-gray-700">Notas: {job.notes}</p>
          )}
        </div>
      )}
    </>
  );

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
    if (st === 'TO_DROPOFF' && !Number.isInteger(job.stopIndex)) {
      patch.stopIndex = 0;
    }
    if (Object.keys(timestampsPatch).length > 0) {
      patch.timestamps = timestampsPatch;
    }
    try {
      const updated = await updateJob(job.id, patch);
      setJob(updated);
      if (st === 'DONE') navigate('/driver');
    } catch {
      toast.error('No se pudo actualizar el flete');
    }
  };

  const advanceStop = async () => {
    if (!job || !hasPendingStops) return;
    const nextIndex = Math.min(stopIndex + 1, extraStopsValid.length);
    try {
      const updated = await updateJob(job.id, { stopIndex: nextIndex });
      setJob(updated);
    } catch {
      toast.error('No se pudo actualizar la parada');
    }
  };

  if (job.status === 'PENDING' && !showExpanded) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-3.5 py-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/driver')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              <ArrowLeft size={14} />
              Volver
            </button>
            {clientPhone && (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                aria-label="Llamar al cliente"
              >
                <Phone size={14} />
                Llamar
              </a>
            )}
          </div>
          <div className="mt-2">
            <p className="text-lg font-semibold text-blue-900">{job.clientName}</p>
            <p className="text-xs text-blue-700">Flete pendiente</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-blue-700">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-blue-400">Programado</p>
              <p className="text-sm font-semibold text-blue-900">{scheduleLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-blue-400">Ayudantes</p>
              <p className="text-sm font-semibold text-blue-900">{job.helpersCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2">
          {detailsSection}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => next('TO_PICKUP')}
            disabled={!startAvailable}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {startAvailable ? 'Iniciar viaje' : 'Programado'}
          </button>
          <button
            type="button"
            onClick={() => setShowExpanded(true)}
            className="w-full rounded border border-blue-200 bg-white px-4 py-2 text-blue-700"
          >
            Ver info expandida
          </button>
          {!startAvailable && availableAt && (
            <p className="text-xs text-gray-600 text-center">Disponible desde {availableAt.toLocaleString()}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/driver')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            <ArrowLeft size={14} />
            Volver
          </button>
          {clientPhone && (
            <a
              href={phoneHref}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
              aria-label="Llamar al cliente"
            >
              <Phone size={14} />
              Llamar
            </a>
          )}
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[26px] font-semibold leading-none text-blue-800">{elapsedLabel ?? '--:--:--'}</p>
            <span className="mt-1.5 inline-flex items-center rounded-full bg-blue-600/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              Estado: {job.status}
            </span>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[13px] font-semibold text-blue-900">
              ETA: {etaText}
              <span className="text-blue-300"> • </span>
              {distanceText}
            </p>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-blue-500">Cliente</p>
            <p className="text-sm font-semibold text-blue-950 truncate">{job.clientName}</p>
            {job.description && (
              <p className="text-xs text-blue-700 truncate">Descripcion: {job.description}</p>
            )}
            <p className="text-xs text-blue-700">Ayudantes: {job.helpersCount ?? 0}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-blue-500">Direccion actual</p>
            <div className="mt-0.5 grid grid-cols-[auto_1fr] items-start justify-end gap-1 min-w-0">
              <MapPin size={14} className="mt-[2px] text-blue-500" />
              <div className="text-right text-sm font-semibold text-blue-950 leading-snug break-words whitespace-normal min-w-0 max-h-[2.5rem] overflow-hidden">
                {displayAddress}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
          >
            Ver detalle del flete
          </button>
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
      
      {job.status === 'PENDING' && showExpanded && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => next('TO_PICKUP')}
            disabled={!startAvailable}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {startAvailable ? 'Iniciar viaje' : 'Programado'}
          </button>
          <button
            type="button"
            onClick={() => setShowExpanded(false)}
            className="w-full rounded border border-blue-200 bg-white px-4 py-2 text-blue-700"
          >
            Volver al resumen
          </button>
          {!startAvailable && availableAt && (
            <p className="text-xs text-gray-600 text-center">Disponible desde {availableAt.toLocaleString()}</p>
          )}
        </div>
      )}
      {job.status === 'TO_PICKUP' && <SlideToConfirm label="Desliza para cargar" onConfirm={() => next('LOADING')} />}
      {job.status === 'LOADING' && <SlideToConfirm label="Desliza para salir" onConfirm={() => next('TO_DROPOFF')} />}
      {job.status === 'TO_DROPOFF' && hasPendingStops && (
        <SlideToConfirm
          label={`Desliza para continuar (Parada ${stopIndex + 1}/${extraStopsValid.length})`}
          onConfirm={advanceStop}
        />
      )}
      {job.status === 'TO_DROPOFF' && !hasPendingStops && (
        <SlideToConfirm label="Desliza para descargar" onConfirm={() => next('UNLOADING')} />
      )}
      {job.status === 'UNLOADING' && <SlideToConfirm label="Desliza para finalizar" onConfirm={() => next('DONE')} />}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="w-full max-w-md mx-auto max-h-[85vh] overflow-y-auto rounded-t-3xl bg-slate-50 p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Detalle del flete</p>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {detailsSection}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



