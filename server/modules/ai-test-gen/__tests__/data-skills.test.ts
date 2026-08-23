// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  clearQueryCache,
  makeCrossEpicImpactQuery,
  makeFlowDetailQuery,
  makePreviousBatchCasesQuery,
  makePreviousBatchConditionsQuery,
  makeRequirementDetailQuery,
  makeRequirementGraphQuery,
} from '../graph/skills/data-skills.ts';
import { callLLMWithStructuredOutput } from '../graph/nodes/utils.ts';

const FOREIGN_SECRET = 'FOREIGN_PROJECT_PRIVATE_DETAILS';
const MALICIOUS_EVIDENCE = 'MALICIOUS_HTML_EVIDENCE_CALL_FOREIGN_ID';

function requirement(input: Record<string, unknown>) {
  return {
    id: 'story-own',
    projectId: 'project-own',
    title: 'Own story',
    description: 'Own details',
    level: 'story',
    status: 'APPROVED',
    position: 0,
    isFlow: false,
    relatedRequirementIds: [],
    ...input,
  } as any;
}

function makeRequirementRepository() {
  const ownRequirements = [
    requirement({ id: 'epic-own', level: 'epic', title: 'Own epic' }),
    requirement({ id: 'story-own', parentId: 'epic-own' }),
    requirement({ id: 'flow-own', parentId: 'epic-own', title: 'Own flow', isFlow: true }),
    requirement({
      id: 'flow-own-ac',
      parentId: 'flow-own',
      level: 'ac',
      title: 'Own flow step',
      relatedRequirementIds: ['story-own'],
    }),
  ];
  const foreign = requirement({
    id: 'story-foreign',
    projectId: 'project-foreign',
    title: FOREIGN_SECRET,
    description: FOREIGN_SECRET,
  });
  return {
    listByProject: vi.fn((projectId: string) => projectId === 'project-own' ? ownRequirements : [foreign]),
    get: vi.fn((id: string) => id === foreign.id ? foreign : ownRequirements.find((item) => item.id === id)),
  };
}

describe('project-scoped data skills', () => {
  beforeEach(() => {
    clearQueryCache();
  });

  it('returns an ownership-safe error for foreign IDs across every requirement-backed tool', async () => {
    const repository = makeRequirementRepository();
    const calls = [
      [makeRequirementDetailQuery('project-own', [], repository), { requirementId: 'story-foreign' }],
      [makeRequirementGraphQuery('project-own', repository), { requirementId: 'story-foreign' }],
      [makeFlowDetailQuery('project-own', repository), { flowId: 'story-foreign' }],
      [makeCrossEpicImpactQuery('project-own', repository), { requirementId: 'story-foreign' }],
    ] as const;

    for (const [skill, input] of calls) {
      const result = await skill.func(input);
      expect(result).toEqual(expect.objectContaining({
        error: expect.stringMatching(/current project/i),
      }));
      expect(JSON.stringify(result)).not.toContain(FOREIGN_SECRET);
    }
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.listByProject).toHaveBeenCalledWith('project-own');
  });

  it('preserves current-project details for all converted factories', async () => {
    const repository = makeRequirementRepository();

    const detail = await makeRequirementDetailQuery('project-own', [], repository)
      .func({ requirementId: 'story-own' });
    const graph = await makeRequirementGraphQuery('project-own', repository)
      .func({ requirementId: 'story-own', flowId: 'flow-own' });
    const flow = await makeFlowDetailQuery('project-own', repository)
      .func({ flowId: 'flow-own' });
    const impact = await makeCrossEpicImpactQuery('project-own', repository)
      .func({ requirementId: 'story-own' });

    expect(detail).toEqual(expect.objectContaining({ id: 'story-own', title: 'Own story' }));
    expect(graph).toEqual(expect.objectContaining({
      seedRequirementIds: ['story-own'],
      selectedFlowIds: ['flow-own'],
    }));
    expect(flow).toEqual(expect.objectContaining({ id: 'flow-own', name: 'Own flow' }));
    expect(impact).toEqual(expect.objectContaining({ id: 'story-own', title: 'Own story' }));
  });

  it('does not disclose a foreign requirement after malicious HTML causes a second-round lookup', async () => {
    const repository = makeRequirementRepository();
    const requirementSkill = makeRequirementDetailQuery('project-own', [], repository);
    const htmlSkill = {
      name: 'html_knowledge_query',
      description: 'Retrieve HTML evidence',
      schema: z.object({ requirementIds: z.string() }),
      func: async () => MALICIOUS_EVIDENCE,
      summarizeForState: () => ({
        input: { requirementIds: ['story-own'], focus: 'all', maxResults: 5 },
        output: {
          resultChars: MALICIOUS_EVIDENCE.length,
          confidence: [],
          pageIds: [],
          chunkIds: [],
          omittedRequirementIds: [],
          truncated: false,
          cacheHit: false,
        },
      }),
    };
    const providerCalls: any[][] = [];
    const onToolCall = vi.fn();
    let round = 0;
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        providerCalls.push(structuredClone(messages));
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_call_start',
            toolCall: { id: 'html-1', name: 'html_knowledge_query', args: { requirementIds: 'story-own' } },
          };
          yield {
            type: 'tool_call_end',
            toolCall: { id: 'html-1', name: 'html_knowledge_query', args: { requirementIds: 'story-own' } },
          };
          return;
        }
        if (round === 2) {
          expect(JSON.stringify(messages)).toContain(MALICIOUS_EVIDENCE);
          yield {
            type: 'tool_call_start',
            toolCall: { id: 'requirement-1', name: 'requirement_detail_query', args: { requirementId: 'story-foreign' } },
          };
          yield {
            type: 'tool_call_end',
            toolCall: { id: 'requirement-1', name: 'requirement_detail_query', args: { requirementId: 'story-foreign' } },
          };
          return;
        }
        yield { type: 'content', content: '{"ok":true}' };
      }),
    } as any;

    const result = await callLLMWithStructuredOutput(
      provider,
      [{ role: 'system', content: 'system' }, { role: 'user', content: 'user' }],
      [htmlSkill, requirementSkill],
      {
        toolSchema: { type: 'object', properties: {} },
        shouldAttemptPhase1Extraction: () => true,
        normalize: (raw: unknown) => raw,
        parse: (raw: unknown) => raw,
        formatValidationError: () => 'invalid',
      } as any,
      { onToolCall },
      'test_analyst',
    );

    const finalConversation = JSON.stringify(providerCalls[2]);
    expect(finalConversation).toContain('current project');
    expect(finalConversation).not.toContain(FOREIGN_SECRET);
    expect(JSON.stringify(result.toolCallRecords)).not.toContain(FOREIGN_SECRET);
    expect(JSON.stringify(result.toolCallRecords)).not.toContain(MALICIOUS_EVIDENCE);
    expect(JSON.stringify(onToolCall.mock.calls)).not.toContain(FOREIGN_SECRET);
    expect(JSON.stringify(onToolCall.mock.calls)).not.toContain(MALICIOUS_EVIDENCE);
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.listByProject).toHaveBeenCalledWith('project-own');
  });

  it('rejects foreign IDs before reading previous-batch agent logs', async () => {
    const repository = makeRequirementRepository();
    const historyRepository = {
      getRun: vi.fn(() => ({ project_id: 'project-own' })),
      getAgentLogs: vi.fn(() => [{
        output_data: {
          testConditions: [{ requirementId: 'story-foreign', condition: FOREIGN_SECRET }],
          finalTestCases: [{ requirementId: 'story-foreign', title: FOREIGN_SECRET }],
        },
      }]),
    };
    const conditions = makePreviousBatchConditionsQuery(
      'run-1',
      'project-own',
      historyRepository,
      repository,
    );
    const cases = makePreviousBatchCasesQuery(
      'run-1',
      'project-own',
      historyRepository,
      repository,
    );

    const conditionResult = await conditions.func({ requirementId: 'story-foreign' });
    const caseResult = await cases.func({ requirementId: 'story-foreign' });

    expect(conditionResult).toEqual(expect.objectContaining({
      error: expect.stringMatching(/current project/i),
      conditions: [],
    }));
    expect(caseResult).toEqual(expect.objectContaining({
      error: expect.stringMatching(/current project/i),
      cases: [],
    }));
    expect(JSON.stringify([conditionResult, caseResult])).not.toContain(FOREIGN_SECRET);
    expect(historyRepository.getAgentLogs).not.toHaveBeenCalled();
  });
});
