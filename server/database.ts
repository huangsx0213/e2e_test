import Database from 'better-sqlite3';
import path from 'path';

export const dbFile = path.join(process.cwd(), 'database.sqlite');
export const db = new Database(dbFile);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = DELETE');
