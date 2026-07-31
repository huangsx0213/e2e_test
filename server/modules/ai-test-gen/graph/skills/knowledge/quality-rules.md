---
name: quality_rules
description: Load the complete review rules for the Quality Manager role (9 review dimensions, review discipline, coverage matrix F27, F17 component-vs-flow redundancy, D2 cross-batch redundancy). Use when you are about to review draft test cases — MANDATORY: call before reviewing any cases.
---

# Quality Rules — Review Dimensions & Coverage Matrix Guidelines

## Review Dimensions (checklist, not a vibe check)

1. **Clarity (Step Atomicity — hard constraint)** — Every step MUST satisfy: only one verb (Enter/Click/Type/Submit/...), a single target (never a group), input values live inside the step's own `action` (NOT deferred to a later step as a "with X/Y" suffix), and `expected` is a machine-detectable observation. If any check fails, split the step and rewrite the case with `status: approved_with_changes`, recording the split reason in `changeLog`. Typical error patterns: `"Submit the login form with admin/admin123"`, `"Enter username and password"`, `"Click login and verify dashboard appears"`, `"Fill out the form with valid data and submit"`, `"Set username to admin and password to p@ss then click submit"`.

2. **Completeness** — Does the case's technique application satisfy what that technique actually requires (BVA names the real boundary; Decision Table states every condition input for its rule; EP is paired with its complementary partition elsewhere in the set)? If the condition includes specific data variants, does the test case explicitly test those variants? Across the requirement's full case set, is there both happy-path AND negative/error/boundary coverage?

3. **Correctness** — Do expected results match what the requirement/acceptance criteria actually specify — not merely what "sounds plausible"? Flag results that contradict or extrapolate beyond the requirement text.

4. **Traceability** — Every case MUST list its primary condition in `coveredConditions`. A `conditionId` that is NOT in `coveredConditions` is a defect. For flow conditions whose `flowStepRefs` exists, the case's steps should mirror the flow's actual sequence (`sequence` order).

5. **Data Validity** — Is test data concrete, realistic, and technique-correct (partition/boundary explicitly named, per the Designer's annotations)? Flag placeholder-looking data ("test123", "foo") that doesn't represent a real partition or boundary.

6. **Maintainability** — Are preconditions self-contained, with no hidden dependency on another case's side effects, and are steps free of brittle over-specific selectors while still concrete enough to execute?

7. **Test Level Fidelity** — The `testLevel` is set by the Designer and MUST be preserved — do NOT flip a case from `component` to `integration` or vice versa. Your job is to check whether the **steps actually honor** the declared level: an `integration` case MUST traverse 2+ components/modules/systems and assert the downstream state change (not just the boundary response); a `component` case MUST stay within a single component and not assert side effects in other components. If the steps don't match the level, **fix the steps** (add/remove cross-component assertions) and set `status` to `approved_with_changes` — never change `testLevel` itself. Integration cases must also have a non-empty `referencedComponentConditions`; if empty, that is a defect.

8. **Redundancy (F17 — anti-overlap between component and flow cases, hard check)** — For each requirement that has BOTH a `component` case AND an `integration` (flow) case, compare the integration case's `steps[].expected` against every component case's `steps[].expected` (using token overlap, not just your gut). If the integration case re-asserts the atomic behavior the component case already covers, that is a redundancy defect: **fix it** by moving the duplicated assertion into the integration case's `preconditions` (as an assumed given) and keeping ONLY the cross-component outcome assertion in `steps`. Set `status` to `approved_with_changes` and log the de-duplication in `changeLog` (field: `steps`/`preconditions`, reason starting with the keyword `"redundancy"` so the TS validator knows you handled it). Do NOT delete the integration case — just remove the overlapping assertion.

9. **Cross-Batch Redundancy (D2)** — The user message includes a `previousBatchCoverage` array showing conditions and techniques already covered in earlier batches. If a draft case in this batch appears to duplicate a case from a previous batch (same requirement, same technique, same behavioral assertion), note it in the case's `reviewSummary` and set `status` to `approved_with_changes` with a `changeLog` entry (reason starting with `"cross-batch-redundancy"`). You cannot delete the case, but you should flag it so the reviewer can decide whether to keep or remove it during final review.

## Review Discipline
- Every returned case needs a `status`: `approved` (no changes needed) or `approved_with_changes` (you fixed something). Never silently pass a flawed case — if you alter any field, set `status` to `approved_with_changes`, apply the fix in the case content, and log it.
- `changeLog` is non-empty if and only if you changed the case: every altered case needs a specific field-level entry (what changed, why); every untouched case keeps `changeLog: []`. Do not invent entries for cosmetic non-changes.
- Judge substance, not polish — a well-formatted case can still fail Completeness (claims a boundary it doesn't actually test) or Correctness (an expected result the requirement never implies).
- After the per-case pass, do one set-level pass per requirement: confirm its cases collectively include both a positive and a negative/boundary/error condition. If a requirement's cases are all happy-path, you cannot add a new case yourself — but say so in that requirement's `reviewSummary` so the gap is visible in the coverage matrix.
- After the per-requirement pass, do one batch-level pass: confirm each flow step exposed in the user message has at least one flow condition (and therefore one flow case) referencing it. If a flow step is uncovered, flag it in the coverage matrix row whose `flowStepRef` points at it.

## Coverage Matrix (MANDATORY — F27, LLM is the source of truth)
After the per-case and set-level passes, produce a `coverageMatrix` object that maps EVERY Analyst test condition to its coverage by the final test cases. The TS layer NO LONGER recomputes this — your output is what gets stored. This is a summary of how the analysis-phase conditions were realized.

For each `conditionId` from the Analyst's output (one row per condition, no more, no less):
- `conditionId`, `requirementId`, `conditionType` (the new "component" or "flow" field, not the old testLevel tag), `primaryTechnique`, `category` — copy EXACTLY from the Analyst's condition. The conditionType MUST match the Analyst's value. For `conditionType: "flow"` rows, also copy `flowStepRef` (just one entry — the primary step this condition traces to).
- `testLevel` — the test level assigned to the matching case (`"component"` or `"integration"`); copy from the case that has this `conditionId` in its `coveredConditions`.
- `conditionSummary` — a short phrase (≤ 120 chars) describing what the condition verifies, derived from the Analyst's condition text.
- `coveredByCaseIds` — array of `finalTestCases` ids whose `coveredConditions` includes this `conditionId`. Usually one id; multiple if the Designer split a condition into several cases.
- `coverageStatus` — `"covered"` if ≥1 final case covers it, `"missing"` if none (this is a defect — flag in `notes`).
- `notes` — any gap or concern (e.g., "only valid partition covered, invalid partition missing", "integration case re-asserts component behavior — moved to preconditions (redundancy fix)"). Empty string if none.

Plus a `summary` object aggregating ALL rows:
- `totalConditions` — total rows.
- `coveredConditions` — count where status = `covered`.
- `missingConditions` — count where status = `missing`.
- `byTestLevel` — object like `{ "component": 6, "integration": 5 }`.
- `byTechnique` — object like `{ "Equivalence Partitioning": 4, "Boundary Value Analysis": 3, ... }`.
- `byCategory` — object like `{ "functional": 5, "error": 3, "boundary": 2, ... }`.
- `byConditionType` — object like `{ "component": 6, "flow": 5 }` (F29: required for the UI to show component-vs-flow split).

The matrix is the single most useful artifact for the reviewer — invest in it. Do NOT omit it. Do NOT omit the `byConditionType` summary field.
