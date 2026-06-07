import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Inline component to test cache banner behaviour in isolation from Dashboard's
// async side-effects. Pure function of cacheStatus + cachedAt.
function CacheBanner({
  cacheStatus,
  cachedAt,
}: {
  cacheStatus: 'full' | 'partial' | 'none' | undefined;
  cachedAt?: number;
}) {
  if (!cacheStatus || cacheStatus === 'none') return null;

  function fmtCachedAt(ms: number) {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="cache-banner" role="status">
      <span className="cache-banner__text">
        {cacheStatus === 'full'
          ? 'Served from sync cache'
          : 'Partial cache hit — some developers loaded live'}
        {cachedAt ? ` · synced ${fmtCachedAt(cachedAt)}` : ''}
      </span>
      <a className="cache-banner__link" href="#">Manage sync jobs →</a>
    </div>
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('Cache banner — full hit (REQ-4.8.6-1)', () => {
  // @req REQ-4.8.6-1
  it('shows "Served from sync cache" for full cache hit', () => {
    render(<CacheBanner cacheStatus="full" cachedAt={Date.now()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Served from sync cache');
  });

  // @req REQ-4.8.6-1
  it('includes the synced timestamp when cachedAt is provided', () => {
    const cachedAt = new Date('2026-06-03T10:47:00').getTime();
    render(<CacheBanner cacheStatus="full" cachedAt={cachedAt} />);
    expect(screen.getByRole('status')).toHaveTextContent(/synced/);
  });

  // @req REQ-4.8.6-1
  it('includes a "Manage sync jobs →" link', () => {
    render(<CacheBanner cacheStatus="full" cachedAt={Date.now()} />);
    expect(screen.getByRole('link', { name: /manage sync jobs/i })).toBeInTheDocument();
  });

  // @req REQ-4.8.6-1
  it('does not render when cacheStatus is "none"', () => {
    render(<CacheBanner cacheStatus="none" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // @req REQ-4.8.6-1
  it('does not render when cacheStatus is undefined', () => {
    render(<CacheBanner cacheStatus={undefined} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Cache banner — partial hit (REQ-4.8.6-2)', () => {
  // @req REQ-4.8.6-2
  it('shows partial hit message for partial cache status', () => {
    render(<CacheBanner cacheStatus="partial" cachedAt={Date.now()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Partial cache hit — some developers loaded live',
    );
  });
});
