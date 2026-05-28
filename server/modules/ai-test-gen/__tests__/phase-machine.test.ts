import { describe, expect, it } from 'vitest';
import { PhaseMachine, type Phase, type PhaseAction } from '../application/phase-machine.ts';

describe('PhaseMachine', () => {
  const machine = new PhaseMachine();

  describe('transition', () => {
    const cases: Array<{ phase: Phase; action: PhaseAction; expected: Phase }> = [
      { phase: 'review-conditions', action: 'approve', expected: 'design' },
      { phase: 'review-conditions', action: 'retry', expected: 'analysis' },
      { phase: 'review-draft', action: 'approve', expected: 'quality' },
      { phase: 'review-draft', action: 'retry', expected: 'design' },
      { phase: 'final-review', action: 'approve', expected: 'complete' },
      { phase: 'final-review', action: 'retry', expected: 'quality' },
    ];

    for (const { phase, action, expected } of cases) {
      it(`${phase} + ${action} → ${expected}`, () => {
        expect(machine.transition(phase, action)).toBe(expected);
      });
    }

    it('throws for agent phase transitions', () => {
      expect(() => machine.transition('analysis', 'approve')).toThrow(
        'does not support checkpoint transitions',
      );
    });

    it('throws for terminal phase transitions', () => {
      expect(() => machine.transition('complete', 'approve')).toThrow(
        'does not support checkpoint transitions',
      );
    });
  });

  describe('getCheckpointNumber', () => {
    const cases: Array<{ phase: Phase; expected: number | null }> = [
      { phase: 'analysis', expected: null },
      { phase: 'review-conditions', expected: 1 },
      { phase: 'design', expected: null },
      { phase: 'review-draft', expected: 2 },
      { phase: 'quality', expected: null },
      { phase: 'final-review', expected: 3 },
      { phase: 'complete', expected: null },
    ];

    for (const { phase, expected } of cases) {
      it(`${phase} → ${expected}`, () => {
        expect(machine.getCheckpointNumber(phase)).toBe(expected);
      });
    }
  });

  describe('isAgentPhase', () => {
    it('returns true for agent phases', () => {
      expect(machine.isAgentPhase('analysis')).toBe(true);
      expect(machine.isAgentPhase('design')).toBe(true);
      expect(machine.isAgentPhase('quality')).toBe(true);
    });

    it('returns false for non-agent phases', () => {
      expect(machine.isAgentPhase('review-conditions')).toBe(false);
      expect(machine.isAgentPhase('review-draft')).toBe(false);
      expect(machine.isAgentPhase('final-review')).toBe(false);
      expect(machine.isAgentPhase('complete')).toBe(false);
    });
  });

  describe('isCheckpointPhase', () => {
    it('returns true for checkpoint phases', () => {
      expect(machine.isCheckpointPhase('review-conditions')).toBe(true);
      expect(machine.isCheckpointPhase('review-draft')).toBe(true);
      expect(machine.isCheckpointPhase('final-review')).toBe(true);
    });

    it('returns false for non-checkpoint phases', () => {
      expect(machine.isCheckpointPhase('analysis')).toBe(false);
      expect(machine.isCheckpointPhase('design')).toBe(false);
      expect(machine.isCheckpointPhase('quality')).toBe(false);
      expect(machine.isCheckpointPhase('complete')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('returns true only for complete', () => {
      expect(machine.isTerminal('complete')).toBe(true);
      expect(machine.isTerminal('analysis')).toBe(false);
      expect(machine.isTerminal('review-conditions')).toBe(false);
    });
  });

  describe('getAgentPhaseForCheckpoint', () => {
    const cases: Array<{ cp: number; expected: Phase }> = [
      { cp: 1, expected: 'analysis' },
      { cp: 2, expected: 'design' },
      { cp: 3, expected: 'quality' },
    ];
    for (const { cp, expected } of cases) {
      it(`checkpoint ${cp} → agent phase ${expected}`, () => {
        expect(machine.getAgentPhaseForCheckpoint(cp)).toBe(expected);
      });
    }
    it('throws for unknown checkpoint', () => {
      expect(() => machine.getAgentPhaseForCheckpoint(99)).toThrow('Unknown checkpoint');
    });
  });

  describe('getNextAgentPhase', () => {
    it('returns the phase after approving each checkpoint', () => {
      expect(machine.getNextAgentPhase(1)).toBe('design');
      expect(machine.getNextAgentPhase(2)).toBe('quality');
      expect(machine.getNextAgentPhase(3)).toBe('complete');
    });
  });

  describe('getCheckpointPhaseForAgent', () => {
    it('returns the checkpoint phase each agent transitions to', () => {
      expect(machine.getCheckpointPhaseForAgent('analysis')).toBe('review-conditions');
      expect(machine.getCheckpointPhaseForAgent('design')).toBe('review-draft');
      expect(machine.getCheckpointPhaseForAgent('quality')).toBe('final-review');
    });
    it('throws for non-agent phases', () => {
      expect(() => machine.getCheckpointPhaseForAgent('complete')).toThrow(
        'is not an agent phase',
      );
    });
  });

  describe('ALL_PHASES', () => {
    it('includes all 7 phases', () => {
      expect(PhaseMachine.ALL_PHASES).toHaveLength(7);
      expect(PhaseMachine.ALL_PHASES).toContain('analysis');
      expect(PhaseMachine.ALL_PHASES).toContain('complete');
    });
  });
});
