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
