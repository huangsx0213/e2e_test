# Business Flow Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add requirement dependencies, a standalone business-flow module, a business-flow UI, and pipeline blueprint assembly for approved flows.

**Architecture:** Keep requirements as the hierarchy source of truth, add `dependencies` as graph edges, add `business_flows` as a separate approved-path module, and let `ai-pipeline` consume expanded blueprints instead of raw rows. Follow the existing CRUD module and React Query patterns already used by requirements and test-conditions.

**Tech Stack:** TypeScript, Express 5, Better-SQLite3, React 19, React Query, Vitest, Testing Library.

---

### Task 1: Persist requirement dependencies

**Files:**
- Modify: `shared/contracts/index.ts`
- Modify: `server/shared/db/types.ts`
- Create: `server/migrations/018_requirement_dependencies_and_business_flows.ts`
- Modify: `server/migrations/index.ts`
- Modify: `server/modules/requirements/schema.ts`
- Modify: `server/modules/requirements/mapper.ts`
- Modify: `server/modules/requirements/repository.ts`
- Modify: `server/modules/requirements/index-generator.ts`
- Test: `server/modules/requirements/__tests__/mapper.test.ts`
- Test: `server/modules/requirements/__tests__/repository.test.ts`

- [ ] **Step 1: Write the failing mapper test**

```ts
it('normalizes dependencies to an array of strings', () => {
  const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test', dependencies: ['req-1'] });
  expect(result.dependencies).toEqual(['req-1']);
});
```

- [ ] **Step 2: Run the requirement mapper test to verify it fails**

Run: `npm test -- server/modules/requirements/__tests__/mapper.test.ts`
Expected: FAIL because `dependencies` is missing from the normalized result.

- [ ] **Step 3: Implement minimal dependency support**

```ts
dependencies: Array.isArray(input.dependencies) ? input.dependencies.filter((value): value is string => typeof value === 'string') : [],
```

- [ ] **Step 4: Run the mapper test to verify it passes**

Run: `npm test -- server/modules/requirements/__tests__/mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Add repository persistence coverage and implement it**

```ts
dependencies: JSON.parse(row.dependencies || '[]'),
```

And in the insert/update statement:

```ts
dependencies = excluded.dependencies,
```

with values:

```ts
JSON.stringify(record.dependencies ?? existing?.dependencies ?? []),
```

- [ ] **Step 6: Run requirement tests and migration verification**

Run: `npm test -- server/modules/requirements/__tests__/mapper.test.ts server/modules/requirements/__tests__/repository.test.ts`
Expected: PASS.

### Task 2: Add business-flows server module

**Files:**
- Create: `server/modules/business-flows/schema.ts`
- Create: `server/modules/business-flows/mapper.ts`
- Create: `server/modules/business-flows/repository.ts`
- Create: `server/modules/business-flows/index.ts`
- Modify: `server/app/registerRoutes.ts`
- Modify: `server/shared/db/types.ts`
- Test: `server/modules/business-flows/__tests__/mapper.test.ts`
- Test: `server/modules/business-flows/__tests__/repository.test.ts`
- Test: `server/modules/business-flows/__tests__/routes.test.ts`

- [ ] **Step 1: Write the failing business-flow mapper test**

```ts
it('defaults a business flow to draft with empty steps', () => {
  const result = normalizeBusinessFlow({ projectId: 'proj-1', name: 'Checkout flow' });
  expect(result.status).toBe('DRAFT');
  expect(result.steps).toEqual([]);
});
```

- [ ] **Step 2: Run the mapper test to verify it fails**

Run: `npm test -- server/modules/business-flows/__tests__/mapper.test.ts`
Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement mapper, schema, and repository minimally**

```ts
export function normalizeBusinessFlow(input: Partial<BusinessFlow>): BusinessFlow {
  return {
    id: asId(input.id, 'flow'),
    projectId: asText(input.projectId),
    name: asText(input.name, 'New Business Flow'),
    description: asText(input.description),
    type: (input.type || 'happy-path') as BusinessFlow['type'],
    status: (input.status || 'DRAFT') as BusinessFlow['status'],
    steps: Array.isArray(input.steps) ? input.steps : [],
  };
}
```

- [ ] **Step 4: Add route tests for CRUD and approve/unapprove**

```ts
it('approves a valid business flow', async () => {
  const created = await request(app).post('/api/business-flows').send({
    projectId: 'proj-1',
    name: 'Checkout',
    steps: [{ sequence: 1, requirementId: 'req-1', actionSummary: 'User logs in' }],
  });

  const response = await request(app).post(`/api/business-flows/${created.body.id}/approve`).send();

  expect(response.status).toBe(200);
  expect(response.body.status).toBe('APPROVED');
});
```

- [ ] **Step 5: Implement route validation and route registration**

```ts
if (!flow.steps.length) {
  res.status(400).json({ error: 'Business flow must include at least one step before approval.' });
  return;
}
```

- [ ] **Step 6: Run server-side business-flow tests**

Run: `npm test -- server/modules/business-flows/__tests__/mapper.test.ts server/modules/business-flows/__tests__/repository.test.ts server/modules/business-flows/__tests__/routes.test.ts`
Expected: PASS.

### Task 3: Add business-flow client support

**Files:**
- Modify: `client/shared/services/api.ts`
- Modify: `client/shared/hooks/useQueryHooks.ts`
- Modify: `client/shared/hooks/queryKeys.ts`
- Modify: `client/app/types.ts`
- Modify: `client/app/navigation.ts`
- Modify: `client/app/components/AppContent.tsx`
- Create: `client/features/business-flows/BusinessFlowsPage.tsx`
- Test: `client/features/business-flows/__tests__/BusinessFlowsPage.test.tsx`

- [ ] **Step 1: Write the failing page test**

```tsx
it('renders business flows for the current project', async () => {
  render(<BusinessFlowsPage currentProjectId="proj-1" />);
  expect(await screen.findByText('Checkout flow')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test to verify it fails**

Run: `npm test -- client/features/business-flows/__tests__/BusinessFlowsPage.test.tsx`
Expected: FAIL because the page and hooks do not exist.

- [ ] **Step 3: Add API and query hooks**

```ts
businessFlows: {
  ...createCrudService<BusinessFlow>('business-flows'),
  listByProject: (projectId: string) => apiFetch<BusinessFlow[]>(`business-flows/by-project/${projectId}`),
  approve: (id: string) => apiFetch<BusinessFlow>(`business-flows/${id}/approve`, { method: 'POST' }),
  unapprove: (id: string) => apiFetch<BusinessFlow>(`business-flows/${id}/unapprove`, { method: 'POST' }),
},
```

- [ ] **Step 4: Implement a minimal business-flows page**

```tsx
{selectedFlow?.steps.map((step) => {
  const requirement = requirementMap.get(step.requirementId);
  return <div key={`${selectedFlow.id}-${step.sequence}`}>{requirement?.title || 'Unknown requirement'}</div>;
})}
```

- [ ] **Step 5: Add create, edit, reorder, and approve interactions**

```tsx
const moveStep = (index: number, direction: -1 | 1) => {
  const next = [...steps];
  const targetIndex = index + direction;
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  setSteps(next.map((step, idx) => ({ ...step, sequence: idx + 1 })));
};
```

- [ ] **Step 6: Run the page test and related UI verification**

Run: `npm test -- client/features/business-flows/__tests__/BusinessFlowsPage.test.tsx`
Expected: PASS.

### Task 4: Add pipeline blueprint assembly

**Files:**
- Modify: `shared/contracts/index.ts`
- Modify: `server/modules/ai-pipeline/index.ts`
- Create: `server/modules/ai-pipeline/business-flow-blueprint.ts`
- Test: `server/modules/ai-pipeline/__tests__/business-flow-blueprint.test.ts`

- [ ] **Step 1: Write the failing blueprint test**

```ts
it('expands approved business flows into pipeline blueprints', () => {
  const blueprints = buildBusinessFlowBlueprints({
    flows: [{ id: 'flow-1', name: 'Checkout', projectId: 'proj-1', type: 'happy-path', status: 'APPROVED', steps: [{ sequence: 1, requirementId: 'story-1', actionSummary: 'User signs in' }] }],
    requirements: [
      { id: 'story-1', title: 'Sign in', level: 'story', parentId: 'feature-1', description: '', projectId: 'proj-1', priority: 'MEDIUM', status: 'DRAFT', tags: [], position: 0, metadata: {}, dependencies: [] },
      { id: 'ac-1', title: 'AC', level: 'ac', parentId: 'story-1', description: 'User can sign in', projectId: 'proj-1', priority: 'MEDIUM', status: 'DRAFT', tags: [], position: 0, metadata: {}, dependencies: [] },
    ],
  });

  expect(blueprints[0].steps[0].acceptanceCriteria).toEqual(['AC']);
});
```

- [ ] **Step 2: Run the blueprint test to verify it fails**

Run: `npm test -- server/modules/ai-pipeline/__tests__/business-flow-blueprint.test.ts`
Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement blueprint assembly minimally**

```ts
const acceptanceCriteria = requirements
  .filter((requirement) => requirement.parentId === step.requirementId && requirement.level === 'ac')
  .map((requirement) => requirement.title);
```

- [ ] **Step 4: Update pipeline start response scaffolding to include blueprints in its setup phase**

```ts
sendEvent('phase:complete', { phase: 'analysis', summary: 'Pipeline infrastructure ready.', businessFlows: blueprints });
```

- [ ] **Step 5: Run pipeline blueprint tests**

Run: `npm test -- server/modules/ai-pipeline/__tests__/business-flow-blueprint.test.ts`
Expected: PASS.

### Task 5: Run integrated verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-22-business-flow-design.md`
- Modify: `docs/superpowers/plans/2026-05-22-business-flow-implementation.md`

- [ ] **Step 1: Run the focused test set**

Run: `npm test -- server/modules/requirements/__tests__/mapper.test.ts server/modules/requirements/__tests__/repository.test.ts server/modules/business-flows/__tests__/mapper.test.ts server/modules/business-flows/__tests__/repository.test.ts server/modules/business-flows/__tests__/routes.test.ts client/features/business-flows/__tests__/BusinessFlowsPage.test.tsx server/modules/ai-pipeline/__tests__/business-flow-blueprint.test.ts`
Expected: PASS.

- [ ] **Step 2: Run type-checking**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Record any plan deltas directly in the spec and plan docs if implementation needed small adjustments**

```md
Update the docs only if implementation introduced a necessary naming or boundary change.
```
