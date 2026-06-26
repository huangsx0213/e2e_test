# AI Test Generation Strategy & Architecture
*(Final Architectural Specification)*

## 1. Applicable Standards

This document defines the test case generation strategy for the `e2e_test` platform. All design decisions are grounded in the following international standards:

| Standard | Full Title | Relevant Sections |
|----------|-----------|-------------------|
| **ISTQB CTFL 4.0** | ISTQB Certified Tester Foundation Level Syllabus v4.0 (2023) | Ch 2.2 Test Levels; Ch 4.2 Black-Box Test Techniques; Ch 4.4 Experience-Based Test Techniques |
| **ISO/IEC/IEEE 29119-1** | Software and Systems Engineering -- Software Testing -- Part 1: General Concepts | Clause 4: Test Process; Clause 5.3: Test Design |
| **ISO/IEC/IEEE 29119-3** | Part 3: Test Documentation | Clause 9.4: Test Case Specification (action + expected result per step) |
| **ISO/IEC/IEEE 29119-4** | Part 4: Test Techniques | Clause 5: Specification-Based Techniques; Clause 7: Coverage Measurement |
| **IEEE 829-2008** | Standard for Software and System Test Documentation | Clause 8: Test Procedure Specification (atomic, repeatable steps) |

---

## 2. Decoupled Architecture Design

To manage LLM token costs and context window limits on large-scale projects, the system strictly decouples "Global Vision" from "Local Execution".

1. **Intact Macro Pipeline**: The underlying LangGraph architecture maintains its fixed 4-node execution flow: `Preparation` -> `Analyst` -> `Designer` -> `Quality`.
2. **Persistent Incremental Matrix**: After each pipeline execution, generated cases and covered transitions are **upserted** into a database-backed, Two-Dimensional Coverage Matrix (`requirementRows` and `flowRows`). This persistent layer serves as the single source of truth for cross-release deduplication.

---

## 3. LangGraph Macro Workflow & Agent Responsibilities

The execution pipeline is driven by four core agent nodes collaborating in sequence. 

### 3.1 Preparation Node (Per-Batch Deterministic Layer)

The Preparation node is a deterministic TS-only node in the per-batch LangGraph. It does NOT call the LLM — the blueprint is pre-computed by the Orchestrator before the batch loop begins.

| Capability Layer | Execution Responsibilities | Output Artifacts |
|-----------------|----------------------------|------------------|
| **Pure TypeScript (Deterministic)** | **1. Frequency Scanning**: Scans all Flows to count occurrences of each `RequirementID`, tagging high-frequency nodes as `isDuplicateReference`.<br>**2. DAG Topology**: Builds explicit dependency trees of Epics/Flows via database relations.<br>**3. Coverage Snapshot**: Fetches the latest 2D CoverageMatrix from the database. | Statistical arrays, Dependency DAG, JSON Coverage Matrix |

### 3.2 Orchestrator-Level Architect (Global Blueprint)

The LLM-driven Architect runs **once per pipeline execution** at the Orchestrator level, **before** any batch enters the LangGraph. It operates on **all** project requirements and flows — not just the user's current selection — to produce a comprehensive blueprint that remains stable regardless of which subset is being tested. Its responsibilities:

| Capability Layer | Execution Responsibilities | Output Artifacts |
|-----------------|----------------------------|------------------|
| **LLM Reasoning (Semantic)** | **1. Strategic Guidance**: Infers implicit shared states (e.g., Auth, Interceptors) from the TS data to guide downstream Agents.<br>**2. Preemptive Error Guessing**: Autonomously hypothesizes a bounded number of high-risk anomalous business flows (e.g., race conditions, orphan references) not explicitly defined in requirements. | `Global Test Blueprint`, Limited `Anomalous Flow Proposals` |

The generated blueprint is:
1. Saved to `test_gen_architect_cache` (cross-run cache, keyed by project + requirement hash)
2. Injected as `globalBlueprint` into every batch's input state
3. The per-batch Preparation node receives it and skips the LLM call (fast path via `state.globalBlueprint` cache-hit logic)

**Re-run optimization**: If no project requirements or flows have changed since the last run, and the cached blueprint exists, the Orchestrator loads it from `test_gen_architect_cache` and skips the LLM call entirely. Use `forceArchitect: true` in the start config to force regeneration.

### 3.3 Analyst Node (Test Condition Generator)

The Analyst node is responsible for breaking down business requirements into structured "Test Conditions". Controlled by the Orchestrator, the Analyst dynamically switches between **three distinct stages (modes)** based on the input batch:

| Stage (Analyst Mode) | Trigger Scope | Analysis Strategy |
|----------------------|---------------|-------------------|
| **Stage 1: Requirement Batches** | User-selected leaf-level ACs | Acts as a **Component Analyst**. Constrained to Equivalence Partitioning, Boundary Value Analysis, and Decision Tables to generate fine-grained single-point conditions. |
| **Stage 2: Flow Batches** | User-selected Business Flows | Acts as an **Integration Analyst**. Uses the Global Blueprint & Coverage Matrix to skip internal logic for already-covered nodes (`Reference Only`). Strictly constrained to generating `category: 'integration'` conditions focused on cross-module state handoffs. |
| **Stage 3: Error-Guessing Synthesis** | Periphery of the current execution batch | Acts as a **Defect Speculation Expert**. Applies Error Guessing to the dependency graph to synthesize conditions for implicit paths (e.g., auth bypass, concurrent mutations). |

### 3.3 Designer Node (Test Case & Step Generator)

Responsible for translating abstract "Test Conditions" into detailed, human-and-machine-readable steps. It strictly adheres to the **Test Step Atomicity Specification** (see Section 4).

### 3.4 Quality Node (Review & Matrix Persistence)

Responsible for validating the Designer's output:
*   **Rejection Gate**: Rejects steps containing multiple conjunctions ("and", "while") to enforce atomicity.
*   **Persistence**: Upon approval, immediately upserts the new test cases and transition tags into the database's `PersistentCoverageMatrix`.

---

## 4. Test Step Atomicity Specification

All generated `NlTestCaseStep` objects must comply with the requirements of downstream "AI-Driven Automation Recorders (e.g., Playwright / Stagehand)".

### 4.1 Five Golden Rules

| # | Rule | Good Example | Bad Example (Composite Step) |
|---|------|-------------|-------------|
| 1 | **Single Action** | "Click the button labeled 'Sign In'" | "Fill in the form and submit it" |
| 2 | **Single Assertion** | "Button text changes to 'Signing in...'" | "Login succeeds and dashboard loads with stats" |
| 3 | **Element Identifiable**| "Type `admin` in the input with placeholder 'Username'" | "Enter the username" |
| 4 | **Concrete Data** | "Type `admin123`" | "Enter a valid password" |
| 5 | **No Implicit State** | Previous expected: "URL is /dashboard"; Current action: "On /dashboard, click 'Manage Users' link" | "Click 'Manage Users'" (assumes page context) |

### 4.2 NL-to-Code Mapping

| `NlTestCaseStep` Component | Playwright Automation Mapping | Example |
|----------------------------|-------------------|---------|
| Verb in `action` | Action API | "Type" -> `fill()`, "Click" -> `click()` |
| Element description in `action`| Stagehand/UI-TARS Locator | "input with placeholder 'Username'" -> `locator` targeting |
| Data value in `action` | Method Parameter | "`admin`" -> passed as `fill('admin')` |
| `expected` field | Assertion API | "displays text 'admin'" -> `expect(locator).toHaveValue('admin')` |

---

## 5. Implementation Roadmap

### 5.1 Orchestrator Routing Logic
The Orchestrator generates the Global Blueprint **once**, then feeds batched subsets into the LangGraph pipeline while commanding the Analyst to assume different Stage modes:

```typescript
async function runUnifiedPipeline(projectId: string, selection: SelectionCriteria) {
  // Step 0: Global Blueprint (Architect runs ONCE before batch loop)
  // Note: blueprint considers ALL project requirements & flows, not just selection
  const blueprint = await ensureGlobalBlueprint(projectId);
  // -> Checks test_gen_architect_cache (by project + all-requirements hash)
  // -> If cached & !forceArchitect: loads from DB, no LLM call
  // -> If miss or forceArchitect: calls LLM, saves to cache

  // Stage 1: Component Condition Batches (only selected epics/ACs)
  const reqBatches = groupRequirementsByEpic(selection.acs);
  for (const batch of reqBatches) {
    await runLangGraph({ ...batch, globalBlueprint: blueprint }, { analystMode: 'STAGE_1_REQUIREMENT' });
  }

  // Stage 2: Integration Condition Batches
  const flowBatches = preprocessFlows(selection.flows);
  for (const batch of flowBatches) {
    await runLangGraph({ ...batch, globalBlueprint: blueprint }, { analystMode: 'STAGE_2_FLOW' });
  }

  // Stage 3: Error Guessing Batches
  const errorGuessingBatches = prepareErrorGuessingScope(selection);
  for (const batch of errorGuessingBatches) {
    await runLangGraph({ ...batch, globalBlueprint: blueprint }, { analystMode: 'STAGE_3_ERROR_GUESSING' });
  }
}
```

### 5.2 `preparation.ts` (Per-Batch Deterministic Node)
The per-batch Preparation node no longer calls the LLM — the blueprint arrives pre-populated from the orchestrator. It only runs the deterministic TS layer:

```typescript
async function PreparationNode(state: TestGenState): Promise<Partial<TestGenState>> {
  // 1. TS Computation Layer: Matrix Snapshot & Frequency Counts
  const coverageMatrix = await db.fetchPersistentCoverage(state.projectId);
  const flowFrequency = computeRequirementFrequencies(state.businessFlows);
  
  // Blueprint is already in state (injected by orchestrator) — fast path
  // Fallback: if none (e.g., forceRedesign from checkpoint_0), generate inline
  if (!state.globalBlueprint || state.forceRedesign) {
    const architectResult = await runArchitectAgent(state.projectData);
    return { globalBlueprint: architectResult.blueprint, coverageMatrix, flowFrequency, phase: 'analysis' };
  }

  return { phase: 'analysis', coverageMatrix, flowFrequency };
}
```

### 5.3 Cross-Run Architect Cache
A dedicated DB table `test_gen_architect_cache` stores the blueprint keyed by `(project_id, requirement_hash)`:

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | TEXT | Project identifier |
| `requirement_hash` | TEXT | SHA-256 of sorted **all** requirement IDs + content + flow IDs (not just the current selection) |
| `blueprint` | TEXT | JSON-serialized GlobalTestBlueprint |

The hash includes requirement content so that any edit to a selected requirement automatically invalidates the cached blueprint on the next run.

### 5.4 Prompt Engineering & New Skills
*   **Skill: `coverage_check_query`**: Provide the Analyst Agent with a Tool to dynamically query the `PersistentCoverageMatrix` during its ReAct loop, empowering it to autonomously skip duplicate logic.
*   **Analyst Prompts**: Inject distinct Persona rules and constraints depending on whether the `analystMode` is `STAGE_1_REQUIREMENT`, `STAGE_2_FLOW`, or `STAGE_3_ERROR_GUESSING`.
