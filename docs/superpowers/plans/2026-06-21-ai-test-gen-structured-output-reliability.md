# AI Test Gen Structured Output Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor ai-test-gen structured output so provider-facing tool schemas, runtime normalization, and final domain validation are separated, reducing JSON-format failures across the three agents.

**Architecture:** Add a shared structured-output profile abstraction under `graph/structured-output/`, migrate `callLLMWithStructuredOutput()` to consume profiles instead of raw schemas, and move agent-specific normalization out of scattered `z.preprocess()` calls into explicit per-agent profiles. Verify the migration with focused unit tests for profile normalization and shared execution behavior.

**Tech Stack:** TypeScript, Zod, Vitest, LangGraph-adjacent graph nodes, provider tool-calling.

---

## File Map

### New files

- `server/modules/ai-test-gen/graph/structured-output/profile.ts`
  - Shared `StructuredOutputProfile<T>` interface and helper types.
- `server/modules/ai-test-gen/graph/structured-output/helpers.ts`
  - Reusable normalization helpers for `null`, arrays, numeric coercion, and wrapper repair.
- `server/modules/ai-test-gen/graph/structured-output/quality.ts`
  - Quality-manager profile with runtime normalization and final parser.
- `server/modules/ai-test-gen/graph/structured-output/designer.ts`
  - Designer profile with wrapper repair, array/map normalization, and final parser.
- `server/modules/ai-test-gen/graph/structured-output/analyst.ts`
  - Analyst profile with nullable optional-field normalization and final parser.
- `server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
  - Direct tests for `normalize + parse` on all three profiles.
- `server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`
  - Shared execution tests for `callLLMWithStructuredOutput()` and `output_result` handling.

### Modified files

- `server/modules/ai-test-gen/graph/nodes/utils.ts`
  - Replace raw-schema entry points with profile-based orchestration.
- `server/modules/ai-test-gen/graph/nodes/analyst.ts`
  - Swap local output schema usage for the analyst profile.
- `server/modules/ai-test-gen/graph/nodes/designer.ts`
  - Swap local output schema usage for the designer profile.
- `server/modules/ai-test-gen/graph/nodes/quality.ts`
  - Swap local output schema usage for the quality profile.

## Execution Notes

- This repo currently has unrelated uncommitted changes in `utils.ts`, `prompts.ts`, and `skills.ts`. Do not revert them.
- Do not create git commits unless the user explicitly asks for them.
- Keep the change surgical: no prompt redesign, no provider rewrite, no graph-topology changes.

### Task 1: Add Shared Structured-Output Profile Infrastructure

**Files:**
- Create: `server/modules/ai-test-gen/graph/structured-output/profile.ts`
- Create: `server/modules/ai-test-gen/graph/structured-output/helpers.ts`
- Test: `server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`

- [ ] **Step 1: Write the failing profile-helper tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  arrayFromRecordValues,
  coerceNumber,
  nullToEmptyArray,
  nullToUndefined,
  wrapSingleObjectInArray,
} from '../graph/structured-output/helpers.ts';

describe('structured-output helpers', () => {
  it('converts null to undefined', () => {
    expect(nullToUndefined(null)).toBeUndefined();
  });

  it('converts null to empty array', () => {
    expect(nullToEmptyArray(null)).toEqual([]);
  });

  it('converts record values to array', () => {
    expect(arrayFromRecordValues({ a: { id: '1' }, b: { id: '2' } })).toEqual([
      { id: '1' },
      { id: '2' },
    ]);
  });

  it('wraps a single object into an array', () => {
    expect(wrapSingleObjectInArray({ id: 'tc-1' })).toEqual([{ id: 'tc-1' }]);
  });

  it('coerces numeric text to number', () => {
    expect(coerceNumber('2', 1)).toBe(2);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
Expected: FAIL with module-not-found errors for `graph/structured-output/helpers.ts`.

- [ ] **Step 3: Write the shared profile interface**

```ts
export interface StructuredOutputProfile<T> {
  toolSchema: Record<string, unknown>;
  normalize(raw: unknown): unknown;
  parse(normalized: unknown): T;
  formatValidationError(error: unknown): string;
}
```

- [ ] **Step 4: Write the minimal normalization helpers**

```ts
export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

export function nullToEmptyArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function arrayFromRecordValues<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value as Record<string, T>);
  return [];
}

export function wrapSingleObjectInArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return [value as T];
  return [];
}

export function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
```

- [ ] **Step 5: Re-run the helper tests to verify they pass**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
Expected: PASS for the helper test block.

### Task 2: Migrate Quality Manager To A Shared Profile

**Files:**
- Create: `server/modules/ai-test-gen/graph/structured-output/quality.ts`
- Modify: `server/modules/ai-test-gen/graph/nodes/quality.ts`
- Test: `server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`

- [ ] **Step 1: Write the failing quality-profile tests**

```ts
import { describe, expect, it } from 'vitest';
import { qualityOutputProfile } from '../graph/structured-output/quality.ts';

describe('qualityOutputProfile', () => {
  it('normalizes finalTestCases record maps into arrays', () => {
    const parsed = qualityOutputProfile.parse(qualityOutputProfile.normalize({
      finalTestCases: {
        a: {
          id: 'TC-1',
          title: 'title',
          conditionId: 'C-1',
          requirementId: 'REQ-1',
          priority: 'high',
          category: 'functional',
          techniqueApplied: 'Equivalence Partitioning',
          preconditions: [],
          testData: [],
          steps: [{ stepNumber: '1', action: 'Click', expected: 'Done' }],
          tags: null,
          reviewSummary: 'ok',
          changeLog: [{ field: 'title', from: null, to: null, reason: 'keep' }],
        },
      },
    }));

    expect(parsed.finalTestCases).toHaveLength(1);
    expect(parsed.finalTestCases[0].steps[0].stepNumber).toBe(1);
    expect(parsed.finalTestCases[0].tags).toEqual([]);
    expect(parsed.finalTestCases[0].changeLog[0].from).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the profile tests to verify they fail**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
Expected: FAIL because `qualityOutputProfile` does not exist.

- [ ] **Step 3: Implement the quality profile with explicit normalize + parse**

```ts
const RuntimeSchema = z.object({
  finalTestCases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    conditionId: z.string(),
    requirementId: z.string(),
    priority: z.string(),
    category: z.string(),
    techniqueApplied: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(z.object({
      stepNumber: z.number(),
      action: z.string(),
      expected: z.string(),
    })),
    tags: z.array(z.string()).default([]),
    status: z.string().default('approved'),
    reviewSummary: z.string(),
    changeLog: z.array(z.object({
      field: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
      reason: z.string(),
    })).default([]),
  })).min(1),
});

export const qualityOutputProfile: StructuredOutputProfile<z.infer<typeof RuntimeSchema>> = {
  toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(RuntimeSchema)),
  normalize(raw) {
    const input = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
      finalTestCases: arrayFromRecordValues<Record<string, unknown>>(input.finalTestCases).map((tc) => ({
        ...tc,
        tags: nullToEmptyArray(tc.tags as string[] | null | undefined),
        steps: Array.isArray(tc.steps)
          ? tc.steps.map((step) => ({ ...step, stepNumber: coerceNumber((step as any).stepNumber, 1) }))
          : [],
        changeLog: nullToEmptyArray(tc.changeLog as Record<string, unknown>[] | null | undefined).map((change) => ({
          ...change,
          from: nullToUndefined(change.from as string | null),
          to: nullToUndefined(change.to as string | null),
        })),
      })),
    };
  },
  parse(normalized) {
    return RuntimeSchema.parse(normalized);
  },
  formatValidationError(error) {
    return formatZodValidationError(error, {
      finalTestCases: 'Provide finalTestCases as a non-empty array.',
    });
  },
};
```

- [ ] **Step 4: Switch `quality.ts` to use the new profile**

```ts
const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
  provider,
  messages,
  skills,
  qualityOutputProfile,
  { onStep: observer?.onStep, onThinking: observer?.onThinking },
  agentName,
  { signal: nodeSignal, agentName },
);
```

- [ ] **Step 5: Re-run profile tests to verify quality normalization passes**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
Expected: PASS for helper and quality profile tests.

### Task 3: Migrate Designer And Analyst Profiles

**Files:**
- Create: `server/modules/ai-test-gen/graph/structured-output/designer.ts`
- Create: `server/modules/ai-test-gen/graph/structured-output/analyst.ts`
- Modify: `server/modules/ai-test-gen/graph/nodes/designer.ts`
- Modify: `server/modules/ai-test-gen/graph/nodes/analyst.ts`
- Test: `server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`

- [ ] **Step 1: Write failing designer and analyst profile tests**

```ts
import { describe, expect, it } from 'vitest';
import { analystOutputProfile } from '../graph/structured-output/analyst.ts';
import { designerOutputProfile } from '../graph/structured-output/designer.ts';

describe('designerOutputProfile', () => {
  it('wraps a top-level test case object into draftTestCases', () => {
    const parsed = designerOutputProfile.parse(designerOutputProfile.normalize({
      id: 'TC-1',
      title: 'Login',
      conditionId: 'C-1',
      requirementId: 'REQ-1',
      priority: 'critical',
      category: 'functional',
      techniqueApplied: 'EP',
      preconditions: [],
      testData: [],
      steps: [{ stepNumber: '1', action: 'Enter', expected: 'Shown' }],
      postconditions: null,
      tags: null,
      selfReview: { score: '8', strengths: [], weaknesses: [], suggestions: [] },
    }));

    expect(parsed.draftTestCases).toHaveLength(1);
    expect(parsed.draftTestCases[0].postconditions).toEqual([]);
    expect(parsed.draftTestCases[0].selfReview.score).toBe(8);
  });
});

describe('analystOutputProfile', () => {
  it('normalizes nullable optional fields', () => {
    const parsed = analystOutputProfile.parse(analystOutputProfile.normalize({
      requirementAnalysis: {
        overallApproach: 'approach',
        riskAssessmentSummary: 'risk',
      },
      testConditions: [{
        id: 'C-1',
        requirementId: 'REQ-1',
        condition: 'condition',
        category: 'functional',
        priority: 'high',
        riskLevel: 'medium',
        primaryTechnique: 'EP',
        secondaryTechniques: [],
        techniqueRationale: 'because',
        coverageDimensions: [],
        dataRequirements: null,
        dependencies: null,
        requirementLevel: null,
      }],
    }));

    expect(parsed.testConditions[0].dataRequirements).toBeUndefined();
    expect(parsed.testConditions[0].dependencies).toEqual([]);
    expect(parsed.testConditions[0].requirementLevel).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the profile tests to verify they fail**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
Expected: FAIL because designer and analyst profiles do not exist.

- [ ] **Step 3: Implement the designer profile**

```ts
export const designerOutputProfile: StructuredOutputProfile<z.infer<typeof RuntimeSchema>> = {
  toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(RuntimeSchema)),
  normalize(raw) {
    const wrapped = wrapDesignerRoot(raw);
    const input = wrapped as Record<string, unknown>;
    return {
      draftTestCases: arrayFromRecordValues<Record<string, unknown>>(input.draftTestCases).map((tc) => ({
        ...tc,
        postconditions: nullToEmptyArray(tc.postconditions as string[] | null | undefined),
        tags: nullToEmptyArray(tc.tags as string[] | null | undefined),
        steps: Array.isArray(tc.steps)
          ? tc.steps.map((step) => ({ ...step, stepNumber: coerceNumber((step as any).stepNumber, 1) }))
          : [],
        selfReview: {
          ...(tc.selfReview as Record<string, unknown>),
          score: coerceNumber((tc.selfReview as any)?.score, 1),
        },
      })),
    };
  },
  parse(normalized) {
    return RuntimeSchema.parse(normalized);
  },
  formatValidationError(error) {
    return formatZodValidationError(error, {
      draftTestCases: 'Provide draftTestCases as a non-empty array.',
    });
  },
};
```

- [ ] **Step 4: Implement the analyst profile**

```ts
export const analystOutputProfile: StructuredOutputProfile<z.infer<typeof RuntimeSchema>> = {
  toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(RuntimeSchema)),
  normalize(raw) {
    const input = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
      requirementAnalysis: input.requirementAnalysis,
      testConditions: Array.isArray(input.testConditions)
        ? input.testConditions.map((condition) => ({
            ...(condition as Record<string, unknown>),
            dataRequirements: nullToUndefined((condition as any).dataRequirements),
            dependencies: nullToEmptyArray((condition as any).dependencies),
            requirementLevel: nullToUndefined((condition as any).requirementLevel),
          }))
        : [],
    };
  },
  parse(normalized) {
    return RuntimeSchema.parse(normalized);
  },
  formatValidationError(error) {
    return formatZodValidationError(error, {
      testConditions: 'Provide testConditions as an array with all required fields filled.',
    });
  },
};
```

- [ ] **Step 5: Switch `designer.ts` and `analyst.ts` to use profiles and remove provider-compat preprocess where redundant**

```ts
const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
  provider,
  messages,
  skills,
  designerOutputProfile,
  { onStep: observer?.onStep, onThinking: observer?.onThinking },
  agentName,
  { signal: nodeSignal, agentName },
);
```

```ts
const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
  provider,
  messages,
  skills,
  analystOutputProfile,
  { onStep: observer?.onStep, onThinking: observer?.onThinking },
  agentName,
  { signal: nodeSignal, agentName },
);
```

- [ ] **Step 6: Re-run profile tests to verify all three profiles pass**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
Expected: PASS for helper, quality, designer, and analyst profile tests.

### Task 4: Update Shared Execution And Add Retry-Path Tests

**Files:**
- Modify: `server/modules/ai-test-gen/graph/nodes/utils.ts`
- Test: `server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`

- [ ] **Step 1: Write failing shared-execution tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { callLLMWithStructuredOutput } from '../graph/nodes/utils.ts';

describe('callLLMWithStructuredOutput', () => {
  it('normalizes output_result payloads before parsing', async () => {
    const provider = {
      streamChat: vi.fn(async function* () {
        yield {
          type: 'tool_call_start',
          toolCall: { id: '1', name: 'output_result', args: {} },
        };
        yield {
          type: 'tool_call_end',
          toolCall: { id: '1', name: 'output_result', args: { finalTestCases: { a: { id: 'TC-1' } } } },
        };
        yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 } };
      }),
    } as any;

    const profile = {
      toolSchema: { type: 'object' },
      normalize: vi.fn((raw) => ({ finalTestCases: Object.values((raw as any).finalTestCases) })),
      parse: vi.fn((value) => value),
      formatValidationError: vi.fn(() => 'bad output'),
    };

    const result = await callLLMWithStructuredOutput(provider, [], [], profile as any, undefined, 'quality_manager');

    expect(profile.normalize).toHaveBeenCalled();
    expect(profile.parse).toHaveBeenCalledWith({ finalTestCases: [{ id: 'TC-1' }] });
    expect(result.output.finalTestCases).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the shared-execution tests to verify they fail**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`
Expected: FAIL because `callLLMWithStructuredOutput()` still expects a raw schema.

- [ ] **Step 3: Refactor `utils.ts` to orchestrate profiles instead of raw schemas**

```ts
export async function callLLMWithStructuredOutput<T>(
  provider: AIProvider,
  messages: ChatMessage[],
  skills: SkillDefinition[],
  profile: StructuredOutputProfile<T>,
  observer?: ..., 
  agentName?: string,
  extra?: Partial<ChatOptions>,
): Promise<{ output: T; usage: ...; toolCallRecords?: ... }> {
  // register output_result with profile.toolSchema
  // when output_result arrives: normalize -> parse
  // in Phase 2 extraction: normalize -> parse
  // on validation error: use profile.formatValidationError(error)
}
```

- [ ] **Step 4: Keep `zodToJsonSchema()` and strict-schema helpers shared, but remove agent-specific assumptions from `utils.ts`**

```ts
const outputTool = {
  name: 'output_result',
  description: 'Submit the final structured result...',
  strict: true,
  parameters: profile.toolSchema as any,
};
```

- [ ] **Step 5: Re-run the shared-execution tests**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`
Expected: PASS, with normalization happening before final parse.

### Task 5: Run The Targeted Ai-Test-Gen Test Slice

**Files:**
- Test: `server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/graph-compile.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/service.test.ts`

- [ ] **Step 1: Run the new structured-output test files together**

Run: `npm test -- server/modules/ai-test-gen/__tests__/structured-output-profiles.test.ts server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`
Expected: PASS.

- [ ] **Step 2: Run a small regression slice for ai-test-gen**

Run: `npm test -- server/modules/ai-test-gen/__tests__/graph-compile.test.ts server/modules/ai-test-gen/__tests__/service.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full ai-test-gen test folder if the targeted slice is clean**

Run: `npm test -- server/modules/ai-test-gen/__tests__`
Expected: PASS, or a narrow list of unrelated pre-existing failures that were not introduced by this work.

## Self-Review

- Spec coverage check:
  - shared profile abstraction: covered in Task 1 and Task 4
  - per-agent profiles: covered in Task 2 and Task 3
  - profile-based migration order: quality first, then designer and analyst
  - tests for normalization and shared execution: covered in Task 1, Task 2, Task 3, and Task 4
  - no graph/provider redesign: preserved across all tasks
- Placeholder scan:
  - no `TODO`, `TBD`, or deferred implementation markers remain
- Type consistency:
  - `StructuredOutputProfile<T>` and the profile filenames are used consistently across all tasks

Plan complete and saved to `docs/superpowers/plans/2026-06-21-ai-test-gen-structured-output-reliability.md`.

Execution mode selected for this session: Inline Execution, because the user explicitly asked to begin implementation now.
