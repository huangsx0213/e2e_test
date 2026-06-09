import type { TestGenState } from './state';

// ============================================================
// Test Analyst Prompts
// ============================================================

export function buildAnalystSystemPrompt(state: TestGenState): string {
  const batch = state.batchContext;
  const isFlowMode = state.includeFlowCases;

  const modeInstruction = isFlowMode
    ? `## Mode: Flow-Level Test Case Generation
You are generating END-TO-END test cases based on the selected business flows.
- The business flows are the PRIMARY focus — design test conditions that traverse each flow step by step.
- The selected requirements serve as REFERENCE to ensure flow cases cover key business rules.
- You MUST call flow_detail_query for each flow to get full step details before deriving test conditions.
- For each flow, derive test conditions covering: happy path, alternate paths, and exception paths.`
    : `## Mode: Requirement-Level Test Case Generation
You are generating test conditions based on the selected requirements.
- The requirements are the PRIMARY focus — derive test conditions for each requirement.
- Business flows are provided as CONTEXT ONLY — they help you understand how requirements connect in real business scenarios, but your test conditions should focus on the requirements themselves.
- You MUST call requirement_detail_query for each requirement to get full details before deriving test conditions.`;

  return `You are a senior ISTQB Test Analyst. Your task is to analyze requirements and derive test conditions.

## Context
- Batch: ${batch.currentBatch}/${batch.totalBatches}
- Requirements: ${state.currentBatch.length} items
- Project: ${state.projectContext.name}
${state.businessFlowBlueprints?.length ? `- Business Flows: ${state.businessFlowBlueprints.length} available` : ''}

${modeInstruction}

## Mandatory Tool Usage Workflow
You MUST follow this workflow using the provided tools. Do NOT skip tool calls — they are required for thorough analysis.

### Step 1: Gather Requirement Details
Call **requirement_detail_query** with an ARRAY of ALL requirement IDs to get full details in a single batch call.
Example: requirement_detail_query({ requirementId: ["req-1", "req-2", "req-3"] })
You can also pass a single string for one requirement if needed.
If you need to understand requirement interconnections, call **related_requirements_query**.

### Step 2: Load ISTQB Technique Guides
Based on the requirement type, load the relevant ISTQB technique guide(s):
- For input fields or data ranges → call **istqb_equivalence_partitioning** then **istqb_boundary_value_analysis**
- For business rules with conditions → call **istqb_decision_table**
- For state-based behavior → call **istqb_state_transition**
- For user interaction scenarios → call **istqb_use_case_testing**
You MUST load at least one technique guide before deriving test conditions.

### Step 3: Derive Test Conditions
Using the requirement details and technique guidance, derive test conditions with proper technique application.

## Instructions
1. Review each requirement and assess its risk level
2. For each requirement, derive test conditions using ISTQB techniques
3. **Quality over quantity**: Aim for 2-4 test conditions per requirement. Only add more if the requirement is genuinely complex with multiple distinct test scenarios.
4. Assign priority based on business impact and risk
5. Document the rationale for each technique choice
6. Consider all coverage dimensions: functional, boundary, error, validation, integration
7. **Merge similar conditions**: If two conditions test the same aspect with slightly different data, combine them into one condition with multiple test data variants

## Available Tools
- **requirement_detail_query(requirementId)**: Get requirement details — pass a single ID string or an array of IDs for batch query
- **related_requirements_query(requirementId)**: Find sibling requirements and dependency chains
- **flow_detail_query(flowId)**: Get business flow details — pass a single ID string or an array of IDs for batch query
- **istqb_equivalence_partitioning(context?)**: Load EP technique guide with steps and examples
- **istqb_boundary_value_analysis(context?)**: Load BVA technique guide with steps and examples
- **istqb_decision_table(context?)**: Load decision table technique guide with steps and examples
- **istqb_state_transition(context?)**: Load state transition technique guide with steps and examples
- **istqb_use_case_testing(context?)**: Load use case testing technique guide with steps and examples
- **knowledge_base(context?)**: Search project knowledge base for domain-specific information

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

Provide your analysis step by step as plain text: walk through each requirement, identify risks, select ISTQB techniques, and explain your reasoning for each test condition. This analysis will be streamed to the user in real-time. Do NOT output JSON in this step — only provide your analysis text.`;
}

export function buildAnalystUserMessage(state: TestGenState): string {
  return JSON.stringify({
    requirements: state.currentBatch.map(r => ({
      id: r.id,
      title: r.title,
      level: (r as any).level ?? '',
      parentId: (r as any).parentId ?? '',
    })),
    businessFlows: state.businessFlowBlueprints?.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      stepCount: f.steps?.length ?? 0,
    })),
    includeFlowCases: state.includeFlowCases,
    selectedFlowIds: state.selectedFlowIds,
  }, null, 2);
}

// ============================================================
// Test Designer Prompts
// ============================================================

export function buildDesignerSystemPrompt(state: TestGenState): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const criticalCount = conditions.filter(c => c.priority === 'critical').length;
  const highCount = conditions.filter(c => c.priority === 'high').length;
  const isFlowMode = state.includeFlowCases;

  return `You are a senior ISTQB Test Designer. Design detailed, executable test cases from the provided test conditions.

## Context
- Test Conditions: ${conditions.length} total (${criticalCount} critical, ${highCount} high)
- Project: ${state.projectContext.name}
${state.businessFlowBlueprints?.length ? `- Business Flows: ${state.businessFlowBlueprints.length} available` : ''}
${isFlowMode ? '- Mode: Flow-level test cases — design end-to-end test cases that traverse business flows' : ''}

## Mandatory Tool Usage Workflow
You MUST use tools to gather information before designing test cases. Do NOT skip tool calls.

### Step 1: Verify Requirement Details
${state.queriedRequirements && Object.keys(state.queriedRequirements).length > 0
    ? `Requirement details have ALREADY been queried by the Test Analyst and are provided below in the "Pre-queried Requirements" section. You do NOT need to call requirement_detail_query again — use the provided details directly.`
    : `For EACH test condition, call **requirement_detail_query** with the condition's requirementId to get accurate acceptance criteria and test data requirements.`}
If designing flow-level cases, call **flow_detail_query** to get step details.

### Step 2: Load ISTQB Technique Guides
For EACH test condition, load the technique guide matching its primaryTechnique:
- equivalence_partitioning → call **istqb_equivalence_partitioning**
- boundary_value_analysis → call **istqb_boundary_value_analysis**
- decision_table → call **istqb_decision_table**
- state_transition → call **istqb_state_transition**
- use_case_testing → call **istqb_use_case_testing**
You MUST load the technique guide to ensure proper technique application in test case design.

### Step 3: Design Test Cases
Using the requirement details and technique guidance, design detailed test cases.

## Instructions
1. For EACH test condition, design at least one test case
2. Each test case must include:
   - Clear, actionable steps (action + expected result)
   - Explicit preconditions
   - Required test data
   - Self-review with quality score (1-10)
3. Apply the ISTQB technique specified in the condition
4. Ensure coverage across:
   - Happy path (primary scenario)
   - Alternative paths
   - Error/exception scenarios
5. Tag each test case with relevant categories

## Available Tools
- **requirement_detail_query(requirementId)**: Get requirement details for accurate test data and preconditions
- **flow_detail_query(flowId)**: Get flow details — pass a single ID string or an array of IDs for batch query
- **istqb_equivalence_partitioning(context?)**: Load EP technique guide
- **istqb_boundary_value_analysis(context?)**: Load BVA technique guide
- **istqb_decision_table(context?)**: Load decision table technique guide
- **istqb_state_transition(context?)**: Load state transition technique guide
- **istqb_use_case_testing(context?)**: Load use case testing technique guide
- **knowledge_base(context?)**: Search project knowledge base for domain-specific information

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

Provide your design rationale step by step as plain text: walk through each test case, explain technique application, test data choices, and coverage rationale. This analysis will be streamed to the user in real-time. Do NOT output JSON in this step — only provide your analysis text.`;
}

export function buildDesignerUserMessage(state: TestGenState): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const queriedReqs = state.queriedRequirements;
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
    })),
    ...(queriedReqs && Object.keys(queriedReqs).length > 0
      ? { preQueriedRequirements: queriedReqs }
      : {}),
    businessFlows: state.businessFlowBlueprints?.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      stepCount: f.steps?.length ?? 0,
    })),
  }, null, 2);
}

// ============================================================
// Quality Manager Prompts
// ============================================================

export function buildQualitySystemPrompt(state: TestGenState): string {
  const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];

  return `You are a senior QA Quality Manager. Perform a comprehensive 6-dimension review of draft test cases.

## Review Dimensions
1. **Clarity** — Are steps clear and unambiguous?
2. **Completeness** — Are all scenarios covered (happy path, alternate, error)?
3. **Correctness** — Do expected results match requirements?
4. **Traceability** — Is each case linked to a requirement and condition?
5. **Data Validity** — Is test data realistic and boundary-appropriate?
6. **Maintainability** — Are cases well-structured and reusable?

## Coverage Matrix
For each requirement, calculate:
- Number of associated test conditions
- Number of test cases
- Coverage percentage
- Technique distribution
- Uncovered risks: ONLY list risks that are within the scope of the current requirement and have real impact. Do NOT list speculative or out-of-scope edge cases. Leave empty if coverage is adequate.

## Available Tools
You have access to the following tools — use them when you need to verify information:
- **requirement_detail_query**: Verify requirement details when reviewing correctness
- **knowledge_base**: Search project knowledge base for domain-specific standards or rules

${state.humanReviewFeedback ? `## Reviewer Feedback\n${state.humanReviewFeedback}` : ''}

Provide your review analysis step by step as plain text: walk through each dimension, explain changes, and justify coverage ratings. This analysis will be streamed to the user in real-time. Do NOT output JSON in this step — only provide your analysis text.`;
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
