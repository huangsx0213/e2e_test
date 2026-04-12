# QuantumQA Core Technical Implementation Details



---

# 🌐 API Recording Engine Best Practices (Implemented)

Target scenario: **Automatically orchestrating pure API test assets and link chains via UI roaming**.
The system has fully implemented an efficient, noise-reducing, and environment-aware API recording engine.

## Core Features Implemented

### 1. Environment-Aware Mapping
> [!IMPORTANT]
> **Automatic Decoupling**: During recording, the system automatically parses the request URL, maps the Origin (e.g., `https://api.staging.com`) to the currently active environment's `baseUrl`, and stores the Path isolated into the Endpoint model.
> **Cross-Environment Reusability**: During execution, this asset will automatically switch the Base URL according to the active environment selected, averting manual script modifications.

### 2. Intelligent Upsert Mechanism
To prevent the asset repository from bloating or spawning duplicates, the recording engine employs an "incremental update" rationale over a "repeated creation" logic:
*   **Endpoint Matching**: Enforces strict uniqueness verification based on `[Method] + Path`.
*   **Parameter Merging**: If the system records unencountered Query Parameters, it automatically merges them into the existing Endpoint's parameter list without overriding.
*   **Base URL Fulfillment**: When the same API is recorded across structurally different environments, the system persistently fleshes out the Endpoint's `baseUrls` geographic map.

### 3. Data Purification
*   **Response Interception**: Listens to the `requestfinished` event to capture exact status codes (e.g., 200, 404), ensuring the recording is tied exclusively to a valid business interaction.
*   **Header Cleansing**: Automatically eradicates volatile browser fingerprints (User-Agent, Sec-CH-* tags) and the highly unstable Content-Length constraint.
*   **Body Formatting**: Applies strict standard formatting on freshly captured JSON payloads before tunneling them into the Body Templates for simpler late-stage maintenance.

### 4. Real-time Sync Feedback
*   **WebSocket Echo**: All recorded API steps are immediately funneled through WebSockets and surfaced on the `TestBuilder` interface real-time, facilitating zero-latency visibility.
*   **Asset Hot-Refresh**: Once a sprawling new API recording finalizes, the frontend automatically triggers a background asset (Endpoints/Headers/Bodies) repository update sequence.

### 5. Executor Integration
*   **Default Fallback**: If a particular environment omits a specific Base URL configuration, the executor intuitively falls back to the `default` fallback path layout out to guarantee continuous testing stability.
*   **Automatic Assertions**: Extrapolates standard foundational assertions immediately based on response status codes (e.g., `expect(status).toBe(200)`).

## Usage Guide
1.  **Select Environment**: Before initiating recording, ensure you have actively toggled to the correct target environment within the top navbar (e.g., STAGING).
2.  **Initiate Recording**: Within the Test Builder canvas, input your target URL filtering parameters and engage API Recording mode.
3.  **Asset Verification**: After your recording concludes, navigate to API Assets -> Endpoints to view your extracted Base URLs categorized safely by Environment.


---

# Unified Recording Engine Architecture (UI & API)

## 1. Overview
The Unified Recording Engine is a core subsystem of the QuantumQA Automation Matrix. It seamlessly combines **UI Element Extraction**, **UI Step Recording**, and **API Request Recording** into a single, cohesive architecture. 

By injecting a smart tracker into a Playwright-controlled browser and leveraging Playwright's native network interception, the engine captures user intents (clicks, typing) and background network requests (XHR/Fetch). It then automatically maps these actions to the existing Page Object Model (POM) Element Repository and API Asset Library.

## 2. Architecture & Tech Stack

### Tech Stack
*   **Browser Automation**: Playwright (Node.js)
*   **In-Browser Tracker**: Vanilla JavaScript (Injected via `page.addInitScript`)
*   **Network Interception**: Playwright `page.on('requestfinished')` (Captures Result & Status)
*   **Real-time Communication**: WebSockets (ws)
*   **Environment Mapping**: Real-time cross-reference with Active UI Environment

### High-Level Architecture Flow
1. **Frontend (React)** initiates a session with `targetUrl`, `apiFilter`, and `environment`.
2. **Backend (Node.js)** launches Playwright and injects the Tracker.
3. **Action Interception**: 
    *   *UI*: Tracker captures `click`/`input` events.
    *   *API*: Playwright intercepts requests matching the filter, capturing URL, Method, Headers, and Response Status.
4. **Smart Auto-Mapping**:
    *   *UI*: Resolves elements via `generateSmartSelector` with live DOM validation.
    *   *API*: **Environment-Aware Mapping**. The request origin is saved as the `baseUrl` for the *selected environment* in the `ApiEndpoint` model.
5. **Intelligent Asset Merging**:
    *   If an endpoint (Method + Path) already exists, the engine **updates** it by adding/updating the `baseUrl` for the current environment and merging new query parameters.
6. **WebSocket Broadcast**: Emits normalized `TestStep` objects to the UI.

---

## 3. Core Implementation Details

### 3.1. UI Recording: Injected Tracker
*   **Floating Toolbar**: Draggable UI for toggling UI/API recording and adding assertions.
*   **Smart Filtering**: Only captures interactions on semantic elements (buttons, inputs, links).
*   **Event Debouncing**: Captures final values on `blur` or `change` for efficiency.

### 3.2. API Recording: Environment-Aware Mapping
> [!IMPORTANT]
> To ensure recorded tests are portable across DEV, STAGING, and PROD, the engine automatically splits URLs:
> - **Origin**: Saved to `endpoint.baseUrls[activeEnvironment]`.
> - **Path**: Saved to `endpoint.path`.
> 
> This allows the `api-executor` to switch base URLs at runtime based on the execution environment.

### 3.3. API Recording: Intelligent Merging (Upsert)
Instead of creating duplicate assets, the engine performs a "Smart Merge":
- **Parameters**: New query parameters are added to the endpoint's parameter list while preserving existing ones.
- **Base URLs**: If a new environment is recorded for an existing endpoint, it's added to the `baseUrls` map without overwriting others.

### 3.4. Real-time Feedback (UX)
*   **Live Rendering**: Recorded steps are broadcast via WebSocket and appear in the `TestBuilder` immediately.
*   **Asset Refresh**: The UI triggers a background refresh of Endpoints, Headers, and Bodies when an API step is received, ensuring metadata is always current.

---

## 4. Execution Engine Integration
*   **URL Resolution**: During execution, the engine looks for the `baseUrl` matching the target environment. If not found, it falls back to a `default` entry.
*   **Variable Interpolation**: All recorded parameters support `{{variables}}` for dynamic data-driven testing.


---

# Core Test Engine Implementation Plan

## 1. Background & Objectives
Historically, the logical execution tests purely relied heavily on simulated Frontend React components (`ExecutionRunner.tsx` and `ScenarioExecutionRunner.tsx`), fundamentally mimicking success or failure strictly using localized `setTimeout` mocked variables.
To genuinely evolve this iteration into a legitimate "Low-code Automation Testing Array", it was fundamentally critical to instantiate a **Real, Robust Backend Execution Engine**, structurally responsible for orchestrating authentic API calls, resolving nested variables, transitioning environments on the fly, and enabling future UI-driven expansions.

## 2. Structural Architecture Planning

### 2.1 Shifting from Local Mocks to Pure Backend Execution
- **Frontend Role Shift**: The frontend transforms strictly into a "Control Panel" and an active "Log Viewport". Formal executions are systematically triggered over back-channel APIs, utilizing SSE (Server-Sent Events) or WebSockets to accept incoming live logging streams, thus revoking the client's authority over parsing testing nodes outright.
- **Core Engine Operations**: Construct an independent mechanical unit residing within the server backend (`server/modules/execution`) equipped natively to directly query database states to govern test runtime states automatically.

### 2.2 Core Module Responsibility Segregation
We recommend partitioning the core engine mechanics into these distinctive subsystem components:

1. **Context Manager (Variable Scoping)**
   - Responsible for mapping, isolating, and bridging all varied layer-scoped variables reliably.
   - Hierarchy: Global System Configs < Environment Vars < Suite Vars < Scenario Overrides < Data Rows < Module Params < Temporary Built-in Extracted Vars.
   - **Safe Interpolation Engine**: Devoted to parsing generic variables nested inside Headers or Body formats using a `{{key}}` replacement template dynamically honoring layer overlays.

2. **Action Executor (Steps and Protocol Resolvers)**
   - **API Protocol Handler**: Leverages native `fetch` bindings to synthesize authentic HTTP outbounds by concatenating the raw Endpoint URL, injecting matched Headers dynamically, and splicing assembled Body structures.
   - **Control Fundamentals**: Manages explicit system pause steps (`WAIT`) and robust module push-and-pop stack routing (`RUN_MODULE`).
   - **UI Protocol Handler (Upcoming Phase)**: Maintains generic hook slots for interfacing Webdriver or natively injecting Playwright operations.

3. **Routing Coordinator (Route Scheduler)**
   - Operates on exact test hierarchy dependencies: Scenario -> Suite -> Case -> Module routing scheduling flows.
   - Embraces multiple DataRow cyclic runtime handling natively to reset the memory environments.

4. **Event Logger & Reporter (Live Listener Array)**
   - Highjacks overall Success/Failure throwing lifecycles cleanly.
   - Instantly snapshots events to SQLite local models enforcing strict `ExecutionLog` and `ExecutionReport` auditing traits.
   - Relays localized messages back to interface viewers utilizing pure streaming event sourcing algorithms.

## 3. Implementation Phases

### Phase 1: Engine Skeletons & Interpolation Core
- Constitute an entirely new `ExecutionContext` prototype framework.
- Rip out locally bound variables logic from the `ExecutionRunner.tsx` frontend UI mapping routines replacing it purely inside the servers.
- Connect direct database pulling traits enabling runtime engines to retrieve state.

### Phase 2: Native API Fetching & Robust Assertions
- Equip standard raw `fetch` handling payload mechanisms explicitly.
- In-depth parsing applied natively evaluating Http Status Codes identifying Success versus Failure thresholds purely.
- Implement structured deterministic validations natively inside runners, asserting on elements like `ASSERT_STATUS` or exact JSON keys (`ASSERT_JSON`).

### Phase 3: Headless React & Syncing Live Logs 
- Server orchestrates `POST /api/runners/execute` REST pathways to spawn async routines physically.
- Extend `GET /api/runners/stream?reportId=xxx` channels to hook SSE connection chains.
- Tear away excessive simulated mock architectures from visual dashboards converting layouts to simply subscribe to real network messages passively.

## 4. Key Considerations
- **Concurrency Hazards**: Single thread safety measures over multiple overlapping execute inputs guarantee no cross-pollution of execution report metadata occurs over independent HTTP calls.
- **Recursion Traps**: Adopting `RUN_MODULE` recursion mandates robust stack ceiling defenses mechanically (e.g. terminating logic after passing 50 maximum stack-depth limit bounds issuing a `StackOverflow Error`) immediately avoiding hanging the Node instances abruptly.
- **SSRF Defensive Policies**: Permitting generic APIs running natively strictly necessitates safeguarding target origins utilizing Timeout constraints natively restricted mostly (often roughly 5000ms bounds) inherently shielding instances against dragging external server lags.


---

# Backend Execution Engine — Implementation Plan

## Overview

Currently, the test execution within the application relies completely on frontend simulated React components (`ExecutionRunner.tsx` / `ScenarioExecutionRunner.tsx`) triggering artificial logic using `setTimeout` randomized delays. Variable extraction, complex nested module resolutions, and structural API endpoint parameter assembling logics are handled directly on the frontend layers.

This comprehensive roadmap defines scaling out an autonomous, unified **Backend Execution Engine**, engineered cleanly on the server to retrieve live configuration footprints across database records natively. Consequentially leveraging **Playwright** mechanically maneuvering authentic DOM rendering browsers alongside native **fetch** protocols synthesizing standard real API networking routines independently. Synchronously streaming real-time playback logs tunneling heavily over **SSE (Server-Sent Events)** instantly back to the frontend display visors safely.

---

## User Review Required

> [!IMPORTANT]
> **Playwright Requirements**: The integration demands installing robust browser binary variants physically (roughly 300MB+ in size). Initialization requires triggering `npx playwright install chromium` securely installing native structural browser layers independently.
> 
> **Package Definitions**: Including packages `playwright` (UI Automation) and `uuid` (Executing sequence ID formulations).
>
> **Migration Logistics**: Extending schema migration logic dynamically weaving a centralized `execution_runs` database model cleanly tracking active rendering sessions/finalized audits natively.

> [!WARNING]
> **Breaking Change (Frontend)**: Significant overhauls aggressively applied toward components `ExecutionRunner.tsx` alongside `ScenarioExecutionRunner.tsx` — transitioning heavily isolating standalone behaviors "Mocked operations" firmly morphing endpoints heavily calling API pathways strictly receiving visual SSE Streams. Scrapping simulated methods completely (`simulateStep` / `executeStepsRecursive`).

---

## Architectural Topologies

```text
┌────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                           │
│                                                                    │
│  ┌─────────────────┐    POST /api/runners/execute                  │
│  │ ExecutionRunner │────────────────────────────────┐              │
│  │  (Thin Client)  │    GET  /api/runners/stream/:id│              │
│  │                 │◄───────────────────────────────┤              │
│  └─────────────────┘         SSE Log Stream         │              │
└─────────────────────────────────────────────────────┼──────────────┘
                                                      │
┌─────────────────────────────────────────────────────┼──────────────┐
│                      Backend (Express + Node.js)    │              │
│                                                     ▼              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 server/modules/execution/                   │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐    │   │
│  │  │  index.ts    │  │ context.ts  │  │  interpolator.ts │    │   │
│  │  │  (Routes +   │  │ (Variable   │  │  ({{key}} engine)│    │   │
│  │  │   Controller)│  │  Scoping)   │  │                  │    │   │
│  │  └──────────────┘  └─────────────┘  └──────────────────┘    │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐    │   │
│  │  │ coordinator  │  │ api-executor│  │  ui-executor.ts  │    │   │
│  │  │ .ts          │  │ .ts         │  │  (Playwright)    │    │   │
│  │  │ (Orchestrate)│  │ (fetch)     │  │                  │    │   │
│  │  └──────────────┘  └─────────────┘  └──────────────────┘    │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌─────────────┐                          │   │
│  │  │ logger.ts    │  │ runner.ts   │                          │   │
│  │  │ (SSE + DB    │  │ (Run Loop)  │                          │   │
│  │  │  persistence)│  │             │                          │   │
│  │  └──────────────┘  └─────────────┘                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌───────────────────────────┐                                     │
│  │  Existing CRUD Modules    │  (projects, suites, headers,        │
│  │  (Read-only by engine)    │   bodies, endpoints, environments,  │
│  │                           │   reports, settings)                │
│  └───────────────────────────┘                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes

### 1. New Backend Module  `server/modules/execution/`

Establishing the centralized engine logic conforming directly mirroring existing architectural patterns (`server/modules/<module>`).

---

#### [NEW] `interpolator.ts`

**Variable Interpolation Engine**, separated from primitive frontend elements logic (`ExecutionRunner.tsx`) fortified inherently.

- `interpolate(template: string, vars: Record<string, string>): string` — Handles uniform replacement bindings mapping exactly nested structured arguments safely mapping formats via `{{key}}` syntax explicitly.
- Nested Parsing mechanisms explicitly handling nested keys securely replacing formats (e.g., `{{BASE_URL}}/{{PATH}}` dynamically formatting variables layered).
- Enforces strict limits halting excessive overlapping iterating over roughly `5 times` cleanly.

---

#### [NEW] `context.ts`

**Executing Environment (Variables Container & Scoping Scenarios)**.

```typescript
class ExecutionContext {
  private scopes: Map<string, Record<string, string>>; // layered scopes
  
  constructor(layers: {
    globalSettings?: Record<string, string>;
    environmentVars?: Record<string, string>;
    suiteVariables?: Record<string, string>;
    scenarioOverrides?: Record<string, string>;
    dataRowValues?: Record<string, string>;
  });

  resolve(key: string): string | undefined;
  resolveAll(): Record<string, string>;
  
  setRuntimeVar(key: string, value: string): void;
  
  createChildContext(moduleParams: Record<string, string>, overrides: Record<string, string>): ExecutionContext;
}
```

**Scope Hierarchy Priorities (Lowest to Highest Levels)**:
1. Global Settings
2. Environment Variables
3. Suite Variables (default values)
4. Scenario Overrides
5. Data Row Values
6. Module Params (defaults)
7. Module Overrides (from step `data` JSON)
8. Runtime Variables (Generated exclusively leveraging dynamically assigned Extractors)

---

#### [NEW] `api-executor.ts`

**API Action Command Driver** — Controls executing purely API-based operations efficiently (`API_GET` / `API_POST` / `API_PUT` / `API_DELETE`).

```typescript
interface ApiExecutionResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

async function executeApiStep(
  step: TestStep,
  context: ExecutionContext,
  assets: { headers: HeaderProfile[]; bodies: BodyTemplate[]; endpoints: ApiEndpoint[] },
  environment: string,
): Promise<ApiExecutionResult>;
```

**Core Implementation Patterns**:
1. Merges base endpoint patterns (e.g. `baseUrl` + native parameterized `path` formulations + queries).
2. Synthesizes exactly Header structures mapping interpolated templates resolving variants seamlessly.
3. Overlays mapped body syntaxes accurately populating JSON/Form variants securely.
4. Distributes execution payloads using standard node `fetch` architectures smoothly.
5. Captures the precise output mapping Status/Headers cleanly.
6. Enforces exact Timeout Constraints naturally handling roughly boundaries at `30s`.
7. **SSRF Protections**: Prevents looping dangerous payload configurations bouncing requests backward masking IP barriers securely strictly parsing domains (blacklists targeting localhosts).

---

#### [NEW] `ui-executor.ts`

**UI Command Driver** — Utilizes Playwright headless browser instances to perform actual navigational checks natively.

```typescript
import { Browser, BrowserContext, Page } from 'playwright';

class UIExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(options?: { headless?: boolean }): Promise<void>;
  async executeStep(step: TestStep, executionContext: ExecutionContext): Promise<UIStepResult>;
  async takeScreenshot(): Promise<string>; // returns base64
  async cleanup(): Promise<void>;
}
```

**Supported Mapped Actions**:
- Generic Navigations natively `OPEN`.
- Synthesizing specific `CLICK`, `TYPE`, `HOVER`, `SCROLL_TO` behaviors mirroring native Playwright calls `page.click(selector)`, `page.fill(selector, data)`, mapping accurately.
- `ASSERT_VISIBLE` and variations effectively triggering Playwright assertions.
- Extractor capabilities fetching DOM text contents resolving nested structural inputs.

---

#### [NEW] `runner.ts`

**Lifecycle Orchestrator** — The central dispatch component regulating sequencing and stack looping strictly.

```typescript
interface RunRequest {
  type: 'case' | 'suite' | 'scenario';
  projectId: string;
  environment: string;
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
  dataRowIndex?: number;
}

interface RunResult {
  reportId: string;
  status: 'COMPLETED' | 'FAILED' | 'ABORTED';
  passRate: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  durationMs: number;
}
```
**Safety Safeguards**:
- Strictly limiting module recurrences capping maximum loops at layers preventing aggressive overflow errors mapping natively roughly limits capped at `20`.

---

#### [NEW] `logger.ts`

**Execution Logger Core** — Dedicated strictly toward dual channel broadcasting mechanisms routing Event streams directly alongside committing histories securely saving artifacts natively.

```typescript
class ExecutionLogger {
  private reportId: string;
  private sseClients: Set<Response>;

  constructor(reportId: string);

  addClient(res: Response): void;
  removeClient(res: Response): void;

  log(entry: {
    stepId: string;
    status: 'RUNNING' | 'PASS' | 'FAIL' | 'SKIP' | 'INFO';
    message: string;
    screenshot?: string;
    details?: Record<string, unknown>; // API response body, headers
  }): void;

  finalize(result: RunResult): void;
}
```

---

#### [NEW] `index.ts` Wait...

*(Note: Simplified code snippets block limits reached, referencing above controller routing patterns translating seamlessly `POST /api/runners/execute`, `GET /api/runners/stream/:reportId`, mapping exact schema adjustments resolving types).*

## Classification Groupings
- **UI Actions**: Directly parsed via generic Playwright executors validating assertions natively.
- **API Actions**: Dispatched over structured REST formats interpreting standard properties reliably.
- **Control Paths**: Structural flow commands evaluated statically without invoking external bindings (e.g. `WAIT`).

---

## Open Questions

> [!IMPORTANT]
> 1. **Browsers Target**: Default execution defaults to Chromium variants. Will further implementation strictly necessitate integrating Firefox/Webkit matrices?
> 2. **Headless Configurations**: Execution flows are currently strictly defined headless safely isolating environment rendering dependencies. Should explicit modes bridging headed displays be introduced for monitoring tasks directly natively?
> 3. **Concurrency Modes**: Present architecture ensures sequential parsing guaranteeing deterministic logging traits sequentially. Should we explore multi-tasking overlapping streams safely?


---

# Variable System Guide

## 1. Core Concepts
The system supports multi-level variable management to ensure variables can be correctly isolated, shared, and persisted across complex test Scenarios, Suites, and Cases.

## 2. Variable Scopes
Variables can be stored in four different scopes, prioritized from highest to lowest:
1.  **CASE**: Valid only within the current test case. Cleared after execution.
2.  **SUITE**: Shared across all test cases within the same suite.
3.  **SCENARIO**: Shared across all suites within a scenario run.
4.  **ENVIRONMENT**: Global variables defined in environment settings.

## 3. Auto-Namespacing
To prevent conflicts between different test cases or suites, the system automatically prefixes runtime variables:
*   **Case-level variables**: Automatically prefixed with `case_name.` (e.g., `login.token`).
*   **Suite-level variables**: Automatically prefixed with `suite_name.`.
*   **Scenario-level variables**: Automatically prefixed with `scenario_name.`.

**Note**: You can still access variables by their original name, but prefixes allow explicit referencing of specific sources.

## 4. Module Namespacing (RUN_MODULE)
When using the `RUN_MODULE` step to call a module, you can specify a **Namespace** (export alias):
*   **Function**: All basic variables extracted within the module will automatically have this namespace prefix when returned to the parent context.
*   **Example**: Calling a module with Namespace `buyer` will turn an internal `userId` variable into `buyer.userId`.
*   **Purpose**: Solves variable collision issues when the same module is called multiple times in a single scenario.

## 5. Data Lifecycle Management (DLM)
Evaluation strategies define the **Cache Persistence Level** of a dynamic expression. This ensures data consistency across different architectural boundaries of your test execution.

| Strategy | Cache Lifecycle | Best Use Case |
| :--- | :--- | :--- |
| **Every Time** | None (Real-time) | OTPs, unique nonces, dynamic timestamps. |
| **Once Per Case** | Current Case execution | Sharing a random name between input and validation steps. |
| **Once Per Suite** | Current Suite execution | Batch IDs shared across all tests in an "Order Suite". |
| **Once Per Scenario** | Current Scenario execution | A "New User ID" created in Signup and used in Checkout. |
| **Once Per Run** | Global Task execution | Execution UUIDs, environment-wide session tokens. |

## 6. Pipe Assignment & Hybrid Extraction
You can persist dynamic values or API responses directly as variables:
*   **Pipe Assignment**: `{{$generator() | set('var_name', 'scope')}}`.
*   **Hybrid Extraction (Smart Wait)**: Enable "Wait for API Response" in UI steps to add API extractors that capture data from background network traffic.
*   **Default Scope**: Both `set` pipe and Smart Wait extractors default to the **`CASE`** scope.
*   **Example**: `{{$timestamp() | set('order_time')}}` generates a timestamp and stores it in the current Case's `order_time` variable.

## 7. Best Practices
1.  **Prefer CASE Scope**: Unless a variable truly needs to be shared across multiple test cases, always use the `CASE` scope to keep the context clean.
2.  **Use Module Namespaces**: Set a clear Namespace for `RUN_MODULE` steps in complex flows to ensure robustness and readability.
3.  **Freeze Random Values**: If a random ID needs to be used across multiple steps (e.g., Create -> Query), use the 'Once Per Run' strategy or the 'set' pipe to freeze it.
