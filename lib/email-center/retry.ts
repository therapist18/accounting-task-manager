// A big backfill runs many mailboxes at once, each pushing several messages through Gmail + Supabase
// concurrently — enough sustained concurrent traffic that a socket occasionally resets (ECONNRESET)
// or the fetch itself fails outright, with nothing wrong on either end. Both postgrest-js and
// storage-js swallow that kind of transport failure into a normal `{ data: null, error }` result
// rather than letting the promise reject, so callers already checking `if (error)` don't need to
// change how they read the result — they just wrap the call.

const TRANSIENT_RE = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|EAI_AGAIN|socket hang up|network/i

function isTransient(error: unknown): boolean {
  if (!error) return false
  const err = error as any
  const causeCode = err?.cause?.code ?? err?.originalError?.cause?.code ?? err?.originalError?.code
  if (causeCode && TRANSIENT_RE.test(String(causeCode))) return true
  return TRANSIENT_RE.test(String(err?.message ?? err))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Retries a Supabase call (postgrest or storage — anything shaped `{ data, error }`) up to `attempts`
// times, but only when the error looks transient; a real error (constraint violation, missing column,
// bad request) comes back on the first try exactly as before. Exponential backoff with a little jitter
// so a whole batch of concurrent workers doesn't retry in lockstep and cause the same contention again.
export async function withSupabaseRetry<T>(
  fn: () => PromiseLike<{ data: T; error: any }>,
  attempts = 3,
  baseDelayMs = 400
): Promise<{ data: T; error: any }> {
  let result = await fn()
  for (let attempt = 1; attempt < attempts && isTransient(result.error); attempt++) {
    await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 150)
    result = await fn()
  }
  return result
}
