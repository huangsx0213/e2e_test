# Design: Stagehand-Friendly NlTestCase

Date: 2026-06-19
Status: Reviewed / simplified
Owner: TBD
Related Plan: `docs/superpowers/plans/2026-06-19-stagehand-ready-nl-case-unification.md`

## 1. Problem

The current chain is:

`AI Test Gen -> NlTestCase -> Stagehand -> Recording Engine -> TestStep`

The weak point is still `NlTestCase`.

Today it is too free-form for reliable AI-driven recording:

- prompts still generate `testData: string[]`
- step actions are free prose like `Enter valid password and click Login`
- `AIRecordingSession` sends `nlStep.action` directly into `stagehand.act()`
- start URL is guessed from `preconditions` and `testData`

That combination hurts first-pass success more than any missing type-level strictness.

## 2. Goal

Make `NlTestCase` more Stagehand-friendly while keeping it an **intent-first natural-language test case**, not a strongly typed replay script.

This design is intentionally small:

- extend the existing contract with a few optional fields
- guide the LLM toward a Stagehand-friendly shape
- let `AIRecordingSession` prefer structured fields when present
- keep the recording engine and TestBuilder untouched

## 3. Non-Goals

This round does **not** do the following:

- no new sibling type such as `StagehandReadyNlTestCase`
- no `WebUiAction` enum contract or DB enum enforcement
- no standalone Quality Scorer / hard gate / `stagehandScore`
- no new assertion protocol such as `assertionStrategy`
- no recorder-engine work to materialize standalone assertion steps
- no UI gating changes based on a new score

## 4. Review Findings From Current Code

### 4.1 Storage is single-row JSON, not split child tables

`natural_language_test_cases` stores `test_data` and `steps` as JSON text blobs.

Evidence:

- `server/migrations/013_ai_test_gen_schema.ts`
- `server/modules/nl-cases/repository.ts`

Implication:

- `testData[].secret`
- `steps[].description`
- `steps[].target`
- `steps[].data`

can all be persisted without new SQL columns.

### 4.2 `startUrl` is the only new field that truly needs a column

`repository.save()` only writes known top-level columns. A new top-level `startUrl` therefore needs a `start_url` column if it must survive a save/load round trip.

### 4.3 Strong enum action modeling is not the bottleneck

The real failure modes are:

- multi-action steps
- missing target/data structure
- weak expected results
- fragile start URL discovery

Adding a 24-item enum, scorer, hard-gate, and extra status flow does not solve the core issue proportionally.

### 4.4 Separate `assert*` steps are the wrong primary path

`AIRecordingSession` already validates each step through `expected` and `extract()`. Meanwhile the recorder engine does not materialize pure assertions as recorded `TestStep`s.

So the simplest design is: **do not encourage standalone assertion steps in this round**. Put the verification in `expected` on the action step instead.

## 5. Design Decisions

### 5.1 Extend `NlTestCase` in place

Additive, optional fields are enough. No sibling type is needed.

```ts
export interface NlTestCaseTestData {
  key: string;
  value: string;
  description: string;
  secret?: boolean;
}

export interface NlTestCaseStep {
  sequence: number;
  description?: string;
  action: string;
  target?: string;
  data?: string;
  expected: string;
}

export interface NlTestCase {
  // existing fields
  startUrl?: string;
}
```

### 5.2 Keep `action` as `string`

`action` stays open because:

- current code already treats it that way
- older cases rely on that flexibility
- Stagehand reliability comes more from `description/target/data/expected` than from enum purity

This design still encourages a preferred vocabulary, but only at the prompt and helper level.

### 5.3 Prefer a small, human-semantic action vocabulary

The prompt should recommend a small set of high-value actions:

- `goto`
- `click`
- `fill`
- `press`
- `selectOption`
- `check`
- `uncheck`
- `hover`
- `setInputFiles`

These are close enough to Stagehand input phrasing, without forcing the NL case to become a strict action DSL.

### 5.4 Keep assertions inside `expected`

The step remains action-first:

- `action`: what the user does
- `description`: one short human-readable summary
- `target`: where the action lands
- `data`: what value is used
- `expected`: what should be observed afterward

That means no new first-class assertion-step design in this PR.

### 5.5 No new scorer in this round

The existing system already has review stages (`selfReview`, `quality_manager`).

This round should improve the case structure itself, not add a second quality subsystem. If later runs show persistent drift, a lightweight lint helper can be considered separately.

## 6. Authoring Format

The prompts should introduce a short Stagehand-friendly case format section.

### 6.1 Rules

1. One action per step.
2. Add a one-sentence `description` for readability.
3. Use `target` for the page element or page object.
4. Use `data` for input values and prefer `${key}` references into `testData`.
5. Keep `expected` observable and short.
6. Prefer `startUrl` for the initial page.
7. Do not split pure assertions into separate steps unless absolutely necessary.

### 6.2 Example

```json
{
  "startUrl": "${loginUrl}",
  "testData": [
    { "key": "loginUrl", "value": "https://app.example.com/login", "description": "Login page URL" },
    { "key": "username", "value": "alice@example.com", "description": "Valid username" },
    { "key": "password", "value": "P@ssw0rd!", "description": "Valid password", "secret": true }
  ],
  "steps": [
    {
      "sequence": 1,
      "description": "Enter the valid username into the username field.",
      "action": "fill",
      "target": "username field",
      "data": "${username}",
      "expected": "username field shows the entered value"
    },
    {
      "sequence": 2,
      "description": "Enter the valid password into the password field.",
      "action": "fill",
      "target": "password field",
      "data": "${password}",
      "expected": "password field keeps the value masked"
    },
    {
      "sequence": 3,
      "description": "Click the Login button.",
      "action": "click",
      "target": "Login button",
      "expected": "dashboard page is shown"
    }
  ]
}
```

## 7. Stagehand Consumer Upgrade

The consumer change stays local to `agent/recorder/ai-recording-session.ts`.

### 7.1 Start URL resolution

Resolution order:

1. `nlCase.startUrl`
2. first-step `goto` using `step.data` or `step.target` if it is a URL
3. legacy `resolveStartUrl()` fallback over `preconditions` and `testData`

If all three are absent, the session should not throw. It should continue on the current page.

### 7.2 Structured instruction composition

Add a small local helper in `AIRecordingSession` to compose Stagehand instructions when `action/target/data` are present:

| action | instruction |
|---|---|
| `goto` | `Navigate to ${dataOrTarget}.` |
| `click` | `Click ${target}.` |
| `fill` | `Type "${data}" into ${target}.` |
| `press` | `Press ${data ?? 'Enter'} on ${target}.` |
| `selectOption` | `Select "${data}" in ${target}.` |
| `check` | `Check ${target}.` |
| `uncheck` | `Uncheck ${target}.` |
| `hover` | `Hover over ${target}.` |
| `setInputFiles` | `Upload ${data} to ${target}.` |
| unknown | fall back to existing `act(nlStep.action)` |

`description` is for readability and logging, not the main runtime input.

### 7.3 `${key}` substitution

Before calling `act()`, substitute `${key}` using `testData[key].value`.

This is enough to make Stagehand see concrete values while letting the NL case stay parameterized.

### 7.4 Verification stays unchanged

Keep the current `expected -> extract()` flow. No new assertion strategy layer is introduced.

### 7.5 Secret handling

Use explicit `secret: true` first. Keep the regex backstop for older rows.

## 8. Repository and Migration

### 8.1 Migration scope

Only one SQL column is needed:

| Table | Column | Type |
|---|---|---|
| `natural_language_test_cases` | `start_url` | TEXT NULL |

### 8.2 JSON fields remain JSON fields

No columns are needed for:

- `testData[].secret`
- `steps[].description`
- `steps[].target`
- `steps[].data`

The repository already serializes `testData` and `steps` as JSON.

### 8.3 No back-fill

Older rows remain valid:

- no `startUrl` -> legacy fallback
- no `secret` -> regex fallback
- no `description/target/data` -> raw action fallback

## 9. Prompt / Schema Changes

`designer.ts` and `quality.ts` should accept the new step/testData shape.

That means:

- `testData` becomes an array of objects instead of `string[]`
- step schema accepts `description`, `target`, `data`
- examples in prompts should show structured steps instead of prose-only actions

This design intentionally does **not** expand scope to clean up the historical `selfReview` and quality-status inconsistencies already present elsewhere.

## 10. Verification

Use representative tests, not exhaustive mechanical matrices.

### 10.1 Repository

- save/load round trip keeps `startUrl`
- JSON round trip keeps `description/secret/target/data`
- old rows still normalize correctly

### 10.2 Prompt / schema

- designer output accepts structured steps
- quality output accepts structured steps
- `${key}` examples remain valid through parsing

### 10.3 AI recording session

- `startUrl` beats fallback URL detection
- `goto/fill/click` compose correctly
- `${key}` substitution works
- unknown action still uses raw `nlStep.action`
- missing URL no longer throws

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LLM still emits prose-only actions | Keep raw `act(nlStep.action)` fallback |
| Structured instructions are imperfect | Support only a small set of common actions first |
| Older cases lack new fields | All fields are optional and legacy paths remain |
| `startUrl` schema change creates migration risk | Migration is additive and only one column |

## 12. Resulting Scope

This design reduces the original proposal to three meaningful slices:

1. Extend `NlTestCase` with `startUrl`, `description`, `secret`, `target`, `data`
2. Update prompts/schemas to generate that shape
3. Let `AIRecordingSession` consume it before falling back to legacy behavior

That is the smallest design that materially improves AI-driven recording quality without introducing a second governance system around NL cases.
