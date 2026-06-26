// ============================================================
// Test Case Deduplication
// ============================================================

export interface DedupResult {
  allCases: any[];
  conflicts: string[];
  removedCount: number;
}

export function deduplicateTestCases(rawCases: any[]): DedupResult {
  const seen = new Set<string>();
  const allCases: any[] = [];
  const conflicts: string[] = [];

  for (const tc of rawCases) {
    const key = tc.title?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
    if (!key) { allCases.push(tc); continue; }
    if (seen.has(key)) {
      const dup = allCases.find(c => c.title?.toLowerCase().trim().replace(/\s+/g, ' ') === key);
      const stepsDiff = dup && JSON.stringify(dup.steps) !== JSON.stringify(tc.steps);
      if (stepsDiff) {
        conflicts.push(`Duplicate title "${tc.title}" with different steps across batches`);
      }
      continue;
    }
    seen.add(key);
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

export function groupRequirementsByEpic(allIndex: IndexEntry[], selectedIds: Set<string>): GroupedEpics {
  const selectedIndex = allIndex.filter(i => selectedIds.has(i.id));

  const parentMap = new Map(allIndex.map(i => [i.id, i.parent]));
  function findRoot(id: string): string | null {
    let current = id;
    for (let i = 0; i < 20; i++) {
      const p = parentMap.get(current);
      if (!p) return current;
      current = p;
    }
    return current;
  }

  const rootGroups = new Map<string, string[]>();
  for (const item of selectedIndex) {
    const root = findRoot(item.id);
    if (root) {
      if (!rootGroups.has(root)) rootGroups.set(root, []);
      rootGroups.get(root)!.push(item.id);
    }
  }

  // Only count epics that are DIRECTLY selected (level-0 items in selectedIds)
  // If user selected specific epic-level items, use those; otherwise fall back to ancestors
  const selectedLevel0 = selectedIndex.filter(i => i.level === 0);
  const epics = selectedLevel0.length > 0
    ? selectedLevel0
    : allIndex.filter(i => i.level === 0 && rootGroups.has(i.id));

  return { epics, rootGroups, totalBatches: epics.length, selectedIndex };
}