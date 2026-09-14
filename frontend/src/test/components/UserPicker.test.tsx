import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserPicker } from '../../components/UserPicker.js';
import type { BitbucketUser } from '../../types/index.js';

const USERS: BitbucketUser[] = [
  { name: 'alice', displayName: 'Alice Smith',  emailAddress: 'alice@example.com' },
  { name: 'bob',   displayName: 'Bob Jones',    emailAddress: 'bob@example.com' },
  { name: 'carol', displayName: 'Carol White',  emailAddress: 'carol@example.com' },
];

function mockFetch(first: BitbucketUser[], rest: BitbucketUser[] = []) {
  // UserPicker fetches first 10 immediately then fetches the remainder (start=10).
  let call = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    const data = call === 0 ? first : rest;
    call++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  }));
}

beforeEach(() => vi.restoreAllMocks());

describe('UserPicker loads users on mount (REQ-4.1-1)', () => {
  // @req REQ-4.1-1
  it('fetches /api/dashboard/users on mount and renders display names', async () => {
    mockFetch(USERS, []);
    render(<UserPicker selectedUsers={[]} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });
  });

  // @req REQ-4.6-1
  it('shows skeleton placeholders while loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<UserPicker selectedUsers={[]} onChange={vi.fn()} />);
    const skeletons = document.querySelectorAll('.user-picker__item--skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('UserPicker shows avatar initials (REQ-4.1-2)', () => {
  // @req REQ-4.1-2
  it('renders initials derived from displayName', async () => {
    mockFetch(USERS, []);
    render(<UserPicker selectedUsers={[]} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('AS')).toBeInTheDocument());
    expect(screen.getByText('BJ')).toBeInTheDocument();
  });
});

describe('UserPicker search (REQ-4.1-3)', () => {
  // @req REQ-4.1-3
  it('filters by display name', async () => {
    mockFetch(USERS, []);
    render(<UserPicker selectedUsers={[]} onChange={vi.fn()} />);
    await waitFor(() => screen.getByText('Alice Smith'));
    await userEvent.type(screen.getByRole('searchbox'), 'alice');
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  // @req REQ-4.1-3
  it('filters by username slug', async () => {
    mockFetch(USERS, []);
    render(<UserPicker selectedUsers={[]} onChange={vi.fn()} />);
    await waitFor(() => screen.getByText('Bob Jones'));
    await userEvent.type(screen.getByRole('searchbox'), 'bob');
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });
});

describe('Select all button (REQ-4.1-4)', () => {
  // @req REQ-4.1-4
  it('selects all currently filtered users', async () => {
    mockFetch(USERS, []);
    const onChange = vi.fn();
    render(<UserPicker selectedUsers={[]} onChange={onChange} />);
    await waitFor(() => screen.getByText('Alice Smith'));
    await userEvent.click(screen.getByRole('button', { name: /select all/i }));
    expect(onChange).toHaveBeenCalledWith(['alice', 'bob', 'carol']);
  });

  // @req REQ-4.1-4
  it('select all only selects filtered results when a search is active', async () => {
    mockFetch(USERS, []);
    const onChange = vi.fn();
    render(<UserPicker selectedUsers={[]} onChange={onChange} />);
    await waitFor(() => screen.getByText('Alice Smith'));
    await userEvent.type(screen.getByRole('searchbox'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: /select all/i }));
    expect(onChange).toHaveBeenCalledWith(['alice']);
  });
});

describe('UserPicker selection state', () => {
  // @req REQ-4.1-5
  it('toggling a user calls onChange with updated selection', async () => {
    mockFetch(USERS, []);
    const onChange = vi.fn();
    render(<UserPicker selectedUsers={[]} onChange={onChange} />);
    await waitFor(() => screen.getByText('Alice Smith'));
    await userEvent.click(screen.getByText('Alice Smith'));
    expect(onChange).toHaveBeenCalledWith(['alice']);
  });

  // @req REQ-4.1-5
  it('toggling a selected user removes them from selection', async () => {
    mockFetch(USERS, []);
    const onChange = vi.fn();
    render(<UserPicker selectedUsers={['alice']} onChange={onChange} />);
    await waitFor(() => screen.getByText('Alice Smith'));
    await userEvent.click(screen.getByText('Alice Smith'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
