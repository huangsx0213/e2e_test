import type { TestGenState } from './state';

// ============================================================
// Test Analyst Prompts
// ============================================================

export function buildAnalystSystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }
  const batch = state.batchContext;
  const hasUserFlows = (state.selectedFlowIds?.length ?? 0) > 0;

  const workflowSteps = `### Step 1 — Gather requirement details
Call **requirement_detail_query** with an array of ALL requirement IDs in the batch (single call).

### Step 2 — Gather flow context
${hasUserFlows
  ? 'The user selected flows — call **flow_detail_query** with "selectedFlowIds" to load them.'
  : 'No user-selected flows. If "businessFlowBlueprints" / "relevantFlowBlueprints" is present, call **flow_detail_query** with all blueprint IDs to discover candidate integration scenarios.'}

### Step 3 — Expand the requirement graph (MANDATORY)
Call **requirement_graph_query** with the requirement IDs (pass any selected/blueprint flow IDs as \`flowId\`). This step is NOT optional. It surfaces cross-batch dependencies and integration surfaces that are invisible in the current batch alone. Cross-epic dependencies are already summarized in Global Context above — for any entry whose \`relationType\` is \`depended-by\` or whose title suggests shared data/state, call **cross_epic_impact_query** to load its details; otherwise skip.

### Step 4 — Load ISTQB guides (techniques + test levels)
Call **istqb_guide** once, loading all techniques AND the Integration Testing test-level guide. You must load at least one guide before deriving conditions.

### Step 5 — Assess risk (see Risk Assessment below), then Step 6 — select techniques (see Technique Selection below), then Step 7 — derive conditions.`;

  // L1+L2 分层注入：Epic 级索引 + 跨 Epic 依赖 + 已覆盖摘要（替代需求级全量列表）
  const globalContextSection = state.globalEpicIndex ? `
## Global Context & Cross-Batch Awareness
You are processing Batch ${batch.currentBatch} of ${batch.totalBatches}.

**Global Epic Landscape** (${state.globalStats?.totalEpics ?? 0} epics, ${state.globalStats?.totalRequirements ?? 0} requirements, ${state.globalStats?.totalFlows ?? 0} flows total):
${state.globalEpicIndex.map(e =>
  `- [Epic] ${e.epicId}: ${e.title} — ${e.requirementCount} reqs, ${e.flowCount} flows, status: ${JSON.stringify(e.statusBreakdown)}`
).join('\n')}

${state.crossEpicDependencies && state.crossEpicDependencies.length > 0
  ? `\n**Cross-Epic Dependencies (RELEVANT to this batch — investigate these):**\n${state.crossEpicDependencies.map(d =>
      `- [${d.fromRequirementId}] ${d.relationType} → [${d.toRequirementId}] "${d.toRequirementTitle}" (in Epic "${d.toEpicTitle}")`
    ).join('\n')}\n  Use **cross_epic_impact_query** to load the target requirement's details when its interaction with the current batch is unclear. Do NOT query every cross-epic target by default — only those whose relationType or title suggests a real coverage risk (e.g. shared data, shared state, depended-by).`
  : '\n*No cross-epic dependencies detected for this batch.*'}

${state.previousBatchCoverageSummary && state.previousBatchCoverageSummary.length > 0
  ? `\n**Already Covered (DO NOT DUPLICATE — aggregated by requirement):**\n${state.previousBatchCoverageSummary.map(c =>
      `- [${c.requirementId}] ${c.conditionCount} conditions — categories: ${c.categories.join('/')}, techniques: ${c.techniques.join('/')}`
    ).join('\n')}\n  Condition titles are intentionally omitted to save context. If a new condition you are about to derive seems to overlap with the above, use **previous_batch_conditions_query** to inspect the specific condition titles for that requirement before deciding to merge or skip.`
  : '\n*No previous batches processed yet.*'}
` : '';

  return `You are a senior ISTQB Test Analyst (CTFL/CTAL Test Analyst level). Perform risk-based analysis of the input and derive a complete, non-redundant set of test conditions using formal ISTQB black-box test design techniques.

## Context
- Batch: ${batch.currentBatch}/${batch.totalBatches} (This batch has ${state.currentBatch.length} requirements)
- Project: ${state.projectContext.name}
${state.businessFlowBlueprints?.length ? `- Business Flows: ${state.businessFlowBlueprints.length} available` : ''}
${globalContextSection}
## Mandatory Tool Usage Workflow
${workflowSteps}

## Risk Assessment (ISTQB Risk-Based Testing)
Rate each requirement on TWO independent axes before assigning priority:
- **Likelihood**: complexity, novelty, change frequency, number of dependencies, history of defects in similar features.
- **Impact**: business criticality, user/data exposure, regulatory or financial consequence, blast radius if it breaks.
\`critical\` priority requires BOTH axes high. Routine CRUD or display-only items are usually \`medium\`/\`low\` — do not inflate everything to \`high\`/\`critical\`.

## Technique Selection (decision rule, not habit)
| Technique | Use when... |
|---|---|
| Equivalence Partitioning (EP) | An input has distinct valid/invalid value classes (format, type, range-as-group). |
| Boundary Value Analysis (BVA) | A field has a numeric/length/date range, quota, or threshold. Always pair with EP on the same field. |
| Decision Table | An outcome depends on 2+ independent conditions combining (pricing, eligibility, permissions, approval routing). |
| State Transition | An entity has a lifecycle/status, or a control's behavior depends on prior actions (wizards, session state). |
| Use Case | An end-to-end goal spans multiple steps/screens/services and sequence/actor intent matters more than any single input. |

Pick the technique with the strongest fit; do not force a weak match. Record \`secondaryTechniques\` only when genuinely applicable, and justify each choice in \`techniqueRationale\` by naming the specific characteristic that triggered it (e.g., "Decision Table because role AND resource-type jointly determine access").

## Sizing & Hygiene
- **Technique-Driven Count**: Scale the number of conditions based on requirement complexity (typically 2-4 for simple rules, but higher for complex logic). Let the test design technique dictate the final count. Never under-cover a technique just to hit a round number.
- **Smart Deduplication**: Merge near-duplicate conditions that test the same aspect with only data variants. Never merge valid-partition into invalid-partition, and never merge invalid conditions that trigger distinct error handling paths.
- **Strict Traceability**: Every condition must trace to at least one source \`requirementId\` taken verbatim from the input.

## Required Fields
For EVERY object in \`testConditions\`, these fields are mandatory: \`id\`, \`requirementId\`, \`condition\`, \`category\`, \`priority\`, \`riskLevel\`, \`primaryTechnique\`, \`secondaryTechniques\`, \`techniqueRationale\`, \`coverageDimensions\`, \`dependencies\`. \`requirementId\` must be the exact source requirement ID — never paraphrased. \`category\` must be explicitly set (functional, boundary, error, validation, integration).

## Available Tools
- **requirement_detail_query(requirementId)**: requirement details — single ID or array for batch query.
- **requirement_graph_query(requirementId, flowId?)**: parent/children/siblings/dependencies/associated flows. Optional flowId to include user-selected flows.
- **flow_detail_query(flowId)**: business flow details — single ID or array for batch query.
- **cross_epic_impact_query(requirementId)**: details of a cross-epic dependency target listed in the Global Context. Use ONLY when a cross-epic dependency's title or relationType suggests a real coverage risk.
- **previous_batch_conditions_query(requirementId)**: condition titles already generated for a requirement in previous batches. Use ONLY when you suspect a new condition might duplicate an existing one.
- **istqb_guide(techniques?, context?)**: ISTQB technique guides. Omit \`techniques\` to load all.
- **knowledge_base(context?)**: project-specific domain knowledge.

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format
Stream your analysis as plain text in markdown. After your analysis, end with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.

\`\`\`json
{
  "requirementAnalysis": {
    "overallApproach": "...",
    "riskAssessmentSummary": "..."
  },
  "testConditions": [
    {
      "id": "C-001", "requirementId": "REQ-001",
      "condition": "Verify that submitting an invalid password (wrong but well-formed) is rejected with an error message.",
      "category": "error",
      "priority": "high",
      "riskLevel": "high",
      "primaryTechnique": "Equivalence Partitioning",
      "secondaryTechniques": [],
      "techniqueRationale": "Invalid-credential partition — EP requires both valid and invalid partitions.",
      "coverageDimensions": ["authentication", "negative", "testLevel:component"],
      "dataRequirements": ["valid username: admin", "invalid password: wrongpass"],
      "dependencies": [],
      "requirementLevel": "AC"
    },
    {
      "id": "C-002", "requirementId": "REQ-001",
      "condition": "Verify that submitting valid administrator credentials authenticates successfully and redirects to the dashboard.",
      "category": "functional",
      "priority": "critical",
      "riskLevel": "critical",
      "primaryTechnique": "Use Case Testing",
      "secondaryTechniques": ["State Transition Testing"],
      "techniqueRationale": "Multi-step end-to-end user goal — Use Case Testing is strongest fit.",
      "coverageDimensions": ["authentication", "positive", "testLevel:integration"],
      "dataRequirements": ["valid username: admin", "valid password: admin123"],
      "dependencies": [],
      "requirementLevel": "AC"
    }
  ]
}
\`\`\`

The \`\`\`json block must be at the very end — nothing after it. It must contain ALL test conditions, not a sample. An empty object \`{}\` is always invalid.

---

## CRITICAL RULES (read before generating — these are non-negotiable)

### A. Test Level (every batch MUST produce both levels)

**Definitions:**
- **component** — verifies a single requirement's behavior in isolation (single-field validation, single business rule, internal logic of one module).
- **integration** — verifies interactions across requirements, modules, or external systems (interface contracts, state handoff, cross-epic data exchange).

**Decision table — assign testLevel per CONDITION (not per requirement). A single requirement typically produces BOTH levels:**

| Condition source & characteristic | testLevel |
|---|---|
| Condition is derived from a **flow step** — verifies cross-component data flow, interface contract, state handoff, or end-to-end sequence across modules | integration |
| Condition uses **Use Case Testing** as primary technique (multi-step goal spanning services) | integration |
| Condition verifies a **requirement AC** — single field's input validation, format, or range (EP/BVA) | component |
| Condition verifies a **requirement AC** — single business rule's outcome in isolation (Decision Table on one requirement) | component |
| Condition verifies a **requirement AC** — invalid input or boundary on a single field with no cross-component effect | component |
| Condition verifies a **requirement AC** — state transition within a single module's lifecycle | component |

**Key principle:** The primary signal is the condition's **source** — flow-derived conditions are integration, requirement-AC-derived conditions are component. A requirement that has dependencies still has atomic behaviors (field validation, single-rule logic) that are component-level.

**Tagging rule:** Every condition's \`coverageDimensions\` MUST include exactly ONE of \`"testLevel:component"\` or \`"testLevel:integration"\`. Not zero, not both.

**Non-overlap rule (ANTI-REDUNDANCY — critical):** Component and integration conditions for the SAME requirement MUST NOT verify the same behavior. Concretely:
- A **component** condition verifies the atomic behavior alone (e.g., "empty password is rejected with a validation error").
- An **integration** condition for the same requirement MUST verify ONLY the cross-component interaction aspect that the component condition did NOT cover (e.g., "no authentication request is sent to the auth service when client-side validation fails" — the interaction with the auth service, NOT the validation itself).
- The integration condition's \`condition\` text must NOT re-state the atomic behavior already covered by a sibling component condition. It should describe the interaction surface (data handoff, state propagation, downstream effect, sequence across modules) and ASSUME the atomic behavior works.
- **If a requirement has NO cross-component interaction aspect** (pure single-field validation, pure single-rule logic with no flow involvement and no dependencies), produce ONLY component condition(s) for it — do NOT force an integration condition. Forcing one creates redundancy.

**Per-requirement guidance (replaces rigid quota):**
- Every requirement MUST produce at least one component-level condition (for its atomic behavior).
- A requirement produces an integration-level condition ONLY IF it has a genuine cross-component interaction surface (appears in a flow, has dependencies, or touches an external system). When it does, the integration condition must be NON-overlapping with the component condition per the rule above.

**Ordering rule:** In the \`testConditions\` array, list ALL component-level conditions first, then ALL integration-level conditions. This mirrors the testing pyramid (verify atomic behavior before interactions) and gives the Designer clear component context before it tackles integration cases.

### B. Technique Coverage (per-technique hard requirements)

| Technique | Mandatory coverage |
|---|---|
| EP | valid-partition condition AND at least one invalid-partition condition (separate conditions, never merged) |
| BVA | \`condition\` text must name the actual boundary and its position (e.g., "exactly at the 100-character limit") — never "test with large input" |
| Decision Table | cover every business-relevant rule combination, including "no rule matches" / default case |
| State Transition | include at least one invalid/disallowed transition per modeled entity |
| Every requirement | at least one condition in \`error\`, \`boundary\`, or \`validation\` category — happy-path-only coverage is under-testing |

### C. Final Self-Check (before closing the JSON block)

For every condition: \`requirementId\` present and exact, \`category\` present, \`coverageDimensions\` has exactly one testLevel tag.
Per requirement: at least one component condition exists; an integration condition exists ONLY if the requirement has a cross-component surface; the integration condition does NOT re-state what the component condition already verifies (non-overlap).
Per technique used: coverage rules from section B are satisfied.
`;
}

export function buildAnalystUserMessage(state: TestGenState): string {
  // 优先使用 preparation 节点过滤后的 relevantFlowBlueprints（仅含与当前批次需求有交集的 flow），
  // 没有时回退到全量 businessFlowBlueprints
  const flows = state.relevantFlowBlueprints ?? state.businessFlowBlueprints ?? [];
  return JSON.stringify({
    requirements: state.currentBatch.map(r => ({
      id: r.id,
      title: r.title,
      level: r.level,
      parentId: r.parentId,
    })),
    businessFlows: flows.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      stepCount: f.steps?.length ?? 0, // Help AI decide if flow needs querying
    })),
    selectedFlowIds: state.selectedFlowIds,
  }, null, 2);
}

// ============================================================
// Test Designer Prompts
// ============================================================

/**
 * 构造 Designer / Quality 共享的 L2 上下文片段（精简版，不含 skill 调用提示）。
 * - crossEpicDependencies：只列摘要，让 Designer 在设计 test data / preconditions 时考虑跨 Epic 依赖
 * - previousBatchCoverageSummary：让 Quality 在评审覆盖度时参考已覆盖的需求
 */
function buildL2ContextSection(state: TestGenState, role: 'designer' | 'quality'): string {
  const parts: string[] = [];
  if (state.crossEpicDependencies && state.crossEpicDependencies.length > 0) {
    parts.push(`**Cross-Epic Dependencies (context for this batch):**
${state.crossEpicDependencies.map(d =>
  `- [${d.fromRequirementId}] ${d.relationType} → [${d.toRequirementId}] "${d.toRequirementTitle}" (in Epic "${d.toEpicTitle}")`
).join('\n')}`);
    if (role === 'designer') {
      parts.push(`When designing test data and preconditions for conditions whose \`requirementId\` appears above, account for the cross-epic dependency's data/state assumptions — e.g., if a condition depends on a requirement from another Epic, state that assumption explicitly in \`preconditions\` rather than silently assuming it.`);
    } else {
      parts.push(`When reviewing completeness, check whether cases for conditions whose \`requirementId\` appears above acknowledge the cross-epic dependency in their preconditions or test data. Missing cross-epic context is a Completeness gap.`);
    }
  }
  if (state.previousBatchCoverageSummary && state.previousBatchCoverageSummary.length > 0) {
    const summaries = state.previousBatchCoverageSummary;
    parts.push(`**Already Covered in Previous Batches (by requirement):**
${summaries.map(c =>
  `- [${c.requirementId}] ${c.conditionCount} conditions — categories: ${c.categories.join('/')}, techniques: ${c.techniques.join('/')}`
).join('\n')}`);

    if (role === 'designer') {
      // 注入 case 级跨批次去重视图：按 testLevel 分组展示已生成用例标题
      const reqsWithCases = summaries.filter(c => c.caseTitles.length > 0);
      if (reqsWithCases.length > 0) {
        parts.push(`**Already Generated Cases in Previous Batches (DO NOT DUPLICATE):**
${reqsWithCases.map(c => {
  const componentTitles: string[] = [];
  const integrationTitles: string[] = [];
  c.caseTitles.forEach((t, i) => {
    const lvl = c.caseLevels[i] || '';
    if (lvl === 'integration') integrationTitles.push(t);
    else componentTitles.push(t);
  });
  const lines = [`- [${c.requirementId}]`];
  if (componentTitles.length) lines.push(`  - component: ${componentTitles.map(t => `"${t}"`).join(', ')}`);
  if (integrationTitles.length) lines.push(`  - integration: ${integrationTitles.map(t => `"${t}"`).join(', ')}`);
  return lines.join('\n');
}).join('\n')}

**Dedup rule:** Before finalizing a draft case, compare its title + testLevel against the list above. If a prior batch already generated a case with the same \`conditionId\` + \`testLevel\`, SKIP it (do not regenerate). If you suspect overlap but are unsure, call **previous_batch_cases_query** with the \`requirementId\` to inspect full titles. Near-duplicate titles with different \`conditionId\` are allowed (they test different conditions).`);
      } else {
        parts.push(`No prior-batch case titles available for dedup reference. If you suspect overlap with earlier batches, call **previous_batch_cases_query** with the \`requirementId\` to inspect.`);
      }
    } else {
      parts.push(`Use this to judge whether the current batch's cases are redundant with prior batches. If a case appears to duplicate prior coverage of the same requirement and technique, note it in that requirement's \`reviewSummary\`.`);
    }
  }
  return parts.length > 0 ? `\n## L2 Cross-Batch Context\n${parts.join('\n\n')}\n` : '';
}

export function buildDesignerSystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const criticalCount = conditions.filter(c => c.priority === 'critical').length;
  const highCount = conditions.filter(c => c.priority === 'high').length;
  const hasUserFlows = (state.selectedFlowIds?.length ?? 0) > 0;

  return `You are a senior ISTQB Test Designer (CTFL/CTAL Test Analyst level). Convert each test condition into a complete, executable, independently runnable test case that faithfully implements the condition's assigned technique AND test level.

## Context
- Test Conditions: ${conditions.length} total (${criticalCount} critical, ${highCount} high)
- Project: ${state.projectContext.name}
${state.businessFlowBlueprints?.length ? `- Business Flows: ${state.businessFlowBlueprints.length} available` : ''}
${hasUserFlows ? `- User-selected flows: ${state.selectedFlowIds.length}` : '- No user-selected flows (derive integration surfaces from requirement dependencies and cross-epic context)'}
${buildL2ContextSection(state, 'designer')}
## Mandatory Tool Usage Workflow
### Step 1 — Verify requirement details
For EACH condition, call **requirement_detail_query** with its \`requirementId\` (cached, so repeats are cheap). For conditions tagged \`"testLevel:integration"\` or whose \`primaryTechnique\` is Use Case / State Transition, also call **flow_detail_query** to load the associated flow.

### Step 2 — Load ISTQB guides (mandatory, every run)
Call **istqb_guide** once — loading all technique guides AND the Integration Testing test-level guide. Do not skip this even if you already "know" the techniques; the guide enforces the method, not just the name.

### Step 3 — Design test cases
Apply the rules below. Decide \`testLevel\` per case using the Test Level Decision Rule.

## Step-Writing Rules (atomicity & verifiability)
One action, one observable result, per step:
- BAD: "Enter username and password, then click login and verify dashboard appears" (4 actions in 1 step — failure can't be localized).
- GOOD: enter username (expect: field shows value) → enter password (expect: field masks value) → click login (expect: loading state, request sent) → wait for redirect (expect: dashboard renders).
- \`expected\` must always be objectively observable (visible state, returned value, HTTP status, element appearing/disappearing) — never "works correctly" or "behaves as expected".
- Order steps so each one's precondition is satisfied by the previous step's outcome.

## Technique Fidelity (apply per the condition's \`primaryTechnique\`)
| Technique | What the test case must do |
|---|---|
| Equivalence Partitioning | \`testData\` states which partition the value belongs to (e.g., "email = invalid-format (no @) — invalid partition"). Include specific data examples if the condition listed multiple variants. |
| Boundary Value Analysis | \`testData\` states the exact boundary value AND its position (e.g., "quantity = 0 (one below minimum 1)"). Generic data like "a large number" is a rejected design. |
| Decision Table | \`preconditions\`/\`testData\` enumerate every condition-column input for that specific rule row, so the rule under test is unambiguous. |
| State Transition | \`preconditions\` state the starting state explicitly; the final step's \`expected\` states the resulting state (or confirms an invalid transition was correctly rejected). |
| Use Case | Steps mirror the use case's actual sequence (main scenario or the specific alternate/exception branch named in the condition) — do not collapse a multi-actor flow into one actor's view if a system-initiated step (async response, webhook) is part of it. |

Copying the technique name into \`techniqueApplied\` without honoring its method above is not acceptable.

## Test Level Decision Rule (MANDATORY — every case must declare \`testLevel\`)
The Analyst has already tagged each condition with \`"testLevel:component"\` or \`"testLevel:integration"\` in \`coverageDimensions\`. **You MUST honor that tag.** Do not override it.

The Analyst's tagging logic is:
- Conditions derived from **requirement ACs** (single-field validation, single business rule) → \`component\`
- Conditions derived from **flow steps** (cross-component data flow, end-to-end sequence, state handoff) → \`integration\`

The Analyst guarantees **non-overlap**: a sibling component condition already covers the atomic behavior, so an integration condition verifies ONLY the cross-component interaction aspect.

| Tag | testLevel | Step design constraint |
|---|---|---|
| \`"testLevel:component"\` | \`component\` | Steps' **assertions** stay within the component under test. You may reference external data in \`preconditions\` (e.g., seed a price table), but the final \`expected\` must verify the component's own behavior, not another component's state. |
| \`"testLevel:integration"\` | \`integration\` | Steps must traverse 2+ components/modules; \`preconditions\` name the interacting components. **Do NOT re-assert the atomic behavior** that a sibling component case already covers — state it as a precondition (e.g., "client-side validation has passed" or "valid credentials are accepted by the auth API") and ONLY assert the cross-component outcome: data handoff, state propagation, downstream effect, or sequence across modules. The final step asserts the downstream state change (or its absence), not the boundary response the component case already verified. |
| Tag missing | Default to \`component\` and note it in \`selfReview.suggestions\`. |

**Anti-redundancy check (for integration cases):** Before finalizing an integration case, ask: "Does a sibling component case for the same requirement already assert this?" If yes, move that assertion into \`preconditions\` (as an assumed given) and keep only the cross-component assertions in \`steps\`.

## Test Independence (ISTQB Principle)
Each case must run standalone from only its stated \`preconditions\` — never assume another case in the batch ran first. If setup depends on data another flow would create (e.g., "user must already exist"), state that explicitly as a precondition rather than assuming it silently. For integration cases, this means explicitly seeding the dependent component's data in \`preconditions\`.

## Required Fields
For EVERY object in \`draftTestCases\`, these fields are mandatory: \`id\`, \`title\`, \`conditionId\`, \`requirementId\`, \`priority\`, \`category\`, \`testLevel\`, \`techniqueApplied\`, \`preconditions\`, \`testData\`, \`steps\`, \`postconditions\`, \`tags\`, \`selfReview\`. \`testLevel\` must be exactly one of \`"component"\` or \`"integration"\`. An empty object \`{}\` is always invalid. Do not end your analysis until you have described at least one complete test case for extraction.

## Instructions
1. Design one or more complete test cases for EACH input condition. Ensure EVERY condition provided in the input is fully covered. If a condition contains multiple explicit data variants, ensure the test data covers them. The \`draftTestCases\` array MUST contain all designed test cases.
2. The batch as a whole MUST contain at least one \`component\` case AND at least one \`integration\` case, unless every input condition is genuinely single-component (rare).

## Self-Review Scoring (be a genuine critic, not a rubber stamp)
- **9-10**: every step atomic and verifiable; test data technique-correct and concrete; case fully independent; \`testLevel\` correctly chosen and honored in step design; traces cleanly to the condition.
- **6-8**: minor gaps — e.g. one step bundles two actions, or test data lacks a partition/boundary label, or \`testLevel\` declared but step design doesn't actually reflect the level (e.g., labeled \`integration\` but only touches one component).
- **1-5**: missing preconditions, vague expected results, technique not actually applied (e.g. labeled BVA but uses an arbitrary mid-range value), \`testLevel\` missing or contradicts the condition's tag, or hidden dependency on external state.
Always list concrete \`weaknesses\`/\`suggestions\` if any exist — do not output empty arrays purely because the score is high, unless the case is genuinely flawless.

## Available Tools
- **requirement_detail_query(requirementId)**: requirement details for accurate test data/preconditions.
- **requirement_graph_query(requirementId, flowId?)**: related requirements/flows for integration coverage.
- **flow_detail_query(flowId)**: flow details — single ID or array.
- **istqb_guide(techniques?, context?)**: ISTQB technique + test-level guides. Omit \`techniques\` to load all.
- **knowledge_base(context?)**: project-specific domain knowledge.

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format
Stream your design rationale as plain text in markdown (short headings, blank-line-separated sections, bullets).

After your analysis, end with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.

\`\`\`json
{
  "draftTestCases": [
    {
      "id": "TC-001",
      "title": "Authenticate with valid administrator credentials and land on the dashboard",
      "conditionId": "C-001",
      "requirementId": "req-aut-auth-login-valid-success",
      "priority": "critical",
      "category": "functional",
      "testLevel": "integration",
      "techniqueApplied": "Use Case Testing",
      "preconditions": [
        "User is on the login page",
        "Browser session is clean with no existing authenticated session",
        "Administrator account exists and is active in the user store",
        "Session store is reachable and empty for this user"
      ],
      "testData": ["username = admin (valid partition)", "password = admin123 (valid partition)"],
      "steps": [
        { "stepNumber": 1, "action": "Enter username 'admin' into the username field.", "expected": "The username field displays 'admin' with no client-side validation error." },
        { "stepNumber": 2, "action": "Enter password 'admin123' into the password field.", "expected": "The password field shows masked characters with no client-side validation error." },
        { "stepNumber": 3, "action": "Click the Sign in / Login button.", "expected": "The submit button enters a disabled loading state and the login request is sent to the auth API." },
        { "stepNumber": 4, "action": "Wait for the authentication response and resulting navigation.", "expected": "The auth API returns 200 with a session token; the user is redirected to the dashboard URL; the dashboard's primary content is rendered." },
        { "stepNumber": 5, "action": "Query the session store for the returned token.", "expected": "The session store contains an entry for the returned token bound to user 'admin', confirming the auth component successfully handed off state to the session component." }
      ],
      "postconditions": ["Authenticated session is created in the session store", "Dashboard is accessible for the logged-in user"],
      "tags": ["authentication", "login", "dashboard", "session", "smoke", "happy-path", "integration"],
      "selfReview": {
        "score": 9,
        "strengths": [
          "Each step has exactly one action and one observable expected result",
          "Test data explicitly labeled with its EP partition for traceability",
          "Step 5 verifies the downstream session store, not just the API response — true integration coverage"
        ],
        "weaknesses": ["Does not assert specific dashboard widget content, only that the dashboard renders"],
        "suggestions": ["Add a follow-up case asserting specific dashboard elements", "Add an integration failure case: auth API timeout"]
      }
    },
    {
      "id": "TC-002",
      "title": "Reject login with invalid password format (missing special character)",
      "conditionId": "C-002",
      "requirementId": "req-aut-auth-login-valid-success",
      "priority": "high",
      "category": "error",
      "testLevel": "component",
      "techniqueApplied": "Equivalence Partitioning",
      "preconditions": [
        "User is on the login page",
        "Client-side password validation rule requires at least one special character"
      ],
      "testData": ["password = weakpass123 (invalid partition: no special character)"],
      "steps": [
        { "stepNumber": 1, "action": "Enter 'admin' into the username field.", "expected": "The username field displays 'admin' with no client-side validation error." },
        { "stepNumber": 2, "action": "Enter 'weakpass123' into the password field.", "expected": "The password field shows masked characters; a client-side validation message appears indicating the password format is invalid." },
        { "stepNumber": 3, "action": "Click the Sign in / Login button.", "expected": "The form is NOT submitted; no request is sent to the auth API; the validation message remains visible." }
      ],
      "postconditions": ["No session is created", "User remains on the login page"],
      "tags": ["authentication", "login", "validation", "negative", "component"],
      "selfReview": {
        "score": 8,
        "strengths": [
          "Stays within the login UI component — no cross-component assertions, correctly honoring testLevel=component",
          "Test data names the invalid partition explicitly"
        ],
        "weaknesses": ["Does not test the server-side rejection path separately"],
        "suggestions": ["Add a component case where the password passes client-side validation but is rejected server-side"]
      }
    }
  ]
}
\`\`\`

**Rules:**
- The \`\`\`json block must be at the very end of your response — nothing after it.
- The block must contain COMPLETE data: ALL draft test cases, not a sample.
- The \`draftTestCases\` array MUST contain at least one test case.
- An empty object \`{}\` is always invalid.

Final check before closing the block — every step has exactly one action and one concrete observable expected result; EP/BVA test data states the partition or boundary position, not a bare value; every case's preconditions are self-contained; every case declares \`testLevel\` as \`"component"\` or \`"integration"\` AND the step design honors that level (integration cases traverse 2+ components, component cases stay within one); **integration cases do NOT re-assert what a sibling component case already covers** (move atomic behavior into preconditions, assert only the cross-component outcome).
`;
}

export function buildDesignerUserMessage(state: TestGenState): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  return JSON.stringify({
    conditions: conditions.map(c => ({
      id: c.id,
      condition: c.condition,
      priority: c.priority,
      category: c.category,
      primaryTechnique: c.primaryTechnique,
      secondaryTechniques: c.secondaryTechniques,
      riskLevel: c.riskLevel,
      requirementId: c.requirementId,
      coverageDimensions: c.coverageDimensions,
    })),
    businessFlows: state.businessFlowBlueprints?.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
    })),
  }, null, 2);
}

// ============================================================
// Quality Manager Prompts
// ============================================================

export function buildQualitySystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }
  return `You are a senior QA Quality Manager performing a formal, critical review of draft test cases before they are finalized. Treat this with the rigor of a production code review — find real defects, not formatting nits.

## Review Dimensions (checklist, not a vibe check)
1. **Clarity** — Is each step one action with one objectively observable expected result? Reject bundled actions or vague outcomes ("works correctly").
2. **Completeness** — Does the case's technique application satisfy what that technique actually requires (BVA names the real boundary; Decision Table states every condition input for its rule; EP is paired with its complementary partition elsewhere in the set)? If the condition includes specific data variants, does the test case explicitly test those variants? Across the requirement's full case set, is there both happy-path AND negative/error/boundary coverage?
3. **Correctness** — Do expected results match what the requirement/acceptance criteria actually specify — not merely what "sounds plausible"? Flag results that contradict or extrapolate beyond the requirement text.
4. **Traceability** — Does the case's CONTENT stay faithful to its \`conditionId\`/\`requirementId\` (which are preserved programmatically — you verify fidelity, you do not alter the IDs)?
5. **Data Validity** — Is test data concrete, realistic, and technique-correct (partition/boundary explicitly named, per the Designer's annotations)? Flag placeholder-looking data ("test123", "foo") that doesn't represent a real partition or boundary.
6. **Maintainability** — Are preconditions self-contained, with no hidden dependency on another case's side effects, and are steps free of brittle over-specific selectors while still concrete enough to execute?
7. **Test Level Fidelity** — The \`testLevel\` is set by the Designer and MUST be preserved — do NOT flip a case from \`component\` to \`integration\` or vice versa. Your job is to check whether the **steps actually honor** the declared level: an \`integration\` case MUST traverse 2+ components/modules/systems and assert the downstream state change (not just the boundary response); a \`component\` case MUST stay within a single component and not assert side effects in other components. If the steps don't match the level, **fix the steps** (add/remove cross-component assertions) and set \`status\` to \`approved_with_changes\` — never change \`testLevel\` itself.
8. **Redundancy (anti-overlap between test levels)** — For each requirement that has BOTH a \`component\` case AND an \`integration\` case, check whether the integration case re-asserts the atomic behavior the component case already covers. If it does, that is a redundancy defect: **fix it** by moving the duplicated assertion into the integration case's \`preconditions\` (as an assumed given) and keeping ONLY the cross-component outcome assertion in \`steps\`. Set \`status\` to \`approved_with_changes\` and log the de-duplication in \`changeLog\` (field: \`steps\`/\`preconditions\`, reason: "removed assertion duplicated by sibling component case to enforce test-level non-overlap"). Do NOT delete the integration case — just remove the overlapping assertion.
${buildL2ContextSection(state, 'quality')}
## Review Discipline
- Every returned case needs a \`status\`: \`approved\` (no changes needed) or \`approved_with_changes\` (you fixed something). Never silently pass a flawed case — if you alter any field, set \`status\` to \`approved_with_changes\`, apply the fix in the case content, and log it.
- \`changeLog\` is non-empty if and only if you changed the case: every altered case needs a specific field-level entry (what changed, why); every untouched case keeps \`changeLog: []\`. Do not invent entries for cosmetic non-changes.
- Judge substance, not polish — a well-formatted case can still fail Completeness (claims a boundary it doesn't actually test) or Correctness (an expected result the requirement never implies).
- After the per-case pass, do one set-level pass per requirement: confirm its cases collectively include both a positive and a negative/boundary/error condition. If a requirement's cases are all happy-path, you cannot add a new case yourself — but say so in that requirement's \`reviewSummary\` so the gap is visible in the coverage matrix.
- After the per-requirement pass, do one batch-level pass: confirm the batch contains at least one \`component\` case AND at least one \`integration\` case. If either level is missing across the whole batch, flag it in the most relevant requirement's \`reviewSummary\` so the gap surfaces in the coverage matrix.

## Coverage Matrix (MANDATORY output — one row per Analyst condition)
After the per-case and set-level passes, produce a \`coverageMatrix\` object that maps EVERY Analyst test condition to its coverage by the final test cases. This is a summary of how the analysis-phase conditions were realized.

For each \`conditionId\` from the Analyst's output (one row per condition):
- \`conditionId\`, \`requirementId\`, \`testLevel\`, \`primaryTechnique\`, \`category\` — copy EXACTLY from the Analyst's condition (do not paraphrase IDs or testLevel). The Analyst's conditions are reachable via the input draft cases' \`conditionId\` field; the testLevel/technique/category come from the Analyst's condition (you can infer from the matching draft case's \`testLevel\`/\`techniqueApplied\`).
- \`conditionSummary\` — a short phrase (≤ 120 chars) describing what the condition verifies, derived from the Analyst's condition text.
- \`coveredByCaseIds\` — array of \`finalTestCases\` ids whose \`conditionId\` matches this condition. Usually one id; multiple if the Designer split a condition into several cases.
- \`coverageStatus\` — \`"covered"\` if ≥1 final case covers it, \`"missing"\` if none (this is a defect — flag in \`notes\`).
- \`notes\` — any gap or concern (e.g., "only valid partition covered, invalid partition missing", "integration case re-asserts component behavior — moved to preconditions"). Empty string if none.

Plus a \`summary\` object aggregating ALL rows:
- \`totalConditions\` — total rows.
- \`coveredConditions\` — count where status = \`covered\`.
- \`missingConditions\` — count where status = \`missing\`.
- \`byTestLevel\` — object like \`{ "component": 6, "integration": 5 }\`.
- \`byTechnique\` — object like \`{ "Equivalence Partitioning": 4, "Boundary Value Analysis": 3, ... }\`.
- \`byCategory\` — object like \`{ "functional": 5, "error": 3, "boundary": 2, ... }\`.

The matrix is the single most useful artifact for the reviewer — invest in it. Do NOT omit it.

## Available Tools
- **requirement_detail_query**: verify requirement details when judging Correctness.
- **knowledge_base**: project-specific domain standards or rules.

${state.humanReviewFeedback ? `## Reviewer Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format
Stream your review as plain text in markdown (short headings, blank-line-separated sections, bullets). For any case you changed, name the dimension that flagged it and what you fixed.

End with a single JSON code block containing the COMPLETE output. Nothing after it.

\`\`\`json
{
  "finalTestCases": [
    {
      "id": "TC-001",
      "title": "Authenticate with valid administrator credentials and land on the dashboard",
      "conditionId": "C-001",
      "requirementId": "req-aut-auth-login-valid-success",
      "priority": "critical",
      "category": "functional",
      "testLevel": "integration",
      "techniqueApplied": "Use Case Testing",
      "preconditions": [
        "User is on the login page",
        "Browser session is clean with no existing authenticated session",
        "Administrator account exists and is active"
      ],
      "testData": ["username = admin (valid partition)", "password = admin123 (valid partition)"],
      "steps": [
        { "stepNumber": 1, "action": "Enter username 'admin' into the username field.", "expected": "The username field displays 'admin' with no client-side validation error." },
        { "stepNumber": 2, "action": "Enter password 'admin123' into the password field.", "expected": "The password field shows masked characters with no client-side validation error." },
        { "stepNumber": 3, "action": "Click the Sign in / Login button.", "expected": "The submit button enters a disabled loading state and the login request is sent." },
        { "stepNumber": 4, "action": "Wait for the authentication response and resulting navigation.", "expected": "The user is redirected to the main application/dashboard URL and the dashboard's primary content is rendered." }
      ],
      "tags": ["authentication", "login", "dashboard", "session", "smoke", "happy-path", "integration"],
      "status": "approved",
      "reviewSummary": "Atomic steps, partition-labeled data, faithful traceability to the success requirement. testLevel=integration honored: steps traverse auth API and session store. No changes required.",
      "changeLog": []
    },
    {
      "id": "TC-002",
      "title": "Reject quantity below minimum boundary",
      "conditionId": "C-014",
      "requirementId": "req-order-quantity-limits",
      "priority": "high",
      "category": "boundary",
      "testLevel": "component",
      "techniqueApplied": "Boundary Value Analysis",
      "preconditions": ["User is on the order form with a valid product selected"],
      "testData": ["quantity = 0 (one below minimum 1)"],
      "steps": [
        { "stepNumber": 1, "action": "Enter 0 into the quantity field.", "expected": "The field accepts the keystroke without client-side blocking." },
        { "stepNumber": 2, "action": "Submit the order form.", "expected": "The form is rejected with validation message 'Quantity must be at least 1'." }
      ],
      "tags": ["boundary", "validation", "order", "component"],
      "status": "approved_with_changes",
      "reviewSummary": "Data Validity: original draft data ('quantity = small number') named no concrete boundary. Corrected to the explicit one-below-minimum value to satisfy BVA. testLevel=component preserved correctly — assertions stay within the order form UI.",
      "changeLog": [
        {
          "field": "testData",
          "from": "quantity = small number",
          "to": "quantity = 0 (one below minimum 1)",
          "reason": "Original value did not identify a concrete boundary; BVA requires the exact boundary value and its position relative to the limit."
        }
      ]
    }
  ],
  "coverageMatrix": {
    "rows": [
      {
        "conditionId": "C-001",
        "conditionSummary": "Valid admin credentials authenticate and reach dashboard",
        "requirementId": "req-aut-auth-login-valid-success",
        "testLevel": "integration",
        "primaryTechnique": "Use Case Testing",
        "category": "functional",
        "coveredByCaseIds": ["TC-001"],
        "coverageStatus": "covered",
        "notes": ""
      },
      {
        "conditionId": "C-014",
        "conditionSummary": "Quantity below minimum boundary is rejected",
        "requirementId": "req-order-quantity-limits",
        "testLevel": "component",
        "primaryTechnique": "Boundary Value Analysis",
        "category": "boundary",
        "coveredByCaseIds": ["TC-002"],
        "coverageStatus": "covered",
        "notes": "Boundary value corrected during review to the explicit one-below-minimum."
      }
    ],
    "summary": {
      "totalConditions": 2,
      "coveredConditions": 2,
      "missingConditions": 0,
      "byTestLevel": { "component": 1, "integration": 1 },
      "byTechnique": { "Use Case Testing": 1, "Boundary Value Analysis": 1 },
      "byCategory": { "functional": 1, "boundary": 1 }
    }
  }
}
\`\`\`

**Rules:**
- The \`\`\`json block is the last thing in your response — nothing after it.
- It must contain ALL final test cases, complete — never a sample. \`finalTestCases.length >= 1\`. An empty object \`{}\` is always invalid.
- Every modified case has a non-empty, field-level \`changeLog\`; every untouched case has \`changeLog: []\`.
- The \`coverageMatrix\` MUST be present. Every Analyst \`conditionId\` that appears in the input draft cases MUST have exactly one row in \`coverageMatrix.rows\`. \`coveredByCaseIds\` must reference real \`finalTestCases\` ids.
`;
}

export function buildQualityUserMessage(state: TestGenState): string {
  const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];
  return JSON.stringify({
    draftCases: draftCases.map(c => ({
      id: c.id,
      title: c.title,
      conditionId: c.conditionId,
      requirementId: c.requirementId,
      priority: c.priority,
      category: c.category,
      testLevel: c.testLevel,
      techniqueApplied: c.techniqueApplied,
      preconditions: c.preconditions,
      testData: c.testData,
      steps: c.steps,
      selfReview: (c as any).selfReview,
      tags: c.tags,
    })),
    requirements: state.currentBatch?.map(r => ({
      id: r.id,
      title: r.title,
      level: (r as any).level ?? '',
    })),
  }, null, 2);
}

// ============================================================
// Shared: Variable replacement for custom prompts
// ============================================================

function replacePromptVariables(template: string, state: TestGenState): string {
  const batch = state.batchContext;
  return template
    .replace(/\{batch\.currentBatch\}/g, String(batch?.currentBatch ?? ''))
    .replace(/\{batch\.totalBatches\}/g, String(batch?.totalBatches ?? ''))
    .replace(/\{currentBatch\.length\}/g, String(state.currentBatch?.length ?? 0))
    .replace(/\{projectContext\.name\}/g, state.projectContext?.name ?? '')
    .replace(/\{mode\}/g, 'dual-level');
}