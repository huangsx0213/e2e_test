# Test Builder Autosave Input Lag Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove typing lag in Test Builder autosave fields by replacing per-keystroke suites query invalidation with cache updates.

**Architecture:** Keep `TestBuilder` unchanged and fix the shared suite update path in `client/shared/hooks/useQueryHooks.ts`. Add a focused hook test that proves optimistic cache updates, no invalidation on success, and rollback on failure.

**Tech Stack:** React 19, TanStack React Query 5, Vitest, Testing Library, TypeScript

---

### Task 1: Add failing tests for suite update cache behavior

**Files:**
- Create: `client/shared/hooks/__tests__/useSuiteMutations.test.tsx`
- Modify: none
- Test: `client/shared/hooks/__tests__/useSuiteMutations.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/shared/services/api', () => ({
  api: {
    suites: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// import hook and mocked api, seed suites cache, assert:
// 1) cache changes immediately after update() call
// 2) invalidateQueries is not called for update success
// 3) failed update restores previous cache value
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useSuiteMutations.test.tsx`
Expected: FAIL because current `useSuiteMutations().update` invalidates suites instead of maintaining cache state.

- [ ] **Step 3: Write minimal implementation**

```ts
const update = useMutation({
  mutationFn: ({ id, data }) => api.suites.update(id, data),
  onMutate: async ({ id, data }) => {
    await qc.cancelQueries({ queryKey: queryKeys.suites });
    const previousSuites = qc.getQueryData<TestSuite[]>(queryKeys.suites);
    qc.setQueryData<TestSuite[]>(queryKeys.suites, (old = []) =>
      old.map((suite) => (suite.id === id ? { ...suite, ...data } : suite)),
    );
    return { previousSuites };
  },
  onError: (_error, _vars, context) => {
    if (context?.previousSuites) {
      qc.setQueryData(queryKeys.suites, context.previousSuites);
    }
  },
  onSuccess: (updatedSuite) => {
    qc.setQueryData<TestSuite[]>(queryKeys.suites, (old = []) =>
      old.map((suite) => (suite.id === updatedSuite.id ? updatedSuite : suite)),
    );
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useSuiteMutations.test.tsx`
Expected: PASS

- [ ] **Step 5: Run a related test sweep**

Run: `npm test -- RequirementEditor.test.tsx`
Expected: PASS

### Task 2: Verify no regressions in typing path

**Files:**
- Modify: `client/shared/hooks/useQueryHooks.ts`
- Test: `client/shared/hooks/__tests__/useSuiteMutations.test.tsx`

- [ ] **Step 1: Run the targeted suite again**

Run: `npm test -- useSuiteMutations.test.tsx`
Expected: PASS

- [ ] **Step 2: Run TypeScript check if needed for hook changes**

Run: `npm run lint`
Expected: no new type errors from the hook test or mutation callbacks
