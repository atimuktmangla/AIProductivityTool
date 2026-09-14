import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import type { BitbucketUser } from '../types/index.js';
import { Skeleton } from './Skeleton.js';

interface UserPickerProps {
  selectedUsers: string[];
  onChange: (users: string[]) => void;
}

function initials(displayName: string): string {
  return displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const API_HEADERS = { 'X-Api-Key': import.meta.env.VITE_API_KEY as string };

async function fetchUsers(params: Record<string, number>, signal: AbortSignal): Promise<BitbucketUser[]> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const r = await fetch(`/api/dashboard/users?${qs}`, { signal, headers: API_HEADERS });
  if (!r.ok) throw new Error(`Failed to load users (${r.status})`);
  return r.json() as Promise<BitbucketUser[]>;
}

export function UserPicker({ selectedUsers, onChange }: UserPickerProps) {
  const [allUsers, setAllUsers] = useState<BitbucketUser[]>([]);
  const [filter,   setFilter]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // Phase 1: fetch first 10 immediately so the picker feels instant
    fetchUsers({ limit: 10 }, signal)
      .then((first10) => {
        setAllUsers(first10);
        setLoading(false);

        // Phase 2: fetch the rest and append without disrupting existing items
        return fetchUsers({ start: 10 }, signal);
      })
      .then((rest) => {
        if (rest.length > 0) {
          setAllUsers((prev) => [...prev, ...rest]);
        }
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load users');
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const filtered = filter
    ? allUsers.filter(
        (u) =>
          u.displayName.toLowerCase().includes(filter.toLowerCase()) ||
          u.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : allUsers;

  const toggleUser = useCallback(
    (slug: string) => {
      onChange(
        selectedUsers.includes(slug)
          ? selectedUsers.filter((s) => s !== slug)
          : [...selectedUsers, slug],
      );
    },
    [selectedUsers, onChange],
  );

  const selectAll  = useCallback(() => onChange(filtered.map((u) => u.name)), [filtered, onChange]);
  const clearAll   = useCallback(() => onChange([]), [onChange]);
  const handleFilterChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value),
    [],
  );

  if (error) {
    return <div className="user-picker__error" role="alert">{error}</div>;
  }

  return (
    <div className="user-picker">
      <div className="user-picker__search">
        <input
          type="search"
          placeholder="Search users…"
          value={filter}
          onChange={handleFilterChange}
          className="user-picker__input"
          aria-label="Search users"
        />
        <div className="user-picker__bulk-actions">
          <button type="button" onClick={selectAll} className="btn btn--ghost">Select all</button>
          <button type="button" onClick={clearAll}  className="btn btn--ghost">Clear</button>
        </div>
      </div>

      <div className="user-picker__list" role="listbox" aria-multiselectable="true">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="user-picker__item user-picker__item--skeleton">
                <Skeleton width="2rem" height="2rem" className="user-picker__avatar-skeleton" />
                <Skeleton width="60%" height="0.9rem" />
              </div>
            ))
          : filtered.map((user) => {
              const selected = selectedUsers.includes(user.name);
              return (
                <div
                  key={user.name}
                  role="option"
                  aria-selected={selected}
                  className={`user-picker__item${selected ? ' user-picker__item--selected' : ''}`}
                  onClick={() => toggleUser(user.name)}
                  onKeyDown={(e) => e.key === 'Enter' && toggleUser(user.name)}
                  tabIndex={0}
                >
                  <span className="user-picker__avatar" aria-hidden="true">{initials(user.displayName)}</span>
                  <span className="user-picker__name">{user.displayName}</span>
                  {selected && <span className="user-picker__check" aria-hidden="true">✓</span>}
                </div>
              );
            })}
      </div>

      {selectedUsers.length > 0 && (
        <p className="user-picker__count">{selectedUsers.length} selected</p>
      )}
    </div>
  );
}
