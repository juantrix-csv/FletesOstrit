import { useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, X } from 'lucide-react';
import { createLead, deleteLead, updateLead } from '../lib/api';
import { dateKey } from '../lib/adminV2';
import type { Lead, LeadJobType, LeadLossReason, LeadRequestedSlot } from '../lib/types';

type Props = { leads: Lead[]; loading: boolean; refreshLeads: () => Promise<unknown>; isOwner: boolean };
const reasons: Record<LeadLossReason, string> = { NO_AVAILABILITY: 'Sin disponibilidad', OUT_OF_AREA: 'Zona lejana', NO_RESPONSE: 'No respondió', PRICE: 'Precio', HIRED_OTHER: 'Contrató a otro', NOT_OUR_SERVICE: 'No era nuestro servicio', OTHER: 'Otro' };
const slots: Record<LeadRequestedSlot, string> = { NOW: 'Ahora', TODAY: 'Hoy', TOMORROW: 'Mañana', THIS_WEEK: 'Esta semana', UNSPECIFIED: 'Sin definir' };
const kinds: Record<LeadJobType, string> = { FLETE_SIMPLE: 'Flete simple', MUDANZA: 'Mudanza', CON_AYUDANTE: 'Con ayudante', RETIRO_ENTREGA: 'Retiro y entrega', UNSPECIFIED: 'Sin definir' };

export default function AdminLeadsV2({ leads, loading, refreshLeads, isOwner }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<LeadLossReason | ''>('');
  const [saving, setSaving] = useState(false);
  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const visible = useMemo(() => leads.filter((lead) => (!reasonFilter || lead.lossReason === reasonFilter) && (!search || [lead.clientName, lead.clientPhone, lead.notes, reasons[lead.lossReason ?? 'OTHER']].some((value) => value?.toLowerCase().includes(search.toLowerCase())))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [leads, reasonFilter, search]);
  const topReason = Object.entries(reasons).map(([key, label]) => ({ label, count: leads.filter((lead) => lead.lossReason === key).length })).sort((a, b) => b.count - a.count)[0];
  const monthKey = dateKey(new Date()).slice(0, 7);
  const thisMonth = leads.filter((lead) => lead.createdAt.slice(0, 7) === monthKey).length;

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const now = new Date().toISOString(); setSaving(true);
    try { await createLead({ id: crypto.randomUUID(), clientName: String(data.get('clientName') || '').trim(), clientPhone: String(data.get('clientPhone') || '').trim() || null, requestedSlot: String(data.get('slot')) as LeadRequestedSlot, jobType: String(data.get('kind')) as LeadJobType, originZone: 'UNSPECIFIED', destinationZone: 'UNSPECIFIED', status: 'LOST', lossReason: String(data.get('reason')) as LeadLossReason, notes: String(data.get('notes') || '').trim() || null, history: [], createdAt: now, updatedAt: now, closedAt: now }); await refreshLeads(); setShowCreate(false); toast.success('Consulta registrada'); }
    catch { toast.error('No se pudo guardar la consulta'); } finally { setSaving(false); }
  };
  const update = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return; const data = new FormData(event.currentTarget); setSaving(true);
    try { const clientName = String(data.get('clientName') || '').trim(); await updateLead(selected.id, { ...(clientName ? { clientName } : {}), clientPhone: String(data.get('clientPhone') || '').trim() || null, lossReason: String(data.get('reason')) as LeadLossReason, requestedSlot: String(data.get('slot')) as LeadRequestedSlot, jobType: String(data.get('kind')) as LeadJobType, notes: String(data.get('notes') || '').trim() || null }); await refreshLeads(); setSelectedId(null); toast.success('Consulta actualizada'); }
    catch { toast.error('No se pudo actualizar'); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!selected || !isOwner || !window.confirm('¿Restar esta consulta de las pérdidas?')) return;
    try { await deleteLead(selected.id); await refreshLeads(); setSelectedId(null); toast.success('Consulta restada'); }
    catch { toast.error('No se pudo restar la consulta'); }
  };

  return <div className="v2-stack"><div className="v2-summary-grid"><div className="v2-stat"><p>Consultas perdidas</p><strong>{leads.length}</strong><small>Registros totales</small></div><div className="v2-stat"><p>Motivo principal</p><strong className="v2-stat-text">{topReason?.count ? topReason.label : 'Sin datos'}</strong><small>{topReason?.count || 0} casos</small></div><div className="v2-stat"><p>Este mes</p><strong>{thisMonth}</strong><small>Consultas registradas como perdidas</small></div></div>
    <div className="v2-panel"><div className="v2-panel-head"><div><p className="v2-kicker">WHATSAPP</p><h2>Consultas perdidas</h2><span>Registrá el motivo y detectá patrones de demanda.</span></div><button type="button" className="v2-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Registrar pérdida</button></div><div className="v2-toolbar"><label className="v2-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar consulta" aria-label="Buscar consultas" /></label><select className="v2-select" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value as LeadLossReason | '')} aria-label="Filtrar por motivo"><option value="">Todos los motivos</option>{Object.entries(reasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>{loading ? <div className="v2-empty">Cargando consultas…</div> : visible.length === 0 ? <div className="v2-empty">No hay consultas para este filtro.</div> : <div className="v2-lead-list">{visible.map((lead) => <button type="button" className="v2-lead-row" key={lead.id} onClick={() => setSelectedId(lead.id)}><div><strong>{lead.clientName || reasons[lead.lossReason ?? 'OTHER']}</strong><p>{lead.clientName ? reasons[lead.lossReason ?? 'OTHER'] : (lead.notes || 'Sin detalle adicional')}</p></div><span>{slots[lead.requestedSlot ?? 'UNSPECIFIED']}</span><small>{new Date(lead.createdAt).toLocaleDateString('es-AR')}</small></button>)}</div>}</div>
    {showCreate && <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="v2-modal" role="dialog" aria-modal="true" aria-label="Registrar consulta perdida"><div className="v2-panel-head"><div><p className="v2-kicker">NUEVO REGISTRO</p><h2>Consulta perdida</h2></div><button type="button" className="v2-icon-button" onClick={() => setShowCreate(false)} aria-label="Cerrar"><X size={19} /></button></div><LeadForm onSubmit={create} saving={saving} /></section></div>}
    {selected && <div className="v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><section className="v2-drawer" role="dialog" aria-modal="true" aria-label="Detalle de consulta"><div className="v2-drawer-head"><div><p className="v2-kicker">CONSULTA PERDIDA</p><h2>{selected.clientName || reasons[selected.lossReason ?? 'OTHER']}</h2><span>{new Date(selected.createdAt).toLocaleString('es-AR')}</span></div><button type="button" className="v2-icon-button" onClick={() => setSelectedId(null)} aria-label="Cerrar"><X size={20} /></button></div><div className="v2-drawer-body"><LeadForm key={selected.id} lead={selected} onSubmit={update} saving={saving} />{isOwner && <button type="button" className="v2-text-danger" onClick={remove}>Restar de pérdidas si se concretó el flete</button>}{selected.history.length > 0 && <div className="v2-detail-section"><h3>Historial</h3>{[...selected.history].reverse().map((item) => <p className="v2-history" key={item.id}><strong>{item.message}</strong><small>{new Date(item.createdAt).toLocaleString('es-AR')}</small></p>)}</div>}</div></section></div>}
  </div>;
}

function LeadForm({ lead, onSubmit, saving }: { lead?: Lead; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  return <form className="v2-form" onSubmit={onSubmit}><label className="v2-field">Nombre · opcional<input name="clientName" defaultValue={lead?.clientName ?? ''} placeholder="Cliente" /></label><label className="v2-field">Teléfono · opcional<input name="clientPhone" type="tel" defaultValue={lead?.clientPhone ?? ''} /></label><div className="v2-form-grid"><label className="v2-field">Franja pedida<select name="slot" defaultValue={lead?.requestedSlot ?? 'UNSPECIFIED'}>{Object.entries(slots).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="v2-field">Tipo de trabajo<select name="kind" defaultValue={lead?.jobType ?? 'UNSPECIFIED'}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label className="v2-field">Motivo<select name="reason" defaultValue={lead?.lossReason ?? ''} required><option value="" disabled>Elegir motivo</option>{Object.entries(reasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="v2-field">Notas<textarea name="notes" rows={3} defaultValue={lead?.notes ?? ''} placeholder="Contexto útil para revisar después" /></label><button type="submit" className="v2-primary" disabled={saving}>{saving ? 'Guardando…' : lead ? 'Guardar cambios' : 'Registrar consulta'}</button></form>;
}
