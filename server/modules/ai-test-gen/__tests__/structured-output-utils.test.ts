import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  buildThinkingChatOptions,
  callLLMWithStructuredOutput,
  makeSchemaOpenAICompatible,
  zodToJsonSchema,
} from '../graph/nodes/utils.ts';
import { createAnalystOutputProfile } from '../graph/structured-output/analyst.ts';

describe('callLLMWithStructuredOutput', () => {
  it('does not advertise an unsupported structured-output tool during the thinking phase', () => {
    const options = buildThinkingChatOptions([
      {
        name: 'requirement_detail_query',
        description: 'Fetch requirement details',
        schema: z.object({ requirementId: z.string() }) as any,
      } as any,
    ]);

    expect(options.tools?.map((tool) => tool.name)).toEqual(['requirement_detail_query']);
  });

  it('normalizes phase 2 extraction before parsing', async () => {
    let callCount = 0;
    const provider = {
      streamChat: vi.fn(async function* () {
        if (callCount === 0) {
          callCount += 1;
          yield { type: 'content', content: 'analysis without tool call' };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }
        yield { type: 'content', content: '{"finalTestCases":{"a":{"id":"TC-2"}}}' };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => ({ finalTestCases: Object.values(raw.finalTestCases) })),
      parse: vi.fn((normalized: any) => normalized),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
    };

    const result: any = await callLLMWithStructuredOutput(
      provider,
      [],
      [],
      profile as any,
      undefined,
      'quality_manager',
    );

    expect(profile.normalize).toHaveBeenCalledWith({ finalTestCases: { a: { id: 'TC-2' } } });
    expect(profile.parse).toHaveBeenCalledWith({ finalTestCases: [{ id: 'TC-2' }] });
    expect(result.output.finalTestCases).toHaveLength(1);
  });

  it('treats a hallucinated structured-output tool call as unknown and continues to phase 2 extraction', async () => {
    const calls: any[][] = [];
    let streamIndex = 0;
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        calls.push(messages);
        streamIndex += 1;

        if (streamIndex === 1) {
          yield { type: 'content', content: 'analysis round with unsupported tool call' };
          yield { type: 'tool_call_start', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
          yield { type: 'tool_call_end', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        if (streamIndex === 2) {
          yield { type: 'content', content: 'continuing analysis after unsupported tool call' };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield { type: 'content', content: '{"finalTestCases":[{"id":"TC-1","title":"Verify login","conditionId":"C-1","requirementId":"REQ-1","priority":"high","category":"functional","techniqueApplied":"EP","preconditions":[],"testData":[],"steps":[{"stepNumber":1,"action":"Enter credentials","expected":"Values appear"}],"tags":[],"status":"approved","reviewSummary":"ok","changeLog":[]}]}' };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      shouldAttemptPhase1Extraction: (raw: unknown) => !!raw && typeof raw === 'object' && !Array.isArray(raw),
      normalize: vi.fn((raw: any) => raw),
      parse: vi.fn((normalized: any) => normalized),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
    };

    const result: any = await callLLMWithStructuredOutput(
      provider,
      [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'user prompt' }] as any,
      [],
      profile as any,
      undefined,
      'quality_manager',
    );

    expect(streamIndex).toBe(3);
    expect(result.output.finalTestCases).toHaveLength(1);

    const retryMessages = calls[1];
    const retryToolMessage = retryMessages.find((message) => message.role === 'tool');
    const retryToolPayload = JSON.parse(String(retryToolMessage.content));
    expect(String(retryToolPayload.error)).toContain('Unknown tool: "output_result"');
    expect(String(retryToolPayload.error)).toContain('Continue your analysis in plain text');

    const phase2Messages = calls[2];
    const lastMessage = phase2Messages[phase2Messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(String(lastMessage.content)).toContain('Based on the analysis above, output a single JSON object matching this schema.');
  });

  it('skips Phase 1 parsing when extracted JSON lacks the expected top-level wrapper', async () => {
    const calls: any[][] = [];
    let streamIndex = 0;
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        calls.push(messages);
        streamIndex += 1;

        if (streamIndex === 1) {
          yield {
            type: 'content',
            content: 'analysis text\n```json\n{"id":"C-1","requirementId":"REQ-1","condition":"Verify login","conditionType":"flow","flowStepRefs":[{"flowId":"F-login","sequence":2,"actionSummary":"Submit credentials"}],"category":"functional","priority":"high","riskLevel":"high","primaryTechnique":"Use Case Testing","secondaryTechniques":[],"techniqueRationale":"happy path","coverageDimensions":["authentication"],"dependencies":[]}\n```',
          };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield {
          type: 'content',
          content: '{"requirementAnalysis":{"overallApproach":"Use risk-based login analysis","riskAssessmentSummary":"Authentication is high risk"},"testConditions":[{"id":"C-1","requirementId":"REQ-1","condition":"Verify login","conditionType":"flow","flowStepRefs":[{"flowId":"F-login","sequence":2,"actionSummary":"Submit credentials"}],"category":"functional","priority":"high","riskLevel":"high","primaryTechnique":"Use Case Testing","secondaryTechniques":[],"techniqueRationale":"happy path","coverageDimensions":["authentication"],"dependencies":[]}]}',
        };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const result: any = await callLLMWithStructuredOutput(
      provider,
      [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'user prompt' }] as any,
      [],
      createAnalystOutputProfile(),
      undefined,
      'test_analyst',
    );

    expect(streamIndex).toBe(2);
    expect(result.output.testConditions).toHaveLength(1);
    const phase2Messages = calls[1];
    const lastMessage = phase2Messages[phase2Messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(String(lastMessage.content)).toContain('Based on the analysis above, output a single JSON object matching this schema.');
  });
});

describe('makeSchemaOpenAICompatible', () => {
  // Regression test: Azure strict response_format rejects schemas whose
  // `properties` contains a key not present in `required`. When a nested
  // object is `.optional()`, the outer wrapper gets `type: ["object", "null"]`
  // — and the recursion must STILL walk into the inner `properties` to add
  // every key to its own `required`. Earlier versions checked
  // `schema.type === 'object'` strictly, which failed after the wrap and
  // produced a schema that Azure rejected with
  // "Missing 'actionSummary'" (the actual symptom from tgr-... runs).
  it('walks into nested objects whose type was wrapped to ["object", "null"]', () => {
    const schema = z.object({
      coverageMatrix: z.object({
        rows: z.array(z.object({
          flowStepRef: z.object({
            flowId: z.string(),
            sequence: z.number(),
            actionSummary: z.string().optional(),
          }).optional(),
        })),
      }).optional(),
    });

    const fixed = makeSchemaOpenAICompatible(zodToJsonSchema(schema));

    // Navigate to the inner flowStepRef properties.
    const inner = (fixed as any).properties.coverageMatrix.properties.rows.items.properties.flowStepRef;
    expect(Array.isArray(inner.required)).toBe(true);
    // Every property in the inner object MUST be in its own `required`,
    // including the originally-optional `actionSummary`.
    expect(inner.required).toEqual(expect.arrayContaining(['flowId', 'sequence', 'actionSummary']));
    // The outer optional wrapper is now `["object", "null"]` and present
    // in the parent's required.
    expect(inner.type).toEqual(['object', 'null']);
    expect((fixed as any).required).toEqual(expect.arrayContaining(['coverageMatrix']));
  });

  it('emits every property key (including optional ones) into `required` at every level', () => {
    const schema = z.object({
      a: z.string().optional(),
      b: z.object({
        c: z.string().optional(),
        d: z.number().optional(),
      }),
    });

    const fixed = makeSchemaOpenAICompatible(zodToJsonSchema(schema)) as any;
    expect(fixed.required.sort()).toEqual(['a', 'b']);
    expect(fixed.properties.b.required.sort()).toEqual(['c', 'd']);
  });
});
