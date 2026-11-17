/** 200ms, then 400ms, then 800ms. Attempt 0 is the first retry. */
export function backoffMs(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt));
  return 200 * 2 ** step;
}

export async function withBackoff<T>(
  run: () => Promise<T>,
  options: {
    attempts: number;
    sleep?: (ms: number) => Promise<void>;
    retryable: (error: unknown) => boolean;
    onError?: (error: unknown, attempt: number, waitedMs: number) => void;
  },
): Promise<T> {
  const attempts = Math.max(1, options.attempts);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const again = options.retryable(error) && attempt < attempts - 1;
      const waitedMs = again ? backoffMs(attempt) : 0;
      options.onError?.(error, attempt, waitedMs);
      if (!again) throw error;
      await sleep(waitedMs);
    }
  }
  throw last;
}
