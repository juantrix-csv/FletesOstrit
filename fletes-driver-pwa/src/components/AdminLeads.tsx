import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { createLead, deleteLead, leadsListQueryKey, listJobs, listLeads, updateLead } from '../lib/api';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { cn } from '../lib/utils';
import type { Job, Lead, LeadJobType, LeadLossReason, LeadRequestedSlot } from '../lib/types';

const requestedSlotOptions: Array<{ value: LeadRequestedSlot; label: string }> = [
  { value: 'NOW', label: 'Ahora' },
  { value: 'TODAY', label: 'Hoy' },
  { value: 'TOMORROW', label: 'Manana' },
  { value: 'THIS_WEEK', label: 'Esta semana' },
  { value: 'UNSPECIFIED', label: 'Sin definir' },
];

const jobTypeOptions: Array<{ value: LeadJobType; label: string }> = [
  { value: 'FLETE_SIMPLE', label: 'Flete simple' },
  { value: 'MUDANZA', label: 'Mudanza' },
  { value: 'CON_AYUDANTE', label: 'Con ayudante' },
  { value: 'RETIRO_ENTREGA', label: 'Retiro y entrega' },
  { value: 'UNSPECIFIED', label: 'Sin definir' },
];

const zoneOptions = [
  { value: 'UNSPECIFIED', label: 'Sin definir' },
  { value: 'LA_PLATA_CENTRO', label: 'La Plata centro' },
  { value: 'TOLOSA', label: 'Tolosa' },
  { value: 'RINGUELET', label: 'Ringuelet' },
  { value: 'GONNET', label: 'Gonnet' },
  { value: 'CITY_BELL', label: 'City Bell' },
  { value: 'VILLA_ELISA', label: 'Villa Elisa' },
  { value: 'LOS_HORNOS', label: 'Los Hornos' },
  { value: 'SAN_CARLOS', label: 'San Carlos' },
  { value: 'VILLA_ELVIRA', label: 'Villa Elvira' },
  { value: 'ALTOS_DE_SAN_LORENZO', label: 'Altos de San Lorenzo' },
  { value: 'ABASTO', label: 'Abasto' },
  { value: 'OLMOS', label: 'Olmos' },
  { value: 'MELCHOR_ROMERO', label: 'Melchor Romero' },
  { value: 'ARTURO_SEGUI', label: 'Arturo Segui' },
  { value: 'BERISSO', label: 'Berisso' },
  { value: 'ENSENADA', label: 'Ensenada' },
  { value: 'OTRA_ZONA', label: 'Otra zona' },
];

const lossReasonOptions: Array<{ value: LeadLossReason; label: string; tone: string }> = [
  { value: 'NO_AVAILABILITY', label: 'Sin disponibilidad', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { value: 'OUT_OF_AREA', label: 'Zona lejana', tone: 'border-rose-200 bg-rose-50 text-rose-800' },
  { value: 'NO_RESPONSE', label: 'No respondio', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  { value: 'PRICE', label: 'Precio', tone: 'border-violet-200 bg-violet-50 text-violet-800' },
  { value: 'HIRED_OTHER', label: 'Contrato a otro', tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800' },
  { value: 'NOT_OUR_SERVICE', label: 'No era nuestro servicio', tone: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  { value: 'OTHER', label: 'Otro', tone: 'border-gray-200 bg-gray-50 text-gray-700' },
];

const periodOptions = [
  { value: '7D', label: '7 dias' },
  { value: '30D', label: '30 dias' },
  { value: '90D', label: '90 dias' },
  { value: 'ALL', label: 'Todo' },
] as const;

type PeriodFilter = (typeof periodOptions)[number]['value'];

type LostSaleFormState = {
  requestedSlot: LeadRequestedSlot;
  originZone: string;
  destinationZone: string;
  jobType: LeadJobType;
};

const emptyLeadForm: LostSaleFormState = {
  requestedSlot: 'TODAY',
  originZone: 'UNSPECIFIED',
  destinationZone: 'UNSPECIFIED',
  jobType: 'UNSPECIFIED',
};

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const compactDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const optionLabelMap = <T extends string>(options: Array<{ value: T; label: string }>) =>
  Object.fromEntries(options.map((option) => [option.value, option.label])) as Record<T, string>;

const requestedSlotLabels = optionLabelMap(requestedSlotOptions);
const jobTypeLabels = optionLabelMap(jobTypeOptions);
const zoneLabels = optionLabelMap(zoneOptions);
const lossReasonLabels = Object.fromEntries(
  lossReasonOptions.map((option) => [option.value, option.label]),
) as Record<LeadLossReason, string>;

const leadToForm = (lead: Lead): LostSaleFormState => ({
  requestedSlot: lead.requestedSlot ?? 'UNSPECIFIED',
  originZone: lead.originZone ?? 'UNSPECIFIED',
  destinationZone: lead.destinationZone ?? 'UNSPECIFIED',
  jobType: lead.jobType ?? 'UNSPECIFIED',
});

const MetricCard = ({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone: string;
}) => (
  <div className={cn('rounded-2xl border p-4 shadow-sm', tone)}>
    <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
    {helper ? <p className="mt-1 text-sm opacity-80">{helper}</p> : null}
  </div>
);

const formatHistoryTimestamp = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTimeFormatter.format(parsed);
};

const formatLeadDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return compactDateFormatter.format(parsed);
};

const getPeriodStart = (period: PeriodFilter) => {
  if (period === 'ALL') return null;
  const now = new Date();
  const start = new Date(now);
  const days = period === '7D' ? 7 : period === '30D' ? 30 : 90;
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
};

const isWithinPeriod = (value: string | null | undefined, period: PeriodFilter) => {
  if (period === 'ALL') return true;
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  const start = getPeriodStart(period);
  return start == null ? true : parsed >= start;
};

const buildLossRouteLabel = (lead: Lead) => {
  const origin = zoneLabels[lead.originZone ?? 'UNSPECIFIED'] ?? 'Sin definir';
  const destination = zoneLabels[lead.destinationZone ?? 'UNSPECIFIED'] ?? 'Sin definir';
  return `${origin} -> ${destination}`;
};

const getTopBreakdown = (items: Array<{ label: string; count: number }>) => {
  const filtered = items.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  return filtered[0] ?? null;
};

export function AdminLeads({ canDelete = false }: { canDelete?: boolean }) {
  const leadsQuery = useCachedQuery<Lead[]>({
    key: leadsListQueryKey(),
    loader: () => listLeads(),
    onError: () => {
      toast.error('No se pudieron cargar las ventas perdidas');
    },
  });
  const jobsQuery = useCachedQuery<Job[]>({
    key: 'jobs:list:lost-sales-analytics',
    loader: () => listJobs(),
    staleMs: 120000,
    onError: () => {
      toast.error('No se pudieron cargar los fletes para analitica');
    },
  });

  const leads = leadsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const [createDraft, setCreateDraft] = useState<LostSaleFormState>(emptyLeadForm);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LostSaleFormState | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30D');
  const [lossReasonFilter, setLossReasonFilter] = useState<'ALL' | LeadLossReason>('ALL');
  const [slotFilter, setSlotFilter] = useState<'ALL' | LeadRequestedSlot>('ALL');
  const [jobTypeFilter, setJobTypeFilter] = useState<'ALL' | LeadJobType>('ALL');

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
      return;
    }
    setEditDraft(leadToForm(selectedLead));
  }, [selectedLead]);

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    if (!isWithinPeriod(lead.createdAt, periodFilter)) return false;
    if (lossReasonFilter !== 'ALL' && lead.lossReason !== lossReasonFilter) return false;
    if (slotFilter !== 'ALL' && (lead.requestedSlot ?? 'UNSPECIFIED') !== slotFilter) return false;
    if (jobTypeFilter !== 'ALL' && (lead.jobType ?? 'UNSPECIFIED') !== jobTypeFilter) return false;
    return true;
  }), [jobTypeFilter, leads, lossReasonFilter, periodFilter, slotFilter]);

  const jobsInPeriod = useMemo(
    () => jobs.filter((job) => isWithinPeriod(job.createdAt, periodFilter)),
    [jobs, periodFilter],
  );

  const summary = useMemo(() => {
    const lostCount = filteredLeads.length;
    const wonCount = jobsInPeriod.length;
    const totalOpportunities = lostCount + wonCount;
    const conversionRate = totalOpportunities > 0 ? wonCount / totalOpportunities : 0;
    const reasonBreakdown = lossReasonOptions.map((option) => ({
      key: option.value,
      label: option.label,
      count: filteredLeads.filter((lead) => lead.lossReason === option.value).length,
    }));
    const slotBreakdown = requestedSlotOptions.map((option) => ({
      key: option.value,
      label: option.label,
      count: filteredLeads.filter((lead) => (lead.requestedSlot ?? 'UNSPECIFIED') === option.value).length,
    }));
    const jobTypeBreakdown = jobTypeOptions.map((option) => ({
      key: option.value,
      label: option.label,
      count: filteredLeads.filter((lead) => (lead.jobType ?? 'UNSPECIFIED') === option.value).length,
    }));
    const destinationBreakdown = zoneOptions.map((option) => ({
      key: option.value,
      label: option.label,
      count: filteredLeads.filter((lead) => (lead.destinationZone ?? 'UNSPECIFIED') === option.value).length,
    }));
    return {
      lostCount,
      wonCount,
      totalOpportunities,
      conversionRate,
      reasonBreakdown,
      slotBreakdown,
      jobTypeBreakdown,
      destinationBreakdown,
      topReason: getTopBreakdown(reasonBreakdown),
      topSlot: getTopBreakdown(slotBreakdown),
      topJobType: getTopBreakdown(jobTypeBreakdown),
      topDestination: getTopBreakdown(destinationBreakdown),
    };
  }, [filteredLeads, jobsInPeriod]);

  const createLostSale = async (lossReason: LeadLossReason) => {
    setSavingCreate(true);
    try {
      await createLead({
        id: crypto.randomUUID(),
        clientName: '',
        requestedSlot: createDraft.requestedSlot,
        originZone: createDraft.originZone,
        destinationZone: createDraft.destinationZone,
        jobType: createDraft.jobType,
        status: 'LOST',
        lossReason,
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
      });
      setCreateDraft(emptyLeadForm);
      toast.success('Venta perdida cargada');
      void leadsQuery.reload();
    } catch {
      toast.error('No se pudo guardar la venta perdida');
    } finally {
      setSavingCreate(false);
    }
  };

  const saveLeadChanges = async () => {
    if (!selectedLead || !editDraft) return;
    const hasChanges = JSON.stringify(leadToForm(selectedLead)) !== JSON.stringify(editDraft);
    if (!hasChanges) {
      toast.error('No hay cambios para guardar');
      return;
    }
    setSavingEdit(true);
    try {
      await updateLead(selectedLead.id, {
        requestedSlot: editDraft.requestedSlot,
        originZone: editDraft.originZone,
        destinationZone: editDraft.destinationZone,
        jobType: editDraft.jobType,
        status: 'LOST',
        lossReason: selectedLead.lossReason,
      });
      toast.success('Registro actualizado');
    } catch {
      toast.error('No se pudo actualizar el registro');
    } finally {
      setSavingEdit(false);
    }
  };

  const updateSelectedLossReason = async (lossReason: LeadLossReason) => {
    if (!selectedLead) return;
    setSavingEdit(true);
    try {
      await updateLead(selectedLead.id, { lossReason, status: 'LOST' });
      toast.success('Motivo actualizado');
    } catch {
      toast.error('No se pudo actualizar el motivo');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeLeadRecord = async () => {
    if (!selectedLead) return;
    if (!window.confirm('Restar este caso de perdidas? Usalo cuando la conversacion se retoma y la venta finalmente se concreta.')) return;
    try {
      await deleteLead(selectedLead.id);
      toast.success('Caso restado de perdidas');
      void leadsQuery.reload();
    } catch {
      toast.error('No se pudo restar el caso');
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Perdidas</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Ventas perdidas por WhatsApp</h2>
          <p className="mt-1 text-sm text-slate-500">
            Carga solo lo perdido. La conversion exitosa se calcula con los fletes cargados.
          </p>
          {canDelete ? (
            <p className="mt-1 text-sm text-slate-500">
              Si un cliente vuelve despues y concreta, abre el caso y restalo de perdidas.
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Canal fijo</p>
          <p>WhatsApp</p>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {periodOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPeriodFilter(option.value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-semibold transition',
              periodFilter === option.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            {option.label}
          </button>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Oportunidades"
          value={String(summary.totalOpportunities)}
          tone="border-slate-200 bg-white text-slate-900"
          helper={`${summary.wonCount} fletes cargados + ${summary.lostCount} perdidas`}
        />
        <MetricCard
          label="Conversion"
          value={`${Math.round(summary.conversionRate * 100)}%`}
          tone="border-emerald-200 bg-emerald-50 text-emerald-800"
          helper={summary.totalOpportunities > 0 ? 'Exitosas sobre total de oportunidades' : 'Sin datos para el periodo'}
        />
        <MetricCard
          label="Perdidas"
          value={String(summary.lostCount)}
          tone="border-rose-200 bg-rose-50 text-rose-800"
          helper={summary.topReason ? `Principal: ${summary.topReason.label}` : 'Sin perdidas cargadas'}
        />
        <MetricCard
          label="Fletes"
          value={String(summary.wonCount)}
          tone="border-sky-200 bg-sky-50 text-sky-800"
          helper="Tomados como ventas concretadas"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Carga rapida</h3>
                <p className="text-sm text-slate-500">Selecciona contexto y toca el motivo de perdida.</p>
              </div>
              {savingCreate ? <span className="text-xs font-semibold text-blue-600">Guardando...</span> : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-500">
                Franja pedida
                <select
                  value={createDraft.requestedSlot}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, requestedSlot: event.target.value as LeadRequestedSlot }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {requestedSlotOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-500">
                Tipo de trabajo
                <select
                  value={createDraft.jobType}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, jobType: event.target.value as LeadJobType }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {jobTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-500">
                Zona origen
                <select
                  value={createDraft.originZone}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, originZone: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {zoneOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-500">
                Zona destino
                <select
                  value={createDraft.destinationZone}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, destinationZone: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {zoneOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Motivo de perdida</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {lossReasonOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={savingCreate}
                    onClick={() => void createLostSale(option.value)}
                    className={cn(
                      'rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60',
                      option.tone,
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Lecturas utiles</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Franja mas perdida</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {summary.topSlot ? summary.topSlot.label : 'Sin datos'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tipo mas perdido</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {summary.topJobType ? summary.topJobType.label : 'Sin datos'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Destino con mas perdidas</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {summary.topDestination ? summary.topDestination.label : 'Sin datos'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Desglose</h3>
                <p className="text-sm text-slate-500">Las perdidas se cruzan con los fletes del mismo periodo.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={lossReasonFilter}
                  onChange={(event) => setLossReasonFilter(event.target.value as 'ALL' | LeadLossReason)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="ALL">Todos los motivos</option>
                  {lossReasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={slotFilter}
                  onChange={(event) => setSlotFilter(event.target.value as 'ALL' | LeadRequestedSlot)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="ALL">Todas las franjas</option>
                  {requestedSlotOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={jobTypeFilter}
                  onChange={(event) => setJobTypeFilter(event.target.value as 'ALL' | LeadJobType)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="ALL">Todos los tipos</option>
                  {jobTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Motivos</p>
                <div className="mt-3 space-y-2">
                  {summary.reasonBreakdown.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Franjas</p>
                <div className="mt-3 space-y-2">
                  {summary.slotBreakdown.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Tipos</p>
                <div className="mt-3 space-y-2">
                  {summary.jobTypeBreakdown.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Registros</h3>
                  <p className="text-sm text-slate-500">
                    {leadsQuery.loading ? 'Cargando...' : `${filteredLeads.length} visibles`}
                  </p>
                </div>
                {leadsQuery.refreshing ? <span className="text-xs font-semibold text-blue-600">Actualizando...</span> : null}
              </div>

              <div className="mt-4 space-y-3">
                {!leadsQuery.loading && filteredLeads.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No hay perdidas para estos filtros.
                  </div>
                )}
                {filteredLeads.map((lead) => {
                  const selected = selectedLeadId === lead.id;
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={cn(
                        'w-full rounded-2xl border px-4 py-3 text-left transition',
                        selected
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-sm',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{lossReasonLabels[lead.lossReason ?? 'OTHER']}</p>
                          <p className={cn('mt-1 text-xs', selected ? 'text-slate-300' : 'text-slate-500')}>
                            {formatLeadDate(lead.createdAt)}
                          </p>
                        </div>
                        <span className={cn(
                          'rounded-full px-2 py-1 text-[11px] font-semibold',
                          selected ? 'bg-white/10 text-white' : 'bg-rose-50 text-rose-700',
                        )}>
                          Perdido
                        </span>
                      </div>
                      <p className={cn('mt-3 text-sm', selected ? 'text-slate-200' : 'text-slate-700')}>
                        {buildLossRouteLabel(lead)}
                      </p>
                      <div className={cn(
                        'mt-3 flex flex-wrap gap-2 text-[11px]',
                        selected ? 'text-slate-300' : 'text-slate-500',
                      )}>
                        <span>{requestedSlotLabels[lead.requestedSlot ?? 'UNSPECIFIED']}</span>
                        <span>{jobTypeLabels[lead.jobType ?? 'UNSPECIFIED']}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {!selectedLead || !editDraft ? (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  Selecciona una perdida para ver el detalle.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Detalle</p>
                      <h3 className="mt-1 text-2xl font-semibold text-slate-900">
                        {lossReasonLabels[selectedLead.lossReason ?? 'OTHER']}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                        <span>Creado: {formatHistoryTimestamp(selectedLead.createdAt)}</span>
                        <span>Actualizado: {formatHistoryTimestamp(selectedLead.updatedAt)}</span>
                      </div>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={removeLeadRecord}
                        className="rounded-full border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
                      >
                        Restar de perdidas
                      </button>
                    ) : null}
                  </div>

                  {canDelete ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Usa esta accion cuando el cliente parecia perdido, pero retomo la conversacion dias despues y termino cerrando el flete.
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-500">
                      Franja pedida
                      <select
                        value={editDraft.requestedSlot}
                        onChange={(event) => setEditDraft((current) => current ? { ...current, requestedSlot: event.target.value as LeadRequestedSlot } : current)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        {requestedSlotOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs font-medium text-slate-500">
                      Tipo de trabajo
                      <select
                        value={editDraft.jobType}
                        onChange={(event) => setEditDraft((current) => current ? { ...current, jobType: event.target.value as LeadJobType } : current)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        {jobTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs font-medium text-slate-500">
                      Zona origen
                      <select
                        value={editDraft.originZone}
                        onChange={(event) => setEditDraft((current) => current ? { ...current, originZone: event.target.value } : current)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        {zoneOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs font-medium text-slate-500">
                      Zona destino
                      <select
                        value={editDraft.destinationZone}
                        onChange={(event) => setEditDraft((current) => current ? { ...current, destinationZone: event.target.value } : current)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        {zoneOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">Motivo actual</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {lossReasonOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={savingEdit}
                          onClick={() => void updateSelectedLossReason(option.value)}
                          className={cn(
                            'rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition',
                            selectedLead.lossReason === option.value
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : option.tone,
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-500">
                      Ruta: <span className="font-medium text-slate-900">{buildLossRouteLabel(selectedLead)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveLeadChanges()}
                      disabled={savingEdit}
                      className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Historial</p>
                      <span className="text-xs text-slate-500">{selectedLead.history.length} eventos</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {[...selectedLead.history].reverse().map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900">{entry.message}</p>
                            <span className="text-xs text-slate-500">{formatHistoryTimestamp(entry.createdAt)}</span>
                          </div>
                          {entry.lossReason ? (
                            <p className="mt-2 text-xs text-slate-500">Motivo: {lossReasonLabels[entry.lossReason]}</p>
                          ) : null}
                        </div>
                      ))}
                      {selectedLead.history.length === 0 ? (
                        <p className="text-sm text-slate-500">Todavia no hay historial para este registro.</p>
                      ) : null}
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
