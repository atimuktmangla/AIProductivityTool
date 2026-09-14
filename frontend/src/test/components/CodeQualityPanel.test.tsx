import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeQualityPanel } from '../../components/CodeQualityPanel.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

// recharts uses ResizeObserver internally
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function makeDev(overrides?: Partial<AggregatedDeveloperMetric>): AggregatedDeveloperMetric {
  return {
    developerId: 'alice',
    name: 'Alice Smith',
    totalCommits: 42,
    totalPRs: 10,
    linesChanged: { added: 500, deleted: 200 },
    cycleTimeHrs: 12.5,
    pickupDelayHrs: 2.1,
    reviewLifecycleHrs: 8.3,
    reviewDepth: 3.2,
    avgPrSizeLines: 180,
    openPrsOverThreshold: 0,
    prsReviewed: 6,
    workType: { features: 5, bugs: 3, infraOrDebt: 2 },
    codeQuality: { score: 78, bugRatio: 0.3, criticalScore: 80, approvalScore: 75, prFocusScore: 82, reworkRate: 0.2 },
    prs: [],
    ...overrides,
  };
}

describe('CodeQualityPanel', () => {
  // @req REQ-4.6-1
  it('renders skeleton when loading', () => {
    const { container } = render(<CodeQualityPanel data={[]} isLoading={true} />);
    expect(container.querySelector('.skeleton')).not.toBeNull();
  });

  // @req REQ-4.6-1
  it('renders nothing when data is empty and not loading', () => {
    const { container } = render(<CodeQualityPanel data={[]} isLoading={false} />);
    expect(container.querySelector('.code-quality-panel')).toBeNull();
  });

  // @req REQ-4.6-2
  it('renders team average score gauge', () => {
    render(<CodeQualityPanel data={[makeDev()]} isLoading={false} />);
    expect(screen.getByText('Team average')).toBeInTheDocument();
    expect(screen.getByLabelText(/quality score/i)).toBeInTheDocument();
  });

  // @req REQ-4.6-2
  it('displays correct score label based on score threshold', () => {
    render(<CodeQualityPanel data={[makeDev({ codeQuality: { score: 78, bugRatio: 0, criticalScore: 80, approvalScore: 75, prFocusScore: 82, reworkRate: 0.2 } })]} isLoading={false} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  // @req REQ-4.6-3
  it('shows sub-scores for all four quality dimensions', () => {
    render(<CodeQualityPanel data={[makeDev()]} isLoading={false} />);
    expect(screen.getByText('Critical / Security')).toBeInTheDocument();
    expect(screen.getByText('Approval rate')).toBeInTheDocument();
    expect(screen.getByText('PR focus')).toBeInTheDocument();
    expect(screen.getByText('Low rework')).toBeInTheDocument();
  });

  // @req REQ-4.6-3
  it('does not render per-developer bar chart with single developer', () => {
    const { container } = render(<CodeQualityPanel data={[makeDev()]} isLoading={false} />);
    expect(container.querySelector('.cq-bars')).toBeNull();
  });

  // @req REQ-4.6-3
  it('renders per-developer bar chart with multiple developers', () => {
    const data = [makeDev(), makeDev({ developerId: 'bob', name: 'Bob', codeQuality: { score: 60, bugRatio: 0.1, criticalScore: 50, approvalScore: 60, prFocusScore: 70, reworkRate: 0.5 } })];
    const { container } = render(<CodeQualityPanel data={data} isLoading={false} />);
    expect(container.querySelector('.cq-bars')).not.toBeNull();
  });
});
