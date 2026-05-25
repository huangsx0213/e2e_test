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
