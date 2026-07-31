---
name: istqb_use_case_testing
description: Load the ISTQB Use Case Testing technique guide (definition, procedure, examples, common mistakes). Use when you need to design tests for cross-component user journeys and end-to-end scenarios.
---

# Use Case Testing

## Definition

Use Case Testing derives test cases from use case descriptions — scenarios that describe how actors (users or systems) interact with the system to achieve a goal. It tests end-to-end flows through the system, covering the main success scenario and alternative/exception paths.

## When to Use

- Testing user workflows end-to-end (e.g., "Customer places order", "Admin creates user")
- Business flow validation (e.g., "User registers → verifies email → logs in → updates profile")
- Integration between multiple features or modules
- Acceptance testing — verifying the system meets business requirements from the user's perspective
- Any scenario where the sequence of steps matters, not just individual inputs

## Steps

1. **Identify use cases** — From requirements or user stories, extract the main interactions
2. **Identify actors** — Who/what initiates the interaction (user, system, external service)
3. **Define the main success scenario** — The "happy path" from start to goal
4. **Identify alternative paths** — Valid variations that still achieve the goal
5. **Identify exception paths** — Conditions that prevent goal achievement and how the system handles them
6. **Derive test conditions:**
   - One test case per scenario (main + alternatives + exceptions)
   - Each test case covers a complete end-to-end flow
7. **Map to requirements** — Ensure each use case traces back to one or more requirements

## Example

**Use Case:** User resets password

**Main Success Scenario:**
1. User clicks "Forgot Password"
2. System prompts for email
3. User enters registered email
4. System sends reset link to email
5. User clicks reset link
6. System prompts for new password
7. User enters new password meeting requirements
8. System confirms password changed
9. User logs in with new password

**Alternative Paths:**
- 3a: User enters unregistered email → System shows "If this email is registered, a reset link has been sent"
- 7a: User enters weak password → System rejects with requirements, user re-enters

**Exception Paths:**
- 5a: Reset link expired (24h) → System shows "Link expired", offers to resend
- 5b: Reset link already used → System shows "Link already used", offers new request
- 6a: Too many reset attempts (5/hour) → System rate-limits, shows "Try again later"

## Common Mistakes

- Only testing the main success scenario and ignoring alternatives/exceptions
- Not testing exception handling — what happens when things go wrong at each step?
- Treating use case steps as independent rather than sequential (order matters)
- Not considering preconditions — what must be true before the use case starts?
- Missing implicit actors (e.g., system timer, external API, batch process)
- Not testing the "undo" or "cancel" path at each step where applicable

## Tips for Test Design

- Use case testing is ideal for flow-level test cases (end-to-end scenarios)
- Combine with State Transition Testing when use cases involve state changes
- Combine with Decision Table Testing when use cases have complex business rules
- Always test the exception paths — they often reveal the most critical bugs
- Consider the "unhappy actor" — what if the user behaves unexpectedly at each step?
- For UI-based use cases, test both forward navigation and back/refresh/cancel actions
- Use case tests are excellent candidates for automated E2E test suites

## Minimum Test Count

- **At least one test case per use case scenario** (main success + each alternative + each exception).
- For a use case with 1 main path + 2 alternatives + 2 exceptions → 5 test cases minimum.
- Each test case covers a **complete end-to-end flow** from trigger to final state — not individual steps.

## Integration Test Level — `referencedComponentConditions` Usage (CRITICAL)

Use Case test cases are `testLevel: "integration"` and MUST:
1. **List the flow condition ID in `coveredConditions`** — this is the condition the case verifies.
2. **List component condition IDs in `referencedComponentConditions`** — these are atomic behaviors assumed as already-verified preconditions (covered by sibling component test cases).
3. **NOT re-assert component behavior in `steps[].expected`** — only assert the cross-component outcome (data handoff, state propagation, redirect, downstream effect).

### F12 Anti-Redundancy Example

**WRONG (integration case re-asserts component behavior):**
```json
{
  "testLevel": "integration",
  "coveredConditions": ["C-010"],
  "referencedComponentConditions": ["C-001"],
  "preconditions": ["Login page is loaded"],
  "steps": [
    { "action": "Enter 'admin' into username field", "expected": "Username field displays 'admin'" },
    { "action": "Click Submit", "expected": "Token stored in localStorage" }
  ]
}
```
Step 1 re-asserts what C-001 (component condition "username field accepts input") already covers — this is redundancy.

**CORRECT (integration case asserts only cross-component outcome):**
```json
{
  "testLevel": "integration",
  "coveredConditions": ["C-010"],
  "referencedComponentConditions": ["C-001", "C-006"],
  "preconditions": [
    "User account 'admin' exists in the user store with password 'admin123'",
    "Login page is loaded at /login with username and password fields rendered"
  ],
  "steps": [
    { "action": "Enter 'admin' into the username field", "expected": "The username field displays 'admin'" },
    { "action": "Enter 'admin123' into the password field", "expected": "The password field shows masked characters" },
    { "action": "Click the Sign in button", "expected": "A POST request is sent to the auth API endpoint" },
    { "action": "Wait for the authentication response", "expected": "The auth API returns HTTP 200 with a session token" },
    { "action": "Query localStorage", "expected": "An auth token is present in localStorage under the key 'authToken'" },
    { "action": "Observe the browser URL", "expected": "The browser navigates to the dashboard URL" }
  ]
}
```
Steps 1-2 set up the input (not asserting component behavior); Steps 3-6 verify the cross-component chain (API call → token storage → redirect).

### Precondition Quality (F12-precondition)

`preconditions` must describe **concrete, settable system states** — NOT behaviors.

| WRONG (behavior assertion) | RIGHT (concrete state) |
|---|---|
| `"Client-side validation passes (per C-006)"` | `"Login page is loaded at /login with all form fields empty"` |
| `"Login UI is functional (per C-001)"` | `"User account 'admin' exists with password 'admin123'"` |

The behavior dependency is declared via `referencedComponentConditions`, NOT restated in `preconditions`.

## JSON Test Case Example — Happy Path Login Flow (integration)

```json
{
  "id": "TC-010",
  "title": "Happy path: valid credentials authenticate, store token in localStorage, redirect to dashboard",
  "conditionId": "C-010",
  "requirementId": "req-aut-auth-session-happy",
  "coveredConditions": ["C-010"],
  "referencedComponentConditions": ["C-001", "C-006", "C-009"],
  "priority": "critical",
  "category": "functional",
  "testLevel": "integration",
  "techniqueApplied": "Use Case Testing",
  "preconditions": [
    "User account 'admin' exists in the user store with password 'admin123'",
    "Login page is loaded at /login with username and password fields rendered",
    "localStorage is empty (no existing auth token)"
  ],
  "testData": [
    "username = admin (valid partition)",
    "password = admin123 (valid partition)"
  ],
  "steps": [
    { "stepNumber": 1, "action": "Enter 'admin' into the username field.", "expected": "The username field displays 'admin'" },
    { "stepNumber": 2, "action": "Enter 'admin123' into the password field.", "expected": "The password field shows masked characters" },
    { "stepNumber": 3, "action": "Click the Sign in button.", "expected": "A POST request is sent to /api/auth/login with the entered credentials" },
    { "stepNumber": 4, "action": "Wait for the API response.", "expected": "The auth API returns HTTP 200 with a JWT token in the response body" },
    { "stepNumber": 5, "action": "Query localStorage for the auth token.", "expected": "localStorage contains the returned token under key 'authToken'" },
    { "stepNumber": 6, "action": "Observe the browser URL.", "expected": "The browser navigates to /dashboard" }
  ],
  "postconditions": [
    "User is authenticated as 'admin'",
    "Auth token is persisted in localStorage",
    "Dashboard page is loaded and visible"
  ],
  "tags": ["authentication", "login", "dashboard", "session", "happy-path", "integration", "use-case"],
  "selfReview": {
    "score": 9,
    "strengths": [
      "Steps traverse 3 components: login UI → auth API → localStorage/redirect (true integration)",
      "referencedComponentConditions lists C-001 (UI input), C-006 (validation), C-009 (invalid credential handling) — all component behaviors assumed as preconditions",
      "Steps do NOT re-assert component behavior — only cross-component outcomes",
      "Preconditions are concrete settable states, not behavior assertions"
    ],
    "weaknesses": ["Does not verify dashboard content beyond URL navigation"],
    "suggestions": ["Add a follow-up assertion for specific dashboard elements"]
  }
}
```

## JSON Test Case Example — Exception Path (integration)

```json
{
  "id": "TC-011",
  "title": "Invalid credentials show error and allow retry without navigation",
  "conditionId": "C-011",
  "requirementId": "req-aut-auth-session-invalid",
  "coveredConditions": ["C-011"],
  "referencedComponentConditions": ["C-001", "C-009"],
  "priority": "critical",
  "category": "error",
  "testLevel": "integration",
  "techniqueApplied": "Use Case Testing",
  "preconditions": [
    "Login page is loaded at /login with username and password fields rendered",
    "No active session exists in the browser"
  ],
  "testData": [
    "username = fakeuser123 (invalid partition — non-existent user)",
    "password = wrongpass (invalid partition — incorrect password)"
  ],
  "steps": [
    { "stepNumber": 1, "action": "Enter 'fakeuser123' into the username field.", "expected": "The username field displays 'fakeuser123'" },
    { "stepNumber": 2, "action": "Enter 'wrongpass' into the password field.", "expected": "The password field shows masked characters" },
    { "stepNumber": 3, "action": "Click the Sign in button.", "expected": "A POST request is sent to /api/auth/login with the entered credentials" },
    { "stepNumber": 4, "action": "Wait for the API response.", "expected": "The auth API returns HTTP 401 Unauthorized" },
    { "stepNumber": 5, "action": "Observe the error display area.", "expected": "A generic error message 'Invalid username or password' is displayed" },
    { "stepNumber": 6, "action": "Observe the browser URL.", "expected": "The browser URL remains on /login (no redirect)" }
  ],
  "postconditions": [
    "Login page remains displayed with error indicator",
    "No auth token is stored in localStorage",
    "Form fields retain entered values for user correction"
  ],
  "tags": ["authentication", "login", "error", "exception-path", "integration", "use-case"],
  "selfReview": {
    "score": 9,
    "strengths": [
      "Exception path mirrors the happy path structure for easy comparison",
      "Step 5 asserts a generic error message (security best practice — no username enumeration)",
      "Step 6 verifies no redirect occurred (absence assertion separated from presence assertion)",
      "referencedComponentConditions correctly lists component conditions, not flow conditions"
    ],
    "weaknesses": [],
    "suggestions": []
  }
}
```
