# QuantumQA User Guide

Welcome to the official user manual for **QuantumQA**, a unified E2E testing platform designed for UI automation and API testing. This document provides a functional breakdown of the system's features and workflows.

---

## Chapter 1: Introduction & System Setup

QuantumQA is a workstation for quality engineering that integrates browser automation with background service validation.

### Getting Started
1.  **Dependencies**: Ensure Node.js (v18+) and Playwright are installed in your environment.
2.  **Launching**: Run `npm run dev` to start the client (Vite) and server (Express) instances.
3.  **Database**: The system utilizes a local SQLite database (`database.sqlite`). To reset the database to its initial state, use the `FORCE_SEED=true` environment variable.

---

## Chapter 2: Organizational Hierarchy

The system organizes testing logic through a multi-layered architecture to support scalability from individual scripts to enterprise regression suites.

### 1. Projects
Projects serve as the root container. All assets, including Elements, API Templates, and Test Suites, are isolated within a project.

### 2. Test Plans
Test Plans are the top-level execution units used to orchestrate a sequence of **Scenarios**. They are typically used for high-level milestones such as regression cycles or smoke tests.

### 3. Test Scenarios
Scenarios represent business flows and aggregate multiple **Suites**.
- **Data-Driven Execution**: Scenarios support **DataRows**, allowing for the iteration of flows across different variable sets.
- **Iteration Strategies**: Defines how data rows drive the execution of child suites.

### 4. Test Suites
Functional groups of **Test Cases**.
- **Setup/Teardown**: Suites support steps that execute before the first case and after the last case.
- **Suite Variables**: Default variables shared across all cases within the suite.

### 5. Test Cases
The atomic unit of execution containing a sequence of **Test Steps**.

### 6. Test Modules
Reusable, parameterized blocks of steps.
- **Namespace Isolation**: When a module is called via `RUN_MODULE`, it can be assigned an export alias. Variables extracted within the module are prefixed with the alias to prevent collisions in the parent scope.

---

## Chapter 3: Test Assets & Page Object Model (POM)

Centralized management of selectors and API definitions ensures maintainability across test cycles.

### Element Repository
The Element Repository stores UI component definitions that can be referenced by name in test steps.
- **Selector Support**: Includes `CSS`, `XPATH`, `TEXT`, `ID`, and `TEST_ID`.
- **Verification**: Elements can be marked as "Verified" once their selectors are confirmed effective.

### API Asset Management
- **Endpoints**: Definition of request paths and methods. Supports environment-specific **Base URLs** within a single record.
- **Header Profiles**: Reusable collections of key-value pairs for request headers.
- **Body Templates**: Templates for JSON, XML, or Text payloads, supporting `{{variable}}` placeholders.

---

## Chapter 4: Action Dictionary

Test steps are composed of an **Action**, a **Target** (Element or Endpoint), and **Data** (Input values or Assertion criteria).

### UI Interaction Actions
- `OPEN`: Navigates to a specific URL.
- `CLICK` / `DOUBLE_CLICK` / `RIGHT_CLICK`: Mouse interaction events.
- `TYPE`: Input field interaction.
- `HOVER`: Triggers CSS hover states.
- `SELECT_OPTION`: Interacts with dropdown menus.
- `CHECK` / `UNCHECK`: Toggles checkbox or radio elements.
- `DRAG_AND_DROP`: Source-to-target movement.
- `UPLOAD_FILE` / `ATTACH_FILE`: Browser file dialog handling.
- `PRESS_KEY`: Simulates keyboard events (e.g., `Enter`, `Escape`).

### API Execution Actions
- `API_GET`, `API_POST`, `API_PUT`, `API_DELETE`: Executes HTTP requests using defined Endpoints, Header Profiles, and Body Templates.

### Control Flow Actions
- `WAIT`: Static delay in milliseconds.
- `RUN_MODULE`: Invocation of reusable modules with parameter overrides.
- `SWITCH_TO_WINDOW` / `SWITCH_TO_FRAME`: Browser context management.
- `ACCEPT_ALERT` / `DISMISS_ALERT`: JavaScript dialog handling.

---

## Chapter 5: Variable & Data System

QuantumQA includes an expression engine for dynamic data generation and transformation.

### Variable Scopes
1.  **ENVIRONMENT**: Global constants (e.g., `BASE_URL`).
2.  **SCENARIO**: Persists across suites during a scenario execution.
3.  **SUITE**: Shared among cases within a suite.
4.  **CASE**: Local to a single test case; cleared upon completion.

### Dynamic Generation
Supports `{{$generator()}}` syntax for real-time value creation:
- `timestamp()`, `uuid()`.
- `randomInt(min, max)`, `randomString(len)`, `randomEmail()`.
- `now("format")`: Formatted date/time strings.

### Transformation Pipes
Modify variable values using pipe syntax:
- `{{var_name | uppercase}}`
- `{{var_name | base64}}`
- `{{api_response | jsonPath("$.id")}}`
- `{{val | set("key", "SCOPE")}}`: Persists a value into a specific execution scope.

### Evaluation Strategies
- `EVERY_TIME`: Regenerated on every reference.
- `ONCE_PER_RUN`: Evaluated once and cached for the duration of the execution task.

---

## Chapter 6: Network & Assertions

### Network Synchronization (`waitForNetwork`)
UI steps can be configured to synchronize with background network traffic.
- **Data Capture**: Variable Extractors can be used to capture data from intercepted response bodies.

### Network Mocking (`networkMocks`)
Enables the interception and stubbing of network requests to simulate specific service behaviors or error states.

### Assertion Engine
- **UI Assertions**: `ASSERT_VISIBLE`, `ASSERT_TEXT`, `ASSERT_VALUE`, `ASSERT_URL`.
- **API Assertions**: Status code validation, JSON/XML path matching, and header verification.
- **Operators**: `EQUALS`, `CONTAINS`, `MATCHES_REGEX`, `EXISTS`.

---

## Chapter 7: Recording Engine

The platform provides integrated tools for automated step generation.

### UI Recorder
- Captures interactions and generates steps in real-time.
- Automatically identifies optimal selectors (prioritizing `TEST_ID` and `ARIA` attributes).
- Supports on-the-fly element definition within the repository.

### API Recorder
- Monitors and captures network traffic based on domain filters.
- Automatically maps discovered traffic to Endpoints and Environments.

---

## Chapter 8: Execution & Reporting

### Console & Settings
- **Real-time Logging**: Execution progress is streamed via Server-Sent Events (SSE).
- **Execution Mode**: Headless or headed browser configurations are available in Settings.
- **Viewports**: Custom resolution settings for UI test execution.

### Reports
Every execution task generates a persistent report containing:
- Step-by-step audit logs and timing data.
- Automated screenshots for UI failures.
- Traceability links to the source scenarios and cases.
