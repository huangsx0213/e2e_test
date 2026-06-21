import type { TestGenState } from './state';

// ============================================================
// Test Analyst Prompts
// ============================================================

export function buildAnalystSystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }
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

${isFlowMode
    ? `### Step 1: Gather Flow Details
Call **flow_detail_query** with the "selectedFlowIds" array from the input context — query ONLY the user-selected flows in a single batch call.

### Step 2: Gather Requirement Details (Reference)
Call **requirement_detail_query** with the requirement IDs associated with the flows to understand the business rules behind each step.
These requirements serve as REFERENCE — use them to ensure your flow test conditions cover key business rules.`
    : `### Step 1: Gather Requirement Details
Call **requirement_detail_query** with an ARRAY of ALL requirement IDs from the input in a single batch call.

### Step 2: Gather Flow Context (Optional)
If the input has "businessFlowBlueprints", call **flow_detail_query** with ALL blueprint IDs to load full flow details. This is CONTEXT ONLY — understanding how requirements participate in business flows helps you design more realistic test conditions that cover end-to-end scenarios.`}

### Step 3: Expand Requirement Graph (Recommended)
Call **requirement_graph_query** with the requirement IDs. If the input has "selectedFlowIds" or "businessFlowBlueprints", also pass them as the **flowId** parameter so the graph includes user-selected flows. This helps ensure your test conditions cover broader integration scenarios and don't miss cross-cutting concerns.

### Step 4: Load ISTQB Technique Guides
Call **istqb_guide** to load ALL ISTQB technique guides (Equivalence Partitioning, Boundary Value Analysis, Decision Table, State Transition, Use Case Testing) in a single call. You MUST load at least one technique guide before deriving test conditions.

### Step 5: Derive Test Conditions
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
- **requirement_graph_query(requirementId, flowId?)**: Expand the requirement graph — returns parent, children, siblings, dependencies, and associated business flows. Pass requirementId as a single ID or array. Optionally pass flowId (single or array) to include user-selected flows in the result.
- **flow_detail_query(flowId)**: Get business flow details — pass a single ID string or an array of IDs for batch query
- **istqb_guide(techniques?, context?)**: Load ISTQB technique guides (Equivalence Partitioning, Boundary Value Analysis, Decision Table, State Transition, Use Case Testing). Omit \`techniques\` to load all.
- **knowledge_base(context?)**: Search project knowledge base for domain-specific information

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format

Write your analysis as plain text — this will be streamed to the user in real-time. Use markdown formatting:
- Short section headings on their own lines
- Separate sections with blank lines
- Bullet lists for steps, options, and observations

After your analysis, end with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.

Example block:
\`\`\`json
{
  "requirementAnalysis": {
    "overallApproach": "Derived 2-4 requirement-focused test conditions per item, using Equivalence Partitioning and Boundary Value Analysis for empty/whitespace validation, Decision Table Testing for credential outcome combinations, State Transition Testing for authentication and session lifecycle behavior, and Use Case Testing for the end-to-end login-to-dashboard flow.",
    "riskAssessmentSummary": "Authentication and session management are security-sensitive and therefore high risk. Valid login, session establishment, and sign out/session invalidation are critical because defects could lead to unauthorized access, stale sessions, duplicate submissions, or incorrect post-logout access. Loading feedback is medium risk but still important for user experience and submission control."
  },
  "testConditions": [
    {
      "id": "C-001",
      "requirementId": "req-aut-auth-login-valid-success",
      "condition": "Verify that submitting the valid administrator credentials (admin/admin123) authenticates successfully and redirects the user to the main application/dashboard.",
      "category": "functional",
      "priority": "critical",
      "riskLevel": "critical",
      "primaryTechnique": "Use Case Testing",
      "secondaryTechniques": [
        "State Transition Testing",
        "Equivalence Partitioning"
      ],
      "techniqueRationale": "This is the primary happy-path business outcome, so Use Case Testing best validates the end-to-end login flow. State Transition Testing confirms movement from unauthenticated to authenticated state, and EP ensures the valid credential partition is represented.",
      "coverageDimensions": [
        "authentication",
        "positive",
        "redirect",
        "access-control"
      ],
      "dataRequirements": [
        "valid username: admin",
        "valid password: admin123"
      ],
      "dependencies": [],
      "requirementLevel": "AC"
    },
  ]
}
\`\`\`

**Rules:**
- The \`\`\`json block must be at the very end of your response — nothing after it.
- The block must contain the COMPLETE output: ALL test conditions, not a sample or a truncated version.
- Do NOT omit \`requirementAnalysis\` or \`testConditions\` from the block.
- An empty object \`{}\` is always invalid.

Before closing the \`\`\`json block, do a final field-by-field check that every \`testConditions[i]\` object still includes both \`requirementId\` and \`category\`. Even when two conditions come from the same requirement, repeat \`requirementId\` and \`category\` inside every condition object.

`;
}

export function buildAnalystUserMessage(state: TestGenState): string {
  return JSON.stringify({
    requirements: state.currentBatch.map(r => ({
      id: r.id,
      title: r.title,
      level: r.level,
      parentId: r.parentId,
    })),
    businessFlows: state.businessFlowBlueprints?.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
    })),
    includeFlowCases: state.includeFlowCases,
    selectedFlowIds: state.selectedFlowIds,
  }, null, 2);
}

// ============================================================
// Test Designer Prompts
// ============================================================

export function buildDesignerSystemPrompt(state: TestGenState, customPrompt?: string): string {
  if (customPrompt) {
    return replacePromptVariables(customPrompt, state);
  }
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
For EACH test condition, call **requirement_detail_query** with the condition's requirementId to get accurate acceptance criteria and test data requirements. Previous queries are cached, so repeated calls are fast.
If designing flow-level cases, call **flow_detail_query** to get step details.

### Step 2: Load ISTQB Technique Guides (MANDATORY)
Call **istqb_guide** to load ALL ISTQB technique guides in a single call. This is not optional — the guides ensure correct technique application. Do NOT skip this step even if you are familiar with the techniques.

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
6. **The \`draftTestCases\` array MUST contain at least one test case.** Do not end your analysis until you have described at least one complete test case for extraction.

## Available Tools
- **requirement_detail_query(requirementId)**: Get requirement details for accurate test data and preconditions
- **requirement_graph_query(requirementId, flowId?)**: Expand the requirement graph to discover related requirements and flows for integration testing. Optionally pass flowId to include user-selected flows.
- **flow_detail_query(flowId)**: Get flow details — pass a single ID string or an array of IDs for batch query
- **istqb_guide(techniques?, context?)**: Load ISTQB technique guides (Equivalence Partitioning, Boundary Value Analysis, Decision Table, State Transition, Use Case Testing). Omit \`techniques\` to load all.
- **knowledge_base(context?)**: Search project knowledge base for domain-specific information

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format

Write your design rationale as plain text — this will be streamed to the user in real-time. Use markdown formatting:
- Short section headings on their own lines
- Separate sections with blank lines
- Bullet lists for steps, options, and observations

After your analysis, end with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.
Example block:
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
      "techniqueApplied": "Use Case Testing",
      "preconditions": [
        "User is on the login page",
        "Browser session is clean with no existing authenticated session",
        "Administrator account exists and is active"
      ],
      "testData": [
        "username = admin",
        "password = admin123"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "action": "Enter username 'admin' and password 'admin123' into the login form.",
          "expected": "The credentials are accepted by the form fields with no client-side validation errors."
        },
        {
          "stepNumber": 2,
          "action": "Click the Sign in / Login button.",
          "expected": "Authentication is submitted and the system begins processing the login request."
        },
        {
          "stepNumber": 3,
          "action": "Wait for authentication to complete.",
          "expected": "The user is redirected to the main application/dashboard and the dashboard content is displayed."
        },
        {
          "stepNumber": 4,
          "action": "Verify the dashboard page content after redirect.",
          "expected": "The dashboard shows the expected main application elements such as navigation, personalized welcome content, and system overview content."
        }
      ],
      "postconditions": [
        "Authenticated session is created",
        "Dashboard is accessible for the logged-in user"
      ],
      "tags": [
        "authentication",
        "login",
        "dashboard",
        "session",
        "smoke",
        "happy-path"
      ],
      "selfReview": {
        "score": 9,
        "strengths": [
          "Covers the full end-to-end success path",
          "Verifies redirect plus dashboard readiness",
          "Aligns with the business flow and acceptance criteria"
        ],
        "weaknesses": [
          "Does not inspect every individual dashboard widget"
        ],
        "suggestions": [
          "Add a separate UI layout test for visual content consistency",
          "Add an API-level session test if needed"
        ]
      }
    },
  ]
}
\`\`\`

**Rules:**
- The \`\`\`json block must be at the very end of your response — nothing after it.
- The block must contain COMPLETE data: ALL draft test cases, not a sample.
- The \`draftTestCases\` array MUST contain at least one test case.
- An empty object \`{}\` is always invalid.


Before closing the \`\`\`json block, do a final check that:
- \`draftTestCases\` exists
- \`draftTestCases.length >= 1\`
- the first test case object is fully populated

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
  return `You are a senior QA Quality Manager. Perform a comprehensive 6-dimension review of draft test cases.

## Review Dimensions
1. **Clarity** — Are steps clear and unambiguous?
2. **Completeness** — Are all scenarios covered (happy path, alternate, error)?
3. **Correctness** — Do expected results match requirements?
4. **Traceability** — Is each case linked to a requirement and condition?
5. **Data Validity** — Is test data realistic and boundary-appropriate?
6. **Maintainability** — Are cases well-structured and reusable?

## Coverage Matrix
Coverage is computed automatically from your final test cases — you don't need to output it. Focus your review on the six dimensions above.

## Available Tools
You have access to the following tools — use them when you need to verify information:
- **requirement_detail_query**: Verify requirement details when reviewing correctness
- **knowledge_base**: Search project knowledge base for domain-specific standards or rules

${state.humanReviewFeedback ? `## Reviewer Feedback\n${state.humanReviewFeedback}` : ''}

## Output Format

Write your review analysis as plain text — this will be streamed to the user in real-time. Use markdown formatting:
- Short section headings on their own lines
- Separate sections with blank lines
- Bullet lists for steps, options, and observations

After your analysis, end with a single JSON code block containing the COMPLETE structured output. Do NOT add any text after this block.

Example block:
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
      "techniqueApplied": "Use Case Testing",
      "preconditions": [
        "User is on the login page",
        "Browser session is clean with no existing authenticated session",
        "Administrator account exists and is active"
      ],
      "testData": [
        "username = admin",
        "password = admin123"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "action": "Enter username 'admin' and password 'admin123' into the login form.",
          "expected": "The credentials are accepted by the form fields with no client-side validation errors."
        },
        {
          "stepNumber": 2,
          "action": "Click the Sign in / Login button.",
          "expected": "Authentication is submitted and the system begins processing the login request."
        },
        {
          "stepNumber": 3,
          "action": "Wait for authentication to complete.",
          "expected": "The user is redirected to the main application/dashboard and the dashboard content is displayed."
        },
        {
          "stepNumber": 4,
          "action": "Verify the dashboard page content after redirect.",
          "expected": "The dashboard shows the expected main application elements such as navigation, personalized welcome content, and system overview content."
        }
      ],
      "tags": [
        "authentication",
        "login",
        "dashboard",
        "session",
        "smoke",
        "happy-path"
      ],
      "status": "approved",
      "reviewSummary": "Clear happy-path login case with correct end-to-end redirect and dashboard verification.",
      "changeLog": []
    },
  ]
}
\`\`\`

**Rules:**
- The \`\`\`json block must be at the very end of your response — nothing after it.
- The block must contain COMPLETE data: ALL final test cases, not a sample.
- The \`finalTestCases\` array MUST contain at least one test case.
- An empty object \`{}\` is always invalid.
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
    .replace(/\{mode\}/g, state.includeFlowCases ? 'flow' : 'requirement');
}
