# Test Gen Buttons Redesign - Implementation Plan

## Overview

Redesign checkpoint action buttons in AI Test Gen module. Move buttons to detail panel header, remove redundant buttons from left config panel.

**Spec**: `docs/specs/2026-05-28-test-gen-buttons-redesign.md`

## Implementation Steps

### Step 1: Update TestGenConfigPanel - Remove Checkpoint Props

**File**: `client/features/ai-test-gen/TestGenConfigPanel.tsx`

**Changes**:
1. Remove from `TestGenConfigPanelProps` interface:
   - `checkpointWaiting`
   - `onContinue`
   - `checkpointCompleted`
   - `onSave`
   - `saving`
   - `saved`
   - `hideButtonArea`

2. Remove from component body:
   - Bottom button area (lines 405-430) - the conditional rendering of Continue/Save/Start buttons

3. Keep:
   - `onStart` prop
   - Start button (move to top of config panel or keep as primary action)

**Verify**: Build passes, no TypeScript errors

---

### Step 2: Update TestGenDetailPanel - Add Action Buttons

**File**: `client/features/ai-test-gen/TestGenDetailPanel.tsx`

**Changes**:

1. Update `NodeDetailProps` interface:
   ```typescript
   // Remove
   onCheckpointAction?: ...
   onCheckpointDataChange?: ...
   reviewMode?: boolean
   
   // Add
   onApprove?: () => void
   onRetry?: () => void
   onToggleReview?: () => void
   onDoneReviewing?: () => void
   isEditing?: boolean
   ```

2. Add button row in detail panel header for checkpoints:
   - Location: After the node title/status, before the close button
   - Only show when `node.kind === 'checkpoint'`
   - Buttons depend on mode and status:
     - Interactive + waiting: [Approve] [Retry] [Review]
     - Interactive + waiting + editing: [Approve] [Retry] [Done Reviewing]
     - Auto + completed: [Review]
     - Auto + completed + editing: [Done Reviewing]

3. Button styling:
   - Approve: green (bg-green-500)
   - Retry: slate (bg-slate-500)
   - Review: blue outline
   - Done Reviewing: blue filled

**Verify**: Buttons render correctly for each state

---

### Step 3: Update AiTestGenPage - Wire Up New Callbacks

**File**: `client/features/ai-test-gen/AiTestGenPage.tsx`

**Changes**:

1. Remove:
   - `handleCheckpointAction` callback (lines 89-95)
   - `handleSaveCheckpoint` callback (lines 110-136)
   - `saving` / `saved` state (lines 23-24)
   - `checkpointCompleted` computation (line 138)
   - `hideButtonArea` computation (line 27)

2. Add:
   ```typescript
   const handleApprove = useCallback(() => {
     if (!pipeline.runId) return;
     pipeline.resume('approve', { editedData: checkpointEditedData.current });
   }, [pipeline]);

   const handleRetry = useCallback(() => {
     if (!pipeline.runId) return;
     pipeline.resume('retry');
   }, [pipeline]);

   const handleToggleReview = useCallback(() => {
     setReviewMode(prev => !prev);
   }, []);

   const handleDoneReviewing = useCallback(async () => {
     // If auto + completed, save to DB
     if (pipeline.selectedNode?.kind === 'checkpoint') {
       const isAutoCompleted = pipeline.nodes.some(
         n => n.id === pipeline.selectedNode?.id && n.status === 'auto-passed'
       );
       if (isAutoCompleted && checkpointEditedData.current) {
         const { api } = await import('@/shared/services/api');
         const nodeId = pipeline.selectedNode.id;
         const agentMap: Record<string, string> = {
           checkpoint_1: 'test_analyst',
           checkpoint_2: 'test_designer',
           checkpoint_3: 'quality_manager',
         };
         const fieldMap: Record<string, string> = {
           checkpoint_1: 'testConditions',
           checkpoint_2: 'draftTestCases',
           checkpoint_3: 'finalTestCases',
         };
         const agentName = agentMap[nodeId];
         const field = fieldMap[nodeId];
         if (agentName && field) {
           await api.testGen.saveCheckpointEdits(
             pipeline.runId!,
             { [field]: checkpointEditedData.current },
             agentName
           );
         }
       }
     }
     setReviewMode(false);
   }, [pipeline]);
   ```

3. Update TestGenConfigPanel props:
   ```tsx
   <TestGenConfigPanel
     requirements={requirements}
     businessFlows={businessFlows}
     onStart={handleStart}
     disabled={pipeline.isRunning}
   />
   ```

4. Update TestGenDetailPanel props:
   ```tsx
   <TestGenDetailPanel
     node={pipeline.selectedNode as any ?? null}
     agentLog={selectedAgentLog}
     checkpointData={pipeline.checkpointData}
     thinkingText={pipeline.thinkingText}
     runSummary={pipeline.runSummary}
     agentLogs={pipeline.agentLogs}
     onClose={handleCloseDetail}
     onApprove={handleApprove}
     onRetry={handleRetry}
     onToggleReview={handleToggleReview}
     onDoneReviewing={handleDoneReviewing}
     onCheckpointDataChange={handleCheckpointDataChange}
     isEditing={reviewMode}
   />
   ```

**Verify**: Full flow works - start, checkpoint waiting, review, edit, approve/retry

---

### Step 4: Test Interactive Mode Flow

**Test Cases**:

1. **Approve without editing**:
   - Start interactive run
   - Wait for checkpoint
   - Click Approve
   - Verify: pipeline continues to next agent

2. **Review → Edit → Done Reviewing → Approve**:
   - Start interactive run
   - Wait for checkpoint
   - Click Review
   - Edit some data
   - Click Done Reviewing
   - Click Approve
   - Verify: pipeline continues with edited data

3. **Retry**:
   - Start interactive run
   - Wait for checkpoint
   - Click Retry
   - Verify: pipeline returns to previous agent

4. **Approve while editing**:
   - Start interactive run
   - Wait for checkpoint
   - Click Review
   - Edit some data
   - Click Approve (without Done Reviewing)
   - Verify: pipeline continues with edited data

---

### Step 5: Test Auto Mode Flow

**Test Cases**:

1. **View completed checkpoint**:
   - Start auto run
   - Wait for completion
   - Click checkpoint node
   - Verify: data shows in read-only mode
   - Verify: Review button visible

2. **Review → Edit → Done Reviewing (save to DB)**:
   - Start auto run
   - Wait for completion
   - Click checkpoint node
   - Click Review
   - Edit some data
   - Click Done Reviewing
   - Verify: data saved to DB
   - Verify: exits edit mode

---

## Files Modified

| File | Changes |
|------|---------|
| `TestGenConfigPanel.tsx` | Remove checkpoint props and bottom button area |
| `TestGenDetailPanel.tsx` | Add action buttons in header |
| `AiTestGenPage.tsx` | Wire up new callbacks, remove old ones |

## Dependencies

None - this is a self-contained UI change.

## Risk

Low - changes are isolated to the AI Test Gen feature module.
