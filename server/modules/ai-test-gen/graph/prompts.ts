import type { TestGenState } from './state';

export interface ComponentConditionReference {
  referenceId: string;
  conditionId: string;
  requirementId: string;
  condition: string;
}

/**
 * Build the unified `## Context and Global View` section shared by all three
 * agent prompts. Replaces the role-specific `## Context` +
 * `## Global Context & Cross-Batch Awareness` / `## L2 Cross-Batch Context`
 * blocks.
 *
 * - Always lists Cross-Epic Dependencies and Already Covered, even when empty
 *   (renders "None") so the LLM explicitly knows there is nothing to
 *   cross-reference.
 * - Epic Landscape is only shown for the Analyst (Designer/Quality do not
 *   receive the global epic index).
 * - Tool-usage directives stay inline next to the relevant item.
 */
export function buildContextSection(state: TestGenState, role: 'analyst' | 'designer' | 'quality'): string {
  const lines: string[] = ['## Context and Global View', ''];

  // === Current Batch (role-specific) ===
  lines.push('### Current Batch');
  if (role === 'analyst') {
    const batch = state.batchContext;
    const generationMode = state.generationMode ?? 'component';
    const isComponentMode = generationMode === 'component';
    const isMixedMode = generationMode === 'mixed';
    const records = state.currentBatch ?? [];
    const stories = records.filter(r => r.level === 'story');
    const acs = records.filter(r => r.level === 'ac');
    const componentStories = stories.filter(r => !r.isFlow).length;
    const flowStories = stories.filter(r => r.isFlow).length;
    const nonFlowAcs = acs.filter(r => !r.isFlow).length;
    const flowAcs = acs.filter(r => r.isFlow).length;
    lines.push(`- Batch: ${batch.currentBatch}/${batch.totalBatches} (${records.length} requirement records: ${stories.length} stories [${componentStories} component + ${flowStories} flow], ${acs.length} ACs [${nonFlowAcs} non-flow + ${flowAcs} flow])`);
    lines.push(`- Generation Mode: ${isMixedMode ? 'MIXED (component + flow)' : isComponentMode ? 'COMPONENT' : 'FLOW'}`);
    lines.push(`- Project: ${state.projectContext?.name ?? 'Unknown'}`);
    const epic = state.epic;
    if (epic) {
      lines.push(`- Epic: ${epic.id}: ${epic.title}`);
    }
    if (!isComponentMode && state.businessFlowBlueprints?.length) {
      lines.push(`- Business Flows: ${state.businessFlowBlueprints.length} available`);
    }
  } else if (role === 'designer') {
    const conditions = state.approvedConditions ?? state.testConditions ?? [];
    const criticalCount = conditions.filter(c => c.priority === 'critical').length;
    const highCount = conditions.filter(c => c.priority === 'high').length;
    const hasUserFlows = (state.selectedFlowIds?.length ?? 0) > 0;
    lines.push(`- Test Conditions: ${conditions.length} total (${criticalCount} critical, ${highCount} high)`);
    lines.push(`- Project: ${state.projectContext?.name ?? 'Unknown'}`);
    if (state.businessFlowBlueprints?.length) {
      lines.push(`- Business Flows: ${state.businessFlowBlueprints.length} available`);
    }
    lines.push(hasUserFlows
      ? `- User-selected flows: ${state.selectedFlowIds.length}`
      : '- No user-selected flows (derive integration surfaces from requirement dependencies and cross-epic context)');
  } else {
    // quality
    const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];
    const conditions = state.approvedConditions ?? state.testConditions ?? [];
    lines.push(`- Draft Cases: ${draftCases.length}`);
    lines.push(`- Test Conditions: ${conditions.length}`);
    lines.push(`- Project: ${state.projectContext?.name ?? 'Unknown'}`);
  }

  // === Global Index ===
  lines.push('');
  lines.push('### Global Index');

  // Epic Landscape — Analyst only (Designer/Quality do not receive it).
  // Inject only a concise per-epic summary for cross-epic risk awareness.
  // The full story/AC tree is NOT injected: it duplicates the current batch
  // already present in the user message and bloats the prompt for large epics.
  // Use `requirement_graph_query` to resolve sibling references on demand.
  if (role === 'analyst') {
    if (state.globalEpicIndex) {
      const stats = state.globalStats;
      lines.push(`- Epic Landscape: ${stats?.totalEpics ?? 0} epics, ${stats?.totalRequirements ?? 0} requirements, ${stats?.totalFlows ?? 0} flows total`);
      for (const e of state.globalEpicIndex) {
        const componentStoryCount = e.storyCount - e.flowCount;
        lines.push(`  - [Epic] ${e.epicId}: ${e.title} — ${e.storyCount} stories (${componentStoryCount} component + ${e.flowCount} flow), ${e.nonFlowAcCount + e.flowAcCount} ACs (${e.nonFlowAcCount} non-flow + ${e.flowAcCount} flow), status: ${JSON.stringify(e.statusBreakdown)}`);
      }
      lines.push('  Use **requirement_graph_query** to inspect sibling requirements/flows outside the current batch when local input is insufficient.');
    } else {
      lines.push('- Epic Landscape: Not available');
    }
  }

  // Cross-Epic Dependencies — always shown (None when empty)
  if (state.crossEpicDependencies && state.crossEpicDependencies.length > 0) {
    lines.push('- Cross-Epic Dependencies:');
    for (const d of state.crossEpicDependencies) {
      lines.push(`  - [${d.fromRequirementId}] ${d.relationType} → [${d.toRequirementId}] "${d.toRequirementTitle}" (in Epic "${d.toEpicTitle}")`);
    }
    if (role === 'analyst') {
      lines.push('  Use **cross_epic_impact_query** when relationType suggests shared data/state.');
    } else if (role === 'designer') {
      lines.push('  When designing test data and preconditions for conditions whose `requirementId` appears above, account for the cross-epic dependency\'s data/state assumptions — e.g., if a condition depends on a requirement from another Epic, state that assumption explicitly in `preconditions` rather than silently assuming it.');
    } else {
      lines.push('  When reviewing completeness, check whether cases for conditions whose `requirementId` appears above acknowledge the cross-epic dependency in their preconditions or test data. Missing cross-epic context is a Completeness gap.');
    }
  } else {
    lines.push('- Cross-Epic Dependencies: None');
  }

  // Already Covered — always shown (None when empty)
  if (state.previousBatchCoverageSummary && state.previousBatchCoverageSummary.length > 0) {
    lines.push('- Already Covered:');
    for (const c of state.previousBatchCoverageSummary) {
      if (role === 'analyst') {
        lines.push(`  - [${c.requirementId}] ${c.conditionCount} conditions — ${c.categories.join('/')}, ${c.techniques.join('/')}`);
      } else {
        lines.push(`  - [${c.requirementId}] ${c.conditionCount} conditions — categories: ${c.categories.join('/')}, techniques: ${c.techniques.join('/')}`);
      }
    }
    if (role === 'analyst') {
      lines.push('  Use **previous_batch_conditions_query** to inspect titles before deciding to merge/skip.');
    } else if (role === 'designer') {
      const reqsWithCases = state.previousBatchCoverageSummary.filter(c => c.caseCountByLevel.component > 0 || c.caseCountByLevel.integration > 0);
      if (reqsWithCases.length > 0) {
        lines.push('  Already Generated Cases in Previous Batches (DO NOT DUPLICATE):');
        for (const c of reqsWithCases) {
          lines.push(`  - [${c.requirementId}]`);
          if (c.caseCountByLevel.component > 0) lines.push(`    - component: ${c.caseCountByLevel.component} case(s)`);
          if (c.caseCountByLevel.integration > 0) lines.push(`    - integration: ${c.caseCountByLevel.integration} case(s)`);
        }
        lines.push('  Dedup rule: Counts above show how many cases were already generated per testLevel for each requirement. Before finalizing a draft case, if the relevant requirement already has cases at the same testLevel, call **previous_batch_cases_query** with the `requirementId` to inspect the existing titles and SKIP any near-duplicate (same `conditionId` + `testLevel`). Near-duplicate titles with different `conditionId` are allowed (they test different conditions).');
      } else {
        lines.push('  No prior-batch case counts available for dedup reference. If you suspect overlap with earlier batches, call **previous_batch_cases_query** with the `requirementId` to inspect.');
      }
    } else {
      lines.push('  Use this to judge whether the current batch\'s cases are redundant with prior batches. If a case appears to duplicate prior coverage of the same requirement and technique, note it in that requirement\'s `reviewSummary`.');
    }
  } else {
    lines.push('- Already Covered: None');
  }

  // Analyst flow-mode cross-reference (only when flow mode + relevant flows +
  // prior coverage exist)
  if (role === 'analyst') {
    const generationMode = state.generationMode ?? 'component';
    const isComponentMode = generationMode === 'component';
    const isMixedMode = generationMode === 'mixed';
    if (isMixedMode) {
      lines.push('- Mixed Mode Cross-Reference: Component and flow stories are in the SAME batch. Reference component condition IDs directly from your own output for flow `dependencies`. Call **previous_batch_conditions_query** only for requirements from OTHER batches.');
    } else if (!isComponentMode && state.relevantFlowBlueprints && state.relevantFlowBlueprints.length > 0 && state.previousBatchCoverageSummary && state.previousBatchCoverageSummary.length > 0) {
      lines.push('- Flow Batch Cross-Reference: This batch has flow stories whose component stories were processed earlier. Call **previous_batch_conditions_query** to get real conditionIds for `dependencies` — do NOT invent new conditionIds.');
    }
  }

  return lines.join('\n') + '\n';
}

// ============================================================
// Test Analyst Prompts
// ============================================================

export function buildAnalystSystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }
  const generationMode = state.generationMode ?? 'component';
  const isComponentMode = generationMode === 'component';
  const isMixedMode = generationMode === 'mixed';

  const outputContract = `## Required Fields
For EVERY object in \`testConditions\`, these fields are mandatory: \`id\`, \`requirementId\`, \`condition\`, \`conditionType\`, \`flowStepRefs\`, \`category\`, \`priority\`, \`riskLevel\`, \`primaryTechnique\`, \`secondaryTechniques\`, \`techniqueRationale\`, \`coverageDimensions\`, and \`dependencies\`. \`requirementId\` must be the exact source requirement ID supplied by the batch. \`category\` must be explicitly set.

The result must contain ALL derived test conditions for this batch, not a sample.`;

  const workflowSteps = isMixedMode
    ? `### Step 1 — Review all input
The user message contains BOTH component Stories (non-flow, with \`isFlow: false\`) and Flow Stories (\`isFlow: true\`). Derive component conditions for non-flow stories AND flow conditions for flow stories in the SAME output.

### Step 2 — Cross-reference component conditions for flow dependencies
Flow Stories' referenced component stories may be in the SAME batch. When they are, reference their condition IDs directly in \`dependencies\`. Call **previous_batch_conditions_query** only for component stories from OTHER batches.

### Step 3 — Gather additional context only when needed
Call **requirement_graph_query** only when local input is insufficient. Call **flow_detail_query** only if injected Flow data is incomplete. Call **cross_epic_impact_query** only for a real shared data/state risk.

### Step 4 — Load test-design guidance
Call **analyst_rules** before deriving conditions. Select the applicable technique(s), then load only their ISTQB guide(s). For flow stories, also load the Integration Testing guide and Use Case Testing or State Transition Testing.

### Step 5 — Derive conditions
- For non-flow stories: set \`conditionType: "component"\` and \`flowStepRefs: []\`. Focus on single-component behavior.
- For flow stories: set \`conditionType: "flow"\`, include non-empty \`flowStepRefs\`, and focus on cross-component integration behavior. Reference component condition IDs in \`dependencies\`.
- Flow conditions must NOT duplicate atomic behaviors already covered by component conditions — only verify cross-component interactions.`
    : isComponentMode
    ? `### Step 1 — Review component input
The user message contains only non-flow Stories and their ACs. Derive only component behavior from this input.

### Step 2 — Gather additional context only when needed
Call **requirement_graph_query** only when an AC has \`relatedRequirementIds\`, Global Context identifies a cross-Epic data/state risk, or local input is insufficient. Call **cross_epic_impact_query** only for a real shared data/state risk.

### Step 3 — Load test-design guidance
Call **analyst_rules** before deriving conditions. Select the applicable technique(s), then load only their ISTQB guide(s). Do not load all black-box techniques by default.

### Step 4 — Derive component conditions
All conditions in this phase must have \`conditionType: "component"\` and \`flowStepRefs: []\`. Do not derive integration or Flow conditions.`
    : `### Step 1 — Review Flow input
The user message contains only Flow Stories and their BDD Scenario ACs. Derive only cross-component state-transition and interface-contract coverage.

### Step 2 — Load component coverage context
For every component Story referenced by a Flow AC's \`relatedRequirementIds\`, call **previous_batch_conditions_query**. Record only returned condition IDs in \`dependencies\`; do NOT invent new conditionIds.

### Step 3 — Gather incomplete context only when needed
Call **requirement_graph_query** for missing relationships. Call **flow_detail_query** only if the injected Flow Story or Scenario data is incomplete. Call **cross_epic_impact_query** only for a real shared data/state risk.

### Step 4 — Load test-design guidance
Call **analyst_rules** and the Integration Testing guide. Load Use Case Testing or State Transition Testing when the selected Flow scenario requires that technique.

### Step 5 — Derive flow conditions
All conditions in this phase must have \`conditionType: "flow"\`, include non-empty \`flowStepRefs\`, and focus on integration behavior already outside component coverage.`;

  const availableTools = isMixedMode
    ? `- **requirement_detail_query(requirementId)**: details for requirements outside the current batch.
- **requirement_graph_query(requirementId, flowId?)**: relationship details when local input is insufficient.
- **flow_detail_query(flowId)**: Flow details only when injected Flow data is incomplete.
- **cross_epic_impact_query(requirementId)**: cross-Epic reference details for a real shared data/state risk.
- **previous_batch_conditions_query(requirementId)**: prior condition IDs for requirements from OTHER batches (same-batch conditions are already in your output).
- **istqb_guide(techniques?, context?)**: selected ISTQB technique guides including Integration Testing for flow stories.
- **analyst_rules**: required condition derivation rules.`
    : isComponentMode
    ? `- **requirement_detail_query(requirementId)**: details for requirements outside the current batch.
- **requirement_graph_query(requirementId)**: relationship details when local input is insufficient.
- **cross_epic_impact_query(requirementId)**: cross-Epic reference details for a real shared data/state risk.
- **previous_batch_conditions_query(requirementId)**: prior condition titles when duplicate coverage is suspected.
- **istqb_guide(techniques?, context?)**: selected ISTQB technique guides.
- **analyst_rules**: required condition derivation rules.`
    : `- **requirement_detail_query(requirementId)**: details for requirements outside the current batch.
- **requirement_graph_query(requirementId, flowId?)**: missing relationship details for the current Flow.
- **flow_detail_query(flowId)**: Flow details only when injected Flow data is incomplete.
- **cross_epic_impact_query(requirementId)**: cross-Epic reference details for a real shared data/state risk.
- **previous_batch_conditions_query(requirementId)**: real component condition IDs for Flow dependencies.
- **istqb_guide(techniques?, context?)**: Integration Testing and applicable Flow technique guides.
- **analyst_rules**: required condition derivation rules.`;

  const outputExample = isMixedMode
    ? `{
  "requirementAnalysis": { "overallApproach": "...", "riskAssessmentSummary": "..." },
  "testConditions": [
    {
      "id": "C-001", "requirementId": "STORY-001",
      "condition": "Verify that ...",
      "conditionType": "component",
      "flowStepRefs": [],
      "category": "error", "priority": "high", "riskLevel": "high",
      "primaryTechnique": "Equivalence Partitioning",
      "secondaryTechniques": [],
      "techniqueRationale": "...",
      "coverageDimensions": ["..."],
      "dependencies": []
    },
    {
      "id": "C-002", "requirementId": "FLOW-STORY-001",
      "condition": "Verify that ...",
      "conditionType": "flow",
      "flowStepRefs": [{ "flowId": "FLOW-1", "sequence": 1, "actionSummary": "..." }],
      "category": "integration", "priority": "critical", "riskLevel": "critical",
      "primaryTechnique": "Use Case Testing",
      "secondaryTechniques": ["State Transition Testing"],
      "techniqueRationale": "...",
      "coverageDimensions": ["..."],
      "dependencies": ["C-001"]
    }
  ]
}`
    : isComponentMode
    ? `{
  "requirementAnalysis": { "overallApproach": "...", "riskAssessmentSummary": "..." },
  "testConditions": [
    {
      "id": "C-001", "requirementId": "STORY-001",
      "condition": "Verify that ...",
      "conditionType": "component",
      "flowStepRefs": [],
      "category": "error", "priority": "high", "riskLevel": "high",
      "primaryTechnique": "Equivalence Partitioning",
      "secondaryTechniques": [],
      "techniqueRationale": "...",
      "coverageDimensions": ["..."],
      "dependencies": []
    }
  ]
}`
    : `{
  "requirementAnalysis": { "overallApproach": "...", "riskAssessmentSummary": "..." },
  "testConditions": [
    {
      "id": "C-001", "requirementId": "FLOW-STORY-001",
      "condition": "Verify that ...",
      "conditionType": "flow",
      "flowStepRefs": [{ "flowId": "FLOW-1", "sequence": 1, "actionSummary": "..." }],
      "category": "integration", "priority": "critical", "riskLevel": "critical",
      "primaryTechnique": "Use Case Testing",
      "secondaryTechniques": ["State Transition Testing"],
      "techniqueRationale": "...",
      "coverageDimensions": ["..."],
      "dependencies": ["C-EXISTING-COMPONENT-001"]
    }
  ]
}`;

  return `You are a senior ISTQB Test Analyst (CTFL/CTAL Test Analyst level). Perform risk-based analysis of the input and derive a complete, non-redundant set of test conditions using formal ISTQB black-box test design techniques.

${buildContextSection(state, 'analyst')}## Mandatory Tool Usage Workflow
${workflowSteps}

${outputContract}

## Available Tools
${availableTools}

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format
Stream your analysis as plain text in markdown. End with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.

\`\`\`json
${outputExample}
\`\`\`

The \`\`\`json block must be at the very end — nothing after it. An empty object \`{}\` is always invalid.
`;
}

/**
 * Parse a free-text Given/When/Then AC description into structured fields.
 * Falls back to raw description if the pattern doesn't match.
 */
export function parseGivenWhenThen(description: string): { given?: string; when?: string; then?: string } {
  if (!description) return {};
  const givenMatch = description.match(/(?:^|\n)\s*Given\s+(.*?)(?=\n\s*(?:When|Then)\b|$)/is);
  const whenMatch = description.match(/(?:^|\n)\s*When\s+(.*?)(?=\n\s*Then\b|$)/is);
  const thenMatch = description.match(/(?:^|\n)\s*Then\s+(.*?)$/is);
  const result: { given?: string; when?: string; then?: string } = {};
  if (givenMatch) result.given = givenMatch[1].trim();
  if (whenMatch) result.when = whenMatch[1].trim();
  if (thenMatch) result.then = thenMatch[1].trim();
  return result;
}

/**
 * Serialize an AC for the prompt — structured given/when/then instead of
 * free-text description. Omits default values (flowType="atomic",
 * relatedRequirementIds=[]) to save tokens.
 */
export function serializeAC(ac: any) {
  const gwt = parseGivenWhenThen(ac.description ?? '');
  const result: Record<string, unknown> = {
    id: ac.id,
    title: ac.title,
  };
  if (gwt.given) result.given = gwt.given;
  if (gwt.when) result.when = gwt.when;
  if (gwt.then) result.then = gwt.then;
  if (!gwt.given && !gwt.when && !gwt.then && ac.description) result.description = ac.description;
  if (ac.flowType && ac.flowType !== 'atomic') result.flowType = ac.flowType;
  const related = ac.relatedRequirementIds ?? [];
  if (related.length > 0) result.relatedRequirementIds = related;
  return result;
}

/**
 * Flow serialization for Designer/Quality prompts — keeps long key names
 * (sequence, actionSummary, requirementIds) since those prompts reference
 * them in instructions.
 */
function serializeFlowForDesigner(f: any) {
  return {
    id: f.id,
    name: f.name,
    steps: (f.steps ?? []).map((s: any) => ({
      sequence: s.sequence,
      actionSummary: s.actionSummary ?? '',
      requirementIds: s.requirementIds ?? (s.requirementId ? [s.requirementId] : []),
    })),
  };
}

export function buildAnalystUserMessage(state: TestGenState): string {
  // The analystInput object is pre-built in buildBatchInputState (orchestrator.ts)
  // so we just serialize it here. Falls back to legacy assembly if not available.
  if (state.analystInput) {
    return JSON.stringify(state.analystInput, null, 2);
  }
  // Legacy fallback (should not be hit after migration)
  return JSON.stringify({ epic: state.epic, stories: [] }, null, 2);
}

// ============================================================
// Test Designer Prompts
// ============================================================

/**
 * Detect which ISTQB techniques are present in the batch's conditions and
 * inject a targeted few-shot example for techniques that are error-prone.
 * This supplements the generic 2-case example already in the Designer prompt.
 */
function buildTechniqueFewShot(state: TestGenState): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const techniqueStrings = conditions
    .map((c) => String(c.primaryTechnique ?? '').toLowerCase());

  const blocks: string[] = [];

  if (techniqueStrings.some((t) => t.includes('decision'))) {
    blocks.push(`## Technique-Specific Example — Decision Table (Negative-Case Step Splitting)
When designing Decision Table test cases for validation rules, the "action did NOT happen" and "error IS shown" are TWO separate observable outcomes. Never join them with a semicolon.

WRONG (one step, two assertions):
  { "action": "Click Submit", "expected": "No API request is sent; error message is displayed" }

CORRECT (two atomic steps):
  { "stepNumber": 3, "action": "Click the Submit button.", "expected": "No network request is sent to the auth API endpoint" }
  { "stepNumber": 4, "action": "Observe the validation error area.", "expected": "An error message 'Please enter your username and password' is displayed" }

Label each testData entry with the rule row being exercised, e.g.: \`username = "" (empty — Rule 1: both empty)\`
Every rule column in the decision table MUST have at least one test case.`);
  }

  if (techniqueStrings.some((t) => t.includes('use case') || t.includes('use-case'))) {
    blocks.push(`## Technique-Specific Example — Use Case Testing (Integration F12 Anti-Redundancy)
Use Case test cases are \`testLevel: "integration"\`. They MUST:
1. List the flow condition ID in \`coveredConditions\`.
2. List component condition IDs in \`referencedComponentConditions\` (atomic behaviors assumed as preconditions).
3. NOT re-assert component behavior in \`steps[].expected\` — only assert cross-component outcomes (API call, token storage, redirect, downstream effect).

Preconditions must describe concrete settable system states — NOT behavior assertions.
Wrong:  "Client-side validation passes (per C-006)"
Right:  "Login page is loaded at /login with all form fields empty"

At least one test case per use case scenario (main success + each alternative + each exception path).`);
  }

  if (techniqueStrings.some((t) => t.includes('state'))) {
    blocks.push(`## Technique-Specific Example — State Transition Testing
For each transition, create a test case that:
1. Sets the initial state as a precondition (concrete, settable).
2. Triggers the transition event as the action.
3. Asserts the new state as the expected result.
4. Includes a separate test case for each valid transition AND each invalid transition (attempting an impossible transition should be rejected).

Do NOT combine "trigger event" and "verify new state" into one step — they are separate: one action, one observable result.`);
  }

  return blocks.length > 0
    ? '\n' + blocks.join('\n\n') + '\n'
    : '';
}

export function buildDesignerSystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }

  return `You are a senior ISTQB Test Designer (CTFL/CTAL Test Analyst level). Convert each test condition into a complete, executable, independently runnable test case that faithfully implements the condition's assigned technique AND test level.

${buildContextSection(state, 'designer')}## Mandatory Tool Usage Workflow
### Step 1 — Verify requirement details
For EACH condition, call **requirement_detail_query** with its \`requirementId\` (cached, so repeats are cheap). For conditions tagged \`"testLevel:integration"\` or whose \`primaryTechnique\` is Use Case / State Transition, also call **flow_detail_query** to load the associated flow.

### Step 2 — Load ISTQB guides (mandatory, every run)
Call **istqb_guide** once — loading all technique guides AND the Integration Testing test-level guide. Do not skip this even if you already "know" the techniques; the guide enforces the method, not just the name.

### Step 2.5 — Load detailed rules (MANDATORY)
Call **designer_rules** to load the complete test case design rules. You MUST load these before designing any test cases.

### Step 3 — Design test cases
Apply the rules below. Decide \`testLevel\` per case using the Test Level Decision Rule.

## Detailed Rules (MANDATORY — load before designing)
Call **designer_rules** to load the complete design rules (step atomicity, technique fidelity, test level decision, F12 anti-redundancy, F18 self-check, F31 budget, F32 test data format, self-review scoring). You MUST call this before designing any test cases.

## Required Fields
For EVERY object in \`draftTestCases\`, these fields are mandatory: \`id\`, \`title\`, \`conditionId\`, \`requirementId\`, \`coveredConditions\`, \`referencedComponentConditions\` (for integration cases), \`priority\`, \`category\`, \`testLevel\`, \`techniqueApplied\`, \`preconditions\`, \`testData\`, \`steps\`, \`postconditions\`, \`tags\`, \`selfReview\`. \`testLevel\` must be exactly one of \`"component"\` or \`"integration"\`. \`coveredConditions\` must include the primary \`conditionId\` and may include additional flow conditions. \`referencedComponentConditions\` must be non-empty for any \`testLevel: "integration"\` case. When the user input contains \`availableComponentConditions\`, use one or more of their exact \`referenceId\` values for \`referencedComponentConditions\`; never use an AC ID, a requirement ID, or a bare \`C-*\` ID from another batch. An empty object \`{}\` is always invalid. Do not end your analysis until you have described at least one complete test case for extraction.

## Instructions
1. Design one or more complete test cases for EACH input condition. Ensure EVERY condition provided in the input is fully covered. If a condition contains multiple explicit data variants, ensure the test data covers them. The \`draftTestCases\` array MUST contain all designed test cases. **One condition MAY be split into multiple test cases** when the data variants or alternate paths warrant it; in that case all derived cases MUST list the original condition in \`coveredConditions\`.

## Available Tools
- **requirement_detail_query(requirementId)**: requirement details for accurate test data/preconditions.
- **requirement_graph_query(requirementId, flowId?)**: related requirements/flows for integration coverage.
- **flow_detail_query(flowId)**: flow details — single ID or array.
- **istqb_guide(techniques?, context?)**: ISTQB technique + test-level guides. Omit \`techniques\` to load all.
- **designer_rules**: load detailed design rules (step atomicity, technique fidelity, test level, F12, F18, F31, F32). Call before designing.

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format
Stream your design rationale as plain text in markdown (short headings, blank-line-separated sections, bullets).

After your analysis, end with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.

\`\`\`json
{
  "draftTestCases": [
    {
      "id": "TC-001",
      "title": "End-to-end login: admin credentials propagate from auth API to session store and dashboard",
      "conditionId": "C-002",
      "requirementId": "req-aut-auth-login-valid-success",
      "coveredConditions": ["C-002"],
      "referencedComponentConditions": ["C-001", "C-003"],
      "priority": "critical",
      "category": "functional",
      "testLevel": "integration",
      "techniqueApplied": "Use Case Testing",
      "preconditions": [
        "User is on the login page",
        "Browser session is clean with no existing authenticated session",
        "Administrator account exists and is active in the user store (atomic behavior assumed via component condition C-001)",
        "Session store is reachable and empty for this user",
        "Client-side validation passes for any well-formed password (atomic behavior assumed via component condition C-003)"
      ],
      "testData": ["username = admin (valid partition)", "password = admin123 (valid partition)"],
      "steps": [
        { "stepNumber": 1, "action": "Enter username 'admin' into the username field.", "expected": "The username field displays 'admin' with no client-side validation error." },
        { "stepNumber": 2, "action": "Enter password 'admin123' into the password field.", "expected": "The password field shows masked characters with no client-side validation error." },
        { "stepNumber": 3, "action": "Click the Sign in / Login button.", "expected": "The submit button enters a disabled loading state and the login request is sent to the auth API." },
        { "stepNumber": 4, "action": "Wait for the authentication response.", "expected": "The auth API returns HTTP 200 with a session token in the response body." },
        { "stepNumber": 5, "action": "Wait for the redirect to settle.", "expected": "The browser navigates to the dashboard URL." },
        { "stepNumber": 6, "action": "Query the session store for the returned token.", "expected": "The session store contains an entry for the returned token bound to user 'admin'." }
      ],
      "postconditions": ["Authenticated session is created in the session store", "Dashboard is accessible for the logged-in user"],
      "tags": ["authentication", "login", "dashboard", "session", "smoke", "happy-path", "integration"],
      "selfReview": {
        "score": 9,
        "strengths": [
          "Each step has exactly one action and one observable expected result",
          "Test data explicitly labeled with its EP partition for traceability",
          "Step 6 verifies the downstream session store, not just the API response — true integration coverage",
          "coveredConditions lists C-002 (the flow condition this case covers); referencedComponentConditions lists C-001 and C-003 (the component behaviors assumed as preconditions) — clear traceability"
        ],
        "weaknesses": ["Does not assert specific dashboard widget content, only that the navigation succeeded"],
        "suggestions": ["Add a follow-up case asserting specific dashboard elements", "Add an integration failure case: auth API timeout"]
      }
    },
    {
      "id": "TC-002",
      "title": "Reject login with invalid password format (missing special character)",
      "conditionId": "C-001",
      "requirementId": "req-aut-auth-login-valid-success",
      "coveredConditions": ["C-001"],
      "referencedComponentConditions": [],
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
          "Test data names the invalid partition explicitly",
          "coveredConditions lists only C-001; referencedComponentConditions is empty because this is a component case"
        ],
        "weaknesses": ["Does not test the server-side rejection path separately"],
        "suggestions": ["Add a component case where the password passes client-side validation but is rejected server-side"]
      }
    }
  ]
}
\`\`\`
${buildTechniqueFewShot(state)}
**Rules:**
- The \`\`\`json block must be at the very end of your response — nothing after it.
- The block must contain COMPLETE data: ALL draft test cases, not a sample.
- The \`draftTestCases\` array MUST contain at least one test case.
- An empty object \`{}\` is always invalid.

Final check before closing the block — every step has exactly one action and one concrete observable expected result; EP/BVA test data states the partition or boundary position, not a bare value; every case's preconditions are self-contained; every case declares \`testLevel\` as \`"component"\` or \`"integration"\` AND the step design honors that level (integration cases traverse 2+ components, component cases stay within one); **integration cases do NOT re-assert what a sibling component case already covers** (move atomic behavior into preconditions, assert only the cross-component outcome).
`;
}

export function buildDesignerUserMessage(
  state: TestGenState,
  availableComponentConditions: ComponentConditionReference[] = [],
): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const flows = state.relevantFlowBlueprints ?? state.businessFlowBlueprints ?? [];
  return JSON.stringify({
    conditions: conditions.map(c => ({
      id: c.id,
      condition: c.condition,
      // F1: surface the new conditionType to the Designer so it can decide
      // coveredConditions vs referencedComponentConditions correctly.
      conditionType: (c as any).conditionType,
      // F3: when conditionType is "flow", include the step refs so the
      // Designer can write steps that mirror the actual flow sequence.
      flowStepRefs: (c as any).flowStepRefs ?? [],
      priority: c.priority,
      category: c.category,
      primaryTechnique: c.primaryTechnique,
      secondaryTechniques: c.secondaryTechniques,
      riskLevel: c.riskLevel,
      requirementId: c.requirementId,
      coverageDimensions: c.coverageDimensions,
      // Pass Analyst's dataRequirements to Designer so it can reuse
      // partition/boundary annotations instead of re-deriving them.
      dataRequirements: (c as any).dataRequirements,
    })),
    // F7: full flow context (same shape as the Analyst receives). The
    // Designer needs the actionSummary and requirementIds to write steps
    // that traverse components in the right order.
    businessFlows: flows.map(serializeFlowForDesigner),
    availableComponentConditions: availableComponentConditions.length > 0
      ? availableComponentConditions
      : undefined,
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

## Read the conditions first (F14)
For every draft case in the input, you will see \`coveredConditions\` (the Analyst condition ids the case claims to cover) and, for integration cases, \`referencedComponentConditions\` (the component conditions the case assumes as preconditions). **Before you judge a case's correctness, you MUST look up the actual condition text for each id in those arrays** (the Analyst's conditions are exposed in the user message's \`conditions\` field). A case that "looks right" but is silently testing a different behavior than the condition says is a defect.

## Load Detailed Rules (MANDATORY)
Call **quality_rules** to load the complete review dimensions, discipline rules, and coverage matrix format. You MUST load these before reviewing any cases.
${buildContextSection(state, 'quality')}## Detailed Rules (MANDATORY — load before reviewing)
Call **quality_rules** to load the complete review rules (9 review dimensions, review discipline, coverage matrix F27, F17 redundancy, D2 cross-batch redundancy). You MUST call this before reviewing any cases.

## Available Tools
- **requirement_detail_query**: verify requirement details when judging Correctness.
- **flow_detail_query(flowId)**: load flow step details — use to verify integration test cases against actual flow steps (Correctness dimension).
- **previous_batch_cases_query**: query previous batch final test cases — use for D2 cross-batch redundancy check (compare titles, testLevel, conditionId against current batch cases).
- **istqb_guide(techniques?, context?)**: load ISTQB technique guides for reference when judging Technique Fidelity.
- **quality_rules**: load detailed review rules (9 dimensions, F17, D2, coverage matrix F27). Call before reviewing.

${state.humanReviewFeedback ? `## Reviewer Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format
Stream your review as plain text in markdown (short headings, blank-line-separated sections, bullets). For any case you changed, name the dimension that flagged it and what you fixed.

End with a single JSON code block containing the COMPLETE output. Nothing after it.

\`\`\`json
{
  "finalTestCases": [
    {
      "id": "TC-001",
      "title": "End-to-end login: admin credentials propagate from auth API to session store and dashboard",
      "conditionId": "C-002",
      "requirementId": "req-aut-auth-login-valid-success",
      "coveredConditions": ["C-002"],
      "referencedComponentConditions": ["C-001", "C-003"],
      "priority": "critical",
      "category": "functional",
      "testLevel": "integration",
      "techniqueApplied": "Use Case Testing",
      "preconditions": [
        "User is on the login page",
        "Browser session is clean with no existing authenticated session",
        "Administrator account exists and is active (assumed per component condition C-001)",
        "Client-side validation passes for well-formed password (assumed per component condition C-003)"
      ],
      "testData": ["username = admin (valid partition)", "password = admin123 (valid partition)"],
      "steps": [
        { "stepNumber": 1, "action": "Enter username 'admin' into the username field.", "expected": "The username field displays 'admin' with no client-side validation error." },
        { "stepNumber": 2, "action": "Enter password 'admin123' into the password field.", "expected": "The password field shows masked characters with no client-side validation error." },
        { "stepNumber": 3, "action": "Click the Sign in / Login button.", "expected": "The submit button enters a disabled loading state and the login request is sent." },
        { "stepNumber": 4, "action": "Wait for the authentication response.", "expected": "The auth API returns HTTP 200 with a session token in the response body." },
        { "stepNumber": 5, "action": "Wait for the redirect to settle.", "expected": "The browser navigates to the dashboard URL." },
        { "stepNumber": 6, "action": "Query the session store for the returned token.", "expected": "The session store contains an entry for the returned token bound to user 'admin'." }
      ],
      "tags": ["authentication", "login", "dashboard", "session", "smoke", "happy-path", "integration"],
      "status": "approved",
      "reviewSummary": "coveredConditions=[C-002] matches the flow condition this case addresses; referencedComponentConditions=[C-001, C-003] properly names the atomic preconditions. Steps traverse auth API → session store → dashboard (cross-component). No changes required.",
      "changeLog": []
    },
    {
      "id": "TC-002",
      "title": "Reject quantity below minimum boundary",
      "conditionId": "C-014",
      "requirementId": "req-order-quantity-limits",
      "coveredConditions": ["C-014"],
      "referencedComponentConditions": [],
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
        "conditionId": "C-002",
        "conditionSummary": "Valid admin credentials propagate through auth API to session store and dashboard",
        "requirementId": "req-aut-auth-login-valid-success",
        "conditionType": "flow",
        "flowStepRef": { "flowId": "F-login-happy", "sequence": 3, "actionSummary": "Auth API returns 200 + session token" },
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
        "conditionType": "component",
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
      "byCategory": { "functional": 1, "boundary": 1 },
      "byConditionType": { "component": 1, "flow": 1 }
    }
  }
}
\`\`\`

**Rules:**
- The \`\`\`json block is the last thing in your response — nothing after it.
- It must contain ALL final test cases, complete — never a sample. \`finalTestCases.length >= 1\`. An empty object \`{}\` is always invalid.
- Every modified case has a non-empty, field-level \`changeLog\`; every untouched case has \`changeLog: []\`.
- The \`coverageMatrix\` MUST be present. Every Analyst \`conditionId\` that appears in the input draft cases MUST have exactly one row in \`coverageMatrix.rows\`. \`coveredByCaseIds\` must reference real \`finalTestCases\` ids. The summary \`byConditionType\` field is required.
`;
}

export function buildQualityUserMessage(state: TestGenState): string {
  const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const flows = state.relevantFlowBlueprints ?? state.businessFlowBlueprints ?? [];
  return JSON.stringify({
    draftCases: draftCases.map(c => ({
      id: c.id,
      title: c.title,
      conditionId: c.conditionId,
      requirementId: c.requirementId,
      coveredConditions: (c as any).coveredConditions ?? [],
      referencedComponentConditions: (c as any).referencedComponentConditions ?? [],
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
    // F14: give the reviewer the actual condition text so they can verify
    // coveredConditions fidelity (without this, "read the condition first"
    // is unenforceable).
    conditions: conditions.map(c => ({
      id: c.id,
      requirementId: c.requirementId,
      condition: c.condition,
      conditionType: (c as any).conditionType,
      flowStepRefs: (c as any).flowStepRefs ?? [],
      primaryTechnique: c.primaryTechnique,
      category: c.category,
    })),
    // F8 / F27: flow context so the reviewer can verify flow-step coverage.
    businessFlows: flows.map(serializeFlowForDesigner),
    requirements: state.currentBatch?.map(r => ({
      id: r.id,
      title: r.title,
      level: (r as any).level ?? '',
    })),
    // D2: cross-batch coverage summary so Quality can detect redundancy
    // with cases from previous batches.
    previousBatchCoverage: (state.previousBatchCoverageSummary ?? []).map(c => ({
      requirementId: c.requirementId,
      conditionCount: c.conditionCount,
      categories: c.categories,
      techniques: c.techniques,
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
    .replace(/\{mode\}/g, String(state.generationMode ?? 'dual-level'));
}
