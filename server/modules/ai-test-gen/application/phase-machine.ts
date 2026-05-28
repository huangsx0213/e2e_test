export type Phase =
  | 'analysis'
  | 'review-conditions'
  | 'design'
  | 'review-draft'
  | 'quality'
  | 'final-review'
  | 'complete';

export type PhaseAction = 'approve' | 'retry';

const AGENT_PHASES: ReadonlySet<Phase> = new Set(['analysis', 'design', 'quality']);

const CHECKPOINT_PHASES: Record<string, number> = {
  'review-conditions': 1,
  'review-draft': 2,
  'final-review': 3,
};

const TRANSITIONS: Record<string, { approve: Phase; retry: Phase }> = {
  'review-conditions': { approve: 'design', retry: 'analysis' },
  'review-draft':      { approve: 'quality', retry: 'design' },
  'final-review':      { approve: 'complete', retry: 'quality' },
};

export class PhaseMachine {
  transition(phase: Phase, action: PhaseAction): Phase {
    const row = TRANSITIONS[phase];
    if (!row) {
      throw new Error(`Phase "${phase}" does not support checkpoint transitions`);
    }
    return row[action];
  }

  getCheckpointNumber(phase: Phase): number | null {
    return CHECKPOINT_PHASES[phase] ?? null;
  }

  isAgentPhase(phase: Phase): boolean {
    return AGENT_PHASES.has(phase);
  }

  isCheckpointPhase(phase: Phase): boolean {
    return phase in CHECKPOINT_PHASES;
  }

  isTerminal(phase: Phase): boolean {
    return phase === 'complete';
  }

  getAgentPhaseForCheckpoint(checkpointNumber: number): Phase {
    switch (checkpointNumber) {
      case 1: return 'analysis';
      case 2: return 'design';
      case 3: return 'quality';
      default: throw new Error(`Unknown checkpoint: ${checkpointNumber}`);
    }
  }

  getNextAgentPhase(checkpointNumber: number): Phase {
    switch (checkpointNumber) {
      case 1: return 'design';
      case 2: return 'quality';
      case 3: return 'complete';
      default: throw new Error(`Unknown checkpoint: ${checkpointNumber}`);
    }
  }

  getCheckpointPhaseForAgent(agentPhase: Phase): Phase {
    switch (agentPhase) {
      case 'analysis': return 'review-conditions';
      case 'design': return 'review-draft';
      case 'quality': return 'final-review';
      default: throw new Error(`"${agentPhase}" is not an agent phase`);
    }
  }

  static readonly ALL_PHASES: Phase[] = [
    'analysis', 'review-conditions', 'design',
    'review-draft', 'quality', 'final-review', 'complete',
  ];
}
