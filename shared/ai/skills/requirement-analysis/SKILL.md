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

## Technique Mapping Reference

See `references/technique-mapping.md` for the requirement-characteristic-to-test-technique mapping table used by the Test Analyst role.

## Analysis Output
After analysis, produce:
1. Requirements ranked by risk × business value (highest priority first)
2. List of requirements needing clarification (untestable, vague, contradictory)
3. Suggested test approach per epic/feature (techniques, depth, focus areas)