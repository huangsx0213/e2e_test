import { db } from './client.ts';
import type { CrudRepository } from '../http/crud.ts';
import type { WithId } from '../utils/index.ts';

export abstract class BaseCrudRepository<T extends WithId> implements CrudRepository<T> {
  protected abstract table: string;

  abstract get(id: string): T | undefined;
  abstract save(record: Partial<T>): T;

  list(): T[] {
    const rows = db.prepare(`SELECT id FROM ${this.table} ORDER BY rowid`).all() as Array<{ id: string }>;
    return rows
      .map((row) => this.get(row.id))
      .filter((record): record is T => Boolean(record));
  }

  remove(id: string): void {
    db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}