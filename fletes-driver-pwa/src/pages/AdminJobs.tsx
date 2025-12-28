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
  listDriverLocations,
  listDrivers,
  listJobs,
  updateDriver,
  updateJob,
} from '../lib/api';
import { cn, formatDuration, getScheduledAtMs } from '../lib/utils';

const buildDriverCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export default function AdminJobs() {
  const [tab, setTab] = useState<'jobs' | 'drivers' | 'analytics'>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [dropoff, setDropoff] = useState<LocationData | null>(null);
  const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff'>('pickup');
  const [driverName, setDriverName] = useState('');
  const [driverCode, setDriverCode] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const locationsLoadedRef = useRef(false);

  const driversById = useMemo(() => {
    const map = new Map<string, Driver>();
    drivers.forEach((driver) => map.set(driver.id, driver));
    return map;
  }, [drivers]);

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

  useEffect(() => {
    loadJobs();
    loadDrivers();
    loadDriverLocations();
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
    const scheduledAt = getScheduledAtMs(scheduledDate, scheduledTime);
    const driverIdValue = String(fd.get('driverId') || '').trim();
    try {
      await createJob({
        id: uuidv4(),
        clientName: String(fd.get('cn') || ''),
        scheduledDate,
        scheduledTime,
        scheduledAt: scheduledAt ?? undefined,
        pickup,
        dropoff,
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

  const totalJobs = jobs.length;
  const activeDrivers = drivers.filter((driver) => driver.active).length;
  const assignedJobs = jobs.filter((job) => job.driverId).length;
  const activeJobs = jobs.filter((job) => job.status !== 'DONE').length;
  const unassignedJobs = totalJobs - assignedJobs;
  const driverLocationsById = useMemo(() => {
    const map = new Map<string, DriverLocation>();
    driverLocations.forEach((loc) => map.set(loc.driverId, loc));
    return map;
  }, [driverLocations]);
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-blue-500">Panel Admin</p>
          <h1 className="text-2xl font-bold text-gray-900">Gestion de fletes</h1>
          <p className="text-sm text-gray-500">Asignaciones, conductores y analiticas.</p>
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
            <p>Usa los tabs para navegar entre fletes, conductores y analiticas.</p>
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
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input name="scheduledDate" type="date" className="w-full border p-2" required />
                      <input name="scheduledTime" type="time" className="w-full border p-2" required />
                    </div>
                    <AddressAutocomplete label="Origen" placeholder="Buscar origen" onSelect={setPickup} selected={pickup} />
                    <AddressAutocomplete label="Destino" placeholder="Buscar destino" onSelect={setDropoff} selected={dropoff} />
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
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Click en el mapa para asignar {mapTarget === 'pickup' ? 'origen' : 'destino'}.</p>
                      <MapLocationPicker
                        pickup={pickup}
                        dropoff={dropoff}
                        active={mapTarget}
                        onSelect={(kind, location) => {
                          if (kind === 'pickup') {
                            setPickup(location);
                          } else {
                            setDropoff(location);
                          }
                        }}
                      />
                    </div>
                    <button className="w-full rounded bg-green-600 p-2 text-white">Guardar</button>
                  </form>
                )}
              </div>

              <div className="space-y-3">
                {loadingJobs && <p className="text-sm text-gray-500">Cargando fletes...</p>}
                {!loadingJobs && jobs?.length === 0 && <p className="text-sm text-gray-500">No hay fletes cargados.</p>}
                {!loadingJobs && jobs?.map((job) => {
                  const tripStart = job.timestamps.startTripAt ?? job.timestamps.endLoadingAt;
                  const tripEnd = job.timestamps.endTripAt ?? job.timestamps.startUnloadingAt;
                  const loading = formatDuration(job.timestamps.startLoadingAt, job.timestamps.endLoadingAt);
                  const trip = formatDuration(tripStart, tripEnd);
                  const unloading = formatDuration(job.timestamps.startUnloadingAt, job.timestamps.endUnloadingAt);
                  const total = formatDuration(job.timestamps.startLoadingAt, job.timestamps.endUnloadingAt);
                  const driver = job.driverId ? driversById.get(job.driverId) : null;
                  return (
                    <div key={job.id} className="space-y-2 rounded border-l-4 border-blue-500 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{job.clientName}</p>
                          <p className="text-xs text-gray-700">Fecha: {job.scheduledDate || 'Sin fecha'} | Hora: {job.scheduledTime || 'Sin hora'}</p>
                          <p className="text-xs">{job.status}</p>
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-400">Total fletes</p>
                <p className="text-2xl font-semibold text-gray-900">{totalJobs}</p>
                <p className="text-xs text-gray-500">Placeholder para comparativas futuras.</p>
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-400">Conductores activos</p>
                <p className="text-2xl font-semibold text-gray-900">{activeDrivers}</p>
                <p className="text-xs text-gray-500">Placeholder para disponibilidad.</p>
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-400">Tiempo promedio</p>
                <p className="text-2xl font-semibold text-gray-900">Proximamente</p>
                <p className="text-xs text-gray-500">Se calculara con historicos.</p>
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-400">Cumplimiento</p>
                <p className="text-2xl font-semibold text-gray-900">Proximamente</p>
                <p className="text-xs text-gray-500">Indicadores personalizados.</p>
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
