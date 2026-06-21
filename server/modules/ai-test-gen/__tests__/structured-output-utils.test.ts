import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { buildThinkingChatOptions, callLLMWithStructuredOutput } from '../graph/nodes/utils.ts';
import { analystOutputProfile } from '../graph/structured-output/analyst.ts';

describe('callLLMWithStructuredOutput', () => {
  it('does not advertise output_result during the thinking phase', () => {
    const profile = {
      toolSchema: { type: 'json_schema', name: 'quality_output', schema: { type: 'object' }, strict: true },
      normalize: (raw: unknown) => raw,
      parse: (normalized: unknown) => normalized,
      formatValidationError: () => 'Schema validation failed',
    };

    const options = buildThinkingChatOptions([
      {
        name: 'requirement_detail_query',
        description: 'Fetch requirement details',
        schema: z.object({ requirementId: z.string() }) as any,
      } as any,
    ], profile as any);

    expect(options.tools?.map((tool) => tool.name)).toEqual(['requirement_detail_query']);
  });

  it('normalizes output_result payloads before parsing', async () => {
    const provider = {
      streamChat: vi.fn(async function* () {
        yield { type: 'tool_call_start', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
        yield {
          type: 'tool_call_end',
          toolCall: {
            id: 'tool-1',
            name: 'output_result',
            args: { finalTestCases: { a: { id: 'TC-1' } } },
          },
        };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => ({ finalTestCases: Object.values(raw.finalTestCases) })),
      parse: vi.fn((normalized: any) => normalized),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
    };

    const result = await callLLMWithStructuredOutput(
      provider,
      [],
      [],
      profile as any,
      undefined,
      'quality_manager',
    );

    expect(profile.normalize).toHaveBeenCalledWith({ finalTestCases: { a: { id: 'TC-1' } } });
    expect(profile.parse).toHaveBeenCalledWith({ finalTestCases: [{ id: 'TC-1' }] });
    expect(result.output.finalTestCases).toHaveLength(1);
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

    const result = await callLLMWithStructuredOutput(
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

  it('feeds the rejected submission back to the model on output_result validation failure', async () => {
    const calls: any[][] = [];
    let parseAttempt = 0;
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        calls.push(messages);
        if (calls.length === 1) {
          yield { type: 'tool_call_start', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
          yield {
            type: 'tool_call_end',
            toolCall: {
              id: 'tool-1',
              name: 'output_result',
              args: {
                requirementAnalysis: { overallApproach: 'risk-based', riskAssessmentSummary: 'high risk' },
                testConditions: [{ id: 'C-1', condition: 'Verify login', priority: 'high' }],
              },
            },
          };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield { type: 'tool_call_start', toolCall: { id: 'tool-2', name: 'output_result', args: {} } };
        yield {
          type: 'tool_call_end',
          toolCall: {
            id: 'tool-2',
            name: 'output_result',
            args: {
              requirementAnalysis: { overallApproach: 'risk-based', riskAssessmentSummary: 'high risk' },
              testConditions: [{
                id: 'C-1',
                requirementId: 'REQ-1',
                condition: 'Verify login',
                category: 'functional',
                priority: 'high',
                riskLevel: 'high',
                primaryTechnique: 'EP',
                secondaryTechniques: [],
                techniqueRationale: 'covers valid partition',
                coverageDimensions: [],
              }],
            },
          },
        };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const validationError = Object.assign(new Error('missing required fields'), {
      issues: [{
        path: ['testConditions', 0, 'category'],
        message: 'Invalid input: expected string, received undefined',
      }],
    });

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => raw),
      parse: vi.fn((normalized: any) => {
        parseAttempt += 1;
        if (parseAttempt === 1) throw validationError;
        return normalized;
      }),
      formatValidationError: vi.fn(() => 'Schema validation failed with 1 error(s):\n- testConditions.0.category: Invalid input: expected string, received undefined. Set category explicitly.'),
    };

    await callLLMWithStructuredOutput(
      provider,
      [],
      [],
      profile as any,
      undefined,
      'test_analyst',
    );

    const retryMessages = calls[1];
    const retryToolMessage = retryMessages.find((message) => message.role === 'tool');

    expect(retryToolMessage.content).toContain('submitted');
    expect(retryToolMessage.content).toContain('testConditions');
    expect(retryToolMessage.content).toContain('Verify login');
  });

  it('uses profile-specific guidance for empty object submissions', async () => {
    const calls: any[][] = [];
    let parseAttempt = 0;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        calls.push(messages);
        if (calls.length === 1) {
          yield { type: 'tool_call_start', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
          yield { type: 'tool_call_end', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield { type: 'tool_call_start', toolCall: { id: 'tool-2', name: 'output_result', args: {} } };
        yield {
          type: 'tool_call_end',
          toolCall: {
            id: 'tool-2',
            name: 'output_result',
            args: {
              draftTestCases: [{
                id: 'TC-1',
                title: 'Verify login',
                conditionId: 'C-1',
                requirementId: 'REQ-1',
                priority: 'high',
                category: 'functional',
                techniqueApplied: 'EP',
                preconditions: [],
                testData: [],
                steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Values appear' }],
                postconditions: [],
                tags: [],
                selfReview: { score: 8, strengths: [], weaknesses: [], suggestions: [] },
              }],
            },
          },
        };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => raw),
      parse: vi.fn((normalized: any) => {
        parseAttempt += 1;
        if (parseAttempt === 1) {
          throw Object.assign(new Error('empty object'), { issues: [{ path: [], message: 'Empty object' }] });
        }
        return normalized;
      }),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
      formatEmptySubmissionError: vi.fn(() => 'Submit {"draftTestCases":[{"id":"TC-1","title":"..."}]} with at least one fully populated test case.'),
    };

    await callLLMWithStructuredOutput(
      provider,
      [],
      [],
      profile as any,
      undefined,
      'test_designer',
    );

    const retryMessages = calls[1];
    const retryToolMessage = retryMessages.find((message) => message.role === 'tool');

    expect(retryToolMessage.content).toContain('draftTestCases');
    expect(retryToolMessage.content).toContain('fully populated test case');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[react:test_designer] output_result empty submission:'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('draftTestCases'));

    warnSpy.mockRestore();
  });

  it('logs output_result raw argument diagnostics before validation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const provider = {
      streamChat: vi.fn(async function* () {
        yield { type: 'tool_call_start', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
        yield { type: 'tool_call_end', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => raw),
      parse: vi.fn(() => {
        throw Object.assign(new Error('empty object'), { issues: [{ path: [], message: 'Empty object' }] });
      }),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
      formatEmptySubmissionError: vi.fn(() => 'Submit {"finalTestCases":[...]}'),
    };

    await expect(callLLMWithStructuredOutput(
      provider,
      [],
      [],
      profile as any,
      undefined,
      'quality_manager',
    )).rejects.toThrow('LLM produced no content in thinking phase');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[react:quality_manager] output_result raw args keys=[] isEmpty=true'));
    logSpy.mockRestore();
  });

  it('falls back to phase 2 after repeated empty submissions and carries the react conversation forward', async () => {
    const calls: any[][] = [];
    let streamIndex = 0;
    let parseAttempt = 0;
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        calls.push(messages);
        streamIndex += 1;

        if (streamIndex <= 3) {
          yield { type: 'content', content: `analysis round ${streamIndex}` };
          yield { type: 'tool_call_start', toolCall: { id: `tool-${streamIndex}`, name: 'output_result', args: {} } };
          yield { type: 'tool_call_end', toolCall: { id: `tool-${streamIndex}`, name: 'output_result', args: {} } };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield { type: 'content', content: '{"finalTestCases":[{"id":"TC-1","title":"Verify login","conditionId":"C-1","requirementId":"REQ-1","priority":"high","category":"functional","techniqueApplied":"EP","preconditions":[],"testData":[],"steps":[{"stepNumber":1,"action":"Enter credentials","expected":"Values appear"}],"tags":[],"status":"approved","reviewSummary":"ok","changeLog":[]}]}' };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => raw),
      parse: vi.fn((normalized: any) => {
        parseAttempt += 1;
        if (parseAttempt <= 3) {
          throw Object.assign(new Error('empty object'), { issues: [{ path: [], message: 'Empty object' }] });
        }
        return normalized;
      }),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
      formatEmptySubmissionError: vi.fn(() => 'Submit {"finalTestCases":[...]} with at least one fully populated reviewed case.'),
    };

    const result = await callLLMWithStructuredOutput(
      provider,
      [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'user prompt' }] as any,
      [],
      profile as any,
      undefined,
      'quality_manager',
    );

    expect(streamIndex).toBe(4);
    expect(result.output.finalTestCases).toHaveLength(1);

    const phase2Messages = calls[3];
    const lastMessage = phase2Messages[phase2Messages.length - 1];
    expect(phase2Messages.some((message) => message.role === 'tool')).toBe(true);
    expect(phase2Messages.some((message) => message.role === 'assistant' && Array.isArray(message.toolCalls))).toBe(true);
    expect(lastMessage.role).toBe('user');
    expect(String(lastMessage.content)).toContain('Based on the analysis above, output a single JSON object matching this schema.');
  });

  it('skips empty-object retry and goes straight to phase 2 when output_result is malformed in provider fallback', async () => {
    const calls: any[][] = [];
    let streamIndex = 0;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = {
      streamChat: vi.fn(async function* (messages: any[]) {
        calls.push(messages);
        streamIndex += 1;

        if (streamIndex === 1) {
          yield { type: 'content', content: 'analysis round with malformed output_result' };
          yield { type: 'tool_call_start', toolCall: { id: 'tool-1', name: 'output_result', args: {} } };
          yield {
            type: 'tool_call_end',
            toolCall: {
              id: 'tool-1',
              name: 'output_result',
              args: {},
              malformed: {
                source: 'responses_stream_end',
                rawArgsLength: 24,
                rawArgsPreview: '{"finalTestCases":[{"id"',
                parseError: 'SyntaxError: Unexpected end of JSON input',
              },
            },
          };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield { type: 'content', content: '{"finalTestCases":[{"id":"TC-1","title":"Verify login","conditionId":"C-1","requirementId":"REQ-1","priority":"high","category":"functional","techniqueApplied":"EP","preconditions":[],"testData":[],"steps":[{"stepNumber":1,"action":"Enter credentials","expected":"Values appear"}],"tags":[],"status":"approved","reviewSummary":"ok","changeLog":[]}]}' };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object', properties: {} },
      normalize: vi.fn((raw: any) => raw),
      parse: vi.fn((normalized: any) => normalized),
      formatValidationError: vi.fn(() => 'Schema validation failed'),
      formatEmptySubmissionError: vi.fn(() => 'Submit {"finalTestCases":[...]} with at least one fully populated reviewed case.'),
    };

    const result = await callLLMWithStructuredOutput(
      provider,
      [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'user prompt' }] as any,
      [],
      profile as any,
      undefined,
      'quality_manager',
    );

    expect(streamIndex).toBe(2);
    expect(result.output.finalTestCases).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('malformed output_result arguments from provider fallback'));

    const phase2Messages = calls[1];
    const lastMessage = phase2Messages[phase2Messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(String(lastMessage.content)).toContain('Based on the analysis above, output a single JSON object matching this schema.');
    warnSpy.mockRestore();
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
            content: 'analysis text\n```json\n{"id":"C-1","requirementId":"REQ-1","condition":"Verify login","category":"functional","priority":"high","riskLevel":"high","primaryTechnique":"Use Case Testing","secondaryTechniques":[],"techniqueRationale":"happy path","coverageDimensions":[],"dependencies":[]}\n```',
          };
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
          return;
        }

        yield {
          type: 'content',
          content: '{"requirementAnalysis":{"overallApproach":"Use risk-based login analysis","riskAssessmentSummary":"Authentication is high risk"},"testConditions":[{"id":"C-1","requirementId":"REQ-1","condition":"Verify login","category":"functional","priority":"high","riskLevel":"high","primaryTechnique":"Use Case Testing","secondaryTechniques":[],"techniqueRationale":"happy path","coverageDimensions":[],"dependencies":[]}]}',
        };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const result = await callLLMWithStructuredOutput(
      provider,
      [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'user prompt' }] as any,
      [],
      analystOutputProfile,
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
