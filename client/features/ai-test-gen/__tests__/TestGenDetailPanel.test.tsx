import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TestGenDetailPanel } from '../TestGenDetailPanel';

describe('TestGenDetailPanel', () => {
  it('renders preparation summary details for preparation nodes', () => {
    render(
      <TestGenDetailPanel
        node={{
          id: 'preparation',
          label: 'Preparation',
          kind: 'preparation',
          status: 'completed',
          meta: {
            totalBatches: 2,
            globalStats: { totalRequirements: 5, totalEpics: 2, totalFlows: 3 },
          },
        }}
        agentLog={{
          output_data: {
            totalBatches: 2,
          },
        }}
        checkpointData={null}
        thinkingText={null}
        runSummary={null}
        agentLogs={[]}
        startConfig={{ mode: 'auto', useCache: false }}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
        onToggleReview={vi.fn()}
        onDoneReviewing={vi.fn()}
      />,
    );

    // Stats cards
    expect(screen.getByText('Total Batches')).toBeInTheDocument();
    expect(screen.getByText('Requirements')).toBeInTheDocument();
    expect(screen.getByText('Business Flows')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Ready')).toBeInTheDocument();
    // Pipeline configuration + dual test level section
    expect(screen.getByText('Pipeline Configuration')).toBeInTheDocument();
    expect(screen.getByText('Test Levels')).toBeInTheDocument();
    // Numeric values: totalBatches=2, totalRequirements=5, totalFlows=3
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
