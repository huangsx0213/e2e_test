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
