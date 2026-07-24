# Proposal: Pricing Snapshot

## Intent

Admin rate updates retroactively change already-scheduled jobs because pricing is live-computed from current settings. Customers and drivers lose their agreed price. Snapshots freeze the pricing context at job creation.

## Scope

### In Scope

- Add 4 nullable columns to `jobs` table: `hourly_rate_snapshot`, `helper_hourly_rate_snapshot`, `price_per_long_distance_km_snapshot`, `estimated_total_snapshot`
- Snapshot effective rates (vehicle-priority fallback chain) at `createJob` time
- Update `getJobChargeBreakdown` in `jobPricing.ts` to prefer snapshot values over live rates
- Update `AdminJobs.tsx` analytics (`getEntryHourlyValue`, `getEntryTotal`) to read snapshots
- Update `JobWorkflow.tsx` driver completion to pass snapshot data
- Schema migration in `ensureSchema`

### Out of Scope

- Updating snapshots on vehicle reassignment (business decision deferred)
- Snapshotting distant-base minutes (separate concern, live-computed at completion)
- Retroactively snapshotting existing jobs (they stay live-computed)
- JSONB approach (chose explicit columns for queryability)
- UI for viewing snapshot vs. live rate differences

## Capabilities

### New Capabilities

- `job-pricing-snapshot`: Freeze hourly rate, helper rate, and long-distance km price on the job row at creation. All pricing display and analytics prefer snapshot values when present; fall back to live rates for legacy jobs.

### Modified Capabilities

None — no existing specs to modify.

## Approach

**Approach 1 from exploration**: Add nullable snapshot columns to the jobs table. At `createJob()`, resolve effective rates from current settings and vehicle config (vehicle overrides take priority), store them. Then update three consumption points to prefer snapshots when non-null, falling back to live rates for old jobs. This is backward-compatible, SQL-queryable, and type-safe.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `api/_db.js` — `ensureSchema` | Modified | ALTER TABLE to add 4 snapshot columns |
| `api/_db.js` — `createJob` | Modified | Resolve + store snapshot rates at creation |
| `fletes-driver-pwa/src/lib/jobPricing.ts` | Modified | Accept optional snapshot overrides in `getJobChargeBreakdown` |
| `fletes-driver-pwa/src/pages/AdminJobs.tsx` | Modified | Analytics read snapshots when available |
| `fletes-driver-pwa/src/pages/JobWorkflow.tsx` | Modified | Pass snapshot data to pricing functions |
| `fletes-driver-pwa/src/lib/types.ts` | Modified | Add snapshot fields to Job interface |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Old jobs lack snapshots, pricing still live-computed | High (by design) | Nullable columns + fallback to live rates — zero behavior change for existing jobs |
| Vehicle reassignment after creation doesn't update snapshot | Low | Out of scope; agreed price is at creation time |
| Schema migration fails on large jobs table | Low | Add columns with NULL default (no table rewrite) |

## Rollback Plan

1. Revert code changes (three consumption points)
2. Columns are nullable with no app dependency on their existence — zero-downtime rollback
3. Drop columns after rollback if desired (optional, non-blocking)

## Dependencies

None. No external services, no new libraries.

## Success Criteria

- [ ] New jobs store snapshot values at creation matching the live estimate shown to admin
- [ ] `getJobChargeBreakdown` returns snapshot-based values for new jobs, live-computed for old jobs
- [ ] Admin analytics (`getEntryHourlyValue`, `getEntryTotal`) reflect snapshot values
- [ ] Driver completion flow uses snapshot rates
- [ ] All existing tests pass; new tests cover snapshot vs. fallback paths
