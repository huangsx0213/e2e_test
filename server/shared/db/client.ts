import fs from 'node:fs';
import path from 'path';

import Database from 'better-sqlite3';
import { Log } from '../services/logger';

export const dbFile = path.join(process.cwd(), 'database.sqlite');

function configureDatabase(database: Database.Database): void {
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
}

function isSqliteCorruptionError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && error.code === 'SQLITE_CORRUPT';
}

function moveCorruptDatabase(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const parsed = path.parse(filePath);
  const corruptFile = path.join(parsed.dir, `${parsed.name}.corrupt-${Date.now()}${parsed.ext}`);

  fs.renameSync(filePath, corruptFile);

  return corruptFile;
}

function createDatabase(): Database.Database {
  const database = new Database(dbFile);

  try {
    configureDatabase(database);
    return database;
  } catch (error) {
    database.close();

    if (process.env.NODE_ENV === 'production' || !isSqliteCorruptionError(error)) {
      throw error;
    }

    const corruptFile = moveCorruptDatabase(dbFile);
    const recoveredDatabase = new Database(dbFile);

    configureDatabase(recoveredDatabase);

    if (corruptFile) {
      Log.for('db').warn(`Recovered from corrupt SQLite database. Original file moved to ${corruptFile}`);
    }

    return recoveredDatabase;
  }
}

let _dbInstance: Database.Database | null = null;

export const db = new Proxy({} as Database.Database, {
  get(target, prop) {
    if (!_dbInstance) {
      _dbInstance = createDatabase();
    }
    const value = Reflect.get(_dbInstance, prop);
    return typeof value === 'function' ? value.bind(_dbInstance) : value;
  }
});
