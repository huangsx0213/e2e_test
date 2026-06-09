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

## Tips for Test Design

- Start with the full decision table, then reduce by merging don't-care columns
- For N boolean conditions, there are 2^N possible rules — consider if all are meaningful
- Use "don't care" (-) when a condition doesn't affect the outcome for a given rule
- Prioritize testing rules that have the most business impact
- Decision tables are excellent for finding missing requirements — if you can't fill a column, ask the business
- For complex rules, consider using a subset of conditions first, then layering additional conditions
