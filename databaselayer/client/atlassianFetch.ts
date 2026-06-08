import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import https from 'node:https';
import { getConfig } from '../../backend/config/env.js';
import { AtlassianHttpError } from '../errors/AtlassianHttpError.js';
import { withRetry } from '../../AI/subagents/retryAgent.js';

// Tolerates self-signed certificates common on on-prem Atlassian servers.
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 32,       // per-host socket pool — prevents OS-level connection exhaustion
  maxFreeSockets: 16,
});

function createInstance(baseUrl: string, token: string): AxiosInstance {
  const { httpTimeoutMs } = getConfig();
  return axios.create({
    baseURL:    baseUrl,
    httpsAgent,
    headers: {
      Authorization:  `Bearer ${token}`,
      Accept:         'application/json',
      'Content-Type': 'application/json',
    },
    timeout: httpTimeoutMs,
  });
}

// ── Global concurrency semaphore ──────────────────────────────────────────────
// Caps total simultaneous in-flight HTTP requests across ALL Bitbucket/Jira calls.
// Prevents the on-prem server from receiving hundreds of parallel requests when
// running reports for many developers against many repos.
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running++;
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// Lazily initialised so getConfig() is called after dotenv loads.
let _semaphore: Semaphore | null = null;
function getSemaphore(): Semaphore {
  if (!_semaphore) {
    const { httpConcurrency } = getConfig();
    _semaphore = new Semaphore(httpConcurrency);
  }
  return _semaphore;
}

const instanceCache = new Map<string, AxiosInstance>();

function getInstance(baseUrl: string, token: string): AxiosInstance {
  const key = `${baseUrl}::${token}`;
  if (!instanceCache.has(key)) {
    instanceCache.set(key, createInstance(baseUrl, token));
  }
  return instanceCache.get(key)!;
}

export async function atlassianGet<T>(
  baseUrl: string,
  token: string,
  path: string,
  params?: Record<string, string | number | boolean>,
): Promise<T> {
  const instance = getInstance(baseUrl, token);
  const sem = getSemaphore();
  return withRetry(async () => {
    await sem.acquire();
    try {
      const response = await instance.get<T>(path, { params });
      return response.data;
    } catch (err) {
      throw toAtlassianError(err, `${baseUrl}${path}`);
    } finally {
      sem.release();
    }
  });
}

export async function atlassianPost<T>(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
): Promise<T> {
  const instance = getInstance(baseUrl, token);
  const sem = getSemaphore();
  return withRetry(async () => {
    await sem.acquire();
    try {
      const response = await instance.post<T>(path, body);
      return response.data;
    } catch (err) {
      throw toAtlassianError(err, `${baseUrl}${path}`);
    } finally {
      sem.release();
    }
  });
}

function toAtlassianError(err: unknown, url: string): unknown {
  const axiosErr = err as AxiosError<{ message?: string; errorMessages?: string[] }>;
  if (!axiosErr.isAxiosError) return err;

  if (axiosErr.response) {
    const { status, statusText, data } = axiosErr.response;
    const detail =
      data?.message ??
      data?.errorMessages?.[0] ??
      statusText ??
      'Unknown error';
    return new AtlassianHttpError(status, statusText ?? '', detail, url);
  }

  // Network-level failure (ECONNREFUSED, ETIMEDOUT, DNS, etc.)
  const code = (axiosErr.cause as NodeJS.ErrnoException | undefined)?.code ?? axiosErr.code ?? 'NETWORK_ERROR';
  return new AtlassianHttpError(0, code, axiosErr.message, url);
}
