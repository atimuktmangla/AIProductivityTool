import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCachedCommitsByAuthor } from '../../databaselayer/cache/bitbucketCache.js';

const getCommitsByAuthorMock = vi.fn();
let cacheDir: string;

vi.mock('../../databaselayer/services/bitbucketService.js', () => ({
  getCommitsByAuthor: (...args: unknown[]) => getCommitsByAuthorMock(...args),
  getMergedPullRequestsByAuthor: vi.fn(),
  getPRActivities: vi.fn(),
  getPRDiffStat: vi.fn(),
  getPRCommitCount: vi.fn(),
  getReposWorkedByUser: vi.fn(),
  filterByUserActivity: vi.fn(),
}));

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({ cacheDir }),
}));

describe('bitbucketCommitCache', () => {
  beforeEach(() => {
    getCommitsByAuthorMock.mockReset();
    cacheDir = mkdtempSync(join(tmpdir(), 'bb-commit-cache-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  // @req REQ-003-FR-011
  it('serves closed month from cache without calling upstream', async () => {
    const month = '2020-03';
    const path = join(cacheDir, month, 'commits', 'PROJ__repo__dev1.json');
    mkdirSync(join(cacheDir, month, 'commits'), { recursive: true });
    writeFileSync(path, JSON.stringify([{ id: 'abc', authorTimestamp: 1 }]));

    const commits = await getCachedCommitsByAuthor('PROJ', 'repo', 'dev1', '2020-03-01', '2020-03-31');
    expect(commits).toHaveLength(1);
    expect(getCommitsByAuthorMock).not.toHaveBeenCalled();
  });

  // @req REQ-003-FR-012
  it('cache hit for closed month uses zero upstream pagination calls', async () => {
    const month = '2019-06';
    const path = join(cacheDir, month, 'commits', 'X__y__author.json');
    mkdirSync(join(cacheDir, month, 'commits'), { recursive: true });
    writeFileSync(path, JSON.stringify([]));

    await getCachedCommitsByAuthor('X', 'y', 'author', '2019-06-01', '2019-06-30');
    expect(getCommitsByAuthorMock).toHaveBeenCalledTimes(0);
  });
});
