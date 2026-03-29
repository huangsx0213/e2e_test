import { db } from './shared/db/client.ts';
import { runMigrations } from './migrations/index.ts';
import { createEnvironment } from './modules/environments/repository.ts';
import { saveBodyTemplate } from './modules/bodies/repository.ts';
import { saveApiEndpoint } from './modules/endpoints/repository.ts';
import { saveHeaderProfile } from './modules/headers/repository.ts';
import { saveProject } from './modules/projects/repository.ts';
import { saveExecutionReport } from './modules/reports/repository.ts';
import { saveSettings } from './modules/settings/repository.ts';
import { saveSuite } from './modules/suites/repository.ts';

function clearAllData(): void {
  db.exec(`
    DELETE FROM report_logs;
    DELETE FROM reports;
    DELETE FROM settings;
    DELETE FROM endpoint_parameters;
    DELETE FROM endpoint_base_urls;
    DELETE FROM endpoints;
    DELETE FROM body_default_values;
    DELETE FROM bodies;
    DELETE FROM header_items;
    DELETE FROM headers;
    DELETE FROM case_steps;
    DELETE FROM suite_steps;
    DELETE FROM suite_cases;
    DELETE FROM suite_data_row_values;
    DELETE FROM suite_data_rows;
    DELETE FROM suite_variables;
    DELETE FROM scenario_suite_variable_overrides;
    DELETE FROM scenario_suites;
    DELETE FROM scenarios;
    DELETE FROM module_steps;
    DELETE FROM module_params;
    DELETE FROM project_modules;
    DELETE FROM project_elements;
    DELETE FROM project_pages;
    DELETE FROM suites;
    DELETE FROM projects;
    DELETE FROM environments;
  `);
}

function seedProjects(): void {
  saveProject({
    id: 'p-web-shop',
    name: 'Web Shop QA',
    description: 'Customer storefront automation assets.',
    pages: [
      {
        id: 'pg-web-login',
        name: 'Login Page',
        description: 'Customer sign-in entry page.',
        elements: [
          { id: 'el-web-email', name: 'Email Input', selectorType: 'getByLabel', value: 'Email address' },
          { id: 'el-web-password', name: 'Password Input', selectorType: 'getByLabel', value: 'Password' },
          { id: 'el-web-submit', name: 'Login Button', selectorType: 'getByRole', value: 'button[name="Sign in"]' },
          { id: 'el-web-forgot-password', name: 'Forgot Password Link', selectorType: 'getByText', value: 'Forgot password?' },
        ],
      },
      {
        id: 'pg-web-catalog',
        name: 'Catalog Page',
        description: 'Product listing page.',
        elements: [
          { id: 'el-web-search', name: 'Search Input', selectorType: 'getByPlaceholder', value: 'Search products' },
          { id: 'el-web-first-card', name: 'First Product Card', selectorType: 'CSS', value: '[data-testid="product-card"]:first-child' },
          { id: 'el-web-add-cart', name: 'Add To Cart Button', selectorType: 'getByRole', value: 'button[name="Add to cart"]' },
          { id: 'el-web-mini-cart', name: 'Mini Cart Badge', selectorType: 'getByTestId', value: 'mini-cart-count' },
        ],
      },
      {
        id: 'pg-web-checkout',
        name: 'Checkout Page',
        description: 'Order review and submission page.',
        elements: [
          { id: 'el-web-shipping-address', name: 'Shipping Address', selectorType: 'getByLabel', value: 'Shipping address' },
          { id: 'el-web-place-order', name: 'Place Order Button', selectorType: 'getByRole', value: 'button[name="Place order"]' },
          { id: 'el-web-order-success', name: 'Order Success Banner', selectorType: 'getByText', value: 'Thank you for your order' },
        ],
      },
    ],
    modules: [
      {
        id: 'mod-web-login',
        name: 'Customer Login',
        description: 'Reusable customer login flow.',
        params: [
          { id: 'param-web-user', name: 'USER_EMAIL', defaultValue: 'shopper@example.com' },
          { id: 'param-web-password', name: 'USER_PASSWORD', defaultValue: 'secret123' },
        ],
        steps: [
          { id: 'step-web-open-login', action: 'OPEN', target: 'https://shop.qa.local/login', data: '', description: 'Open login page' },
          { id: 'step-web-type-email', action: 'TYPE', target: 'Login Page.Email Input', data: '{{USER_EMAIL}}' },
          { id: 'step-web-type-password', action: 'TYPE', target: 'Login Page.Password Input', data: '{{USER_PASSWORD}}' },
          { id: 'step-web-submit-login', action: 'CLICK', target: 'Login Page.Login Button', data: '' },
        ],
      },
      {
        id: 'mod-web-search-add-cart',
        name: 'Search And Add Product',
        description: 'Finds a product and adds it to cart.',
        params: [
          { id: 'param-web-product', name: 'PRODUCT_NAME', defaultValue: 'wireless mouse' },
        ],
        steps: [
          { id: 'step-web-search-product', action: 'TYPE', target: 'Catalog Page.Search Input', data: '{{PRODUCT_NAME}}' },
          { id: 'step-web-add-product', action: 'CLICK', target: 'Catalog Page.Add To Cart Button', data: '' },
          { id: 'step-web-assert-mini-cart', action: 'ASSERT_TEXT', target: 'Catalog Page.Mini Cart Badge', data: '1' },
        ],
      },
    ],
    scenarios: [
      {
        id: 'scenario-web-smoke',
        name: 'Web Smoke Scenario',
        description: 'Core shopping path checks.',
        suites: [
          { id: 'scenario-suite-web-smoke', suiteId: 'suite-web-smoke', variableOverrides: { BASE_URL: 'https://shop.qa.local' } },
          { id: 'scenario-suite-web-checkout', suiteId: 'suite-web-checkout', variableOverrides: { BASE_URL: 'https://shop.qa.local', PRODUCT_NAME: 'wireless mouse' } },
        ],
      },
      {
        id: 'scenario-web-regression',
        name: 'Web Regression Pack',
        description: 'Expanded regression scenario for release sign-off.',
        suites: [
          { id: 'scenario-suite-web-api', suiteId: 'suite-web-api-contract', variableOverrides: { API_ENV: 'SIT' } },
        ],
      },
    ],
  });

  saveProject({
    id: 'p-admin-console',
    name: 'Admin Console QA',
    description: 'Backoffice administration automation assets.',
    pages: [
      {
        id: 'pg-admin-dashboard',
        name: 'Dashboard',
        description: 'Primary admin landing page.',
        elements: [
          { id: 'el-admin-nav-users', name: 'Users Nav Link', selectorType: 'getByRole', value: 'link[name="Users"]' },
          { id: 'el-admin-kpi', name: 'Orders KPI', selectorType: 'getByText', value: 'Total Orders' },
          { id: 'el-admin-nav-orders', name: 'Orders Nav Link', selectorType: 'getByRole', value: 'link[name="Orders"]' },
        ],
      },
      {
        id: 'pg-admin-users',
        name: 'Users Page',
        description: 'User management area.',
        elements: [
          { id: 'el-admin-search', name: 'User Search', selectorType: 'getByPlaceholder', value: 'Search users' },
          { id: 'el-admin-first-row', name: 'First User Row', selectorType: 'CSS', value: 'tbody tr:first-child' },
          { id: 'el-admin-status-chip', name: 'Status Chip', selectorType: 'CSS', value: '[data-testid="status-chip"]' },
          { id: 'el-admin-edit-user', name: 'Edit User Button', selectorType: 'getByRole', value: 'button[name="Edit user"]' },
        ],
      },
      {
        id: 'pg-admin-orders',
        name: 'Orders Page',
        description: 'Order review and fulfillment area.',
        elements: [
          { id: 'el-admin-order-filter', name: 'Order Filter', selectorType: 'getByPlaceholder', value: 'Filter orders' },
          { id: 'el-admin-order-row', name: 'First Order Row', selectorType: 'CSS', value: 'tbody tr:first-child' },
          { id: 'el-admin-order-status', name: 'Order Status Badge', selectorType: 'CSS', value: '[data-testid="order-status"]' },
        ],
      },
    ],
    modules: [
      {
        id: 'mod-admin-search-user',
        name: 'Search User',
        description: 'Reusable user lookup flow.',
        params: [
          { id: 'param-admin-user', name: 'SEARCH_TERM', defaultValue: 'qa.user@example.com' },
        ],
        steps: [
          { id: 'step-admin-nav-users', action: 'CLICK', target: 'Dashboard.Users Nav Link', data: '' },
          { id: 'step-admin-search-user', action: 'TYPE', target: 'Users Page.User Search', data: '{{SEARCH_TERM}}' },
          { id: 'step-admin-assert-row', action: 'ASSERT_VISIBLE', target: 'Users Page.First User Row', data: '' },
        ],
      },
      {
        id: 'mod-admin-open-orders',
        name: 'Open Orders View',
        description: 'Navigates to orders and validates first row.',
        steps: [
          { id: 'step-admin-nav-orders', action: 'CLICK', target: 'Dashboard.Orders Nav Link', data: '' },
          { id: 'step-admin-assert-order-row', action: 'ASSERT_VISIBLE', target: 'Orders Page.First Order Row', data: '' },
        ],
      },
    ],
    scenarios: [
      {
        id: 'scenario-admin-regression',
        name: 'Admin Regression Scenario',
        description: 'Critical backoffice checks.',
        suites: [
          { id: 'scenario-suite-admin', suiteId: 'suite-admin-users', variableOverrides: { ADMIN_BASE_URL: 'https://admin.qa.local' } },
          { id: 'scenario-suite-admin-orders', suiteId: 'suite-admin-orders', variableOverrides: { ADMIN_BASE_URL: 'https://admin.qa.local', ORDER_STATUS: 'Pending Review' } },
        ],
      },
      {
        id: 'scenario-admin-release',
        name: 'Admin Release Gate',
        description: 'Release gate checks for admin platform.',
        suites: [
          { id: 'scenario-suite-admin-api', suiteId: 'suite-admin-api-contract', variableOverrides: { ADMIN_API_ENV: 'UAT' } },
        ],
      },
    ],
  });
}

function seedSuites(): void {
  saveSuite({
    id: 'suite-web-smoke',
    projectId: 'p-web-shop',
    name: 'Web Shop Smoke',
    description: 'Login and cart smoke tests.',
    variables: [
      { id: 'var-web-base-url', key: 'BASE_URL', value: 'https://shop.qa.local' },
      { id: 'var-web-user', key: 'USER_EMAIL', value: 'shopper@example.com' },
    ],
    dataRows: [
      { USER_EMAIL: 'shopper@example.com', USER_PASSWORD: 'secret123' },
      { USER_EMAIL: 'vip@example.com', USER_PASSWORD: 'secret123' },
    ],
    setupSteps: [
      { id: 'suite-web-setup-open', action: 'OPEN', target: '{{BASE_URL}}/login', data: '', description: 'Open login page' },
    ],
    cases: [
      {
        id: 'case-web-login',
        name: 'Customer can login',
        description: 'Verifies login success path.',
        steps: [
          { id: 'case-web-login-module', action: 'RUN_MODULE', target: 'mod-web-login', data: '{"USER_EMAIL":"{{USER_EMAIL}}","USER_PASSWORD":"{{USER_PASSWORD}}"}' },
          { id: 'case-web-login-assert', action: 'ASSERT_TEXT', target: 'Catalog Page.First Product Card', data: 'Featured Product' },
        ],
      },
      {
        id: 'case-web-cart',
        name: 'Customer adds item to cart',
        description: 'Checks add-to-cart button path.',
        steps: [
          { id: 'case-web-search', action: 'TYPE', target: 'Catalog Page.Search Input', data: 'wireless mouse' },
          { id: 'case-web-add-cart', action: 'CLICK', target: 'Catalog Page.Add To Cart Button', data: '' },
          { id: 'case-web-wait', action: 'WAIT', target: '', data: '500' },
        ],
      },
    ],
    teardownSteps: [
      { id: 'suite-web-close', action: 'PRESS_KEY', target: '', data: 'Escape', description: 'Reset UI state' },
    ],
  });

  saveSuite({
    id: 'suite-web-checkout',
    projectId: 'p-web-shop',
    name: 'Web Checkout Flow',
    description: 'Validates checkout experience with realistic order data.',
    variables: [
      { id: 'var-web-checkout-base-url', key: 'BASE_URL', value: 'https://shop.qa.local' },
      { id: 'var-web-checkout-product', key: 'PRODUCT_NAME', value: 'wireless mouse' },
    ],
    dataRows: [
      { PRODUCT_NAME: 'wireless mouse', SHIPPING_ADDRESS: '221B Baker Street, London' },
      { PRODUCT_NAME: 'ergonomic keyboard', SHIPPING_ADDRESS: '350 Fifth Avenue, New York' },
    ],
    setupSteps: [
      { id: 'suite-web-checkout-open', action: 'OPEN', target: '{{BASE_URL}}/catalog', data: '', description: 'Open catalog before checkout scenario' },
    ],
    cases: [
      {
        id: 'case-web-checkout-cart',
        name: 'Customer adds searched product to cart',
        description: 'Uses reusable module to add a product to cart.',
        steps: [
          { id: 'case-web-run-cart-module', action: 'RUN_MODULE', target: 'mod-web-search-add-cart', data: '{"PRODUCT_NAME":"{{PRODUCT_NAME}}"}' },
        ],
      },
      {
        id: 'case-web-place-order',
        name: 'Customer places order successfully',
        description: 'Submits checkout form and verifies success banner.',
        steps: [
          { id: 'case-web-open-checkout', action: 'OPEN', target: '{{BASE_URL}}/checkout', data: '' },
          { id: 'case-web-fill-address', action: 'TYPE', target: 'Checkout Page.Shipping Address', data: '{{SHIPPING_ADDRESS}}' },
          { id: 'case-web-place-order', action: 'CLICK', target: 'Checkout Page.Place Order Button', data: '' },
          { id: 'case-web-order-success', action: 'ASSERT_VISIBLE', target: 'Checkout Page.Order Success Banner', data: '' },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-web-api-contract',
    projectId: 'p-web-shop',
    name: 'Web API Contract',
    description: 'API contract coverage for core storefront endpoints.',
    variables: [
      { id: 'var-web-api-env', key: 'API_ENV', value: 'SIT' },
      { id: 'var-web-api-user', key: 'USER_EMAIL', value: 'shopper@example.com' },
    ],
    cases: [
      {
        id: 'case-web-api-login',
        name: 'Login API returns success contract',
        description: 'Validates login API payload and headers.',
        steps: [
          { id: 'case-web-api-post-login', action: 'API_POST', target: '/auth/login', data: '', endpointId: 'endpoint-web-login', headerProfileId: 'header-web-auth', bodyTemplateId: 'body-web-login' },
        ],
      },
      {
        id: 'case-web-api-catalog',
        name: 'Catalog API supports search parameter',
        description: 'Ensures search parameter contract is valid.',
        steps: [
          { id: 'case-web-api-get-catalog', action: 'API_GET', target: '/products', data: '', endpointId: 'endpoint-web-catalog', headerProfileId: 'header-web-auth' },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-admin-users',
    projectId: 'p-admin-console',
    name: 'Admin User Management',
    description: 'Critical admin user journeys.',
    variables: [
      { id: 'var-admin-base-url', key: 'ADMIN_BASE_URL', value: 'https://admin.qa.local' },
      { id: 'var-admin-user', key: 'SEARCH_TERM', value: 'qa.user@example.com' },
    ],
    dataRows: [
      { SEARCH_TERM: 'qa.user@example.com' },
      { SEARCH_TERM: 'ops.user@example.com' },
    ],
    setupSteps: [
      { id: 'suite-admin-open', action: 'OPEN', target: '{{ADMIN_BASE_URL}}/dashboard', data: '' },
    ],
    cases: [
      {
        id: 'case-admin-search',
        name: 'Admin can search user',
        description: 'Finds a user from the grid.',
        steps: [
          { id: 'case-admin-run-module', action: 'RUN_MODULE', target: 'mod-admin-search-user', data: '{"SEARCH_TERM":"{{SEARCH_TERM}}"}' },
          { id: 'case-admin-status', action: 'ASSERT_VISIBLE', target: 'Users Page.Status Chip', data: '' },
        ],
      },
      {
        id: 'case-admin-api-health',
        name: 'Admin API users endpoint responds',
        description: 'Checks user list API.',
        steps: [
          { id: 'case-admin-api-get', action: 'API_GET', target: '/users', data: '', endpointId: 'endpoint-admin-users', headerProfileId: 'header-admin-auth' },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-admin-orders',
    projectId: 'p-admin-console',
    name: 'Admin Order Operations',
    description: 'Order queue monitoring and fulfillment smoke checks.',
    variables: [
      { id: 'var-admin-orders-base-url', key: 'ADMIN_BASE_URL', value: 'https://admin.qa.local' },
      { id: 'var-admin-order-status', key: 'ORDER_STATUS', value: 'Pending Review' },
    ],
    dataRows: [
      { ORDER_STATUS: 'Pending Review' },
      { ORDER_STATUS: 'Payment Failed' },
    ],
    cases: [
      {
        id: 'case-admin-open-orders',
        name: 'Admin opens orders page',
        description: 'Uses reusable navigation module.',
        steps: [
          { id: 'case-admin-run-orders-module', action: 'RUN_MODULE', target: 'mod-admin-open-orders', data: '{}' },
          { id: 'case-admin-check-order-status', action: 'ASSERT_TEXT', target: 'Orders Page.Order Status Badge', data: '{{ORDER_STATUS}}' },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-admin-api-contract',
    projectId: 'p-admin-console',
    name: 'Admin API Contract',
    description: 'Validates contract-level API responses for admin services.',
    variables: [
      { id: 'var-admin-api-env', key: 'ADMIN_API_ENV', value: 'UAT' },
      { id: 'var-admin-token', key: 'ADMIN_TOKEN', value: 'demo-admin-token' },
    ],
    cases: [
      {
        id: 'case-admin-api-users',
        name: 'Users API returns paged list',
        description: 'Verifies list users API contract.',
        steps: [
          { id: 'case-admin-api-users-get', action: 'API_GET', target: '/users', data: '', endpointId: 'endpoint-admin-users', headerProfileId: 'header-admin-auth' },
        ],
      },
      {
        id: 'case-admin-api-orders',
        name: 'Orders API returns queue payload',
        description: 'Checks orders queue contract.',
        steps: [
          { id: 'case-admin-api-orders-get', action: 'API_GET', target: '/orders', data: '', endpointId: 'endpoint-admin-orders', headerProfileId: 'header-admin-auth' },
        ],
      },
    ],
  });
}

function seedApiAssets(): void {
  saveHeaderProfile({
    id: 'header-web-auth',
    projectId: 'p-web-shop',
    name: 'Web Auth Headers',
    description: 'Headers for storefront auth flows.',
    headers: [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'X-App-Channel', value: 'web', enabled: true },
      { key: 'X-Tenant', value: 'shop-demo', enabled: true },
    ],
  });

  saveHeaderProfile({
    id: 'header-admin-auth',
    projectId: 'p-admin-console',
    name: 'Admin Auth Headers',
    description: 'Headers for admin API requests.',
    headers: [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'X-Admin-Token', value: '{{ADMIN_TOKEN}}', enabled: true },
      { key: 'X-Workspace', value: 'ops-control', enabled: true },
    ],
  });

  saveBodyTemplate({
    id: 'body-web-login',
    projectId: 'p-web-shop',
    name: 'Login Request',
    description: 'Customer login body.',
    contentType: 'application/json',
    content: '{"email":"{{USER_EMAIL}}","password":"{{USER_PASSWORD}}"}',
    defaultValues: {
      USER_EMAIL: 'shopper@example.com',
      USER_PASSWORD: 'secret123',
    },
  });

  saveBodyTemplate({
    id: 'body-web-order-submit',
    projectId: 'p-web-shop',
    name: 'Order Submit Request',
    description: 'Checkout payload with shipping data.',
    contentType: 'application/json',
    content: '{"product":"{{PRODUCT_NAME}}","shippingAddress":"{{SHIPPING_ADDRESS}}"}',
    defaultValues: {
      PRODUCT_NAME: 'wireless mouse',
      SHIPPING_ADDRESS: '221B Baker Street, London',
    },
  });

  saveBodyTemplate({
    id: 'body-admin-user-filter',
    projectId: 'p-admin-console',
    name: 'User Search Filter',
    description: 'Admin user search payload.',
    contentType: 'application/json',
    content: '{"query":"{{SEARCH_TERM}}"}',
    defaultValues: {
      SEARCH_TERM: 'qa.user@example.com',
    },
  });

  saveBodyTemplate({
    id: 'body-admin-order-filter',
    projectId: 'p-admin-console',
    name: 'Order Queue Filter',
    description: 'Admin order queue filter body.',
    contentType: 'application/json',
    content: '{"status":"{{ORDER_STATUS}}"}',
    defaultValues: {
      ORDER_STATUS: 'Pending Review',
    },
  });

  saveApiEndpoint({
    id: 'endpoint-web-login',
    projectId: 'p-web-shop',
    name: 'Storefront Login API',
    description: 'Authenticates storefront customer.',
    method: 'POST',
    baseUrls: {
      DEV: 'https://shop-api.dev.local',
      SIT: 'https://shop-api.sit.local',
      UAT: 'https://shop-api.uat.local',
    },
    parameters: [
      { key: 'locale', value: 'en-US', enabled: true },
    ],
  });

  saveApiEndpoint({
    id: 'endpoint-web-catalog',
    projectId: 'p-web-shop',
    name: 'Catalog Search API',
    description: 'Returns catalog results by keyword.',
    method: 'GET',
    baseUrls: {
      DEV: 'https://shop-api.dev.local',
      SIT: 'https://shop-api.sit.local',
      UAT: 'https://shop-api.uat.local',
    },
    parameters: [
      { key: 'q', value: 'wireless mouse', enabled: true },
      { key: 'pageSize', value: '24', enabled: true },
    ],
  });

  saveApiEndpoint({
    id: 'endpoint-web-orders',
    projectId: 'p-web-shop',
    name: 'Order Submit API',
    description: 'Creates a new customer order.',
    method: 'POST',
    baseUrls: {
      DEV: 'https://shop-api.dev.local',
      SIT: 'https://shop-api.sit.local',
      UAT: 'https://shop-api.uat.local',
    },
    parameters: [
      { key: 'include', value: 'paymentSummary', enabled: true },
    ],
  });

  saveApiEndpoint({
    id: 'endpoint-admin-users',
    projectId: 'p-admin-console',
    name: 'Admin Users API',
    description: 'Fetches admin user list.',
    method: 'GET',
    baseUrls: {
      DEV: 'https://admin-api.dev.local',
      SIT: 'https://admin-api.sit.local',
      UAT: 'https://admin-api.uat.local',
    },
    parameters: [
      { key: 'page', value: '1', enabled: true },
      { key: 'pageSize', value: '25', enabled: true },
    ],
  });

  saveApiEndpoint({
    id: 'endpoint-admin-orders',
    projectId: 'p-admin-console',
    name: 'Admin Orders API',
    description: 'Fetches order review queue.',
    method: 'GET',
    baseUrls: {
      DEV: 'https://admin-api.dev.local',
      SIT: 'https://admin-api.sit.local',
      UAT: 'https://admin-api.uat.local',
    },
    parameters: [
      { key: 'status', value: 'Pending Review', enabled: true },
      { key: 'pageSize', value: '50', enabled: true },
    ],
  });
}

function seedReports(): void {
  saveExecutionReport({
    id: 'report-web-smoke-dev',
    suiteId: 'suite-web-smoke',
    suiteName: 'Web Shop Smoke',
    environment: 'DEV',
    startTime: 1735718400000,
    endTime: 1735718700000,
    status: 'COMPLETED',
    passRate: 100,
    totalCases: 2,
    passedCases: 2,
    failedCases: 0,
    logs: [
      { stepId: 'suite-web-setup-open', timestamp: 1735718410000, status: 'PASS', message: 'Login page opened successfully' },
      { stepId: 'case-web-login-module', timestamp: 1735718460000, status: 'PASS', message: 'Customer login module completed' },
      { stepId: 'case-web-add-cart', timestamp: 1735718560000, status: 'PASS', message: 'Cart badge incremented to 1' },
    ],
  });

  saveExecutionReport({
    id: 'report-admin-users-uat',
    suiteId: 'suite-admin-users',
    suiteName: 'Admin User Management',
    environment: 'UAT',
    startTime: 1735804800000,
    endTime: 1735805160000,
    status: 'FAILED',
    passRate: 50,
    totalCases: 2,
    passedCases: 1,
    failedCases: 1,
    logs: [
      { stepId: 'case-admin-run-module', timestamp: 1735804860000, status: 'PASS', message: 'User search returned expected row' },
      { stepId: 'case-admin-api-get', timestamp: 1735805030000, status: 'FAIL', message: 'Users API returned 502 Bad Gateway from UAT gateway' },
    ],
  });
}

function seedSettings(): void {
  ['DEV', 'SIT', 'UAT', 'PROD'].forEach((environment) => {
    createEnvironment(environment);
  });

  saveSettings({
    id: 'global',
    currentProjectId: 'p-web-shop',
    currentEnvironment: 'DEV',
  });
}

function seedDefaults(): void {
  runMigrations();
  clearAllData();
  seedProjects();
  seedSuites();
  seedApiAssets();
  seedReports();
  seedSettings();
}

seedDefaults();

console.log('Database reset and default data seeded');
