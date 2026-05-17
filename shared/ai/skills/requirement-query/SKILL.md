# Requirement Query Skill
Use this skill BEFORE reading any requirement details. Never read all requirements at once — always query for a relevant subset first.
## How to query
1. Read `requirement-index/references/index.json` to understand the landscape
2. Filter by: tags, level, priority, parent (get all children of a node)
3. Select the subset you need
4. Only then load full requirement descriptions for that subset
## Query strategies
- "analyze login requirements" → filter by tags: ["auth"]
- "check all critical requirements" → filter by priority: "critical"
- "expand epic X" → filter by parent: "req-001" then process children
- "find all UI-related tests" → filter by testType: ["ui"]
## Validation
After processing a subset, ensure:
- All direct children of the parent are covered
- All tagged requirements in scope are addressed
- Cross-references are handled