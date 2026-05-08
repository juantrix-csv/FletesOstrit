import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Job, JobStatus, Vehicle } from '../lib/types';
import { getHelperHourlyRate, getHourlyRate, getJob, jobDetailQueryKey, listVehicles, updateJob, vehiclesListQueryKey } from '../lib/api';
import { ArrowLeft, Banknote, Landmark, LocateFixed, MapPin, Phone, Route } from 'lucide-react';
import { calculateDistance, getScheduledAtMs, isStartWindowOpen } from '../lib/utils';
import { useGeoLocation } from '../hooks/useGeoLocation';
import MapRoute, { type MapRouteHandle } from '../components/MapRoute';
import SlideToConfirm from '../components/SlideToConfirm';
import toast from 'react-hot-toast';
import { getDriverSession } from '../lib/driverSession';
import { useDriverLocationSync } from '../hooks/useDriverLocationSync';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { formatBilledHours, formatDurationMs, getJobChargeBreakdown, moneyFormatter } from '../lib/jobPricing';
import { useOperationsBaseLocation } from '../hooks/useOperationsBaseLocation';
import { getRouteEstimate } from '../lib/routeEstimate';

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
  const [showExpanded, setShowExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showCompletionSheet, setShowCompletionSheet] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [actionPending, setActionPending] = useState(false);
  const mapRef = useRef<MapRouteHandle | null>(null);
  const { coords } = useGeoLocation();
  const [dist, setDist] = useState<number|null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [distantBaseEstimate, setDistantBaseEstimate] = useState<{
    pickupMinutes: number | null;
    dropoffMinutes: number | null;
    farthestPoint: 'pickup' | 'dropoff';
    farthestMinutes: number;
  } | null>(null);
  const [loadingDistantBaseEstimate, setLoadingDistantBaseEstimate] = useState(false);
  const session = getDriverSession();
  const jobQuery = useCachedQuery<Job>({
    key: id && session ? jobDetailQueryKey(id, { driverId: session.driverId }) : 'job:detail:disabled',
    enabled: !!id && !!session,
    loader: () => getJob(id as string, { driverId: session!.driverId }),
    staleMs: 45000,
  });
  const hourlyRateQuery = useCachedQuery<{ hourlyRate: number | null }>({
    key: 'settings:hourly-rate',
    enabled: !!session,
    loader: getHourlyRate,
    staleMs: 5 * 60 * 1000,
  });
  const helperHourlyRateQuery = useCachedQuery<{ hourlyRate: number | null }>({
    key: 'settings:helper-hourly-rate',
    enabled: !!session,
    loader: getHelperHourlyRate,
    staleMs: 5 * 60 * 1000,
  });
  const vehiclesQuery = useCachedQuery<Vehicle[]>({
    key: vehiclesListQueryKey(),
    enabled: !!session,
    loader: listVehicles,
    staleMs: 5 * 60 * 1000,
  });
  const operationsBaseLocationQuery = useOperationsBaseLocation();
  const operationsBaseLocation = operationsBaseLocationQuery.location;
  const loading = jobQuery.loading;
  const hourlyRateValue = Number.isFinite(hourlyRateQuery.data?.hourlyRate)
    ? Number(hourlyRateQuery.data?.hourlyRate)
    : null;
  const helperHourlyRateValue = Number.isFinite(helperHourlyRateQuery.data?.hourlyRate)
    ? Number(helperHourlyRateQuery.data?.hourlyRate)
    : null;
  const selectedVehicle = job?.vehicleId
    ? vehiclesQuery.data?.find((vehicle) => vehicle.id === job.vehicleId) ?? null
    : null;
  const vehicleHourlyRateValue = Number.isFinite(selectedVehicle?.hourlyRate)
    ? Number(selectedVehicle?.hourlyRate)
    : null;
  const effectiveHourlyRateValue = vehicleHourlyRateValue ?? hourlyRateValue;
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
    if (!id) return;
    if (!session) {
      navigate('/driver/login', { replace: true });
      return;
    }
  }, [id, navigate, session]);

  useEffect(() => {
    if (jobQuery.data) {
      setJob(jobQuery.data);
      return;
    }
    if (!jobQuery.loading) {
      setJob(null);
    }
  }, [jobQuery.data, jobQuery.loading]);

  useEffect(() => {
    setShowExpanded(false);
    setShowDetails(false);
    setShowCompletionSheet(false);
    setPaymentMethod('cash');
  }, [id]);

  useEffect(() => {
    if (job?.status !== 'PENDING') setShowExpanded(false);
  }, [job?.status]);

  useEffect(() => {
    if (job?.status !== 'UNLOADING') {
      setShowCompletionSheet(false);
    }
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

  const realStartAt = job?.timestamps.startLoadingAt ?? job?.timestamps.startJobAt;

  useEffect(() => {
    if (!job) return;
    if (!realStartAt || job.status === 'DONE') return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [job?.id, job?.status, realStartAt]);

  useEffect(() => {
    let active = true;
    if (!job || !operationsBaseLocation || !isValidLocation(operationsBaseLocation) || !isValidLocation(job.pickup) || !isValidLocation(job.dropoff)) {
      setDistantBaseEstimate(null);
      setLoadingDistantBaseEstimate(false);
      return () => {
        active = false;
      };
    }

    setLoadingDistantBaseEstimate(true);
    (async () => {
      try {
        const [pickupRoute, dropoffRoute] = await Promise.all([
          getRouteEstimate(operationsBaseLocation, job.pickup),
          getRouteEstimate(operationsBaseLocation, job.dropoff),
        ]);
        if (!active) return;

        const pickupMinutes = pickupRoute ? Math.max(1, Math.ceil(pickupRoute.durationSeconds / 60)) : null;
        const dropoffMinutes = dropoffRoute ? Math.max(1, Math.ceil(dropoffRoute.durationSeconds / 60)) : null;
        if (pickupMinutes == null && dropoffMinutes == null) {
          setDistantBaseEstimate(null);
          return;
        }

        const farthestPoint = (pickupMinutes ?? -1) >= (dropoffMinutes ?? -1)
          ? 'pickup'
          : 'dropoff';
        const farthestMinutes = farthestPoint === 'pickup' ? pickupMinutes : dropoffMinutes;
        if (farthestMinutes == null) {
          setDistantBaseEstimate(null);
          return;
        }

        setDistantBaseEstimate({
          pickupMinutes,
          dropoffMinutes,
          farthestPoint,
          farthestMinutes,
        });
      } finally {
        if (active) setLoadingDistantBaseEstimate(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    job?.id,
    job?.pickup.lat,
    job?.pickup.lng,
    job?.dropoff.lat,
    job?.dropoff.lng,
    operationsBaseLocation?.lat,
    operationsBaseLocation?.lng,
  ]);

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

  useDriverLocationSync({ session, jobId: job?.id ?? null, coords });
  if (loading) return <div>Cargando...</div>;
  if (!job) return <div>No se encontro el flete</div>;
  const pricingPreview = getJobChargeBreakdown(job, {
    hourlyRate: effectiveHourlyRateValue,
    helperHourlyRate: helperHourlyRateValue,
    endAtMs: job.status === 'DONE' ? undefined : nowTick,
    distantBaseTravelMinutes: distantBaseEstimate?.farthestMinutes ?? null,
    distantBasePoint: distantBaseEstimate?.farthestPoint ?? null,
  });
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
  const startTime = realStartAt ? new Date(realStartAt).getTime() : null;
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
  const hasHelpers = (job.helpersCount ?? 0) > 0;
  const distantBaseLoading = operationsBaseLocationQuery.loading || (!!operationsBaseLocation && loadingDistantBaseEstimate);
  const pricingLoading = pricingPreview.source !== 'stored'
    && (Boolean(job.vehicleId && vehiclesQuery.loading) || (effectiveHourlyRateValue == null && hourlyRateQuery.loading) || (hasHelpers && helperHourlyRateQuery.loading) || distantBaseLoading);
  const helperRateMissing = (job.helpersCount ?? 0) > 0 && helperHourlyRateValue == null;
  const canConfirmCompletion = !pricingLoading && pricingPreview.totalAmount != null && !actionPending;
  const displayedTotalAmount = pricingLoading ? null : pricingPreview.totalAmount;
  const distantBasePointLabel = pricingPreview.distantBasePoint === 'pickup'
    ? 'Origen'
    : pricingPreview.distantBasePoint === 'dropoff'
      ? 'Destino'
      : 'Punto mas lejano';
  const distantBaseExtraLabel = pricingPreview.distantBaseTravelMinutes != null
    ? pricingPreview.distantBaseExtraMinutes > 0
      ? `${pricingPreview.distantBaseExtraMinutes} min (${distantBasePointLabel} a ${pricingPreview.distantBaseTravelMinutes} min de la base)`
      : `No aplica (${distantBasePointLabel} a ${pricingPreview.distantBaseTravelMinutes} min de la base)`
    : distantBaseLoading
      ? 'Calculando...'
      : operationsBaseLocation
        ? 'No se pudo calcular'
        : 'Base no configurada';
  const detailsSection = (
    <>
      <div className="rounded-2xl border bg-white p-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Resumen</p>
        <div className="mt-2 grid gap-1 text-sm text-gray-700">
          <p><span className="font-medium text-gray-900">Programado:</span> {scheduleLabel}</p>
          <p><span className="font-medium text-gray-900">Duracion estimada:</span> {estimatedDurationLabel}</p>
          <p><span className="font-medium text-gray-900">Distancia:</span> {distanceLabel}</p>
          <p>
            <span className="font-medium text-gray-900">Vehiculo:</span>{' '}
            {selectedVehicle
              ? `${selectedVehicle.name}${vehicleHourlyRateValue != null ? ` (${moneyFormatter.format(vehicleHourlyRateValue)}/h)` : ''}`
              : 'Sin vehiculo especifico'}
          </p>
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
          <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-2 text-sm text-gray-700">
            {job.description && (
              <div className="whitespace-pre-wrap break-words">
                <span className="font-medium text-gray-900">Descripcion:</span> {job.description}
              </div>
            )}
            {job.notes && (
              <div className="whitespace-pre-wrap break-words">
                <span className="font-medium text-gray-900">Notas:</span> {job.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const next = async (st: JobStatus) => {
    const now = new Date().toISOString();
    const timestampsPatch: Job['timestamps'] = {};
    if (st === 'LOADING' && !job.timestamps.startLoadingAt) {
      timestampsPatch.startJobAt = job.timestamps.startJobAt ?? now;
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
      setActionPending(true);
      const updated = await updateJob(job.id, patch);
      setJob(updated);
      if (st === 'DONE') navigate('/driver');
    } catch {
      toast.error('No se pudo actualizar el flete');
    } finally {
      setActionPending(false);
    }
  };

  const advanceStop = async () => {
    if (!job || !hasPendingStops) return;
    const nextIndex = Math.min(stopIndex + 1, extraStopsValid.length);
    try {
      setActionPending(true);
      const updated = await updateJob(job.id, { stopIndex: nextIndex });
      setJob(updated);
    } catch {
      toast.error('No se pudo actualizar la parada');
    } finally {
      setActionPending(false);
    }
  };

  const completeWithPayment = async () => {
    if (!canConfirmCompletion || pricingPreview.totalAmount == null) {
      toast.error('No se pudo calcular el monto final');
      return;
    }

    const now = new Date().toISOString();
    const patch: Partial<Job> = {
      status: 'DONE',
      updatedAt: now,
      timestamps: {
        endUnloadingAt: job.timestamps.endUnloadingAt ?? now,
      },
      cashAmount: paymentMethod === 'cash' ? pricingPreview.totalAmount : null,
      transferAmount: paymentMethod === 'transfer' ? pricingPreview.totalAmount : null,
    };

    try {
      setActionPending(true);
      const updated = await updateJob(job.id, patch);
      setJob(updated);
      setShowCompletionSheet(false);
      navigate('/driver');
    } catch {
      toast.error('No se pudo registrar el cobro');
    } finally {
      setActionPending(false);
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
            disabled={!startAvailable || actionPending}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {actionPending ? 'Procesando...' : startAvailable ? 'Iniciar viaje' : 'Programado'}
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
            disabled={!startAvailable || actionPending}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {actionPending ? 'Procesando...' : startAvailable ? 'Iniciar viaje' : 'Programado'}
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
      {job.status === 'TO_PICKUP' && <SlideToConfirm label="Desliza para cargar" onConfirm={() => next('LOADING')} disabled={actionPending} disabledLabel="Procesando..." />}
      {job.status === 'LOADING' && <SlideToConfirm label="Desliza para salir" onConfirm={() => next('TO_DROPOFF')} disabled={actionPending} disabledLabel="Procesando..." />}
      {job.status === 'TO_DROPOFF' && hasPendingStops && (
        <SlideToConfirm
          label={`Desliza para continuar (Parada ${stopIndex + 1}/${extraStopsValid.length})`}
          onConfirm={advanceStop}
          disabled={actionPending}
          disabledLabel="Procesando..."
        />
      )}
      {job.status === 'TO_DROPOFF' && !hasPendingStops && (
        <SlideToConfirm label="Desliza para descargar" onConfirm={() => next('UNLOADING')} disabled={actionPending} disabledLabel="Procesando..." />
      )}
      {job.status === 'UNLOADING' && (
        <SlideToConfirm
          label="Desliza para ver cobro"
          onConfirm={() => {
            setShowDetails(false);
            setShowCompletionSheet(true);
          }}
          disabled={actionPending}
          disabledLabel="Procesando..."
        />
      )}
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
      {showCompletionSheet && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/50">
          <div className="w-full max-w-md mx-auto rounded-t-3xl bg-slate-50 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Cobro al cliente</p>
                <p className="text-xs text-gray-500">Confirma el monto final y el medio de pago.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompletionSheet(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700">Monto a cobrar</p>
              <p className="mt-1 text-3xl font-semibold text-emerald-900">
                {displayedTotalAmount != null ? moneyFormatter.format(displayedTotalAmount) : 'N/D'}
              </p>
              {pricingPreview.source === 'stored' && (
                <p className="mt-1 text-xs text-emerald-700">Se usa el monto ya cargado en el flete.</p>
              )}
            </div>

            <div className="mt-3 rounded-2xl border bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Como se forma</p>
              <div className="mt-2 space-y-1.5 text-sm text-gray-700">
                <p>
                  <span className="font-medium text-gray-900">Tiempo real:</span>{' '}
                  {pricingPreview.durationMs != null ? formatDurationMs(pricingPreview.durationMs) : 'Sin tiempos'}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Extra por lejania:</span>{' '}
                  {distantBaseExtraLabel}
                </p>
                {pricingPreview.distantBaseExtraMinutes > 0 && (
                  <p>
                    <span className="font-medium text-gray-900">Tiempo para redondeo:</span>{' '}
                    {pricingPreview.chargeableDurationMs != null ? formatDurationMs(pricingPreview.chargeableDurationMs) : 'Sin tiempos'}
                  </p>
                )}
                <p>
                  <span className="font-medium text-gray-900">Horas facturadas:</span>{' '}
                  {pricingPreview.billedHours != null ? formatBilledHours(pricingPreview.billedHours) : 'Sin calcular'}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Flete base:</span>{' '}
                  {pricingPreview.baseAmount != null && effectiveHourlyRateValue != null && pricingPreview.billedHours != null
                    ? `${formatBilledHours(pricingPreview.billedHours)} x ${moneyFormatter.format(effectiveHourlyRateValue)} = ${moneyFormatter.format(pricingPreview.baseAmount)}`
                    : pricingPreview.source === 'stored'
                      ? 'Incluido en monto cargado'
                      : 'Falta precio por hora'}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Ayudantes:</span>{' '}
                  {pricingPreview.helpersCount <= 0
                    ? 'Sin ayudantes'
                    : helperHourlyRateValue != null && pricingPreview.billedHours != null
                      ? `${pricingPreview.helpersCount} x ${formatBilledHours(pricingPreview.billedHours)} x ${moneyFormatter.format(helperHourlyRateValue)} = ${moneyFormatter.format(pricingPreview.helpersAmount)}`
                      : pricingPreview.source === 'stored'
                        ? 'Incluido en monto cargado'
                        : 'Hay ayudantes pero falta tarifa configurada'}
                </p>
              </div>
            </div>

            {helperRateMissing && pricingPreview.source !== 'stored' && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El total no incluye ayudantes porque no hay tarifa de ayudante configurada.
              </div>
            )}

            {!canConfirmCompletion && pricingPreview.totalAmount == null && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                No se pudo calcular el monto final. Revisa que exista un precio por hora o un monto ya cargado.
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Medio de pago</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`rounded-2xl border px-4 py-3 text-left ${paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-700'}`}
                >
                  <Banknote size={18} />
                  <p className="mt-2 text-sm font-semibold">Efectivo</p>
                  <p className="text-xs text-gray-500">Cobro completo en mano.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`rounded-2xl border px-4 py-3 text-left ${paymentMethod === 'transfer' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-700'}`}
                >
                  <Landmark size={18} />
                  <p className="mt-2 text-sm font-semibold">Transferencia</p>
                  <p className="text-xs text-gray-500">Cobro completo por banco.</p>
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowCompletionSheet(false)}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={completeWithPayment}
                disabled={!canConfirmCompletion}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionPending ? 'Guardando...' : `Finalizar con ${paymentMethod === 'cash' ? 'efectivo' : 'transferencia'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



