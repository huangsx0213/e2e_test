import type {
  ApiEndpoint,
  BodyTemplate,
  DynamicVariable,
  HeaderProfile,
  Project,
  Requirement,
  Settings,
  TestSuite,
} from '../../shared/contracts/index.ts';

export interface SeedEnvironment {
  name: string;
  variables: Record<string, string>;
}

export interface BusinessConfigSeed {
  environments: SeedEnvironment[];
  settings: Settings[];
  projects: Project[];
  suites: TestSuite[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  dynamicVariables: Array<Pick<DynamicVariable, 'id' | 'projectId' | 'name' | 'expression' | 'description' | 'evaluationStrategy'>>;
  requirements: Requirement[];
}

export const businessConfigSeed: BusinessConfigSeed = {
  "environments": [
    {
      "name": "DEV",
      "variables": {}
    },
    {
      "name": "PROD",
      "variables": {}
    }
  ],
  "settings": [
    {
      "id": "global",
      "currentProjectId": "p-aut-demo",
      "currentEnvironment": "DEV",
      "headlessMode": true,
      "viewportWidth": 1920,
      "viewportHeight": 1080,
      "recordVideo": true
    }
  ],
  "projects": [
    {
      "id": "p-sauce-demo",
      "name": "Sauce Labs Demo",
      "description": "E2E test project for https://www.saucedemo.com (Swag Labs) with API Health Checks.",
      "pages": [
        {
          "id": "pg-sauce-login",
          "name": "Login Page",
          "description": "Initial login screen.",
          "elements": [
            {
              "id": "el-sauce-user",
              "name": "Username",
              "selectorType": "getByPlaceholder",
              "value": "Username",
              "description": ""
            },
            {
              "id": "el-sauce-pass",
              "name": "Password",
              "selectorType": "getByPlaceholder",
              "value": "Password",
              "description": ""
            },
            {
              "id": "el-sauce-login-btn",
              "name": "Login Button",
              "selectorType": "CSS",
              "value": "#login-button",
              "description": ""
            }
          ]
        },
        {
          "id": "pg-sauce-products",
          "name": "Products Page",
          "description": "Main inventory list.",
          "elements": [
            {
              "id": "el-sauce-inventory",
              "name": "Inventory List",
              "selectorType": "CSS",
              "value": ".inventory_list",
              "description": ""
            },
            {
              "id": "el-sauce-item-card",
              "name": "Item Card",
              "selectorType": "CSS",
              "value": ".inventory_item",
              "description": ""
            },
            {
              "id": "el-sauce-add-backpack",
              "name": "Add Backpack",
              "selectorType": "CSS",
              "value": "#add-to-cart-sauce-labs-backpack",
              "description": ""
            },
            {
              "id": "el-sauce-cart-badge",
              "name": "Cart Badge",
              "selectorType": "CSS",
              "value": ".shopping_cart_badge",
              "description": ""
            },
            {
              "id": "el-sauce-cart-link",
              "name": "Cart Link",
              "selectorType": "CSS",
              "value": ".shopping_cart_link",
              "description": ""
            }
          ]
        },
        {
          "id": "pg-sauce-cart",
          "name": "Cart Page",
          "description": "Review items in cart.",
          "elements": [
            {
              "id": "el-sauce-checkout-btn",
              "name": "Checkout Button",
              "selectorType": "CSS",
              "value": "#checkout",
              "description": ""
            }
          ]
        },
        {
          "id": "pg-sauce-checkout-1",
          "name": "Checkout Info",
          "description": "Customer information form.",
          "elements": [
            {
              "id": "el-sauce-first-name",
              "name": "First Name",
              "selectorType": "getByPlaceholder",
              "value": "First Name",
              "description": ""
            },
            {
              "id": "el-sauce-last-name",
              "name": "Last Name",
              "selectorType": "getByPlaceholder",
              "value": "Last Name",
              "description": ""
            },
            {
              "id": "el-sauce-zip",
              "name": "Zip Code",
              "selectorType": "getByPlaceholder",
              "value": "Zip/Postal Code",
              "description": ""
            },
            {
              "id": "el-sauce-continue",
              "name": "Continue Button",
              "selectorType": "CSS",
              "value": "#continue",
              "description": ""
            }
          ]
        },
        {
          "id": "pg-sauce-checkout-2",
          "name": "Checkout Overview",
          "description": "Order summary and finish.",
          "elements": [
            {
              "id": "el-sauce-finish",
              "name": "Finish Button",
              "selectorType": "CSS",
              "value": "#finish",
              "description": ""
            }
          ]
        },
        {
          "id": "pg-sauce-complete",
          "name": "Checkout Complete",
          "description": "Confirmation page.",
          "elements": [
            {
              "id": "el-sauce-complete-header",
              "name": "Complete Header",
              "selectorType": "CSS",
              "value": ".complete-header",
              "description": ""
            }
          ]
        }
      ],
      "modules": [
        {
          "id": "mod-sauce-login",
          "name": "Sauce Login",
          "description": "Standard login flow for Sauce Demo.",
          "params": [
            {
              "id": "param-sauce-user",
              "name": "USER",
              "defaultValue": "standard_user",
              "description": ""
            },
            {
              "id": "param-sauce-pass",
              "name": "PASS",
              "defaultValue": "secret_sauce",
              "description": ""
            }
          ],
          "steps": [
            {
              "id": "s-sauce-open",
              "action": "goto",
              "target": "",
              "data": "https://www.saucedemo.com",
              "description": "Open site",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-type-user",
              "action": "fill",
              "target": "Login Page.Username",
              "data": "{{USER}}",
              "description": "",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-type-pass",
              "action": "fill",
              "target": "Login Page.Password",
              "data": "{{PASS}}",
              "description": "",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-click-login",
              "action": "click",
              "target": "Login Page.Login Button",
              "data": "",
              "description": "",
              "screenshot": true,
              "enabled": true
            }
          ]
        },
        {
          "id": "mod-sauce-checkout",
          "name": "Fast Checkout",
          "description": "Fills info and finishes order.",
          "params": [
            {
              "id": "param-sauce-fname",
              "name": "FNAME",
              "defaultValue": "John",
              "description": ""
            },
            {
              "id": "param-sauce-lname",
              "name": "LNAME",
              "defaultValue": "Doe",
              "description": ""
            },
            {
              "id": "param-sauce-zip",
              "name": "ZIP",
              "defaultValue": "12345",
              "description": ""
            }
          ],
          "steps": [
            {
              "id": "s-sauce-type-fname",
              "action": "fill",
              "target": "Checkout Info.First Name",
              "data": "{{FNAME}}",
              "description": "",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-type-lname",
              "action": "fill",
              "target": "Checkout Info.Last Name",
              "data": "{{LNAME}}",
              "description": "",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-type-zip",
              "action": "fill",
              "target": "Checkout Info.Zip Code",
              "data": "{{ZIP}}",
              "description": "",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-click-cont",
              "action": "click",
              "target": "Checkout Info.Continue Button",
              "data": "",
              "description": "",
              "screenshot": false,
              "enabled": true
            },
            {
              "id": "s-sauce-click-finish",
              "action": "click",
              "target": "Checkout Overview.Finish Button",
              "data": "",
              "description": "",
              "screenshot": true,
              "enabled": true
            }
          ]
        }
      ],
      "scenarios": [
        {
          "id": "scenario-sauce-regression",
          "name": "Sauce Basic Regression",
          "description": "Covers login and primary purchase path after API health check.",
          "variables": [],
          "dataRows": [
            {
              "USER_NAME": "standard_user",
              "USER_PASS": "secret_sauce"
            },
            {
              "USER_NAME": "problem_user",
              "USER_PASS": "secret_sauce"
            }
          ],
          "suites": [
            {
              "id": "sc-suite-sauce-api",
              "suiteId": "suite-sauce-api",
              "variableOverrides": {}
            },
            {
              "id": "sc-suite-sauce-e2e",
              "suiteId": "suite-sauce-e2e",
              "variableOverrides": {}
            }
          ]
        },
        {
          "id": "scenario-sauce-inventory",
          "name": "Sauce Inventory Status",
          "description": "Verifies product list and cart persistence with scenario variables.",
          "variables": [
            {
              "id": "v-sc-inv-target",
              "key": "TARGET_USER",
              "value": "standard_user"
            }
          ],
          "dataRows": [
            {
              "TARGET_USER": "standard_user",
              "SORT_OPTION": "Name (A to Z)"
            },
            {
              "TARGET_USER": "problem_user",
              "SORT_OPTION": "Price (low to high)"
            }
          ],
          "suites": [
            {
              "id": "sc-suite-sauce-inv",
              "suiteId": "suite-sauce-inventory",
              "variableOverrides": {}
            }
          ]
        }
      ],
      "plans": [
        {
          "id": "plan-sauce-daily",
          "projectId": "p-sauce-demo",
          "name": "Daily Full Regression",
          "description": "Runs basic regression and API health checks daily.",
          "scenarios": [
            {
              "id": "p-sc-sauce-reg",
              "scenarioId": "scenario-sauce-regression"
            }
          ]
        },
        {
          "id": "plan-sauce-quick-smoke",
          "projectId": "p-sauce-demo",
          "name": "Quick Smoke Check",
          "description": "Rapid verification of inventory and core UI.",
          "scenarios": [
            {
              "id": "p-sc-sauce-inv",
              "scenarioId": "scenario-sauce-inventory"
            }
          ]
        }
      ]
    },
    {
      "id": "p-aut-demo",
      "name": "AUT Demo Application",
      "description": "A demo Application Under Test (AUT) with authentication, user management CRUD, dashboard, and reports for integration testing.",
      "pages": [
        {
          "id": "pg-1779007607929-a05bc633",
          "name": "aut_login",
          "description": "",
          "elements": [
            {
              "id": "el-1779007607929-140227a3",
              "name": "textbox: Username",
              "selectorType": "official",
              "value": "internal:role=textbox[name=\"Username\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/login",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=textbox[name=\"Username\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=textbox[name=\"Username\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=textbox[name=\"Username\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/login",
                  "timestamp": 20618732.502
                }
              }
            },
            {
              "id": "el-1779007611312-f86c5ada",
              "name": "textbox: Password",
              "selectorType": "official",
              "value": "internal:role=textbox[name=\"Password\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/login",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=textbox[name=\"Password\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=textbox[name=\"Password\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=textbox[name=\"Password\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/login",
                  "timestamp": 20621406.409
                }
              }
            },
            {
              "id": "el-1779007611337-941af764",
              "name": "checkbox: Remember me",
              "selectorType": "official",
              "value": "internal:role=checkbox[name=\"Remember me\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/login",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=checkbox[name=\"Remember me\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=checkbox[name=\"Remember me\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=checkbox[name=\"Remember me\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/login",
                  "timestamp": 20624789.438
                }
              }
            },
            {
              "id": "el-1779007613805-84541e5e",
              "name": "button: Sign in",
              "selectorType": "official",
              "value": "internal:role=button[name=\"Sign in\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/login",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=button[name=\"Sign in\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=button[name=\"Sign in\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=button[name=\"Sign in\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/login",
                  "timestamp": 20625525.957
                }
              }
            }
          ]
        },
        {
          "id": "pg-1779007616102-fa9fc603",
          "name": "aut",
          "description": "",
          "elements": [
            {
              "id": "el-1779007616102-18353e59",
              "name": "link: User Management",
              "selectorType": "official",
              "value": "internal:role=link[name=\"User Management\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=link[name=\"User Management\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=link[name=\"User Management\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=link[name=\"User Management\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut",
                  "timestamp": 20627282.562
                }
              }
            }
          ]
        },
        {
          "id": "pg-1779007623949-d39f7863",
          "name": "aut_users",
          "description": "",
          "elements": [
            {
              "id": "el-1779007623949-045edf7a",
              "name": "textbox: Search by name",
              "selectorType": "official",
              "value": "internal:role=textbox[name=\"Search by name\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/users",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=textbox[name=\"Search by name\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=textbox[name=\"Search by name\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=textbox[name=\"Search by name\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/users",
                  "timestamp": 20629579.218
                }
              }
            },
            {
              "id": "el-1779007623974-5a31ac34",
              "name": "label: Filter by role",
              "selectorType": "official",
              "value": "internal:label=\"Filter by role\"i",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/users",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:label=\"Filter by role\"i"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:label=\"Filter by role\"i"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:label=\"Filter by role\"i"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/users",
                  "timestamp": 20637427.292
                }
              }
            },
            {
              "id": "el-1779007626200-eb2a5f0b",
              "name": "label: Filter by status",
              "selectorType": "official",
              "value": "internal:label=\"Filter by status\"i",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/users",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:label=\"Filter by status\"i"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:label=\"Filter by status\"i"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:label=\"Filter by status\"i"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/users",
                  "timestamp": 20639677.962
                }
              }
            },
            {
              "id": "el-1779007629812-c91e3672",
              "name": "button: Apply",
              "selectorType": "official",
              "value": "internal:role=button[name=\"Apply\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/users",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=button[name=\"Apply\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=button[name=\"Apply\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=button[name=\"Apply\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/users",
                  "timestamp": 20640597.365
                }
              }
            },
            {
              "id": "el-1779007632623-bcc609b3",
              "name": "link: Reports",
              "selectorType": "official",
              "value": "internal:role=link[name=\"Reports\"i]",
              "description": "",
              "pageUrl": "http://10.191.111.249:3000/aut/users",
              "metadata": {
                "recorder": {
                  "locator": {
                    "kind": "official",
                    "selector": "internal:role=link[name=\"Reports\"i]"
                  },
                  "locatorCandidates": [
                    {
                      "kind": "official",
                      "selector": "internal:role=link[name=\"Reports\"i]"
                    }
                  ],
                  "legacyLocator": {
                    "selectorType": "official",
                    "value": "internal:role=link[name=\"Reports\"i]"
                  },
                  "framePath": [],
                  "pageUrl": "http://10.191.111.249:3000/aut/users",
                  "timestamp": 20643290.349
                }
              }
            }
          ]
        }
      ],
      "modules": [],
      "scenarios": [
        {
          "id": "scenario-1779009243126",
          "name": "Daily Regression",
          "description": "Daily Regression",
          "variables": [
            {
              "id": "var-import-var-1779009291254-1779009321254-964",
              "key": "user_name",
              "value": ""
            },
            {
              "id": "var-import-var-1779009300086-1779009321254-817",
              "key": "password",
              "value": ""
            }
          ],
          "dataRows": [
            {
              "user_name": "admin",
              "password": "admin123"
            },
            {
              "user_name": "admin",
              "password": "admin124"
            }
          ],
          "suites": [
            {
              "id": "ss-1779009265437",
              "suiteId": "suite-1779006022053",
              "variableOverrides": {}
            },
            {
              "id": "ss-1779009266366",
              "suiteId": "suite-1779009209854",
              "variableOverrides": {}
            }
          ]
        }
      ],
      "plans": [
        {
          "id": "plan-1779009347430",
          "projectId": "p-aut-demo",
          "name": "Daily Test Plan",
          "description": "Daily Test Plan",
          "scenarios": [
            {
              "id": "ps-1779009367973",
              "scenarioId": "scenario-1779009243126"
            }
          ]
        }
      ]
    }
  ],
  "suites": [
    {
      "id": "suite-sauce-api",
      "projectId": "p-sauce-demo",
      "name": "API Health Check (Sauce)",
      "description": "Verifies API connectivity before running UI tests.",
      "position": 0,
      "cases": [
        {
          "id": "case-sauce-api-get",
          "name": "Health GET",
          "description": "Check connectivity via GET.",
          "steps": [
            {
              "id": "s-sauce-api-get",
              "action": "apiGet",
              "target": "/get",
              "data": "",
              "description": "",
              "headerProfileId": "header-sauce-json",
              "endpointId": "endpoint-sauce-httpbin-get",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        },
        {
          "id": "case-sauce-api-post",
          "name": "Health POST",
          "description": "Check connectivity via POST.",
          "steps": [
            {
              "id": "s-sauce-api-post",
              "action": "apiPost",
              "target": "/post",
              "data": "",
              "description": "",
              "headerProfileId": "header-sauce-json",
              "bodyTemplateId": "body-sauce-echo",
              "endpointId": "endpoint-sauce-httpbin-post",
              "screenshot": false,
              "enabled": true,
              "extractors": [
                {
                  "id": "e-post-origin",
                  "name": "ORIGIN_IP",
                  "source": "API_BODY_JSON",
                  "expression": "$.origin",
                  "scope": "CASE"
                }
              ],
              "assertions": [
                {
                  "id": "a-post-status",
                  "source": "API_STATUS",
                  "operator": "EQUALS",
                  "expectedValue": "200"
                },
                {
                  "id": "a-post-body",
                  "source": "API_BODY_JSON",
                  "expression": "$.json.test",
                  "operator": "EQUALS",
                  "expectedValue": "sauce-demo"
                }
              ],
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        },
        {
          "id": "case-sauce-api-post-fail",
          "name": "Health POST (Failing Assertion)",
          "description": "Check connectivity via POST with a failing assertion.",
          "steps": [
            {
              "id": "s-sauce-api-post-fail",
              "action": "apiPost",
              "target": "/post",
              "data": "",
              "description": "",
              "headerProfileId": "header-sauce-json",
              "bodyTemplateId": "body-sauce-echo",
              "endpointId": "endpoint-sauce-httpbin-post",
              "screenshot": false,
              "enabled": true,
              "assertions": [
                {
                  "id": "a-post-status-fail",
                  "source": "API_STATUS",
                  "operator": "EQUALS",
                  "expectedValue": "200"
                },
                {
                  "id": "a-post-body-fail",
                  "source": "API_BODY_JSON",
                  "expression": "$.json.test",
                  "operator": "EQUALS",
                  "expectedValue": "wrong-value"
                }
              ],
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        }
      ],
      "variables": [
        {
          "id": "v-sauce-api-base",
          "key": "API_BASE",
          "value": "https://httpbin.org"
        }
      ],
      "dataRows": [],
      "setupSteps": [],
      "teardownSteps": []
    },
    {
      "id": "suite-sauce-e2e",
      "projectId": "p-sauce-demo",
      "name": "Sauce E2E Purchase Flow",
      "description": "Comprehensive test from login to order confirmation.",
      "position": 0,
      "cases": [
        {
          "id": "case-sauce-login",
          "name": "User Login",
          "description": "Verification of successful login.",
          "steps": [
            {
              "id": "step-sauce-login-mod",
              "action": "runModule",
              "target": "mod-sauce-login",
              "data": "{\"USER\":\"{{USER_NAME}}\",\"PASS\":\"{{USER_PASS}}\"}",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-sauce-assert-inv",
              "action": "assertVisible",
              "target": "Products Page.Inventory List",
              "data": "",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        },
        {
          "id": "case-sauce-add-to-cart",
          "name": "Add and Checkout",
          "description": "Adds backpack to cart and completes checkout.",
          "steps": [
            {
              "id": "step-sauce-add-bp",
              "action": "click",
              "target": "Products Page.Add Backpack",
              "data": "",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-sauce-assert-badge",
              "action": "assertText",
              "target": "Products Page.Cart Badge",
              "data": "1",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-sauce-goto-cart",
              "action": "click",
              "target": "Products Page.Cart Link",
              "data": "",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-sauce-click-checkout",
              "action": "click",
              "target": "Cart Page.Checkout Button",
              "data": "",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-sauce-checkout-mod",
              "action": "runModule",
              "target": "mod-sauce-checkout",
              "data": "{\"FNAME\":\"Tester\",\"LNAME\":\"Auto\",\"ZIP\":\"90001\"}",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-sauce-assert-complete",
              "action": "assertText",
              "target": "Checkout Complete.Complete Header",
              "data": "Thank you for your order!",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        }
      ],
      "variables": [
        {
          "id": "v-sauce-user",
          "key": "USER_NAME",
          "value": "standard_user"
        },
        {
          "id": "v-sauce-pass",
          "key": "USER_PASS",
          "value": "secret_sauce"
        }
      ],
      "dataRows": [
        {
          "USER_NAME": "standard_user",
          "USER_PASS": "secret_sauce"
        },
        {
          "USER_NAME": "problem_user",
          "USER_PASS": "secret_sauce"
        }
      ],
      "setupSteps": [],
      "teardownSteps": []
    },
    {
      "id": "suite-sauce-inventory",
      "projectId": "p-sauce-demo",
      "name": "Inventory Verification",
      "description": "Checks product list state and basic UI components.",
      "position": 0,
      "cases": [
        {
          "id": "case-sauce-verify-list",
          "name": "Verify Products Loaded",
          "description": "Asserts that item cards are visible after login.",
          "steps": [
            {
              "id": "s-sauce-inv-login",
              "action": "runModule",
              "target": "mod-sauce-login",
              "data": "{\"USER\":\"{{TARGET_USER}}\",\"PASS\":\"secret_sauce\"}",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "s-sauce-assert-items",
              "action": "assertVisible",
              "target": "Products Page.Item Card",
              "data": "",
              "description": "",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        }
      ],
      "variables": [],
      "dataRows": [],
      "setupSteps": [],
      "teardownSteps": []
    },
    {
      "id": "suite-1779006022053",
      "projectId": "p-aut-demo",
      "name": "Recording API Cases",
      "description": "",
      "position": 0,
      "cases": [
        {
          "id": "case-1779006042349",
          "name": "Login with api",
          "description": "",
          "steps": [
            {
              "id": "step-1779006072778-77eccbeb",
              "action": "apiPost",
              "target": "/aut-api/auth/login",
              "data": "",
              "description": "aut-api_auth_login.POST /aut-api/auth/login",
              "headerProfileId": "hp-1779006072763-3a9bec18",
              "bodyTemplateId": "bt-1779006072772-295ed5af",
              "endpointId": "ep-1779006072753-01812042",
              "screenshot": false,
              "enabled": true,
              "assertions": [
                {
                  "id": "ast-1779006072778-68d1e1c0",
                  "source": "API_STATUS",
                  "operator": "EQUALS",
                  "expectedValue": "200"
                },
                {
                  "id": "274625b4-7d6e-4d1d-80cd-88e50f9caeb6",
                  "source": "API_BODY_JSON",
                  "expression": "$.success",
                  "operator": "EQUALS",
                  "expectedValue": "true"
                }
              ],
              "metadata": {}
            },
            {
              "id": "step-1779006072877-699b4527",
              "action": "apiGet",
              "target": "/aut-api/dashboard/stats",
              "data": "",
              "description": "aut-api_dashboard_stats.GET /aut-api/dashboard/stats",
              "endpointId": "ep-1779006072870-62870e20",
              "screenshot": false,
              "enabled": true,
              "extractors": [
                {
                  "id": "858d6b75-ac08-4c52-87a3-7bc294f3abdd",
                  "name": "is_success",
                  "source": "API_BODY_JSON",
                  "expression": "$.success",
                  "scope": "SUITE"
                }
              ],
              "assertions": [
                {
                  "id": "ast-1779006072877-4b1e9f5f",
                  "source": "API_STATUS",
                  "operator": "EQUALS",
                  "expectedValue": "200"
                }
              ],
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        }
      ],
      "variables": [],
      "dataRows": [],
      "setupSteps": [],
      "teardownSteps": []
    },
    {
      "id": "suite-1779009209854",
      "projectId": "p-aut-demo",
      "name": "Recording UI Cases",
      "description": "",
      "position": 1,
      "cases": [
        {
          "id": "case-1779009220662",
          "name": "Login with ui",
          "description": "",
          "steps": [
            {
              "id": "step-1779009220662-0",
              "action": "goto",
              "target": "",
              "data": "http://10.191.111.249:3000/aut/login",
              "description": "Navigated to http://10.191.111.249:3000/aut/login",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-1",
              "action": "fill",
              "target": "aut_login.textbox: Username",
              "data": "admin",
              "description": "Type \"admin\" into textbox: Username",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-2",
              "action": "fill",
              "target": "aut_login.textbox: Password",
              "data": "admin123",
              "description": "Type \"admin123\" into textbox: Password",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-3",
              "action": "check",
              "target": "aut_login.checkbox: Remember me",
              "data": "",
              "description": "Check checkbox: Remember me",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-4",
              "action": "click",
              "target": "aut_login.button: Sign in",
              "data": "",
              "description": "Click on button: Sign in",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-5",
              "action": "click",
              "target": "aut.link: User Management",
              "data": "",
              "description": "Click on link: User Management",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-6",
              "action": "fill",
              "target": "aut_users.textbox: Search by name",
              "data": "Vick Huang",
              "description": "Type \"Vick Huang\" into textbox: Search by name",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-7",
              "action": "selectOption",
              "target": "aut_users.label: Filter by role",
              "data": "admin",
              "description": "Select \"admin\" in label: Filter by role",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-8",
              "action": "selectOption",
              "target": "aut_users.label: Filter by status",
              "data": "active",
              "description": "Select \"active\" in label: Filter by status",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-9",
              "action": "click",
              "target": "aut_users.button: Apply",
              "data": "",
              "description": "Click on button: Apply",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            },
            {
              "id": "step-1779009220662-10",
              "action": "click",
              "target": "aut_users.link: Reports",
              "data": "",
              "description": "Click on link: Reports",
              "screenshot": false,
              "enabled": true,
              "metadata": {}
            }
          ],
          "setupSteps": [],
          "teardownSteps": []
        }
      ],
      "variables": [
        {
          "id": "var-1779009291254",
          "key": "user_name",
          "value": ""
        },
        {
          "id": "var-1779009300086",
          "key": "password",
          "value": ""
        }
      ],
      "dataRows": [
        {
          "user_name": "admin",
          "password": "admin123"
        }
      ],
      "setupSteps": [],
      "teardownSteps": []
    }
  ],
  "headers": [
    {
      "id": "header-sauce-json",
      "projectId": "p-sauce-demo",
      "name": "JSON Headers",
      "description": "Standard JSON headers for API tests.",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/json",
          "enabled": true
        },
        {
          "key": "Accept",
          "value": "application/json",
          "enabled": true
        }
      ]
    },
    {
      "id": "hp-1779006072763-3a9bec18",
      "projectId": "p-aut-demo",
      "name": "POST /auth/login (Headers)",
      "description": "",
      "headers": [
        {
          "key": "content-type",
          "value": "application/json",
          "enabled": true
        }
      ]
    }
  ],
  "bodies": [
    {
      "id": "body-sauce-echo",
      "projectId": "p-sauce-demo",
      "name": "Health Echo Body",
      "description": "Simple echo body.",
      "contentType": "application/json",
      "content": "{\"test\":\"sauce-demo\",\"timestamp\":\"{{TIMESTAMP}}\"}",
      "defaultValues": {
        "TIMESTAMP": "2026-05-17T08:17:20.780Z"
      }
    },
    {
      "id": "bt-1779006072772-295ed5af",
      "projectId": "p-aut-demo",
      "name": "POST /auth/login (Body)",
      "description": "",
      "contentType": "application/json",
      "content": "{\n  \"username\": \"admin\",\n  \"password\": \"admin123\"\n}",
      "defaultValues": {}
    }
  ],
  "endpoints": [
    {
      "id": "endpoint-sauce-httpbin-get",
      "projectId": "p-sauce-demo",
      "name": "httpbin GET",
      "description": "Public echo API.",
      "method": "GET",
      "baseUrls": {
        "DEV": "https://httpbin.org",
        "PROD": "https://httpbin.org"
      },
      "parameters": [
        {
          "key": "source",
          "value": "sauce_demo",
          "enabled": true
        }
      ]
    },
    {
      "id": "endpoint-sauce-httpbin-post",
      "projectId": "p-sauce-demo",
      "name": "httpbin POST",
      "description": "Public echo API.",
      "method": "POST",
      "baseUrls": {
        "DEV": "https://httpbin.org",
        "PROD": "https://httpbin.org"
      },
      "parameters": []
    },
    {
      "id": "ep-1779006072753-01812042",
      "projectId": "p-aut-demo",
      "name": "[POST] /aut-api/auth/login",
      "description": "",
      "method": "POST",
      "baseUrls": {
        "DEV": "http://10.191.111.249:3000"
      },
      "parameters": []
    },
    {
      "id": "ep-1779006072870-62870e20",
      "projectId": "p-aut-demo",
      "name": "[GET] /aut-api/dashboard/stats",
      "description": "",
      "method": "GET",
      "baseUrls": {
        "DEV": "http://10.191.111.249:3000"
      },
      "parameters": []
    }
  ],
  "dynamicVariables": [],
  "requirements": [
    {
      "id": "req-aut-auth",
      "projectId": "p-aut-demo",
      "title": "Authentication System",
      "description": "",
      "dependencies": [],
      "level": "epic",
      "priority": "MEDIUM",
      "status": "DRAFT",
      "tags": [],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth",
      "title": "Login Page UI & UX",
      "description": "The login page provides a user-friendly authentication interface with form validation and password visibility toggle.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-form",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui",
      "title": "Login Form Display",
      "description": "The login form must render correctly with all required fields and controls.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-form-display",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui-form",
      "title": "Display login form with username and password fields",
      "description": "The login form must render username input with user icon, password input with lock icon, and submit button.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "DRAFT",
      "tags": [],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-form-loading",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui-form",
      "title": "Disable submit button and show loading state during authentication",
      "description": "When login request is in progress, the submit button must be disabled and display \"Signing in...\" text.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "DRAFT",
      "tags": [],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard",
      "projectId": "p-aut-demo",
      "title": "Dashboard",
      "description": "",
      "dependencies": [],
      "level": "epic",
      "priority": "MEDIUM",
      "status": "DRAFT",
      "tags": [],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth",
      "title": "Login Authentication API",
      "description": "The authentication API validates credentials and returns a token for session management.",
      "dependencies": [],
      "level": "feature",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-api",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard",
      "title": "Dashboard Statistics API",
      "description": "The dashboard fetches real-time statistics from the server.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-validation",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui",
      "title": "Form Validation & UX",
      "description": "The login form must validate input and provide good user experience with password visibility and utility controls.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api-errors",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-api",
      "title": "Error Handling",
      "description": "Invalid credentials and network failures must be handled gracefully with appropriate error messages.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-validation-toggle",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui-validation",
      "title": "Toggle password visibility with eye icon",
      "description": "The password field must have a toggle button to show/hide password text using Eye/EyeOff icons.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api-errors-network",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-api-errors",
      "title": "Handle network errors gracefully",
      "description": "If the login request fails due to network error, display \"Network error occurred\" message.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt",
      "projectId": "p-aut-demo",
      "title": "User Management",
      "description": "",
      "dependencies": [],
      "level": "epic",
      "priority": "MEDIUM",
      "status": "DRAFT",
      "tags": [],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "Advanced User Form",
      "description": "A comprehensive form with rich controls including cascading department selector, permissions, drag-and-drop upload, and more.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-security",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form",
      "title": "Security Settings",
      "description": "The form must configure security-related settings with various control types.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-validation-remember",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui-validation",
      "title": "Show Remember me checkbox and Forgot password link",
      "description": "The form must include a \"Remember me\" checkbox and a \"Forgot password?\" link below the password field.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-security-avatar",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form-security",
      "title": "Avatar upload via drag-and-drop",
      "description": "A drag-and-drop zone must accept image files for avatar upload, showing the filename after selection.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-reports",
      "projectId": "p-aut-demo",
      "title": "Reports & Analytics",
      "description": "Visual data reports including charts for user role distribution and department distribution.",
      "dependencies": [],
      "level": "epic",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports"
      ],
      "position": 3,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-edit",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "Edit User",
      "description": "Edit existing user details through the advanced form pre-filled with current data.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 3,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-api",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports",
      "title": "Reports Data API",
      "description": "API endpoint serving aggregated report data for charts and metrics.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "api"
      ],
      "position": 3,
      "metadata": {}
    },
    {
      "id": "req-aut-fault",
      "projectId": "p-aut-demo",
      "title": "Fault Injection & Testing Utilities",
      "description": "Endpoints designed for testing error handling, timeouts, and content type variations in automated tests.",
      "dependencies": [],
      "level": "epic",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection"
      ],
      "position": 4,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-delete",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "Delete User",
      "description": "Delete individual users with confirmation.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 4,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "Batch Operations",
      "description": "Perform bulk actions on multiple selected users simultaneously.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 5,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "User Action Utilities",
      "description": "Additional user actions including view details, export, password reset, and account suspension.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management"
      ],
      "position": 6,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "User Management API",
      "description": "RESTful API endpoints for all user CRUD operations, batch operations, and utility actions.",
      "dependencies": [],
      "level": "feature",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api",
        "crud"
      ],
      "position": 7,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-stats",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports",
      "title": "Reports Stat Cards",
      "description": "Summary metric cards displayed at the top of the reports page.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-timeout",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault",
      "title": "Timeout Simulation",
      "description": "Simulates a slow API response for testing timeout handling.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-ui",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard",
      "title": "Dashboard Home Page",
      "description": "The dashboard landing page displays key metrics and navigation to other sections.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "User List View",
      "description": "The user list displays all users in a table with sorting, filtering, pagination, and loading states.",
      "dependencies": [],
      "level": "feature",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api-success",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-api",
      "title": "Successful Authentication",
      "description": "Valid credentials must be accepted and result in a successful login with token.",
      "dependencies": [],
      "level": "story",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-api-fetch",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-api",
      "title": "Data Fetching",
      "description": "The dashboard API must return aggregated statistics from the user database.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-personal",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form",
      "title": "Personal Details",
      "description": "The advanced form must capture basic personal information.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-edit-flow",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-edit",
      "title": "Edit Flow",
      "description": "Editing a user must pre-load existing data into the form.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-delete-flow",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-delete",
      "title": "Deletion Flow",
      "description": "Deleting a user must require confirmation before proceeding.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-select",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch",
      "title": "Multi-Select",
      "description": "Users must be selectable individually or in bulk via checkboxes.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions-profile",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-actions",
      "title": "Profile & Export",
      "description": "Users can view detailed profiles and export data.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-list",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api",
      "title": "List & Query",
      "description": "The API must support querying users with filtering, sorting, and pagination.",
      "dependencies": [],
      "level": "story",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-stats-metrics",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-stats",
      "title": "Metric Display",
      "description": "The reports page must show key metrics as summary cards.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-api-aggregation",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-api",
      "title": "Data Aggregation",
      "description": "The reports API must aggregate user data into chart-friendly formats.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-timeout-delay",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault-timeout",
      "title": "Delayed Response",
      "description": "A configurable delay endpoint for testing client timeout behavior.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-ui-welcome",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-ui",
      "title": "Welcome & Navigation",
      "description": "The dashboard must greet the user and provide quick links to major sections.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-table",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list",
      "title": "Table Display & Sorting",
      "description": "The user table must display data with sortable columns for easy browsing.",
      "dependencies": [],
      "level": "story",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-ui-validation-empty",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-ui-validation",
      "title": "Show validation error for empty fields",
      "description": "When username or password is empty on submit, display error message \"Please fill in all required fields.\"",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api-success-valid",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-api-success",
      "title": "Authenticate with admin/admin123 credentials",
      "description": "POST /aut-api/auth/login with username \"admin\" and password \"admin123\" must return success with a JWT token.",
      "dependencies": [],
      "level": "ac",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api-errors-invalid",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-api-errors",
      "title": "Return 401 for invalid credentials",
      "description": "POST /aut-api/auth/login with wrong credentials must return status 401 with error message \"Invalid credentials\".",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-api-fetch-stats",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-api-fetch",
      "title": "GET /aut-api/dashboard/stats returns user statistics",
      "description": "The API must return totalUsers count, activeUsers count, and recentRegistrations list from the user database.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-personal-fields",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form-personal",
      "title": "Personal details section with name, email, and biography",
      "description": "The Personal Details section must include Full Name, Email Address, and Biography textarea fields.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-security-permissions",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form-security",
      "title": "System permissions via checkboxes and access level slider",
      "description": "The Security section must include permission checkboxes (view_reports, manage_users, billing_access, api_access) and a 1-5 range slider for access level.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-edit-flow-preload",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-edit-flow",
      "title": "Pre-fill form with existing user data on edit",
      "description": "Clicking the edit button must open the advanced form with all fields populated from the selected user record.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-delete-flow-confirm",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-delete-flow",
      "title": "Show confirmation dialog before single delete",
      "description": "Clicking the delete action button must show a browser confirm dialog before performing the delete request.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-select-checkboxes",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch-select",
      "title": "Select all or individual users via checkboxes",
      "description": "A header checkbox must select/deselect all visible users. Individual row checkboxes allow selective multi-select.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions-profile-view",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-actions-profile",
      "title": "View user profile details in read-only modal",
      "description": "Clicking the eye icon must open a detailed read-only view of user profile with all fields displayed.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-list-endpoint",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api-list",
      "title": "GET /aut-api/users returns paginated, filterable, sortable list",
      "description": "The endpoint must accept query params: name, role, status, search, page, limit, sortBy, sortOrder and return paginated results with total count.",
      "dependencies": [],
      "level": "ac",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-stats-metrics-cards",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-stats-metrics",
      "title": "Display stat cards for Total Users, Active Accounts, Admins, and Engagement Rate",
      "description": "Four metric cards must show: total user count, active account count, admin count, and engagement rate percentage.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-api-aggregation-endpoint",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-api-aggregation",
      "title": "GET /aut-api/reports returns aggregated report data",
      "description": "The endpoint must return totalUsers, activeUsers, roleDistribution array, and departmentDistribution array computed from the user database.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-timeout-delay-endpoint",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault-timeout-delay",
      "title": "GET /aut-api/fault/timeout returns response after 5-second delay",
      "description": "The endpoint must delay the response by 5000ms before returning a success JSON response.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-ui-welcome-greeting",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-ui-welcome",
      "title": "Display welcome message for authenticated user",
      "description": "The dashboard must display \"Welcome back, Admin!\" heading with a descriptive subtitle.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-table-display",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list-table",
      "title": "Display user table with Name, Email, Role, Status, and date columns",
      "description": "The table must show columns: Name, Email, Role, Status (with colored badge), Created At, Last Modified, and Actions.",
      "dependencies": [],
      "level": "ac",
      "priority": "CRITICAL",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-role-chart",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports",
      "title": "Role Distribution Chart",
      "description": "A donut pie chart visualizing users by their assigned role.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-error",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault",
      "title": "Error Simulation",
      "description": "Simulates server errors for testing error handling logic.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-quick-add",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt",
      "title": "Quick Add User",
      "description": "A simple modal form for quickly creating a new user with basic fields.",
      "dependencies": [],
      "level": "feature",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-job",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form",
      "title": "Job Configuration",
      "description": "The form must capture job-related details with rich controls.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-actions",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch",
      "title": "Batch Actions",
      "description": "Batch operations must support status updates and deletion.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions-admin",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-actions",
      "title": "Admin Utilities",
      "description": "Administrative actions for user account management.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-crud",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api",
      "title": "Create & Update",
      "description": "The API must support creating and updating user records.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-ui-stats",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-ui",
      "title": "Statistics Display",
      "description": "The dashboard must display real-time system metrics in stat cards.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-filter",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list",
      "title": "Filtering",
      "description": "Users must be filterable by text search and dropdown selections.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-auth-login-api-success-token",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-auth-login-api-success",
      "title": "Store token in localStorage and redirect to dashboard",
      "description": "On successful login, the token must be stored as \"aut_token\" in localStorage and navigate to /aut.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "authentication",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-job-dates",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form-job",
      "title": "Contract period date range picker",
      "description": "The Job Details section must include start date and end date native date inputs with a \"to\" separator.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-security-2fa",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form-security",
      "title": "Two-factor authentication toggle switch",
      "description": "A toggle switch must allow enabling/disabling two-factor authentication with a styled sliding control.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-select-bar",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch-select",
      "title": "Show batch action bar with selected count",
      "description": "When users are selected, a batch action bar must appear showing the count badge, Activate/Deactivate buttons, and Delete Selected button.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-actions-delete",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch-actions",
      "title": "Batch delete selected users with confirmation",
      "description": "\"Delete Selected\" must show a confirmation dialog with the count of users to be deleted before sending batch delete request.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions-profile-export",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-actions-profile",
      "title": "Export user data as downloadable JSON file",
      "description": "The More Options menu must include an export action that downloads user data as a JSON file.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions-admin-suspend",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-actions-admin",
      "title": "Suspend user account with confirmation",
      "description": "The More Options menu must include a suspend action that sets user status to inactive after confirmation.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-crud-update",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api-crud",
      "title": "PUT and PATCH /aut-api/users/:id for updates",
      "description": "PUT must replace all fields. PATCH must support partial update. Both must update the updatedAt timestamp.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-ui-welcome-nav",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-ui-welcome",
      "title": "Provide navigation links to Users and Reports pages",
      "description": "The dashboard must have a \"Manage Users\" button linking to /aut/users and a \"View Reports\" button linking to /aut/reports.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-table-sort",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list-table",
      "title": "Sort users by clicking column headers",
      "description": "Clicking Name, Email, Role, Status, Created At, or Last Modified headers must toggle ascending/descending sort with visual indicator.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-dept-chart",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports",
      "title": "Department Distribution Chart",
      "description": "A bar chart displaying user count per department.",
      "dependencies": [],
      "level": "feature",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-xml",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault",
      "title": "XML Content Type Response",
      "description": "Returns XML formatted response for testing content type handling.",
      "dependencies": [],
      "level": "feature",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-batch",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api",
      "title": "Delete & Batch",
      "description": "The API must support single/batch deletion and batch updates.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-pagination",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list",
      "title": "Pagination & Loading",
      "description": "The table must paginate results and show appropriate loading states.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-actions-mixed",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch-actions",
      "title": "Handle mixed status selection gracefully",
      "description": "When selected users have mixed active/inactive statuses, show warning badge and disable batch status update buttons.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-pagination-empty",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list-pagination",
      "title": "Display empty state when no users match filters",
      "description": "When no users are found, the table must display \"No users found\" message spanning all columns.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 2,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-role-chart-pie",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-role-chart",
      "title": "Pie Chart Visualization",
      "description": "The role distribution must be visualized as an interactive donut chart.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-dept-chart-bar",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-dept-chart",
      "title": "Bar Chart Visualization",
      "description": "The department distribution must be visualized as an interactive bar chart.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-error-500",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault-error",
      "title": "Server Error Testing",
      "description": "An endpoint that randomly returns 500 errors for testing error recovery.",
      "dependencies": [],
      "level": "story",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-xml-content",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault-xml",
      "title": "Content Type Testing",
      "description": "An endpoint that returns XML instead of JSON for testing content negotiation.",
      "dependencies": [],
      "level": "story",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-quick-add-form",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-quick-add",
      "title": "Simple Creation Form",
      "description": "The Quick Add modal provides a minimal form for rapid user creation.",
      "dependencies": [],
      "level": "story",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-advanced-form-job-cascader",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-advanced-form-job",
      "title": "Cascading department tree selector",
      "description": "The department selector must support 3-level cascading: Development > Frontend/Backend > React/Vue/Node.js/Python, and Design > UI Design/UX Research.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-batch-actions-activate",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-batch-actions",
      "title": "Batch activate or deactivate selected users",
      "description": "\"Activate All\" must set status to active for all selected inactive users. \"Deactivate All\" must set status to inactive for selected active users.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-actions-admin-pw-reset",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-actions-admin",
      "title": "Trigger password reset email",
      "description": "The More Options menu must include a password reset action that calls POST /aut-api/users/:id/reset-password.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-crud-create",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api-crud",
      "title": "POST /aut-api/users creates user with name/email validation",
      "description": "The endpoint must validate that name and email are required strings, return 400 with error message if validation fails.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-batch-delete",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api-batch",
      "title": "DELETE endpoints for single and batch removal",
      "description": "DELETE /aut-api/users/:id removes single user. POST /aut-api/users/batch-delete removes multiple users by ID array.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-role-chart-pie-display",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-role-chart-pie",
      "title": "Display donut pie chart of users grouped by role with legend",
      "description": "The pie chart must show admin, editor, and viewer segments with different colors. A legend must show role names with corresponding colors.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-reports-dept-chart-bar-display",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-reports-dept-chart-bar",
      "title": "Display bar chart of users per department with tooltip",
      "description": "A bar chart must show department names on X-axis and user counts on Y-axis with hover tooltips for exact values.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "reports",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-error-500-endpoint",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault-error-500",
      "title": "GET /aut-api/fault/simulate-500 returns 500 error with 50% probability",
      "description": "The endpoint must return HTTP 500 with error message 50% of the time, and success the other 50%.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-fault-xml-content-endpoint",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-fault-xml-content",
      "title": "GET /aut-api/fault/xml-content returns XML with proper content type",
      "description": "The endpoint must return XML formatted response with Content-Type header set to application/xml.",
      "dependencies": [],
      "level": "ac",
      "priority": "LOW",
      "status": "APPROVED",
      "tags": [
        "fault-injection",
        "api"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-dashboard-home-ui-stats-cards",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-dashboard-home-ui-stats",
      "title": "Show stat cards for Total Users, Active Sessions, and System Status",
      "description": "Three stat cards must display: total user count, active users count (with green dot), and system status with pulsing online indicator.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "dashboard",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-filter-inputs",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list-filter",
      "title": "Filter users by name search, role dropdown, and status dropdown",
      "description": "Users must be filterable by: text search on name, role selection (All/Admin/Editor/Viewer), and status selection (All/Active/Inactive).",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-pagination-nav",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list-pagination",
      "title": "Support pagination with page number buttons and navigation",
      "description": "The table must paginate results (10 per page) with page number buttons, previous/next arrows, and \"X to Y of Z\" record count text.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-quick-add-form-modal",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-quick-add-form",
      "title": "Open modal form with name, email, role, and status fields",
      "description": "The Quick Add modal must contain: Full Name (required), Email (required), Role dropdown, and Status dropdown with Cancel/Save buttons.",
      "dependencies": [],
      "level": "ac",
      "priority": "HIGH",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "crud"
      ],
      "position": 0,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-api-batch-update",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-api-batch",
      "title": "POST /aut-api/users/batch-update for mass updates",
      "description": "The endpoint must accept { ids: number[], data: object } and apply the data update to all specified users.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "api"
      ],
      "position": 1,
      "metadata": {}
    },
    {
      "id": "req-aut-user-mgmt-list-pagination-loading",
      "projectId": "p-aut-demo",
      "parentId": "req-aut-user-mgmt-list-pagination",
      "title": "Show loading skeleton and syncing overlay",
      "description": "Initial load must show animated skeleton rows. Subsequent fetches show a \"Syncing Data...\" overlay with spinner.",
      "dependencies": [],
      "level": "ac",
      "priority": "MEDIUM",
      "status": "APPROVED",
      "tags": [
        "user-management",
        "ui"
      ],
      "position": 1,
      "metadata": {}
    }
  ]
};
