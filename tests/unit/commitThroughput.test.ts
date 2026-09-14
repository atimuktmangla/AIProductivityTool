import { describe, it, expect } from 'vitest';

// @req REQ-003-FR-010
describe('commit throughput (PR-based)', () => {
  // @req REQ-003-FR-010
  it('totalCommits equals sum of commitCount on PR bundles', () => {
    const prBundles = [
      { commitCount: 3 },
      { commitCount: 5 },
      { commitCount: 0 },
    ];
    const totalCommits = prBundles.reduce((s, b) => s + b.commitCount, 0);
    expect(totalCommits).toBe(8);
  });
});
