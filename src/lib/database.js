import pg from 'pg';

const { Client } = pg;

export function buildDatabaseConnectionString(databaseUrl) {
  if (!databaseUrl?.trim()) {
    throw new Error(
      'Missing DATABASE_URL. Add your Supabase Postgres URL to .env before running the analysis workflows.',
    );
  }

  const url = new URL(databaseUrl.trim());
  url.searchParams.set('sslmode', 'no-verify');

  return url.toString();
}

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL) {
  return new Client({
    connectionString: buildDatabaseConnectionString(databaseUrl),
    ssl: {
      rejectUnauthorized: false,
    },
  });
}
