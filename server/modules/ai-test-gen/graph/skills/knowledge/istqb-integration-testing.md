---
name: istqb_integration_testing
description: Load the ISTQB Integration Testing test-level guide (component vs integration test level decision, integration strategies, examples). Use when you need to decide the test level or design integration test cases.
---

# Integration Testing (Test Level)

## Definition

In ISTQB terminology, **Integration Testing** is a *test level* (not a technique). It focuses on interactions between components, modules, sub-systems, or systems — verifying that they cooperate correctly once assembled. This is distinct from **Component Testing**, which validates a single unit in isolation.

Two common integration strategies:
- **Top-down**: integrate from the top of the control flow downward, using stubs for lower layers
- **Bottom-up**: integrate from the lowest components upward, using drivers for upper layers
- **Sandwich**: combine both

## When to Use (Test Level Decision Rule)

Generate an **integration-level** test case when one or more of the following is true:

- The condition traces to a **business flow step** that depends on prior steps (sequence matters, state carries over)
- The condition exercises an **interface / contract** between two distinct requirements, modules, or external systems (API → DB, UI → API, service → service)
- The condition's `primaryTechnique` is **Use Case Testing** or **State Transition Testing** AND the requirement participates in a multi-step end-to-end scenario
- The condition references a **cross-epic dependency** (shared data, shared state, depended-by relationship surfaced in L2 context)
- The user explicitly selected the source business flow as a reference — flow-traced conditions SHOULD default to integration level unless the condition is genuinely atomic (single-field validation independent of any flow)

Otherwise, generate a **component-level** test case:
- Pure input validation (EP/BVA on a single field, no cross-component interaction)
- Self-contained business rule over a single requirement (Decision Table where all inputs and outputs live within one component)
- Display/formatting checks that do not depend on other components

## ISTQB Theoretical Basis

- **ISTQB Foundation Level Syllabus v4.0, §2.1.1 Test Levels**: Integration Testing is one of the four canonical test levels (Component, Integration, System, Acceptance).
- **ISTQB Glossary v4.x**: "integration testing: testing performed to expose defects in the interfaces and interactions between components and/or systems."
- The defining characteristic is the **interaction** under test, not the size of the code. A 3-line test that verifies two components exchange a token correctly is integration testing; a 50-line test that validates one component's internal regex is component testing.

## Designing Integration Test Cases

1. **Identify the integration surface** — name the two (or more) components/systems that interact
2. **State preconditions on both sides** — what each component must already hold (data, state, configuration) before the interaction begins
3. **Trigger the interaction** — one step that initiates the cross-component call/event
4. **Verify the contract** — assert both the response at the boundary AND the resulting state on the other side (e.g., "API returns 201" AND "record appears in DB with expected fields")
5. **Verify side-effects** — async events, notifications, audit logs, cache invalidations
6. **Cover failure paths of the integration** — network timeout, malformed response, contract violation, partial failure

## Integration Test Data Principles

- Test data must satisfy **both sides'** constraints — invalid for one side is a different test case
- Use realistic identifiers (real IDs from dependent components) rather than placeholders like "test-1" — placeholders hide integration mismatches
- For stateful integrations, the data setup often requires seeding the dependent component first; state this explicitly in preconditions

## Common Mistakes

- Labeling a case "integration" when it only touches one component (this is component testing)
- Skipping the dependent-side state assertion ("API returns 200" without verifying the downstream record was actually created)
- Mocking so much that the integration surface disappears — an integration test with everything mocked is just a component test with extra steps
- Not testing the integration's failure modes — only happy-path integration tests miss the highest-value defects (timeouts, retries, partial writes)
- Hidden dependency on another test case's side effects — integration tests must seed their own data and clean up after themselves

## Decision Examples

| Condition | testLevel | Why |
|---|---|---|
| "Login rejects empty password" | component | Single-field validation, no cross-component interaction |
| "Login with valid credentials creates a session and redirects to dashboard" | integration | Auth component → Session component → Router; verifies cross-component state handoff |
| "Order quantity below 1 is rejected with validation error" | component | Pure BVA on one field |
| "Submitting an order decrements inventory and queues a fulfillment task" | integration | Order service → Inventory service → Queue; three components interact |
| "User profile shows the email saved in the previous step" | integration | UI reads from API which reads from DB; multi-layer data flow |
| "Reset link expires after 24 hours" | component | Time-based BVA on a single field's TTL, no cross-component interaction |

## Tips

- When the source business flow is selected, prefer integration-level cases for any condition that traverses 2+ flow steps
- Pair integration testing with **Use Case Testing** technique — they share the end-to-end philosophy
- Pair integration testing with **State Transition Testing** when the integration involves state handoff (e.g., order: pending → paid → shipped)
- For each integration case, name the interacting components explicitly in `preconditions` so reviewers can verify the integration surface is real
