import { describe, expect, it } from 'vitest';
import { TokenTracker } from '../token-tracker.ts';

describe('TokenTracker', () => {
  it('adds token usage with default rate', () => {
    const t = new TokenTracker();
    t.add({ promptTokens: 100, completionTokens: 50 });
    const total = t.getTotal();
    expect(total.promptTokens).toBe(100);
    expect(total.completionTokens).toBe(50);
    expect(total.totalTokens).toBe(150);
    expect(total.estimatedCost).toBeCloseTo(100 * (2.50 / 1_000_000) + 50 * (10.00 / 1_000_000), 10);
  });

  it('uses model-specific rate when provided', () => {
    const t = new TokenTracker();
    t.add({ promptTokens: 1000, completionTokens: 500 }, 'claude-3-sonnet');
    const total = t.getTotal();
    expect(total.estimatedCost).toBeCloseTo(1000 * (3.00 / 1_000_000) + 500 * (15.00 / 1_000_000), 10);
  });

  it('aggregates multiple runs', () => {
    const t = new TokenTracker();
    t.add({ promptTokens: 10, completionTokens: 5 });
    t.add({ promptTokens: 20, completionTokens: 10 });
    const total = t.getTotal();
    expect(total.promptTokens).toBe(30);
    expect(total.completionTokens).toBe(15);
    expect(total.totalTokens).toBe(45);
  });

  it('resets clears all runs', () => {
    const t = new TokenTracker();
    t.add({ promptTokens: 100, completionTokens: 50 });
    t.reset();
    const total = t.getTotal();
    expect(total.promptTokens).toBe(0);
    expect(total.completionTokens).toBe(0);
  });
});
