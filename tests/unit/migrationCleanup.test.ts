import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock jsonFileCache before importing the module under test
vi.mock('../../DB/cache/jsonFileCache.js', () => ({
  readJsonCache:  vi.fn(),
  writeJsonCache: vi.fn().mockResolvedValue(undefined),
  removeCacheDir: vi.fn().mockResolvedValue(undefined),
}));

import { readJsonCache, writeJsonCache, removeCacheDir } from '../../DB/cache/jsonFileCache.js';
import { runMigrationCleanup } from '../../DB/store/migrationCleanup.js';

const mockedRead   = vi.mocked(readJsonCache);
const mockedWrite  = vi.mocked(writeJsonCache);
const mockedRemove = vi.mocked(removeCacheDir);

afterEach(() => vi.clearAllMocks());

describe('runMigrationCleanup', () => {
  // @req REQ-4.12-5
  it('deletes legacy directories and writes sentinel when sentinel is absent', async () => {
    mockedRead.mockResolvedValue(null); // sentinel absent

    await runMigrationCleanup();

    expect(mockedRemove).toHaveBeenCalledWith('data/cache/metrics-result');
    expect(mockedRemove).toHaveBeenCalledWith('data/sync-logs');
    expect(mockedWrite).toHaveBeenCalledWith(
      'data/.migrated-to-sqlite',
      expect.objectContaining({ migratedAt: expect.any(String) }),
    );
  });

  // @req REQ-4.12-5
  it('skips cleanup entirely when sentinel is present', async () => {
    mockedRead.mockResolvedValue({ migratedAt: '2026-06-01T00:00:00.000Z' }); // sentinel present

    await runMigrationCleanup();

    expect(mockedRemove).not.toHaveBeenCalled();
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  // @req REQ-4.12-5
  it('continues non-blocking when removeCacheDir throws — only warns, never throws', async () => {
    mockedRead.mockResolvedValue(null);
    mockedRemove.mockRejectedValue(new Error('EPERM'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(runMigrationCleanup()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    // Sentinel must still be written even if delete failed
    expect(mockedWrite).toHaveBeenCalledWith(
      'data/.migrated-to-sqlite',
      expect.objectContaining({ migratedAt: expect.any(String) }),
    );

    warnSpy.mockRestore();
  });
});
