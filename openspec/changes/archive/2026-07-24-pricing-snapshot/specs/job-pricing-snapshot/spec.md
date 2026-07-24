# Job Pricing Snapshot Specification

## Purpose

Freeze the effective pricing rates (hourly rate, helper rate, long-distance km price, estimated total) on the job row at creation time. Snapshot values feed all pricing display, analytics, and driver completion flows. Legacy jobs without snapshots continue using live-computed rates with no behavior change.

## Requirements

| ID | Requirement | Scenarios |
|----|-------------|-----------|
| SNAP-001 | Snapshot creation at job creation | 2 |
| SNAP-002 | Snapshot-preferring consumption | 2 |
| SNAP-003 | Legacy fallback (null snapshots) | 1 |
| SNAP-004 | Snapshot immutability | 1 |
| SNAP-005 | Rate resolution priority | 2 |
| SNAP-006 | Estimated total preview snapshot | 1 |

### Requirement: Snapshot creation at job creation (SNAP-001)

When a new job row is created, the system MUST resolve the effective hourly rate, effective helper hourly rate, effective long-distance km price, and estimated total from the current settings and vehicle configuration at that moment, and persist them as snapshot columns on the job row. All four snapshot columns MUST be populated for every new job.

#### Scenario: Hourly job with vehicle override stores snapshots

- GIVEN the global hourly rate setting is 5000 and a vehicle has hourly_rate=7000
- WHEN a non-long-distance job is created assigned to that vehicle
- THEN hourly_rate_snapshot is 7000 (vehicle override), helper_hourly_rate_snapshot is the current helper rate setting, price_per_long_distance_km_snapshot is null, and estimated_total_snapshot equals (estimated hours × 7000) + (helpers × helper rate × estimated hours)

#### Scenario: Long-distance job with helpers stores snapshots

- GIVEN a vehicle has price_per_long_distance_km=300, global helper rate is 2000, and the job has distance_km=50 with 2 helpers
- WHEN a long-distance job is created assigned to that vehicle
- THEN hourly_rate_snapshot is null, helper_hourly_rate_snapshot is 2000, price_per_long_distance_km_snapshot is 300, and estimated_total_snapshot equals (50 × 300) + (estimated hours × 2000 × 2)

### Requirement: Snapshot-preferring consumption (SNAP-002)

All pricing display, analytics, and driver completion calculations MUST use snapshot values when the corresponding snapshot column is non-null. Consumption points: `getJobChargeBreakdown` in jobPricing.ts, AdminJobs analytics (`getEntryHourlyValue`, `getEntryTotal`), and JobWorkflow driver completion.

#### Scenario: Pricing breakdown prefers snapshot over live rate

- GIVEN a job has hourly_rate_snapshot=5000 and the current global hourly rate setting is now 8000
- WHEN `getJobChargeBreakdown` is called for that job
- THEN the hourly rate used for the calculation is 5000 (snapshot), not 8000 (live)

#### Scenario: Admin analytics uses snapshot for revenue calc

- GIVEN a job with hourly_rate_snapshot=6000, helper_hourly_rate_snapshot=2500, and billed hours=4
- WHEN `getEntryTotal` computes revenue for that job
- THEN base amount = 4 × 6000 = 24000, helpers amount = 4 × 2500 × helpersCount, and total uses those values

### Requirement: Legacy fallback for null snapshots (SNAP-003)

Jobs created before this change have null snapshot columns. Pricing for such jobs MUST continue using live-computed rates from current settings and vehicle configuration. There MUST be zero behavior change for jobs that existed before migration.

#### Scenario: Legacy job uses live rates unchanged

- GIVEN a job created before migration has hourly_rate_snapshot=NULL
- WHEN any pricing function runs for that job
- THEN the effective rate is resolved from current vehicle override or global setting, identical to pre-snapshot behavior

### Requirement: Snapshot immutability (SNAP-004)

Once a job is created and snapshots are stored, subsequent changes to global rate settings or vehicle rate configuration MUST NOT update existing job snapshots. Snapshots are write-once at creation time.

#### Scenario: Rate update does not affect existing snapshots

- GIVEN a job was created with hourly_rate_snapshot=5000
- WHEN the admin updates the global hourly rate to 9000 or the vehicle's hourly_rate to 12000
- THEN the job's hourly_rate_snapshot remains 5000

### Requirement: Rate resolution priority (SNAP-005)

At snapshot creation time, the system MUST resolve each rate using the established fallback chain. For hourly rate: vehicle.hourly_rate takes priority over global hourlyRate setting. For helper rate: only global helperHourlyRate setting. For long-distance km price: only vehicle.price_per_long_distance_km.

#### Scenario: Vehicle hourly override wins over global

- GIVEN global hourlyRate=4000 and vehicle A has hourly_rate=5500
- WHEN a job is created with vehicle A assigned
- THEN hourly_rate_snapshot is 5500

#### Scenario: No vehicle override falls back to global

- GIVEN global hourlyRate=4000 and vehicle B has hourly_rate=NULL
- WHEN a job is created with vehicle B assigned
- THEN hourly_rate_snapshot is 4000

### Requirement: Estimated total preview snapshot (SNAP-006)

The estimated total shown in the new job form preview MUST be stored as `estimated_total_snapshot` on the job row for audit and display purposes. This value SHALL be the same total the admin sees before creating the job.

#### Scenario: Preview total matches stored snapshot

- GIVEN the new job form preview shows ARS 35000 for a job with 3 estimated hours, hourly rate 5000, 1 helper at 2500/h
- WHEN the admin clicks create and the job is persisted
- THEN estimated_total_snapshot is 35000 (matching the preview)
