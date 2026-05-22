const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|directions|messages)/i, label: 'ignore-instructions' },
  { pattern: /you\s+(are|must|will)\s+(now|free)\s+(to\s+)?ignore/i, label: 'free-ignore' },
  { pattern: /system\s+(prompt|message|instruction)/i, label: 'system-prompt-ref' },
  { pattern: /forget\s+(all\s+)?(previous|above|prior)/i, label: 'forget-context' },
  { pattern: /output\s+(your\s+)?(system\s+)?prompt/i, label: 'prompt-leak' },
  { pattern: /do\s+(not|never)\s+(follow|obey)\s+(previous|above|prior)\s+(instructions|rules)/i, label: 'reverse-instructions' },
];

export interface GuardResult {
  sanitized: string;
  flagged: boolean;
  matches: string[];
}

export function inspectUserInput(input: string): GuardResult {
  const matches: string[] = [];
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      matches.push(label);
    }
  }
  return { sanitized: input, flagged: matches.length > 0, matches };
}