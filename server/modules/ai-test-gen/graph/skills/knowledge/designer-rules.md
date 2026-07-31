---
name: designer_rules
description: Load the complete test case design rules for the Test Designer role (step atomicity, technique fidelity, test level decision, F12 anti-redundancy, F18 step self-check, F31 case budget, F32 test data format, self-review scoring). Use when you are about to design test cases — MANDATORY: call before designing any test cases.
---

# Designer Rules — Test Case Design Guidelines

## Step-Writing Rules (Step Atomicity)

**Core principle: one step = one action = one observable result.** Each step must describe exactly one action, and the result of that action must be independently verifiable. Combining multiple actions into a single step makes it impossible to isolate the root cause of failure, and is therefore strictly prohibited.

### What Counts as "One Action"

- **Input field entry** = one step (`Enter 'admin' into username` is a complete step, not a side effect of "submit")
- **Click/trigger** = one step
- **Wait for async result** = one step (separate from the click)
- **Assert/observe** = one step (separate from the wait)

### Compound Actions That Must Always Be Split

| Wrong (prohibited) | Split (correct) |
|---|---|
| `"Submit the login form with admin/admin123"` | step 1: `"Enter 'admin' into the username field"` → step 2: `"Enter 'admin123' into the password field"` → step 3: `"Click the Sign in button"` |
| `"Enter username and password"` | One `Enter` step per field |
| `"Click login and verify dashboard appears"` | Click → wait → assert (three steps) |
| `"Fill out the form with valid data and submit"` | One step per field + one submit step |
| `"Set username to admin and password to p@ss then click submit"` | One step per field + one click step |
| `"Enter 'test123' into the password field while leaving username empty"` | step 1: `"Leave the username field empty"` → step 2: `"Enter 'test123' into the password field"` |
| `"Enter a username but leave password empty, then submit"` | step 1: `"Enter a username into the username field"` → step 2: `"Leave the password field empty"` → step 3: `"Click the Submit button"` |
| `"Ensure both username and password fields are empty"` | step 1: `"Ensure the username field is empty"` → step 2: `"Ensure the password field is empty"` |
| `"Submit the login form with both username and password empty"` | step 1: `"Ensure the username field is empty"` → step 2: `"Ensure the password field is empty"` → step 3: `"Click the Submit button"` |

### Compound-Action Signal Words (schema-enforced)

The schema **rejects** any `action` containing these signals — each indicates 2+ bundled actions. If you encounter one, split the step before outputting JSON:

| Signal | Why it's compound | How to split |
|---|---|---|
| `while` | Bundles an action with a concurrent state ("do X **while** Y is empty") | Extract the state as a separate step (e.g. "Leave Y empty"), then the action step |
| `, then` | Sequential actions in one step ("do X**, then** do Y") | One step per action, in order |
| `but leave` / `but don't` / `without` | Bundles an action with a contrast state ("do X **but leave** Y empty") | Extract the contrast state as a separate step |
| `both` | Multiple targets in one step ("ensure **both** X and Y") | One step per target |

### Negative Test Case Steps — Splitting Compound Assertions

The most common atomicity violation in negative/error test cases is bundling a **"what should NOT happen"** assertion with a **"what SHOULD happen instead"** assertion, separated by a semicolon (`;` or `；`). Each is a separate observable outcome and MUST be its own step. **If you are about to write a `;` in an `expected` field, you have two assertions — split them into two steps.**

| Wrong (prohibited — `expected` has 2 assertions) | Split (correct — one assertion per step) |
|---|---|
| `expected: "No authentication request is sent; the error message is displayed"` | Step A `expected: "No network request to the auth API endpoint is observed"` → Step B `action: "Observe the validation area"` `expected: "An error message 'Invalid credentials' is displayed below the password field"` |
| `expected: "The form is not submitted; the validation error remains visible"` | Step A `expected: "The page URL remains on the login page (no navigation occurs)"` → Step B `expected: "The validation error message 'Password is required' is displayed"` |
| `expected: "The API returns 400; the error is logged in the audit trail"` | Step A `expected: "The API returns HTTP 400 with error code INVALID_INPUT"` → Step B `action: "Query the audit log"` `expected: "An audit log entry exists with the error code and timestamp"` |
| `expected: "The session is not created; the user stays on the login page"` | Step A `expected: "No session token is present in the session store"` → Step B `expected: "The browser remains on the login page URL"` |

**Pattern rule for negative cases:** A negative test step typically produces TWO observable outcomes — (1) the expected action did NOT occur, and (2) an alternative state was reached instead. These are two separate steps:
1. First step asserts the **absence** (e.g., "No API request is sent", "No session is created")
2. Second step asserts the **presence** of the alternative (e.g., "Error message is displayed", "Form remains visible")

The second step's `action` is typically `"Observe <target>"` or `"Query <system>"` — it is still one action (observing/querying), just verifying a different aspect of the post-condition state.

### Multi-Outcome `then` / `expected` — Split into Atomic Steps (F18-then)

A condition's expected outcome (the "then") frequently describes **more than one observable result**. Each distinct result MUST become its own step — never join them with `;`, ` and `, or `→`. Before finalizing a step, scan its `expected` for the multi-outcome signals below and split.

**Splitting procedure:**
1. Enumerate every distinct observable result implied by the outcome.
2. Give each result its own step: `action` = `"Observe/Query <target>"` (or reuse the trigger if the result is immediate), `expected` = the single result.
3. Re-check: if any `expected` still contains `;`, ` and `, or `→`, split again.

| Signal in `expected` | What it means | Correct split |
|---|---|---|
| `;` / `；` joining two clauses | 2 assertions | 2 steps, one `expected` each |
| `The form is not submitted; no network request to the auth API is observed` | absence + absence | step A `expected: "No network request to the auth API endpoint is observed"` · step B `expected: "The page URL remains on the login page (no navigation occurs)"` |
| `token is stored in localStorage AND user is redirected to the dashboard` | 2 outcomes joined by "and" | step A `expected: "A session token is present in localStorage"` · step B `expected: "The browser navigates to the dashboard URL"` |

**`expected` is an assertion about system state — NEVER a traceability/coverage map.** Writing `Step 1 (enter credentials) → TC-009 Steps 1-2; Step 2 (submit) → TC-009 Step 3; ...` in `expected` is always wrong: it is not an observable outcome, it is a case-to-case mapping. Coverage tracing belongs in `coveredConditions` / `referencedComponentConditions`, never inside `steps[].expected`. If you catch yourself writing `→` or "TC-XXX Step N" inside an `expected`, stop — you are writing a mapping, not an assertion. Rewrite as a concrete, machine-detectable outcome (DOM state, HTTP status, element existence, stored value).

### Hard Constraints on `expected`

- Describe the system state **after** the step executes, not the sum of multiple actions
- Must be machine-detectable (DOM state, HTTP status, return value, element existence) — cannot use "works correctly" / "behaves as expected"
- **One assertion per `expected` field** — NO semicolons (`;` or `；`). If you need to assert two things, write two steps. The schema rejects any `expected` containing 2+ semicolon-separated segments.
- Schema enforced: ≤ 200 characters

### Step Ordering

Arrange by causal chain: each step's precondition is satisfied by the previous step's post-condition. Standard order: input → trigger → wait → assert.

## Technique Fidelity (apply per the condition's `primaryTechnique`)
| Technique | What the test case must do |
|---|---|
| Equivalence Partitioning | `testData` states which partition the value belongs to (e.g., "email = invalid-format (no @) — invalid partition"). Include specific data examples if the condition listed multiple variants. |
| Boundary Value Analysis | `testData` states the exact boundary value AND its position (e.g., "quantity = 0 (one below minimum 1)"). Generic data like "a large number" is a rejected design. |
| Decision Table | `preconditions`/`testData` enumerate every condition-column input for that specific rule row, so the rule under test is unambiguous. |
| State Transition | `preconditions` state the starting state explicitly; the final step's `expected` states the resulting state (or confirms an invalid transition was correctly rejected). |
| Use Case | Steps mirror the use case's actual sequence (main scenario or the specific alternate/exception branch named in the condition) — do not collapse a multi-actor flow into one actor's view if a system-initiated step (async response, webhook) is part of it. |

Copying the technique name into `techniqueApplied` without honoring its method above is not acceptable.

## Test Level Decision Rule (MANDATORY — every case must declare `testLevel`)
The Analyst has already tagged each condition with `conditionType: "component"` or `conditionType: "flow"` AND, for flow conditions, supplied `flowStepRefs`. **You MUST honor both.** Do not override the conditionType.

The Analyst guarantees **non-overlap**: a sibling component condition already covers the atomic behavior, so a flow condition verifies ONLY the cross-component interaction aspect. The Designer's job is to turn this into test cases that **explicitly reference the conditions** they cover.

| Condition type | testLevel | `coveredConditions` | `referencedComponentConditions` | Step design constraint |
|---|---|---|---|---|
| `conditionType: "component"` | `component` | MUST list this condition's id (e.g. `["C-001"]`) | leave `[]` | Steps' assertions stay within the component under test. The final `expected` must verify the component's own behavior, not another component's state. |
| `conditionType: "flow"` | `integration` | MUST list the flow condition id(s) this case covers (e.g. `["C-002"]` or `["C-002", "C-003"]` if the case spans multiple flow conditions) | MUST list at least one **component-typed** condition id the case assumes as a precondition (the atomic behaviors already verified by sibling component cases) | Steps must traverse 2+ components/modules; `preconditions` must contain only concrete, settable system states (data exists, page is loaded, field is in X state) — see F12-precondition; steps assert only the cross-component outcome (data handoff, state propagation, downstream effect, sequence across modules). Do NOT re-assert atomic behavior that `referencedComponentConditions` already covers. |

**CRITICAL — `referencedComponentConditions` vs `coveredConditions` (most common Designer mistake):**
- `coveredConditions` = the condition(s) this case VERIFIES (the case's own test objective). For an integration case, this is the **flow** condition id(s).
- `referencedComponentConditions` = the **component** condition(s) this case ASSUMES as already-verified preconditions (atomic behaviors covered by sibling component cases).
- **`referencedComponentConditions` MUST ONLY contain condition IDs where `conditionType === "component"`.** NEVER put a flow-typed condition id in this field — that is a schema validation failure. If a condition is `conditionType: "flow"`, it belongs in `coveredConditions`, NOT `referencedComponentConditions`.
- Example: If C-001 is a component condition ("empty password rejected") and C-005 is a flow condition ("login flow hands off session to dashboard"), then an integration test case for the login flow should have `coveredConditions: ["C-005"]` and `referencedComponentConditions: ["C-001"]` — NOT `referencedComponentConditions: ["C-005"]`.

**F12 — Anti-redundancy check (for every integration case, before finalizing):**
1. Read the condition text for each entry in `referencedComponentConditions` (the Analyst's component conditions).
2. Ask: "Does my integration case's `steps[].expected` re-assert behavior that one of those component conditions already verifies?"
3. If yes, **REMOVE** the overlapping assertion from `steps`. Ensure the component condition is listed in `referencedComponentConditions` — that field is the **sole mechanism** for declaring the dependency. **Do NOT restate the behavior as a precondition.** Keep only the cross-component assertion in `steps`.

### Precondition Quality Rule (F12-precondition)

`preconditions` must describe **concrete, settable system states** that exist **before** the test starts — NOT behaviors that happen **during** the test. A behavior is something you verify; a precondition is something you set up.

| WRONG (behavior — not settable) | RIGHT (concrete state — settable before test) |
|---|---|
| `"Client-side validation passes for well-formed credentials (per C-005)"` | `"User account 'admin' exists in the user store with password 'admin123'"` |
| `"Login page UI is functional (per C-001)"` | `"Login page is loaded at /login with username and password fields rendered"` |
| `"Password toggle functionality works (per C-002)"` | `"Login page is loaded with password field in masked (type=password) state"` |
| `"Component validation behaviors verified (C-005, C-006, C-007)"` | `"All form fields are empty and the Submit button is visible"` |

**Rule:** If a precondition contains a verb describing behavior ("passes", "works", "is functional", "is verified", "succeeds"), rewrite it as a concrete system state (data exists, page is loaded, field is in X state). The behavior dependency is declared via `referencedComponentConditions`, not restated in `preconditions`.

**F18 — Step Atomicity Self-Check (mandatory before generating the JSON block)**

For each step, quickly verify:
1. **One verb?** `action` contains only one action (Enter/Click/Type/Submit/...) — no "and" / "then" / "with" / "using" chaining multiple actions.
2. **No compound-action signals?** `action` MUST NOT contain `while`, `, then`, `but leave`/`but don't`/`without`, or `both`. The schema **rejects** these — see the Compound-Action Signal Words table above.
3. **One target?** `action` points to a single field/button/API, not a group.
4. **Data in the step?** Input field values are written in the `Enter` step, not deferred to a later `Submit` as a "with X/Y" suffix.
5. **Is `expected` an observation?** Not a subjective description like "works correctly".
6. **No semicolons in `expected`?** The `expected` field MUST NOT contain `;` or `；`. A semicolon means you have two assertions — split into two steps. This is the #1 cause of schema rejection for negative/error test cases (e.g., `"No request is sent; error is shown"` → two steps).
7. **No traceability mapping in `expected`?** `expected` MUST NOT contain `→` or `"TC-XXX Step N"` references. That is a case-to-case coverage map, not an observable outcome — rewrite as a concrete machine-detectable assertion (see F18-then).
8. **Multi-outcome `then` split?** If the condition's outcome implies 2+ distinct results (absence+absence, state+navigation, store+redirect), each result is its own step (see F18-then).

If any check fails, split and rewrite the step — do not output it as-is. Typical error patterns: `"Submit the login form with admin/admin123"`, `"Enter username and password"`, `"Click login and verify dashboard appears"`, `"Fill out the form and submit"`, `"Set username to admin and password to p@ss then click submit"`, **`"Enter 'test123' into the password field while leaving username empty"`** (compound action — "while" signal — split into 2 steps), **`"Ensure both username and password fields are empty"`** (compound action — "both" signal — split into 2 steps), **`expected: "No API call is made; the error is displayed"`** (semicolon in expected — split into two steps), **`expected: "Step 1 (enter credentials) → TC-009 Steps 1-2; Step 2 (submit) → TC-009 Step 3"`** (traceability map in expected — rewrite as a real assertion).

## Test Data Format (F32)
Each testData entry MUST follow: `<field> = <value> (<partition/boundary label>)`
Examples:
- `username = admin (valid partition)`
- `password = "" (empty boundary)`
- `quantity = 0 (one below minimum boundary)`
- `email = "not-an-email" (invalid format partition)`

## Case Budget Guidance (F31)
- critical priority: 3-5 cases (valid + invalid + boundary + edge)
- high priority: 2-3 cases (valid + invalid)
- medium priority: 1-2 cases (valid + one negative)
- low priority: 1 case (happy path only)
The budget is a GUIDELINE, not a hard limit. Deviations are allowed if the technique demands it.

## Test Independence (ISTQB Principle)
Each case must run standalone from only its stated `preconditions` — never assume another case in the batch ran first. If setup depends on data another flow would create (e.g., "user must already exist"), state that explicitly as a precondition rather than assuming it silently. For integration cases, this means explicitly seeding the dependent component's data in `preconditions`. **`preconditions` must be concrete, settable system states (data exists, page is loaded, endpoint is available) — NOT behavior assertions.** Component behaviors the integration case assumes are declared via `referencedComponentConditions`, not restated in `preconditions` (see F12-precondition).

## Self-Review Scoring (be a genuine critic, not a rubber stamp)
- **9-10**: every step atomic and verifiable; test data technique-correct and concrete; case fully independent; `testLevel` correctly chosen and honored in step design; preconditions are concrete settable states (not behavior assertions); traces cleanly to the condition.
- **6-8**: minor gaps — e.g. one step bundles two actions, or test data lacks a partition/boundary label, or `testLevel` declared but step design doesn't actually reflect the level (e.g., labeled `integration` but only touches one component), or a precondition describes a behavior instead of a concrete state.
- **1-5**: missing preconditions, vague expected results, technique not actually applied (e.g. labeled BVA but uses an arbitrary mid-range value), `testLevel` missing or contradicts the condition's tag, or hidden dependency on external state.
Always list concrete `weaknesses`/`suggestions` if any exist — do not output empty arrays purely because the score is high, unless the case is genuinely flawless.
