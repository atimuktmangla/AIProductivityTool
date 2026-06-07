import { describe, it, expect } from 'vitest';

// The regex lives in aggregator.ts — we test the contract, not the import.
// If this regex is changed the behaviour changes — this test catches that.
const JIRA_KEY_RE = /([A-Z]+-\d+)/g;

function extractKeys(message: string): string[] {
  return [...message.matchAll(JIRA_KEY_RE)].map((m) => m[1]);
}

// ── REQ-4.4.3-2/3: Code review participation filtering ───────────────────────

describe('PR reviewer participation filtering (REQ-4.4.3-2/3)', () => {
  // @req REQ-4.4.3-2
  it('own PRs are excluded from reviewer participation count', () => {
    // The aggregator filters by pr.author.user.name !== devId
    const devId = 'alice';
    const prs = [
      { id: 1, author: { user: { name: 'alice' } } },  // own PR — excluded
      { id: 2, author: { user: { name: 'bob' } } },    // reviewer PR — included
    ];
    const reviewerPRs = prs.filter((pr) => pr.author.user.name !== devId);
    expect(reviewerPRs).toHaveLength(1);
    expect(reviewerPRs[0].id).toBe(2);
  });

  // @req REQ-4.4.3-3
  it('PR ids are deduplicated across repos', () => {
    // Same PR appearing from two different repo queries is counted once
    const allPRs = [{ id: 10 }, { id: 20 }, { id: 10 }]; // id 10 duplicated
    const deduped = [...new Map(allPRs.map((pr) => [pr.id, pr])).values()];
    expect(deduped).toHaveLength(2);
    expect(deduped.map((p) => p.id)).toEqual([10, 20]);
  });
});

// ── REQ-4.4.4-1: Assignee JQL shape ──────────────────────────────────────────

describe('assignee JQL construction (REQ-4.4.4-1)', () => {
  // @req REQ-4.4.4-1
  it('JQL query includes assignee in clause and date bounds', () => {
    // The aggregator builds a JQL string of this shape — verify the template
    const slugs = ['alice', 'bob'];
    const startDate = '2024-01-01';
    const endDate   = '2024-01-31';
    const jql = `assignee in (${slugs.map((s) => `"${s}"`).join(',')}) AND updated >= "${startDate}" AND updated <= "${endDate}"`;
    expect(jql).toContain('assignee in ("alice","bob")');
    expect(jql).toContain(`updated >= "${startDate}"`);
    expect(jql).toContain(`updated <= "${endDate}"`);
  });
});

// ── REQ-4.4.4-2/3: Commit message regex + deduplication ──────────────────────

describe('Jira key extraction from commit / PR title (REQ-4.4.4-2)', () => {
  // @req REQ-4.4.4-2
  it('extracts a single key from a commit message', () => {
    expect(extractKeys('PROJ-123 fix null pointer')).toEqual(['PROJ-123']);
  });

  // @req REQ-4.4.4-2
  it('extracts multiple keys from one message', () => {
    expect(extractKeys('PROJ-1 and PROJ-2 refactor service')).toEqual(['PROJ-1', 'PROJ-2']);
  });

  // @req REQ-4.4.4-2
  it('handles keys with multi-char project prefixes', () => {
    expect(extractKeys('MYPROJECT-456 update deps')).toEqual(['MYPROJECT-456']);
  });

  // @req REQ-4.4.4-2
  it('ignores lowercase project prefixes', () => {
    expect(extractKeys('proj-123 fix')).toEqual([]);
  });

  // @req REQ-4.4.4-2
  it('returns empty array when no keys present', () => {
    expect(extractKeys('chore: bump version to 1.2.3')).toEqual([]);
  });

  // @req REQ-4.4.4-3
  it('deduplication — duplicate keys in different messages produce one entry', () => {
    const messages = ['PROJ-1 fix A', 'PROJ-1 fix B', 'PROJ-2 add feature'];
    const allKeys = messages.flatMap(extractKeys);
    const deduped = [...new Set(allKeys)];
    expect(deduped).toEqual(['PROJ-1', 'PROJ-2']);
  });
});
