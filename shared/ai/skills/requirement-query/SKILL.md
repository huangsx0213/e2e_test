# Requirement Query Skill
Use this skill BEFORE reading any requirement details. Never read all requirements at once — always query for a relevant subset first.

## How to Query
1. Read `requirement-index/references/index.json` to understand the landscape
2. Filter by: tags, level, priority, parent (get all children of a node)
3. Select the subset you need for the current task
4. Only then load full requirement descriptions for that subset

## Query Strategies — Concrete Examples

### By Tag
"Analyze login requirements" → filter by tags containing "auth":
```json
{ "action": "query", "filters": { "tags": ["auth"] }, "task": "analyze login and authentication requirements" }
```

### By Priority
"Check all critical requirements" → filter by priority: "CRITICAL":
```json
{ "action": "query", "filters": { "priority": "CRITICAL" }, "task": "check critical path coverage" }
```

### By Parent (Expand Epic)
"Expand epic X" → filter by parent matching the epic ID, then process children in order:
```json
{ "action": "query", "filters": { "parent": "req-001" }, "task": "expand epic into child stories" }
```

### By Test Type
"Find all UI-related tests" → filter by testType containing "ui":
```json
{ "action": "query", "filters": { "testType": ["ui"] }, "task": "find UI test requirements" }
```

### By Level (Epics Only)
"List all epics for planning" → filter by level=0:
```json
{ "action": "query", "filters": { "level": 0 }, "task": "identify epic boundaries for batch processing" }
```

### Combined Filters
"High-priority security tests" → multiple filters:
```json
{ "action": "query", "filters": { "priority": "CRITICAL", "testType": ["security"] }, "task": "prioritize security-critical requirements" }
```

## Validation
After processing a subset, ensure:
- All direct children of the parent requirement are covered
- All tagged requirements in scope are addressed
- Cross-references (requirements that depend on each other) are handled

## Progressive Loading Pattern
For large requirement sets:
1. First pass: load only epics (level=0) to plan batch boundaries
2. Per batch: load epic + its direct feature-level children
3. Deep dive: load story/AC children only when actively working on that feature
4. Never load all AC details for all stories at once