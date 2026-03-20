
import { Project, TestSuite } from './types';

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Nexus E-Commerce',
    description: 'Main B2C storefront including catalog, cart, and checkout.',
    modules: [
        {
            id: 'mod_1',
            name: 'Login (Standard)',
            description: 'Standard login flow using variables',
            params: [
                { id: 'mp1', name: 'USER', defaultValue: 'admin@nexus.com', description: 'User email' },
                { id: 'mp2', name: 'PASS', defaultValue: 'Secure!23', description: 'User password' }
            ],
            steps: [
                { id: 'ms1', action: 'OPEN', target: 'https://nexus-store.com/login', data: '', description: 'Open Login Page' },
                { id: 'ms2', action: 'TYPE', target: 'LoginPage/EmailField', data: '${USER}', description: 'Input Username' },
                { id: 'ms3', action: 'TYPE', target: 'LoginPage/PasswordField', data: '${PASS}', description: 'Input Password' },
                { id: 'ms4', action: 'CLICK', target: 'LoginPage/LoginButton', data: '', description: 'Click Submit' },
                { id: 'ms5', action: 'WAIT', target: '', data: '1000', description: 'Wait for redirect' }
            ]
        },
        {
            id: 'mod_2',
            name: 'Clear Cart',
            description: 'Removes all items from cart',
            params: [],
            steps: [
                 { id: 'ms6', action: 'OPEN', target: 'https://nexus-store.com/cart', data: '', description: 'Go to Cart' },
                 { id: 'ms7', action: 'CLICK', target: 'ShoppingCart/RemoveItem', data: '', description: 'Click Remove (Simulated)' }
            ]
        }
    ],
    pages: [
      {
        id: 'pg1',
        name: 'LoginPage',
        description: 'Customer authentication portal',
        elements: [
          { id: 'el1', name: 'EmailField', selectorType: 'CSS', value: 'input[id="email"]', description: 'Primary email input' },
          { id: 'el2', name: 'PasswordField', selectorType: 'CSS', value: 'input[id="pass"]', description: 'Password input' },
          { id: 'el3', name: 'LoginButton', selectorType: 'getByRole', value: 'button, name=Log In', description: 'Submit credentials' },
          { id: 'el4', name: 'ErrorMessage', selectorType: 'getByTestId', value: 'auth-error', description: 'Alert for invalid login' },
          { id: 'el5', name: 'RememberMeCheckbox', selectorType: 'getByLabel', value: 'Remember me', description: 'Session persistence' },
        ]
      },
      {
        id: 'pg2',
        name: 'ProductListing',
        description: 'Search results and category browsing',
        elements: [
          { id: 'el6', name: 'SearchBar', selectorType: 'getByPlaceholder', value: 'Search for products...', description: 'Global search' },
          { id: 'el7', name: 'ProductCard', selectorType: 'CSS', value: '.product-card', description: 'Container for individual items' },
          { id: 'el8', name: 'SortDropdown', selectorType: 'CSS', value: 'select.sort-options', description: 'Price/Relevance sorter' },
          { id: 'el9', name: 'FilterPrice', selectorType: 'XPath', value: '//div[@class="filters"]//input[@name="min-price"]', description: 'Min price filter' },
        ]
      },
      {
        id: 'pg3',
        name: 'ShoppingCart',
        description: 'User basket and checkout initiation',
        elements: [
          { id: 'el10', name: 'CheckoutButton', selectorType: 'getByRole', value: 'button, name=Proceed to Checkout', description: 'Navigate to payment' },
          { id: 'el11', name: 'CartTotal', selectorType: 'getByTestId', value: 'cart-total-value', description: 'Calculated sum' },
          { id: 'el12', name: 'RemoveItem', selectorType: 'CSS', value: '.btn-remove-item', description: 'Delete item from cart' },
        ]
      }
    ]
  },
  {
    id: 'p2',
    name: 'CRM Internal',
    description: 'Employee-facing dashboard for lead management.',
    modules: [],
    pages: [
      {
        id: 'pg_crm_1',
        name: 'Dashboard',
        description: 'Main metrics overview',
        elements: [
          { id: 'el_crm_1', name: 'NewLeadBtn', selectorType: 'getByRole', value: 'button, name=New Lead', description: 'Open modal' },
          { id: 'el_crm_2', name: 'RevenueGraph', selectorType: 'CSS', value: '#revenue-canvas', description: 'Q3 Earnings Chart' }
        ]
      },
      {
        id: 'pg_crm_2',
        name: 'LeadDetail',
        description: 'Individual lead view',
        elements: [
          { id: 'el_crm_3', name: 'StatusDropdown', selectorType: 'CSS', value: 'select[name="status"]', description: 'Lead progression status' },
          { id: 'el_crm_4', name: 'SaveBtn', selectorType: 'getByText', value: 'Save Changes', description: 'Persist updates' }
        ]
      }
    ]
  }
];

export const MOCK_SUITES: TestSuite[] = [
  {
    id: 's1',
    name: 'Authentication Flow',
    description: 'Verify login, logout, and security limits.',
    variables: [
        { id: 'v1', key: 'URL', value: 'https://nexus-store.com' },
        { id: 'v2', key: 'USER', value: 'admin@nexus.com' },
        { id: 'v3', key: 'PASS', value: 'Secure!23' }
    ],
    dataRows: [
        { URL: 'https://nexus-store.com', USER: 'admin@nexus.com', PASS: 'Secure!23' },
        { URL: 'https://nexus-store.com', USER: 'guest@nexus.com', PASS: 'guest123' }
    ],
    cases: [
      {
        id: 'c1',
        name: 'Valid Login Success',
        description: 'User logs in with valid credentials and is redirected to dashboard.',
        steps: [
          // Pre-filled with correct parameter structure for demo
          { id: 'st_mod_1', action: 'RUN_MODULE', target: 'mod_1', data: '{"USER":"${USER}","PASS":"${PASS}"}', description: 'Execute Standard Login Module' },
          { id: 'st6', action: 'ASSERT_VISIBLE', target: 'ProductListing/SearchBar', data: '', description: 'Verify redirect' }
        ]
      },
      {
        id: 'c2',
        name: 'Invalid Login Rejection',
        description: 'System should reject bad passwords.',
        steps: [
          { id: 'st7', action: 'OPEN', target: '${URL}/login', data: '', description: 'Open login' },
          { id: 'st8', action: 'TYPE', target: 'LoginPage/EmailField', data: '${USER}', description: 'Enter valid email' },
          { id: 'st9', action: 'TYPE', target: 'LoginPage/PasswordField', data: 'WrongPass', description: 'Enter invalid password' },
          { id: 'st10', action: 'CLICK', target: 'LoginPage/LoginButton', data: '', description: 'Submit' },
          { id: 'st11', action: 'ASSERT_TEXT', target: 'LoginPage/ErrorMessage', data: 'Invalid credentials', description: 'Check error msg' }
        ]
      }
    ]
  },
  {
    id: 's2',
    name: 'Order Processing',
    description: 'End-to-end purchasing flows.',
    variables: [
        { id: 'v4', key: 'ITEM', value: 'Wireless Headphones' }
    ],
    cases: [
      {
        id: 'c3',
        name: 'Add to Cart & Checkout',
        description: 'Guest user adds item and proceeds to payment.',
        steps: [
          { id: 'st12', action: 'OPEN', target: 'https://nexus-store.com', data: '', description: 'Go home' },
          { id: 'st13', action: 'TYPE', target: 'ProductListing/SearchBar', data: '${ITEM}', description: 'Search item' },
          { id: 'st14', action: 'CLICK', target: 'ProductListing/ProductCard', data: '', description: 'Click first result' },
          { id: 'st15', action: 'CLICK', target: 'ProductListing/SortDropdown', data: '', description: 'Sort by price (Example action)' },
          { id: 'st16', action: 'WAIT', target: '', data: '500', description: 'Wait for sort' },
          { id: 'st17', action: 'CLICK', target: 'ShoppingCart/CheckoutButton', data: '', description: 'Start checkout' }
        ]
      }
    ]
  },
  {
    id: 's3',
    name: 'API Integration Tests',
    description: 'Backend validation independently of UI.',
    variables: [
        { id: 'v5', key: 'API_URL', value: 'https://api.nexus.com/v1' },
        { id: 'v6', key: 'NEW_USER', value: '{"name":"John", "role":"admin"}' },
        { id: 'v7', key: 'AUTH_TOKEN', value: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' }
    ],
    cases: [
      {
        id: 'c4',
        name: 'User Lifecycle (Endpoint-Based)',
        description: 'Demonstrates using a configured Endpoint (User Service) which switches base URL per environment.',
        steps: [
          { 
            id: 'st18', 
            action: 'API_POST', 
            target: '/create', 
            endpointId: 'e1', // User Service
            headerProfileId: 'h1', // Standard JSON Auth
            bodyTemplateId: 'b1', // Create User Payload
            data: '{"token":"${AUTH_TOKEN}", "username":"test_user_1", "email":"test@example.com", "age":"25"}', 
            description: 'Create User via Endpoint' 
          },
          { 
            id: 'st19', 
            action: 'API_GET', 
            target: '/profile/test_user_1', 
            endpointId: 'e1', // User Service
            headerProfileId: 'h1', 
            data: '{"token":"${AUTH_TOKEN}"}', 
            description: 'Verify User Created' 
          }
        ]
      },
      {
        id: 'c5',
        name: 'External Health Check (Direct URL)',
        description: 'Demonstrates using a Direct URL for a 3rd party service that does not change across environments.',
        steps: [
          { 
            id: 'st20', 
            action: 'API_GET', 
            target: 'https://status.stripe.com/current', 
            data: '', 
            description: 'Check Payment Gateway Status' 
          },
          {
             id: 'st21',
             action: 'ASSERT_TEXT',
             target: 'API_RESPONSE',
             data: 'All Systems Operational',
             description: 'Verify Status'
          }
        ]
      }
    ]
  }
];

import { HeaderProfile, BodyTemplate, ApiEndpoint } from './types';

export const MOCK_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'e1',
    name: 'User Service',
    description: 'Core user management API',
    baseUrls: {
      DEV: 'https://dev-api.nexus-store.com/users',
      SIT: 'https://sit-api.nexus-store.com/users',
      UAT: 'https://uat-api.nexus-store.com/users',
      PROD: 'https://api.nexus-store.com/users'
    }
  },
  {
    id: 'e2',
    name: 'Payment Gateway',
    description: 'External payment processing',
    baseUrls: {
      DEV: 'https://sandbox.payment-provider.com/v1',
      SIT: 'https://sandbox.payment-provider.com/v1',
      UAT: 'https://sandbox.payment-provider.com/v1',
      PROD: 'https://api.payment-provider.com/v1'
    }
  }
];

export const MOCK_HEADERS: HeaderProfile[] = [
  {
    id: 'h1',
    name: 'Standard JSON Auth',
    description: 'Default headers for JSON API with Bearer token',
    headers: [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
      { key: 'Accept', value: 'application/json', enabled: true }
    ]
  },
  {
    id: 'h2',
    name: 'Multipart Upload',
    description: 'Headers for file upload endpoints',
    headers: [
      { key: 'Content-Type', value: 'multipart/form-data', enabled: true },
      { key: 'X-Custom-Trace', value: '{{traceId}}', enabled: true }
    ]
  }
];

export const MOCK_BODIES: BodyTemplate[] = [
  {
    id: 'b1',
    name: 'Create User Payload',
    description: 'Standard user creation body',
    contentType: 'application/json',
    content: JSON.stringify({
      username: "{{username}}",
      email: "{{email}}",
      profile: {
        age: "{{age}}",
        role: "user"
      }
    }, null, 2)
  },
  {
    id: 'b2',
    name: 'Search Query',
    description: 'Elasticsearch style query body',
    contentType: 'application/json',
    content: JSON.stringify({
      query: {
        match: {
          title: "{{searchTerm}}"
        }
      },
      size: 20
    }, null, 2)
  }
];
