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

### 3.1 Preparation Node (Hybrid Architect Engine)

The Preparation node acts as the "Phase 0" Global Architect. It is a Hybrid Agent that builds the global context before the Analyst begins generation.

| Capability Layer | Execution Responsibilities | Output Artifacts |
|-----------------|----------------------------|------------------|
| **Pure TypeScript (Deterministic)** | **1. Frequency Scanning**: Scans all Flows to count occurrences of each `RequirementID`, tagging high-frequency nodes as `isDuplicateReference`.<br>**2. DAG Topology**: Builds explicit dependency trees of Epics/Flows via database relations.<br>**3. Coverage Snapshot**: Fetches the latest 2D CoverageMatrix from the database. | Statistical arrays, Dependency DAG, JSON Coverage Matrix |
| **LLM Reasoning (Semantic)** | **1. Strategic Guidance**: Infers implicit shared states (e.g., Auth, Interceptors) from the TS data to guide downstream Agents.<br>**2. Preemptive Error Guessing**: Autonomously hypothesizes a bounded number of high-risk anomalous business flows (e.g., race conditions, orphan references) not explicitly defined in requirements. | `Global Test Blueprint`, Limited `Anomalous Flow Proposals` |

### 3.2 Analyst Node (Test Condition Generator)

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
The Orchestrator feeds batched subsets into the intact LangGraph pipeline while commanding the Analyst to assume different Stage modes:

```typescript
async function runUnifiedPipeline(projectId: string, selection: SelectionCriteria) {
  // Stage 1: Component Condition Batches
  const reqBatches = groupRequirementsByEpic(selection.acs);
  for (const batch of reqBatches) {
    await runLangGraph(batch, { analystMode: 'STAGE_1_REQUIREMENT' });
  }

  // Stage 2: Integration Condition Batches
  const flowBatches = preprocessFlows(selection.flows);
  for (const batch of flowBatches) {
    await runLangGraph(batch, { analystMode: 'STAGE_2_FLOW' });
  }

  // Stage 3: Error Guessing Batches
  const errorGuessingBatches = prepareErrorGuessingScope(selection);
  for (const batch of errorGuessingBatches) {
    await runLangGraph(batch, { analystMode: 'STAGE_3_ERROR_GUESSING' });
  }
}
```

### 5.2 `preparation.ts` Refactoring (Hybrid Agent)
Upgrade the entry node to calculate the latest state and intercept duplicate designs:

```typescript
async function PreparationNode(state: TestGenState): Promise<Partial<TestGenState>> {
  // 1. TS Computation Layer: Matrix Snapshot & Frequency Counts
  const coverageMatrix = await db.fetchPersistentCoverage(state.projectId);
  const flowFrequency = computeRequirementFrequencies(state.businessFlows);
  
  if (state.globalBlueprint && !state.forceRedesign) {
     return { phase: 'analysis', coverageMatrix, flowFrequency };
  }

  // 2. LLM Semantic Layer: Blueprint Generation
  const architectResult = await runArchitectAgent(state.projectData);
  await db.persistBlueprint(state.projectId, architectResult.blueprint);

  return { globalBlueprint: architectResult.blueprint, coverageMatrix, flowFrequency, phase: 'analysis' };
}
```

### 5.3 Prompt Engineering & New Skills
*   **Skill: `coverage_check_query`**: Provide the Analyst Agent with a Tool to dynamically query the `PersistentCoverageMatrix` during its ReAct loop, empowering it to autonomously skip duplicate logic.
*   **Analyst Prompts**: Inject distinct Persona rules and constraints depending on whether the `analystMode` is `STAGE_1_REQUIREMENT`, `STAGE_2_FLOW`, or `STAGE_3_ERROR_GUESSING`.
