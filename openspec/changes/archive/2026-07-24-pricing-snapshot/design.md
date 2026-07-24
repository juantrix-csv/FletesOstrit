# Design: Pricing Snapshot

## Technical Approach

Add 4 nullable `DOUBLE PRECISION` columns to the `jobs` table. At `createJob()` time, resolve effective rates by vehicle-override-first chain identical to the live-resolution logic, compute the estimated total, and persist all four values. Three consumption points then prefer snapshot values over live rates: `getJobChargeBreakdown` (internal override), AdminJobs analytics helpers, and JobWorkflow display. Legacy NULL snapshots fall through to live rates — zero behavior change for existing jobs.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Snapshot storage | 4 explicit nullable columns | JSONB blob, separate table | Directly queryable for analytics, matches existing migration pattern (ALTER TABLE ADD COLUMN IF NOT EXISTS), trivial rollback |
| Rate resolution location | Backend `createJob()` | Frontend sending snapshot values | Single source of truth; settings/vehicle data lives server-side; avoids stale client-side caches |
| `getJobChargeBreakdown` change | Internal snapshot override | Caller resolution only | Centralizes the fallback chain in one function; all consumers get the behavior automatically |
| Formula for estimatedTotalSnapshot | Long-dist: `(km × pricePerKm) + (estHours × helperRate × helpers)`; Hourly: `(estHours × hourlyRate) + (estHours × helperRate × helpers)` | Reusing frontend preview | Matches what admin sees in new-job preview (lines 2427-2475), minus distant-base extra (excluded per proposal scope) |

## Data Flow

**Creation flow:**
```
POST /api/v1/jobs
  → createJob()
    → getVehicleById(vehicleId)
    → resolve hourlyRate: vehicle.hourlyRate ?? getSetting('hourlyRate')
    → resolve helperRate: getSetting('helperHourlyRate')
    → resolve kmPrice: vehicle.pricePerLongDistanceKm (long-dist only)
    → compute estimatedTotal from estDurationMinutes × resolved rates
    → INSERT ... RETURNING *
    → normalizeRow includes 4 snapshot fields
```

**Consumption flow:**
```
getJobChargeBreakdown(job, opts)
  → hourlyRate = job.hourlyRateSnapshot ?? opts.hourlyRate
  → helperRate = job.helperHourlyRateSnapshot ?? opts.helperHourlyRate
  → kmPrice = job.pricePerLongDistanceKmSnapshot ?? opts.pricePerLongDistanceKm
  → compute breakdown as before

AdminJobs.getEntryHourlyValue
  → job.hourlyRateSnapshot ?? (vehicle?.hourlyRate ?? globalHourlyRate)

AdminJobs.getEntryTotal (line 2043)
  → job.helperHourlyRateSnapshot ?? helperHourlyRateValue
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `api/_db.js` L264-302 | Modify | `ensureSchema`: 4 ALTER TABLE ADD COLUMN IF NOT EXISTS for snapshot columns |
| `api/_db.js` L443-485 | Modify | `normalizeRow`: add 4 snapshot fields to return object |
| `api/_db.js` L657-729 | Modify | `createJob`: resolve vehicle, compute rates and estimated total, include in INSERT columns |
| `fletes-driver-pwa/src/lib/types.ts` L88-109 | Modify | Job interface: add 4 `?: number \| null` snapshot fields |
| `fletes-driver-pwa/src/lib/jobPricing.ts` L58-145 | Modify | `getJobChargeBreakdown`: prefer `job.*Snapshot` over `opts.*` for each rate |
| `fletes-driver-pwa/src/pages/AdminJobs.tsx` L805 | Modify | `getJobHourlyRateValue`: prepend `job.hourlyRateSnapshot ??` |
| `fletes-driver-pwa/src/pages/AdminJobs.tsx` L2032-2047 | Modify | `getEntryTotal`: use `job.helperHourlyRateSnapshot ??` for helper rate (line 2043) |
| `fletes-driver-pwa/src/pages/AdminJobs.tsx` L817 | Modify | `getJobLongDistanceCalculatedTotal`: prepend `job.pricePerLongDistanceKmSnapshot ??` |
| `fletes-driver-pwa/src/pages/AdminJobs.tsx` L5712 | Modify | Completed history helpersValue: use snapshot for helper rate |
| `fletes-driver-pwa/src/pages/JobWorkflow.tsx` L91 | Modify | `effectiveHourlyRateValue`: `job.hourlyRateSnapshot ?? vehicleHourlyRateValue ?? hourlyRateValue` |

## Interfaces / Contracts

```typescript
// Type additions (types.ts)
interface Job {
  // ... existing fields ...
  hourlyRateSnapshot?: number | null;
  helperHourlyRateSnapshot?: number | null;
  pricePerLongDistanceKmSnapshot?: number | null;
  estimatedTotalSnapshot?: number | null;
}

// getJobChargeBreakdown internal resolution (jobPricing.ts)
// The function already receives (job: Job, opts: {...}).
// NEW: three lines at top override opts with snapshots when present:
//   const effectiveHourlyRate = job.hourlyRateSnapshot ?? opts.hourlyRate;
//   const effectiveHelperRate = job.helperHourlyRateSnapshot ?? opts.helperHourlyRate;
//   const effectivePricePerKm = job.pricePerLongDistanceKmSnapshot ?? opts.pricePerLongDistanceKm;
// Then use effective* throughout the function body instead of opts.*.
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `getJobChargeBreakdown` snapshot vs fallback | Create mock jobs with/without snapshots, assert rate selection |
| Unit | `createJob` snapshot computation | Call with known settings/vehicle, verify inserted row snapshot values match expected resolution chain |
| Integration | Legacy job reads unchanged | Fetch pre-migration job, call `getJobChargeBreakdown`/analytics, assert live rates used |
| Integration | New job roundtrip | Create job via API → verify snapshot columns populated → read via API → verify consumption uses snapshots |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

- Schema: `ALTER TABLE ADD COLUMN IF NOT EXISTS` — NULL default, no table rewrite, safe on any table size.
- Code: all consumption points use `??` fallback; old rows stay live-computed.
- Rollback: revert code, drop columns (optional, non-blocking).

## Open Questions

None.
