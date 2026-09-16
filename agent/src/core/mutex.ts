type Release = () => void;

/** A small FIFO async mutex. It is deliberately process-local; durable CAS remains
 * the authority for cross-process canvas writes. */
export class AsyncMutex {
  private locked = false;
  private readonly waiters: Array<(release: Release) => void> = [];

  get pending(): number {
    return this.waiters.length + (this.locked ? 1 : 0);
  }

  acquire(): Promise<Release> {
    return new Promise((resolve) => {
      const handoff = (release: Release) => resolve(release);
      if (!this.locked) {
        this.locked = true;
        resolve(() => this.release());
      } else {
        this.waiters.push(handoff);
      }
    });
  }

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next(() => this.release());
    else this.locked = false;
  }
}

export class KeyedMutex {
  private readonly locks = new Map<string, AsyncMutex>();

  get(key: string): AsyncMutex {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new AsyncMutex();
      this.locks.set(key, lock);
    }
    return lock;
  }

  async runExclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const lock = this.get(key);
    try {
      return await lock.runExclusive(fn);
    } finally {
      if (lock.pending === 0) this.locks.delete(key);
    }
  }
}
