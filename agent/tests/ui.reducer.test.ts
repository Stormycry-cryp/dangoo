import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAgentEvent, createAgentStore, reduceAgentStore, sessionsFromUnknown } from '../src/ui/store';
import type { AgentClientLike, AgentEventView, AgentStoreState } from '../src/ui/types';
import { selectionWithAttachments } from '../src/ui/types';

const baseState: AgentStoreState = {
  messages: [], events: [], tools: [], jobs: [], runs: {}, registeredAssets: [], draft: '', attachments: [], connection: 'idle', lastSequence: 0, unreadCount: 0, nearBottom: true, compacting: false,
};

test('leaving a canvas during host save cannot send a deferred message', async () => {
  let finishSave!: () => void;
  const saved = new Promise<void>(resolve => { finishSave = resolve; });
  let creates = 0;
  let sends = 0;
  const client = { createSession: async () => { creates++; }, sendMessage: async () => { sends++; } } as unknown as AgentClientLike;
  const store = createAgentStore({ client, canvasId: 'old-canvas', hostBridge: { contractVersion: '1.0.0', canvasId: 'old-canvas', beforeSend: () => saved, getSelection: () => ({ nodeIds: [], assets: [] }), locateNode() {}, previewAsset() {} } });
  const pending = store.sendMessage('generate');
  store.destroy();
  finishSave();
  await pending;
  assert.equal(creates, 0);
  assert.equal(sends, 0);
});

test('retry reuses the selected skill names from the failed request', async () => {
  const session = { id: 'skill-session', scope: { canvasId: 'skill-canvas' }, createdAt: 1 };
  const skillNames = ['fashion-ecommerce-image-set'];
  const sentSkills: string[][] = [];
  let attempts = 0;
  const client: AgentClientLike = {
    health: async () => ({}),
    capabilities: async () => ({ skills: [] }),
    createSession: async () => ({ session }),
    getSession: async () => ({ session, messages: [], events: [], eventSequence: 0 }),
    sendMessage: async (_sessionId, input) => {
      sentSkills.push([...(input.skillNames ?? [])]);
      attempts += 1;
      if (attempts === 1) throw new Error('第一次发送失败');
      return {};
    },
    streamEvents: async () => (async function* () {})(),
    stopRun: async () => ({}),
    replyRun: async () => ({}),
    compact: async () => ({}),
    listSessions: async () => ({ sessions: [] }),
  };
  const store = createAgentStore({ client, canvasId: 'skill-canvas', hostBridge: { contractVersion: '1.0.0', canvasId: 'skill-canvas', getSelection: () => ({ nodeIds: [], assets: [] }), locateNode() {}, previewAsset() {} } });
  await store.sendMessage('生成服装详情页', skillNames);
  await store.retryLastMessage();
  assert.deepEqual(sentSkills, [skillNames, skillNames]);
  store.destroy();
});

test('canonical session initialization shares one request and restores durable history', async () => {
  let creates = 0;
  let reads = 0;
  const session = { id: 'canonical', scope: { canvasId: 'current' }, createdAt: 1 };
  const client = {
    createSession: async () => { creates += 1; await Promise.resolve(); return { session }; },
    getSession: async () => { reads += 1; return { session, messages: [{ id: 'old', role: 'user', content: [{ type: 'text', text: 'old history' }], createdAt: 1 }] }; },
    streamEvents: async () => (async function* () {})(),
  } as unknown as AgentClientLike;
  const store = createAgentStore({ client, canvasId: 'current', hostBridge: { contractVersion: '1.0.0', canvasId: 'current', getSelection: () => ({ nodeIds: [], assets: [] }), locateNode() {}, previewAsset() {} } });
  await Promise.all([store.ensureSession(), store.ensureSession()]);
  await store.ensureSession();
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal(store.getState().session?.id, 'canonical');
  assert.equal(store.getState().messages[0].text, 'old history');
  store.destroy();
});

function event(sequence: number, type: string, data: Record<string, unknown>): AgentEventView {
  return { id: `${type}:${sequence}`, sequence, type, data, createdAt: sequence };
}

test('stopped runs preserve text and clear the streaming cursor without an error', () => {
  const state = applyAgentEvent({ ...baseState, activeRunId: 'run-1', messages: [{ id: 'a', role: 'assistant', text: '已有内容', attachments: [], createdAt: 1, runId: 'run-1', streaming: true }] }, event(1, 'run.stopped', { id: 'run-1', state: 'stopped', error: '已停止后续 Agent 操作' }));
  assert.equal(state.messages[0].text, '已有内容');
  assert.equal(state.messages[0].streaming, false);
  assert.equal(state.error, undefined);
  assert.equal(state.activeRunId, undefined);
});

test('reducer merges streamed assistant text and de-duplicates replayed sequences', () => {
  let state = applyAgentEvent(baseState, event(1, 'assistant.delta', { messageId: 'assistant-1', text: '暖' }));
  state = applyAgentEvent(state, event(2, 'assistant.delta', { messageId: 'assistant-1', text: '色' }));
  state = applyAgentEvent(state, event(2, 'assistant.delta', { messageId: 'assistant-1', text: '重复' }));
  assert.equal(state.messages[0]?.text, '暖色');
  assert.equal(state.lastSequence, 2);
  assert.equal(state.events.length, 2);
});

test('accepted user events reconcile only their pending run, preserving repeated text', () => {
  let state = reduceAgentStore(baseState, {
    type: 'message.added',
    message: { id: 'optimistic-1', role: 'user', text: '继续调整', attachments: [], createdAt: 1, runId: 'run-1', requestId: 'request-1', pending: true },
  });
  state = reduceAgentStore(state, {
    type: 'message.added',
    message: { id: 'optimistic-2', role: 'user', text: '继续调整', attachments: [], createdAt: 2, runId: 'run-2', requestId: 'request-2', pending: true },
  });
  state = applyAgentEvent(state, event(1, 'message.accepted', {
    runId: 'run-2',
    message: { id: 'server-2', role: 'user', content: [{ type: 'text', text: '继续调整' }], createdAt: 2 },
  }));
  assert.deepEqual(state.messages.map((message) => message.id), ['optimistic-1', 'server-2']);
  assert.equal(state.messages[1]?.pending, false);
});

test('accepted SSE event reconciles the optimistic row when it beats POST response', () => {
  let state = reduceAgentStore(baseState, {
    type: 'message.added',
    message: { id: 'optimistic-stop', role: 'user', text: 'mock:stop', attachments: [], createdAt: 1, requestId: 'request-stop', pending: true },
  });
  state = applyAgentEvent(state, event(1, 'message.accepted', {
    runId: 'run-stop',
    requestId: 'request-stop',
    message: { id: 'server-stop', role: 'user', content: [{ type: 'text', text: 'mock:stop' }], createdAt: 2 },
  }));
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0]?.id, 'server-stop');
  assert.equal(state.messages[0]?.runId, 'run-stop');
  assert.equal(state.messages[0]?.pending, false);

  state = reduceAgentStore(state, { type: 'message.linked', id: 'server-stop', runId: 'run-stop', requestId: 'request-stop' });
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0]?.pending, false);
});

test('accepted events do not collapse a real repeated user message by text', () => {
  let state = reduceAgentStore(baseState, {
    type: 'message.added',
    message: { id: 'server-first', role: 'user', text: 'mock:stop', attachments: [], createdAt: 1, runId: 'run-first', pending: false },
  });
  state = reduceAgentStore(state, {
    type: 'message.added',
    message: { id: 'optimistic-second', role: 'user', text: 'mock:stop', attachments: [], createdAt: 2, requestId: 'request-second', pending: true },
  });
  state = applyAgentEvent(state, event(1, 'message.accepted', {
    runId: 'run-second',
    requestId: 'request-second',
    message: { id: 'server-second', role: 'user', content: [{ type: 'text', text: 'mock:stop' }], createdAt: 3 },
  }));
  assert.deepEqual(state.messages.map((message) => message.id), ['server-first', 'server-second']);
  assert.deepEqual(state.messages.map((message) => message.text), ['mock:stop', 'mock:stop']);
});

test('requestId keeps concurrent accepted events on the correct optimistic row', () => {
  let state = reduceAgentStore(baseState, {
    type: 'message.added',
    message: { id: 'optimistic-a', role: 'user', text: '同样的指令', attachments: [], createdAt: 1, runId: 'run-b', requestId: 'request-a', pending: true },
  });
  state = reduceAgentStore(state, {
    type: 'message.added',
    message: { id: 'optimistic-b', role: 'user', text: '同样的指令', attachments: [], createdAt: 2, requestId: 'request-b', pending: true },
  });
  state = applyAgentEvent(state, event(1, 'message.accepted', {
    runId: 'run-b',
    requestId: 'request-b',
    message: { id: 'server-b', role: 'user', content: [{ type: 'text', text: '同样的指令' }], createdAt: 3 },
  }));
  assert.deepEqual(state.messages.map((message) => message.id), ['optimistic-a', 'server-b']);
  assert.equal(state.messages[0]?.pending, true);
  assert.equal(state.messages[0]?.requestId, 'request-a');
  assert.equal(state.messages[1]?.requestId, 'request-b');
});

test('session list parsing filters by canvas and understands scope.canvasId', () => {
  const sessions = sessionsFromUnknown({ sessions: [
    { id: 's-other', scope: { canvasId: 'other' }, createdAt: 1, providerId: 'glm', model: 'm' },
    { id: 's-current', scope: { canvasId: 'current' }, createdAt: 2, providerId: 'glm', model: 'm' },
  ] }, 'current');
  assert.deepEqual(sessions.map((session) => session.id), ['s-current']);
});

test('session loading race keeps the newest selection', async () => {
  let resolveOld!: (value: unknown) => void;
  let resolveNew!: (value: unknown) => void;
  const oldPayload = new Promise<unknown>((resolve) => { resolveOld = resolve; });
  const newPayload = new Promise<unknown>((resolve) => { resolveNew = resolve; });
  const sessionPayload = (id: string) => ({ session: { id, scope: { canvasId: 'current' }, createdAt: 1, providerId: 'glm', model: 'glm-test' }, messages: [], runs: [], eventSequence: 0 });
  const client: AgentClientLike = {
    health: async () => ({}),
    capabilities: async () => ({}),
    createSession: async () => sessionPayload('created'),
    listSessions: async () => ({ sessions: [] }),
    getSession: (id) => id === 'old' ? oldPayload : newPayload,
    sendMessage: async () => ({}),
    streamEvents: async () => (async function* () {})(),
    stopRun: async () => ({}),
    replyRun: async () => ({}),
    compact: async () => ({}),
  };
  const store = createAgentStore({ client, hostBridge: { contractVersion: '1.0.0', canvasId: 'current', getSelection: () => ({ nodeIds: [], assets: [] }), locateNode: () => undefined, previewAsset: () => undefined }, canvasId: 'current' });
  const oldLoad = store.loadSession('old');
  const newLoad = store.loadSession('new');
  resolveOld(sessionPayload('old'));
  resolveNew(sessionPayload('new'));
  await Promise.all([oldLoad, newLoad]);
  assert.equal(store.getState().session?.id, 'new');
  store.destroy();
});

test('hidden reasoning events never enter the visible event log', () => {
  const state = applyAgentEvent(baseState, event(1, 'reasoning.delta', { text: 'internal thought' }));
  assert.equal(state.events.length, 0);
  assert.equal(state.messages.length, 0);
});

test('loading another canvas session cannot import its messages', async () => {
  const client = { getSession: async () => ({ session: { id: 'foreign', scope: { canvasId: 'other' } }, messages: [{ id: 'secret', role: 'user', content: [{ type: 'text', text: 'other canvas' }] }] }) } as unknown as AgentClientLike;
  const store = createAgentStore({ client, canvasId: 'current', hostBridge: { contractVersion: '1.0.0', canvasId: 'current', getSelection: () => ({ nodeIds: [], assets: [] }), locateNode() {}, previewAsset() {} } });
  await store.loadSession('foreign');
  assert.equal(store.getState().session, undefined);
  assert.equal(store.getState().messages.length, 0);
  assert.equal(store.getState().error, '会话不属于当前画布');
  store.destroy();
});

test('tool and job lifecycle states remain visible as compact cards', () => {
  let state = applyAgentEvent(baseState, event(1, 'tool.call.received', { toolCallId: 'tool-1', name: 'asset_view', label: '查看参考图', target: '产品原图' }));
  state = applyAgentEvent(state, event(2, 'tool.completed', { toolCallId: 'tool-1', name: 'asset_view', durationMs: 184 }));
  state = applyAgentEvent(state, event(3, 'job.updated', { jobId: 'job-1', name: '白底主图', status: 'running', index: 1, total: 3 }));
  assert.equal(state.tools[0]?.state, 'completed');
  assert.equal(state.tools[0]?.durationMs, 184);
  assert.equal(state.jobs[0]?.state, 'running');
  assert.equal(state.jobs[0]?.total, 3);
});

test('selection attachments are stable refs and de-duplicated by version and role', () => {
  const selection = selectionWithAttachments({ nodeIds: ['node-a', 'node-a'], assets: [{ assetId: 'asset-a', version: 2, role: 'reference' }] }, [
    { ref: { assetId: 'asset-a', version: 2, role: 'reference' }, name: 'a' },
    { ref: { assetId: 'asset-a', version: 3, role: 'reference' }, name: 'a v3' },
  ]);
  assert.deepEqual(selection.nodeIds, ['node-a']);
  assert.deepEqual(selection.assets, [
    { assetId: 'asset-a', version: 2, role: 'reference' },
    { assetId: 'asset-a', version: 3, role: 'reference' },
  ]);
});

test('run waiting input and completion update explicit controls', () => {
  let state = reduceAgentStore(baseState, { type: 'run.upserted', run: { id: 'run-1', sessionId: 'session-1', state: 'waiting_user', wait: { id: 'wait-1', kind: 'question', prompt: '选择一个方向', options: ['A', 'B'] } } });
  assert.equal(state.activeRunId, 'run-1');
  assert.equal(state.pendingInput?.kind, 'question');
  state = applyAgentEvent(state, event(1, 'run.completed', { runId: 'run-1', state: 'completed' }));
  assert.equal(state.activeRunId, undefined);
  assert.equal(state.pendingInput, undefined);
});

test('connection state exposes recovery and error status without changing canvas state', () => {
  let state = reduceAgentStore(baseState, { type: 'connection.changed', state: 'recovering', error: '正在恢复事件 12' });
  assert.equal(state.connection, 'recovering');
  assert.equal(state.error, '正在恢复事件 12');
  state = reduceAgentStore(state, { type: 'connection.changed', state: 'connected' });
  assert.equal(state.connection, 'connected');
  assert.equal(state.error, undefined);
});
