import type { Provider, ProviderRegistryLike } from '../contracts/index.js';

/*
 * The revision-pinned registry follows the snapshot/lifecycle ideas in
 * Codex's core provider wiring, rewritten for this project's provider-neutral
 * contract. Provider objects are owned by this package; no Codex account state
 * or client session is carried into a snapshot.
 */

export interface ProviderSnapshot {
  readonly revision: string;
  readonly providers: readonly Provider[];
  readonly get: (id: string) => Provider;
  readonly list: () => { id: string; revision: string }[];
}

export interface ProviderMutationOptions {
  replace?: boolean;
  enabled?: boolean;
}

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function snapshotError(id: string): Error {
  return new Error(`Provider ${id} is not available in this snapshot`);
}

export class ProviderRegistry implements ProviderRegistryLike {
  private readonly providers = new Map<string, Provider>();
  private readonly disabled = new Set<string>();
  private revisionCounter = 0;
  private current: ProviderSnapshot;

  constructor(initial: Iterable<Provider> = []) {
    const values = [...initial];
    for (const provider of values) this.assertProvider(provider);
    for (const provider of values) {
      if (this.providers.has(provider.id)) throw new Error(`Provider ${provider.id} is already registered`);
      this.providers.set(provider.id, provider);
    }
    this.current = this.makeSnapshot();
  }

  get(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider || this.disabled.has(id)) throw snapshotError(id);
    return provider;
  }

  getFromSnapshot(snapshot: ProviderSnapshot, id: string): Provider {
    return snapshot.get(id);
  }

  list(): { id: string; revision: string }[] {
    return this.current.list();
  }

  has(id: string, snapshot: ProviderSnapshot = this.current): boolean {
    try {
      snapshot.get(id);
      return true;
    } catch {
      return false;
    }
  }

  isEnabled(id: string): boolean {
    return this.providers.has(id) && !this.disabled.has(id);
  }

  snapshot(): ProviderSnapshot {
    return this.current;
  }

  register(provider: Provider, options: ProviderMutationOptions = {}): ProviderSnapshot {
    this.assertProvider(provider);
    if (this.providers.has(provider.id) && !options.replace) {
      throw new Error(`Provider ${provider.id} is already registered`);
    }
    this.providers.set(provider.id, provider);
    if (options.enabled !== false) this.disabled.delete(provider.id);
    else this.disabled.add(provider.id);
    this.current = this.makeSnapshot();
    return this.current;
  }

  /** Alias used by configuration reloaders. */
  update(provider: Provider): ProviderSnapshot {
    return this.register(provider, { replace: true });
  }

  /** Upsert is explicit so callers do not accidentally replace a pinned provider. */
  upsert(provider: Provider): ProviderSnapshot {
    return this.register(provider, { replace: true });
  }

  disable(id: string): ProviderSnapshot {
    if (!this.providers.has(id)) throw snapshotError(id);
    this.disabled.add(id);
    this.current = this.makeSnapshot();
    return this.current;
  }

  enable(id: string): ProviderSnapshot {
    if (!this.providers.has(id)) throw snapshotError(id);
    this.disabled.delete(id);
    this.current = this.makeSnapshot();
    return this.current;
  }

  remove(id: string): ProviderSnapshot {
    if (!this.providers.has(id)) throw snapshotError(id);
    this.providers.delete(id);
    this.disabled.delete(id);
    this.current = this.makeSnapshot();
    return this.current;
  }

  select(id: string, snapshot: ProviderSnapshot = this.current): Provider {
    return snapshot.get(id);
  }

  private makeSnapshot(): ProviderSnapshot {
    this.revisionCounter += 1;
    const providers = [...this.providers.entries()]
      .filter(([id]) => !this.disabled.has(id))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, provider]) => provider);
    const frozenProviders = Object.freeze(providers.slice()) as readonly Provider[];
    const revision = `providers-${this.revisionCounter}-${hash(
      frozenProviders.map((provider) => `${provider.id}@${provider.revision}`).join('|'),
    )}`;
    const byId = new Map(frozenProviders.map((provider) => [provider.id, provider]));
    const list = () => frozenProviders.map((provider) => ({ id: provider.id, revision: provider.revision }));
    const snapshot: ProviderSnapshot = {
      revision,
      providers: frozenProviders,
      get: (id: string) => {
        const provider = byId.get(id);
        if (!provider) throw snapshotError(id);
        return provider;
      },
      list,
    };
    return Object.freeze(snapshot);
  }

  private assertProvider(provider: Provider): void {
    if (
      !provider ||
      typeof provider.id !== 'string' ||
      provider.id.trim() === '' ||
      typeof provider.revision !== 'string' ||
      provider.revision.trim() === '' ||
      typeof provider.capabilities !== 'function' ||
      typeof provider.stream !== 'function'
    ) {
      throw new TypeError('Provider must expose id, revision, capabilities and stream');
    }
  }
}
