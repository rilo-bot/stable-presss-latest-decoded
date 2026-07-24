// Bounded-concurrency map. MuPDF's own calls are synchronous WASM (no real
// parallelism to gain there), but the AI classification call per page is
// network-bound — this is what PAGE_CONCURRENCY actually parallelizes.
//
// Ported verbatim from the campaign-hq reference (apps/worker/src/lib/pool.ts).

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return results;
}
