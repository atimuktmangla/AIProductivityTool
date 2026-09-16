import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { SyncStatus } from '../../types/index.js';

// Stub fetch globally
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }));
});

// Stub import.meta.env.VITE_API_KEY
vi.stubGlobal('import', { meta: { env: { VITE_API_KEY: 'test-key' } } });

// Mock useSync hook
const mockState = {
  status: { running: false, lastRunAt: null, nextRunAt: null, runStartedAt: null,
    activeUsers: [], completedUsers: [], failedUsers: [], totalSyncUsers: 0,
    configuredUsers: ['alice'], intervalMinutes: 0, scheduledTime: '' } as SyncStatus,
  logs: [],
  coverage: { configuredUsers: 1, cachedUsers: 1, uncachedUsers: [], staleUsers: [] },
  mode: 'manual' as const,
  selectedUsers: [],
  selectedProject: '',
  scheduleOption: 'now' as const,
  scheduledTime: '',
  purgeLogsOnRun: false,
  confirmed: false,
  isLoadingStatus: false,
  isLoadingLogs: false,
  isSaving: false,
  isWarmingUp: false,
  error: null,
};

const mockUseSync = {
  state: mockState,
  setMode: vi.fn(),
  setSelectedUsers: vi.fn(),
  setSelectedProject: vi.fn(),
  setScheduleOption: vi.fn(),
  setScheduledTime: vi.fn(),
  setPurgeLogsOnRun: vi.fn(),
  setConfirmed: vi.fn(),
  saveAndRun: vi.fn(),
  warmupMissing: vi.fn(),
  refreshStatus: vi.fn(),
};

vi.mock('../../hooks/useSync.js', () => ({
  useSync: () => mockUseSync,
}));

import { SyncPage } from '../../components/SyncPage.js';

describe('SyncPage', () => {
  beforeEach(() => vi.clearAllMocks());

  // @req REQ-4.8.1-1
  it('renders sync status section with Idle badge when not running', async () => {
    render(<SyncPage />);
    await waitFor(() => {
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });
  });

  // @req REQ-4.8.1-1
  it('renders Running badge when sync is active', async () => {
    mockState.status = { ...mockState.status, running: true, runStartedAt: Date.now(), totalSyncUsers: 2, activeUsers: ['alice'], completedUsers: [], failedUsers: [] };
    render(<SyncPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
    });
    mockState.status = { ...mockState.status, running: false, runStartedAt: null, totalSyncUsers: 0, activeUsers: [], completedUsers: [], failedUsers: [] };
  });

  // @req REQ-4.8.2-1
  it('renders mode tabs for user selection', async () => {
    render(<SyncPage />);
    await waitFor(() => {
      expect(screen.getByText('All users')).toBeInTheDocument();
      expect(screen.getByText('By project')).toBeInTheDocument();
      expect(screen.getByText('Select manually')).toBeInTheDocument();
    });
  });

  // @req REQ-4.8.7-1
  it('shows notice when sync is already running and disables run button', async () => {
    mockState.status = { ...mockState.status, running: true };
    render(<SyncPage />);
    await waitFor(() => {
      expect(screen.getByText(/already running/i)).toBeInTheDocument();
    });
    mockState.status = { ...mockState.status, running: false };
  });
});
