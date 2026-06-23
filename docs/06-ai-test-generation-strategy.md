# AI Test Generation Strategy & Architecture

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

## 2. Design Principles

### 2.1 Separation of Test Levels (ISTQB CTFL 4.0 Ch 2.2)
ISTQB defines distinct test levels, each with a dedicated objective. Mixing objectives across levels leads to redundancy and wasted effort.
*   **Component Testing** focuses on verifying the internal logic of a single module -- input validation, boundary values, error handling.
*   **Integration / System Testing** focuses on verifying the interactions between modules -- state transfer, interface contracts, end-to-end workflows.
**Applied Rule**: The generation pipeline separates these two levels into sequential, non-overlapping stages. Stage 1 performs component-level testing. Stage 2 performs integration-level testing. Stage 2 is explicitly prohibited from re-testing component-level concerns already covered by Stage 1.

### 2.2 Orthogonal Coverage Dimensions (ISO/IEC/IEEE 29119-4 Clause 7)
*   **Requirement Coverage**: Every acceptance criterion (AC) must be exercised by at least one test condition using an appropriate specification-based technique (Equivalence Partitioning, Boundary Value Analysis, Decision Table Testing).
*   **Transition / Path Coverage**: Every critical state transition across modules must be exercised by at least one integration test case.
**Applied Rule**: The system maintains a persistent **Two-Dimensional Coverage Matrix**. This matrix is updated incrementally after each generation batch and serves as the source of truth for test de-duplication across the project's entire lifecycle.

### 2.3 Experience-Based Error Guessing (ISTQB CTFL 4.0 Ch 4.4)
Targets implicit defect patterns not explicitly described in requirements but known to cause failures in production (e.g., concurrency conflicts, orphan references, authorization bypass).
**Applied Rule**: At the end of the generation flow, the AI performs a bounded Error Guessing phase to propose a finite number of high-risk implicit flows based on the selected generation scope.

### 2.4 Atomic Test Steps (ISTQB / IEEE 829 / ISO 29119-3)
**Applied Rule**: The Test Designer agent is constrained to produce atomic steps that can be directly mapped to a single browser automation command (e.g., Playwright `click()`, `fill()`, `selectOption()`). This is critical for downstream integration with AI-driven recording engines (Stagehand, UI-TARS).

### 2.5 Decoupling Global Design from Local Generation (Agile Architecture)
To manage LLM token costs on large-scale projects and support agile feature delivery, "Test Architecture Design" must be decoupled from "Test Case Implementation".
*   **Applied Rule**: The system introduces a "Phase 0" to generate and cache a Global Test Blueprint containing high-level system dependencies. Subsequent test generation stages (Stages 1 to 3) can be triggered incrementally or in batches based on user-selected Epics or Flows. During batched execution, the system injects the cached Global Blueprint and the dynamically retrieved persistent Coverage Matrix, ensuring localized execution maintains holistic architectural awareness.

---

## 3. Four-Stage Unified Pipeline

The Orchestrator executes a unified, decoupled pipeline consisting of a global design phase followed by three incremental generation stages:

### Phase 0: Global Test Modeling & Blueprint Caching
| Attribute | Value |
|-----------|-------|
| **Objective** | Build a macro-level dependency graph of the entire project to prevent "tunnel vision" during local, batched generation. |
| **Trigger** | First-time initialization or when the user manually toggles "Force Redesign". |
| **Input** | Tree outlines of all Epics and Business Flows in the project (excluding detailed rules/fields to save tokens). |
| **Output** | A cached `Global Test Blueprint` containing high-frequency shared nodes and cross-module state dependencies. |

### Stage 1: Requirement Batches (Component-Level Incremental Coverage)
| Attribute | Value |
|-----------|-------|
| **Objective** | Achieve baseline functional requirement coverage for the user-selected subset of ACs. |
| **Input** | **Selected** AC-level requirements + Phase 0 `Global Test Blueprint` + Persisted `Current Coverage Matrix` from the DB. |
| **Execution** | Group the selected requirements into parallel batches by Epic. Apply EP, BVA, and Decision Table techniques. |
| **Persistence** | After each batch, the generated case counts and technique tags are **upserted (incrementally updated)** into the database's persistent Coverage Matrix. |

### Stage 2: Flow Batches (Integration-Level Incremental Coverage)
| Attribute | Value |
|-----------|-------|
| **Objective** | Verify inter-module state transitions and interface contracts for the user-selected subset of Flows. |
| **Input** | **Selected** Business Flows + Phase 0 `Global Test Blueprint` + Persisted `Current Coverage Matrix` from the DB. |
| **Execution** | Steps already covered in Stage 1 (per the Coverage Matrix) are marked as `(Reference Only)`. The model is restricted to generating `integration` category conditions focused solely on state handover. |
| **Persistence** | After each batch, end-to-end transition coverage metrics are **upserted (incrementally updated)** into the persistent Coverage Matrix. |

### Stage 3: Error-Guessing Flow Synthesis (Batched Path Discovery)
| Attribute | Value |
|-----------|-------|
| **Objective** | Discover high-risk implicit paths related to the current batch's execution scope. |
| **Execution** | Reads the selected scope and the Global Blueprint to propose a bounded number of anomalous or edge-case flows. |
| **Gate Mechanism**| In `interactive` mode, requires Human-in-the-loop review. In `auto` mode, approved automatically. Approved flows immediately enter the Stage 2 queue for implementation. |

---

## 4. Test Step Atomicity Specification

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

### 5.1 Orchestrator Refactoring for Incremental & Global Routing
Rewrite the core pipeline to support global blueprinting and incremental, state-aware batching:

```typescript
async function runUnifiedPipeline(projectId: string, selection: SelectionCriteria, mode: 'auto' | 'interactive', forceRedesign: boolean = false) {
  
  // Phase 0: Global Blueprint Setup (Skipped if cached and not forced)
  let globalBlueprint = await fetchGlobalBlueprint(projectId);
  if (!globalBlueprint || forceRedesign) {
    const fullProjectOutlines = extractFullProjectOutlines(projectId); // Extract skeletal structure only
    globalBlueprint = await generateGlobalBlueprint(fullProjectOutlines);
    await persistGlobalBlueprint(projectId, globalBlueprint);
  }

  // Stage 1: Incremental Component Generation
  const reqBatches = groupRequirementsByEpic(selection.acs);
  for (const batch of reqBatches) {
    // Fetch the latest snapshot of the persistent matrix before each batch
    const latestCoverage = await fetchIncrementalCoverageMatrix(projectId);
    const result = await runAnalystDesignerQualityPipeline(batch, { stage: 'requirement', blueprint: globalBlueprint, coverage: latestCoverage });
    // Upsert the results to make them immediately available for subsequent batches
    await upsertCoverageMatrix(projectId, result.coverageData); 
  }

  // Stage 2: Incremental Integration Generation
  const flowBatches = preprocessFlows(selection.flows, await fetchIncrementalCoverageMatrix(projectId));
  for (const batch of flowBatches) {
    const latestCoverage = await fetchIncrementalCoverageMatrix(projectId);
    const result = await runAnalystDesignerQualityPipeline(batch, { stage: 'flow', blueprint: globalBlueprint, coverage: latestCoverage });
    await upsertCoverageMatrix(projectId, result.coverageData);
  }

  // Stage 3: Scope-Aware Error Guessing
  const suggestedFlows = await runErrorGuessingAnalyst(selection, globalBlueprint, await fetchIncrementalCoverageMatrix(projectId));
  if (mode === 'interactive') {
    await enqueueForHumanReview(suggestedFlows);
  } else {
    await autoApproveAndGenerateFlowCases(suggestedFlows);
  }
}
```

### 5.2 Persistent Coverage Matrix 2.0 (Database Layer)
Transform `computeCoverageMatrix` from a transient in-memory function to a persistent, incrementally updatable database module:

```typescript
// Database storage model for cross-release deduplication
interface PersistentCoverageMatrix {
  requirementRows: Map<RequirementId, { caseCount: number; techniques: string[] }>;
  flowRows: Map<FlowId, { coveredTransitions: string[]; uncoveredTransitions: string[] }>;
}
```

### 5.3 Prompt Engineering & New Skills
*   **Skill: `coverage_check_query`**: Analyst Agent directly queries the database-persisted `PersistentCoverageMatrix` during its ReAct loop to determine if specific nodes need additional testing.
*   **Prompt: Phase 0 Architect**: Write a specialized prompt directing the AI to output a dependency matrix and identify shared application states.
*   **Prompt: Designer**: Inject the five golden rules of atomicity, strictly enforcing the Playwright API mapping constraints.

---

*This document is the authoritative technical specification for refactoring the test generation orchestrator and AI prompts.*
