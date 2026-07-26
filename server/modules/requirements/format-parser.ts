export interface StorySegments {
  role?: string;
  action?: string;
  value?: string;
  remainder: string;
  hasAllSegments: boolean;
}

export interface ACSegments {
  given?: string;
  when?: string;
  then?: string;
  remainder: string;
  hasAllSegments: boolean;
}

interface SegmentExtractor {
  captureGroup: (text: string) => string | null;
}

function buildSegmentExtractor(prefixes: string[]): SegmentExtractor {
  const escaped = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^\\s*(?:${escaped.join('|')})\\s*?(?::|\\s+—\\s+)?(.+?)\\s*$`, 'i');
  return {
    captureGroup: (text: string) => {
      const match = text.match(pattern);
      return match ? match[1].trim() : null;
    },
  };
}

function parseSegments(
  md: string,
  extractors: { role: SegmentExtractor; action: SegmentExtractor; value: SegmentExtractor },
): { segments: { role?: string; action?: string; value?: string }; remainder: string } {
  const lines = md.split('\n');
  const segments: { role?: string; action?: string; value?: string } = {};
  const remainderLines: string[] = [];

  const tryCapture = (
    line: string,
    key: 'role' | 'action' | 'value',
    extractor: SegmentExtractor,
  ): boolean => {
    if (segments[key] !== undefined) return false;
    const captured = extractor.captureGroup(line);
    if (captured !== null) {
      segments[key] = captured;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const matched =
      tryCapture(line, 'role', extractors.role) ||
      tryCapture(line, 'action', extractors.action) ||
      tryCapture(line, 'value', extractors.value);
    if (!matched) remainderLines.push(line.trim());
  }

  return { segments, remainder: remainderLines.join('\n') };
}

const storyExtractors = {
  role: buildSegmentExtractor(['As an', 'As a']),
  action: buildSegmentExtractor(['I want to', 'I want']),
  value: buildSegmentExtractor(['So that I can', 'So that']),
};

const acExtractors = {
  role: buildSegmentExtractor(['Given']),
  action: buildSegmentExtractor(['When']),
  value: buildSegmentExtractor(['Then']),
};

export function parseStoryMarkdown(md: string): StorySegments {
  const { segments, remainder } = parseSegments(md, storyExtractors);
  return {
    role: segments.role,
    action: segments.action,
    value: segments.value,
    remainder,
    hasAllSegments: !!(segments.role && segments.action && segments.value),
  };
}

export function parseACMarkdown(md: string): ACSegments {
  const { segments, remainder } = parseSegments(md, acExtractors);
  return {
    given: segments.role,
    when: segments.action,
    then: segments.value,
    remainder,
    hasAllSegments: !!(segments.role && segments.action && segments.value),
  };
}
