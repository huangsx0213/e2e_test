import { Log } from '../shared/services/logger';
import { requirementRepo } from '../modules/requirements/repository.ts';
import type { Requirement } from '../shared/contracts/index.ts';

const AUT_PROJECT_ID = 'p-aut-demo';
const FLOWS_EPIC_ID = 'req-aut-system-flows-epic';

interface FlowStep {
  sequence: number;
  requirementIds: string[];
  actionSummary: string;
}

interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  status: Requirement['status'];
  steps: FlowStep[];
}

const flows: FlowDefinition[] = [
  // ═══════════════════════════════════════════════
  // Flow 1: User Login to Dashboard (Happy Path)
  // Covers: Authentication System + Dashboard
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-login-to-dashboard',
    name: 'User Login to Dashboard',
    description: 'A user authenticates with valid credentials, views the dashboard welcome message, and reviews system statistics.',
    status: 'APPROVED',
    steps: [
      {
        sequence: 1,
        requirementIds: ['req-aut-auth-login-ui-form', 'req-aut-auth-login-ui-validation'],
        actionSummary: 'User navigates to the login page, views the login form with username and password fields, and validates form interactions including empty field validation and password visibility toggle.',
      },
      {
        sequence: 2,
        requirementIds: ['req-aut-auth-login-api-success', 'req-aut-auth-login-api-errors'],
        actionSummary: 'User enters valid admin credentials, the system authenticates via POST /aut-api/auth/login, returns a JWT token which is stored in localStorage, and the user is redirected to the dashboard.',
      },
      {
        sequence: 3,
        requirementIds: ['req-aut-dashboard-home-ui-welcome'],
        actionSummary: 'Upon landing on the dashboard, user sees a personalized "Welcome back, Admin!" greeting and navigation links to the Users and Reports pages.',
      },
      {
        sequence: 4,
        requirementIds: ['req-aut-dashboard-home-ui-stats', 'req-aut-dashboard-home-api-fetch'],
        actionSummary: 'User views dashboard statistics including Total Users count, Active Sessions with green indicator, and System Status — all fetched from GET /aut-api/dashboard/stats.',
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // Flow 2: Complete User Management Lifecycle (Happy Path)
  // Covers: Authentication + User Management (full CRUD cycle)
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-user-lifecycle',
    name: 'Complete User Management Lifecycle',
    description: 'An admin user logs in, manages the user directory by creating, editing, reviewing, and deleting a user through the complete CRUD lifecycle.',
    status: 'APPROVED',
    steps: [
      {
        sequence: 1,
        requirementIds: ['req-aut-auth-login-api-success'],
        actionSummary: 'Admin authenticates with valid credentials and is redirected to the dashboard.',
      },
      {
        sequence: 2,
        requirementIds: ['req-aut-user-mgmt-list-table', 'req-aut-user-mgmt-list-filter', 'req-aut-user-mgmt-list-pagination'],
        actionSummary: 'Admin navigates to User Management, views the sortable user table with Name, Email, Role, and Status columns, applies text search and role/status filters, and navigates through paginated results.',
      },
      {
        sequence: 3,
        requirementIds: ['req-aut-user-mgmt-quick-add-form'],
        actionSummary: 'Admin opens the Quick Add modal, fills in Full Name, Email, Role, and Status fields, submits the form which calls POST /aut-api/users with name and email validation.',
      },
      {
        sequence: 4,
        requirementIds: ['req-aut-user-mgmt-edit-flow'],
        actionSummary: 'Admin clicks the edit button on the newly created user, the advanced form pre-populates with all existing data, admin updates fields and saves via PUT /aut-api/users/:id.',
      },
      {
        sequence: 5,
        requirementIds: ['req-aut-user-mgmt-actions-profile'],
        actionSummary: 'Admin opens the More Options menu on a user row, views the user profile in a read-only modal with all fields displayed, and exports the user data as a downloadable JSON file.',
      },
      {
        sequence: 6,
        requirementIds: ['req-aut-user-mgmt-delete-flow'],
        actionSummary: 'Admin clicks the delete action on a user, a confirmation dialog appears, admin confirms the deletion and the user record is removed from the system.',
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // Flow 3: Failed Login with Recovery (Exception Path)
  // Covers: Authentication System error handling + recovery
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-login-error-recovery',
    name: 'Failed Login with Recovery',
    description: 'A user attempts login with invalid credentials, receives appropriate error feedback, then successfully recovers by entering valid credentials.',
    status: 'APPROVED',
    steps: [
      {
        sequence: 1,
        requirementIds: ['req-aut-auth-login-ui-form', 'req-aut-auth-login-ui-validation'],
        actionSummary: 'User navigates to the login page, views the login form, attempts to submit without credentials, and receives inline validation errors for empty fields. User uses password visibility toggle to verify the eye icon interaction.',
      },
      {
        sequence: 2,
        requirementIds: ['req-aut-auth-login-api-errors'],
        actionSummary: 'User enters incorrect credentials and submits. The POST /aut-api/auth/login returns a 401 status with "Invalid credentials" error message displayed to the user.',
      },
      {
        sequence: 3,
        requirementIds: ['req-aut-auth-login-api-success'],
        actionSummary: 'User enters valid admin credentials, the form shows a disabled loading state with "Signing in..." text, authentication succeeds, and the user is redirected to the dashboard with the JWT token stored in localStorage.',
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // Flow 4: Reports and Analytics Viewing (Happy Path)
  // Covers: Dashboard -> Reports & Analytics
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-reports-viewing',
    name: 'Reports and Analytics Viewing',
    description: 'An authenticated user navigates to the Reports page, views summary metric cards, and explores role and department distribution visualized in interactive charts.',
    status: 'APPROVED',
    steps: [
      {
        sequence: 1,
        requirementIds: ['req-aut-auth-login-api-success'],
        actionSummary: 'User logs in with valid credentials and is redirected to the dashboard.',
      },
      {
        sequence: 2,
        requirementIds: ['req-aut-dashboard-home-ui-welcome', 'req-aut-dashboard-home-ui-stats'],
        actionSummary: 'User views the dashboard welcome greeting and system stat cards including total users, active sessions, and system status.',
      },
      {
        sequence: 3,
        requirementIds: ['req-aut-reports-stats-metrics', 'req-aut-reports-api-aggregation'],
        actionSummary: 'User navigates to the Reports page and views four metric stat cards: Total Users, Active Accounts, Admin count, and Engagement Rate — with data served by GET /aut-api/reports.',
      },
      {
        sequence: 4,
        requirementIds: ['req-aut-reports-role-chart-pie'],
        actionSummary: 'User views the role distribution donut pie chart showing admin, editor, and viewer segments in distinct colors with a corresponding legend.',
      },
      {
        sequence: 5,
        requirementIds: ['req-aut-reports-dept-chart-bar'],
        actionSummary: 'User views the department distribution bar chart with department names on the X-axis and user counts on the Y-axis, with hover tooltips showing exact values.',
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // Flow 5: Batch User Operations (Alternate Path)
  // Covers: User Management batch operations
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-batch-operations',
    name: 'Batch User Operations',
    description: 'An admin selects multiple users, performs bulk status updates, and executes a batch deletion with confirmation — testing the full batch operation workflow.',
    status: 'APPROVED',
    steps: [
      {
        sequence: 1,
        requirementIds: ['req-aut-auth-login-api-success'],
        actionSummary: 'Admin authenticates with valid credentials.',
      },
      {
        sequence: 2,
        requirementIds: ['req-aut-user-mgmt-list-table', 'req-aut-user-mgmt-api-list'],
        actionSummary: 'Admin navigates to User Management and views the user list table populated by GET /aut-api/users with filtering, sorting, and pagination capabilities.',
      },
      {
        sequence: 3,
        requirementIds: ['req-aut-user-mgmt-batch-select'],
        actionSummary: 'Admin uses the header checkbox to select all visible users, then adjusts individual row checkboxes. A batch action bar appears showing the selected count badge with Activate/Deactivate and Delete buttons.',
      },
      {
        sequence: 4,
        requirementIds: ['req-aut-user-mgmt-batch-actions', 'req-aut-user-mgmt-api-batch'],
        actionSummary: 'Admin clicks Activate All to bulk-update inactive users to active via POST /aut-api/users/batch-update, then performs a batch delete with confirmation dialog and verifies the POST /aut-api/users/batch-delete succeeds. Admin also observes the warning badge when selecting users with mixed active/inactive statuses.',
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // Flow 6: Fault Injection Testing (Exception Path)
  // Covers: Fault Injection & Testing Utilities
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-fault-testing',
    name: 'Fault Injection Testing',
    description: 'A tester validates error handling and edge case behaviors by using the fault injection endpoints to simulate timeouts, server errors, and non-standard content types.',
    status: 'APPROVED',
    steps: [
      {
        sequence: 1,
        requirementIds: ['req-aut-auth-login-api-success'],
        actionSummary: 'Tester logs in as an authenticated user.',
      },
      {
        sequence: 2,
        requirementIds: ['req-aut-fault-timeout-delay'],
        actionSummary: 'Tester calls GET /aut-api/fault/timeout and verifies that the endpoint delays for 5000ms before returning a success response, confirming the client\'s timeout handling is robust.',
      },
      {
        sequence: 3,
        requirementIds: ['req-aut-fault-error-500'],
        actionSummary: 'Tester calls GET /aut-api/fault/simulate-500 multiple times and validates that the client handles both the 50% probability 500 error and the 50% success response correctly without crashing.',
      },
    ],
  },
];

function ensureFlowsEpic(): Requirement {
  const existing = requirementRepo.get(FLOWS_EPIC_ID);
  if (existing) return existing;

  return requirementRepo.save({
    id: FLOWS_EPIC_ID,
    projectId: AUT_PROJECT_ID,
    parentId: null,
    title: 'System Flows',
    description: 'Epic containing all seeded business flow stories.',
    level: 'epic',
    status: 'APPROVED',
    position: 0,
    humanId: 'FLOW-0',
    type: 'functional',
    isFlow: false,
  });
}

export function seedBusinessFlows(): void {
  const epic = ensureFlowsEpic();
  const projectRequirements = requirementRepo.listByProject(AUT_PROJECT_ID);
  const existingFlowTitles = new Set(
    projectRequirements
      .filter((r) => r.isFlow)
      .map((r) => r.title),
  );

  let count = 0;
  for (const flow of flows) {
    if (existingFlowTitles.has(flow.name)) continue;

    const story = requirementRepo.save({
      id: flow.id,
      projectId: AUT_PROJECT_ID,
      parentId: epic.id,
      title: flow.name,
      description: flow.description,
      level: 'story',
      status: flow.status,
      position: count,
      type: 'functional',
      isFlow: true,
    });

    for (const step of flow.steps) {
      requirementRepo.save({
        projectId: AUT_PROJECT_ID,
        parentId: story.id,
        title: step.actionSummary,
        level: 'ac',
        flowType: 'flow',
        status: 'DRAFT',
        position: step.sequence,
        type: 'functional',
        relatedRequirementIds: step.requirementIds,
      });
    }

    count++;
  }

  if (count > 0) {
    Log.for('seed').info(`Seeded ${count} new flow stories (skipped ${flows.length - count} existing).`);
  } else {
    Log.for('seed').info(`All ${flows.length} flow stories already exist, skipped.`);
  }
}

// Allow running directly: npx tsx server/seed-data/seed-business-flows.ts
import path from 'node:path';
if (import.meta.url.endsWith(path.basename(process.argv[1] || ''))) {
  const { runMigrations } = await import('../migrations/index.ts');
  runMigrations();
  seedBusinessFlows();
}
