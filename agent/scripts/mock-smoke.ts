import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_MOCK_CANVAS_ID,
  DEFAULT_MOCK_OWNER_ID,
  DEFAULT_MOCK_SKILL_ROOT,
  MOCK_PROVIDER_ID,
  MOCK_SKILL_NAME,
  startMockEnvironment,
  parseMockArgs,
  type MockEnvironment,
} from './mock-agent.js';

interface JsonResponse {
  response: Response;
  body: Record<string, unknown>;
}

interface SseEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
}

const TERMINAL_EVENTS = new Set(['run.completed', 'run.partial', 'run.failed', 'run.stopped']);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function jsonRequest(baseUrl: string, path: string, init?: RequestInit): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  }
  const body = record(parsed);
  assert.equal(response.ok, true, `${init?.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return { response, body };
}

function parseSseBlock(block: string): SseEvent | undefined {
  let id = 0;
  let type = '';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'id') id = Number(value);
    else if (field === 'event') type = value;
    else if (field === 'data') data.push(value);
  }
  if (!type || !data.length || !Number.isSafeInteger(id)) return undefined;
  try {
    const parsed = JSON.parse(data.join('\n')) as unknown;
    const envelope = record(parsed);
    return { id, type, data: envelope };
  } catch {
    return undefined;
  }
}

async function collectEvents(baseUrl: string, sessionId: string, predicate: (event: SseEvent) => boolean): Promise<SseEvent[]> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/events?after=0`, { signal: controller.signal, headers: { Accept: 'text/event-stream' } });
  assert.equal(response.ok, true, `SSE returned ${response.status}`);
  assert.ok(response.body, 'SSE response must contain a body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  const events: SseEvent[] = [];
  try {
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!event) continue;
        events.push(event);
        if (predicate(event)) {
          controller.abort();
          done = true;
          break;
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    controller.abort();
    reader.releaseLock();
  }
  return events;
}

async function waitForCondition(condition: () => boolean, label: string, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 20));
  }
}

async function runAndCollect(environment: MockEnvironment, sessionId: string, text: string, requestId: string, skillNames?: string[]): Promise<{ run: Record<string, unknown>; events: SseEvent[] }> {
  const sent = await jsonRequest(`${environment.baseUrl!}`, `/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, requestId, selection: { nodeIds: [], assets: [] }, ...(skillNames ? { skillNames } : {}) }),
  });
  const run = record(sent.body.run);
  assert.ok(typeof run.id === 'string', 'message response must contain a run id');
  const events = await collectEvents(environment.baseUrl!, sessionId, (event) => {
    const data = record(event.data.data);
    return event.data.runId === run.id && (TERMINAL_EVENTS.has(event.type) || ['completed', 'partial', 'failed', 'stopped'].includes(String(data.state)));
  });
  assertAcceptedRequestId(events, String(run.id), requestId);
  return { run, events };
}

async function runAndWaitForInput(environment: MockEnvironment, sessionId: string, text: string, requestId: string): Promise<{ run: Record<string, unknown>; wait: Record<string, unknown>; events: SseEvent[] }> {
  const sent = await jsonRequest(`${environment.baseUrl!}`, `/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, requestId, selection: { nodeIds: [], assets: [] } }),
  });
  const run = record(sent.body.run);
  assert.ok(typeof run.id === 'string', 'message response must contain a run id');
  let wait: Record<string, unknown> | undefined;
  const events = await collectEvents(environment.baseUrl!, sessionId, (event) => {
    const data = record(event.data.data);
    const candidate = record(data.wait);
    if (event.data.runId === run.id && event.type === 'input.required') wait = candidate;
    return event.data.runId === run.id && event.type === 'input.required';
  });
  assert.ok(wait && typeof wait.id === 'string', 'run must expose an input wait');
  assertAcceptedRequestId(events, String(run.id), requestId);
  return { run, wait, events };
}

async function reply(environment: MockEnvironment, runId: string, wait: Record<string, unknown>, text: string, decision?: 'approve' | 'deny'): Promise<void> {
  await jsonRequest(`${environment.baseUrl!}`, `/api/runs/${encodeURIComponent(runId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, waitId: wait.id, ...(decision ? { decision } : {}) }),
  });
}

function terminalState(events: readonly SseEvent[], runId: string): string | undefined {
  for (const event of events) {
    const data = record(event.data.data);
    if (event.data.runId !== runId) continue;
    if (TERMINAL_EVENTS.has(event.type)) return String(data.state ?? event.type.slice('run.'.length));
    if (['completed', 'partial', 'failed', 'stopped'].includes(String(data.state))) return String(data.state);
  }
  return undefined;
}

function assertAcceptedRequestId(events: readonly SseEvent[], runId: string, requestId: string): void {
  const accepted = events.find((event) => event.type === 'message.accepted' && event.data.runId === runId);
  assert.ok(accepted, `run ${runId} must emit message.accepted`);
  assert.equal(record(accepted.data.data).requestId, requestId, `message.accepted for ${runId} must carry the submitted requestId`);
}

export interface SmokeOptions {
  dataDir?: string;
  port?: number;
  keepData?: boolean;
  skillName?: string;
  skillRoots?: import('../src/skills/index.js').SkillRootSpec[];
}

export async function runMockSmoke(options: SmokeOptions = {}): Promise<void> {
  const skillRoots = options.skillRoots ?? (existsSync(DEFAULT_MOCK_SKILL_ROOT) ? [{ path: DEFAULT_MOCK_SKILL_ROOT, scope: 'builtin' as const }] : undefined);
  const environment = await startMockEnvironment({ ...options, skillRoots, port: options.port ?? 0 });
  try {
    const baseUrl = environment.baseUrl!;
    const health = await jsonRequest(baseUrl, '/health');
    assert.equal(health.body.ok, true);
    assert.equal(health.body.configured, true);

    const capabilities = await jsonRequest(baseUrl, '/api/capabilities');
    const providers = Array.isArray(capabilities.body.providers) ? capabilities.body.providers.map(record) : [];
    assert.equal(providers[0]?.id, MOCK_PROVIDER_ID);
    const canvasCapabilities = record(capabilities.body.canvas);
    assert.equal(canvasCapabilities.jobs, false, 'mock must not expose generation jobs');
    const capabilityTools = Array.isArray(capabilities.body.tools) ? capabilities.body.tools.map(record) : [];
    assert.equal(capabilityTools.some((tool) => tool.name === 'node_run' || tool.name === 'job_get'), false, 'mock must not expose generation tools');
    const skillName = options.skillName ?? MOCK_SKILL_NAME;
    const listedSkills = Array.isArray(capabilities.body.skills) ? capabilities.body.skills.map(record) : [];
    assert.equal(listedSkills.some((skill) => skill.name === skillName), true, `selected skill ${skillName} must be exposed`);

    const firstSessionResponse = await jsonRequest(baseUrl, '/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canvasId: DEFAULT_MOCK_CANVAS_ID }),
    });
    const firstSession = record(firstSessionResponse.body.session);
    assert.ok(typeof firstSession.id === 'string');
    assert.equal(firstSession.scope && record(firstSession.scope).ownerId, DEFAULT_MOCK_OWNER_ID);
    const secondSessionResponse = await jsonRequest(baseUrl, '/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canvasId: DEFAULT_MOCK_CANVAS_ID }),
    });
    const secondSession = record(secondSessionResponse.body.session);
    assert.equal(secondSession.id, firstSession.id, 'same owner + canvas must reuse one canonical session');
    const sessionId = String(firstSession.id);

    const canvasRun = await runAndCollect(environment, sessionId, '创建一个本地 Mock 提示词节点', 'mock-canvas-run-1', [skillName]);
    assert.equal(terminalState(canvasRun.events, String(canvasRun.run.id)), 'completed');
    const canvasToolNames = canvasRun.events.filter((event) => event.type === 'tool.call.received').map((event) => record(event.data.data).name);
    assert.deepEqual(canvasToolNames.slice(0, 2), ['canvas_read', 'canvas_apply']);
    assert.equal(canvasRun.events.some((event) => event.type === 'assistant.delta'), true, 'SSE must carry streamed assistant deltas');
    assert.equal(canvasRun.events.some((event) => event.type === 'skill.loaded' && record(event.data.data).name === skillName), true, 'selected skill must be loaded for the run');
    for (let index = 1; index < canvasRun.events.length; index += 1) assert.ok(canvasRun.events[index]!.id > canvasRun.events[index - 1]!.id, 'SSE event ids must increase');
    const skillBodyPrefix = environment.selectedSkillContent.trim().slice(0, 80);
    assert.ok(skillBodyPrefix, 'selected skill must have non-empty content');
    assert.equal(environment.provider.systemPrompts.some((prompt) => prompt.includes(`Skill ${skillName}`) && prompt.includes(skillBodyPrefix)), true, 'selected skill body must reach the provider system prompt');

    const canvasReadback = await jsonRequest(baseUrl, `/api/canvas?canvasId=${encodeURIComponent(DEFAULT_MOCK_CANVAS_ID)}`);
    assert.equal(canvasReadback.body.revision, 1);
    const nodes = Array.isArray(canvasReadback.body.nodes) ? canvasReadback.body.nodes.map(record) : [];
    assert.equal(nodes.length, 1, 'real local canvas readback must contain one node');
    assert.equal(nodes[0]?.kind, 'prompt');
    assert.equal(record(nodes[0]?.data).title, '本地 Mock 提示词');

    const secondCanvasRun = await runAndCollect(environment, sessionId, '再次创建一个本地 Mock 提示词节点', 'mock-canvas-run-2', [skillName]);
    assert.equal(terminalState(secondCanvasRun.events, String(secondCanvasRun.run.id)), 'completed');
    const secondCanvasToolNames = secondCanvasRun.events.filter((event) => event.type === 'tool.call.received').map((event) => record(event.data.data).name);
    assert.deepEqual(secondCanvasToolNames.slice(0, 2), ['canvas_read', 'canvas_apply']);
    assert.equal(secondCanvasRun.events.some((event) => event.type === 'tool.failed'), false, 'successful mock canvas round must not contain a failed tool');
    const secondCanvasReadback = await jsonRequest(baseUrl, `/api/canvas?canvasId=${encodeURIComponent(DEFAULT_MOCK_CANVAS_ID)}`);
    assert.equal(secondCanvasReadback.body.revision, 2, 'second mock canvas round must advance the revision');
    const secondNodes = Array.isArray(secondCanvasReadback.body.nodes) ? secondCanvasReadback.body.nodes.map(record) : [];
    assert.equal(secondNodes.length, 2, 'second mock canvas round must use a unique node id');
    assert.notEqual(secondNodes[0]?.id, secondNodes[1]?.id);

    const question = await runAndWaitForInput(environment, sessionId, 'mock:question', 'mock-question-run-1');
    assert.equal(question.wait.kind, 'question');
    await reply(environment, String(question.run.id), question.wait, '暖光');
    const questionDone = await collectEvents(baseUrl, sessionId, (event) => {
      const data = record(event.data.data);
      return event.data.runId === question.run.id && (TERMINAL_EVENTS.has(event.type) || data.state === 'completed');
    });
    assert.equal(terminalState(questionDone, String(question.run.id)), 'completed');

    const approval = await runAndWaitForInput(environment, sessionId, 'mock:approval', 'mock-approval-run-1');
    assert.equal(approval.wait.kind, 'approval');
    await reply(environment, String(approval.run.id), approval.wait, '暂不', 'deny');
    const approvalDone = await collectEvents(baseUrl, sessionId, (event) => {
      const data = record(event.data.data);
      return event.data.runId === approval.run.id && (TERMINAL_EVENTS.has(event.type) || data.state === 'completed');
    });
    assert.equal(terminalState(approvalDone, String(approval.run.id)), 'completed');

    const failed = await runAndCollect(environment, sessionId, 'mock:failed', 'mock-failed-run-1');
    assert.equal(terminalState(failed.events, String(failed.run.id)), 'failed');

    const stoppedSent = await jsonRequest(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'mock:stop', requestId: 'mock-stop-run-1', selection: { nodeIds: [], assets: [] } }),
    });
    const stoppedRun = record(stoppedSent.body.run);
    assert.ok(typeof stoppedRun.id === 'string');
    await waitForCondition(() => environment.provider.stopStreams > 0, 'mock stop stream');
    await jsonRequest(baseUrl, `/api/runs/${encodeURIComponent(String(stoppedRun.id))}/stop`, { method: 'POST' });
    const stoppedEvents = await collectEvents(baseUrl, sessionId, (event) => {
      const data = record(event.data.data);
      return event.data.runId === stoppedRun.id && (event.type === 'run.stopped' || data.state === 'stopped');
    });
    assertAcceptedRequestId(stoppedEvents, String(stoppedRun.id), 'mock-stop-run-1');
    assert.equal(terminalState(stoppedEvents, String(stoppedRun.id)), 'stopped');
    assert.equal(stoppedEvents.some((event) => event.type === 'assistant.delta'), true);

    process.stdout.write(`mock smoke passed: ${baseUrl}, data=${environment.dataDir}\n`);
    process.stdout.write('verified health/configured, canonical session, selected skill system injection, SSE streaming, canvas_read → canvas_apply readback, question, approval, failure, stop, and jobs=false.\n');
  } finally {
    await environment.close();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runMockSmoke(parseMockArgs(process.argv.slice(2), { port: 0 }))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
