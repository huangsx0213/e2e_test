import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrepare = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({ prepare: mockPrepare }));

vi.mock('../../../shared/db/client.ts', () => ({
  db: mockDb,
}));

vi.mock('../../../../shared/utils/index.ts', () => ({
  randomId: vi.fn((prefix: string) => `${prefix}-mock-id`),
}));

import { TestGenRepository } from '../infrastructure/db/test-gen-repository.ts';

describe('Checkpoint Data Persistence', () => {
  let repo: TestGenRepository;

  function mockStatement(returnValue?: any) {
    const stmt = {
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue(returnValue),
      all: vi.fn().mockReturnValue([]),
    };
    return stmt;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new TestGenRepository();
  });

  describe('updateCheckpointData', () => {
    it('serializes data to JSON and updates the row', () => {
      const stmt = mockStatement();
      mockPrepare.mockReturnValue(stmt);

      const runId = 'ai-pl-test-123';
      const checkpointData = {
        conditions: [
          { id: 'c1', title: 'User can login', selected: true },
        ],
        lastEditedField: 'title',
      };

      repo.updateCheckpointData(runId, checkpointData);

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE test_gen_runs SET checkpoint_data'),
      );
      expect(stmt.run).toHaveBeenCalledWith(
        JSON.stringify(checkpointData),
        runId,
      );
    });
  });

  describe('getRunWithThreadId', () => {
    it('parses checkpoint_data from JSON', () => {
      const checkpointData = {
        conditions: [{ id: 'c1', title: 'Edited title', selected: true }],
        lastEditedField: 'title',
      };
      const stmt = mockStatement({
        id: 'ai-pl-test-123',
        project_id: 'proj-1',
        status: 'WAITING_REVIEW',
        phase: 'review-conditions',
        thread_id: 'thread-abc',
        mode: 'interactive',
        config: '{"requirementIds":["r1"]}',
        checkpoint_data: JSON.stringify(checkpointData),
        current_batch: 1,
      });
      mockPrepare.mockReturnValue(stmt);

      const result = repo.getRunWithThreadId('ai-pl-test-123');

      expect(result).not.toBeNull();
      expect(result.checkpoint_data).toEqual(checkpointData);
      expect(result.checkpoint_data.conditions[0].title).toBe('Edited title');
    });
  });

  describe('PATCH flow simulation: save edits then load', () => {
    it('edits persisted via updateCheckpointData are visible via getRunWithThreadId', () => {
      let storedCheckpointData: string | null = JSON.stringify({
        conditions: [
          { id: 'c1', title: 'Original title', selected: true },
          { id: 'c2', title: 'Another condition', selected: false },
        ],
      });

      const runId = 'ai-pl-test-456';

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('UPDATE')) {
          const stmt = mockStatement();
          stmt.run.mockImplementation((...args: any[]) => {
            storedCheckpointData = args[0] as string;
            return {};
          });
          return stmt;
        }
        if (sql.includes('SELECT')) {
          const stmt = mockStatement({
            id: runId,
            project_id: 'proj-1',
            status: 'WAITING_REVIEW',
            phase: 'review-conditions',
            thread_id: 'thread-abc',
            mode: 'interactive',
            config: '{"requirementIds":["r1"]}',
            checkpoint_data: storedCheckpointData,
            current_batch: 1,
          });
          return stmt;
        }
        return mockStatement();
      });

      const runBefore = repo.getRunWithThreadId(runId);
      expect(runBefore).not.toBeNull();
      expect(runBefore.checkpoint_data.conditions[0].title).toBe('Original title');

      const editedData = {
        conditions: [
          { id: 'c1', title: 'User edited title', selected: true },
          { id: 'c2', title: 'Another condition', selected: false },
        ],
      };

      const merged = { ...runBefore.checkpoint_data, ...editedData };
      repo.updateCheckpointData(runId, merged);

      const runAfter = repo.getRunWithThreadId(runId);

      expect(runAfter).not.toBeNull();
      expect(runAfter.checkpoint_data.conditions[0].title).toBe('User edited title');
      expect(runAfter.checkpoint_data.conditions[1].title).toBe('Another condition');
    });

    it('partial edits (only changed fields) merge correctly', () => {
      let storedCheckpointData: string | null = JSON.stringify({
        conditions: [
          { id: 'c1', title: 'Original', selected: true },
        ],
        metadata: { batch: 1 },
      });

      const runId = 'ai-pl-test-789';

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('UPDATE')) {
          const stmt = mockStatement();
          stmt.run.mockImplementation((...args: any[]) => {
            storedCheckpointData = args[0] as string;
            return {};
          });
          return stmt;
        }
        if (sql.includes('SELECT')) {
          return mockStatement({
            id: runId,
            project_id: 'proj-1',
            status: 'WAITING_REVIEW',
            phase: 'review-conditions',
            thread_id: 'thread-xyz',
            mode: 'interactive',
            config: '{}',
            checkpoint_data: storedCheckpointData,
            current_batch: 1,
          });
        }
        return mockStatement();
      });

      const run = repo.getRunWithThreadId(runId);

      const editedData = {
        conditions: [
          { id: 'c1', title: 'Changed!', selected: true },
        ],
      };

      const merged = { ...run.checkpoint_data, ...editedData };
      repo.updateCheckpointData(runId, merged);

      const runAfter = repo.getRunWithThreadId(runId);

      expect(runAfter.checkpoint_data.conditions[0].title).toBe('Changed!');
      expect(runAfter.checkpoint_data.metadata).toEqual({ batch: 1 });
    });
  });

  describe('PATCH endpoint merge logic: field name mismatch bug', () => {
    it('BUG: client sends testConditions but checkpoint_data uses conditions — shallow merge loses edits', () => {
      const runId = 'ai-pl-test-bug';

      // Simulates what setCheckpointData stores (from pipeline interrupt payload):
      // checkpoint_data uses field name "conditions"
      let storedCheckpointData: string | null = JSON.stringify({
        conditions: [
          { id: 'c1', title: 'Original title', selected: true },
          { id: 'c2', title: 'Keep this', selected: false },
        ],
      });

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('UPDATE')) {
          const stmt = mockStatement();
          stmt.run.mockImplementation((...args: any[]) => {
            storedCheckpointData = args[0] as string;
            return {};
          });
          return stmt;
        }
        if (sql.includes('SELECT')) {
          return mockStatement({
            id: runId,
            project_id: 'proj-1',
            status: 'WAITING_REVIEW',
            phase: 'review-conditions',
            thread_id: 'thread-abc',
            mode: 'interactive',
            config: '{}',
            checkpoint_data: storedCheckpointData,
            current_batch: 1,
          });
        }
        return mockStatement();
      });

      // 1. User loads run — sees conditions
      const run = repo.getRunWithThreadId(runId);
      expect(run.checkpoint_data.conditions[0].title).toBe('Original title');

      // 2. User edits condition title, clicks "Done Reviewing"
      //    Client sends: { testConditions: [...updated conditions...] }
      //    (field name is "testConditions" per fieldMap in AiTestGenPage.tsx)
      const clientEditedData = {
        testConditions: [
          { id: 'c1', title: 'User edited title', selected: true },
          { id: 'c2', title: 'Keep this', selected: false },
        ],
      };

      // 3. PATCH endpoint logic (index.ts:86-88):
      //    const merged = { ...run.checkpoint_data, ...editedData };
      //    This shallow-merges clientEditedData into checkpoint_data
      const merged = { ...run.checkpoint_data, ...clientEditedData };
      repo.updateCheckpointData(runId, merged);

      // 4. User clicks "Clear" (client state reset), then loads from history
      const runAfter = repo.getRunWithThreadId(runId);

      // 5. BUG: checkpoint_data now has BOTH "conditions" (old) and "testConditions" (new)
      //    The old "conditions" field is NOT overwritten by the merge
      expect(runAfter.checkpoint_data.conditions[0].title).toBe('Original title'); // OLD data persists!
      expect(runAfter.checkpoint_data.testConditions[0].title).toBe('User edited title'); // NEW data under wrong key

      // The UI reads "conditions" from checkpoint_data, so user sees old data
      // The edits are "lost" — they're stored under "testConditions" which the UI ignores
    });

    it('FIX: if client sends conditions (same key as checkpoint_data), merge works', () => {
      const runId = 'ai-pl-test-fix';

      let storedCheckpointData: string | null = JSON.stringify({
        conditions: [
          { id: 'c1', title: 'Original title', selected: true },
        ],
      });

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('UPDATE')) {
          const stmt = mockStatement();
          stmt.run.mockImplementation((...args: any[]) => {
            storedCheckpointData = args[0] as string;
            return {};
          });
          return stmt;
        }
        if (sql.includes('SELECT')) {
          return mockStatement({
            id: runId,
            project_id: 'proj-1',
            status: 'WAITING_REVIEW',
            phase: 'review-conditions',
            thread_id: 'thread-abc',
            mode: 'interactive',
            config: '{}',
            checkpoint_data: storedCheckpointData,
            current_batch: 1,
          });
        }
        return mockStatement();
      });

      const run = repo.getRunWithThreadId(runId);

      // If the client sent the data with the same key as checkpoint_data:
      const correctEditedData = {
        conditions: [
          { id: 'c1', title: 'Fixed title', selected: true },
        ],
      };

      const merged = { ...run.checkpoint_data, ...correctEditedData };
      repo.updateCheckpointData(runId, merged);

      const runAfter = repo.getRunWithThreadId(runId);
      expect(runAfter.checkpoint_data.conditions[0].title).toBe('Fixed title');
    });
  });

  describe('Full user flow: setCheckpointData → PATCH edit → getRunInfo reads updated data', () => {
    it('simulates the exact user flow: checkpoint created, user edits via PATCH, history reload shows edits', () => {
      // This test simulates what setCheckpointData stores (from pipeline interrupt payload):
      // checkpoint_data = { conditions: [...], analysis: {...} }
      let storedCheckpointData: string | null = JSON.stringify({
        conditions: [
          { id: 'c1', condition: 'User can login', priority: 'CRITICAL', category: 'security' },
          { id: 'c2', condition: 'User can reset password', priority: 'HIGH', category: 'functional' },
        ],
        analysis: { overallApproach: 'Boundary testing', riskAssessmentSummary: 'High risk area' },
      });

      const runId = 'ai-pl-flow-test-001';

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('UPDATE test_gen_runs SET checkpoint_data')) {
          const stmt = mockStatement();
          stmt.run.mockImplementation((...args: any[]) => {
            storedCheckpointData = args[0] as string;
            return {};
          });
          return stmt;
        }
        if (sql.includes('SELECT * FROM test_gen_runs')) {
          return mockStatement({
            id: runId,
            project_id: 'proj-1',
            status: 'WAITING_REVIEW',
            phase: 'review-conditions',
            mode: 'interactive',
            config: '{"requirementIds":["r1"]}',
            checkpoint_data: storedCheckpointData,
            current_batch: 1,
          });
        }
        // For getRunWithThreadId (SELECT id, project_id,...)
        if (sql.includes('SELECT id, project_id')) {
          return mockStatement({
            id: runId,
            project_id: 'proj-1',
            status: 'WAITING_REVIEW',
            phase: 'review-conditions',
            thread_id: 'thread-abc',
            mode: 'interactive',
            config: '{}',
            checkpoint_data: storedCheckpointData,
            current_batch: 1,
          });
        }
        return mockStatement();
      });

      // Step 1: Initial checkpoint data is stored (simulating setCheckpointData after pipeline interrupt)
      const initialData = JSON.parse(storedCheckpointData!);
      expect(initialData.conditions[0].priority).toBe('CRITICAL');
      expect(initialData.conditions[1].priority).toBe('HIGH');

      // Step 2: User loads the run from history — getRunInfo returns checkpoint_data
      const runInfo = repo.getRunInfo(runId);
      expect(runInfo).not.toBeNull();
      expect(runInfo.checkpoint_data).toEqual(initialData);
      expect(runInfo.checkpoint_data.conditions[0].priority).toBe('CRITICAL');
      expect(runInfo.checkpoint_data.conditions[1].priority).toBe('HIGH');

      // Step 3: User edits data — changes c1 priority from CRITICAL to LOW
      // The frontend CheckpointEditView sends editedData with updated conditions
      const editedData = {
        conditions: [
          { id: 'c1', condition: 'User can login', priority: 'LOW', category: 'security' },
          { id: 'c2', condition: 'User can reset password', priority: 'HIGH', category: 'functional' },
        ],
        analysis: { overallApproach: 'Boundary testing', riskAssessmentSummary: 'High risk area' },
      };

      // Step 4: PATCH handler merges and saves
      const merged = { ...runInfo.checkpoint_data, ...editedData };
      repo.updateCheckpointData(runId, merged);

      // Step 5: User loads from history again — getRunInfo should return updated data
      const updatedRunInfo = repo.getRunInfo(runId);
      expect(updatedRunInfo).not.toBeNull();
      expect(updatedRunInfo.checkpoint_data.conditions[0].priority).toBe('LOW'); // UPDATED!
      expect(updatedRunInfo.checkpoint_data.conditions[1].priority).toBe('HIGH'); // UNCHANGED
      expect(updatedRunInfo.checkpoint_data.analysis).toEqual(initialData.analysis); // UNCHANGED

      // Step 6: getRunInfo also returns id (fix for loadRun bug)
      expect(updatedRunInfo.id).toBe(runId);
    });

    it('simulates getRunInfo returning id field', () => {
      const runId = 'ai-pl-id-test-001';
      
      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM test_gen_runs')) {
          return mockStatement({
            id: runId,
            status: 'COMPLETED',
            phase: 'complete',
            checkpoint_data: null,
          });
        }
        return mockStatement();
      });

      const runInfo = repo.getRunInfo(runId);
      expect(runInfo.id).toBe(runId);
      expect(runInfo.status).toBe('COMPLETED');
    });
  });
});
