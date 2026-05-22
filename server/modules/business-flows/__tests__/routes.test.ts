import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { repository } = vi.hoisted(() => ({
  repository: {
    list: vi.fn(),
    listByProject: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
}));

const { requirementRepository } = vi.hoisted(() => ({
  requirementRepository: {
    listByProject: vi.fn(),
  },
}));

vi.mock('../repository.ts', () => ({
  businessFlowRepo: repository,
}));

vi.mock('../../requirements/repository.ts', () => ({
  requirementRepo: requirementRepository,
}));

import { businessFlowsModule } from '../index.ts';

describe('businessFlowsModule routes', () => {
  let server: ReturnType<express.Express['listen']> | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    repository.list.mockReset();
    repository.listByProject.mockReset();
    repository.get.mockReset();
    repository.save.mockReset();
    repository.remove.mockReset();
    requirementRepository.listByProject.mockReset();

    const app = express();
    app.use(express.json());
    app.use(businessFlowsModule.basePath, businessFlowsModule.router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server?.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}${businessFlowsModule.basePath}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    server = null;
  });

  it('approves a flow whose steps share the same requirement', async () => {
    repository.get.mockReturnValue({
      id: 'flow-1',
      projectId: 'proj-1',
      name: 'Checkout flow',
      description: '',
      type: 'happy-path',
      status: 'DRAFT',
      steps: [
        { sequence: 1, requirementIds: ['req-1'], actionSummary: 'User signs in' },
        { sequence: 2, requirementIds: ['req-1'], actionSummary: 'User signs in again' },
      ],
    });
    repository.save.mockReturnValue({
      id: 'flow-1',
      projectId: 'proj-1',
      name: 'Checkout flow',
      description: '',
      type: 'happy-path',
      status: 'APPROVED',
      steps: [
        { sequence: 1, requirementIds: ['req-1'], actionSummary: 'User signs in' },
        { sequence: 2, requirementIds: ['req-1'], actionSummary: 'User signs in again' },
      ],
    });
    requirementRepository.listByProject.mockReturnValue([
      { id: 'req-1', projectId: 'proj-1', level: 'story' },
    ]);

    const response = await fetch(`${baseUrl}/flow-1/approve`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
  });
});
