# Test Gen Buttons Redesign

## Overview

Redesign the checkpoint action buttons in the AI Test Gen module to provide consistent behavior across Auto and Interactive modes. Move action buttons to the detail panel header and simplify the left config panel.

## Goals

1. Unify button behavior across Auto and Interactive modes
2. Place action buttons near the data they act on (detail panel header)
3. Remove redundant buttons from the left config panel
4. Support review/edit workflow for both modes

## Layout

```
┌─────────────────────────────────────────────────────────┐
│ Header: [Start Test Gen] [Clear] [Refresh] [Abort] [History] │
├──────────┬──────────────────────────────────────────────┤
│ Config   │  Checkpoint Title    [Approve][Retry][Review]│  ← Detail Header
│ Panel    │──────────────────────────────────────────────│
│          │                                              │
│ (no      │  Checkpoint Data (read-only or editable)     │
│  buttons)│  ...                                         │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

## State Matrix

| Mode | Node Status | Detail Header Buttons | Data Panel |
|------|-------------|----------------------|------------|
| Interactive | `waiting` | Approve + Retry + Review | read-only |
| Interactive | `waiting` (editing) | Approve + Retry + Done Reviewing | editable |
| Auto | `auto-passed` | Review | read-only |
| Auto | `auto-passed` (editing) | Done Reviewing | editable |
| Any | `running` / `completed` (non-checkpoint) | none | read-only |

## Button Behavior

### Interactive Mode (checkpoint waiting)

| Button | Action | Server Call |
|--------|--------|-------------|
| **Approve** | Resume pipeline with current data | `resume('approve', { editedData })` |
| **Retry** | Return to previous agent | `resume('retry')` |
| **Review** | Enter edit mode | Set `reviewMode = true` |
| **Done Reviewing** | Save edits locally, exit edit mode | Set `reviewMode = false` |

### Auto Mode (checkpoint completed)

| Button | Action | Server Call |
|--------|--------|-------------|
| **Review** | Enter edit mode | Set `reviewMode = true` |
| **Done Reviewing** | Save edits to DB | `api.testGen.saveCheckpointEdits()` |

## Data Flow

### Interactive Mode

```
User clicks Review
    ↓
reviewMode = true
    ↓
Data panel becomes editable
    ↓
User edits data → onDataChange → checkpointEditedData.current updates
    ↓
User clicks Done Reviewing
    ↓
reviewMode = false (edits preserved in checkpointEditedData.current)
    ↓
User clicks Approve
    ↓
pipeline.resume('approve', { editedData: checkpointEditedData.current })
```

### Auto Mode

```
User clicks Review
    ↓
reviewMode = true
    ↓
Data panel becomes editable
    ↓
User edits data → onDataChange → checkpointEditedData.current updates
    ↓
User clicks Done Reviewing
    ↓
api.testGen.saveCheckpointEdits(runId, { [field]: editedData }, agentName)
    ↓
reviewMode = false
```

## Files to Modify

### 1. `client/features/ai-test-gen/AiTestGenPage.tsx`

**Remove:**
- `handleCheckpointAction` callback (lines 89-95)
- `handleSaveCheckpoint` callback (lines 110-136)
- `saving` / `saved` state (lines 23-24)
- `checkpointCompleted` computation (line 138)
- `hideButtonArea` computation (line 27)
- `onCheckpointAction` prop from TestGenDetailPanel
- `onCheckpointDataChange` prop from TestGenDetailPanel

**Add:**
- `handleApprove` callback: calls `pipeline.resume('approve', { editedData: checkpointEditedData.current })`
- `handleRetry` callback: calls `pipeline.resume('retry')`
- `handleToggleReview` callback: toggles `reviewMode`
- `handleDoneReviewing` callback:
  - If interactive + waiting: just set `reviewMode = false`
  - If auto + completed: save to DB via `api.testGen.saveCheckpointEdits()`

**Modify:**
- Pass new props to TestGenDetailPanel: `onApprove`, `onRetry`, `onToggleReview`, `onDoneReviewing`

### 2. `client/features/ai-test-gen/TestGenDetailPanel.tsx`

**Remove:**
- `onCheckpointAction` prop
- `onCheckpointDataChange` prop
- `reviewMode` prop (will be managed internally or via new props)

**Add props:**
- `onApprove?: () => void`
- `onRetry?: () => void`
- `onToggleReview?: () => void`
- `onDoneReviewing?: () => void`
- `isEditing?: boolean`

**Modify:**
- Add button row in detail panel header for checkpoints
- Buttons show based on node status and mode

### 3. `client/features/ai-test-gen/TestGenConfigPanel.tsx`

**Remove:**
- `checkpointWaiting` prop
- `onContinue` prop
- `checkpointCompleted` prop
- `onSave` prop
- `saving` prop
- `saved` prop
- `hideButtonArea` prop
- Bottom button area (lines 405-430)

**Keep:**
- `onStart` prop and Start button (move to top of panel or keep at bottom)

### 4. `client/shared/test-gen-run/useTestGenRun.ts`

**No changes needed** - the `resume` function already supports `approve` and `retry` actions.

## Implementation Steps

1. Update `TestGenConfigPanel` to remove checkpoint-related props and bottom button area
2. Update `TestGenDetailPanel` to accept new props and render buttons in header
3. Update `AiTestGenPage` to wire up new callbacks
4. Test Interactive mode: checkpoint waiting → Review → Edit → Done Reviewing → Approve
5. Test Auto mode: checkpoint completed → Review → Edit → Done Reviewing → Save to DB
6. Test edge cases: Approve without editing, Retry without editing

## Edge Cases

1. **User clicks Approve without entering edit mode**: Approves with original (unedited) data
2. **User clicks Retry without entering edit mode**: Retries without feedback
3. **User clicks Done Reviewing without making changes**: Works normally, saves original data
4. **User clicks Approve while in edit mode**: Approves with current edited data (no need to click Done Reviewing first)
5. **Auto mode, user edits and saves, then clicks Review again**: Shows saved edits from DB
