// ============================================================
// Test Case Deduplication (two-level text + LLM semantic level 3)
// Level 1: title normalization
// Level 2: conditionId + techniqueApplied
// Level 3: LLM semantic dedup (handled in orchestrator.llmSemanticDedup)
// ============================================================

export interface DedupResult {
  allCases: any[];
  conflicts: string[];
  removedCount: number;
}

export function deduplicateTestCases(rawCases: any[]): DedupResult {
  const seenTitles = new Set<string>();
  const seenConditionTechnique = new Set<string>();
  const allCases: any[] = [];
  const conflicts: string[] = [];

  for (const tc of rawCases) {
    const titleKey = tc.title?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
    const condTechKey = tc.conditionId && tc.techniqueApplied
      ? `${tc.conditionId}::${tc.techniqueApplied}`
      : '';

    // Level 1: title dedup
    if (titleKey && seenTitles.has(titleKey)) {
      const dup = allCases.find(c => c.title?.toLowerCase().trim().replace(/\s+/g, ' ') === titleKey);
      const stepsDiff = dup && JSON.stringify(dup.steps) !== JSON.stringify(tc.steps);
      if (stepsDiff) {
        conflicts.push(`Duplicate title "${tc.title}" with different steps across batches`);
      }
      continue;
    }

    // Level 2: conditionId + techniqueApplied dedup
    if (condTechKey && seenConditionTechnique.has(condTechKey)) {
      conflicts.push(`Duplicate conditionId+technique: ${condTechKey} (title differs)`);
      continue;
    }

    if (titleKey) seenTitles.add(titleKey);
    if (condTechKey) seenConditionTechnique.add(condTechKey);
    allCases.push(tc);
  }

  return { allCases, conflicts, removedCount: rawCases.length - allCases.length };
}

// ============================================================
// Requirement Grouper (by Epic)
// ============================================================

export interface IndexEntry {
  id: string;
  parent: string | null;
  level: number;
  title: string;
}

export interface GroupedEpics {
  epics: IndexEntry[];
  rootGroups: Map<string, string[]>;
  totalBatches: number;
  selectedIndex: IndexEntry[];
}

export function findRootEpic(id: string, parentMap: Map<string, string | null>): string {
  let current = id;
  for (let depth = 0; depth < 20; depth++) {
    const parent = parentMap.get(current);
    if (parent == null) return current;
    current = parent;
  }
  return current;
}

export function groupRequirementsByEpic(allIndex: IndexEntry[], selectedIds: Set<string>): GroupedEpics {
  const selectedIndex = allIndex.filter(i => selectedIds.has(i.id));
  const parentMap = new Map(allIndex.map(i => [i.id, i.parent]));

  const rootGroups = new Map<string, string[]>();
  for (const item of selectedIndex) {
    const root = findRootEpic(item.id, parentMap);
    if (!rootGroups.has(root)) rootGroups.set(root, []);
    rootGroups.get(root)!.push(item.id);
  }

  // Only count epics that are DIRECTLY selected (level-0 items in selectedIds)
  // If user selected specific epic-level items, use those; otherwise fall back to ancestors
  const selectedLevel0 = selectedIndex.filter(i => i.level === 0);
  const epics = selectedLevel0.length > 0
    ? selectedLevel0
    : allIndex.filter(i => i.level === 0 && rootGroups.has(i.id));

  return { epics, rootGroups, totalBatches: epics.length, selectedIndex };
}