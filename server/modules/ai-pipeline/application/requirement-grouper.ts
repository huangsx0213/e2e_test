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

  const epics = allIndex.filter(i => i.level === 0 && rootGroups.has(i.id));
  return { epics, rootGroups, totalBatches: epics.length, selectedIndex };
}
