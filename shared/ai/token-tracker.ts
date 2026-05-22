export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'claude-3-sonnet': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
};

export class TokenTracker {
  private runs: TokenUsage[] = [];

  add(usage: { promptTokens: number; completionTokens: number }, model?: string): void {
    const totalTokens = usage.promptTokens + usage.completionTokens;
    const rate = (model && MODEL_RATES[model]) || MODEL_RATES['gpt-4o'];
    const estimatedCost = (usage.promptTokens * rate.input) + (usage.completionTokens * rate.output);
    this.runs.push({ promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens, estimatedCost });
  }

  getTotal(): TokenUsage {
    return this.runs.reduce((acc, r) => ({
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      totalTokens: acc.totalTokens + r.totalTokens,
      estimatedCost: acc.estimatedCost + r.estimatedCost,
    }), { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 });
  }

  reset(): void { this.runs = []; }
}