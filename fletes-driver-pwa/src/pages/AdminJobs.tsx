import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import AddressAutocomplete from '../components/AddressAutocomplete';
import type { Job, LocationData } from '../lib/types';
import { createJob, deleteJob, listJobs } from '../lib/api';
import { cn, formatDuration, getScheduledAtMs } from '../lib/utils';
import MapLocationPicker from '../components/MapLocationPicker';

export default function AdminJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [dropoff, setDropoff] = useState<LocationData | null>(null);
  const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff'>('pickup');

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await listJobs();
      setJobs(data);
    } catch {
      toast.error('No se pudieron cargar los fletes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pickup || !dropoff) {
      toast.error('Selecciona origen y destino (lista o mapa)');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const scheduledDate = String(fd.get('scheduledDate') || '');
    const scheduledTime = String(fd.get('scheduledTime') || '');
    const scheduledAt = getScheduledAtMs(scheduledDate, scheduledTime);
    try {
      await createJob({
        id: uuidv4(),
        clientName: String(fd.get('cn') || ''),
        scheduledDate,
        scheduledTime,
        scheduledAt: scheduledAt ?? undefined,
        pickup,
        dropoff,
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
      await loadJobs();
    } catch {
      toast.error('No se pudo crear el flete');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteJob(id);
      setJobs((prev) => prev.filter((job) => job.id !== id));
    } catch {
      toast.error('No se pudo eliminar el flete');
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setOpen(!open)} className="w-full bg-blue-600 text-white p-3 rounded">Nuevo Flete</button>
      {open && (
        <form onSubmit={add} className="p-4 bg-white shadow rounded space-y-2">
          <input name="cn" placeholder="Cliente" className="w-full border p-2" required />
          <input name="scheduledDate" type="date" className="w-full border p-2" required />
          <input name="scheduledTime" type="time" className="w-full border p-2" required />
          <AddressAutocomplete label="Origen" placeholder="Buscar origen" onSelect={setPickup} selected={pickup} />
          <AddressAutocomplete label="Destino" placeholder="Buscar destino" onSelect={setDropoff} selected={dropoff} />
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
          <button className="w-full bg-green-600 text-white p-2">Guardar</button>
        </form>
      )}
      {loading && <p className="text-sm text-gray-500">Cargando fletes...</p>}
      {!loading && jobs?.map((j) => {
        const tripStart = j.timestamps.startTripAt ?? j.timestamps.endLoadingAt;
        const tripEnd = j.timestamps.endTripAt ?? j.timestamps.startUnloadingAt;
        const loading = formatDuration(j.timestamps.startLoadingAt, j.timestamps.endLoadingAt);
        const trip = formatDuration(tripStart, tripEnd);
        const unloading = formatDuration(j.timestamps.startUnloadingAt, j.timestamps.endUnloadingAt);
        const total = formatDuration(j.timestamps.startLoadingAt, j.timestamps.endUnloadingAt);
        return (
          <div key={j.id} className="p-3 bg-white border-l-4 border-blue-500 shadow-sm flex justify-between">
            <div>
              <p className="font-bold">{j.clientName}</p>
              <p className="text-xs text-gray-700">Fecha: {j.scheduledDate || 'Sin fecha'} | Hora: {j.scheduledTime || 'Sin hora'}</p>
              <p className="text-xs">{j.status}</p>
              <p className="text-xs text-gray-600">Carga: {loading} | Viaje: {trip} | Descarga: {unloading} | Total: {total}</p>
            </div>
            <button onClick={() => handleDelete(j.id)} className="text-red-500" aria-label="Eliminar">X</button>
          </div>
        );
      })}
    </div>
  );
}
