---
name: istqb_decision_table
description: Load the ISTQB Decision Table Testing technique guide (definition, procedure, examples, common mistakes). Use when you need to design tests for multiple conditions combining into rules.
---

# Decision Table Testing

## Definition

Decision Table Testing uses a table to represent the logical relationships between conditions (inputs) and actions (outputs). It is particularly effective for testing business rules where multiple conditions combine to produce different outcomes. The table ensures systematic coverage of all condition combinations.

## When to Use

- Business rules with multiple conditions that interact (e.g., IF A AND B THEN X)
- Eligibility or qualification logic (e.g., loan approval depends on credit score AND income AND debt ratio)
- Pricing/discount rules (e.g., discount depends on customer tier AND order amount AND season)
- Workflow routing (e.g., approval path depends on amount AND department AND urgency)
- Any logic where the same input can lead to different outputs depending on other inputs
- Validation rules with multiple interdependent fields

## Steps

1. **Identify conditions** — List all input conditions that affect the outcome
2. **Identify actions** — List all possible outcomes/actions
3. **Create the decision table:**
   - Each column represents a rule (combination of conditions)
   - Each row represents a condition or action
   - Fill in True/False (or specific values) for each condition
   - Fill in the expected action for each rule
4. **Reduce the table** — Merge columns where conditions don't affect the action (don't-care conditions)
5. **Derive test conditions** — Each column (rule) becomes at least one test condition
6. **Verify completeness** — Ensure all combinations are covered

## Example

**Business Rule:** Order discount calculation

| Conditions | Rule 1 | Rule 2 | Rule 3 | Rule 4 |
|-----------|--------|--------|--------|--------|
| Customer is VIP? | Y | Y | N | N |
| Order > $100? | Y | N | Y | N |
| **Actions** | | | | |
| 20% discount | X | | | |
| 10% discount | | X | X | |
| No discount | | | | X |

**Test Cases:**
- Rule 1: VIP + order > $100 → expect 20% discount
- Rule 2: VIP + order ≤ $100 → expect 10% discount
- Rule 3: Non-VIP + order > $100 → expect 10% discount
- Rule 4: Non-VIP + order ≤ $100 → expect no discount

## Common Mistakes

- Not covering all combinations of conditions (missing rules)
- Treating independent conditions as dependent, creating unnecessary test cases
- Forgetting the "impossible" combinations (e.g., mutually exclusive conditions)
- Not reducing the table — testing redundant combinations
- Ignoring default/else conditions (what happens when no rule matches?)
- Not validating that the implemented logic matches the decision table

## Minimum Test Count

- **Every rule (column) in the decision table MUST have at least one test case.**
- Include a **default rule** test case (what happens when no rule matches).
- For N boolean conditions, there are 2^N possible rules. After reduction, test all remaining rules + default.
- Example: 2 conditions → 4 rules → 4 test cases minimum (5 if default is distinct).

## Step Splitting for Negative/Validation Cases (CRITICAL)

Decision Table test cases for validation rules (e.g., "empty field shows error") frequently produce **two observable outcomes**: (1) the action did NOT happen, and (2) an error message appeared. These MUST be **two separate steps** — never join with a semicolon.

**WRONG (one step, two assertions):**
```json
{ "action": "Click Submit", "expected": "No API request is sent; error message is displayed" }
```

**CORRECT (two atomic steps):**
```json
[
  { "action": "Click Submit", "expected": "No network request to the auth API endpoint is observed" },
  { "action": "Observe the validation error area", "expected": "An error message 'Please enter your username' is displayed" }
]
```

## Test Data Format for Decision Table

Each `testData` entry MUST enumerate the specific rule's condition-column values:
- `username = "" (empty — Rule 1 condition)`
- `password = "" (empty — Rule 1 condition)`

This makes it unambiguous which rule row the test case exercises.

## JSON Test Case Example — Login Validation (2 conditions: username empty × password empty)

```json
{
  "id": "TC-006",
  "title": "Submit empty form with blank username and password displays validation error",
  "conditionId": "C-006",
  "requirementId": "req-aut-auth-login-validation-empty",
  "coveredConditions": ["C-006"],
  "referencedComponentConditions": [],
  "priority": "critical",
  "category": "error",
  "testLevel": "component",
  "techniqueApplied": "Decision Table",
  "preconditions": [
    "Login page is loaded at /login with username and password fields rendered",
    "Both username and password fields are empty"
  ],
  "testData": [
    "username = \"\" (empty — Rule 1: both empty)",
    "password = \"\" (empty — Rule 1: both empty)"
  ],
  "steps": [
    { "stepNumber": 1, "action": "Ensure the username field is empty.", "expected": "The username field value is an empty string" },
    { "stepNumber": 2, "action": "Ensure the password field is empty.", "expected": "The password field value is an empty string" },
    { "stepNumber": 3, "action": "Click the Submit button.", "expected": "No network request is sent to the auth API endpoint" },
    { "stepNumber": 4, "action": "Observe the validation error area.", "expected": "An error message 'Please enter your username and password' is displayed" }
  ],
  "postconditions": ["Login page remains displayed with error indicator"],
  "tags": ["authentication", "login", "validation", "negative", "component", "decision-table"],
  "selfReview": {
    "score": 9,
    "strengths": [
      "Each step has exactly one action and one observable result",
      "Test data explicitly labels the rule row being exercised",
      "Steps 3 and 4 correctly split the absence assertion from the presence assertion",
      "testLevel=component — no cross-component assertions"
    ],
    "weaknesses": [],
    "suggestions": []
  }
}
```

## Tips for Test Design

- Start with the full decision table, then reduce by merging don't-care columns
- For N boolean conditions, there are 2^N possible rules — consider if all are meaningful
- Use "don't care" (-) when a condition doesn't affect the outcome for a given rule
- Prioritize testing rules that have the most business impact
- Decision tables are excellent for finding missing requirements — if you can't fill a column, ask the business
- For complex rules, consider using a subset of conditions first, then layering additional conditions
- **Split negative-case steps**: "action did NOT happen" and "error IS shown" are always two separate steps
- **Label test data with the rule number** so the reviewer can trace which column is exercised
