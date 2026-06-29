# Architect Global Blueprint Redesign

*Global Vision with Scope Control — Preventing Analyst Narrowing Without Causing Scope Creep*

---

## 1. Problem Statement

### 1.1 The Original Design

The Test Architect Agent was designed to provide "global vision" — a holistic view of the project's requirements, business flows, and cross-cutting concerns — to downstream Test Analyst and Test Designer agents. This prevents the Analyst from designing test cases in isolation, unaware of dependencies, shared states, and risks outside their immediate batch.

### 1.2 The Contradiction

The original implementation had a fundamental flaw:

> **Architect's input was filtered by the user's checkbox selection.**

| Component | Original Behavior | Consequence |
|-----------|------------------|-------------|
| Requirements | Only user-selected requirements passed to Architect | Architect couldn't see unselected dependencies |
| Flow steps | `steps: []` hardcoded empty | Dependency DAG was invisible |
| Requirement dependencies | `dependencies[]` field never read | External dependency risk invisible |
| Scope boundary | Implicit via input filtering | Analyst had no way to know what was out-of-scope |

The result: an Architect that was supposed to provide "global vision" was itself operating on partial data — an `aggregate-of-selected` rather than a `project-wide sentinel`.

### 1.3 The Balancing Challenge

Giving the Architect full project data creates a new risk: if the Analyst sees all requirements and flows, it may generate test conditions for out-of-scope items — **scope creep**.

```
┌─ Too narrow ────┐         ┌─ Too broad ──────┐
│                  │         │                   │
│  Analyst doesn't │         │  Analyst generates│
│  see dependencies│         │  conditions for   │
│  → wrong preconds│         │  unselected epics │
│  → missed risks  │         │  → batch explodes │
│                  │         │                   │
└──────────────────┘         └───────────────────┘
         ▲                            ▲
         │       ┌─────────┐          │
         └───────│  Goal   │──────────┘
                 │ Balance │
         ┌───────│         │──────────┐
         │       └─────────┘          │
         ▼                            ▼
┌──────────────────┐    ┌────────────────────────┐
│  Full visibility │    │  Strict scope boundary │
│  for context     │    │  for condition generation│
└──────────────────┘    └────────────────────────┘
```

The solution: **separate "visibility" from "scope"** — give the Analyst full project context for risk assessment and precondition setup, but enforce a code-level guardrail that restricts condition generation to the selected items only.

---

## 2. Design Principles

### Principle 1: Architect Ingests the Full Project

The Architect receives **ALL** project requirements and **ALL** business flows, regardless of user selection. Its analysis covers the entire project landscape.

### Principle 2: Context Boundary Is Explicit, Not Implicit

The Blueprint contains a `contextBoundary` field that explicitly separates:
- **inScope** (selectedEpicIds, selectedFlowIds): the Analyst's generation targets
- **outOfScope** (dependencyWarning, unselected epics in riskEpicTree): context-only awareness

### Principle 3: Analyst Has Guardrails, Not Information Gaps

The Analyst sees the full Blueprint but its prompt includes a **Scope Guardrail**:
- Generate conditions ONLY for items in `contextBoundary.selectedEpicIds` / `selectedFlowIds`
- Use everything else for precondition setup and risk calibration only
- Anomalous flow proposals carry a `routing` field to indicate which stage should handle them

### Principle 4: Routing Separates Anomalies From Regular Batch Work

Anomalous flow proposals are tagged with a `routing` field (`stage-1`, `stage-2`, or `stage-3`), ensuring that cross-boundary error-guessing scenarios are handled by the appropriate Analyst stage — not dumped into the wrong batch.

---

## 3. Architecture Overview

```
                        ┌─────────────────────────────────────┐
                        │         Database (Project Data)      │
                        │  ┌───────────────────────────────┐  │
                        │  │ requirements (ALL, with .deps) │  │
                        │  │ business_flows (ALL, w/ steps) │  │
                        │  │ persistent_coverage            │  │
                        │  └───────────────────────────────┘  │
                        └─────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Orchestrator — ensureGlobalBlueprint()                          │
│                                                                  │
│  ┌─ Step 1: Fetch ────────────────────────────────────────────┐ │
│  │  allRequirements ← repo.getAllRequirements(projectId)      │ │
│  │  allFlows ← repo.getAllFlows(projectId)  (with steps[])    │ │
│  │  coverage ← repo.getProjectCoverage(projectId)              │ │
│  │  selectedEpicIds ← params.requirementIds                    │ │
│  │  selectedFlowIds ← params.flowIds                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         │                                        │
│  ┌─ Step 2: Build LLM Input ──────────────────────────────────┐ │
│  │  userMessage = {                                           │ │
│  │    allRequirements,   // full project, unfiltered          │ │
│  │    allFlows,          // full project, with step DAG       │ │
│  │    selectedEpicIds,   // user's selection boundary         │ │
│  │    selectedFlowIds,   // user's selection boundary         │ │
│  │    existingCoverage,  // already-covered conditions        │ │
│  │  }                                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         │                                        │
│  ┌─ Step 3: LLM Generates Blueprint ──────────────────────────┐ │
│  │  GlobalTestBlueprint {                                     │ │
│  │    contextBoundary: {                                      │ │
│  │      selectedEpicIds, selectedFlowIds,                     │ │
│  │      allEpicIds, allFlowIds, dependencyWarning             │ │
│  │    },                                                      │ │
│  │    riskEpicTree:        // ALL epics scored                │ │
│  │    strategicGuidance,   // project-wide                    │ │
│  │    anomalousFlowProposals: [ { ..., routing } ],           │ │
│  │    sharedStateInferences                                   │ │
│  │  }                                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         │                                        │
│  ┌─ Step 4: Cache & Inject ──────────────────────────────────┐ │
│  │  Cache key = SHA-256(allRequirements + allFlows)          │ │
│  │  Inject globalBlueprint into every batch's inputState     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼  globalBlueprint injected into ALL batches
         │
┌────────┴────────────────────────────────────────────────────────┐
│  Per-Batch LangGraph                                            │
│                                                                  │
│  ┌─ Analyst reads Blueprint ────────────────────────────────┐   │
│  │                                                           │   │
│  │  contextBoundary.selectedEpicIds  →  GENERATE conditions  │   │
│  │                                                           │   │
│  │  contextBoundary.dependencyWarning →  SET preconditions   │   │
│  │                                                           │   │
│  │  riskEpicTree (unselected epics) →  CALIBRATE risk only   │   │
│  │                                                           │   │
│  │  sharedStateInferences        →  ADD to preconditions     │   │
│  │                                                           │   │
│  │  anomalousFlowProposals:                                  │   │
│  │    routing=stage-1/2  →  GENERATE if matches batch        │   │
│  │    routing=stage-3    →  SKIP (handled in Stage 3)        │   │
│  │                                                           │   │
│  │  ★ GUARDRAIL: NEVER generate for out-of-scope epic        │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Contract Changes

### GlobalTestBlueprint

```typescript
interface GlobalTestBlueprint {
  // === Scope Boundary (NEW) ===
  contextBoundary: {
    selectedEpicIds: string[];     // User's selected epics — Analyst's targets
    selectedFlowIds: string[];     // User's selected flows
    allEpicIds: string[];          // Full project epics (for context)
    allFlowIds: string[];          // Full project flows
    dependencyWarning: string[];   // Unselected epics that selected ones depend on
  };

  // === Existing Fields ===
  strategicGuidance: string;
  riskEpicTree: RiskEpicTreeNode[];    // ALL epics scored, not just selected
  anomalousFlowProposals: AnomalousFlowProposal[];
  sharedStateInferences: string[];
}
```

### AnomalousFlowProposal (with routing)

```typescript
interface AnomalousFlowProposal {
  title: string;
  trigger: string;
  expectedBehavior: string;
  riskLevel: 'high' | 'medium' | 'low';
  routing?: 'stage-1' | 'stage-2' | 'stage-3';  // NEW: defaults to stage-3
}
```

Routing semantics:
| Value | Meaning | Handler |
|-------|---------|---------|
| `stage-1` | Belongs to a specific epic's condition batch | Analyst Stage 1 |
| `stage-2` | Belongs to flow integration testing | Analyst Stage 2 |
| `stage-3` (default) | General error guessing, cross-boundary scenarios | Analyst Stage 3 |

---

## 5. Prompt Design

### 5.1 Architect System Prompt (Key Directives)

```
Your input contains:

1. allRequirements[] — ALL project requirements (with dependencies field)
2. allFlows[] — ALL business flows (with complete step sequences)
3. selectedEpicIds[] — User's selected epic IDs
4. selectedFlowIds[] — User's selected flow IDs

Your job has four phases:

PHASE A — Context Boundary Mapping
  For each epic in allEpicIds, check if it's in selectedEpicIds.
  For each selected epic, check if its dependencies are also selected.
  If not, add the unselected dependency to contextBoundary.dependencyWarning.

PHASE B — Full-Project Risk Tree
  Score EVERY epic in the project, not just selected ones.
  Unselected epics MUST still be scored with notes prefixed "[OUT-OF-SCOPE]".

PHASE C — Strategic Guidance
  Infer cross-cutting concerns across the FULL project.
  Pay attention to cross-boundary interactions (selected module calling unselected module API).

PHASE D — Anomalous Flows with Routing
  Generate 2-5 anomalous flows. Assign each a routing value:
  - stage-1: the anomaly belongs to a specific epic's batch
  - stage-2: the anomaly belongs to flow integration testing
  - stage-3 (default): general error guessing
```

### 5.2 Analyst Prompt — Scope Guardrail (Injected Section)

```
## Global Test Blueprint — CONTEXT ONLY

The Blueprint below contains project-wide context. Follow these rules:

1. contextBoundary.selectedEpicIds + selectedFlowIds → Your test targets.
   Generate conditions for these ONLY.

2. contextBoundary.dependencyWarning → Precondition setup only.
   Add these as preconditions. NEVER generate conditions for them.

3. riskEpicTree entries outside selected IDs → Risk calibration only.
   Use them to adjust priority of in-scope items.

4. sharedStateInferences → Add to preconditions array. NEVER generate conditions.

5. anomalousFlowProposals:
   - routing=stage-3 → SKIP (Stage 3 will handle)
   - routing=stage1/2 → generate if within current batch scope

★ IRON RULE: Never generate a test condition for a requirement or flow
  that is outside this batch's scope.
```

---

## 6. Data Flow Changes

### 6.1 Before (Original)

```
User checks Epic A, Epic B               User checks "User Registration" flow
         │                                         │
         ▼                                         ▼
  filteredReqs = [A, B]                  filteredFlows = [Registration]
         │                                         │
         ▼                                         ▼
  Architect sees: A, B                    Architect sees: { steps: [] }
         │                                         │
         ▼                                         ▼
  Blueprint covers: A, B                  No dependency info available
```

### 6.2 After (Redesigned)

```
User checks Epic A, Epic B               User checks "User Registration" flow
         │                                         │
         ▼                                         ▼
  allReqs = [A, B, C, D, E]              allFlows = [Registration, Login, Checkout]
  selected = [A, B]                      selectedFlows = [Registration]
         │                                         │
         ▼                                         ▼
  Architect sees: ALL 5 epics            Architect sees: ALL 3 flows with steps[]
         │                                         │
         ▼                                         ▼
  Blueprint:
    contextBoundary.selectedEpicIds = [A, B]
    contextBoundary.allEpicIds = [A, B, C, D, E]
    contextBoundary.dependencyWarning = [C]   // A depends on C, C not selected
    riskEpicTree = A(high), B(medium), C(high), D(low), E(low)
    strategicGuidance: "A depends on C (not selected). Precondition: C must be deployed."
```

---

## 7. Edge Case Handling

| Scenario | Architect Behavior | Analyst Behavior |
|----------|-------------------|-----------------|
| User selected 1 epic depending on 3 unselected | `dependencyWarning` lists all 3; `riskEpicTree` scores all 4 | Generates conditions only for selected epic; preconditions mention all 3 dependencies |
| User selected ALL epics | `selectedEpicIds === allEpicIds`; `dependencyWarning` is empty | Normal generation for all |
| Project has 20 epics, user selected 2 | Architect scores all 20 (18 marked `[OUT-OF-SCOPE]`); guidance covers cross-module risks | Only generates conditions for 2; risk calibration considers global context |
| Anomalous flow crosses selected + unselected modules | `anomalousFlowProposals` describes full scenario; `routing: stage-3` | Stage 1/2 skip it; Stage 3 generates conditions (free from scope restriction) |
| No flows selected (empty selection) | `selectedFlowIds = []`, `allFlowIds` populated with project flows | No flow conditions generated; flow-level `riskEpicTree` entries skipped |
| Re-run with same project data | Blueprint loaded from cache (cache hit) | Same as above |

---

## 8. Impact Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `shared/contracts/index.ts` | Modify | `GlobalTestBlueprint` add `contextBoundary`; `AnomalousFlowProposal` add optional `routing` |
| `server/modules/ai-test-gen/graph/state.ts` | Modify | Add `selectionBoundary: { selectedEpicIds, selectedFlowIds }` to `TestGenState` |
| `server/modules/ai-test-gen/graph/prompts.ts` | Modify | Architect prompt: 4-phase structure + remove batch-specific directive; Analyst prompt: Scope Guardrail + structured blueprint injection |
| `server/modules/ai-test-gen/graph/structured-output/architect.ts` | Modify | Zod schema add `contextBoundary`, `routing`; normalize() add routing default fallback |
| `server/modules/ai-test-gen/orchestrator.ts` | Modify | `ensureGlobalBlueprint` fetch ALL requirements/flows; `computeRequirementHash` exclude selection; pass `selectionBoundary` in synthetic state |
| `server/modules/ai-test-gen/business-flow-blueprint.ts` | Modify | Accept `requirementsMap` param; populate `steps[]` with real mapped data (title, acceptanceCriteria) |
| `server/modules/ai-test-gen/graph/nodes/preparation.ts` | Modify | Fallback LLM path adapted to new function signatures |
| `docs/06-ai-test-generation-strategy.en.md` | Modify | Section 3.2 updated to reflect 4 responsibilities + contextBoundary |

---

## 9. Migration Guide

### Step 1: Update Contract
Add `contextBoundary` to `GlobalTestBlueprint` and `routing` to `AnomalousFlowProposal`.

### Step 2: Update Structured Output Profile
Add the new Zod schema fields in `architect.ts`.

### Step 3: Fix Business Flow Blueprint
Replace `steps: []` with real mapped step data in `business-flow-blueprint.ts`.

### Step 4: Rewrite Architect Prompt
Replace `buildArchitectSystemPrompt` with the new 4-phase version. Update `buildArchitectUserMessage` to accept full project data + selection boundary.

### Step 5: Fix Orchestrator Data Flow
- Change `ensureGlobalBlueprint` to fetch ALL requirements and ALL flows
- Add `selectedEpicIds` and `selectedFlowIds` to the synthetic state
- Change cache key hash to cover full project data

### Step 6: Add Analyst Guardrail
Update the blueprint injection section in `buildAnalystSystemPrompt` with the Scope Guardrail.

### Step 7: Update Strategy Document
Sync `06-ai-test-generation-strategy.en.md` Section 3.2 with new responsibilities.

---

## 10. Known Issues & Design Decisions

During code review, the following issues were identified and addressed in this design:

### Issue 1: Cache Key Must Exclude Selection Boundary

**Problem**: The original `computeRequirementHash` includes `requirementIds` (user selection) in the hash input. With the redesign, the same project's global blueprint would be recomputed for every different selection combination, defeating caching.

**Decision**: Cache key = `SHA-256(allRequirements + allFlows)` only. Selection boundary (`selectedEpicIds`, `selectedFlowIds`) is passed to the Architect as separate input data, not part of the hash. This ensures the global blueprint is cached once per project state change, regardless of user selection.

**Implementation note**: `computeRequirementHash` must be rewritten to ignore `params.requirementIds` and `params.flowIds` in the hash input.

### Issue 2: Architect System Prompt Must Not Say "Be Specific to THIS Batch"

**Problem**: The current system prompt (line 619) says: *"Be specific to THIS batch's requirements and flows — do not produce generic boilerplate."* This directly contradicts the redesign goal of project-wide analysis.

**Decision**: Remove this directive entirely. Replace with: *"Analyze the FULL project scope described in `allRequirements` and `allFlows`, not just the selected subset. The Architect's output guides ALL downstream batches."*

### Issue 3: SyntheticState Needs Selection Boundary Field

**Problem**: The current `syntheticState` (orchestrator.ts line 717) only contains `currentBatch` (selected requirements). The Architect has no way to distinguish "all" from "selected" without a boundary field.

**Decision**: Add `selectionBoundary: { selectedEpicIds: string[]; selectedFlowIds: string[] }` to `TestGenState`. The Architect prompt references this field to build `contextBoundary` in the output.

### Issue 4: Analyst Prompt Blueprint Injection Must Be Structured

**Problem**: The current code injects the entire blueprint as raw JSON (`JSON.stringify(state.globalBlueprint, null, 2)`). With the redesigned blueprint containing full project data, this significantly increases prompt token consumption.

**Decision**: Structure the injection by section:
1. First inject `contextBoundary` with a clear label
2. Then inject each field separately with usage instructions
3. This lets the Analyst parse the blueprint semantically rather than dumping it as opaque JSON

### Issue 5: Business Flow Step Mapping Requires Requirements Lookup

**Problem**: `PipelineBusinessFlowBlueprintStep` requires `requirementTitle` and `acceptanceCriteria`, but `BusinessFlowStep` only has `requirementIds` (string array, not objects).

**Decision**: `buildBusinessFlowBlueprints` must accept a `requirementsMap: Map<string, Requirement>` parameter to look up titles and acceptance criteria by ID. This map is built from `allRequirements` in the orchestrator before calling `buildBusinessFlowBlueprints`.

### Issue 6: Routing Field Needs Default Value Guard in Zod Normalizer

**Problem**: The redesign says `routing` defaults to `stage-3`, but the Zod schema makes it optional. If the LLM returns an empty string or invalid value, parsing fails.

**Decision**: Add a fallback in the `normalize` function of `architect.ts`:
```typescript
routing: (input.routing as string) || 'stage-3',
```

---

## 11. Verification Criteria

| Criterion | How to Verify |
|-----------|---------------|
| Architect sees ALL requirements | Server log: "Architect input: N reqs (M selected)" — N should equal project total, not selection count |
| Blueprint contains out-of-scope items | Inspect `globalBlueprint.riskEpicTree` for episodes not in selected set |
| Analyst never generates out-of-scope conditions | Run a batch on Epic A only; check test conditions for any Epic B references |
| dependencyWarning is accurate | Select Epic A that depends on Epic C; verify `dependencyWarning` includes C |
| Cache key covers full project | Change one requirement outside selected set; verify cache invalidates |
| Anomalous flow routing works | Generate anomaly with `routing: stage-1`; verify it appears in Stage 1 batch |
