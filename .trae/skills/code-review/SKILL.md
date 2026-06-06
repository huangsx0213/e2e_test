---
name: code-review
description: Review code for quality, security vulnerabilities, performance issues, and best practices
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: review
---

## What I do

- Review code changes for correctness and edge cases
- Identify security vulnerabilities and potential exploits
- Assess performance implications of the code
- Check adherence to project coding standards and best practices
- Suggest improvements with concrete, actionable feedback

## When to use me

Use this skill when you need to:
- Review a PR or set of changes before merging
- Audit existing code for security or quality issues
- Get a second opinion on implementation choices
- Enforce coding standards across a team
- Identify technical debt in a module

## How I work

1. **Scope**: Identify the files and changes to review
2. **Correctness**: Check logic, error handling, and edge cases
3. **Security**: Look for injection, auth flaws, data exposure, and dependency risks
4. **Performance**: Identify bottlenecks, unnecessary allocations, and N+1 queries
5. **Maintainability**: Assess naming, structure, duplication, and complexity
6. **Standards**: Check against project conventions (lint rules, patterns in AGENTS.md)

## Review severity levels

- **Critical**: Must fix before merge (security holes, data loss, crashes)
- **High**: Should fix soon (logic errors, significant performance issues)
- **Medium**: Recommended improvements (code smell, missing tests)
- **Low**: Optional suggestions (naming, style, minor refactoring)
- **Info**: Observations worth noting (design tradeoffs, future considerations)

## Output format

For each finding, provide:
- **File:Line** reference
- **Severity** level
- **Issue** description
- **Suggestion** with code example when applicable
