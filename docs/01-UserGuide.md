# QuantumQA User Guide

QuantumQA is a unified, low-code E2E testing platform for deterministic UI and API automation. This guide covers everything you need to author, execute, and manage tests.

---

## 1. Getting Started

### Prerequisites

- Node.js v18 or higher
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd e2e_test

# Install dependencies
npm install

# Install Playwright browser binaries
npx playwright install chromium
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The dev server provides:
- **Express API** on port 3000
- **Vite HMR** for instant frontend updates
- **WebSocket** for real-time agent and recording communication

### Useful Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Full-stack development server |
| `npm run build` | Production build (Vite + esbuild) |
| `npm run start` | Start production server |
| `npm run seed` | Reset database to demo data |
| `npm run start-agent` | Start a local agent process |
| `FORCE_SEED=true npm run dev` | Start dev with clean database |

---

## 2. Core Concepts

### Domain Model

QuantumQA organizes test assets in a clear hierarchy:

```
Project (root container)
├── Pages & Elements (Page Object Model)
├── Modules (reusable parameterized step groups)
├── Scenarios (ordered suite compositions with variable overrides)
├── Plans (ordered scenario compositions)
└── Dynamic Variables (expression-based variables)

TestSuite (primary authoring unit)
├── Cases (individual tests)
│   ├── Steps (main, setup, teardown)
│   ├── Extractors (capture runtime values)
│   └── Assertions (validate results)
├── Variables (key-value pairs)
└── Data Rows (data-driven test iterations)

API Assets (cross-project reusable)
├── Endpoints (per-environment base URLs + parameters)
├── Header Profiles (reusable HTTP header sets)
└── Body Templates (reusable request bodies with content type)
```

### Project & Environment

- **Project**: The top-level organizational unit. Each project owns its pages, modules, scenarios, and plans.
- **Environment**: Workspace-global named slots (e.g., `PROD`, `DEV`, `STAGING`). Each environment stores key-value variables. API endpoints have per-environment base URLs.

Select your active project and environment in **Settings**.

---

## 3. Writing Tests

### 3.1 Creating a Suite

A **Test Suite** is the primary authoring unit. It contains one or more test cases, each with a sequence of steps.

1. Navigate to the **Tests** feature
2. Click **Create Suite**
3. Give it a name and description
4. Add **Cases** with steps, setup steps, and teardown steps
5. Optionally add **Variables** and **Data Rows** for data-driven testing

### 3.2 Test Steps

Each step has the following fields:

| Field | Required | Description |
| :--- | :--- | :--- |
| `action` | Yes | The action type (e.g., `CLICK`, `API_GET`) |
| `target` | Varies | Element selector or `PageName.ElementName` reference |
| `data` | Varies | Action payload (URL, text, key name, etc.) |
| `description` | No | Human-readable description |
| `enabled` | No | If `false`, step is skipped (default `true`) |
| `screenshot` | No | Capture screenshot after step |
| `extractors` | No | Variable extractors to run after step |
| `assertions` | No | Assertions to evaluate after step |
| `waitForNetwork` | No | Wait for a specific network response |
| `networkMocks` | No | Mock/intercept network requests |

### 3.3 UI Step Actions

#### Navigation & Waiting

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `OPEN` | — | URL | Navigate browser to a URL |
| `WAIT` | — | Milliseconds (default 1000) | Fixed delay |
| `WAIT_FOR_VISIBLE` | Element | — | Wait until element is visible |
| `WAIT_FOR_INVISIBLE` | Element | — | Wait until element is hidden |
| `WAIT_FOR_NAVIGATION` | — | Optional URL substring | Wait for page navigation to complete |

#### Mouse Actions

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `CLICK` | Element | — | Click an element |
| `DOUBLE_CLICK` | Element | — | Double-click an element |
| `RIGHT_CLICK` | Element | — | Right-click an element |
| `HOVER` | Element | — | Hover over an element |

#### Input Actions

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `TYPE` | Element | Text to type | Clear field and type text |
| `CLEAR` | Element | — | Clear an input field |
| `SELECT_OPTION` | Element | Option value | Select a dropdown option |
| `PRESS_KEY` | Element (optional) | Key name (e.g., `Enter`) | Press a keyboard key |
| `CHECK` | Element | — | Check a checkbox/radio |
| `UNCHECK` | Element | — | Uncheck a checkbox |
| `TOGGLE` | Element | — | Toggle checkbox state |
| `ATTACH_FILE` | Element | Comma-separated file paths | Attach file(s) to file input |

#### Visual & Scroll

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `HIGHLIGHT` | Element | — | Flash-highlight an element |
| `SCROLL_TO` | Element | — | Scroll element into view |

#### UI Assertions

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `ASSERT_VISIBLE` | Element | — | Assert element is visible |
| `ASSERT_INVISIBLE` | Element | — | Assert element is hidden |
| `ASSERT_DISABLED` | Element | — | Assert element is disabled |
| `ASSERT_TEXT` | Element | Expected text substring | Assert element text contains value |
| `ASSERT_VALUE` | Element | Expected input value | Assert input value equals value |
| `ASSERT_URL` | — | URL substring | Assert page URL contains value |
| `ASSERT_TITLE` | — | Title substring | Assert page title contains value |

#### Variable Extraction & JavaScript

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `EXTRACT_VAR` | Element | Variable key name | Store element text as a variable |
| `UI_EXTRACT` | Element | — | Touch element; use extractors for capture |
| `EVALUATE_JS` | — | JavaScript code | Execute JS in browser; return value stored |

#### Window, Frame & Dialog

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `SWITCH_TO_WINDOW` | — | URL or title match string | Switch browser focus to a tab |
| `SWITCH_TO_FRAME` | Frame selector | — | Switch into an iframe |
| `ACCEPT_ALERT` | — | Optional prompt text | Accept a browser dialog |
| `DISMISS_ALERT` | — | — | Dismiss a browser dialog |
| `DRAG_AND_DROP` | Source element | Destination CSS selector | Drag and drop |

#### Modules

| Action | `target` | `data` | Description |
| :--- | :--- | :--- | :--- |
| `RUN_MODULE` | Module ID | JSON param overrides | Execute a reusable module (max depth 20) |

### 3.4 API Step Actions

| Action | Description |
| :--- | :--- |
| `API_GET` | Send HTTP GET request |
| `API_POST` | Send HTTP POST request |
| `API_PUT` | Send HTTP PUT request |
| `API_DELETE` | Send HTTP DELETE request |
| `API_HEAD` | Send HTTP HEAD request |
| `API_PATCH` | Send HTTP PATCH request |

Any `API_*` prefix works — the method is derived from the suffix (e.g., `API_OPTIONS` sends an OPTIONS request).

API steps can reference reusable assets:
- `endpointId` — Links to an **API Endpoint** with per-environment base URL
- `headerProfileId` — Links to a **Header Profile**
- `bodyTemplateId` — Links to a **Body Template**
- `data` — Raw body string, or JSON variable overrides when using templates

---

## 4. Variables & Interpolation

### 4.1 Variable Syntax

Use double curly braces to reference variables:

```
{{variableName}}
```

### 4.2 Variable Scoping (Priority: Low → High)

When the same variable name exists at multiple levels, the higher-priority value wins:

| Priority | Layer | Source | Description |
| :--- | :--- | :--- | :--- |
| 1 | DYNAMIC | Dynamic Variables config | Project-level generated values |
| 2 | ENVIRONMENT | Environment editor | Per-environment key-value pairs |
| 3 | RUNTIME_ENVIRONMENT | Extractors (scope=ENVIRONMENT) | Runtime-extracted, persisted |
| 4 | SUITE | Suite variables | Suite-level static defaults |
| 5 | SUITE_DATA | Suite data rows | Current data-driven row values |
| 6 | RUNTIME_SUITE | Extractors (scope=SUITE) | Runtime-extracted at suite level |
| 7 | MODULE_DEFAULT | Module parameters | Module parameter defaults |
| 8 | SCENARIO | Scenario variables | Scenario-level static defaults |
| 9 | SCENARIO_DATA | Scenario data rows | Current scenario row values |
| 10 | RUNTIME_SCENARIO | Extractors (scope=SCENARIO) | Runtime-extracted at scenario level |
| 11 | OVERRIDE | Scenario-Suite overrides | Manual per-suite overrides in scenario |
| 12 | CALLER_OVERRIDE | RUN_MODULE step data | Module caller parameter overrides |
| 13 | CASE | Extractors (scope=CASE), EXTRACT_VAR | Runtime-extracted at case level |

### 4.3 Auto-Namespace Prefixing

Variables set at runtime via extractors automatically get a context-prefixed alias:

- **CASE scope**: `caseName.varName` (e.g., `login.username_val`)
- **SUITE scope**: `suiteName.varName` (e.g., `auth.session_id`)
- **SCENARIO scope**: `scenarioName.varName` (e.g., `order_flow.order_id`)
- **ENVIRONMENT scope**: No prefix (globally available)

### 4.4 Generator Functions

Use generators inside `{{ }}` to produce dynamic values:

| Generator | Arguments | Example | Output |
| :--- | :--- | :--- | :--- |
| `$uuid()` | — | `{{$uuid()}}` | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| `$guid()` | — | `{{$guid()}}` | Same as `$uuid()` |
| `$timestamp()` | — | `{{$timestamp()}}` | `1713945600000` |
| `$timestampSec()` | — | `{{$timestampSec()}}` | `1713945600` |
| `$now(format?, tz?)` | dayjs format, timezone | `{{$now('YYYY-MM-DD')}}` | `2025-04-24` |
| `$randomInt(min?, max?)` | 0, 100 | `{{$randomInt(1, 100)}}` | `42` |
| `$randomFloat(min?, max?, dec?)` | 0, 100, 2 | `{{$randomFloat(0, 1, 4)}}` | `0.7231` |
| `$randomString(length?)` | 8 | `{{$randomString(12)}}` | `a1B2c3D4e5F6` |
| `$randomUpper(length?)` | 8 | `{{$randomUpper(6)}}` | `XKRMZP` |
| `$randomLower(length?)` | 8 | `{{$randomLower(6)}}` | `qpzmxn` |
| `$randomAlpha(length?)` | 8 | `{{$randomAlpha(10)}}` | `kRmZxPqNwL` |
| `$randomEmail()` | — | `{{$randomEmail()}}` | `test_a1b2c3d4@example.com` |
| `$randomPhone()` | — | `{{$randomPhone()}}` | `15551234567` |
| `$randomName()` | — | `{{$randomName()}}` | `Alice42` |
| `$randomMac()` | — | `{{$randomMac()}}` | `a1:b2:c3:d4:e5:f6` |
| `$randomBool()` | — | `{{$randomBool()}}` | `true` |
| `$randomAddress()` | — | `{{$randomAddress()}}` | `123 Main St` |
| `$randomWords(count?)` | 3 | `{{$randomWords(5)}}` | `apple banana cherry date fig` |
| `$date(format?, offset?, unit?, tz?)` | All optional | `{{$date('YYYY-MM-DD', '+7', 'day')}}` | 7 days from now |

### 4.5 Transformers

Apply transformers using the pipe `|` syntax. Transformers are chainable:

```
{{variableName | transformer1 | transformer2}}
```

| Transformer | Arguments | Description |
| :--- | :--- | :--- |
| `base64` | — | Encode to Base64 |
| `base64Decode` | — | Decode from Base64 |
| `md5` | — | MD5 hash (hex) |
| `sha1` | — | SHA-1 hash (hex) |
| `sha256` | — | SHA-256 hash (hex) |
| `hmac(secret?, algo?)` | Secret, algorithm (default `sha256`) | HMAC hash |
| `urlEncode` | — | URL-encode the value |
| `urlDecode` | — | URL-decode the value |
| `uppercase` | — | Convert to uppercase |
| `lowercase` | — | Convert to lowercase |
| `substring(start?, end?)` | Start (default 0), end | Extract substring |
| `replace(search, replace)` | Search string, replacement | String replacement |
| `trim` | — | Trim whitespace |
| `date(format?, tz?)` | dayjs format, timezone | Format a date value |
| `split(sep?, index?)` | Separator (default `,`), index (default 0) | Split string and pick element |
| `default(fallback)` | Fallback value | Use fallback if value is empty |
| `length` | — | Return string length |
| `toJson` | — | Parse and re-stringify JSON |
| `jsonPath(path)` | JSONPath expression | Query JSON string |
| `round` | — | Round to nearest integer |
| `floor` | — | Floor to integer |
| `ceil` | — | Ceiling to integer |
| `abs` | — | Absolute value |
| `set(varName, scope?)` | Variable name, scope (default `CASE`) | Store value as runtime variable; passes value through unchanged |

#### Transformer Examples

```
{{email | trim | lowercase | md5}}
{{token | base64Decode | jsonPath('$.userId')}}
{{$randomInt(1,100) | set('randomNumber', 'SUITE')}}
{{name | default('Anonymous')}}
```

### 4.6 Nested Resolution

Variables can reference other variables. The engine resolves up to 5 iterations to handle chains:

```
{{baseUrl}}/{{apiPath}}   →   https://api.example.com/v1/users
```

---

## 5. Extractors

Extractors capture values from step results and store them as runtime variables.

### Extractor Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | Variable name to store the value as |
| `source` | enum | Yes | Where to extract from |
| `expression` | string | Varies | JSONPath, XPath, regex, header name, or attribute name |
| `scope` | `CASE` \| `SUITE` \| `SCENARIO` \| `ENVIRONMENT` | Yes | Variable lifetime scope |

### Extractor Sources

| Source | Expression Required | Used With | Description |
| :--- | :--- | :--- | :--- |
| `API_BODY_JSON` | Yes (JSONPath) | API steps, waitForNetwork | Extract from JSON response body |
| `API_BODY_XML` | Yes (XPath-like) | API steps, waitForNetwork | Extract from XML response body |
| `API_BODY_REGEX` | Yes (regex, first capture group) | API steps, waitForNetwork | Extract from response body via regex |
| `API_HEADER` | Yes (header name) | API steps, waitForNetwork | Extract a response header |
| `UI_TEXT` | No | UI steps | Extract element text content |
| `UI_VALUE` | No | UI steps | Extract input value |
| `UI_ATTRIBUTE` | Yes (attribute name) | UI steps | Extract an HTML attribute |
| `UI_PAGE_URL` | No | UI steps | Extract current page URL |
| `UI_PAGE_TITLE` | No | UI steps | Extract current page title |

### Extraction Example

After an `API_POST` step that returns `{"id": 123, "token": "abc"}`, add an extractor:
- **Source**: `API_BODY_JSON`
- **Expression**: `$.id`
- **Name**: `userId`
- **Scope**: `SCENARIO`

The variable `{{userId}}` is then available at `SCENARIO` priority for the rest of the scenario.

---

## 6. Assertions

Assertions validate step results after execution. They are supported on API steps and on steps with `waitForNetwork` configurations.

### Assertion Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `source` | enum | Yes | Where to read the value from |
| `expression` | string | Varies | JSONPath, XPath, header name, or regex |
| `operator` | enum | Yes | Comparison operator |
| `expectedValue` | string | Varies | Expected value for comparison |

### Assertion Sources

| Source | Expression | Description |
| :--- | :--- | :--- |
| `API_STATUS` | — | HTTP response status code |
| `API_HEADER` | Header name | Response header value |
| `API_BODY_JSON` | JSONPath | JSON body value via JSONPath |
| `API_BODY_XML` | XPath | XML body value via XPath |

### Assertion Operators

| Operator | Expected Value | Description |
| :--- | :--- | :--- |
| `EQUALS` | Yes | Exact string equality |
| `NOT_EQUALS` | Yes | String not equal |
| `CONTAINS` | Yes | String contains substring |
| `NOT_CONTAINS` | Yes | String does not contain substring |
| `EXISTS` | No | Value is present (not null/undefined) |
| `NOT_EXISTS` | No | Value is absent |
| `MATCHES_REGEX` | Yes (regex pattern) | Value matches the regex |

### Assertion Example

After an `API_GET` step, add an assertion:
- **Source**: `API_STATUS`
- **Operator**: `EQUALS`
- **Expected Value**: `200`

Add another:
- **Source**: `API_BODY_JSON`
- **Expression**: `$.user.name`
- **Operator**: `CONTAINS`
- **Expected Value**: `Admin`

---

## 7. Dynamic Variables

Dynamic variables are project-level expressions that generate values on demand. They are evaluated at the **DYNAMIC** layer (lowest priority), so any higher-priority variable with the same name will override them.

### Configuration

| Field | Description |
| :--- | :--- |
| **Name** | Variable name (referenced as `{{name}}`) |
| **Expression** | The value expression (can use generators and other variables) |
| **Evaluation Strategy** | When to re-evaluate |

### Evaluation Strategies

| Strategy | Description |
| :--- | :--- |
| `EVERY_TIME` | Re-evaluated on every interpolation call |
| `ONCE_PER_RUN` | Evaluated once at the start of the entire execution run |
| `ONCE_PER_CASE` | Evaluated once per test case |
| `ONCE_PER_SUITE` | Evaluated once per suite |
| `ONCE_PER_SCENARIO` | Evaluated once per scenario iteration (shared across suites) |

### Example

Create a dynamic variable:
- **Name**: `testEmail`
- **Expression**: `{{$randomEmail()}}`
- **Strategy**: `ONCE_PER_CASE`

Every test case will generate a unique email, but it remains consistent within each case.

---

## 8. Page Object Model (Elements)

The Element Repository decouples test steps from brittle UI selectors.

### How It Works

1. Define **Pages** under your project (e.g., `LoginPage`, `DashboardPage`)
2. Add **Elements** to each page with smart selectors
3. Reference elements in steps as `PageName.ElementName` (e.g., `LoginPage.usernameInput`)
4. If a selector changes, update it in one place — all referencing steps are automatically updated

### Selector Generation (Recording)

The recorder leverages **Playwright's official selector engine** (`InjectedScript.generateSelectorSimple`) to produce the most resilient selectors. This is the same engine that powers Playwright's built-in codegen, ensuring selectors are accurate, stable, and executable by Playwright at runtime.

The engine produces selectors like `internal:role=button[name="Sign in"i]` or `internal:label="Email"`, which map directly to Playwright locators during execution.

If the official engine fails (rare), a minimal **CSS fallback** is used (ID → `data-testid` → `name` attribute → structural path).

---

## 9. Modules (Reusable Step Groups)

Modules allow you to define parameterized step groups that can be reused across suites via the `RUN_MODULE` action.

### Module Structure

| Field | Description |
| :--- | :--- |
| **Name** | Module name |
| **Parameters** | Named parameters with default values |
| **Steps** | The step sequence to execute |

### Invoking a Module

Use the `RUN_MODULE` action in a test step:

| Field | Value |
| :--- | :--- |
| `action` | `RUN_MODULE` |
| `target` | Module ID |
| `data` | JSON object of parameter overrides, e.g., `{"username": "admin", "password": "{{envPassword}}"}` |
| `namespace` | (Optional) Prefix for extracted variables, e.g., `login` |

### Module Execution

- A child `ExecutionContext` is created, inheriting global layers
- Module parameters are resolved: caller overrides (`CALLER_OVERRIDE`) > module defaults (`MODULE_DEFAULT`)
- Extracted variables merge back into the parent context
- If a `namespace` is set, extracted variables are prefixed (e.g., `login.token`)
- Maximum recursion depth: 20

---

## 10. Scenarios & Plans

### 10.1 Scenarios

A **Scenario** composes multiple suites into a sequential workflow with variable overrides.

| Field | Description |
| :--- | :--- |
| **Name** | Scenario name |
| **Variables** | Scenario-level static variables (priority 8) |
| **Data Rows** | Scenario data-driven iterations (priority 9) |
| **Suites** | Ordered list of suite references |

Each suite reference in a scenario can have:

| Field | Description |
| :--- | :--- |
| `suiteId` | The suite to include |
| `variableOverrides` | Key-value overrides for this suite (priority 11) |
| `dataSource` | `SCENARIO` (default) — scenario data rows drive iteration; `SUITE` — suite's own data rows drive iteration |

#### Variable Sharing Across Suites

Within a single scenario iteration, runtime variables extracted at `SUITE` or `SCENARIO` scope are **shared** across all suites. This allows Suite A to extract a value (e.g., `auth.token`) that Suite B can reference.

### 10.2 Plans

A **Plan** composes multiple scenarios into an ordered execution sequence.

| Field | Description |
| :--- | :--- |
| **Name** | Plan name |
| **Scenarios** | Ordered list of scenario references |

### 10.3 Execution Hierarchy

```
Plan
└── For each PlanScenario
    └── Scenario
        └── For each Scenario DataRow
            ├── Fresh sharedRuntimeVars + sharedDynamicCaches
            └── For each ScenarioSuite
                └── Suite
                    └── For each Suite DataRow
                        ├── Create ExecutionContext (13-layer resolution)
                        ├── Run Suite Setup Steps
                        └── For each TestCase
                            ├── Run Case Setup Steps
                            ├── Run Case Main Steps
                            ├── Run Case Teardown Steps
                            ├── Clear case-scoped variables
                            └── Emit progress
                        ├── Run Suite Teardown Steps
                        └── Clear suite-scoped variables
```

---

## 11. Data-Driven Testing

Both suites and scenarios support **data rows** — arrays of key-value records that drive iterative execution.

### Suite Data Rows

Define on the suite's `dataRows` field. Each row becomes one iteration where all cases execute with that row's variables at `SUITE_DATA` priority.

If a suite has 3 cases and 5 data rows, the total execution count is `3 × 5 = 15`.

### Scenario Data Rows

Define on the scenario's `dataRows` field. Each row becomes one scenario iteration where all suites execute with that row's variables at `SCENARIO_DATA` priority.

### DataSource Selection

The `ScenarioSuite.dataSource` field controls which data rows drive iteration:

| DataSource | Behavior |
| :--- | :--- |
| `SCENARIO` (default) | Suite's internal `dataRows` are **ignored**. Only scenario data rows drive iteration. Prevents unwanted multiplication. |
| `SUITE` | Suite uses its own `dataRows` for iteration, independent of scenario data rows. |

### Example

Suite `CreateOrder` has data rows:

```json
[
  { "product": "Widget", "quantity": "1" },
  { "product": "Gadget", "quantity": "5" },
  { "product": "Doohickey", "quantity": "10" }
]
```

When executed, each test case in the suite runs 3 times with `{{product}}` and `{{quantity}}` resolved per row.

---

## 12. Recording

The interactive recorder captures UI interactions and API traffic, auto-generating test steps and assets.

### Starting a Recording Session

1. Navigate to the **Recording** feature
2. Provide:
   - **Target URL** — The page to open
   - **Project ID** — Which project to save assets to
   - **API Filter** (optional) — Wildcard pattern to filter recorded API requests (e.g., `*/api/v1/*`)
   - **Page ID** (optional) — Which page to save elements to
   - **Agent ID** (optional) — Record on a remote agent
3. Click **Start** — A Chromium browser opens with an in-page toolbar

### Recording Modes

The floating toolbar offers three modes:

| Mode | Trigger | What Gets Recorded |
| :--- | :--- | :--- |
| **UI** | Left-click interactions | CLICK, TYPE, SELECT_OPTION, WAIT_FOR_NAVIGATION steps |
| **API** | Network requests (filtered) | API Endpoint + Header Profile + Body Template assets + `API_*` steps |
| **Element** | Right-click on elements | Page elements with smart selectors |

### Smart Selector Generation

The recorder uses **Playwright's official `InjectedScript`** selector engine — the same engine that powers `playwright codegen`. It produces Playwright-native selectors that are directly executable at runtime:

| Selector Pattern | Example | Resilience |
| :--- | :--- | :--- |
| `internal:role=...` | `internal:role=button[name="Sign in"i]` | High — survives layout/class changes |
| `internal:label=...` | `internal:label="Email"` | High — tied to accessible label |
| `internal:testid=...` | `internal:testid=login-btn` | Highest — explicit stable identifier |

If the official engine cannot produce a selector (rare edge case), a minimal CSS fallback is used (element ID → `data-testid` → `name` attribute → structural path).

### API Recording

When API mode is active:
- Network requests matching the **API Filter** are captured
- **API Endpoints** are auto-created with per-environment base URLs
- **Header Profiles** are auto-created from request headers
- **Body Templates** are auto-created from POST/PUT request bodies
- Steps are generated with status assertions

### Stopping a Recording Session

Click the **Stop** button in the toolbar, or use `POST /api/recording/stop`. The browser closes and all recorded assets are saved.

---

## 13. Execution

### Starting a Test Run

1. Select a **Suite**, **Scenario**, or **Plan** to execute
2. Choose the **environment** (determines API base URLs and environment variables)
3. Click **Run**

### Execution Targets

| Target | What Runs |
| :--- | :--- |
| **Suite** | All cases with all data rows |
| **Scenario** | All suites with all scenario data rows |
| **Plan** | All scenarios sequentially |
| **Case** | A single case |

### Local vs Remote Execution

| Mode | Where | How |
| :--- | :--- | :--- |
| **Local** | Server process | Direct execution via shared engine |
| **Remote** | Agent process | Server packages `TaskPayload` → dispatches via WebSocket → agent executes and streams results back |

### Real-Time Feedback

During execution, logs and progress are streamed in real-time:
- **SSE** — Execution logs, progress updates (server → client)
- **WebSocket** — Agent status, recording events (bidirectional)

### Execution Error Handling

- **Per-case fail-fast**: Any step failure stops the current case
- **Per-suite continue**: Case failures are caught; the next case proceeds
- **Always-run teardown**: Suite and case teardown steps execute in `finally` blocks regardless of failures
- **Abort**: Supported at any loop boundary; throws `'Execution aborted'`

---

## 14. Agents (Remote Execution)

### What Are Agents?

Agents are separate Node.js processes that connect to the QuantumQA server via WebSocket. They receive self-contained task payloads, execute tests locally, and stream results back.

### Setting Up an Agent

#### Option 1: Download Pre-Packaged Agent (Recommended)

1. In the QuantumQA UI, go to **Agents**
2. Click **Download Agent** — get `quantum-qa-agent.zip`
3. Extract the ZIP
4. Edit `.env` to set `AGENT_SECRET` (must match the server's secret)
5. Run based on your OS:

   **Windows** — double-click `start-agent.bat` or run in terminal:
   ```bat
   start-agent.bat
   ```

   **Linux / macOS** — run in terminal:
   ```bash
   chmod +x start-agent.sh
   ./start-agent.sh
   ```

The startup script automatically installs dependencies and Playwright Chromium, then connects to the server.

#### Option 2: From Source (Debug / Development Only)

> Only use this approach when testing locally or debugging agent behavior. For production, always use the **Download Pre-Packaged Agent** above.

```bash
# In the project directory
npm install
npx playwright install chromium
npm run start-agent -- --url ws://your-server:3000 --name my-agent
```

### Agent Configuration

| Config | Env Var | CLI Arg | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| Server URL | `SERVER_URL` | `--url` | `ws://localhost:3000` | WebSocket URL of the server |
| Agent ID | `AGENT_ID` | `--name` | `agent-<random>` | Unique agent identifier |
| Auth Secret | `AGENT_SECRET` | — | — | Must match server's `AGENT_SECRET` |

### Agent States

| State | Description |
| :--- | :--- |
| **Idle** | Available for task dispatch |
| **Busy** | Currently executing a task |
| **Offline** | Not connected (last seen > 30s ago) |
| **Disabled** | Administratively disabled; won't receive tasks |

### Agent Labels

Tag agents with labels for targeted task routing. When an execution request specifies `QUEUE:LABEL:<tag>`, only agents with that label will receive the task.

### Task Dispatch Strategies

| Strategy | Format | Description |
| :--- | :--- | :--- |
| Targeted | `QUEUE:AGENT_ID:xxx` | Dispatch to a specific agent |
| Label-based | `QUEUE:LABEL:xxx` | Dispatch to any agent with matching label |
| Any-agent | `QUEUE:ANY` | Dispatch to the first idle agent |

---

## 15. Settings

Configure global execution behavior in **Settings**:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **Current Project** | string | — | Active project for all operations |
| **Current Environment** | string | — | Active environment (determines API base URLs and env vars) |
| **Headless Mode** | boolean | `true` | Run browser without visible window |
| **Viewport Width** | integer | — | Browser viewport width in pixels (headless only) |
| **Viewport Height** | integer | — | Browser viewport height in pixels (headless only) |
| **Record Video** | boolean | `true` | Record video of browser execution |

#### Viewport Behavior

- **Headless mode**: If both width and height are set, they are applied. Otherwise, defaults are used.
- **Non-headless mode**: Viewport is set to null, and the browser launches with `--start-maximized`.

---

## 16. API Assets

### Endpoints

An **API Endpoint** stores a service URL with per-environment base URLs and parameters.

| Field | Description |
| :--- | :--- |
| **Name** | Endpoint display name |
| **Base URLs** | One per environment (e.g., `PROD: https://api.prod.com`, `DEV: https://api.dev.com`) |
| **Parameters** | Query/path parameters with defaults |
| **Path** | The URL path appended to the base URL |

When an API step references an endpoint, the base URL is selected based on the current environment.

### Header Profiles

A **Header Profile** is a reusable set of HTTP headers (e.g., `Authorization: Bearer {{token}}`, `Content-Type: application/json`).

### Body Templates

A **Body Template** is a reusable request body with a content type and default variable values. The template is interpolated at runtime, replacing `{{variable}}` placeholders with resolved values.

---

## 17. Network Wait & Mocks

### waitForNetwork

Configure a step to wait for a specific network response after execution:

| Field | Description |
| :--- | :--- |
| **URL Pattern** | Wildcard pattern to match the network request URL |
| **Status Code** (optional) | Expected HTTP status code |
| **Timeout** | Maximum wait time in milliseconds |

Assertions and extractors can be applied to the matched network response.

### Network Mocks

Intercept and mock network requests during a step:

| Field | Description |
| :--- | :--- |
| **URL Pattern** | Wildcard pattern to match requests |
| **Response Status** | Mock HTTP status code |
| **Response Body** | Mock response body (supports interpolation) |
| **Response Headers** | Mock response headers |

---

## 18. Reports

After execution completes, a **Report** is generated containing:

- Overall status (passed/failed)
- Pass rate and case counts
- Duration
- Step-level logs with status, timestamps, and error details
- Extracted variable values
- Assertion results

View reports in the **Reports** feature. Each execution run produces one report.

---

## 19. Docker Deployment

QuantumQA includes a multi-stage Dockerfile for containerized deployment.

### Quick Start

```bash
docker build -t quantum-qa .
docker run -p 3000:3000 -v quantum-qa-data:/app quantum-qa
```

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | 3000 (7860 for HF Spaces) | HTTP server port |
| `HEADLESS` | `true` | Playwright headless mode |
| `AGENT_SECRET` | — | WebSocket authentication secret for agents |
| `FORCE_SEED` | — | Reset database on startup |

### Data Persistence

Mount a persistent volume for `database.sqlite` to ensure data survives container restarts.

---

## 20. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| Browser not found | Run `npx playwright install chromium` |
| Agent won't connect | Verify `SERVER_URL` and `AGENT_SECRET` match server config |
| Database locked | Ensure only one server process is running |
| Selectors fail after UI changes | Update elements in the Page Object Model repository |
| Variables not resolving | Check variable name spelling and scope priority; higher-priority layers override lower ones |
| API base URL wrong | Verify the current environment matches the intended endpoint configuration |
| Steps skipped unexpectedly | Check that `enabled` is `true` on the step |
| Module recursion error | Maximum module nesting depth is 20; reduce nesting |
