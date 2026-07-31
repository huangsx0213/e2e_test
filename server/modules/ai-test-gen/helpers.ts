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
    // 优先用 requirementId + conditionId + testLevel 作为去重 key：
    // 同一需求同一条件同一级别不应有两个用例。
    // 包含 requirementId 避免跨批次 conditionId 碰撞（各批次都从 C-001 开始编号）。
    // conditionId 缺失时回退到 title + testLevel（语义较弱，但好过无去重）。
    const levelKey = (tc.testLevel || '').toLowerCase();
    const condKey = (tc.conditionId || '').toLowerCase().trim();
    const reqKey = (tc.requirementId || '').toLowerCase().trim();
    const titleKey = tc.title?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
    const key = condKey
      ? `${reqKey}::${condKey}::${levelKey}`
      : (levelKey ? `${titleKey}::${levelKey}` : titleKey);
    if (!key) { allCases.push(tc); continue; }
    if (seen.has(key)) {
      const dup = allCases.find(c => {
        const dupLevel = (c.testLevel || '').toLowerCase();
        const dupCond = (c.conditionId || '').toLowerCase().trim();
        const dupReq = (c.requirementId || '').toLowerCase().trim();
        const dupTitle = c.title?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
        const dupKey = dupCond
          ? `${dupReq}::${dupCond}::${dupLevel}`
          : (dupLevel ? `${dupTitle}::${dupLevel}` : dupTitle);
        return dupKey === key;
      });
      const stepsDiff = dup && JSON.stringify(dup.steps) !== JSON.stringify(tc.steps);
      if (stepsDiff) {
        conflicts.push(`Duplicate (${condKey ? `condition ${condKey}` : `title "${tc.title}"`}, ${levelKey || 'unleveled'}) with different steps across batches`);
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

export function selectedRequirementAndFlowIds(requirementIds: string[], flowIds: string[]): Set<string> {
  return new Set([...requirementIds, ...flowIds]);
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

  const epics = allIndex.filter(i => i.level === 0 && rootGroups.has(i.id));
  return { epics, rootGroups, totalBatches: epics.length, selectedIndex };
}
