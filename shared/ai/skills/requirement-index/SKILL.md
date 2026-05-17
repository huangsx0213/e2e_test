# Requirement Index Skill
This skill provides a searchable index of all project requirements as a lightweight JSON file.
The index file is at `references/index.json` and is regenerated automatically when requirements change.
Each index entry has: id, title, level (0=epic,1=feature,2=story,3=ac), parent, summary (≤200 chars), tags, priority, risk, type, testType, childCount, children[].