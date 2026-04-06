import pg from 'pg';

const { Client } = pg;

const TABLES = [
  {
    name: 'drivers',
    columns: ['id', 'name', 'code', 'phone', 'vehicle_id', 'active', 'created_at', 'updated_at'],
  },
  {
    name: 'vehicles',
    columns: ['id', 'name', 'size', 'ownership_type', 'cost_per_km', 'fixed_monthly_cost', 'created_at', 'updated_at'],
  },
  {
    name: 'jobs',
    columns: [
      'id',
      'client_name',
      'client_phone',
      'description',
      'pickup',
      'dropoff',
      'extra_stops',
      'stop_index',
      'distance_meters',
      'last_track_lat',
      'last_track_lng',
      'last_track_at',
      'notes',
      'driver_id',
      'helpers_count',
      'estimated_duration_minutes',
      'charged_amount',
      'cash_amount',
      'transfer_amount',
      'hourly_billed_hours',
      'hourly_base_amount',
      'driver_share_amount',
      'company_share_amount',
      'driver_share_ratio',
      'share_source',
      'status',
      'flags',
      'timestamps',
      'scheduled_date',
      'scheduled_time',
      'scheduled_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'driver_locations',
    columns: ['driver_id', 'lat', 'lng', 'accuracy', 'heading', 'speed', 'job_id', 'updated_at'],
  },
  {
    name: 'settings',
    columns: ['key', 'value'],
  },
  {
    name: 'leads',
    columns: [
      'id',
      'client_name',
      'client_phone',
      'description',
      'requested_date',
      'requested_time',
      'origin_zone',
      'destination_zone',
      'status',
      'loss_reason',
      'notes',
      'history',
      'closed_at',
      'created_at',
      'updated_at',
    ],
  },
];

const sourceUrl = process.env.SOURCE_POSTGRES_URL ?? '';
const targetUrl = process.env.TARGET_POSTGRES_URL ?? process.env.POSTGRES_URL ?? '';

if (!sourceUrl) {
  console.error('Missing SOURCE_POSTGRES_URL');
  process.exit(1);
}

if (!targetUrl) {
  console.error('Missing TARGET_POSTGRES_URL');
  process.exit(1);
}

const shouldUseSsl = (connectionString) => {
  try {
    const url = new URL(connectionString);
    return url.hostname !== '127.0.0.1' && url.hostname !== 'localhost';
  } catch {
    return false;
  }
};

const createClient = (connectionString) => new Client({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
});

const buildInsertStatement = (tableName, columns, rows) => {
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const rowPlaceholders = columns.map((_column, columnIndex) => {
      values.push(row[columns[columnIndex]]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${rowPlaceholders.join(', ')})`;
  });

  return {
    text: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
    values,
  };
};

const main = async () => {
  const source = createClient(sourceUrl);
  const target = createClient(targetUrl);

  await source.connect();
  await target.connect();

  try {
    await target.query('BEGIN');

    const truncateOrder = [...TABLES].reverse().map((table) => table.name).join(', ');
    await target.query(`TRUNCATE TABLE ${truncateOrder}`);

    for (const table of TABLES) {
      const selectSql = `SELECT ${table.columns.join(', ')} FROM ${table.name}`;
      const { rows } = await source.query(selectSql);

      if (rows.length === 0) {
        console.log(`[migrate] ${table.name}: 0 rows`);
        continue;
      }

      const insert = buildInsertStatement(table.name, table.columns, rows);
      await target.query(insert.text, insert.values);
      console.log(`[migrate] ${table.name}: ${rows.length} rows`);
    }

    await target.query('COMMIT');
    console.log('[migrate] done');
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
};

main().catch((error) => {
  console.error('[migrate] failed');
  console.error(error);
  process.exit(1);
});
