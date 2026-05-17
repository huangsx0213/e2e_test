# Detailed Design: Test Builder Autosave Input Lag Fix

## 1. Scope

This change fixes input lag and dropped characters in `client/features/tests/TestBuilder.tsx` while keeping autosave behavior.

The bug happens because several text inputs call `suitesApi.update(...)` on every keystroke, and `useSuiteMutations().update` currently invalidates `queryKeys.suites` after every successful save. That forces frequent refetches and large rerenders while the user is typing.

This design intentionally avoids broader refactors, per-input debounce state, or changes to autosave semantics.

## 2. Goals

- Keep autosave enabled.
- Make fast typing in Test Builder text inputs feel normal.
- Use the smallest change that fixes all inputs backed by `suitesApi.update`.
- Preserve server persistence and React Query consistency.

## 3. Recommended Approach

Update `useSuiteMutations().update` in `client/shared/hooks/useQueryHooks.ts` to use React Query cache updates instead of invalidating the whole suites query on every PATCH success.

Behavior:

- Before the network request resolves, optimistically merge the patch into the matching suite in `queryKeys.suites` cache.
- If the request fails, restore the previous cache value.
- If the request succeeds, replace the cached suite with the server response.
- Do not call `invalidateQueries({ queryKey: queryKeys.suites })` for each update.

Create and delete behavior remains unchanged.

## 4. Why This Is The Smallest Correct Fix

This change centralizes the fix in one place:

- `TestBuilder` already reads from the suites query cache.
- All affected autosave fields already flow through `suitesApi.update`.
- Replacing refetch-driven updates with cache writes removes the heavy rerender trigger without rewriting each input.

Compared with local input state plus debounce, this approach touches fewer call sites and covers more fields with less code.

## 5. Testing Plan

Add a focused test for `useSuiteMutations` behavior:

- Verify the suites cache is updated immediately when `update` is called.
- Verify the mutation does not call `invalidateQueries` on success.
- Verify a failed update restores the previous cached suites value.

Then run the targeted test file and any related suite as needed.

## 6. Out Of Scope

- Debouncing suite updates.
- Reworking `TestBuilder` into smaller controlled form components.
- Fixing autosave performance in unrelated modules.
- Changing non-suite resources such as headers, bodies, endpoints, or requirements.
