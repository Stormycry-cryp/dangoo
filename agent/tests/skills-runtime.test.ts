import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentRuntime } from '../src/core/runtime.js';
import { SqliteStore } from '../src/core/store.js';
import { ProviderRegistry } from '../src/providers/index.js';
import { SkillRegistry } from '../src/skills/index.js';
import type { Provider, ProviderEvent, ProviderRequest } from '../src/contracts/index.js';

const modelCapabilities = () => ({
  contextWindow: 20_000,
  maxOutputTokens: 1_000,
  tools: true,
  vision: false,
  parallelTools: true,
});

async function makeSkill(root: string, name: string, body: string, revision = '1'): Promise<void> {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} fixture\nrevision: '${revision}'\n---\n${body}\n`);
}

function fixtureProvider(requests: ProviderRequest[]): Provider {
  return {
    id: 'fixture',
    revision: 'fixture-1',
    capabilities: modelCapabilities,
    stream(request) {
      requests.push(request);
      return (async function* (): AsyncGenerator<ProviderEvent> {
        yield { type: 'text.delta', text: '完成' };
        yield { type: 'done', reason: 'stop' };
      })();
    },
  };
}

async function eventually<T>(read: () => T | undefined, timeout = 2_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition timed out');
}

test('builtin and workspace roots are discovered with workspace precedence, and explicit skills are injected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dangoo-skill-runtime-'));
  const builtinRoot = path.join(root, 'builtin');
  const workspaceRoot = path.join(root, 'workspace');
  await makeSkill(builtinRoot, 'builtin-only', 'BUILTIN BODY');
  await makeSkill(builtinRoot, 'same-name', 'BUILTIN BODY');
  await makeSkill(workspaceRoot, 'same-name', 'WORKSPACE BODY');

  const skills = new SkillRegistry({
    roots: [
      { path: builtinRoot, scope: 'builtin' },
      { path: workspaceRoot, scope: 'workspace' },
    ],
  });
  const discovery = await skills.discover();
  assert.deepEqual(discovery.errors, []);
  assert.equal(await skills.read('same-name'), 'WORKSPACE BODY\n');

  const requests: ProviderRequest[] = [];
  const store = new SqliteStore();
  const runtime = new AgentRuntime({
    store,
    providers: new ProviderRegistry([fixtureProvider(requests)]),
    skills,
  });
  await runtime.ready();

  const capabilities = runtime.capabilities() as { skills: Array<Record<string, unknown>> };
  const builtin = capabilities.skills.find((skill) => skill.name === 'builtin-only');
  assert.equal(builtin?.scope, 'builtin');
  assert.equal(builtin?.enabled, true);

  const session = runtime.createSession({ ownerId: 'alice', canvasId: 'canvas', providerId: 'fixture', model: 'fixture' });
  const run = await runtime.sendMessage(session.id, { text: '使用内置 Skill', skillNames: ['builtin-only'] });
  const completed = await eventually(() => {
    const current = store.getRun(run.id);
    return current && ['completed', 'failed', 'partial'].includes(current.state) ? current : undefined;
  });
  assert.equal(completed.state, 'completed');
  assert.equal(requests.length, 1);
  const system = requests[0].messages.find((message) => message.role === 'system');
  assert.ok(system);
  assert.match(system.content.map((part) => part.type === 'text' ? part.text : '').join('\n'), /BUILTIN BODY/);

  store.close();
});

test('an invalid explicitly requested skill fails closed before the provider is called', async () => {
  const requests: ProviderRequest[] = [];
  const store = new SqliteStore();
  const runtime = new AgentRuntime({
    store,
    providers: new ProviderRegistry([fixtureProvider(requests)]),
    skills: new SkillRegistry(),
  });
  await runtime.ready();
  const session = runtime.createSession({ ownerId: 'alice', canvasId: 'canvas', providerId: 'fixture', model: 'fixture' });
  const run = await runtime.sendMessage(session.id, { text: '调用不存在的 Skill', skillNames: ['missing-skill'] });
  const failed = await eventually(() => {
    const current = store.getRun(run.id);
    return current?.state === 'failed' ? current : undefined;
  });
  assert.match(failed.error ?? '', /missing-skill|unavailable|not found/);
  assert.equal(requests.length, 0);
  store.close();
});
