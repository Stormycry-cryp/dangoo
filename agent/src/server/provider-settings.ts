import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { OpenAICompatibleProvider, ProviderRegistry } from '../providers/index.js';
import type { ModelCapabilities } from '../contracts/index.js';

export interface ProviderSettings {
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export class ProviderSettingsManager {
  private current: ProviderSettings;
  constructor(private path: string, defaults: ProviderSettings, private registry: ProviderRegistry, private capabilities: ModelCapabilities = { contextWindow: 128000, maxOutputTokens: 8192, tools: true, vision: true, parallelTools: true }) {
    this.current = existsSync(path) ? this.validate(JSON.parse(readFileSync(path, 'utf8')), defaults) : defaults;
    if (existsSync(path)) chmodSync(path, 0o600);
  }
  get configured() { return Boolean(this.current.apiKey); }
  read() {
    const { apiKey, ...publicSettings } = this.current;
    return { ...publicSettings, hasKey: Boolean(apiKey) };
  }
  provider(settings = this.current) {
    return new OpenAICompatibleProvider({ id: settings.providerId, model: settings.model, baseUrl: settings.baseUrl,
      capabilities: this.capabilities,
      credential: settings.apiKey || undefined, extraBody: settings.providerId === 'glm' ? { thinking: { type: 'disabled' } } : undefined });
  }
  private validate(input: Record<string, unknown>, prior = this.current): ProviderSettings {
    const providerId = typeof input.providerId === 'string' ? input.providerId.trim() : prior.providerId;
    const model = typeof input.model === 'string' ? input.model.trim() : prior.model;
    const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : prior.baseUrl;
    const apiKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : prior.apiKey;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(providerId) || !model || model.length > 256 || apiKey.length > 4096) throw new Error('Provider 配置无效');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('API 地址须为不含凭据的 HTTPS 地址');
    // A saved key is never forwarded to a newly typed endpoint without replacement.
    if (baseUrl !== prior.baseUrl && !(typeof input.apiKey === 'string' && input.apiKey.trim())) throw new Error('更换 API 地址时请重新填写密钥');
    return { providerId, model, baseUrl, apiKey };
  }
  async test(input: Record<string, unknown>) {
    const settings = this.validate(input);
    if (!settings.apiKey) throw new Error('请填写 API 密钥');
    let done = false;
    try {
      for await (const event of this.provider(settings).stream({ model: settings.model, messages: [{ id: 'connection-test', createdAt: Date.now(), role: 'user', content: [{ type: 'text', text: 'Reply OK' }] }], tools: [], signal: AbortSignal.timeout(20_000), maxOutputTokens: 16 })) {
        if (event.type === 'done') done = true;
      }
    } catch { throw new Error('连接测试失败，请检查地址、模型与密钥'); }
    if (!done) throw new Error('连接测试未完整返回');
    return { ok: true };
  }
  save(input: Record<string, unknown>) {
    const next = this.validate(input);
    const provider = this.provider(next);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, this.path);
    this.registry.upsert(provider);
    this.current = next;
    return this.read();
  }
}
