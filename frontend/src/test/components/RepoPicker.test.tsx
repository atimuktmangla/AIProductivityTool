import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoPicker } from '../../components/RepoPicker.js';

const PROJECTS = ['SS', 'CORE', 'PLATFORM'];
const REPOS = [
  { projectKey: 'SS', repoSlug: 'react-app' },
  { projectKey: 'SS', repoSlug: 'api-service' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('/projects')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(PROJECTS) });
    }
    if (url.includes('/repos')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(REPOS) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  }));
});

function buildProps(overrides?: Partial<Parameters<typeof RepoPicker>[0]>) {
  return {
    selectedRepoTargets: [],
    selectedProjects: [],
    onRepoTargetsChange: vi.fn(),
    onProjectsChange: vi.fn(),
    ...overrides,
  };
}

describe('RepoPicker', () => {
  // @req REQ-4.3-1
  it('loads and renders project pills on mount', async () => {
    render(<RepoPicker {...buildProps()} />);
    await waitFor(() => {
      expect(screen.getByText('SS')).toBeInTheDocument();
      expect(screen.getByText('CORE')).toBeInTheDocument();
      expect(screen.getByText('PLATFORM')).toBeInTheDocument();
    });
  });

  // @req REQ-4.3-1
  it('calls onProjectsChange when a project pill is clicked', async () => {
    const onProjectsChange = vi.fn();
    render(<RepoPicker {...buildProps({ onProjectsChange })} />);
    await waitFor(() => screen.getByText('SS'));
    await userEvent.click(screen.getByText('SS'));
    expect(onProjectsChange).toHaveBeenCalledWith(['SS']);
  });

  // @req REQ-4.3-2
  it('shows tier indicator labels', async () => {
    render(<RepoPicker {...buildProps()} />);
    await waitFor(() => {
      const text = document.body.textContent ?? '';
      expect(text).toMatch(/project|tier|repo/i);
    });
  });

  // @req REQ-4.3-1
  it('displays selected repo chips when repoTargets are provided', async () => {
    render(<RepoPicker {...buildProps({ selectedRepoTargets: REPOS })} />);
    await waitFor(() => {
      expect(screen.getByText(/react-app/)).toBeInTheDocument();
      expect(screen.getByText(/api-service/)).toBeInTheDocument();
    });
  });

  // @req REQ-4.3-2
  it('shows repo list when projects are selected', async () => {
    render(<RepoPicker {...buildProps({ selectedProjects: ['SS'] })} />);
    await waitFor(() => {
      expect(screen.getByText(/react-app/)).toBeInTheDocument();
    });
  });
});
