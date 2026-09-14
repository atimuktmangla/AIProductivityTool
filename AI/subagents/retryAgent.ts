// Retry subagent: wraps any async operation with exponential backoff.
// Used by DB services to handle transient Atlassian API failures (502, 503, network blips).

export interface RetryOptions {
  maxAttempts?: number;   // default 3
  baseDelayMs?: number;   // default 500
  maxDelayMs?:  number;   // default 10_000
  // Return true to retry on this error; false to re-throw immediately.
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

const DEFAULT_OPTS: Required<RetryOptions> = {
  maxAttempts: 4,
  baseDelayMs: 800,
  maxDelayMs:  15_000,
  shouldRetry: isTransient,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTS, ...options };
  let lastErr: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.maxAttempts || !opts.shouldRetry(err, attempt)) {
        throw err;
      }
      const delay = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
      console.warn(
        `[retryAgent] attempt ${attempt} failed — retrying in ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}

function isTransient(err: unknown): boolean {
  if (err instanceof Error) {
    // Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
    if ('code' in err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(code ?? '')) return true;
    }
    // Atlassian 5xx and 429 (rate-limited) — safe to retry
    if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
      const status = (err as { status: number }).status;
      return status === 429 || status >= 500;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
