import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderRegistry } from '../src/providers/index.js';
import { ProviderSettingsManager } from '../src/server/provider-settings.js';

test('provider settings persist privately, redact reads and retain immutable running snapshots', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-settings-'));
  const file = join(directory, 'provider.json');
  const defaults = { providerId: 'glm', model: 'glm-5.3-flash', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '' };
  const registry = new ProviderRegistry();
  try {
    const settings = new ProviderSettingsManager(file, defaults, registry);
    settings.save({ apiKey: 'fixture-private-key' });
    const snapshot = registry.snapshot();
    const previous = snapshot.get('glm');
    assert.equal(settings.read().hasKey, true);
    assert.equal(JSON.stringify(settings.read()).includes('fixture-private-key'), false);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    settings.save({ model: 'next-model' });
    assert.equal(snapshot.get('glm'), previous);
    assert.notEqual(registry.get('glm'), previous);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).apiKey, 'fixture-private-key');
    assert.throws(() => settings.save({ baseUrl: 'https://different.example/v1' }), /重新填写/);
    assert.throws(() => settings.save({ baseUrl: 'http://different.example', apiKey: 'new' }), /HTTPS/);
    const restored = new ProviderSettingsManager(file, defaults, new ProviderRegistry());
    assert.equal(restored.read().model, 'next-model');
    assert.equal(restored.configured, true);
    settings.save({ baseUrl: 'https://different.example/v1', apiKey: 'replacement-key' });
    chmodSync(file, 0o644);
    const moved = new ProviderSettingsManager(file, defaults, new ProviderRegistry());
    assert.equal(moved.read().baseUrl, 'https://different.example/v1');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(moved.provider()).includes('replacement-key'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('connection failures redact provider errors and testing does not persist candidate settings', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-settings-test-'));
  try {
    const registry = new ProviderRegistry();
    const settings = new ProviderSettingsManager(join(directory, 'provider.json'), {
      providerId: 'glm', model: 'old-model', baseUrl: 'https://provider.example/v1', apiKey: 'fixture-secret',
    }, registry);
    const initial = settings.read();
    t.mock.method(settings, 'provider', () => ({ stream: async function* () { throw new Error('upstream echoed fixture-secret'); } }));
    await assert.rejects(settings.test({ model: 'candidate' }), (error: Error) => {
      assert.match(error.message, /连接测试失败/);
      assert.equal(error.message.includes('fixture-secret'), false);
      return true;
    });
    assert.deepEqual(settings.read(), initial);
    assert.deepEqual(registry.list(), []);
    await assert.rejects(settings.test({ baseUrl: 'https://other.example/v1' }), /重新填写/);
    await assert.rejects(settings.test({ baseUrl: 'https://name:password@provider.example/v1', apiKey: 'replacement' }), /HTTPS/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
