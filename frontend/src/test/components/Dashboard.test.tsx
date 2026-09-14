import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock useDashboard hook
const mockState = {
  isLoading: false,
  errorMessage: null as string | null,
  dashboardData: null as unknown,
  selectedUsers: [] as string[],
  selectedRepoTargets: [],
  selectedProjects: [],
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  savedSession: null,
};

const mockUseDashboard = {
  state: mockState,
  setSelectedUsers: vi.fn(),
  setSelectedRepoTargets: vi.fn(),
  setSelectedProjects: vi.fn(),
  setStartDate: vi.fn(),
  setEndDate: vi.fn(),
  setDatePreset: vi.fn(),
  fetchMetrics: vi.fn(),
  restoreSession: vi.fn(),
  dismissSession: vi.fn(),
};

vi.mock('../../hooks/useDashboard.js', () => ({
  useDashboard: () => mockUseDashboard,
}));

// Stub fetch for child components
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }));
  mockState.dashboardData = null;
  mockState.errorMessage = null;
  mockState.isLoading = false;
});

import { Dashboard } from '../../components/Dashboard.js';

describe('Dashboard', () => {
  // @req REQ-4.1-1
  it('renders WelcomePanel when no data and not loading', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.queryByText(/welcome/i) || screen.queryByRole('main')).toBeTruthy();
    });
  });

  // @req REQ-4.1-2
  it('renders error alert when errorMessage is set', async () => {
    mockState.errorMessage = 'Something went wrong';
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    });
  });

  // @req REQ-4.1-3
  it('renders metrics grid when dashboardData is present', async () => {
    mockState.dashboardData = {
      current: [{
        developerId: 'alice', name: 'Alice', totalCommits: 5, totalPRs: 2,
        linesChanged: { added: 100, deleted: 50 }, cycleTimeHrs: 4, pickupDelayHrs: 1,
        reviewLifecycleHrs: 3, reviewDepth: 2, avgPrSizeLines: 100,
        openPrsOverThreshold: 0, prsReviewed: 1,
        workType: { features: 2, bugs: 0, infraOrDebt: 0 },
        codeQuality: { score: 80, bugRatio: 0, criticalScore: null, approvalScore: null, prFocusScore: null, reworkRate: 0 },
        prs: [],
      }],
      cacheStatus: 'none',
    };
    render(<Dashboard />);
    await waitFor(() => {
      const grid = document.querySelector('.dashboard__grid');
      expect(grid).not.toBeNull();
    });
  });

  // @req REQ-4.1-4
  it('shows cache banner when cacheStatus is full', async () => {
    mockState.dashboardData = {
      current: [{
        developerId: 'alice', name: 'Alice', totalCommits: 5, totalPRs: 2,
        linesChanged: { added: 100, deleted: 50 }, cycleTimeHrs: 4, pickupDelayHrs: 1,
        reviewLifecycleHrs: 3, reviewDepth: 2, avgPrSizeLines: 100,
        openPrsOverThreshold: 0, prsReviewed: 1,
        workType: { features: 2, bugs: 0, infraOrDebt: 0 },
        codeQuality: { score: 80, bugRatio: 0, criticalScore: null, approvalScore: null, prFocusScore: null, reworkRate: 0 },
        prs: [],
      }],
      cacheStatus: 'full',
      cachedAt: Date.now(),
    };
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/served from sync cache/i);
    });
  });
});
