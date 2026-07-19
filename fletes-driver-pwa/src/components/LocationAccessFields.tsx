import type { LocationData } from '../lib/types';
import { normalizeLocationAccess } from '../lib/locationAccess';

interface LocationAccessFieldsProps {
  value: LocationData | null;
  onChange: (value: LocationData) => void;
  compact?: boolean;
}

export default function LocationAccessFields({ value, onChange, compact = false }: LocationAccessFieldsProps) {
  if (!value) return null;
  const normalized = normalizeLocationAccess(value, null);
  const update = (patch: Partial<LocationData>) => onChange(normalizeLocationAccess({ ...normalized, ...patch }, null));

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
        <label className="text-xs text-slate-600">
          Planta / piso
          <input
            type="number"
            min={0}
            max={99}
            step={1}
            value={normalized.floor ?? ''}
            onChange={(event) => update({ floor: event.target.value === '' ? null : Math.min(99, Math.max(0, Number.parseInt(event.target.value, 10))) })}
            className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
          />
          <span className="mt-1 block text-[10px] text-slate-400">0 = planta baja</span>
        </label>
        <label className="flex items-center gap-2 rounded border bg-white px-2 py-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={normalized.hasElevator === true}
            disabled={normalized.floor == null || normalized.floor === 0}
            onChange={(event) => update({ hasElevator: event.target.checked })}
          />
          Tiene ascensor
        </label>
        {normalized.hasElevator && (
          <label className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={normalized.hasItemsThatDoNotFitElevator === true}
              onChange={(event) => update({ hasItemsThatDoNotFitElevator: event.target.checked })}
            />
            Hay objetos que no entran
          </label>
        )}
      </div>
    </div>
  );
}
