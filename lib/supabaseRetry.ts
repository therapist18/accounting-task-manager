// Shared retry-with-backoff for Supabase calls, for anywhere in the app that talks to Supabase under
// enough concurrent load to occasionally trip a transient network failure (ECONNRESET, a bare "fetch
// failed", a socket reset) that has nothing to do with the query itself — e.g. a page that fans out
// Promise.all across many users/rows at once, same as a heavy multi-mailbox email sync.
//
// Supabase (postgrest-js and storage-js) swallow that kind of transport failure into a normal
// `{ data: null, error }` result rather than letting the promise reject, so withSupabaseRetry checks
// `.error` and calls the function again — callers already checking `if (error)` don't need to change
// how they read the result. withRetry is the same idea for anything that THROWS on a transient failure
// instead (the Gmail API client, or any other plain async function).

const TRANSIENT_RE = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|EAI_AGAIN|ENOTFOUND|socket hang up|network/i

function isTransient(error: unknown): boolean {
  if (!error) return false
  const err = error as any
  const causeCode = err?.cause?.code ?? err?.originalError?.cause?.code ?? err?.originalError?.code ?? err?.code
  if (causeCode && TRANSIENT_RE.test(String(causeCode))) return true
  return TRANSIENT_RE.test(String(err?.message ?? err))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const backoffMs = (attempt: number, baseDelayMs: number) => baseDelayMs * 2 ** attempt + Math.random() * 150

// Retries a Supabase call (postgrest or storage — anything shaped `{ data, error }`) up to `attempts`
// times, but only when the error looks transient; a real error (constraint violation, missing column,
// bad request) comes back on the first try exactly as before. Exponential backoff with a little jitter
// so a whole batch of concurrent callers doesn't retry in lockstep and cause the same contention again.
// `R` is left as whatever the caller's query actually resolves to (not narrowed to just
// `{ data, error }`) so fields like Postgrest's `count` (from `{ count: "exact" }`) survive the retry
// wrapper untouched — only `error` needs to exist on it for the retry check itself.
export async function withSupabaseRetry<R extends { error: any }>(
  fn: () => PromiseLike<R>,
  attempts = 3,
  baseDelayMs = 400
): Promise<R> {
  let result = await fn()
  for (let attempt = 1; attempt < attempts && isTransient(result.error); attempt++) {
    await sleep(backoffMs(attempt - 1, baseDelayMs))
    result = await fn()
  }
  return result
}

// Same idea, for anything that THROWS on a transient network failure instead of returning it.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 400): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= attempts - 1 || !isTransient(err)) throw err
      await sleep(backoffMs(attempt, baseDelayMs))
    }
  }
}
