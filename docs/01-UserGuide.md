# QuantumQA User Guide

QuantumQA is a unified, low-code **AI-driven E2E testing platform** for deterministic UI and API automation. This guide covers everything you need to author, execute, and manage tests — from requirements management and AI test generation to recording, execution, and reporting.

> This manual is compiled against the **latest codebase** (Platform v2 / Agent 1.1+) and merges the v2 rewrite with the detailed reference content of the original guide.
> Scope: AI-assisted E2E testing platform — requirements management, AI test generation, NL test cases, AI recording, test authoring, execution, and reporting.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Quick Start](#2-quick-start)
3. [Interface & Navigation](#3-interface--navigation)
4. [Base Configuration (Projects / Environments / System)](#4-base-configuration)
5. [AI Provider Configuration](#5-ai-provider-configuration)
6. [Requirements Management](#6-requirements-management)
7. [AI Test Generation](#7-ai-test-generation)
8. [NL Test Cases](#8-nl-test-cases)
9. [AI Recorder](#9-ai-recorder)
10. [Test Designer (TestBuilder)](#10-test-designer-testbuilder)
11. [Step Actions Reference](#11-step-actions-reference)
12. [Assertions & Extractors](#12-assertions--extractors)
13. [Variable System](#13-variable-system)
14. [Dynamic Variables](#14-dynamic-variables)
15. [Object Repository (Pages & Elements)](#15-object-repository-pages--elements)
16. [Shared Modules](#16-shared-modules)
17. [API Assets](#17-api-assets)
18. [Network Waits & Mocks](#18-network-waits--mocks)
19. [Execution & Test Plans](#19-execution--test-plans)
20. [Reports & Dashboard](#20-reports--dashboard)
21. [Remote Agents](#21-remote-agents)
22. [CLI & Operations](#22-cli--operations)
23. [Frequently Asked Questions](#23-frequently-asked-questions)

---

## 1. Product Overview

QuantumQA closes the loop from **requirements → test design → recording → execution → reports** in a single web workspace:

- **AI Test Generation** — a multi-LLM-agent pipeline (Analyst / Designer / Quality Manager) converts Epics, Stories, and Acceptance Criteria into **Test Conditions** and **NL Test Cases**, with human-in-the-loop review **checkpoints**.
- **AI Recording** — an equipped agent executes NL test cases in a real browser and records every step into a draft suite.
- **Deterministic execution engine** — Playwright UI steps + API steps in one runner. No LLM in the execution path, so results are reproducible.
- **Remote Agents** — distribution of execution and recording to any machine over WebSocket, with live streamed logs.
- **Storage** — a single local SQLite file (`database.sqlite`), zero infrastructure.

---

## 2. Quick Start

### 2.1 Prerequisites

- Node.js **20.19 or newer**
- npm or yarn
- Network access to an LLM service to use AI features (Provider must be configured — see [§5](#5-ai-provider-configuration))

### 2.2 Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Install the browser engine (required for UI steps / recording)
npx playwright install chromium

# 3. Start the full-stack dev server (Express API + Vite + WebSocket)
npm run dev
```

Open <http://localhost:3000>. The dev server provides:

- **Express API** on port 3000
- **Vite HMR** for instant frontend updates
- **WebSocket** for real-time agent and recording communication

### 2.3 Seed Data (Optional)

```bash
# Reset & seed demo data (wipes the current database)
npm run seed

# Or reset the database at startup
FORCE_SEED=true npm run dev
```

The seed ships two demo projects:

| Project | Description |
| :--- | :--- |
| `p-aut-demo` | The built-in AUT (Application Under Test) demo — login `admin` / `admin123`, a "Login + Search" suite, endpoints, headers, body templates and dynamic variables included |
| `p-sauce-demo` | external Sauce Labs demo site with a "Login Flow" suite |

Seed data also creates `DEV` / `PROD` environments, global settings, and a full requirements tree (Epic "Authentication System" etc.).

### 2.4 Built-in AUT (sample app)

The `p-aut-demo` project targets a demo app served by the platform itself:

- Login page: `<platform>/aut/login` (`admin` / `admin123`)
- Backend API: `<platform>/aut-api/...`

Use it to try the record → execute loop immediately.

### 2.5 Production Build

```bash
npm run build   # produces dist/ (frontend + server bundle + agent bundle)
npm run start   # start production server
```

---

## 3. Interface & Navigation

The left sidebar groups features (collapsible):

| Group | Item | Purpose |
| :--- | :--- | :--- |
| **Platform** | Dashboard | overview: recent runs, pass-rate trend, flaky suites |
| | Run Tests | Execution of suites / scenarios / plans (Execution Console) |
| | Test Designer | Author & maintain suites / cases / steps (TestBuilder) |
| | Test Reports | Historical execution reports |
| | Object Repository | Page Object Model: Pages + Elements |
| | Shared Modules | Reusable parameterizable step groups |
| | Dynamic Variables | Project-level dynamic variable expressions |
| **Infrastructure** | Requirements | Requirements management (Epic / Story / AC) |
| | NL Test Cases | AI-generated natural-language test case library |
| | AI Recorder | AI scripted browser recording from NL cases |
| | AI Test Gen | AI test generation pipeline (multi-agent orchestra) |
| | Remote Agents | Manage remote execution nodes |
| **API Assets** | Endpoints | API endpoints with per-environment base URLs |
| | Headers | Reusable header profiles |
| | Body Templates | Reusable request body templates |
| Bottom | Documentation | Docs entry point |
| | Settings | Project / environment / system / AI provider config |

> The current project & environment are also selectable in the header; most asset pages require a project to be selected.

---

## 4. Base Configuration

Settings contains **4 tabs**.

### 4.1 Projects

- **Current Project** — switch active project (scope of all Project-scoped assets below).
- Create / delete projects ("New Project Name"). Deleting cascades to all its data.

### 4.2 Environments

- **Current Environment** — active environment decides API base URLs and environment-level variables.
- Names must be uppercase (e.g. `DEV`, `PROD`).
- Each environment stores a set of key/value variables referenced as `{{name}}`.

### 4.3 System

| Setting | Description |
| :--- | :--- |
| **Playwright Headless Mode** | Off shows the browser visually (useful for debugging UI execution). Default: headless |
| **Browser Viewport** | Width × Height (default 1920×1080) |
| **Record Execution Video** | Toggle recording of execution video (saved as files in the server's `videos/` directory; not embedded in reports) |

**Viewport behavior**:

- **Headless mode**: If both width and height are set, they are applied. Otherwise, defaults are used.
- **Non-headless mode**: Viewport is set to null, and the browser launches with `--start-maximized`.

---

## 5. AI Provider Configuration

AI features (AI Test Gen, AI Recorder) depend on **AI Providers** (Settings → AI Provider tab).

### 5.1 Supported Provider Types

| Type | Description | AI Test Gen | AI Recorder |
| :--- | :--- | :--- | :--- |
| `azure-openai` | Azure OpenAI — certified | ✅ | ✅ |
| `openai-compatible` | Any OpenAI-compatible endpoint (Ollama, vLLM, …) | ✅ | — (unverified) |
| `openai-responses` | OpenAI Responses API | ✅ | — (unverified) |

> AI Recorder can only be triggered with a certified provider (`azure-openai`). Anthropic / Google are not configurable in Settings.

### 5.2 Configuration Steps

1. Go to **Settings → AI Provider**.
2. Click **Add Provider**, fill: **Name**, **Provider** type, **Endpoint** (default `https://api.openai.com/v1`), **API Key**, **Models** (type + Enter to add multiple).
3. Click **Test** to verify connectivity — shows latency and output (success shows `Connected · 1234ms`).
4. Mark one as **SetAsActive** (default for test generation).
5. Providers can be copied and deleted. API keys are encrypted at rest in SQLite.

> Tip: `openai-compatible` allows connecting to a local inference server — you can run AI generation fully on an air-gapped network.

---

## 6. Requirements Management

### 6.1 The Tree

Left tree + right detail pane:

- Hierarchy: **Epic (purple dot) → Story (green dot) → AC (Acceptance Criteria)**, all support create/rename (ID collision validation), delete, drag to reorder, copy/paste.
- Node status: `DRAFT` / `APPROVED` / `DEPRECATED`.
- Stories can be flagged as a **Flow** (cross-component/end-to-end business flow). Flow stories are aggregated as first-class artifacts by the AI pipeline.

### 6.2 Recommended Formats

**Story** (Markdown and free-form prose both supported):

```
As a <role>
I want <action>
So that <value>
```

**AC**:

```
Given <precondition>
When <action>
Then <observable result>
```

> Format help tooltips are available on the detail views. Non-conforming text still saves — it just parses with fewer highlighted segments.

### 6.3 Import

Supports **Markdown** and **CSV** via the Import modal:

- **Markdown**: heading hierarchy (`#` → Epic, `##` / `###` → Story, `####` → AC).
- **CSV**: column-structured rows.

Validation warnings are shown before import (missing fields, duplicate IDs…); you can force-import. The result reports "imported N items".

---

## 7. AI Test Generation

**Entry**: sidebar **Infrastructure → AI Test Gen** (requires an active project and a configured AI Provider).

The page has 4 tabs: **New / Runtime / History / Agent Prompts**.

### 7.1 New (Start Configuration)

Three-column layout:

**Left — Requirement selection**
Check the stories to analyze (Flow stories use a purple "Flow" checkbox). Select all / Expand / Collapse supported. Selected counts show in badges (blue = component stories, purple = flow stories).

**Middle — Story detail**
Live preview of the selected Story's ACs (parsed `Given / When / Then`), so you see exactly which acceptance points will be fed to the AI.

**Right — Run Settings**

| Option | Description |
| :--- | :--- |
| **Run Mode** | `Interactive`: pause at each checkpoint for human review/approval; `Auto`: take all checkpoints automatically |
| **Model** | Dropdown of models from all configured Providers (e.g. `gpt-4o (azure-openai)`) |
| **Reasoning Effort** | `low / medium / high` (where supported) |
| **Reasoning Summary** (some providers) | `auto / detailed / concise` |
| **Text Verbosity** (some providers) | output verbosity level |
| **Prompt Cache** | "Disable cache" checkbox (checked by default) — prompt caching is off, so responses are always fresh |
| **HTML Knowledge** | Optional multi-file HTML evidence used to ground controls, validation, content, and navigation for this run |
| **Reference Previous Runs** | Select completed runs so this round avoids duplicates (deduplication) |
| **Test Levels** | Always on: every run produces both **component** and **integration** level cases (tagged `testLevel`) |

Click **Start Test Gen** (requires ≥1 selected requirement + a selected model).

#### 7.1.1 Optional HTML Knowledge

Use **Settings → HTML Knowledge** when you have static HTML for the pages covered by the selected requirements. HTML is optional; with **No HTML selected**, the run behaves as before.

**Select and prepare pages**:

1. Under **Attach page HTML**, click **Choose HTML files** and make one multi-file selection.
2. Select 1-20 `.html` or `.htm` files. Each file may be at most **512 KiB**, and the complete selection may be at most **5 MiB**. Duplicate file names are not allowed, including names that differ only by case.
3. The selection replaces any previous HTML selection. The panel shows the file count, total size, and one row per file.
4. The platform creates a manifest, uploads and parses the pages, then automatically finalizes the set as soon as every remaining page is ready. There is no separate Finalize action.
5. Wait for **HTML knowledge ready**, then click **Start Test Gen**. While the panel says **Preparing HTML knowledge**, **HTML selection is invalid**, or **HTML knowledge needs attention**, **Start Test Gen** is disabled.

Per-file statuses and actions:

| Status | Meaning and action |
| :--- | :--- |
| `PENDING` | Before manifest creation, this can be a client-local row for a valid selection. After creation, it is mapped to a server-persisted page that is waiting to upload. |
| `UPLOADING` | The browser is uploading the page and the server is parsing/indexing it. |
| `READY` | The page was indexed successfully. When all remaining rows are `READY`, finalization runs automatically. |
| `FAILED` | This can be a local validation error or a server-backed upload/index failure. **Retry** appears only for the server-backed page; otherwise use **Remove** or choose a new valid selection. |

For local validation failures, the panel states **Validation errors cannot be retried. Remove invalid files or choose a new valid selection.** Once the manifest exists, page-level **Retry** is used for upload/index request failures. If manifest creation or automatic finalization fails, the panel instead shows the set-level action **Retry set**. A lost upload/finalize response is reconciled against persisted server status before the operation is retried.

After ownership and mutable-set preflight succeeds, the server records the page as `FAILED` and leaves it retryable when it rejects non-identity content encoding, a missing/malformed/unsupported HTML media type or charset, or an oversized request with HTTP `413`. Upload admission is limited to two concurrent requests before body receipt; a body that does not complete within 30 seconds returns JSON `408` and releases its slot. A wrong project/page, an upload-rate or parser-capacity `429`, and an aborted or timed-out request do not change the persisted page state. The client reconciles the existing server-backed row after request failures.

Removing the final file returns the panel to **No HTML selected**. Because a finalized set is immutable, removing a `READY` page after finalization automatically deletes that unbound set and rebuilds/finalizes a new set from the remaining files.

A `LOW_INFORMATION` result is non-blocking and appears as:

> **Low information. A rendered DOM snapshot may provide better knowledge.**

This is common for single-page applications whose saved source contains only a framework mount element and script references. Upload a saved **rendered DOM snapshot** if you need labels, controls, validation text, or links created by JavaScript. The platform does not render the page or infer JavaScript-only behavior itself.

**How the evidence is used**:

- Requirements, acceptance criteria, and approved flows remain authoritative. HTML cannot override them or add tests for unrelated features that only appear in the markup.
- HTML can make generated cases more concrete by supplying static page/field/button names, labels, IDs, input types, required/min/max/length/pattern constraints, validation text, link targets, form actions, and relationships between uploaded pages.
- HTML is supporting evidence, not proof of runtime visibility or behavior. No relevant match does not prove that a requirement is unimplemented.
- The Analyst uses it to refine UI risks, boundaries, states, and interactions; the Designer uses it for concrete steps and requirement-consistent cross-page ordering; the Quality Manager uses it to check fabricated controls, constraints, navigation, and page names.

**Safety and provider disclosure**:

- The panel states: **Relevant HTML excerpts may be sent to the configured AI provider.** If the selected provider is remote, tool responses containing bounded structured evidence and safe page metadata/outlines, including file names, page titles, and warnings, may leave your network. This includes metadata-only fallback results when no chunk matches. Complete HTML files are not inserted into the normal initial agent prompts.
- **Scripts are not executed and linked resources are not fetched.** The server parses static markup without opening it in a browser, and the UI never renders uploaded HTML.
- Script/style content and executable URLs are not searchable evidence; URL-derived evidence also drops URL credentials and query values. Only bounded structured evidence and safe metadata/outlines are exposed to agents.

**Cleanup and deletion**:

- Before a run starts, replacing the selection, clicking **Reset** or **Clear**, leaving the **New** tab, switching projects, or removing the last page triggers best-effort deletion of the unbound set.
- If that browser cleanup cannot complete, the server deletes abandoned unbound sets after 24 hours. Cleanup runs once when the server starts listening and then hourly.
- After **Start Test Gen**, the finalized set is bound to that run and cannot be edited directly. It remains available for checkpoint resume and retry, including after requirement text is changed.
- Deleting the Test Gen run deletes its bound HTML source and index. Deleting the project first stops and deletes its Test Gen runs, then removes both bound and unbound HTML knowledge.

### 7.2 Runtime — Pipeline

The Pipeline renders phase/node cards vertically; click any node to inspect it:

| Phase | Node | Output |
| :--- | :--- | :--- |
| Preparation | `preparation` "Initialize Environment" | environment skeleton, requirement landscape, flow list |
| Analysis | `agent_test_analyst` "Test Analyst" | Test Conditions with risk, technique, data needs, dependencies |
| | `checkpoint_1` "Review Conditions" | human checkpoint 1 |
| Design | `agent_test_designer` "Test Designer" | drafts NL test cases from conditions |
| | `checkpoint_2` "Review Drafts" | human checkpoint 2 |
| Quality | `agent_quality_manager` "Quality Manager" | coverage matrix + final review (auto-repairs back to Designer on issues) |
| | `checkpoint_3` "Final Review" | final checkpoint |
| Complete | `complete` "Test Gen Complete" | **Save to NL Test Cases** |

Node status badges: `Action Required` (amber), `Done` (green), `Error` (red), `Running` (blue pulse).

### 7.3 Checkpoint Interaction

- In **Interactive** mode every checkpoint pauses; toolbar shows **Approve** (continue) and **Retry** (re-run the agent for that stage).
- You can review the agent's **Streaming Thinking** and raw outputs before approving.
- On error, a **Retry from last checkpoint** button appears; interrupted runs can be resumed from **History**.

### 7.4 Inspecting a Node (Detail panel)

Per-node tabs:

- **Summary** — structured, formatted summary (conditions cards, draft NL cards, coverage…).
- **Streaming Thinking** — live reasoning stream (phase 1 reasoning, phase 2 structured extraction).
- **Prompts** — the system/user prompt payloads sent to the LLM.
- **Output** — raw structured outputs (JSON).
- **Trace Logs / Errors** — per-batch latency, token usage, error stack traces.

For multi-batch runs, use the batch pills (All / per-batch status) to switch views.

### 7.5 History

- List every run with status badges: **Completed** (green), **Running** (blue), **Waiting Review** (orange), **Failed** (red), **Paused**.
- Search, status filter (All / Completed / Running / Waiting / Failed — no Paused option), **multi-select bulk delete**, and **Retry** for failed runs / **Resume** for aborted ones.
- **Resumption & Recovery**: The pipeline uses a robust Checkpoint System. If a run is interrupted (e.g., server restart or manual abort), it can be seamlessly recovered from the exact last successful node.

### 7.6 Agent Prompts (Customization)

Three agents with interchangeable models, per-agent tool toggles, and prompt editors (save / reset):

| Agent | Tools |
| :--- | :--- |
| `test_analyst` | requirement_detail_query, requirement_graph_query, flow_detail_query, istqb_equivalence_partitioning, istqb_boundary_value_analysis, istqb_decision_table, istqb_state_transition, istqb_use_case_testing, knowledge_base, html_knowledge_query |
| `test_designer` | same tool list as `test_analyst` |
| `quality_manager` | requirement_detail_query, knowledge_base, html_knowledge_query |

`html_knowledge_query` is shown for all three roles, but the server registers it for execution only when the run has a finalized HTML Knowledge set. Its source-of-truth rules are appended even when an agent uses a custom prompt.

---

## 8. NL Test Cases

All generated cases live here:

- Columns: title, priority (Critical / High / Medium / Low), category (happy-path / alternate / error / boundary), status (Draft / Approved / Final), actions.
- Search + filter by status / priority / category.
- Actions per case:
  - **View**: preconditions, step sequence (action → expected), postconditions, test data, tags, source links (Requirement / Condition / Technique).
  - **Edit**: title, pre/postconditions, steps, test data, priority/category/tags inline.
  - **Approve**: mark as approved (required before turning it over to AI recording).
  - **Record with AI** (AI Record): hand the case to the AI Recorder to execute & record.
  - **Delete**.

> Recommended lifecycle: **AI Test Gen → (Save) → NL Cases → review → Approve → AI Record → draft suite → finalize in Test Designer → execute**.

---

## 9. AI Recorder

Entry points: **Record with AI** in NL Test Cases, or sidebar **Infrastructure → AI Recorder**.

Tabs: **New / Runtime / History**.

### 9.1 New

- Select the NL case — its steps render as script: **Preconditions → Steps → Test Data → Postconditions → Tags**.
- Select an **AI Provider** (only `azure-openai` is certified; other provider types are unverified and cannot trigger AI recording).
- Run settings: **Max Retries / Step** and **Timeout**.
- Click **Start** — the platform hands each step to the LLM, driving a real browser step-by-step (element targeting, network capturing) and records everything.

### 9.2 Runtime

- Step-by-step realtime streaming: `step started → completed / failed`.
- Connection status (Connected / Disconnected), and **Abort** available.
- **Takeover**: take manual control mid-run; already-recorded steps are kept and the rest is finished manually.
- Under the hood, the server spawns a **Stagehand-powered** session on an available remote agent; the AI performs `act()` / `observe()` operations to execute the test steps against the target application.
- Upon completion (or takeover), the raw recorded events pass through a purely functional **Refiner Pipeline**. The Refiner automatically performs parameterization, secret redaction, step consolidation, and maps UI targets to the Object Repository (Page Object Model).
- Finally, a **draft suite + draft case** is produced (suite id `ai-draft-suite`, case id `ai-draft-case`, suite name `[AI Draft] <Title>`); **View Draft Suite in Test Builder** jumps to the Test Designer to finalize.

### 9.3 History

Shows past runs (id, status, created time) with refresh/delete.

---

## 10. Test Designer (TestBuilder)

Organized as **Suite → Case → Step**.

### 10.1 Left: Test Explorer

- Search box ("Test explorer" tooltip), **Refresh**, and **Add Suite**.
- Suite row: click to expand; hover actions — **Move Suite Up/Down**, rename (inline), **Delete Suite**, **Paste Case** (pastes a copied case).
- Case rows: move up/down, **Copy Case** (to clipboard), rename, delete (with confirm), **New Case** adds a case to the expanded suite.

### 10.2 Case Editor

Header: breadcrumb (suite name → back) + autosave case name + buttons:

- **Record Steps** — opens the recording modal (§10.4);
- **Run** — pushes the case to the Execution Console.

Body: three collapsible step sections:

1. **Suite (Setup) Steps** / **Case Setup Steps**
2. **Test Steps** (main, default expanded)
3. **Teardown Steps** (mostly collapsed)

### 10.3 Step Editor

Each step row:

| Column | Description |
| :--- | :--- |
| # | drag to reorder |
| **Action** | action dropdown (groups per §11) |
| **Target / Module** | `PageName.ElementName` or CSS selector, with element-repo picker & variable picker; for `runModule` a module dropdown |
| **Value / Data** | changes by action: URL / text / duration / option value / file path; API steps: headers, body, variables overrides |

Row actions: enable/disable, screenshot on/off, duplicate, delete (confirm).

**Advanced Settings** (per step):

- **Smart Wait (network wait)** — "Wait for api/*": URL contains / keyword, method, expected status, timeout; plus **API Extractors** in hybrid extraction mode.
- **Network Mocks** — mock rules: URL regex, method, status, delay (ms), response body JSON.
- **Assertions** — assertion editor (§12). With ≥1 assertion, a failure strategy selector: **Fail-fast** (stop) or **Soft** (collect all, continue).
- **Variable Extractors** — capture into case/suite/scenario/environment scopes.

Footer quick add: **Add Web Step / Add API Step / Add Module**.

### 10.4 Interactive Manual Recording Modal

*(Note: For fully automated AI recording from NL cases, see [§9 AI Recorder](#9-ai-recorder). This section covers traditional manual interactive recording.)*

From a case header:

- **Target URL** (defaults to `${window.location.origin}/aut/login`).
- **Recording Mode**: `UI Steps Only` / `API Requests Only` / `All Events` — no toolbar overlays; the dialog controls the session.
- **Run target**: a remote agent is required — the recorder cannot run on the local server itself.
- **API Record Filter (optional)**:
  - Simple: text containment (only URLs containing this text).
  - Advanced: rule builder — Include/Exclude + conditions over URL/Method/Status (contains/starts/ends/equals/regex), any/all semantics, "Add Rule".

Use **Stop Recording** with the case header to finish.

> Recorded sessions auto-create Objects (elements) and API assets (endpoints/headers/bodies) and write step targets as `Page.Element` references.

---

## 11. Step Actions Reference

### 11.1 Step Fields

Each step row stores the following fields:

| Field | Required | Description |
| :--- | :--- | :--- |
| `action` | Yes | The action type (see the tables below) |
| `target` | Varies | Element selector or `PageName.ElementName` reference |
| `data` | Varies | Action payload (URL, text, key name, etc.) |
| `description` | No | Human-readable description |
| `enabled` | No | If `false`, step is skipped (default `true`) |
| `screenshot` | No | Capture screenshot after step |
| `extractors` | No | Variable extractors to run after step |
| `assertions` | No | Assertions to evaluate after step |
| `failureStrategy` | No | Assertion failure mode: `soft` (default) or `fail-fast` |
| `waitForNetwork` | No | Wait for a specific network response |
| `networkMocks` | No | Mock/intercept network requests |

### 11.2 Web Actions

| Action | Description |
| :--- | :--- |
| `goto` | navigate to URL |
| `click` / `dblclick` / `rightClick` | click / double-click / right-click |
| `fill` | enter text (clears first) |
| `clear` | clear input |
| `press` | key sequence (`Enter`, `Ctrl+A`, …) |
| `hover` / `scrollIntoView` | hover / scroll into view |
| `selectOption` | dropdown selection |
| `check` / `uncheck` / `toggle` | checkbox/radio control |
| `waitForTimeout` / `waitForVisible` / `waitForHidden` | waits |
| `extractVar` | extract element text/value to a variable |
| `evaluate` | run JS in the page, return value (optionally store) |
| `setInputFiles` | attach files |
| `dragTo` | drag & drop |
| `highlight` | flash-highlight an element |

### 11.3 Assertion Actions (fast)

The built-in assertion shortcut actions — `assertVisible` / `assertHidden` / `assertInvisible` / `assertNotExist` / `assertAttribute` / `assertEnabled` / `assertDisabled` / `assertChecked` / `assertUnchecked` / `assertText` / `assertValue` / `assertUrl` / `assertTitle` — are simple checks; for real assertions use the assertion editor (§12). Both coexist: the shortcut actions are convenient for simple checks, while `step.assertions` provides multi-assertion, multi-source, soft-mode capabilities.

### 11.4 Browser / Dialog Actions

`switchToWindow` (by url/title), `switchToFrame` (frame selector), `acceptDialog` / `dismissDialog`.

### 11.5 API Step Actions

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

### 11.6 Modules & Logic

`runModule`: run a shared module (§16) — data JSON overrides parameters, optional **namespace** aliases for extracted variables.

---

## 12. Assertions & Extractors

Any step can carry multiple assertions and extractors (Advanced Settings).

### 12.1 Assertion Editor Fields

| Field | Description |
| :--- | :--- |
| Source | UI: text / value / attribute / page url / page title / element count / element visible / element enabled / element checked; API: status / header / body json / body xml / body regex / duration |
| Operator | `equals`, `not_equals`, `contains`, `not_contains`, `exists`, `not_exists`, `matches_regex`, `greater_than`, `less_than`, `greater_than_or_equal`, `less_than_or_equal`, `is_type`, `has_length`, `contains_key`, `matches_json_schema` — plus duration-only `less_than_duration` / `greater_than_duration` for API sources |
| Expression | JSONPath (`$.data.id`), XPath, header name, attribute name, regex when relevant |
| Expected | expected value for the operator |
| Message | optional custom failure message |
| **On failure** | step-level `Fail Fast` (first failure aborts the case) or `Soft` (evaluate all, log, continue) |

Example: API Get Users → assert `status equals 200` and `body json $.data.length is_type number`.

#### 12.1.1 Assertion Sources (detailed)

**API sources** (available on API steps):

| Source | Expression | Description |
| :--- | :--- | :--- |
| `API_STATUS` | — | HTTP response status code |
| `API_HEADER` | Header name | Response header value (case-insensitive lookup) |
| `API_BODY_JSON` | JSONPath | JSON body value via JSONPath (e.g. `$.data.id`) |
| `API_BODY_XML` | Dot-path | XML body (auto-converted to JSON; attributes prefixed `@_`) |
| `API_DURATION` | — | Request duration in milliseconds |

**UI sources** (available on UI steps):

| Source | Expression | Description |
| :--- | :--- | :--- |
| `UI_TEXT` | — | Element text content |
| `UI_VALUE` | — | Input element value |
| `UI_ATTRIBUTE` | Attribute name | HTML attribute value (e.g. `href`, `src`, `class`) |
| `UI_PAGE_URL` | — | Current page URL |
| `UI_PAGE_TITLE` | — | Current page title |
| `UI_ELEMENT_COUNT` | — | Number of matching elements |
| `UI_ELEMENT_STATE` | — | Element state: `visible`, `hidden`, `enabled`, `disabled` |

#### 12.1.2 Assertion Operators

| Operator | Expected Value | Applicable Sources | Description |
| :--- | :--- | :--- | :--- |
| `EQUALS` | Yes | All | Exact string equality |
| `NOT_EQUALS` | Yes | All | String not equal |
| `CONTAINS` | Yes | All | String contains substring |
| `NOT_CONTAINS` | Yes | All | String does not contain substring |
| `EXISTS` | No | All | Value is present (not null/undefined) |
| `NOT_EXISTS` | No | All | Value is absent |
| `MATCHES_REGEX` | Yes (regex) | All | Value matches regex pattern; use `flags` field for modifiers |
| `GREATER_THAN` | Yes (number) | Numeric | Strictly greater than |
| `LESS_THAN` | Yes (number) | Numeric | Strictly less than |
| `GREATER_THAN_OR_EQUAL` | Yes (number) | Numeric | Greater than or equal |
| `LESS_THAN_OR_EQUAL` | Yes (number) | Numeric | Less than or equal |
| `IS_TYPE` | Yes (type name) | All | Type check: `string`, `number`, `boolean`, `array`, `object`, `null` |
| `HAS_LENGTH` | Yes (number) | String/Array/Object | Length check (string length, array length, or object key count) |
| `CONTAINS_KEY` | Yes (key name) | Object | Object contains the specified key |
| `MATCHES_JSON_SCHEMA` | Yes (JSON Schema) | Object/Any | Validates value against a JSON Schema (Draft-07, powered by Ajv) |
| `LESS_THAN_DURATION` | Yes (ms) | `API_DURATION` | Response duration is less than threshold |

### 12.2 Failure Strategy

Each step with assertions can choose a **failure strategy**:

| Strategy | Behavior |
| :--- | :--- |
| **Soft** (default) | All assertions are evaluated; failures are collected and logged, but the step does **not** throw. Subsequent steps continue. |
| **Fail Fast** | The first assertion failure (without `continueOnFailure`) stops evaluation immediately and throws, halting the current case. |

Per-assertion `continueOnFailure: true` overrides the step-level strategy, allowing a single assertion to always continue regardless.

### 12.3 Assertion Examples

**API step — status and body check:**
- **Source**: `API_STATUS` → **Operator**: `EQUALS` → **Expected**: `200`
- **Source**: `API_BODY_JSON` → **Expression**: `$.user.name` → **Operator**: `CONTAINS` → **Expected**: `Admin`

**API step — duration and schema validation:**
- **Source**: `API_DURATION` → **Operator**: `LESS_THAN_DURATION` → **Expected**: `500`
- **Source**: `API_BODY_JSON` → **Expression**: `$.data` → **Operator**: `MATCHES_JSON_SCHEMA` → **Expected**: `{"type":"object","required":["id","name"]}`

**UI step — element text and state:**
- **Source**: `UI_TEXT` → **Operator**: `CONTAINS` → **Expected**: `Welcome`
- **Source**: `UI_ELEMENT_STATE` → **Operator**: `EQUALS` → **Expected**: `visible`

**UI step — attribute check with soft mode:**
- **Source**: `UI_ATTRIBUTE` → **Expression**: `href` → **Operator**: `CONTAINS` → **Expected**: `/dashboard` → **continueOnFailure**: `true`

### 12.4 Extractors

Capture runtime values into variables:

- **Sources**: API — body JSON/XML, regex, header; UI — text, value, attribute, page URL, page title.
- **Scope**: **Case / Suite / Scenario / Environment** — lower scopes have shorter lifetimes but higher precedence (§13).

**Extractor fields**:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | Variable name to store the value as |
| `source` | enum | Yes | Where to extract from |
| `expression` | string | Varies | JSONPath, XPath, regex, header name, or attribute name |
| `scope` | `CASE` \| `SUITE` \| `SCENARIO` \| `ENVIRONMENT` | Yes | Variable lifetime scope |

**Extractor sources**:

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

**Extraction example**

After an `API_POST` step that returns `{"id": 123, "token": "abc"}`, add an extractor:
- **Source**: `API_BODY_JSON`
- **Expression**: `$.id`
- **Name**: `userId`
- **Scope**: `SCENARIO`

The variable `{{userId}}` is then available at `SCENARIO` priority for the rest of the scenario.

---

## 13. Variable System

### 13.1 Syntax

```text
{{variableName}}          reference
{{$uuid()}}               generator
{{ref | transform}}       pipeline transform
```

### 13.2 Generators

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

### 13.3 Transforms

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

**Transform examples**:

```
{{email | trim | lowercase | md5}}
{{token | base64Decode | jsonPath('$.userId')}}
{{$randomInt(1,100) | set('randomNumber', 'SUITE')}}
{{name | default('Anonymous')}}
```

### 13.4 Scope Precedence

From lowest to highest (a name may exist at multiple levels; higher wins):

1. DYNAMIC (dynamic variables)
2. ENVIRONMENT (env key/values)
3. RUNTIME_ENVIRONMENT
4. SUITE
5. SUITE_DATA
6. RUNTIME_SUITE
7. MODULE_DEFAULT (module parameter defaults)
8. SCENARIO
9. SCENARIO_DATA
10. RUNTIME_SCENARIO
11. OVERRIDE (manual run overrides)
12. CALLER_OVERRIDE (module caller overrides)
13. CASE (case-extracted — highest)

> `runModule` child contexts are sandboxed: they only inherit DYNAMIC / ENVIRONMENT / RUNTIME_ENVIRONMENT / RUNTIME_SUITE / RUNTIME_SCENARIO.

### 13.5 Auto-Namespace

Extracted variables are stored with an automatic prefix to avoid collisions: `caseName.varName`, `suiteName.varName`, `scenarioName.varName` (environment-level has none).

### 13.6 Nested Resolution

Variables can reference other variables. The engine resolves up to 5 iterations to handle chains:

```
{{baseUrl}}/{{apiPath}}   →   https://api.example.com/v1/users
```

---

## 14. Dynamic Variables

Project-level expressions evaluated at the DYNAMIC layer (lowest precedence — any scoped variable overrides it):

- Expression supports generators + pipes: e.g. `{{$randomEmail()}}`.
- Strategy: `EVERY_TIME` (re-evaluate on each interpolate) / `ONCE_PER_RUN` / `ONCE_PER_CASE` / `ONCE_PER_SUITE` / `ONCE_PER_SCENARIO`.

> Recipe: `$randomEmail()` + `ONCE_PER_CASE` = unique email per case.

**Example** — create a dynamic variable:
- **Name**: `testEmail`
- **Expression**: `{{$randomEmail()}}`
- **Strategy**: `ONCE_PER_CASE`

Every test case will generate a unique email, but it remains consistent within each case.

---

## 15. Object Repository (Pages & Elements)

The Element Repository decouples test steps from brittle UI selectors.

### How It Works

1. Organize as **Pages → Elements**.
2. Elements use smart selectors — Playwright's own selector engine (`internal:role=`, `internal:label=`, `internal:testid=` with CSS fallback) — the same generator `playwright codegen` uses.
3. Steps reference `PageName.ElementName` (e.g., `LoginPage.usernameInput`); if a selector changes, update it in one place — all referencing steps are automatically updated.

### Selector Generation (Recording)

The recorder leverages **Playwright's official selector engine** (`InjectedScript.generateSelectorSimple`) to produce the most resilient selectors:

| Selector Pattern | Example | Resilience |
| :--- | :--- | :--- |
| `internal:role=...` | `internal:role=button[name="Sign in"i]` | High — survives layout/class changes |
| `internal:label=...` | `internal:label="Email"` | High — tied to accessible label |
| `internal:testid=...` | `internal:testid=login-btn` | Highest — explicit stable identifier |

If the official engine fails (rare), a minimal **CSS fallback** is used (element ID → `data-testid` → `name` attribute → structural path).

---

## 16. Shared Modules

Parameterized step groups reused from any case via `runModule` (login, order creation…). Parameters interpolate through `{{moduleParam}}`, caller overrides, and namespace variable aliases.

### Module Structure

| Field | Description |
| :--- | :--- |
| **Name** | Module name |
| **Parameters** | Named parameters with default values |
| **Steps** | The step sequence to execute |

### Invoking a Module

Use the `runModule` action in a test step:

| Field | Value |
| :--- | :--- |
| `action` | `runModule` |
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

## 17. API Assets

### 17.1 Endpoints

- Name, per-environment **BaseUrl**s (DEV / PROD differ), path, query params.
- API steps only reference an endpoint; the current environment defines the full URL.

### 17.2 Headers Profiles

Reusable header sets (e.g. `Authorization: Bearer {{token}}`), selectable in API steps.

### 17.3 Body Templates

JSON bodies with interpolation: `{"username": "{{username}}"}` with a content type.

> Best practice: define your endpoints (dev + prod), one auth header profile and one body per operation — then all API steps reuse them and environment switching is a one-click change.

---

## 18. Network Waits & Mocks

### 18.1 waitForNetwork

Configure a step to wait for a specific network response after execution:

| Field | Description |
| :--- | :--- |
| **URL Pattern** | Wildcard pattern to match the network request URL |
| **Status Code** (optional) | Expected HTTP status code |
| **Timeout** | Maximum wait time in milliseconds |

Assertions and extractors can be applied to the matched network response.

### 18.2 Network Mocks

Intercept and mock network requests during a step:

| Field | Description |
| :--- | :--- |
| **URL Pattern** | Wildcard pattern to match requests |
| **Response Status** | Mock HTTP status code |
| **Response Body** | Mock response body (supports interpolation) |
| **Response Headers** | Mock response headers |

---

## 19. Execution & Test Plans

### 19.1 Execution Targets (Run Tests)

| Target | Runs |
| :--- | :--- |
| **Suite** | all cases in a suite (or a single case) |
| **Scenario** | composed suites (with variable overrides / data source) |
| **Plan** | ordered scenarios (Test Plan) |

### 19.2 Test Plan Builder

In **Run Tests → Plans** tab:

- Create **Scenario** with name + description; click **Add to Scenario** on suites; reorder with Move Up/Down.
- Scenario-scoped variables, incl. **Import all unique variables from suites in this scenario**.
- **Data Driven Executions** — data rows tables at scenario- and suite-level.
- Suite-level entries in a scenario support variable overrides and a data source choice (scenario row-drives vs suite-row-drives).
- Assemble plans from scenarios in order, then run.

**Data rows** — both suites and scenarios support data rows (arrays of key-value records that drive iterative execution). If a suite has 3 cases and 5 data rows, the total execution count is `3 × 5 = 15`. The `ScenarioSuite.dataSource` field controls which data rows drive iteration: `SCENARIO` (default — suite-internal `dataRows` are ignored; prevents unwanted multiplication) or `SUITE` (suite uses its own data rows).

### 19.3 Execution Console

Streams step-by-step logs live:

- **Console Output**: mixed UI/API step logs, run status, queue position.
- **Run Target**: choose local (server) vs a remote agent (`QUEUE:ANY` / labels / explicit agent).
- Environment to use for the run is selectable.
- **Abort** at any time.

Queueing: multiple runs can be enqueued per target. Logs and progress are streamed in real time (**SSE** — execution logs/progress server→client; **WebSocket** — agent status, recording events).

### 19.4 Execution Order

```
Plan
 └─ for each scenario in order
     └─ scenario data rows × composed suites
         ├── Setup steps (suite / case)
         ├── Main steps (case)
         ├── Assertions / network waits
         └── Teardown steps (suite / case)
```

**Failure handling**:

- Per-step assertions follow their failure strategy.
- Per-case fail-fast: any step failure stops the current case; a case failure does not normally stop other cases (suite continues).
- Always-run teardown: suite and case teardown steps execute in `finally` blocks regardless of failures.
- **Abort** is supported at any loop boundary (throws `'Execution aborted'`).

---

## 20. Reports & Dashboard

### 20.1 Reports

Each run produces a report (Test Reports page):

- Summary: pass/fail counts, pass rate, duration (videos are saved as files, not embedded in reports).
- Per-step details: status, timestamps, logs, assertion results, extracted values, screenshots.
- Filter/clear historical reports; individual report deletion.

### 20.2 Dashboard

- Stat cards: Total Environments, Total Scenarios, Repository Cases, Plan Runs Recorded (plus others).
- **Historical Pass Rate Trend** — chart across runs.
- **Flaky Suites** — suites that frequently toggle PASS/FAIL across consecutive plan runs.
- Latest plan run summary card (status / runtime).

---

## 21. Remote Agents

### 21.1 Concept

Agents are separate Node.js processes (Windows/Linux/macOS) connecting to the server over WebSocket:

- Responsibilities: **execute tests** (UI/API) and **record** (browser actions, element capture, API capture).
- Each agent reports version (`1.1`), system info, labels, status (Idle / Busy / Offline / Disabled), last activity.

### 21.2 Setup

1. **Package mode (recommended)**: click **Download Agent** on the Remote Agents page → unzip `quantum-qa-agent.zip`, edit `.env` (`AGENT_SECRET` must match server), run the platform-appropriate launcher (`start-agent.bat` / `.sh`). The script installs dependencies & Playwright and connects.
2. **From source (dev/debug)**:

   ```bash
   npm install
   npx playwright install chromium
   npm run start-agent -- --url ws://<server>:3000 --name my-agent
   ```

   (env: `SERVER_URL`, `AGENT_ID`, `AGENT_SECRET`)

Watch it appear in Remote Agents (green badge).

**Agent configuration**:

| Config | Env Var | CLI Arg | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| Server URL | `SERVER_URL` | `--url` | `ws://localhost:3000` | WebSocket URL of the server |
| Agent ID | `AGENT_ID` | `--name` | `agent-<random>` | Unique agent identifier |
| Auth Secret | `AGENT_SECRET` | — | — | Must match server's `AGENT_SECRET` |

### 21.3 Management

- **Enable / Disable** — disabled agents get no tasks.
- **Labels** — used for targeted dispatch.
- **Live Console / logs** — per-agent terminal-style log viewer (`N lines`, Clear).
- **Delete** — remove from registry (stop the agent process first).

### 21.4 Task Dispatch Strategies

| Strategy | Format | Description |
| :--- | :--- | :--- |
| Targeted | `QUEUE:AGENT_ID:xxx` | Dispatch to a specific agent |
| Label-based | `QUEUE:LABEL:xxx` | Dispatch to any agent with matching label |
| Any-agent | `QUEUE:ANY` | Dispatch to the first idle agent |

### 21.5 Choosing a Target

Any execution selects the execution target; the local server is the default for **tests**, but **AI recording requires a remote agent** (local-server recording is not supported).

---

## 22. CLI & Operations

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | full-stack dev server |
| `npm run build` | production build (frontend + server + agent bundle) |
| `npm run start` | production start |
| `npm run seed` | reset & seed demo data |
| `FORCE_SEED=true npm run dev` | start with db reset |
| `npm run migrate` | run standalone migrations |
| `npm run export:seed` | export current DB state as seed TS |
| `npm run start-agent` | start a local agent |

Environment variables:

| Variable | Purpose |
| :--- | :--- |
| `PORT` | port (default 3000) |
| `AGENT_SECRET` | WebSocket agent secret |
| `FORCE_SEED` | drop & reseed at startup |
| `HEADLESS` | default headless for agent browser automation |

> Data: `database.sqlite` — use a persistent volume in prod and backup routinely.

### 22.1 Docker Deployment

QuantumQA includes a multi-stage Dockerfile for containerized deployment:

```bash
docker build -t quantum-qa .
docker run -p 3000:3000 -v quantum-qa-data:/app quantum-qa
```

Mount a persistent volume for `database.sqlite` to ensure data survives container restarts.

---

## 23. Frequently Asked Questions

| Symptom | Remedy |
| :--- | :--- |
| "Browser not found" | run `npx playwright install chromium` |
| Agent won't connect | check `SERVER_URL` + `AGENT_SECRET`; agent version ≥ 1.1; firewall/port |
| Database locked | ensure only one server process is running |
| AI run stuck or error | Settings → AI Provider → **Test**; switch model, lower Reasoning Effort; air-gapped: use `openai-compatible` local endpoint |
| Duplicate NL cases between runs | enable **Reference Previous Runs** on the next run |
| API requests not recorded | recording mode must include API; check API filter rules |
| Element not found at runtime | fix selector in Object Repository (prefer role/label selectors) |
| Variable not resolving | scope precedence: higher (case) scope shadows; check extractor scope |
| API base URL wrong | verify the current environment matches the intended endpoint configuration |
| Steps skipped unexpectedly | check that `enabled` is `true` on the step |
| data rows not iterating | ensure variables are defined, plus data rows and data source setting |
| Concurrent run blocked | one local execution at a time (platform-wide); scale by adding agents |
| Module recursion error | maximum module nesting depth is 20; reduce nesting |
| Report missing | complete the run; screenshots are subordinate |

---

*If the UI differs from this guide, the source code is the reference.*
