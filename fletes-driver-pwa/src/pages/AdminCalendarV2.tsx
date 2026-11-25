import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Plus, Trash2, UserRound } from 'lucide-react';
import { createDriverUnavailability, deleteDriverUnavailability, driverUnavailabilityListQueryKey, getDriverVehicleDriverShare, getHelperHourlyRate, getHourlyRate, getOwnerVehicleDriverShare, getTripCostPerHour, getTripCostPerKm, listDriverUnavailability } from '../lib/api';
import { dateKey, driverName, jobCalendarAmount, jobCalendarNet, jobDay, jobTime, money, shiftDate, statusLabel, statusTone, type CalendarCostSettings } from '../lib/adminV2';
import type { Driver, DriverUnavailability, Job, Vehicle } from '../lib/types';
import { useCachedQuery } from '../hooks/useCachedQuery';

type Props = { jobs: Job[]; drivers: Driver[]; vehicles: Vehicle[]; loading: boolean; refreshJobs: () => Promise<unknown>; isOwner: boolean };
const weekStart = (date: Date) => { const result = new Date(date.getFullYear(), date.getMonth(), date.getDate()); result.setDate(result.getDate() - (result.getDay() + 6) % 7); return result; };
const labelDay = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const labelMonth = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

export default function AdminCalendarV2({ jobs, drivers, vehicles, loading, isOwner }: Props) {
  const [anchor, setAnchor] = useState(() => dateKey(new Date()));
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [showAvailability, setShowAvailability] = useState(false);
  const [saving, setSaving] = useState(false);
  const [costs, setCosts] = useState<CalendarCostSettings | null>(null);
  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    Promise.all([
      getHourlyRate().then((data) => data.hourlyRate).catch(() => null),
      getHelperHourlyRate().then((data) => data.hourlyRate).catch(() => null),
      getTripCostPerHour().then((data) => data.value).catch(() => null),
      getTripCostPerKm().then((data) => data.value).catch(() => null),
      getOwnerVehicleDriverShare().then((data) => data.value).catch(() => null),
      getDriverVehicleDriverShare().then((data) => data.value).catch(() => null),
    ]).then(([hourlyRate, helperHourlyRate, tripCostPerHour, tripCostPerKm, ownerVehicleDriverShare, driverVehicleDriverShare]) => {
      if (active) setCosts({ hourlyRate, helperHourlyRate, tripCostPerHour, tripCostPerKm, ownerVehicleDriverShare, driverVehicleDriverShare });
    });
    return () => { active = false; };
  }, [isOwner]);
  const unavailability = useCachedQuery<DriverUnavailability[]>({ key: driverUnavailabilityListQueryKey(), loader: () => listDriverUnavailability(), staleMs: 30000 });
  const anchorDate = new Date(`${anchor}T12:00:00`);
  const start = view === 'day' ? anchorDate : weekStart(view === 'month' ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1) : anchorDate);
  const days = Array.from({ length: view === 'month' ? 42 : view === 'day' ? 1 : 7 }, (_, index) => shiftDate(dateKey(start), index));
  const today = dateKey(new Date());
  const jobsByDay = useMemo(() => new Map(days.map((day) => [day, jobs.filter((job) => jobDay(job) === day).sort((a, b) => jobTime(a).localeCompare(jobTime(b)))])), [days.join(','), jobs]);
  const periodJobs = days.filter((day) => view !== 'month' || day.startsWith(anchor.slice(0, 7))).flatMap((day) => jobsByDay.get(day) ?? []);
  const periodNet = costs ? periodJobs.reduce((total, job) => total + (jobCalendarNet(job, drivers, vehicles, costs) ?? 0), 0) : null;
  const periodMissing = costs ? periodJobs.filter((job) => jobCalendarNet(job, drivers, vehicles, costs) == null).length : periodJobs.length;
  const move = (delta: number) => {
    if (view === 'month') { const next = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + delta, 1); setAnchor(dateKey(next)); }
    else setAnchor(shiftDate(anchor, delta * (view === 'week' ? 7 : 1)));
  };
  const rangeLabel = view === 'day'
    ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(anchorDate)
    : view === 'month'
      ? labelMonth.format(anchorDate)
      : `${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(`${days[6]}T12:00:00`))}`;

  const addUnavailable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const slot = { driverId: String(data.get('driverId')), date: String(data.get('date')), startTime: String(data.get('startTime')), endTime: String(data.get('endTime')) };
    if (!slot.driverId || slot.endTime <= slot.startTime) { toast.error('Revisá conductor y horario'); return; }
    setSaving(true);
    try { await createDriverUnavailability(slot); await unavailability.reload(); toast.success('Horario bloqueado'); setShowAvailability(false); }
    catch { toast.error('No se pudo bloquear el horario'); }
    finally { setSaving(false); }
  };
  const removeUnavailable = async (id: string) => {
    try { await deleteDriverUnavailability(id); await unavailability.reload(); toast.success('Bloqueo eliminado'); }
    catch { toast.error('No se pudo eliminar el bloqueo'); }
  };

  return <div className="v2-stack">
    <div className="v2-calendar-summary"><div><p className="v2-kicker">AGENDA DE FLETES</p><h2>{view === 'day' ? rangeLabel : labelMonth.format(anchorDate)}</h2><span>{periodJobs.length} fletes agendados · {periodJobs.filter((job) => job.status === 'DONE').length} finalizados</span></div>{isOwner && <div className="v2-calendar-amount"><small>Neto estimado{periodMissing ? ` · ${periodMissing} sin estimar` : ''}</small><strong>{periodNet == null ? 'Calculando...' : money.format(periodNet)}</strong></div>}</div>
    <div className="v2-panel"><div className="v2-panel-head v2-calendar-toolbar"><div className="v2-calendar-nav"><button type="button" className="v2-icon-button" onClick={() => move(-1)} aria-label="Período anterior"><ChevronLeft size={19} /></button><strong>{rangeLabel}</strong><button type="button" className="v2-icon-button" onClick={() => move(1)} aria-label="Período siguiente"><ChevronRight size={19} /></button><button type="button" className="v2-secondary" onClick={() => setAnchor(today)}>Hoy</button></div><div className="v2-calendar-actions"><div className="v2-segments" role="group" aria-label="Vista de calendario">{([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const).map(([value, label]) => <button key={value} type="button" className={view === value ? 'is-active' : ''} onClick={() => setView(value)}>{label}</button>)}</div><button type="button" className="v2-secondary" onClick={() => setShowAvailability(true)}><Plus size={16} /> Bloquear horario</button></div></div>
      <div className="v2-week-scroll"><div className={`v2-week-grid v2-week-grid--${view}`}>{days.map((day) => { const dayJobs = jobsByDay.get(day) ?? []; const dayAmount = costs ? dayJobs.reduce((total, job) => total + (jobCalendarNet(job, drivers, vehicles, costs) ?? 0), 0) : null; const missing = costs ? dayJobs.filter((job) => jobCalendarNet(job, drivers, vehicles, costs) == null).length : dayJobs.length; const slots = (unavailability.data ?? []).filter((slot) => slot.date === day); return <section key={day} className={`v2-day ${day === today ? 'is-today' : ''} ${view === 'month' && !day.startsWith(anchor.slice(0, 7)) ? 'is-outside' : ''}`}><div className="v2-day-head"><span>{labelDay.format(new Date(`${day}T12:00:00`))}</span><strong>{Number(day.slice(-2))}</strong>{isOwner && <small>{dayAmount == null ? 'Calculando...' : money.format(dayAmount)} {missing ? `· ${missing} sin estimar` : 'estimado'}</small>}</div><div className="v2-day-body">{loading ? <p className="v2-day-empty">Cargando…</p> : dayJobs.length === 0 && slots.length === 0 ? <p className="v2-day-empty">Sin fletes</p> : null}{dayJobs.map((job) => <Link key={job.id} to={`/admin?tab=jobs&job=${job.id}`} className={`v2-calendar-job v2-calendar-job--${statusTone[job.status]}`}><span>{jobTime(job)} · {statusLabel[job.status]}</span><strong>{job.clientName}</strong><small>{driverName(job, drivers)}</small><em><UserRound size={12} /> {job.helpersCount ?? 0}{isOwner && <> · {jobCalendarAmount(job, drivers, vehicles, costs ?? undefined) != null ? money.format(jobCalendarAmount(job, drivers, vehicles, costs ?? undefined)!) : 'Sin estimar'}</>}</em></Link>)}{slots.map((slot) => <div className="v2-calendar-block" key={slot.id}><span>No disponible</span><strong>{drivers.find((driver) => driver.id === slot.driverId)?.name || 'Chofer'}</strong><small>{slot.startTime}–{slot.endTime}</small><button type="button" onClick={() => removeUnavailable(slot.id)} aria-label="Eliminar bloqueo"><Trash2 size={14} /></button></div>)}</div></section>; })}</div></div>
    </div>
    {showAvailability && <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAvailability(false); }}><section className="v2-modal" role="dialog" aria-modal="true" aria-label="Bloquear horario"><div className="v2-panel-head"><div><p className="v2-kicker">DISPONIBILIDAD</p><h2>Bloquear horario</h2></div><button type="button" className="v2-icon-button" onClick={() => setShowAvailability(false)} aria-label="Cerrar">×</button></div><form onSubmit={addUnavailable} className="v2-form"><label className="v2-field">Conductor<select name="driverId" required><option value="">Elegir conductor</option>{drivers.filter((driver) => driver.active).map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label><label className="v2-field">Fecha<input name="date" type="date" required defaultValue={today} /></label><div className="v2-form-grid"><label className="v2-field">Desde<input name="startTime" type="time" required /></label><label className="v2-field">Hasta<input name="endTime" type="time" required /></label></div><button type="submit" className="v2-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar bloqueo'}</button></form></section></div>}
  </div>;
}
