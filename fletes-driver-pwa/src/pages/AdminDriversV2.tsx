import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { MapPin, Plus, Truck, UserRound, X } from 'lucide-react';
import { createDriver, driverLocationsListQueryKey, listDriverLocations, updateDriver } from '../lib/api';
import { money } from '../lib/adminV2';
import type { Driver, DriverLocation, Job, Vehicle } from '../lib/types';
import { useCachedQuery } from '../hooks/useCachedQuery';
import DriversOverviewMap from '../components/DriversOverviewMap';

type Props = { drivers: Driver[]; vehicles: Vehicle[]; jobs: Job[]; loading: boolean; refreshDrivers: () => Promise<unknown>; isOwner: boolean };

export default function AdminDriversV2({ drivers, vehicles, jobs, loading, refreshDrivers, isOwner }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locations = useCachedQuery<DriverLocation[]>({ key: driverLocationsListQueryKey(), loader: listDriverLocations, enabled: mapOpen, staleMs: 10000, refreshIntervalMs: 15000 });
  const selected = drivers.find((driver) => driver.id === selectedId) ?? null;
  const active = drivers.filter((driver) => driver.active).length;
  const debt = drivers.reduce((sum, driver) => sum + (Number(driver.ownerDebtAmount) || 0), 0);

  const addDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    setSaving(true);
    try { await createDriver({ id: uuidv4(), name: String(data.get('name')).trim(), code: String(data.get('code')).trim().toUpperCase(), phone: String(data.get('phone') || '').trim() || undefined, active: true, createdAt: now, updatedAt: now }); await refreshDrivers(); setShowCreate(false); toast.success('Conductor agregado'); }
    catch { toast.error('No se pudo crear el conductor'); }
    finally { setSaving(false); }
  };

  const saveDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await updateDriver(selected.id, { name: String(data.get('name')).trim(), phone: String(data.get('phone') || '').trim(), vehicleId: String(data.get('vehicleId') || '') || null, active: data.get('active') === 'on' });
      await refreshDrivers(); setSelectedId(null); toast.success('Conductor actualizado');
    } catch { toast.error('No se pudo actualizar el conductor'); }
    finally { setSaving(false); }
  };

  const settle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !isOwner) return;
    const amount = Number(new FormData(event.currentTarget).get('amount'));
    const outstanding = Number(selected.ownerDebtAmount) || 0;
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding + .01) { toast.error('Monto mayor que la deuda o inválido'); return; }
    setSaving(true);
    try { await updateDriver(selected.id, { ownerDebtSettledAmount: Math.round(((Number(selected.ownerDebtSettledAmount) || 0) + amount) * 100) / 100, ownerDebtSettledAt: new Date().toISOString() }); await refreshDrivers(); toast.success('Liquidación registrada'); setSelectedId(null); }
    catch { toast.error('No se pudo registrar la liquidación'); }
    finally { setSaving(false); }
  };

  return <div className="v2-stack"><div className="v2-summary-grid"><div className="v2-stat"><div className="v2-stat-icon"><UserRound size={19} /></div><p>Conductores activos</p><strong>{active}</strong><small>De {drivers.length} registrados</small></div><div className="v2-stat"><div className="v2-stat-icon"><Truck size={19} /></div><p>Vehículos</p><strong>{vehicles.length}</strong><small>Disponibles para asignar</small></div>{isOwner && <div className="v2-stat"><p>Por liquidar</p><strong className="v2-stat-money">{money.format(debt)}</strong><small>Deuda vigente del equipo</small></div>}</div>
    <div className="v2-panel"><div className="v2-panel-head"><div><p className="v2-kicker">EQUIPO</p><h2>Conductores</h2><span>Asignación y liquidaciones</span></div><button type="button" className="v2-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Agregar conductor</button></div>{loading ? <div className="v2-empty">Cargando conductores…</div> : drivers.length === 0 ? <div className="v2-empty">Todavía no hay conductores.</div> : <div className="v2-driver-grid">{drivers.map((driver) => { const vehicle = vehicles.find((item) => item.id === driver.vehicleId); const activeJobs = jobs.filter((job) => job.driverId === driver.id && job.status !== 'DONE').length; return <button key={driver.id} type="button" className="v2-driver-card" onClick={() => setSelectedId(driver.id)}><div className="v2-driver-avatar">{driver.name.slice(0, 1).toUpperCase()}</div><div className="v2-driver-main"><div><strong>{driver.name}</strong><span className={`v2-status v2-status--${driver.active ? 'done' : 'pending'}`}>{driver.active ? 'Activo' : 'Inactivo'}</span></div><p>{vehicle?.name || 'Sin vehículo asignado'}</p><small>{activeJobs} fletes abiertos · Código {driver.code}</small></div>{isOwner && <div className="v2-driver-debt"><small>Por liquidar</small><strong>{money.format(Number(driver.ownerDebtAmount) || 0)}</strong></div>}</button>; })}</div>}</div>
    <div className="v2-panel"><div className="v2-panel-head"><div><p className="v2-kicker">SEGUIMIENTO</p><h2>Mapa del equipo</h2><span>Ubicación y fletes activos de los conductores.</span></div><button type="button" className="v2-secondary" onClick={() => setMapOpen((open) => !open)}><MapPin size={16} /> {mapOpen ? 'Ocultar mapa' : 'Ver mapa en vivo'}</button></div>{mapOpen && <div className="v2-live-map"><DriversOverviewMap locations={locations.data ?? []} drivers={drivers} jobs={jobs} className="h-full" /></div>}</div>
    {showCreate && <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="v2-modal" role="dialog" aria-modal="true" aria-label="Agregar conductor"><div className="v2-panel-head"><div><p className="v2-kicker">EQUIPO</p><h2>Nuevo conductor</h2></div><button type="button" className="v2-icon-button" onClick={() => setShowCreate(false)} aria-label="Cerrar"><X size={19} /></button></div><form className="v2-form" onSubmit={addDriver}><label className="v2-field">Nombre<input name="name" required /></label><label className="v2-field">Código de acceso<input name="code" required /></label><label className="v2-field">Teléfono<input name="phone" type="tel" /></label><button className="v2-primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Agregar conductor'}</button></form></section></div>}
    {selected && <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><section className="v2-drawer" role="dialog" aria-modal="true" aria-label={`Conductor ${selected.name}`}><div className="v2-drawer-head"><div><p className="v2-kicker">CONDUCTOR</p><h2>{selected.name}</h2><span>Código {selected.code}</span></div><button type="button" className="v2-icon-button" onClick={() => setSelectedId(null)} aria-label="Cerrar"><X size={20} /></button></div><div className="v2-drawer-body"><div className="v2-detail-section"><h3>Datos y asignación</h3><form className="v2-form" onSubmit={saveDriver} key={selected.id}><label className="v2-field">Nombre<input name="name" required defaultValue={selected.name} /></label><label className="v2-field">Teléfono<input name="phone" type="tel" defaultValue={selected.phone ?? ''} /></label><label className="v2-field">Vehículo<select name="vehicleId" defaultValue={selected.vehicleId ?? ''}><option value="">Sin asignar</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label><label className="v2-check"><input name="active" type="checkbox" defaultChecked={selected.active} /> Conductor activo</label><button type="submit" className="v2-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></form></div>{isOwner && <div className="v2-detail-section"><h3>Liquidación</h3><div className="v2-detail-highlight"><small>Deuda vigente</small><strong>{money.format(Number(selected.ownerDebtAmount) || 0)}</strong></div><form className="v2-form" onSubmit={settle}><label className="v2-field">Monto recibido<input name="amount" type="number" min="0.01" max={Number(selected.ownerDebtAmount) || 0} step="0.01" required /></label><button type="submit" className="v2-secondary" disabled={saving || !Number(selected.ownerDebtAmount)}>{saving ? 'Registrando…' : 'Registrar liquidación'}</button></form></div>}</div></section></div>}
  </div>;
}
