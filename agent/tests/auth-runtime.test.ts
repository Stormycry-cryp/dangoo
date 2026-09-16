import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRuntime } from '../src/core/runtime.js';
import { SqliteStore } from '../src/core/store.js';
import { ProviderRegistry } from '../src/providers/index.js';
import { OwnerScopedHttpDangooGateway } from '../src/adapters/index.js';
import { createAgentServer } from '../src/server/server.js';
import { createEnvironmentRuntime } from '../src/server/main.js';
import type { Provider, ProviderEvent, ProviderRequest } from '../src/contracts/index.js';

const capabilities = () => ({ contextWindow: 16_000, maxOutputTokens: 500, tools: true, vision: false, parallelTools: true });

function provider(): Provider {
  return {
    id: 'fixture', revision: '1', capabilities,
    stream: async function* (_request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      yield { type: 'text.delta', text: 'ok' };
      yield { type: 'done', reason: 'stop' };
    },
  };
}

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

async function listenNode(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function closeNode(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function jsonResponse(res: import('node:http').ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}

test('PB identity and capabilities are checked per owner, and expired owner tokens are not borrowed', async () => {
  const ownerForToken = new Map([
    ['alice-v1', 'alice@example.com'],
    ['alice-v2', 'alice@example.com'],
    ['bob-v1', 'bob@example.com'],
  ]);
  const requests: Array<{ path: string; token: string }> = [];
  let aliceExpired = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const raw = new Headers(init?.headers).get('X-Pb-Auth') ?? '';
    const token = raw.replace(/^Bearer\s+/i, '');
    requests.push({ path: url.pathname, token });
    if (url.pathname.endsWith('/identity')) {
      const ownerId = ownerForToken.get(token);
      return ownerId ? new Response(JSON.stringify({ ownerId })) : new Response('{}', { status: 401 });
    }
    if (url.pathname.endsWith('/capabilities')) {
      return new Response(JSON.stringify({ contractVersion: '1.0.0', revision: 'bridge-1', nodes: [], operations: [], jobs: false, assets: false }));
    }
    if (aliceExpired && token === 'alice-v1') return new Response(JSON.stringify({ error: 'AUTH_REQUIRED' }), { status: 401 });
    const owner = ownerForToken.get(token);
    if (!owner) return new Response(JSON.stringify({ error: 'AUTH_REQUIRED' }), { status: 401 });
    return new Response(JSON.stringify({ canvasId: url.pathname.split('/').at(-1), revision: 1, nodes: [], edges: [] }));
  };
  const gateway = new OwnerScopedHttpDangooGateway({ baseUrl: 'https://example.com/agent-bridge/v1/', authHeader: 'X-Pb-Auth', fetch: fetcher });
  assert.equal(await gateway.authenticate('alice-v1'), 'alice@example.com');
  assert.equal(await gateway.authenticate('bob-v1'), 'bob@example.com');
  await gateway.read({ ownerId: 'alice@example.com', canvasId: 'alice-canvas' });
  await gateway.read({ ownerId: 'bob@example.com', canvasId: 'bob-canvas' });
  assert.deepEqual(requests.filter((item) => item.path.includes('/canvases/')).map((item) => item.token), ['alice-v1', 'bob-v1']);

  aliceExpired = true;
  await assert.rejects(() => gateway.read({ ownerId: 'alice@example.com', canvasId: 'alice-canvas' }), /业务接口请求失败/);
  assert.throws(() => gateway.read({ ownerId: 'alice@example.com', canvasId: 'alice-canvas' }), /授权已失效/);
  assert.equal(await gateway.authenticate('alice-v2'), 'alice@example.com');
  aliceExpired = false;
  await gateway.read({ ownerId: 'alice@example.com', canvasId: 'alice-canvas' });
  assert.equal(requests.at(-1)?.token, 'alice-v2');
  await assert.rejects(() => gateway.authenticate('forged'), /身份验证失败/);
});

test('async server authentication accepts PB header forms and isolates sessions, SSE, runs, and settings', async () => {
  const store = new SqliteStore();
  const runtime = new AgentRuntime({ store, providers: new ProviderRegistry([provider()]) });
  await runtime.ready();
  const server = createAgentServer(runtime, {
    authenticate: async (request) => {
      const authorization = request.headers.authorization;
      const pb = request.headers['x-pb-auth'];
      const token = String(pb ?? authorization ?? '').replace(/^Bearer\s+/i, '');
      if (token === 'alice') return { ownerId: 'alice@example.com' };
      if (token === 'bob') return { ownerId: 'bob@example.com' };
      throw new Error('invalid token');
    },
    requireAuth: true,
    allowUnauthenticatedLocal: false,
    configured: true,
  });
  const base = await listen(server);
  const request = (path: string, token: string | undefined, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    assert.equal((await request('capabilities', undefined)).status, 401);
    assert.equal((await request('capabilities', 'forged')).status, 401);
    assert.equal((await request('capabilities', 'alice', undefined, { 'X-Pb-Auth': 'bob' })).status, 401);
    assert.equal((await request('capabilities', undefined, undefined, { 'X-Pb-Auth': 'bob' })).status, 200);

    const created = await request('sessions', 'alice', { canvasId: 'alice-canvas', ownerId: 'bob@example.com' });
    assert.equal(created.status, 201);
    const aliceSession = (await created.json() as { session: { id: string; scope: { ownerId: string } } }).session;
    assert.equal(aliceSession.scope.ownerId, 'alice@example.com');
    const bobSessions = await request('sessions', 'bob');
    assert.equal((await bobSessions.json() as { sessions: unknown[] }).sessions.length, 0);
    assert.notEqual((await request(`sessions/${aliceSession.id}/history`, 'bob')).status, 200);
    assert.notEqual((await request(`sessions/${aliceSession.id}/events`, 'bob')).status, 200);

    const run = store.createRun({ id: 'alice-run', sessionId: aliceSession.id, turnId: 'turn', state: 'queued', providerId: 'fixture', model: 'fixture', providerRevision: '1', toolRevision: 'tools', skillRevision: 'skills', createdAt: Date.now(), updatedAt: Date.now() });
    assert.notEqual((await request(`runs/${run.id}/stop`, 'bob', {})).status, 200);
    assert.equal((await request(`runs/${run.id}/stop`, 'alice', {})).status, 200);
  } finally {
    await close(server);
    store.close();
  }
});

test('createEnvironmentRuntime wires PB identity per request without a startup business token', async () => {
  const owners = new Map([
    ['alice-token', 'Alice@Example.com'],
    ['bob-token', 'bob@example.com'],
    ['admin-token', 'admin@example.com'],
  ]);
  const allowedCanvas = new Map([
    ['alice@example.com', 'alice-canvas'],
    ['bob@example.com', 'bob-canvas'],
    ['admin@example.com', 'admin-canvas'],
  ]);
  const bridge = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const raw = req.headers['x-pb-auth'];
    const token = (Array.isArray(raw) ? raw[0] : raw ?? '').replace(/^Bearer\s+/i, '').trim();
    const owner = owners.get(token)?.trim().toLowerCase();
    if (url.pathname === '/identity') {
      if (token === 'banned-token') { jsonResponse(res, 403, { error: 'AUTH_FORBIDDEN' }); return; }
      if (!owner) { jsonResponse(res, 401, { error: 'AUTH_REQUIRED' }); return; }
      jsonResponse(res, 200, { ownerId: owners.get(token) });
      return;
    }
    if (!owner) { jsonResponse(res, 401, { error: 'AUTH_REQUIRED' }); return; }
    if (url.pathname === '/capabilities') {
      jsonResponse(res, 200, { contractVersion: '1.0.0', revision: 'fixture-bridge-1', nodes: [], operations: ['create'], jobs: false, assets: false });
      return;
    }
    const match = url.pathname.match(/^\/canvases\/([^/]+)$/);
    if (match && req.method === 'GET') {
      const canvasId = decodeURIComponent(match[1]);
      if (allowedCanvas.get(owner) !== canvasId) { jsonResponse(res, 404, { error: 'CANVAS_NOT_FOUND' }); return; }
      jsonResponse(res, 200, { canvasId, revision: 0, nodes: [], edges: [] });
      return;
    }
    jsonResponse(res, 404, { error: 'NOT_FOUND' });
  });
  const dataDir = await mkdtemp(join(tmpdir(), 'dangoo-agent-http-'));
  const bridgeBase = await listenNode(bridge);
  const environmentKeys = ['AGENT_CANVAS_MODE', 'DANGOO_BRIDGE_URL', 'DANGOO_AUTH_HEADER', 'DANGOO_AUTH_TOKEN', 'AGENT_TOKEN', 'AGENT_DATA_DIR', 'AGENT_OWNER_ID', 'AGENT_API_KEY', 'GLM_API_KEY', 'AGENT_SKILL_ROOTS'] as const;
  const previous = new Map<string, string | undefined>(environmentKeys.map((key) => [key, process.env[key]]));
  let environment: Awaited<ReturnType<typeof createEnvironmentRuntime>> | undefined;
  try {
    process.env.AGENT_CANVAS_MODE = 'http';
    process.env.DANGOO_BRIDGE_URL = bridgeBase;
    process.env.DANGOO_AUTH_HEADER = 'X-Pb-Auth';
    delete process.env.DANGOO_AUTH_TOKEN;
    delete process.env.AGENT_TOKEN;
    process.env.AGENT_DATA_DIR = dataDir;
    process.env.AGENT_OWNER_ID = 'Admin@Example.com';
    process.env.AGENT_API_KEY = '';
    process.env.GLM_API_KEY = '';
    process.env.AGENT_SKILL_ROOTS = '';

    environment = await createEnvironmentRuntime();
    const agentBase = await listenNode(environment.server);
    const get = (path: string, headers: Record<string, string> = {}) => fetch(`${agentBase}/api/${path}`, { headers });
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${agentBase}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    assert.equal((await get('health')).status, 200);
    assert.equal((await get('capabilities')).status, 401);
    assert.equal((await get('capabilities', { Authorization: 'Bearer forged-token' })).status, 401);
    assert.equal((await get('capabilities', { Authorization: 'Bearer banned-token' })).status, 403);
    assert.equal((await get('capabilities', { Authorization: 'Bearer bob-token', 'X-Pb-Auth': 'alice-token' })).status, 401);

    const created = await post('sessions', { canvasId: 'alice-canvas', ownerId: 'bob@example.com' }, { 'X-Pb-Auth': 'alice-token' });
    const createdBody = await created.text();
    assert.equal(created.status, 201, createdBody);
    const payload = JSON.parse(createdBody) as { session: { id: string; scope: { ownerId: string; canvasId: string } } };
    assert.equal(payload.session.scope.ownerId, 'alice@example.com');
    assert.equal(payload.session.scope.canvasId, 'alice-canvas');
    assert.equal((await get('canvas?canvasId=alice-canvas', { Authorization: 'Bearer bob-token' })).status, 404);
    assert.equal((await post('sessions', { canvasId: 'alice-canvas' }, { 'X-Pb-Auth': 'bob-token' })).status, 404);
    assert.equal((await get(`sessions/${payload.session.id}/history`, { Authorization: 'Bearer bob-token' })).status, 404);
    assert.equal((await get('settings/provider', { Authorization: 'Bearer alice-token' })).status, 403);
    assert.equal((await get('settings/provider', { 'X-Pb-Auth': 'admin-token' })).status, 200);
  } finally {
    if (environment) {
      const closed = new Promise<void>((resolve) => {
        if (!environment?.server.listening) { resolve(); return; }
        environment.server.once('close', () => resolve());
      });
      environment.close();
      await closed;
    }
    await closeNode(bridge);
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
