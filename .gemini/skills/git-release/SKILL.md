---
name: git-release
description: Create consistent releases with version bumps, changelogs, and release notes from commit history
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---

## What I do

- Analyze commit history since the last tag to identify changes
- Categorize changes into features, fixes, and breaking changes
- Propose a semantic version bump based on change types
- Generate a changelog in Keep a Changelog format
- Provide a copy-pasteable `gh release create` command

## When to use me

Use this skill when you are preparing a tagged release. Ask clarifying questions if the target versioning scheme is unclear.

## How I work

1. **Find last tag**: Run `git describe --tags --abbrev=0` to find the latest release tag
2. **Collect changes**: Run `git log <last-tag>..HEAD --oneline` to get commits since last release
3. **Categorize**: Group commits into Added, Changed, Fixed, Deprecated, Removed, Security
4. **Determine version**: Apply semver rules — patch for fixes, minor for features, major for breaking changes
5. **Draft changelog**: Write a CHANGELOG entry in Keep a Changelog format
6. **Create command**: Generate the `gh release create` command with the tag and notes

## Versioning rules

- **Patch** (1.0.x): Bug fixes, documentation changes, minor internal improvements
- **Minor** (1.x.0): New features, new APIs, non-breaking enhancements
- **Major** (x.0.0): Breaking changes, removed APIs, incompatible behavior changes

## Output format

Provide:
- **Proposed version**: The new tag with rationale
- **Changelog entry**: Ready to paste into CHANGELOG.md
- **Release command**: `gh release create` with all arguments filled in
