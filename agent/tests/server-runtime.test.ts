import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { AgentRuntime } from '../src/core/runtime.js';
import { SqliteStore } from '../src/core/store.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createAgentServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/index.js';
import { LocalCanvasGateway } from '../src/adapters/index.js';
import type { Provider, ProviderEvent, ProviderRequest } from '../src/contracts/index.js';

function provider(): Provider {
  return {
    id: 'http-fixture', revision: '1',
    capabilities: () => ({ contextWindow: 16_000, maxOutputTokens: 500, tools: true, vision: false, parallelTools: true }),
    stream: async function* (_request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      yield { type: 'text.delta', text: '收到。' };
      yield { type: 'done', reason: 'stop' };
    },
  };
}

test('business ownership admits multiple canvases with separate canonical sessions', async () => {
  const store = new SqliteStore();
  const canvas = new LocalCanvasGateway(':memory:');
  canvas.seed({ ownerId: 'alice', canvasId: 'a' });
  canvas.seed({ ownerId: 'alice', canvasId: 'b' });
  canvas.seed({ ownerId: 'bob', canvasId: 'private' });
  const runtime = new AgentRuntime({ store, providers: new ProviderRegistry([provider()]), tools: new ToolRegistry(), canvas });
  await runtime.ready();
  const server = createAgentServer(runtime, { bearerToken: 'test', defaultPrincipal: { ownerId: 'alice' }, canvas });
  const base = await listen(server);
  const create = (canvasId: string) => fetch(`${base}/api/sessions`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ canvasId }) });
  try {
    const a = await create('a');
    const b = await create('b');
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    const first = await a.json() as { session: { id: string } };
    const second = await b.json() as { session: { id: string } };
    assert.notEqual(first.session.id, second.session.id);
    const again = await (await create('a')).json() as { session: { id: string } };
    assert.equal(first.session.id, again.session.id);
    assert.equal((await create('private')).ok, false);
    assert.equal(store.listSessions({ ownerId: 'alice' }).length, 2);
  } finally { await close(server); store.close(); canvas.close(); }
});

async function listen(server: ReturnType<typeof createAgentServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createAgentServer>): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function requestWithHost(url: string, host: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const target = new URL(url);
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: target.pathname, method: 'GET', headers: { Host: host } }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    request.once('error', reject);
    request.end();
  });
}

test('native server exposes /api session/message/history and protects scope with bearer tokens', async () => {
  const store = new SqliteStore();
  const runtime = new AgentRuntime({ store, providers: new ProviderRegistry([provider()]), tools: new ToolRegistry() });
  await runtime.ready();
  const server = createAgentServer(runtime, { bearerToken: 'secret', defaultPrincipal: { ownerId: 'alice', canvasIds: ['canvas-1'] }, configured: true });
  const base = await listen(server);
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { configured: boolean }).configured, true);
    const unauthorized = await fetch(`${base}/api/sessions`);
    assert.equal(unauthorized.status, 401);
    const created = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ canvasId: 'canvas-1', providerId: 'http-fixture', model: 'fixture' }) });
    assert.equal(created.status, 201);
    const session = (await created.json() as { session: { id: string } }).session;
    const sent = await fetch(`${base}/api/sessions/${session.id}/messages`, { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '你好', requestId: 'req-1' }) });
    assert.equal(sent.status, 202);
    const sentAgain = await fetch(`${base}/api/sessions/${session.id}/messages`, { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '你好', requestId: 'req-1' }) });
    assert.equal(sentAgain.status, 202);
    assert.equal((await sentAgain.json() as { run: { id: string } }).run.id, (await sent.json() as { run: { id: string } }).run.id);
    const history = await fetch(`${base}/api/sessions/${session.id}/history`, { headers: { Authorization: 'Bearer secret' } });
    assert.equal(history.status, 200);
    assert.ok((await history.json() as { messages: unknown[] }).messages.length >= 1);
    const forbidden = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ canvasId: 'canvas-2' }) });
    assert.equal(forbidden.status, 403);
  } finally {
    await close(server);
    store.close();
  }
});

test('server rejects wildcard binding and unauthorised cross-origin loopback requests', async () => {
  const store = new SqliteStore();
  const runtime = new AgentRuntime({ store, providers: new ProviderRegistry([provider()]), tools: new ToolRegistry() });
  assert.throws(() => createAgentServer(runtime, { host: '0.0.0.0' }), /loopback/);
  assert.throws(() => createAgentServer(runtime, { corsOrigin: '*' }), /Wildcard CORS/);
  const server = createAgentServer(runtime, { configured: true, defaultPrincipal: { ownerId: 'local-user' } });
  const base = await listen(server);
  try {
    const crossOrigin = await fetch(`${base}/sessions`, { headers: { Origin: 'http://evil.example' } });
    assert.equal(crossOrigin.status, 403);
    const rebinding = await requestWithHost(`${base}/sessions`, 'evil.example');
    assert.equal(rebinding, 401);
  } finally {
    await close(server);
    store.close();
  }
});
