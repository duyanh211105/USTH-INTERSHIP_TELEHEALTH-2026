import dotenv from 'dotenv';
import { closeDatabase, getDatabaseClient } from './connection.js';
import { initializeDatabase } from './schema.js';

dotenv.config();

try {
  await initializeDatabase();
  console.log(`Database schema initialized for ${getDatabaseClient()}.`);
  await closeDatabase();
} catch (error) {
  console.error(error);
  await closeDatabase();
  process.exit(1);
}
