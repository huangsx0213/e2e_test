import { describe, expect, it } from 'vitest';

import { normalizeBusinessFlow } from '../mapper.ts';

describe('normalizeBusinessFlow', () => {
  it('defaults a business flow to draft with empty steps', () => {
    const result = normalizeBusinessFlow({ projectId: 'proj-1', name: 'Checkout flow' });

    expect(result.status).toBe('DRAFT');
    expect(result.steps).toEqual([]);
  });
});
