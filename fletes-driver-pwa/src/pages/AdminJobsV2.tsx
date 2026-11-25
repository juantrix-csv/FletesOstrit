import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { ArrowRight, CalendarDays, Filter, MapPin, Plus, Search, Trash2, Truck, UserRound, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { createJob, updateJob } from '../lib/api';
import { dateKey, driverName, jobDay, jobGross, jobOwnerShare, jobTime, money, statusLabel, statusTone, vehicleName } from '../lib/adminV2';
import { getScheduledAtMs } from '../lib/utils';
import type { Driver, Job, LocationData, Vehicle } from '../lib/types';
import AddressAutocomplete from '../components/AddressAutocomplete';
import JobRoutePreviewMap from '../components/JobRoutePreviewMap';

type Props = { jobs: Job[]; drivers: Driver[]; vehicles: Vehicle[]; loading: boolean; refreshJobs: () => Promise<unknown>; isOwner: boolean };
type FilterValue = 'upcoming' | 'active' | 'done' | 'all';

export default function AdminJobsV2({ jobs, drivers, vehicles, loading, refreshJobs, isOwner }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterValue>('upcoming');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('job'));
  const [creating, setCreating] = useState(false);
  const selected = jobs.find((job) => job.id === selectedId) ?? null;
  const today = dateKey(new Date());
  const activeCount = jobs.filter((job) => job.status !== 'PENDING' && job.status !== 'DONE').length;
  const todayCount = jobs.filter((job) => jobDay(job) === today).length;
  const pendingCount = jobs.filter((job) => job.status === 'PENDING').length;

  const visibleJobs = useMemo(() => jobs.filter((job) => {
    if (filter === 'upcoming' && (job.status === 'DONE' || jobDay(job) < today)) return false;
    if (filter === 'active' && (job.status === 'PENDING' || job.status === 'DONE')) return false;
    if (filter === 'done' && job.status !== 'DONE') return false;
    const search = query.trim().toLocaleLowerCase('es-AR');
    if (!search) return true;
    return [job.clientName, job.clientPhone, job.pickup?.address, job.dropoff?.address, driverName(job, drivers)].some((item) => item?.toLocaleLowerCase('es-AR').includes(search));
  }).sort((a, b) => {
    const aTime = `${jobDay(a)} ${jobTime(a)}`;
    const bTime = `${jobDay(b)} ${jobTime(b)}`;
    return filter === 'done' ? bTime.localeCompare(aTime) : aTime.localeCompare(bTime);
  }), [jobs, drivers, filter, query, today]);

  return (
    <div className="v2-stack">
      <div className="v2-summary-grid">
        <SummaryStat label="Fletes de hoy" value={String(todayCount)} detail="En la agenda" icon={<CalendarDays size={19} />} />
        <SummaryStat label="En curso" value={String(activeCount)} detail="Requieren seguimiento" icon={<Truck size={19} />} />
        <SummaryStat label="Pendientes" value={String(pendingCount)} detail="Por iniciar" icon={<Filter size={19} />} />
      </div>

      <div className="v2-panel v2-jobs-panel">
        <div className="v2-panel-head">
          <div><p className="v2-kicker">OPERACIÓN</p><h2>Listado de fletes</h2><span>{visibleJobs.length} visibles de {jobs.length} registrados</span></div>
          <button type="button" className="v2-primary" onClick={() => setCreating(true)}><Plus size={17} /> Nuevo flete</button>
        </div>
        <div className="v2-toolbar">
          <div className="v2-segments" role="group" aria-label="Filtrar fletes">
            {([['upcoming', 'Próximos'], ['active', 'En curso'], ['done', 'Finalizados'], ['all', 'Todos']] as const).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <label className="v2-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, dirección o chofer" aria-label="Buscar fletes" /></label>
        </div>

        {loading ? <div className="v2-empty">Cargando fletes…</div> : visibleJobs.length === 0 ? <div className="v2-empty">No hay fletes para este filtro.</div> : (
          <div className="v2-job-list">
            {visibleJobs.map((job) => {
              const gross = jobGross(job);
              const share = jobOwnerShare(job, drivers);
              return (
                <button type="button" key={job.id} className="v2-job-row" onClick={() => setSelectedId(job.id)}>
                  <div className="v2-job-date"><strong>{jobTime(job)}</strong><small>{jobDay(job) || 'Sin fecha'}</small></div>
                  <div className="v2-job-main"><div className="v2-job-title"><strong>{job.clientName}</strong><span className={`v2-status v2-status--${statusTone[job.status]}`}>{statusLabel[job.status]}</span></div><p><MapPin size={14} /> {job.pickup?.address || 'Sin origen'} <ArrowRight size={12} /> {job.dropoff?.address || 'Sin destino'}</p><div className="v2-job-meta"><span><Truck size={13} /> {driverName(job, drivers)}</span><span><UserRound size={13} /> {job.helpersCount ?? 0} ayudantes</span>{job.isLongDistance && <span>Larga distancia</span>}</div></div>
                  {isOwner && <div className="v2-job-value"><strong>{share != null ? money.format(share) : gross != null ? money.format(gross) : '—'}</strong><small>{share != null ? 'Te queda' : gross != null ? 'Precio cliente' : 'Sin precio'}</small></div>}
                  <ArrowRight className="v2-row-arrow" size={18} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && <JobDetail job={selected} drivers={drivers} vehicles={vehicles} isOwner={isOwner} onClose={() => { setSelectedId(null); if (searchParams.has('job')) { const next = new URLSearchParams(searchParams); next.delete('job'); setSearchParams(next, { replace: true }); } }} onSaved={refreshJobs} />}
      {creating && <CreateJob drivers={drivers} vehicles={vehicles} onClose={() => setCreating(false)} onSaved={refreshJobs} />}
    </div>
  );
}

function SummaryStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <div className="v2-stat"><div className="v2-stat-icon">{icon}</div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>;
}

function JobDetail({ job, drivers, vehicles, isOwner, onClose, onSaved }: { job: Job; drivers: Driver[]; vehicles: Vehicle[]; isOwner: boolean; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [clientName, setClientName] = useState(job.clientName);
  const [clientPhone, setClientPhone] = useState(job.clientPhone ?? '');
  const [description, setDescription] = useState(job.description ?? '');
  const [scheduledDate, setScheduledDate] = useState(job.scheduledDate ?? '');
  const [scheduledTime, setScheduledTime] = useState(job.scheduledTime ?? '');
  const [estimatedHours, setEstimatedHours] = useState(String((job.estimatedDurationMinutes ?? 60) / 60));
  const [manualPrice, setManualPrice] = useState(job.manualPrice == null ? '' : String(job.manualPrice));
  const [pickup, setPickup] = useState<LocationData | null>(job.pickup ?? null);
  const [dropoff, setDropoff] = useState<LocationData | null>(job.dropoff ?? null);
  const [extraStops, setExtraStops] = useState<LocationData[]>(job.extraStops ?? []);
  const [stopDraft, setStopDraft] = useState<LocationData | null>(null);
  const [cashAmount, setCashAmount] = useState(job.cashAmount == null ? '' : String(job.cashAmount));
  const [transferAmount, setTransferAmount] = useState(job.transferAmount == null ? '' : String(job.transferAmount));
  const [driverId, setDriverId] = useState(job.driverId ?? '');
  const [vehicleId, setVehicleId] = useState(job.vehicleId ?? '');
  const [notes, setNotes] = useState(job.notes ?? '');
  const [helpersCount, setHelpersCount] = useState(String(job.helpersCount ?? 0));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const helpers = Number(helpersCount);
    if (!Number.isInteger(helpers) || helpers < 0) { toast.error('Cantidad de ayudantes inválida'); return; }
    const duration = Number(estimatedHours);
    if (!clientName.trim() || !pickup || !dropoff || !scheduledDate || !scheduledTime || !Number.isFinite(duration) || duration <= 0) { toast.error('Revisá cliente, recorrido, fecha y duración'); return; }
    const price = manualPrice.trim() ? Number(manualPrice) : null;
    if (job.isLongDistance && (!price || price <= 0)) { toast.error('El precio final es obligatorio para larga distancia'); return; }
    if (price != null && (!Number.isFinite(price) || price <= 0)) { toast.error('Precio inválido'); return; }
    setSaving(true);
    try {
      await updateJob(job.id, { clientName: clientName.trim(), clientPhone: clientPhone.trim() || null, description: description.trim(), pickup, dropoff, extraStops, scheduledDate, scheduledTime, scheduledAt: getScheduledAtMs(scheduledDate, scheduledTime) ?? undefined, estimatedDurationMinutes: Math.round(duration * 60), driverId: driverId || null, vehicleId: vehicleId || null, notes, helpersCount: helpers, ...(price != null ? { manualPrice: price } : {}) });
      await onSaved();
      toast.success('Flete actualizado');
      onClose();
    } catch { toast.error('No se pudo actualizar el flete'); }
    finally { setSaving(false); }
  };
  const savePayment = async () => {
    const cash = cashAmount.trim() ? Number(cashAmount) : null;
    const transfer = transferAmount.trim() ? Number(transferAmount) : null;
    if ((cash != null && (!Number.isFinite(cash) || cash < 0)) || (transfer != null && (!Number.isFinite(transfer) || transfer < 0))) { toast.error('Monto de cobro inválido'); return; }
    setSaving(true);
    try { await updateJob(job.id, { cashAmount: cash, transferAmount: transfer, chargedAmount: cash == null && transfer == null ? null : Math.round(((cash ?? 0) + (transfer ?? 0)) * 100) / 100 }); await onSaved(); toast.success('Cobro actualizado'); }
    catch { toast.error('No se pudo actualizar el cobro'); }
    finally { setSaving(false); }
  };
  return <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="v2-drawer" role="dialog" aria-modal="true" aria-label={`Flete de ${job.clientName}`}>
    <div className="v2-drawer-head"><div><p className="v2-kicker">DETALLE DEL FLETE</p><h2>{job.clientName}</h2><span>{jobDay(job)} · {jobTime(job)} · {statusLabel[job.status]}</span></div><button type="button" className="v2-icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>
    <div className="v2-drawer-body">{isOwner && <div className="v2-detail-highlight"><span className={`v2-status v2-status--${statusTone[job.status]}`}>{statusLabel[job.status]}</span><strong>{jobOwnerShare(job, drivers) != null ? money.format(jobOwnerShare(job, drivers)!) : jobGross(job) != null ? money.format(jobGross(job)!) : 'Sin precio'}</strong><small>{jobOwnerShare(job, drivers) != null ? 'Importe que te queda' : 'Precio final al cliente'}</small></div>}
      <div className="v2-route-map"><JobRoutePreviewMap job={job} className="h-[220px]" /></div>
      <div className="v2-detail-section"><h3>Recorrido</h3><div className="v2-address"><AddressAutocomplete label="Origen" placeholder="Buscar dirección de origen" selected={pickup} onSelect={setPickup} /></div><div className="v2-address"><AddressAutocomplete label="Destino" placeholder="Buscar dirección de destino" selected={dropoff} onSelect={setDropoff} /></div>{extraStops.map((stop, index) => <div className="v2-stop-row" key={`${index}-${stop.address}`}><span>{index + 1}. {stop.address}</span><button type="button" onClick={() => setExtraStops((current) => current.filter((_, position) => position !== index))} aria-label={`Quitar parada ${index + 1}`}><Trash2 size={16} /></button></div>)}<div className="v2-address"><AddressAutocomplete key={extraStops.length} label="Parada extra" placeholder="Buscar parada" selected={stopDraft} onSelect={setStopDraft} /></div><button type="button" className="v2-secondary" disabled={!stopDraft} onClick={() => { if (stopDraft) { setExtraStops((current) => [...current, stopDraft]); setStopDraft(null); } }}>Agregar parada</button></div>
      <div className="v2-detail-section"><h3>Información</h3><dl className="v2-definition"><div><dt>Cliente</dt><dd>{job.clientName}</dd></div><div><dt>Teléfono</dt><dd>{job.clientPhone || '—'}</dd></div><div><dt>Vehículo</dt><dd>{vehicleName(job, vehicles)}</dd></div><div><dt>Duración estimada</dt><dd>{job.estimatedDurationMinutes ? `${job.estimatedDurationMinutes} min` : '—'}</dd></div><div><dt>Ayudantes</dt><dd>{job.helpersCount ?? 0}</dd></div>{isOwner && <div><dt>Cobrado</dt><dd>{Number.isFinite(job.chargedAmount) ? money.format(Number(job.chargedAmount)) : '—'}</dd></div>}</dl></div>
      <div className="v2-detail-section"><h3>Datos editables</h3><label className="v2-field">Cliente<input value={clientName} onChange={(event) => setClientName(event.target.value)} required /></label><label className="v2-field">Teléfono<input type="tel" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} /></label><label className="v2-field">Descripción<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="v2-form-grid"><label className="v2-field">Fecha<input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label><label className="v2-field">Hora<input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label></div><label className="v2-field">Duración estimada · horas<input type="number" min="0.5" step="0.5" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} /></label><label className="v2-field">{job.isLongDistance ? 'Precio final al cliente' : 'Precio manual'}<input type="number" min="1" step="1" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} /></label></div>
      <div className="v2-detail-section"><h3>Asignación y notas</h3><label className="v2-field">Conductor<select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Sin asignar</option>{drivers.filter((item) => item.active || item.id === job.driverId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="v2-field">Vehículo<select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Sin vehículo</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="v2-field">Ayudantes<input type="number" min="0" step="1" value={helpersCount} onChange={(event) => setHelpersCount(event.target.value)} /></label><label className="v2-field">Notas internas<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones para el equipo" /></label></div>
      {isOwner && job.status === 'DONE' && <div className="v2-detail-section"><h3>Cobro registrado</h3><p className="v2-help">Ingresá los importes recibidos; el total se calcula como efectivo más transferencia.</p><div className="v2-form-grid"><label className="v2-field">Efectivo<input type="number" min="0" step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} /></label><label className="v2-field">Transferencia<input type="number" min="0" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} /></label></div><button type="button" className="v2-secondary" onClick={savePayment} disabled={saving}>Guardar cobro</button></div>}
    </div><div className="v2-drawer-footer"><button type="button" className="v2-secondary" onClick={onClose}>Cancelar</button><button type="button" className="v2-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
  </section></div>;
}

function CreateJob({ drivers, vehicles, onClose, onSaved }: { drivers: Driver[]; vehicles: Vehicle[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [dropoff, setDropoff] = useState<LocationData | null>(null);
  const [extraStops, setExtraStops] = useState<LocationData[]>([]);
  const [stopDraft, setStopDraft] = useState<LocationData | null>(null);
  const [longDistance, setLongDistance] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pickup || !dropoff) { toast.error('Elegí origen y destino de la lista'); return; }
    const data = new FormData(event.currentTarget);
    const helpersCount = Number(data.get('helpersCount') || 0);
    const durationHours = Number(data.get('durationHours'));
    const manualPriceText = String(data.get('manualPrice') || '').trim();
    const manualPrice = manualPriceText ? Number(manualPriceText) : undefined;
    if (!Number.isInteger(helpersCount) || helpersCount < 0 || !Number.isFinite(durationHours) || durationHours <= 0) { toast.error('Revisá ayudantes y duración'); return; }
    if (longDistance && (!manualPrice || manualPrice <= 0)) { toast.error('Ingresá el precio final de larga distancia'); return; }
    if (manualPriceText && (!manualPrice || manualPrice <= 0)) { toast.error('Precio inválido'); return; }
    const scheduledDate = String(data.get('date'));
    const scheduledTime = String(data.get('time'));
    const now = new Date().toISOString();
    setSaving(true);
    try {
      await createJob({ id: uuidv4(), clientName: String(data.get('clientName')).trim(), clientPhone: String(data.get('phone') || '').trim() || undefined, description: String(data.get('description') || '').trim() || undefined, pickup, dropoff, extraStops, helpersCount, estimatedDurationMinutes: Math.round(durationHours * 60), manualPrice, isLongDistance: longDistance, scheduledDate, scheduledTime, scheduledAt: getScheduledAtMs(scheduledDate, scheduledTime) ?? undefined, driverId: String(data.get('driverId') || '') || undefined, vehicleId: String(data.get('vehicleId') || '') || undefined, status: 'PENDING', flags: { nearPickupSent: false, arrivedPickupSent: false, nearDropoffSent: false, arrivedDropoffSent: false }, timestamps: {}, createdAt: now, updatedAt: now });
      await onSaved();
      toast.success('Flete creado');
      onClose();
    } catch { toast.error('No se pudo crear el flete'); }
    finally { setSaving(false); }
  };
  return <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="v2-drawer" role="dialog" aria-modal="true" aria-label="Nuevo flete"><div className="v2-drawer-head"><div><p className="v2-kicker">CARGA RÁPIDA</p><h2>Nuevo flete</h2><span>Completá los datos necesarios para agendarlo.</span></div><button type="button" className="v2-icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>
    <form onSubmit={submit} className="v2-drawer-form"><div className="v2-drawer-body"><div className="v2-detail-section"><h3>Cliente</h3><label className="v2-field">Nombre<input name="clientName" required placeholder="Nombre del cliente" /></label><label className="v2-field">Teléfono<input name="phone" type="tel" placeholder="WhatsApp o teléfono" /></label><label className="v2-field">Descripción<textarea name="description" rows={2} placeholder="¿Qué se transporta?" /></label></div>
      <div className="v2-detail-section"><h3>Agenda</h3><div className="v2-form-grid"><label className="v2-field">Fecha<input name="date" type="date" required defaultValue={dateKey(new Date())} /></label><label className="v2-field">Hora<input name="time" type="time" required /></label></div><div className="v2-form-grid"><label className="v2-field">Duración estimada · horas<input name="durationHours" type="number" min="0.5" step="0.5" defaultValue="1" required /></label><label className="v2-field">Ayudantes<input name="helpersCount" type="number" min="0" step="1" defaultValue="0" /></label></div></div>
      <div className="v2-detail-section"><h3>Recorrido</h3><div className="v2-address"><AddressAutocomplete label="Origen" placeholder="Buscar dirección de origen" selected={pickup} onSelect={setPickup} /></div><div className="v2-address"><AddressAutocomplete label="Destino" placeholder="Buscar dirección de destino" selected={dropoff} onSelect={setDropoff} /></div>{extraStops.map((stop, index) => <div className="v2-stop-row" key={`${index}-${stop.address}`}><span>{index + 1}. {stop.address}</span><button type="button" onClick={() => setExtraStops((current) => current.filter((_, position) => position !== index))} aria-label={`Quitar parada ${index + 1}`}><Trash2 size={16} /></button></div>)}<div className="v2-address"><AddressAutocomplete key={extraStops.length} label="Parada extra" placeholder="Buscar parada" selected={stopDraft} onSelect={setStopDraft} /></div><button type="button" className="v2-secondary" disabled={!stopDraft} onClick={() => { if (stopDraft) { setExtraStops((current) => [...current, stopDraft]); setStopDraft(null); } }}>Agregar parada</button></div>
      <div className="v2-detail-section"><h3>Asignación y precio</h3><div className="v2-form-grid"><label className="v2-field">Conductor<select name="driverId"><option value="">Sin asignar</option>{drivers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="v2-field">Vehículo<select name="vehicleId"><option value="">Sin vehículo</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label className="v2-check"><input type="checkbox" checked={longDistance} onChange={(event) => setLongDistance(event.target.checked)} /> Larga distancia</label><label className="v2-field">{longDistance ? 'Precio final al cliente · obligatorio' : 'Precio manual · opcional'}<input name="manualPrice" type="number" min="1" step="1" required={longDistance} placeholder="$" /></label></div>
    </div><div className="v2-drawer-footer"><button type="button" className="v2-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="v2-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear flete'}</button></div></form>
  </section></div>;
}
