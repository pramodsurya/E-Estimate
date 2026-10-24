/** Small session cache. Aborting one consumer must not cancel a shared request. */
export class SorRequestCache {
  private entries = new Map<
    string,
    { promise: Promise<unknown>; expires: number }
  >();
  constructor(
    private limit = 96,
    private now = () => Date.now(),
  ) {}

  clear(): void {
    this.entries.clear();
  }

  get<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    signal?: AbortSignal,
    fresh = false,
  ): Promise<T> {
    if (signal?.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    let entry = this.entries.get(key);
    if (entry && (fresh || entry.expires <= this.now())) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const promise = Promise.resolve().then(fetcher);
      entry = { promise, expires: Number.POSITIVE_INFINITY };
      const current = entry;
      this.entries.set(key, current);
      void promise.then(
        () => {
          current.expires = this.now() + ttl;
        },
        () => {
          if (this.entries.get(key) === current) this.entries.delete(key);
        },
      );
      while (this.entries.size > this.limit)
        this.entries.delete(this.entries.keys().next().value!);
    } else {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    const promise = entry.promise as Promise<T>;
    if (!signal) return promise;
    return new Promise<T>((resolve, reject) => {
      const abort = (): void =>
        reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      void promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  }
}
