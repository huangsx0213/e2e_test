---
name: istqb_equivalence_partitioning
description: Load the ISTQB Equivalence Partitioning (EP) technique guide (definition, procedure, examples, common mistakes). Use when you need to design tests for inputs with distinct valid/invalid value classes.
---

# Equivalence Partitioning (EP)

## Definition

Equivalence Partitioning divides input data into groups (partitions) where all values in a group are expected to be treated the same by the system. Testing one representative from each partition is considered sufficient, because if one value works, all values in that partition should work.

## When to Use

- Input fields with defined value ranges (e.g., age 18-65, quantity 1-999)
- Dropdown selections with grouped options (e.g., country regions)
- Input formats (e.g., email, phone number, date format)
- Business rule thresholds (e.g., discount applies for orders > $100)
- Any input where values can be logically grouped by expected behavior

## Steps

1. **Identify input conditions** — List all inputs that affect system behavior
2. **Identify valid partitions** — Groups of inputs that should be accepted
3. **Identify invalid partitions** — Groups of inputs that should be rejected
4. **Select representative values** — Pick one typical value from each partition
5. **Derive test conditions** — Each partition becomes at least one test condition
6. **Document expected results** — What should happen for valid vs invalid inputs

## Example

**Input:** Order quantity field (1-100)

| Partition Type | Partition | Test Value | Expected Result |
|---------------|-----------|------------|-----------------|
| Valid | 1-100 | 50 | Accepted |
| Invalid | < 1 | 0 | Rejected: "Quantity must be at least 1" |
| Invalid | > 100 | 101 | Rejected: "Quantity cannot exceed 100" |
| Invalid | Non-numeric | "abc" | Rejected: "Please enter a valid number" |

## Common Mistakes

- Only identifying valid partitions and forgetting invalid ones
- Making partitions too fine-grained (over-partitioning), leading to redundant tests
- Not considering output partitions — the system may produce different outputs for the same input class
- Ignoring hidden partitions (e.g., empty input, whitespace-only input)
- Not verifying that all values within a partition truly behave equivalently

## Tips for Test Design

- Combine EP with Boundary Value Analysis for partition edges
- EP reduces the number of test cases while maintaining coverage
- Always include at least one valid and one invalid partition per input
- Consider environmental partitions (e.g., different browsers, OS versions)
