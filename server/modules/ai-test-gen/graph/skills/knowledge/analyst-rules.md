---
name: analyst_rules
description: Load the complete condition derivation rules for the Test Analyst role (conditionType decision, technique coverage, F8 flow-step coverage, F30 cross-requirement consolidation, risk assessment, technique selection). Use when you are about to derive test conditions — MANDATORY: call before generating any conditions.
---

# Analyst Rules — Condition Derivation Guidelines

## Risk Assessment (ISTQB Risk-Based Testing)
Rate each requirement on TWO independent axes before assigning priority:
- **Likelihood**: complexity, novelty, change frequency, number of dependencies, history of defects in similar features.
- **Impact**: business criticality, user/data exposure, regulatory or financial consequence, blast radius if it breaks.
`critical` priority requires BOTH axes high. Routine CRUD or display-only items are usually `medium`/`low` — do not inflate everything to `high`/`critical`.

## Technique Selection (decision rule, not habit)
| Technique | Use when... |
|---|---|
| Equivalence Partitioning (EP) | An input has distinct valid/invalid value classes (format, type, range-as-group). |
| Boundary Value Analysis (BVA) | A field has a numeric/length/date range, quota, or threshold. Always pair with EP on the same field. |
| Decision Table | An outcome depends on 2+ independent conditions combining (pricing, eligibility, permissions, approval routing). |
| State Transition | An entity has a lifecycle/status, or a control's behavior depends on prior actions (wizards, session state). |
| Use Case | An end-to-end goal spans multiple steps/screens/services and sequence/actor intent matters more than any single input. |

Pick the technique with the strongest fit; do not force a weak match. Record `secondaryTechniques` only when genuinely applicable, and justify each choice in `techniqueRationale` by naming the specific characteristic that triggered it (e.g., "Decision Table because role AND resource-type jointly determine access").

## Sizing & Hygiene
- **Technique-Driven Count**: Scale the number of conditions based on requirement complexity (typically 2-4 for simple rules, but higher for complex logic). Let the test design technique dictate the final count. Never under-cover a technique just to hit a round number.
- **Smart Deduplication**: Merge near-duplicate conditions that test the same aspect with only data variants. Never merge valid-partition into invalid-partition, and never merge invalid conditions that trigger distinct error handling paths.
- **Strict Traceability**: Every condition must trace to at least one source `requirementId` taken verbatim from the input.

## A. Condition Type: component vs flow

**Definitions:**
- **component condition** — verifies ONE requirement's atomic behavior in isolation. Source: a single requirement AC (single-field validation, single business rule, internal state transition). The test that covers it stays inside one component.
- **flow condition** — verifies cross-component interaction derived from a business flow. Source: a flow step (data handoff, end-to-end sequence across modules, state propagation). The test that covers it traverses 2+ components.

**Decision rule — assign `conditionType` per CONDITION (not per requirement):**

| Source / characteristic | conditionType | flowStepRefs required? |
|---|---|---|
| Condition is derived from a **flow step** — verifies cross-component data flow, interface contract, state handoff, or end-to-end sequence across modules | `flow` | YES (the exact `{ flowId, sequence, actionSummary }` this condition comes from) |
| Condition uses **Use Case Testing** as primary technique (multi-step goal spanning services) | `flow` | YES |
| Condition verifies a **requirement AC** — single field's input validation, format, or range (EP/BVA) | `component` | no |
| Condition verifies a **requirement AC** — single business rule's outcome in isolation (Decision Table on one requirement) | `component` | no |
| Condition verifies a **requirement AC** — invalid input or boundary on a single field with no cross-component effect | `component` | no |
| Condition verifies a **requirement AC** — state transition within a single module's lifecycle | `component` | no |
| **F22** Condition comes from a flow step but only validates an atomic input/format of one field (e.g. "password is masked as it's typed" inside a login flow) | `component` (with the flow step's requirementId still recorded) | no |

**Key principle:** the primary signal is what the condition VERIFIES (atomic vs cross-component), not just where it came from. A flow that contains a password-input step still has a component condition for the masking rule.

**`flowStepRefs` rule:** every `conditionType: "flow"` condition MUST list at least one `{ flowId, sequence, actionSummary }` in `flowStepRefs`. This is the bridge that lets the Designer and Quality trace the condition back to a specific flow step and lets the user (and downstream AI) answer "which flow steps are uncovered?".

**`flowId` source rule (CRITICAL — prevents duplicate conditions):** The `flowId` in `flowStepRefs` MUST be the exact `id` value from the input `flowBlueprints` array. Do NOT invent flow IDs (e.g., "FLOW-AUTH-SESSION", "FLOW-1") — the input `flowBlueprints` provides the real `id` for each flow path, and these IDs are typically AC-level requirement IDs (e.g., "req-aut-auth-session-happy"). Using a hallucinated flowId causes the system to think the real flow step is uncovered and auto-generate a DUPLICATE flow condition for the same scenario. Before writing `flowStepRefs`, look up the `id` from `flowBlueprints` and copy it verbatim.

**`dependencies` real-ID rule (CRITICAL — prevents fake IDs that break downstream requirement lookup):** Every entry in `dependencies` MUST be a real condition ID — either from the same batch's output (mixed mode: `"C-001"`) or from a previous batch (flow mode: the ID returned by `previous_batch_conditions_query`). NEVER fabricate compound IDs like `"component:req-aut-auth-session-happy:F-001"`. The schema validates every dependency ID and REJECTS unknown values. Fake IDs propagate to the Designer's `referencedComponentConditions` and break related-requirement lookup downstream.

**Non-overlap rule (ANTI-REDUNDANCY — critical):** For the SAME requirement, a `component` condition and a `flow` condition MUST NOT verify the same behavior:
- A `component` condition verifies the atomic behavior alone (e.g., "empty password is rejected with a validation error").
- A `flow` condition for the same requirement verifies ONLY the cross-component interaction aspect the component condition did NOT cover (e.g., "no auth request is sent to the auth service when client-side validation fails").
- The `flow` condition's `condition` text must NOT re-state the atomic behavior. It should describe the interaction surface (data handoff, state propagation, downstream effect, sequence across modules) and ASSUME the atomic behavior works.

**Per-requirement guidance (replaces rigid quota):**
- Every requirement MUST produce at least one `component` condition (for its atomic behavior).
- A requirement produces a `flow` condition ONLY IF it has a genuine cross-component interaction surface (appears in a flow, has dependencies, or touches an external system). When it does, the flow condition must be non-overlapping with the component condition.

**F8 — flow-step coverage rule (MANDATORY, not optional):** For EVERY step in flow stories (stories with `steps[]`), the batch MUST produce at least one `flow` condition whose `flowStepRefs` references that step (`{ flowId, sequence, actionSummary }`). This includes exception/error steps (e.g. "invalid credentials show error and allow retry", "empty fields block form submission"). **Do NOT skip a flow step just because a component condition already covers the same atomic behavior.** A component condition validates the atomic rule in isolation; a flow condition validates the cross-component interaction within the flow. These are different verification targets. If you think a flow step has no new cross-component surface beyond what component conditions cover, still create a minimal flow condition with `flowStepRefs` referencing that step — the condition text should focus on the interaction aspect (e.g. "auth service rejects invalid credentials and the login page displays the error inline allowing retry" rather than "invalid credentials are rejected"). A flow step with zero `flowStepRefs` references across all conditions is a hard validation failure — no exceptions.

## B. Technique Coverage (per-technique hard requirements)

| Technique | Mandatory coverage |
|---|---|
| EP | valid-partition condition AND at least one invalid-partition condition (separate conditions, never merged) |
| BVA | `condition` text must name the actual boundary and its position (e.g., "exactly at the 100-character limit") — never "test with large input" |
| Decision Table | cover every business-relevant rule combination, including "no rule matches" / default case |
| State Transition | include at least one invalid/disallowed transition per modeled entity |
| Every requirement | at least one condition in `error`, `boundary`, or `validation` category — happy-path-only coverage is under-testing |

## C. Final Self-Check (before closing the JSON block)

For every condition: `requirementId` present and exact, `category` present, `conditionType` is `"component"` or `"flow"`, and if `conditionType === "flow"` then `flowStepRefs` has at least one entry. Every entry in `dependencies` is a real condition ID (same-batch output or previous-batch query result) — no fabricated compound IDs.
**HARD RULE: if `primaryTechnique` is "Use Case Testing" then `conditionType` MUST be `"flow"`** — no exceptions. Use Case Testing is inherently multi-step and cross-component; a component condition must use EP, BVA, Decision Table, or State Transition instead.
Per requirement: at least one component condition exists; a flow condition exists only if the requirement has a cross-component surface; the flow condition does not re-state what the component condition already verifies.
Per flow step in flow stories: at least one `conditionType="flow"` condition references it via `flowStepRefs`. **Exception/error flow steps are NOT optional** — if a step exists in a flow story's `steps[]`, it MUST be covered. A step with zero references is a hard validation failure.
Per technique used: coverage rules from section B are satisfied.
`coverageDimensions` is free-form tags — do NOT use `testLevel:*` tags anymore (use the `conditionType` field).

## Cross-Requirement Consolidation (F30)
After deriving conditions for all requirements in this batch, do a consolidation pass:
- If two conditions from DIFFERENT requirements verify the same atomic behavior (e.g., "email format validation" appears in both registration and login), MERGE them into one condition with the requirementId of the first requirement that has that behavior.
- Do NOT merge conditions across different techniques (EP vs BVA) — keep technique-specific conditions separate.
- Log merges in requirementAnalysis.overallApproach.
