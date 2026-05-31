---
name: requirement-analysis
description: Analyze requirements for completeness, testability, and consistency
tags: [requirements, analysis, testability]
module: ./index.ts
allowedTools: [analyze_requirements]
---
# Requirement Analysis Skill
Use this skill when analyzing requirements for completeness and testability.

## Analysis Checklist

### Completeness Check
- [ ] Are all acceptance criteria testable? (Each AC must have a verifiable outcome)
- [ ] Are there implicit requirements not written? (Business rules mentioned in context but not formalized)
- [ ] Are dependencies between requirements identified? (Cross-references to other requirements)
- [ ] Are priority and risk levels consistent with business impact? (Critical features marked MEDIUM is a red flag)
- [ ] Is the happy path fully described? (Must be able to trace end-to-end flow)
- [ ] Are alternate paths and exception paths described? (Must cover "what if" scenarios)

### Testability Check
- [ ] Can each requirement be verified by a test case? (Vague requirements need clarification)
- [ ] Are success criteria measurable? (Must have pass/fail conditions)
- [ ] Are non-functional requirements testable? (Performance, security, usability must have thresholds)
- [ ] Are edge cases implied? (If requirement says "all users", check: "including suspended users?")

### Consistency Check
- [ ] Do child requirements align with parent? (Story AC must trace back to feature scope)
- [ ] Are there contradictory requirements? (Two requirements saying opposite things)
- [ ] Are missing requirements gaps identified? (Epic → Features complete? Feature → Stories complete?)

## Flow Analysis Checks

When `businessFlowBlueprints` is present, add these flow-specific checks:

### Flow Completeness
- [ ] Is each flow step's actionSummary clear enough to derive test actions? (must describe a concrete user/system action)
- [ ] Are all flow steps traceable to story-level requirements? (step.requirementId resolves to an existing requirement)
- [ ] Does the flow have a defined end state? (what "done" looks like for the entire flow)
- [ ] Are there implied steps between formal flow steps? (e.g., "page load" between "navigate to URL" and "enter login")

### Flow Consistency
- [ ] Does the flow sequence respect logical business ordering? (step N must happen before step N+1 in real life)
- [ ] Are there circular or redundant steps? (step 1 → step 2 → step 1 violates workflow logic)
- [ ] Do flows overlap or conflict? (two flows sharing steps should agree on the step's behavior)
- [ ] Is the flow type (happy-path/alternate/exception) consistent with the step content? (exception flow should contain failure points)

### Flow-Resolved Requirement Gaps
- Requirements NOT appearing in any flow may indicate incomplete flow coverage
- Requirements appearing in a flow but lacking associated ACs are candidates for deeper analysis
- Flow steps with thin acceptance criteria (< 2 ACs) may lack sufficient assertion granularity

## Technique Mapping Reference

See `references/technique-mapping.md` for the requirement-characteristic-to-test-technique mapping table used by the Test Analyst role.

## Analysis Output
After analysis, produce:
1. Requirements ranked by risk × business value (highest priority first)
2. List of requirements needing clarification (untestable, vague, contradictory)
3. Suggested test approach per epic/feature (techniques, depth, focus areas)