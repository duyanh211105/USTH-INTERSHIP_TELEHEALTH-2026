import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createSqliteAdapter({ dbFile }) {
  let database;

  function open() {
    if (!database) {
      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      database = new DatabaseSync(dbFile);
      database.exec('PRAGMA foreign_keys = ON;');
    }

    return database;
  }

  return {
    client: 'sqlite',
    prepare(sql) {
      return open().prepare(sql);
    },
    exec(sql) {
      return open().exec(sql);
    },
    async transaction(callback) {
      const activeDatabase = open();

      activeDatabase.exec('BEGIN');
      try {
        const result = await callback(this);
        activeDatabase.exec('COMMIT');
        return result;
      } catch (error) {
        activeDatabase.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      if (database) {
        database.close();
        database = undefined;
      }
    },
  };
}
