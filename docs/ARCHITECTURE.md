# Architecture Guide

This project is organized for small-to-medium product work: clear boundaries, low ceremony, and fast navigation.

## Goals

- Keep structure easy to understand at a glance.
- Prefer business-oriented folders over technical over-segmentation.
- Split code only when the separation has clear value.
- Avoid both extremes:
  - too small: everything mixed in a few files
  - too heavy: too many layers and pass-through files

## Top-Level Structure

```text
.
├── client/            # Frontend application
├── server/            # Backend application
├── shared/            # Cross-app shared contracts
├── index.html
├── package.json
└── vite.config.ts
```

## Frontend Conventions

Frontend uses:

```text
client/
├── app/               # App shell, navigation, page composition, app-level hooks
├── features/          # Business features
├── shared/            # Shared UI, hooks, services, frontend-only helpers
├── index.tsx          # Frontend entry
└── types.ts           # Compatibility re-export
```

### Frontend Rules

- Put app composition in `client/app`.
- Put business screens and feature logic in `client/features/<feature>`.
- Put only true cross-feature reuse in `client/shared`.
- Do not move feature-local code into `shared` too early.
- If a feature grows large, add internal folders inside that feature before creating new global layers.

### Frontend Defaults

- `app`: shell, navigation, workspace selection, page switching
- `features`: domain-oriented UI and behavior
- `shared/services`: API clients and shared integrations
- `shared/hooks`: reusable hooks used by more than one feature
- `shared/ui`: small cross-feature UI building blocks

## Backend Conventions

Backend uses:

```text
server/
├── app/               # App creation, route registration, server startup
├── modules/           # Business modules
├── shared/            # DB, HTTP, validation, utils, server-side shared exports
├── migrations/
├── index.ts
├── migrate.ts
└── seed.ts
```

### Backend Rules

- Put startup and registration code in `server/app`.
- Put business resources in `server/modules/<module>`.
- Put infrastructure and cross-module helpers in `server/shared`.
- Keep repositories focused on persistence only.
- Keep schemas focused on validation only.
- Keep mappers focused on normalization and conversion only.

### Backend Module Shapes

For most small CRUD-style modules, use:

```text
server/modules/<module>/
├── index.ts
├── repository.ts
├── mapper.ts
└── schema.ts
```

Use this for modules such as `headers`, `bodies`, `endpoints`, `settings`, and `reports`.

For modules with a little more complexity, keep the same shape if possible. Only add more files when there is real pressure from complexity.

Examples:

- `projects`: keep `repository.ts`, `mapper.ts`, `schema.ts`, with composition in `index.ts`
- `suites`: same as `projects`
- `environments`: may omit `mapper.ts` when there is no mapping logic

### What Goes In `index.ts`

Module `index.ts` is the assembly point. It may contain:

- service composition
- controller creation
- router creation
- exported module descriptor such as `{ basePath, router }`

This is preferred for small modules because it reduces pass-through files.

## Shared Contracts

Cross-frontend/backend contracts live in:

```text
shared/contracts/
```

Current contract split:

- `shared/contracts/common.ts`
- `shared/contracts/testing.ts`
- `shared/contracts/projects.ts`
- `shared/contracts/api-assets.ts`
- `shared/contracts/settings.ts`
- `shared/contracts/index.ts`

### Contract Rules

- Put only real frontend/backend shared types here.
- Do not put frontend UI-only types here.
- Do not let `server` import from `client`.
- Do not let shared contracts depend on frontend runtime code.

## When To Split More

Add a new file or layer only if one of these becomes true:

- a file is hard to scan because it mixes multiple responsibilities
- logic is reused in multiple places
- a module has clearly different kinds of workflows
- tests or maintenance are getting harder because boundaries are unclear

## When Not To Split More

Do not add more layers just because it feels architecturally cleaner.

Avoid:

- `domain / application / infrastructure` for this project size
- interface + implementation pairs without real need
- one-file wrappers that only re-export a single value
- moving feature-local code into global shared folders too early

## Naming Conventions

- Prefer business names over abstract names.
- Backend modules use `index.ts`, `repository.ts`, `mapper.ts`, `schema.ts`.
- Frontend folders use feature names, not technical bucket names.
- Shared exports should stay stable even if internal file organization changes.

## Practical Rule Of Thumb

When adding or changing code, choose the smallest structure that stays clear.

- If it is local, keep it local.
- If it is reused, share it.
- If it is simple, do not over-layer it.
- If it gets complex, split only the part that is actually carrying complexity.
