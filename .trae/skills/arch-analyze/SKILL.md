---
name: arch-analyze
description: Analyze project architecture, module dependencies, directory structure, and design patterns
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: analysis
---

## What I do

- Analyze project directory structure and module organization
- Identify design patterns and architectural decisions
- Map module dependencies and data flow
- Detect circular dependencies and coupling issues
- Summarize tech stack, frameworks, and key libraries
- Generate architecture diagrams in Mermaid syntax when helpful

## When to use me

Use this skill when you need to:
- Understand an unfamiliar codebase quickly
- Evaluate the health of a project's architecture
- Identify refactoring opportunities or architectural smells
- Onboard new team members to a project
- Prepare for architectural decision meetings

## How I work

1. **Discover structure**: Read the project root, package manifests, and config files to identify the tech stack
2. **Map directories**: Walk the source tree to understand module boundaries and layering
3. **Trace dependencies**: Analyze import graphs and dependency declarations
4. **Identify patterns**: Look for common patterns (MVC, hexagonal, microservices, monorepo, etc.)
5. **Assess health**: Check for circular deps, tight coupling, god modules, and other smells
6. **Report findings**: Present a structured summary with concrete file references and line numbers

## Output format

Provide analysis in this structure:
- **Tech Stack**: Languages, frameworks, key libraries
- **Architecture Style**: Pattern name and evidence
- **Module Map**: Key modules and their responsibilities
- **Dependency Graph**: Import/dependency relationships
- **Health Assessment**: Issues found with severity (high/medium/low)
- **Recommendations**: Actionable improvements ranked by impact
