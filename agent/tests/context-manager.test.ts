import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextManager, InMemoryContextHistoryStore } from '../src/context/index.js';
import type { Message, ModelCapabilities, Provider, ProviderEvent, ProviderRequest } from '../src/contracts/index.js';

const capabilities: ModelCapabilities = {
  contextWindow: 4_000,
  maxOutputTokens: 500,
  tools: true,
  vision: true,
  parallelTools: true,
};

function message(id: string, role: Message['role'], text: string, extra: Partial<Message> = {}): Message {
  return { id, role, content: [{ type: 'text', text }], createdAt: Number(id.replace(/\D/g, '')) || 1, ...extra };
}

function summaryProvider(summary: string, fail = false): Provider {
  return {
    id: 'summary',
    revision: '1',
    capabilities: () => capabilities,
    stream: async function* (_request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      if (fail) throw new Error('summary failed');
      yield { type: 'text.delta', text: summary };
      yield { type: 'done', reason: 'stop' };
    },
  };
}

test('compact stores raw history and retains complete tool call/result pairs', async () => {
  const store = new InMemoryContextHistoryStore();
  const manager = new ContextManager({ historyStore: store, compactTailUnits: 2 });
  const state = {
    messages: [
      message('u1', 'user', 'make a white background'),
      message('a1', 'assistant', '', { content: [], toolCalls: [{ id: 'call-1', name: 'asset_view', arguments: { assetId: 'a' } }] }),
      message('t1', 'tool', 'viewed', { callId: 'call-1' }),
      message('u2', 'user', 'make it softer'),
    ],
    summaryVersion: 0,
    pinned: { subject: 'product', constraint: 'preserve logo' },
    viewedAssets: [{ assetId: 'asset-a', version: 1, role: 'reference' as const }],
  };
  const result = await manager.compact(state, summaryProvider('goal and constraints'), 'glm-5.3-flash', new AbortController().signal);
  assert.equal(result.changed, true);
  assert.equal(result.state.summaryVersion, 1);
  assert.match(result.state.summary ?? '', /asset-a/);
  const ids = result.state.messages.map((item) => item.id);
  assert.equal(ids.includes('a1'), ids.includes('t1'));
  const raw = store.latest();
  assert.deepEqual(raw?.messages.map((item) => item.id), ['u1', 'a1', 't1', 'u2']);
});

test('summary failure leaves the caller state and version unchanged', async () => {
  const manager = new ContextManager();
  const state = {
    messages: [message('u1', 'user', 'keep this')],
    summary: 'old',
    summaryVersion: 4,
    pinned: { keep: true },
    viewedAssets: [],
  };
  const result = await manager.compact(state, summaryProvider('', true), 'model', new AbortController().signal);
  assert.equal(result.changed, false);
  assert.equal(result.state.summary, 'old');
  assert.equal(result.state.summaryVersion, 4);
  assert.equal(state.messages[0].content[0].type, 'text');
});

test('image input fails explicitly when the active model lacks vision', () => {
  const manager = new ContextManager();
  const state = {
    messages: [message('u1', 'user', '')],
    summaryVersion: 0,
    pinned: {},
    viewedAssets: [],
  };
  state.messages[0].content = [{ type: 'image', url: 'https://asset/image.png' }];
  assert.throws(() => manager.prepare(state, '', { ...capabilities, vision: false }), /不支持图片输入/);
});

