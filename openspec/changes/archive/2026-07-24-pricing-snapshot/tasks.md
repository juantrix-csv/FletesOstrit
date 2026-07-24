# Tasks: Pricing Snapshot

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 160–200 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr-default |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Types, schema, normalizeRow + createJob snapshot + jobPricing override + consumption wiring | PR 1 | `npx vitest run src/lib/jobPricing.test.ts` | `npm run dev` → create job → verify snapshot columns via API response | Revert `types.ts` fields, `_db.js` createJob snapshot block, `jobPricing.ts` overrides — legacy jobs use live rates unchanged |

## Phase 1: Foundation (Types + Schema)

- [x] 1.1 `fletes-driver-pwa/src/lib/types.ts` L88-109: Add `hourlyRateSnapshot`, `helperHourlyRateSnapshot`, `pricePerLongDistanceKmSnapshot`, `estimatedTotalSnapshot` as `?: number | null` to Job interface
- [x] 1.2 `api/_db.js` ensureSchema L309-327: Add 4 `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ... DOUBLE PRECISION` following existing pattern
- [x] 1.3 `api/_db.js` normalizeRow L443-485: Add 4 snapshot fields to return object: `hourlyRateSnapshot: Number(row.hourly_rate_snapshot) ?? undefined`, etc.

## Phase 2: Core Implementation

- [x] 2.1 `api/_db.js` createJob L657-729: Fetch `getVehicleById(job.vehicleId)` + `getSetting('hourlyRate')` + `getSetting('helperHourlyRate')`; resolve `hourlyRate = vehicle.hourlyRate ?? hourlyRateSetting`, `helperRate = helperHourlyRateSetting`, `kmPrice = vehicle.pricePerLongDistanceKm` (long-dist only); compute `estimatedTotal` matching preview formula; add 4 snapshot columns to INSERT and VALUES
- [x] 2.2 `fletes-driver-pwa/src/lib/jobPricing.ts` getJobChargeBreakdown L58-145: At function top, `const effHr = job.hourlyRateSnapshot ?? opts.hourlyRate` (same for helper rate and km price); replace `opts.hourlyRate`/`opts.helperHourlyRate`/`opts.pricePerLongDistanceKm` with effective variables throughout body

## Phase 3: Consumption Wiring

- [x] 3.1 `fletes-driver-pwa/src/pages/AdminJobs.tsx` getJobHourlyRateValue L805: Prepend `job.hourlyRateSnapshot ??` before vehicle/global fallback
- [x] 3.2 `fletes-driver-pwa/src/pages/AdminJobs.tsx` getJobLongDistanceCalculatedTotal L813-823: Prepend `job.pricePerLongDistanceKmSnapshot ??` before vehicle fallback
- [x] 3.3 `fletes-driver-pwa/src/pages/AdminJobs.tsx` getEntryTotal L2043: Use `job.helperHourlyRateSnapshot ?? helperHourlyRateValue` for helpersValue
- [x] 3.4 `fletes-driver-pwa/src/pages/AdminJobs.tsx` completed history L5712: Use `job.helperHourlyRateSnapshot ?? helperHourlyRateValue` for helpersValue
- [x] 3.5 `fletes-driver-pwa/src/pages/JobWorkflow.tsx` effectiveHourlyRateValue L91: Change to `job.hourlyRateSnapshot ?? vehicleHourlyRateValue ?? hourlyRateValue`

## Phase 4: Testing (TDD)

- [x] 4.1 `fletes-driver-pwa/src/lib/jobPricing.test.ts`: Add tests for snapshot-preferring (SNAP-002 scenario 1) and legacy-fallback (SNAP-003 scenario 1)
- [x] 4.2 `fletes-driver-pwa/src/lib/jobPricing.test.ts`: Add test for helper rate snapshot with helpers (SNAP-002 scenario 2)
- [x] 4.3 Run `npm test` — all existing tests must pass unchanged; verify snapshot columns appear in API response for new jobs via `npm run dev`
