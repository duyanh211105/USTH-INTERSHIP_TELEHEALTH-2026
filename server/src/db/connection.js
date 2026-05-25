import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresAdapter } from './adapters/postgresAdapter.js';
import { createSqliteAdapter } from './adapters/sqliteAdapter.js';

let database;
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function resolveDatabaseFile() {
  return process.env.DB_FILE || path.join(serverRoot, 'data/telehealth.sqlite');
}

export function getDatabaseClient() {
  return String(process.env.DB_CLIENT || 'sqlite').toLowerCase() === 'postgres' ? 'postgres' : 'sqlite';
}

export function getDatabase() {
  if (!database) {
    if (getDatabaseClient() === 'postgres') {
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required when DB_CLIENT=postgres');
      }

      database = createPostgresAdapter({ connectionString: process.env.DATABASE_URL });
    } else {
      database = createSqliteAdapter({ dbFile: resolveDatabaseFile() });
    }
  }

  return database;
}

export async function closeDatabase() {
  if (database) {
    await database.close();
    database = undefined;
  }
}
