---
name: istqb_overview
description: Load the ISTQB technique decision guide overview (quick decision table, technique selection rules, test level decision, anti-patterns). Use when you need to decide which test design technique to apply before loading detailed technique guides.
---

# ISTQB Technique Decision Guide (Overview)

## Quick Decision Table

| Technique | When to Use | Key Outputs | Min Cases |
|-----------|------------|-------------|-----------|
| Equivalence Partitioning (EP) | Input has distinct value ranges/classes | valid + invalid partitions | 2 (1 valid + 1 invalid) |
| Boundary Value Analysis (BVA) | Input has numeric/range boundaries | values at boundaries (min-1, min, max, max+1) | 4 (2 boundaries × 2 sides) |
| Decision Table Testing | Multiple conditions combine into rules | rule matrix with all combinations | all rules + default |
| State Transition Testing | System has states and transitions | valid transitions + at least 1 invalid | all valid + 1 invalid |
| Use Case Testing | Cross-component user journeys | end-to-end scenarios | 1 per flow step |

## Technique Selection Rules

1. **Single field, range-based** → EP + BVA (paired)
2. **Multiple conditions interacting** → Decision Table
3. **Stateful system with transitions** → State Transition
4. **Cross-component interaction** → Use Case Testing (conditionType must be "flow")
5. **Input format validation** → EP (valid + invalid format partitions)

## Test Level Decision

| conditionType | testLevel | Asserts |
|---------------|-----------|---------|
| component | component | Single-component behavior only |
| flow | integration | Cross-component outcome (2+ modules) |

## Anti-Patterns to Avoid

- Do NOT combine EP and BVA into one condition — keep them separate
- Do NOT use "Use Case Testing" for single-component conditions
- Do NOT skip invalid partitions when using EP
- Do NOT forget the default rule in Decision Table Testing

## Loading Detailed Guides

Call `istqb_guide` with `techniques: ["Boundary Value Analysis"]` to load the full detailed guide for a specific technique (includes examples, step-by-step procedure, and common mistakes).
