---
name: istqb_boundary_value_analysis
description: Load the ISTQB Boundary Value Analysis (BVA) technique guide (definition, procedure, examples, common mistakes). Use when you need to design tests for inputs with numeric/range boundaries.
---

# Boundary Value Analysis (BVA)

## Definition

Boundary Value Analysis tests at the edges (boundaries) of equivalence partitions. Experience shows that errors tend to cluster at boundaries rather than in the center of partitions. BVA complements Equivalence Partitioning by focusing on the exact boundary points and their adjacent values.

## When to Use

- Input has defined min/max range (e.g., age 18-65, string 1-255 chars)
- Data size limits (e.g., file upload max 10MB, list max 100 items)
- Date/time boundaries (e.g., start date must be before end date)
- Index or position boundaries (e.g., first/last page, first/last item in list)
- Numeric precision boundaries (e.g., decimal places, rounding thresholds)
- Configuration limits (e.g., max 5 users per account)

## Steps

1. **Identify equivalence partitions** — Start with EP to find the ranges
2. **Identify boundaries** — For each partition, find the edge values
3. **Select boundary test values:**
   - For numeric ranges [min, max]: test min-1, min, min+1, max-1, max, max+1
   - For two-value boundaries: test the boundary value and the adjacent value on each side
   - For discrete values: test the boundary and the nearest non-boundary
4. **Derive test conditions** — Each boundary value becomes a test condition
5. **Document expected results** — What happens at vs outside the boundary

## Example

**Input:** Loan amount field ($1,000 - $500,000)

| Test Value | Boundary Type | Expected Result |
|------------|--------------|-----------------|
| $999 | Below minimum | Rejected |
| $1,000 | Minimum boundary | Accepted |
| $1,001 | Just above minimum | Accepted |
| $499,999 | Just below maximum | Accepted |
| $500,000 | Maximum boundary | Accepted |
| $500,001 | Above maximum | Rejected |

**Input:** Password field (8-32 characters)

| Test Value | Boundary Type | Expected Result |
|------------|--------------|-----------------|
| 7 chars | Below minimum | Rejected |
| 8 chars | Minimum boundary | Accepted |
| 9 chars | Just above minimum | Accepted |
| 31 chars | Just below maximum | Accepted |
| 32 chars | Maximum boundary | Accepted |
| 33 chars | Above maximum | Rejected |

## Common Mistakes

- Testing only the boundary value without adjacent values (missing off-by-one errors)
- Missing boundaries on output partitions (e.g., report shows max 50 rows)
- Not considering internal boundaries (e.g., pagination at 20 items, batch size limits)
- Ignoring boundary conditions in time/date (e.g., midnight, month-end, leap year)
- Forgetting that boundaries can exist in both input AND output domains
- Not testing the boundary from both sides (inside and outside the valid range)

## Tips for Test Design

- Always pair BVA with Equivalence Partitioning — BVA focuses on edges, EP covers the middle
- For integer ranges, the "three-value approach" (min, min+1, max-1, max) is often sufficient
- For continuous values, use the "two-value approach" (boundary and just outside)
- Consider both input and output boundaries
- Pay special attention to zero, empty, and null as implicit boundaries
