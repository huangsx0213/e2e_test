import { businessFlowRepo } from '../modules/business-flows/repository.ts';
import type { BusinessFlow } from '../../shared/contracts/index.ts';

const AUT_PROJECT_ID = 'p-aut-demo';

const flows: BusinessFlow[] = [
  // ═══════════════════════════════════════════════
  // Flow 1: User Login to Dashboard (Happy Path)
  // Covers: Authentication System + Dashboard
  // ═══════════════════════════════════════════════
  {
    id: 'flow-aut-login-to-dashboard',
    projectId: AUT_PROJECT_ID,
    name: 'User Login to Dashboard',
    description: 'A user authenticates with valid credentials, views the dashboard welcome message, and reviews system statistics.',
    type: 'happy-path',
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
    projectId: AUT_PROJECT_ID,
    name: 'Complete User Management Lifecycle',
    description: 'An admin user logs in, manages the user directory by creating, editing, reviewing, and deleting a user through the complete CRUD lifecycle.',
    type: 'happy-path',
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
    projectId: AUT_PROJECT_ID,
    name: 'Failed Login with Recovery',
    description: 'A user attempts login with invalid credentials, receives appropriate error feedback, then successfully recovers by entering valid credentials.',
    type: 'exception',
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
    projectId: AUT_PROJECT_ID,
    name: 'Reports and Analytics Viewing',
    description: 'An authenticated user navigates to the Reports page, views summary metric cards, and explores role and department distribution visualized in interactive charts.',
    type: 'happy-path',
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
    projectId: AUT_PROJECT_ID,
    name: 'Batch User Operations',
    description: 'An admin selects multiple users, performs bulk status updates, and executes a batch deletion with confirmation — testing the full batch operation workflow.',
    type: 'alternate',
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
    projectId: AUT_PROJECT_ID,
    name: 'Fault Injection Testing',
    description: 'A tester validates error handling and edge case behaviors by using the fault injection endpoints to simulate timeouts, server errors, and non-standard content types.',
    type: 'exception',
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

export function seedBusinessFlows(): void {
  const existing = businessFlowRepo.listByProject(AUT_PROJECT_ID);
  const existingNames = new Set(existing.map(f => f.name));
  let count = 0;
  for (const flow of flows) {
    if (existingNames.has(flow.name)) continue;
    businessFlowRepo.save(flow);
    count++;
  }
  if (count > 0) {
    console.log(`Seeded ${count} new business flows (skipped ${flows.length - count} existing).`);
  } else {
    console.log(`All ${flows.length} business flows already exist, skipped.`);
  }
}

// Allow running directly: npx tsx server/seed-data/seed-business-flows.ts
import path from 'node:path';
if (import.meta.url.endsWith(path.basename(process.argv[1]!))) {
  const { runMigrations } = await import('../migrations/index.ts');
  runMigrations();
  seedBusinessFlows();
}
