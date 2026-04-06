import { type FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { createLead, deleteLead, leadsListQueryKey, listLeads, updateLead } from '../lib/api';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { cn } from '../lib/utils';
import type { Lead, LeadLossReason, LeadStatus } from '../lib/types';

const statusOptions: Array<{ value: LeadStatus; label: string }> = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'QUOTED', label: 'Cotizado' },
  { value: 'WON', label: 'Ganado' },
  { value: 'LOST', label: 'Perdido' },
];

const lossReasonOptions: Array<{ value: LeadLossReason; label: string }> = [
  { value: 'NO_AVAILABILITY', label: 'Sin disponibilidad' },
  { value: 'OUT_OF_AREA', label: 'Zona de trabajo lejana' },
  { value: 'NO_RESPONSE', label: 'Cliente dejo de responder' },
  { value: 'PRICE', label: 'Precio' },
  { value: 'HIRED_OTHER', label: 'Contrato a otro' },
  { value: 'NOT_OUR_SERVICE', label: 'No era nuestro servicio' },
  { value: 'OTHER', label: 'Otro' },
];

const statusLabels: Record<LeadStatus, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUOTED: 'Cotizado',
  WON: 'Ganado',
  LOST: 'Perdido',
};

const lossReasonLabels: Record<LeadLossReason, string> = {
  NO_AVAILABILITY: 'Sin disponibilidad',
  OUT_OF_AREA: 'Zona de trabajo lejana',
  NO_RESPONSE: 'Cliente dejo de responder',
  PRICE: 'Precio',
  HIRED_OTHER: 'Contrato a otro',
  NOT_OUR_SERVICE: 'No era nuestro servicio',
  OTHER: 'Otro',
};

const emptyLeadForm = {
  clientName: '',
  clientPhone: '',
  description: '',
  requestedDate: '',
  requestedTime: '',
  originZone: '',
  destinationZone: '',
  status: 'NEW' as LeadStatus,
  lossReason: '' as '' | LeadLossReason,
  notes: '',
};

type LeadFormState = typeof emptyLeadForm;

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const compactDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const normalizeOptionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const leadToForm = (lead: Lead): LeadFormState => ({
  clientName: lead.clientName ?? '',
  clientPhone: lead.clientPhone ?? '',
  description: lead.description ?? '',
  requestedDate: lead.requestedDate ?? '',
  requestedTime: lead.requestedTime ?? '',
  originZone: lead.originZone ?? '',
  destinationZone: lead.destinationZone ?? '',
  status: lead.status,
  lossReason: lead.lossReason ?? '',
  notes: lead.notes ?? '',
});

const getStatusBadgeClassName = (status: LeadStatus) => {
  if (status === 'WON') return 'bg-emerald-100 text-emerald-700';
  if (status === 'LOST') return 'bg-rose-100 text-rose-700';
  if (status === 'QUOTED') return 'bg-violet-100 text-violet-700';
  if (status === 'CONTACTED') return 'bg-sky-100 text-sky-700';
  return 'bg-amber-100 text-amber-700';
};

const formatRequestedSlot = (lead: Lead) => {
  if (!lead.requestedDate) return 'Sin fecha';
  if (!lead.requestedTime) return compactDateFormatter.format(new Date(`${lead.requestedDate}T00:00:00`));
  const date = new Date(`${lead.requestedDate}T${lead.requestedTime}:00`);
  if (Number.isNaN(date.getTime())) return `${lead.requestedDate} ${lead.requestedTime}`;
  return dateTimeFormatter.format(date);
};

const formatHistoryTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
};

const filterLeadText = (lead: Lead) => [
  lead.clientName,
  lead.clientPhone,
  lead.description,
  lead.originZone,
  lead.destinationZone,
  lead.notes,
  lead.lossReason ? lossReasonLabels[lead.lossReason] : null,
]
  .filter(Boolean)
  .join(' ')
  .toLowerCase();

const LeadMetricCard = ({
  label,
  value,
  tone,
  helper,
}: {
  label: string;
  value: string;
  tone: string;
  helper?: string;
}) => (
  <div className={cn('rounded-2xl border p-4 shadow-sm', tone)}>
    <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
    {helper ? <p className="mt-1 text-sm opacity-80">{helper}</p> : null}
  </div>
);

export function AdminLeads({ canDelete = false }: { canDelete?: boolean }) {
  const leadsQuery = useCachedQuery<Lead[]>({
    key: leadsListQueryKey(),
    loader: () => listLeads(),
    onError: () => {
      toast.error('No se pudieron cargar los leads');
    },
  });
  const leads = leadsQuery.data ?? [];
  const [createDraft, setCreateDraft] = useState<LeadFormState>(emptyLeadForm);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LeadFormState | null>(null);
  const [followUpNote, setFollowUpNote] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LeadStatus>('ALL');
  const [lossReasonFilter, setLossReasonFilter] = useState<'ALL' | LeadLossReason | 'NONE'>('ALL');

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  useEffect(() => {
    if (leads.length === 0) {
      setSelectedLeadId(null);
      return;
    }
    if (!selectedLeadId || !leads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(leads[0].id);
    }
  }, [leads, selectedLeadId]);

  useEffect(() => {
    if (!selectedLead) {
      setEditDraft(null);
      setFollowUpNote('');
      return;
    }
    setEditDraft(leadToForm(selectedLead));
    setFollowUpNote('');
  }, [selectedLead]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== 'ALL' && lead.status !== statusFilter) return false;
      if (lossReasonFilter === 'NONE' && lead.lossReason != null) return false;
      if (lossReasonFilter !== 'ALL' && lossReasonFilter !== 'NONE' && lead.lossReason !== lossReasonFilter) return false;
      if (!normalizedSearch) return true;
      return filterLeadText(lead).includes(normalizedSearch);
    });
  }, [leads, lossReasonFilter, search, statusFilter]);

  const summary = useMemo(() => {
    const won = leads.filter((lead) => lead.status === 'WON').length;
    const lostLeads = leads.filter((lead) => lead.status === 'LOST');
    const lost = lostLeads.length;
    const active = leads.filter((lead) => lead.status === 'NEW' || lead.status === 'CONTACTED' || lead.status === 'QUOTED').length;
    const closed = won + lost;
    const conversionRate = closed > 0 ? won / closed : 0;
    const reasonCounts = lossReasonOptions
      .map((option) => ({
        ...option,
        count: lostLeads.filter((lead) => lead.lossReason === option.value).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    return {
      total: leads.length,
      won,
      lost,
      active,
      closed,
      conversionRate,
      reasonCounts,
    };
  }, [leads]);

  const createLeadRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createDraft.clientName.trim()) {
      toast.error('Nombre del cliente requerido');
      return;
    }
    if (createDraft.status === 'LOST' && !createDraft.lossReason) {
      toast.error('Selecciona un motivo de perdida');
      return;
    }

    setSavingCreate(true);
    try {
      await createLead({
        id: crypto.randomUUID(),
        clientName: createDraft.clientName.trim(),
        clientPhone: normalizeOptionalText(createDraft.clientPhone),
        description: normalizeOptionalText(createDraft.description),
        requestedDate: normalizeOptionalText(createDraft.requestedDate),
        requestedTime: normalizeOptionalText(createDraft.requestedTime),
        originZone: normalizeOptionalText(createDraft.originZone),
        destinationZone: normalizeOptionalText(createDraft.destinationZone),
        status: createDraft.status,
        lossReason: createDraft.status === 'LOST' && createDraft.lossReason ? createDraft.lossReason : null,
        notes: normalizeOptionalText(createDraft.notes),
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: createDraft.status === 'WON' || createDraft.status === 'LOST' ? new Date().toISOString() : null,
      });
      setCreateDraft(emptyLeadForm);
      toast.success('Lead creado');
      void leadsQuery.reload();
    } catch {
      toast.error('No se pudo crear el lead');
    } finally {
      setSavingCreate(false);
    }
  };

  const saveLeadChanges = async () => {
    if (!selectedLead || !editDraft) return;
    if (!editDraft.clientName.trim()) {
      toast.error('Nombre del cliente requerido');
      return;
    }
    if (editDraft.status === 'LOST' && !editDraft.lossReason) {
      toast.error('Selecciona un motivo de perdida');
      return;
    }
    const hasChanges = JSON.stringify(leadToForm(selectedLead)) !== JSON.stringify(editDraft)
      || followUpNote.trim().length > 0;
    if (!hasChanges) {
      toast.error('No hay cambios para guardar');
      return;
    }

    setSavingEdit(true);
    try {
      await updateLead(selectedLead.id, {
        clientName: editDraft.clientName.trim(),
        clientPhone: normalizeOptionalText(editDraft.clientPhone),
        description: normalizeOptionalText(editDraft.description),
        requestedDate: normalizeOptionalText(editDraft.requestedDate),
        requestedTime: normalizeOptionalText(editDraft.requestedTime),
        originZone: normalizeOptionalText(editDraft.originZone),
        destinationZone: normalizeOptionalText(editDraft.destinationZone),
        status: editDraft.status,
        lossReason: editDraft.status === 'LOST' && editDraft.lossReason ? editDraft.lossReason : null,
        notes: normalizeOptionalText(editDraft.notes),
        historyNote: normalizeOptionalText(followUpNote),
      });
      toast.success('Lead actualizado');
      setFollowUpNote('');
    } catch {
      toast.error('No se pudo actualizar el lead');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeLeadRecord = async () => {
    if (!selectedLead) return;
    if (!window.confirm(`Eliminar el lead de ${selectedLead.clientName}?`)) return;
    try {
      await deleteLead(selectedLead.id);
      toast.success('Lead eliminado');
      void leadsQuery.reload();
    } catch {
      toast.error('No se pudo eliminar el lead');
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LeadMetricCard
          label="Leads totales"
          value={String(summary.total)}
          tone="border-slate-200 bg-white text-slate-900"
          helper={`${summary.active} activos`}
        />
        <LeadMetricCard
          label="Ganados"
          value={String(summary.won)}
          tone="border-emerald-200 bg-emerald-50 text-emerald-800"
          helper={summary.closed > 0 ? `${Math.round(summary.conversionRate * 100)}% de cierres` : 'Sin cierres aun'}
        />
        <LeadMetricCard
          label="Perdidos"
          value={String(summary.lost)}
          tone="border-rose-200 bg-rose-50 text-rose-800"
          helper={summary.reasonCounts[0] ? `Principal: ${summary.reasonCounts[0].label}` : 'Sin motivos cargados'}
        />
        <LeadMetricCard
          label="Activos"
          value={String(summary.active)}
          tone="border-sky-200 bg-sky-50 text-sky-800"
          helper={filteredLeads.length === leads.length ? 'Vista completa' : `${filteredLeads.length} visibles con filtro`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <form onSubmit={createLeadRecord} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nuevo lead</h2>
                <p className="text-sm text-slate-500">Carga el contacto y deja marcada la situacion inicial.</p>
              </div>
              {savingCreate ? <span className="text-xs font-semibold text-blue-600">Guardando...</span> : null}
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-500">
                Cliente
                <input
                  value={createDraft.clientName}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, clientName: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  placeholder="Nombre del cliente"
                  required
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Telefono
                <input
                  value={createDraft.clientPhone}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, clientPhone: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  placeholder="WhatsApp o telefono"
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Descripcion
                <textarea
                  value={createDraft.description}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  rows={3}
                  placeholder="Que necesitaba el cliente"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-500">
                  Fecha pedida
                  <input
                    type="date"
                    value={createDraft.requestedDate}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, requestedDate: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  Hora pedida
                  <input
                    type="time"
                    value={createDraft.requestedTime}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, requestedTime: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-500">
                  Zona origen
                  <input
                    value={createDraft.originZone}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, originZone: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    placeholder="Ej. Palermo"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  Zona destino
                  <input
                    value={createDraft.destinationZone}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, destinationZone: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    placeholder="Ej. Pilar"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-500">
                  Estado
                  <select
                    value={createDraft.status}
                    onChange={(event) => {
                      const value = event.target.value as LeadStatus;
                      setCreateDraft((current) => ({
                        ...current,
                        status: value,
                        lossReason: value === 'LOST' ? current.lossReason : '',
                      }));
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  Motivo
                  <select
                    value={createDraft.lossReason}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, lossReason: event.target.value as '' | LeadLossReason }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                    disabled={createDraft.status !== 'LOST'}
                  >
                    <option value="">Sin motivo</option>
                    {lossReasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-500">
                Notas internas
                <textarea
                  value={createDraft.notes}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, notes: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  rows={3}
                  placeholder="Detalles utiles para el equipo"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingCreate}
              className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Crear lead
            </button>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Motivos de perdida</h3>
            <p className="mt-1 text-sm text-slate-500">Te muestra rapido donde se estan cayendo las oportunidades.</p>
            <div className="mt-4 space-y-3">
              {summary.reasonCounts.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                  Cuando marques leads como perdidos, aca vas a ver el desglose por motivo.
                </p>
              )}
              {summary.reasonCounts.map((reason) => (
                <div key={reason.value} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-800">{reason.label}</p>
                    <span className="text-sm font-semibold text-slate-900">{reason.count}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-rose-400"
                      style={{ width: `${summary.lost > 0 ? Math.max(8, (reason.count / summary.lost) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))]">
              <label className="block text-xs font-medium text-slate-500">
                Buscar
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  placeholder="Cliente, zona, nota o motivo"
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Estado
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'ALL' | LeadStatus)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="ALL">Todos</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Motivo de perdida
                <select
                  value={lossReasonFilter}
                  onChange={(event) => setLossReasonFilter(event.target.value as 'ALL' | LeadLossReason | 'NONE')}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="ALL">Todos</option>
                  <option value="NONE">Sin motivo</option>
                  {lossReasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-2 pb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Leads</h3>
                  <p className="text-sm text-slate-500">
                    {leadsQuery.loading ? 'Cargando...' : `${filteredLeads.length} resultados`}
                  </p>
                </div>
                {leadsQuery.refreshing ? <span className="text-xs font-semibold text-blue-600">Actualizando...</span> : null}
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {!leadsQuery.loading && filteredLeads.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No hay leads para los filtros elegidos.
                  </div>
                )}
                {filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={cn(
                      'w-full rounded-2xl border px-4 py-3 text-left transition',
                      selectedLeadId === lead.id
                        ? 'border-slate-900 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{lead.clientName}</p>
                        <p className={cn(
                          'mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold',
                          selectedLeadId === lead.id ? 'bg-white/15 text-white' : getStatusBadgeClassName(lead.status),
                        )}>
                          {statusLabels[lead.status]}
                        </p>
                      </div>
                      <span className={cn(
                        'text-xs',
                        selectedLeadId === lead.id ? 'text-slate-300' : 'text-slate-500',
                      )}>
                        {compactDateFormatter.format(new Date(lead.updatedAt))}
                      </span>
                    </div>
                    <p className={cn(
                      'mt-3 text-sm',
                      selectedLeadId === lead.id ? 'text-slate-300' : 'text-slate-600',
                    )}>
                      {lead.description || 'Sin descripcion'}
                    </p>
                    <div className={cn(
                      'mt-3 flex flex-wrap gap-2 text-xs',
                      selectedLeadId === lead.id ? 'text-slate-300' : 'text-slate-500',
                    )}>
                      <span>{formatRequestedSlot(lead)}</span>
                      {lead.originZone ? <span>Origen: {lead.originZone}</span> : null}
                      {lead.lossReason ? <span>{lossReasonLabels[lead.lossReason]}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {!selectedLead || !editDraft ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-200 text-sm text-slate-500">
                  Selecciona un lead para ver el detalle.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900">{selectedLead.clientName}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', getStatusBadgeClassName(selectedLead.status))}>
                          {statusLabels[selectedLead.status]}
                        </span>
                        {selectedLead.lossReason ? (
                          <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                            {lossReasonLabels[selectedLead.lossReason]}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">
                      <p>Creado: {formatHistoryTimestamp(selectedLead.createdAt)}</p>
                      <p>Actualizado: {formatHistoryTimestamp(selectedLead.updatedAt)}</p>
                    </div>
                  </div>

                  <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-500">
                          Cliente
                          <input
                            value={editDraft.clientName}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, clientName: event.target.value } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-500">
                          Telefono
                          <input
                            value={editDraft.clientPhone}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, clientPhone: event.target.value } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          />
                        </label>
                      </div>

                      <label className="block text-xs font-medium text-slate-500">
                        Descripcion
                        <textarea
                          value={editDraft.description}
                          onChange={(event) => setEditDraft((current) => current ? { ...current, description: event.target.value } : current)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          rows={3}
                        />
                      </label>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-500">
                          Fecha pedida
                          <input
                            type="date"
                            value={editDraft.requestedDate}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, requestedDate: event.target.value } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-500">
                          Hora pedida
                          <input
                            type="time"
                            value={editDraft.requestedTime}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, requestedTime: event.target.value } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-500">
                          Zona origen
                          <input
                            value={editDraft.originZone}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, originZone: event.target.value } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-500">
                          Zona destino
                          <input
                            value={editDraft.destinationZone}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, destinationZone: event.target.value } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-500">
                          Estado
                          <select
                            value={editDraft.status}
                            onChange={(event) => {
                              const value = event.target.value as LeadStatus;
                              setEditDraft((current) => current ? {
                                ...current,
                                status: value,
                                lossReason: value === 'LOST' ? current.lossReason : '',
                              } : current);
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          >
                            {statusOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-slate-500">
                          Motivo de perdida
                          <select
                            value={editDraft.lossReason}
                            onChange={(event) => setEditDraft((current) => current ? { ...current, lossReason: event.target.value as '' | LeadLossReason } : current)}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                            disabled={editDraft.status !== 'LOST'}
                          >
                            <option value="">Sin motivo</option>
                            {lossReasonOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="block text-xs font-medium text-slate-500">
                        Notas internas
                        <textarea
                          value={editDraft.notes}
                          onChange={(event) => setEditDraft((current) => current ? { ...current, notes: event.target.value } : current)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          rows={4}
                        />
                      </label>

                      <label className="block text-xs font-medium text-slate-500">
                        Nuevo seguimiento
                        <textarea
                          value={followUpNote}
                          onChange={(event) => setFollowUpNote(event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          rows={3}
                          placeholder="Ej. se hablo por WhatsApp, pidio retomar manana"
                        />
                      </label>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={saveLeadChanges}
                          disabled={savingEdit}
                          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={removeLeadRecord}
                            className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-semibold text-slate-900">Resumen</h4>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          <p><span className="font-medium text-slate-900">Fecha solicitada:</span> {formatRequestedSlot(selectedLead)}</p>
                          <p><span className="font-medium text-slate-900">Origen:</span> {selectedLead.originZone || 'Sin dato'}</p>
                          <p><span className="font-medium text-slate-900">Destino:</span> {selectedLead.destinationZone || 'Sin dato'}</p>
                          <p><span className="font-medium text-slate-900">Telefono:</span> {selectedLead.clientPhone || 'Sin dato'}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-sm font-semibold text-slate-900">Historial</h4>
                          <span className="text-xs text-slate-500">{selectedLead.history.length} eventos</span>
                        </div>
                        <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                          {[...selectedLead.history].reverse().map((entry) => (
                            <div key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{entry.message}</p>
                                  <p className="mt-1 text-xs text-slate-500">{formatHistoryTimestamp(entry.createdAt)}</p>
                                </div>
                                <span className={cn('inline-flex rounded-full px-2 py-1 text-[11px] font-semibold', getStatusBadgeClassName(entry.status))}>
                                  {statusLabels[entry.status]}
                                </span>
                              </div>
                              {entry.note ? <p className="mt-3 text-sm text-slate-600">{entry.note}</p> : null}
                              {entry.lossReason ? (
                                <p className="mt-2 text-xs font-medium text-rose-700">
                                  Motivo: {lossReasonLabels[entry.lossReason]}
                                </p>
                              ) : null}
                            </div>
                          ))}
                          {selectedLead.history.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                              Todavia no hay eventos registrados para este lead.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdminLeads;
