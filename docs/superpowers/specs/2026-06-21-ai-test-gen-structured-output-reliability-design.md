# Design: AI Test Gen Structured Output Reliability

Date: 2026-06-21
Status: Draft for review
Owner: OpenCode

## 1. Problem

`ai-test-gen` currently runs three agents in sequence:

`Test Analyst -> Test Designer -> Quality Manager`

All three agents depend on the same structured-output path:

1. the model streams reasoning and tool calls
2. the model calls `output_result`
3. the server validates the submitted JSON with Zod
4. if validation fails, the server retries through Phase 2 extraction

In practice, generation often fails because the JSON shape accepted by the provider-facing tool schema is not identical to the JSON shape accepted by runtime validation.

The most important failure pattern is:

- tool schema allows or encourages `null`
- runtime schema still expects `undefined`, arrays, or wrapped objects
- the model submits data that looks schema-compliant from its perspective
- local validation still fails and the run burns retries

This is a reliability problem in the shared structured-output layer, not primarily a prompt-quality problem in one specific agent.

## 2. Goal

Refactor the shared structured-output layer so the three responsibilities are explicit and separated:

1. provider-facing output contract
2. runtime normalization of imperfect model output
3. final domain validation

The result should make malformed but recoverable model output succeed more often, while preserving strict business validation at the final boundary.

## 3. Non-Goals

This design does not change the following:

- agent order in the LangGraph pipeline
- agent business responsibilities
- `coverageMatrix` ownership in TypeScript
- provider selection strategy
- broad prompt rewriting or agent role redesign
- database schema or checkpoint storage format

## 4. Findings From Current Code

### 4.1 All three agents share one structured-output engine

The shared engine is in `server/modules/ai-test-gen/graph/nodes/utils.ts`.

It currently owns all of the following concerns at once:

- tool schema generation
- OpenAI strict-schema compatibility mutation
- ReAct loop execution
- `output_result` extraction
- runtime `outputSchema.parse(...)`
- Phase 2 extraction fallback
- validation-error feedback formatting

That means a schema mismatch affects all three agents simultaneously.

### 4.2 Tool compatibility and runtime validation are coupled but not equivalent

`makeSchemaOpenAICompatible()` mutates object schemas so that all properties are present in `required`, and optional properties are widened to accept `null`.

That is a provider compatibility layer.

Runtime Zod validation still uses agent-local schemas, some of which treat fields as optional but not nullable.

Examples from current code:

- `analyst.ts`
  - `dataRequirements?: string[]`
  - `requirementLevel?: string`
- `quality.ts`
  - `changeLog[].from?: string`
  - `changeLog[].to?: string`

This is the core mismatch.

### 4.3 Existing tolerance is scattered across agents

There is already partial tolerance in agent-local schemas, for example:

- wrapping a single designer case into `draftTestCases`
- converting object maps into arrays
- coercing `stepNumber`
- defaulting `postconditions`, `tags`, and `changeLog`

That tolerance helps, but it is spread across each agent schema and mixes business validation with provider cleanup behavior.

### 4.4 Current retry feedback is useful but still too late in the pipeline

The existing loop already retries after invalid `output_result` submissions and after Phase 2 failures.

However, retries still happen after the system has already treated the provider-facing schema and runtime schema as the same thing. That causes avoidable retry churn.

## 5. Design Overview

Introduce an explicit structured-output profile per agent.

Each profile defines three layers:

1. `toolSchema`
2. `normalize(raw)`
3. `parse(normalized)`

The shared engine should only orchestrate those layers. It should not know the field-level quirks of analyst, designer, or quality-manager outputs.

### 5.1 Target flow

```text
Agent domain contract
  -> build provider-facing tool schema
  -> receive raw tool/JSON output
  -> normalize recoverable shape problems
  -> validate final business contract
  -> persist to graph state
```

### 5.2 Layer responsibilities

#### Provider-facing output contract

Purpose:

- describe a shape the model can reliably submit through `output_result`
- remain compatible with provider strict mode requirements
- allow representational flexibility where providers commonly emit `null`

This layer is not the final source of truth for business validity.

#### Runtime normalization

Purpose:

- repair common, recoverable model output defects
- make provider quirks and model inconsistencies explicit
- produce a stable intermediate shape before final validation

Examples:

- `null -> undefined`
- `null -> []`
- object map -> `Object.values(...)`
- single object -> wrapped array
- missing wrapper object -> add wrapper
- numeric string -> number

#### Final domain validation

Purpose:

- enforce the actual business contract expected by the graph and downstream code
- reject outputs that are semantically incomplete or unusable

This layer stays strict.

## 6. Shared Interface

Add a new shared module for structured-output profiles.

Proposed shape:

```ts
export interface StructuredOutputProfile<T> {
  toolSchema: Record<string, unknown>;
  normalize(raw: unknown): unknown;
  parse(normalized: unknown): T;
  formatValidationError(error: unknown): string;
}
```

Notes:

- `toolSchema` is already provider-compatible and ready for `output_result`
- `normalize()` is the only place allowed to repair recoverable shape problems
- `parse()` performs final validation and returns typed output
- `formatValidationError()` centralizes model-facing retry messages per profile

## 7. File Layout

Add a new directory:

`server/modules/ai-test-gen/graph/structured-output/`

Planned files:

- `profile.ts`
  - shared interface and common types
- `helpers.ts`
  - common normalization helpers
- `analyst.ts`
  - analyst profile
- `designer.ts`
  - designer profile
- `quality.ts`
  - quality-manager profile

Keep `graph/nodes/utils.ts` as the orchestration layer, but make it depend on the new profile abstraction instead of raw agent-local Zod schemas.

## 8. Shared Helpers

Move common repair behaviors into reusable helpers so all three profiles use the same rules.

Expected helpers:

- `nullToUndefined(value)`
- `nullToEmptyArray(value)`
- `stringOrUndefined(value)`
- `arrayFromRecordValues(value)`
- `wrapSingleObjectInArray(value, predicate?)`
- `coerceNumber(value, fallback?)`
- `ensureObject(value, fallback?)`

Rules for helpers:

- they should be small and deterministic
- they should not silently invent business content
- they may repair shape, not semantics

For example:

- converting `"2"` to `2` is acceptable
- inventing a missing `title` is not

## 9. Agent Profiles

### 9.1 Analyst Profile

Final output shape remains:

```ts
{
  requirementAnalysis: {
    overallApproach: string;
    riskAssessmentSummary: string;
  };
  testConditions: Array<...>;
}
```

Normalization responsibilities:

- preserve the top-level wrapper
- accept `dataRequirements: null` and normalize to `undefined` or `[]`
- accept `requirementLevel: null` and normalize to `undefined`
- keep `dependencies` defaulting behavior explicit

This profile should not auto-invent missing `requirementAnalysis` content.

### 9.2 Designer Profile

Final output shape remains:

```ts
{
  draftTestCases: Array<...>;
}
```

Normalization responsibilities:

- if the model outputs one test-case object at top level, wrap it into `draftTestCases`
- if `draftTestCases` is an object map, convert to array
- if `stepNumber` is a numeric string, coerce to number
- if `postconditions` or `tags` is `null`, normalize to `[]`
- if `selfReview.score` is numeric text, coerce it

The profile still requires at least one test case after normalization.

### 9.3 Quality Manager Profile

Final output shape remains:

```ts
{
  finalTestCases: Array<...>;
}
```

Normalization responsibilities:

- if `finalTestCases` is an object map, convert to array
- if `changeLog[].from` or `changeLog[].to` is `null`, normalize to `undefined`
- if `status` is absent, allow the final schema to default it to `approved`
- normalize `tags` and `changeLog` null-ish values to arrays

`coverageMatrix` remains computed in TypeScript and should stay outside model output.

## 10. Changes To Shared Execution

Change the main shared entry point from raw schema input to profile input.

Current shape:

```ts
callLLMWithStructuredOutput(provider, messages, skills, outputSchema, ...)
```

Target shape:

```ts
callLLMWithStructuredOutput(provider, messages, skills, profile, ...)
```

### 10.1 Output tool registration

`output_result` should use `profile.toolSchema`, not a schema generated directly from runtime Zod validation.

### 10.2 Validation flow

When `output_result` is called:

1. parse tool arguments as raw JSON
2. run `profile.normalize(raw)`
3. run `profile.parse(normalized)`
4. if success, store the parsed result
5. if failure, use `profile.formatValidationError(...)` for retry feedback

Apply the same normalize-then-parse flow in Phase 2 extraction.

### 10.3 Error feedback

Feedback should describe the failing field path and expected shape, but avoid leaking internal implementation details.

Examples of profile-specific error guidance:

- use `[]` instead of `null` for array fields
- include wrapper object `draftTestCases`
- `changeLog.from` may be omitted but should not remain an incompatible null shape after normalization

## 11. Migration Plan

Use an incremental rollout inside the same branch.

### Step 1: Introduce the shared profile abstraction

- add the new `structured-output` directory
- add helpers and interface
- do not change agent behavior yet

### Step 2: Migrate `quality_manager`

Reason:

- smallest output surface
- clearest null-handling failures
- least entangled shape normalization

### Step 3: Migrate `test_designer`

Reason:

- highest normalization value
- already contains the most agent-local repair behavior today

### Step 4: Migrate `test_analyst`

Reason:

- structurally simpler than designer
- but sits at the front of the pipeline, so migrate after shared behavior is proven

### Step 5: Remove old scattered preprocessing

- delete agent-local preprocess logic that only exists for provider compatibility
- keep only true business validation at agent level
- remove shared special cases from `utils.ts` that belong in profiles

## 12. Test Strategy

This refactor must be guarded mostly by deterministic unit tests, not by live provider runs.

### 12.1 Profile unit tests

Add direct tests for each profile's `normalize + parse` behavior.

Cases to cover:

- optional string field receives `null`
- optional array field receives `null`
- top-level wrapper is missing
- array is returned as object map
- `stepNumber` is returned as string
- `changeLog.from/to` is `null`

These tests should not depend on provider mocks.

### 12.2 Shared structured-output engine tests

Add tests around `callLLMWithStructuredOutput` to prove:

- output-tool submissions are normalized before validation
- Phase 2 extraction also uses normalize before validation
- retry feedback includes useful field-level guidance

### 12.3 Lightweight agent-level regression tests

Use fake provider responses to simulate common bad shapes and verify that the agent still returns valid internal state.

The aim is not full LangGraph E2E coverage. The aim is regression protection for the failure modes this refactor targets.

## 13. Success Criteria

The refactor is successful when all of the following are true:

- the shared engine no longer treats provider contract and runtime domain validation as the same layer
- the three agents use explicit structured-output profiles
- recoverable shape errors are repaired in normalization instead of failing at final parse
- `null vs optional` mismatches no longer consume retries unnecessarily
- logs and failures clearly indicate whether the fault is:
  - invalid JSON syntax
  - recoverable shape mismatch
  - final business validation failure

## 14. Risks And Tradeoffs

### 14.1 Slightly more code in the shared layer

This design adds files and one abstraction. That is intentional. The complexity already exists today, but it is hidden inside mismatched schemas and scattered preprocessors.

### 14.2 Risk of over-normalization

Normalization must stay conservative. If it becomes too permissive, the system may accept low-quality data that should have failed.

Rule:

- normalize representation
- do not normalize away missing meaning

### 14.3 Temporary mixed state during migration

During rollout, some agents may still rely on old schema paths while others use profiles. The implementation should keep this transition short and covered by tests.

## 15. Out Of Scope But Worth Tracking

These may become follow-up work if failure data still shows gaps after this refactor:

- provider-specific tool-call argument recovery hardening
- prompt examples that explicitly document null-vs-array expectations
- metrics around per-agent structured-output failure categories
- replay fixtures captured from real failed runs

## 16. Recommended Implementation Order

1. add structured-output profile interface and helpers
2. migrate quality-manager profile and tests
3. migrate designer profile and tests
4. migrate analyst profile and tests
5. remove old scattered preprocessing
6. run targeted `vitest` coverage for ai-test-gen structured-output paths

## 17. Review Checklist

Before implementation, verify that this spec remains aligned with these constraints:

- no change to graph topology
- no change to agent responsibilities
- no persistence format changes
- no broad prompt rewrite
- no provider rewrite unless tests prove a blocking argument-recovery bug
