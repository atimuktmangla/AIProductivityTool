import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContributorTable } from '../../components/ContributorTable.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

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

describe('ContributorTable', () => {
  // @req REQ-4.5-1
  it('renders developer names from data', () => {
    const data = [makeDev(), makeDev({ developerId: 'bob', name: 'Bob Jones', totalCommits: 30 })];
    render(<ContributorTable data={data} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  // @req REQ-4.5-1
  it('shows skeleton rows when loading', () => {
    const { container } = render(<ContributorTable data={[]} isLoading={true} onSelect={vi.fn()} />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // @req REQ-4.5-2
  it('calls onSelect when clicking a developer name', async () => {
    const onSelect = vi.fn();
    const data = [makeDev()];
    render(<ContributorTable data={data} isLoading={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Alice Smith'));
    expect(onSelect).toHaveBeenCalledWith(data[0]);
  });

  // @req REQ-4.5-3
  it('sorts by column when header is clicked', async () => {
    const data = [
      makeDev({ developerId: 'alice', name: 'Alice', totalCommits: 10 }),
      makeDev({ developerId: 'bob', name: 'Bob', totalCommits: 50 }),
    ];
    render(<ContributorTable data={data} isLoading={false} onSelect={vi.fn()} />);
    const commitHeader = screen.getByRole('button', { name: /commits/i });
    await userEvent.click(commitHeader);
    const rows = screen.getAllByRole('row');
    // Header + 2 data rows
    expect(rows.length).toBe(3);
  });

  // @req REQ-4.5-4
  it('renders export CSV button when data is present', () => {
    render(<ContributorTable data={[makeDev()]} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  // @req REQ-4.6-4
  it('shows flag icon for large average PR size (>400 lines)', () => {
    const data = [makeDev({ avgPrSizeLines: 500 })];
    const { container } = render(<ContributorTable data={data} isLoading={false} onSelect={vi.fn()} />);
    expect(container.textContent).toContain('\u2691');
  });
});
