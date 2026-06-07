import { mkdir, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AtlassianHttpError } from '../errors/AtlassianHttpError.js';

export async function ensureCacheDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function readJsonCache<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new CacheReadError(filePath, err);
  }
}

export async function writeJsonCache<T>(filePath: string, data: T): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await ensureCacheDir(dirname(filePath));
  await writeFile(tmp, JSON.stringify(data), 'utf8');
  await rename(tmp, filePath);
}

export async function listCacheMonths(cacheRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(cacheRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function removeCacheDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}

export class CacheReadError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Failed to read cache file: ${filePath}`);
    this.name = 'CacheReadError';
    this.cause = cause;
  }
}
