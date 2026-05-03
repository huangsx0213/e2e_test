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
    DELETE FROM test_plan_scenarios;
    DELETE FROM test_plans;
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
  // ─── Sauce Labs Demo Project (Modern Standard) ───
  saveProject({
    id: 'p-sauce-demo',
    name: 'Sauce Labs Demo',
    description: 'E2E test project for https://www.saucedemo.com (Swag Labs) with API Health Checks.',
    pages: [
      {
        id: 'pg-sauce-login',
        name: 'Login Page',
        description: 'Initial login screen.',
        elements: [
          { id: 'el-sauce-user', name: 'Username', selectorType: 'getByPlaceholder', value: 'Username' },
          { id: 'el-sauce-pass', name: 'Password', selectorType: 'getByPlaceholder', value: 'Password' },
          { id: 'el-sauce-login-btn', name: 'Login Button', selectorType: 'CSS', value: '#login-button' },
        ],
      },
      {
        id: 'pg-sauce-products',
        name: 'Products Page',
        description: 'Main inventory list.',
        elements: [
          { id: 'el-sauce-inventory', name: 'Inventory List', selectorType: 'CSS', value: '.inventory_list' },
          { id: 'el-sauce-item-card', name: 'Item Card', selectorType: 'CSS', value: '.inventory_item' },
          { id: 'el-sauce-add-backpack', name: 'Add Backpack', selectorType: 'CSS', value: '#add-to-cart-sauce-labs-backpack' },
          { id: 'el-sauce-cart-badge', name: 'Cart Badge', selectorType: 'CSS', value: '.shopping_cart_badge' },
          { id: 'el-sauce-cart-link', name: 'Cart Link', selectorType: 'CSS', value: '.shopping_cart_link' },
        ],
      },
      {
        id: 'pg-sauce-cart',
        name: 'Cart Page',
        description: 'Review items in cart.',
        elements: [
          { id: 'el-sauce-checkout-btn', name: 'Checkout Button', selectorType: 'CSS', value: '#checkout' },
        ],
      },
      {
        id: 'pg-sauce-checkout-1',
        name: 'Checkout Info',
        description: 'Customer information form.',
        elements: [
          { id: 'el-sauce-first-name', name: 'First Name', selectorType: 'getByPlaceholder', value: 'First Name' },
          { id: 'el-sauce-last-name', name: 'Last Name', selectorType: 'getByPlaceholder', value: 'Last Name' },
          { id: 'el-sauce-zip', name: 'Zip Code', selectorType: 'getByPlaceholder', value: 'Zip/Postal Code' },
          { id: 'el-sauce-continue', name: 'Continue Button', selectorType: 'CSS', value: '#continue' },
        ],
      },
      {
        id: 'pg-sauce-checkout-2',
        name: 'Checkout Overview',
        description: 'Order summary and finish.',
        elements: [
          { id: 'el-sauce-finish', name: 'Finish Button', selectorType: 'CSS', value: '#finish' },
        ],
      },
      {
        id: 'pg-sauce-complete',
        name: 'Checkout Complete',
        description: 'Confirmation page.',
        elements: [
          { id: 'el-sauce-complete-header', name: 'Complete Header', selectorType: 'CSS', value: '.complete-header' },
        ],
      },
    ],
    modules: [
      {
        id: 'mod-sauce-login',
        name: 'Sauce Login',
        description: 'Standard login flow for Sauce Demo.',
        params: [
          { id: 'param-sauce-user', name: 'USER', defaultValue: 'standard_user' },
          { id: 'param-sauce-pass', name: 'PASS', defaultValue: 'secret_sauce' },
        ],
        steps: [
          { id: 's-sauce-open', action: 'goto', target: '', data: 'https://www.saucedemo.com', description: 'Open site' },
          { id: 's-sauce-type-user', action: 'fill', target: 'Login Page.Username', data: '{{USER}}' },
          { id: 's-sauce-type-pass', action: 'fill', target: 'Login Page.Password', data: '{{PASS}}' },
          { id: 's-sauce-click-login', action: 'click', target: 'Login Page.Login Button', data: '', screenshot: true },
        ],
      },
      {
        id: 'mod-sauce-checkout',
        name: 'Fast Checkout',
        description: 'Fills info and finishes order.',
        params: [
          { id: 'param-sauce-fname', name: 'FNAME', defaultValue: 'John' },
          { id: 'param-sauce-lname', name: 'LNAME', defaultValue: 'Doe' },
          { id: 'param-sauce-zip', name: 'ZIP', defaultValue: '12345' },
        ],
        steps: [
          { id: 's-sauce-type-fname', action: 'fill', target: 'Checkout Info.First Name', data: '{{FNAME}}' },
          { id: 's-sauce-type-lname', action: 'fill', target: 'Checkout Info.Last Name', data: '{{LNAME}}' },
          { id: 's-sauce-type-zip', action: 'fill', target: 'Checkout Info.Zip Code', data: '{{ZIP}}' },
          { id: 's-sauce-click-cont', action: 'click', target: 'Checkout Info.Continue Button', data: '' },
          { id: 's-sauce-click-finish', action: 'click', target: 'Checkout Overview.Finish Button', data: '', screenshot: true },
        ],
      },
    ],
    scenarios: [
      {
        id: 'scenario-sauce-regression',
        name: 'Sauce Basic Regression',
        description: 'Covers login and primary purchase path after API health check.',
        dataRows: [
          { USER_NAME: 'standard_user', USER_PASS: 'secret_sauce' },
          { USER_NAME: 'problem_user', USER_PASS: 'secret_sauce' },
        ],
        suites: [
          { id: 'sc-suite-sauce-api', suiteId: 'suite-sauce-api', variableOverrides: {} },
          { id: 'sc-suite-sauce-e2e', suiteId: 'suite-sauce-e2e', variableOverrides: {} },
        ],
      },
      {
        id: 'scenario-sauce-inventory',
        name: 'Sauce Inventory Status',
        description: 'Verifies product list and cart persistence with scenario variables.',
        variables: [
          { id: 'v-sc-inv-target', key: 'TARGET_USER', value: 'standard_user' },
        ],
        dataRows: [
          { TARGET_USER: 'standard_user', SORT_OPTION: 'Name (A to Z)' },
          { TARGET_USER: 'problem_user', SORT_OPTION: 'Price (low to high)' },
        ],
        suites: [
          { id: 'sc-suite-sauce-inv', suiteId: 'suite-sauce-inventory', variableOverrides: {} },
        ],
      },
    ],
    plans: [
      {
        id: 'plan-sauce-daily',
        projectId: 'p-sauce-demo',
        name: 'Daily Full Regression',
        description: 'Runs basic regression and API health checks daily.',
        scenarios: [
          { id: 'p-sc-sauce-reg', scenarioId: 'scenario-sauce-regression' },
        ],
      },
      {
        id: 'plan-sauce-quick-smoke',
        projectId: 'p-sauce-demo',
        name: 'Quick Smoke Check',
        description: 'Rapid verification of inventory and core UI.',
        scenarios: [
          { id: 'p-sc-sauce-inv', scenarioId: 'scenario-sauce-inventory' },
        ],
      },
    ],
  });

  // ─── Baidu Demo Project (Real Runnable) ───
  saveProject({
    id: 'p-baidu-demo',
    name: 'Baidu Search Demo',
    description: 'A real, runnable hybrid API+UI demo project using baidu.com and httpbin.org.',
    pages: [
      {
        id: 'pg-baidu-home',
        name: 'Baidu Home',
        description: 'Baidu search engine homepage.',
        elements: [
          { id: 'el-baidu-search-input', name: 'Search Input', selectorType: 'XPath', value: '//textarea[@id=\'chat-textarea\']' },
          { id: 'el-baidu-search-btn', name: 'Search Button', selectorType: 'XPath', value: '//button[@id=\'chat-submit-button\']' },
          { id: 'el-baidu-logo', name: 'Logo', selectorType: 'CSS', value: '#lg img' },
        ],
      },
      {
        id: 'pg-baidu-results',
        name: 'Baidu Results',
        description: 'Baidu search results page.',
        elements: [
          { id: 'el-baidu-result-container', name: 'Results Container', selectorType: 'CSS', value: '#content_left' },
          { id: 'el-baidu-first-result', name: 'First Result Title', selectorType: 'CSS', value: '#content_left .c-container:first-child .t' },
        ],
      },
    ],
    modules: [],
    scenarios: [
      {
        id: 'scenario-baidu-full',
        name: 'Baidu Full Regression',
        description: 'Runs API health check then UI search scenarios in sequence.',
        suites: [
          { id: 'scenario-suite-baidu-api', suiteId: 'suite-baidu-api', variableOverrides: {} },
          { id: 'scenario-suite-baidu-ui', suiteId: 'suite-baidu-hybrid', variableOverrides: { SEARCH_KEYWORD: 'E2E测试框架' } },
        ],
      },
    ],
    plans: [
      {
        id: 'plan-baidu-nightly',
        projectId: 'p-baidu-demo',
        name: 'Baidu Nightly Check',
        description: 'Runs all Baidu scenarios nightly.',
        scenarios: [
          { id: 'plan-scenario-baidu-full', scenarioId: 'scenario-baidu-full' },
        ],
      },
    ],
  });

  // ─── Google Demo Project ───
  saveProject({
    id: 'p-google-demo',
    name: 'Google Search Demo',
    description: 'A real, runnable hybrid API+UI demo project using google.com and httpbin.org.',
    pages: [
      {
        id: 'pg-google-home',
        name: 'Google Home',
        description: 'Google search engine homepage.',
        elements: [
          { id: 'el-google-search-input', name: 'Search Input', selectorType: 'XPath', value: '//textarea[@name=\'q\']' },
          { id: 'el-google-search-btn', name: 'Search Button', selectorType: 'XPath', value: '(//input[@name=\'btnK\'])[2]' },
        ],
      },
    ],
    modules: [],
    scenarios: [],
  });
}

function seedSuites(): void {
  // ─── Sauce Demo Suites ───
  saveSuite({
    id: 'suite-sauce-api',
    projectId: 'p-sauce-demo',
    name: 'API Health Check (Sauce)',
    description: 'Verifies API connectivity before running UI tests.',
    variables: [
      { id: 'v-sauce-api-base', key: 'API_BASE', value: 'https://httpbin.org' },
    ],
    cases: [
      {
        id: 'case-sauce-api-get',
        name: 'Health GET',
        description: 'Check connectivity via GET.',
        steps: [
          { id: 's-sauce-api-get', action: 'apiGet', target: '/get', data: '', endpointId: 'endpoint-sauce-httpbin-get', headerProfileId: 'header-sauce-json' },
        ],
      },
      {
        id: 'case-sauce-api-post',
        name: 'Health POST',
        description: 'Check connectivity via POST.',
        steps: [
          { 
            id: 's-sauce-api-post', 
            action: 'apiPost', 
            target: '/post', 
            data: '', 
            endpointId: 'endpoint-sauce-httpbin-post', 
            headerProfileId: 'header-sauce-json', 
            bodyTemplateId: 'body-sauce-echo',
            assertions: [
              { id: 'a-post-status', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' },
              { id: 'a-post-body', source: 'API_BODY_JSON', expression: '$.json.test', operator: 'EQUALS', expectedValue: 'sauce-demo' }
            ],
            extractors: [
              { id: 'e-post-origin', name: 'ORIGIN_IP', source: 'API_BODY_JSON', expression: '$.origin', scope: 'CASE' }
            ]
          },
        ],
      },
      {
        id: 'case-sauce-api-post-fail',
        name: 'Health POST (Failing Assertion)',
        description: 'Check connectivity via POST with a failing assertion.',
        steps: [
          { 
            id: 's-sauce-api-post-fail', 
            action: 'apiPost', 
            target: '/post', 
            data: '', 
            endpointId: 'endpoint-sauce-httpbin-post', 
            headerProfileId: 'header-sauce-json', 
            bodyTemplateId: 'body-sauce-echo',
            assertions: [
              { id: 'a-post-status-fail', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' },
              { id: 'a-post-body-fail', source: 'API_BODY_JSON', expression: '$.json.test', operator: 'EQUALS', expectedValue: 'wrong-value' }
            ]
          },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-sauce-e2e',
    projectId: 'p-sauce-demo',
    name: 'Sauce E2E Purchase Flow',
    description: 'Comprehensive test from login to order confirmation.',
    variables: [
      { id: 'v-sauce-user', key: 'USER_NAME', value: 'standard_user' },
      { id: 'v-sauce-pass', key: 'USER_PASS', value: 'secret_sauce' },
    ],
    dataRows: [
      { USER_NAME: 'standard_user', USER_PASS: 'secret_sauce' },
      { USER_NAME: 'problem_user', USER_PASS: 'secret_sauce' },
    ],
    cases: [
      {
        id: 'case-sauce-login',
        name: 'User Login',
        description: 'Verification of successful login.',
        steps: [
          { id: 'step-sauce-login-mod', action: 'runModule', target: 'mod-sauce-login', data: '{"USER":"{{USER_NAME}}","PASS":"{{USER_PASS}}"}' },
          { id: 'step-sauce-assert-inv', action: 'assertVisible', target: 'Products Page.Inventory List', data: '' },
        ],
      },
      {
        id: 'case-sauce-add-to-cart',
        name: 'Add and Checkout',
        description: 'Adds backpack to cart and completes checkout.',
        steps: [
          { id: 'step-sauce-add-bp', action: 'click', target: 'Products Page.Add Backpack', data: '' },
          { id: 'step-sauce-assert-badge', action: 'assertText', target: 'Products Page.Cart Badge', data: '1' },
          { id: 'step-sauce-goto-cart', action: 'click', target: 'Products Page.Cart Link', data: '' },
          { id: 'step-sauce-click-checkout', action: 'click', target: 'Cart Page.Checkout Button', data: '' },
          { id: 'step-sauce-checkout-mod', action: 'runModule', target: 'mod-sauce-checkout', data: '{"FNAME":"Tester","LNAME":"Auto","ZIP":"90001"}' },
          { id: 'step-sauce-assert-complete', action: 'assertText', target: 'Checkout Complete.Complete Header', data: 'Thank you for your order!' },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-sauce-inventory',
    projectId: 'p-sauce-demo',
    name: 'Inventory Verification',
    description: 'Checks product list state and basic UI components.',
    variables: [],
    cases: [
      {
        id: 'case-sauce-verify-list',
        name: 'Verify Products Loaded',
        description: 'Asserts that item cards are visible after login.',
        steps: [
          { id: 's-sauce-inv-login', action: 'runModule', target: 'mod-sauce-login', data: '{"USER":"{{TARGET_USER}}","PASS":"secret_sauce"}' },
          { id: 's-sauce-assert-items', action: 'assertVisible', target: 'Products Page.Item Card', data: '' },
        ],
      },
    ],
  });

  // ─── Baidu Demo Suites ───
  saveSuite({
    id: 'suite-baidu-api',
    projectId: 'p-baidu-demo',
    name: 'API Health Check (httpbin)',
    description: 'Validates API executor against real public httpbin.org endpoints.',
    variables: [
      { id: 'var-baidu-api-base', key: 'API_BASE', value: 'https://httpbin.org' },
    ],
    cases: [
      {
        id: 'case-baidu-api-get',
        name: 'GET /get returns 200',
        steps: [
          { id: 'step-baidu-api-get', action: 'apiGet', target: '/get', data: '', endpointId: 'endpoint-sauce-httpbin-get', headerProfileId: 'header-sauce-json' },
        ],
      },
    ],
  });

  saveSuite({
    id: 'suite-baidu-hybrid',
    projectId: 'p-baidu-demo',
    name: 'Baidu Hybrid Search Test',
    description: 'Mixes API calls with real Baidu UI automation.',
    variables: [
      { id: 'var-baidu-search-keyword', key: 'SEARCH_KEYWORD', value: 'Playwright自动化测试' },
    ],
    cases: [
      {
        id: 'case-baidu-hybrid-ui-search',
        name: 'Search Baidu and verify results',
        steps: [
          { id: 'step-hybrid-open', action: 'goto', target: '', data: 'https://www.baidu.com' },
          { id: 'step-hybrid-type', action: 'fill', target: 'Baidu Home.Search Input', data: '{{SEARCH_KEYWORD}}' },
          { id: 'step-hybrid-click', action: 'click', target: 'Baidu Home.Search Button', data: '', screenshot: true },
          { id: 'step-hybrid-wait', action: 'waitForTimeout', target: '', data: '3000' },
          { id: 'step-hybrid-assert', action: 'assertVisible', target: 'Baidu Results.Results Container', data: '' },
        ],
      },
    ],
  });
}

function seedApiAssets(): void {
  saveHeaderProfile({
    id: 'header-sauce-json',
    projectId: 'p-sauce-demo',
    name: 'JSON Headers',
    description: 'Standard JSON headers for API tests.',
    headers: [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'Accept', value: 'application/json', enabled: true },
    ],
  });

  saveBodyTemplate({
    id: 'body-sauce-echo',
    projectId: 'p-sauce-demo',
    name: 'Health Echo Body',
    description: 'Simple echo body.',
    contentType: 'application/json',
    content: '{"test":"sauce-demo","timestamp":"{{TIMESTAMP}}"}',
    defaultValues: {
      TIMESTAMP: new Date().toISOString(),
    },
  });

  saveApiEndpoint({
    id: 'endpoint-sauce-httpbin-get',
    projectId: 'p-sauce-demo',
    name: 'httpbin GET',
    description: 'Public echo API.',
    method: 'GET',
    baseUrls: { DEV: 'https://httpbin.org', PROD: 'https://httpbin.org' },
    parameters: [{ key: 'source', value: 'sauce_demo', enabled: true }],
  });

  saveApiEndpoint({
    id: 'endpoint-sauce-httpbin-post',
    projectId: 'p-sauce-demo',
    name: 'httpbin POST',
    description: 'Public echo API.',
    method: 'POST',
    baseUrls: { DEV: 'https://httpbin.org', PROD: 'https://httpbin.org' },
    parameters: [],
  });
}

function seedReports(): void {
  // Empty or basic reports if needed
}

function seedSettings(): void {
  ['DEV', 'PROD'].forEach((env) => createEnvironment(env));

  saveSettings({
    id: 'global',
    currentProjectId: 'p-sauce-demo',
    currentEnvironment: 'DEV',
    viewportWidth: 1920,
    viewportHeight: 1080,
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
console.log('✅ Final Database reset and unified Sauce Demo data seeded!');
