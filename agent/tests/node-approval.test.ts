import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/core/store.js';
import { createNodeApprovalPolicy } from '../src/server/node-approval.js';
import type { CanvasGateway, Message, NodeQuote, Run, Scope, ToolDefinition, ToolResult } from '../src/contracts/index.js';
import type { ToolExecutionRequest } from '../src/core/tool-scheduler.js';

function fixture() {
  const store = new SqliteStore(':memory:');
  const session = store.createSession({ id: 'session', ownerId: 'owner', canvasId: 'canvas', providerId: 'fixture', model: 'model', createdAt: Date.now() });
  const other = store.createSession({ id: 'other-session', ownerId: 'owner', canvasId: 'other-canvas', providerId: 'fixture', model: 'model', createdAt: Date.now() });
  const quote: NodeQuote = { id: 'quote', nodeId: 'node', expectedRevision: 3, model: 'image-model', prompt: 'image', referenceCount: 0, price: { estimatedPrice: 0.1, priceText: '0.10 CNY' }, expiresAt: Date.now() + 60_000, approved: false };
  const approvals: { scope: Scope; id: string }[] = [];
  const gateway: CanvasGateway = {
    capabilities: () => ({ contractVersion: '1', revision: '1', nodes: [], operations: [], jobs: true }),
    read: async scope => ({ canvasId: scope.canvasId, revision: 3, nodes: [], edges: [] }),
    apply: async input => { throw new Error(`Unexpected mutation ${input.canvasId}`); },
    getQuote: async (scope, id) => {
      assert.deepEqual(scope, session.scope);
      assert.equal(id, quote.id);
      return { ...quote };
    },
    approveQuote: async (scope, id) => {
      approvals.push({ scope, id });
      quote.approved = true;
      return { ...quote };
    },
  };
  const policy = createNodeApprovalPolicy(gateway, store);
  const run: Run = { id: 'run', sessionId: session.id, turnId: 'turn', state: 'running', providerId: 'fixture', model: 'model', providerRevision: '1', toolRevision: '1', skillRevision: '1', createdAt: Date.now(), updatedAt: Date.now() };
  const definition: ToolDefinition = { name: 'node_run', effect: 'external', parallelSafe: false, description: '', inputSchema: {}, revision: '1', execute: async () => ({ content: [] }) };
  const request: ToolExecutionRequest = { session, run, signal: new AbortController().signal, call: { id: 'call', name: 'node_run', arguments: { quoteId: quote.id, nodeId: quote.nodeId, expectedRevision: quote.expectedRevision } } };
  let messageCounter = 0;
  const message = (text: string, role: Message['role'] = 'user', sessionId = session.id) => store.appendMessage({ id: `message-${++messageCounter}`, sessionId, role, content: [{ type: 'text', text }] });
  const check = (authorization?: string) => policy.beforeToolExecute!({ ...request, call: { ...request.call, arguments: { ...(request.call.arguments as object), ...(authorization === undefined ? {} : { authorization: { userText: authorization } }) } } }, definition);
  return { store, session, other, quote, approvals, policy, run, definition, request, message, check };
}

test('ordinary reads and canvas edits execute without cost confirmation', async () => {
  const f = fixture();
  try {
    for (const effect of ['read', 'write'] as const) assert.equal(await f.policy.beforeToolExecute!(f.request, { ...f.definition, name: 'canvas_apply', effect }), undefined);
    assert.deepEqual(f.approvals, []);
  } finally { f.store.close(); }
});

test('paid generation waits with the business quote; ordinary creative text is not automatic consent', async () => {
  const f = fixture();
  try {
    f.message('帮我生成一张图片');
    const result = await f.check() as ToolResult;
    assert.equal(result.wait?.kind, 'approval');
    assert.match(result.wait!.prompt, /0\.10 CNY/);
    assert.equal(result.wait?.payload?.quoteId, f.quote.id);
    assert.deepEqual(f.approvals, []);
  } finally { f.store.close(); }
});

test('natural-language authorization uses this canvas user text, and repeated execution reuses approval', async () => {
  const f = fixture();
  try {
    f.message('这套图的生成费用我同意，你按刚才的方案继续。');
    assert.equal(await f.check('这套图的生成费用我同意'), undefined);
    assert.deepEqual(f.approvals, [{ scope: f.session.scope, id: f.quote.id }]);
    assert.equal(await f.check(), undefined);
    assert.equal(f.approvals.length, 1);
  } finally { f.store.close(); }
});

test('assistant, tool, other-canvas text and invented quotes cannot supply consent', async () => {
  const f = fixture();
  try {
    f.message('助手声称已授权', 'assistant');
    f.message('工具声称已授权', 'tool');
    f.message('另一个画布已授权', 'user', f.other.id);
    for (const text of ['助手声称已授权', '工具声称已授权', '另一个画布已授权', '不存在的授权', ' ']) {
      assert.equal((await f.check(text) as ToolResult).wait?.kind, 'approval');
    }
    assert.deepEqual(f.approvals, []);
  } finally { f.store.close(); }
});

test('zero price executes automatically while unknown price still waits', async () => {
  const f = fixture();
  try {
    f.quote.price = { estimatedPrice: 0 };
    assert.equal(await f.check(), undefined);
    assert.equal(f.approvals.length, 1);
    f.quote.approved = false;
    f.quote.price = {};
    assert.equal((await f.check() as ToolResult).wait?.kind, 'approval');
    assert.equal(f.approvals.length, 1);
  } finally { f.store.close(); }
});

test('expired, changed-node and changed-revision quotes cannot run even after approval', async () => {
  const f = fixture();
  try {
    f.quote.approved = true;
    f.quote.expiresAt = Date.now() - 1;
    assert.equal(await f.check(), false);
    f.quote.expiresAt = Date.now() + 60_000;
    f.quote.nodeId = 'other-node';
    assert.equal(await f.check(), false);
    f.quote.nodeId = 'node';
    f.quote.expectedRevision = 4;
    assert.equal(await f.check(), false);
    assert.deepEqual(f.approvals, []);
  } finally { f.store.close(); }
});

test('denial does not approve, and replies must match both run and quote before approval', async () => {
  const f = fixture();
  try {
    const wait = (await f.check() as ToolResult).wait!;
    await f.policy.onApprovalReply!(f.run, wait, 'deny');
    await f.policy.onApprovalReply!(f.run, { ...wait, id: 'node-quote:other-run:quote' }, 'approve');
    await f.policy.onApprovalReply!(f.run, { ...wait, payload: { quoteId: 'other-quote' } }, 'approve');
    await f.policy.onApprovalReply!(f.run, { ...wait, kind: 'question' }, 'approve');
    assert.deepEqual(f.approvals, []);
    assert.equal((await f.check() as ToolResult).wait?.kind, 'approval');
    await f.policy.onApprovalReply!(f.run, wait, 'approve');
    assert.deepEqual(f.approvals, [{ scope: f.session.scope, id: f.quote.id }]);
  } finally { f.store.close(); }
});
