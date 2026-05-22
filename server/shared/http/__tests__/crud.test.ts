import { describe, expect, it } from 'vitest';

import { createCrudService } from '../crud.ts';

type TestRecord = { id: string; label: string };

class TestRepository {
  private records: TestRecord[] = [{ id: 'item-1', label: 'One' }];

  list(): TestRecord[] {
    return this.records;
  }

  get(id: string): TestRecord | undefined {
    return this.records.find((record) => record.id === id);
  }

  save(record: Partial<TestRecord>): TestRecord {
    const next = { id: record.id || 'item-1', label: record.label || '' };
    this.records = [next];
    return next;
  }

  remove(id: string): void {
    this.records = this.records.filter((record) => record.id !== id);
  }
}

describe('createCrudService', () => {
  it('keeps repository method context for remove', () => {
    const repository = new TestRepository();
    const service = createCrudService<TestRecord>({
      repository,
      normalize: (payload) => ({ id: payload.id || 'generated-id', label: payload.label || '' }),
    });

    service.remove('item-1');

    expect(repository.list()).toEqual([]);
  });
});
