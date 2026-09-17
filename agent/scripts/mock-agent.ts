import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ContextManager } from '../src/context/index.js';
import { UnavailableAssetGateway } from '../src/adapters/assets.js';
import { LocalCanvasGateway } from '../src/adapters/canvas.js';
import { createCanvasTools } from '../src/adapters/tools.js';
import { AgentRuntime } from '../src/core/runtime.js';
import { SqliteStore } from '../src/core/store.js';
import { ProviderRegistry } from '../src/providers/index.js';
import { SkillRegistry, type SkillRootSpec } from '../src/skills/index.js';
import type { Message, Provider, ProviderEvent, ProviderRequest, Scope } from '../src/contracts/index.js';
import { createAgentServer, listenAgentServer } from '../src/server/server.js';

export const MOCK_PROVIDER_ID = 'mock';
export const MOCK_PROVIDER_REVISION = 'mock-v1';
export const MOCK_MODEL = 'dangoo-local-mock';
export const DEFAULT_MOCK_OWNER_ID = 'mock-user';
export const DEFAULT_MOCK_CANVAS_ID = 'demo-canvas';
export const DEFAULT_MOCK_PORT = 4317;
export const MOCK_SKILL_NAME = 'fashion-ecommerce-image-set';
export const DEFAULT_MOCK_SKILL_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../skills');

const MOCK_SKILL_CONTENT = [
  '# Dangoo local mock skill',
  '',
  'This is an explicit local-only skill fixture used to prove selected skill injection.',
  'MOCK_SKILL_INJECTION_MARKER',
].join('\n');

export interface MockProviderOptions {
  skillName?: string;
}

export interface MockProvider extends Provider {
  readonly systemPrompts: string[];
  readonly stopStreams: number;
}

function textOf(message: Message): string {
  return message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map((part) => part.text).join('\n');
}

function latestUser(messages: readonly Message[]): { index: number; text: string } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return { index, text: textOf(message) };
  }
  return undefined;
}

function previousUserIndex(messages: readonly Message[], latestIndex: number): number {
  for (let index = latestIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index;
  }
  return -1;
}

function jsonFromTool(message: Message | undefined, label: string): Record<string, unknown> {
  const raw = message ? textOf(message) : '';
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Tool failures are returned as a short text result by the runtime. Do not
    // turn that text into a fabricated success response.
  }
  throw new Error(`deterministic mock ${label} did not receive a successful JSON tool result: ${raw || '[empty]'}`);
}

function hasToken(text: string, token: RegExp): boolean {
  return token.test(text.trim());
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('mock stream aborted');
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolveWait) => signal.addEventListener('abort', () => resolveWait(), { once: true }));
}

/**
 * Deterministic provider used only by scripts/dev:mock.ts and its smoke test.
 * It never makes a network request and never exposes a generation/job tool.
 */
export class DeterministicMockProvider implements MockProvider {
  readonly id = MOCK_PROVIDER_ID;
  readonly revision = MOCK_PROVIDER_REVISION;
  readonly model = MOCK_MODEL;
  readonly systemPrompts: string[] = [];
  private _stopStreams = 0;
  readonly skillName: string;

  constructor(options: MockProviderOptions = {}) {
    this.skillName = options.skillName ?? MOCK_SKILL_NAME;
  }

  get stopStreams(): number {
    return this._stopStreams;
  }

  capabilities(): ReturnType<Provider['capabilities']> {
    return { contextWindow: 32_000, maxOutputTokens: 1_024, tools: true, vision: false, parallelTools: false };
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
    assertNotAborted(request.signal);
    const system = request.messages.find((message) => message.role === 'system');
    this.systemPrompts.push(system ? textOf(system) : '');

    const current = latestUser(request.messages);
    const currentText = current?.text ?? '';
    const lower = currentText.toLocaleLowerCase();
    if (hasToken(lower, /(?:mock:)?(?:fail|failed|失败)/i)) {
      throw new Error('deterministic mock failure');
    }

    if (hasToken(lower, /(?:mock:)?(?:stop|停止)/i)) {
      this._stopStreams += 1;
      yield { type: 'text.delta', text: '本地 Mock 流已开始，等待停止。' };
      await waitForAbort(request.signal);
      return;
    }

    const beforeCurrent = current ? request.messages.slice(previousUserIndex(request.messages, current.index) + 1, current.index) : [];
    const waitingCall = beforeCurrent.find((message) => message.role === 'tool' && (message.callId === 'mock-question' || message.callId === 'mock-approval'));
    if (waitingCall) {
      yield { type: 'text.delta', text: waitingCall.callId === 'mock-approval' ? '已记录本地 Mock 的确认结果。' : '已收到本地 Mock 的补充信息。' };
      yield { type: 'done', reason: 'stop' };
      return;
    }

    if (hasToken(lower, /(?:mock:)?(?:question|选择|提问)/i)) {
      yield { type: 'tool.call', call: { id: 'mock-question', name: 'ask_user', arguments: { kind: 'question', prompt: '请选择本地 Mock 的构图方向。', options: ['暖光', '冷光'] } } };
      yield { type: 'done', reason: 'tool_calls' };
      return;
    }

    if (hasToken(lower, /(?:mock:)?(?:approval|审批|确认)/i)) {
      yield { type: 'tool.call', call: { id: 'mock-approval', name: 'ask_user', arguments: { kind: 'approval', prompt: '允许继续本地 Mock 操作吗？' } } };
      yield { type: 'done', reason: 'tool_calls' };
      return;
    }

    const toolMessages = current ? request.messages.slice(current.index + 1).filter((message) => message.role === 'tool') : [];
    // A later run receives the previous tool transcript as context. Always
    // inspect the newest result for a call id: using the first matching
    // message would replay an old revision and could hide a failed apply
    // behind an earlier successful result.
    const canvasRead = [...toolMessages].reverse().find((message) => message.callId === 'mock-canvas-read');
    const canvasApply = [...toolMessages].reverse().find((message) => message.callId === 'mock-canvas-apply');
    if (!canvasRead) {
      yield { type: 'tool.call', call: { id: 'mock-canvas-read', name: 'canvas_read', arguments: {} } };
      yield { type: 'done', reason: 'tool_calls' };
      return;
    }

    if (!canvasApply) {
      const snapshot = jsonFromTool(canvasRead, 'canvas_read');
      if (typeof snapshot.revision !== 'number' || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error('deterministic mock canvas_read returned an invalid revision');
      const revision = snapshot.revision;
      const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
      const usedIds = new Set(nodes.map((node) => node && typeof node === 'object' && !Array.isArray(node) && typeof (node as Record<string, unknown>).id === 'string' ? String((node as Record<string, unknown>).id) : undefined).filter((id): id is string => Boolean(id)));
      let nodeId = 'mock-prompt-node';
      let suffix = 2;
      while (usedIds.has(nodeId)) nodeId = `mock-prompt-node-${suffix++}`;
      yield {
        type: 'tool.call',
        call: {
          id: 'mock-canvas-apply',
          name: 'canvas_apply',
          arguments: {
            expectedRevision: revision,
            operations: [{
              type: 'create',
              node: {
                id: nodeId,
                kind: 'prompt',
                x: 80,
                y: 120,
                data: { title: '本地 Mock 提示词', prompt: '本地确定性 Agent 流程节点，不触发任何实际生成。' },
              },
            }],
          },
        },
      };
      yield { type: 'done', reason: 'tool_calls' };
      return;
    }

    const applied = jsonFromTool(canvasApply, 'canvas_apply');
    if (typeof applied.revision !== 'number' || !Number.isSafeInteger(applied.revision) || applied.revision < 1) throw new Error('deterministic mock canvas_apply returned an invalid revision');
    const revision = applied.revision;
    yield { type: 'text.delta', text: '已完成本地 Mock 画布流程：' };
    yield { type: 'text.delta', text: `读取并写入了一个提示词节点（revision ${revision}），未调用真实生成。` };
    yield { type: 'done', reason: 'stop' };
  }
}

export interface MockEnvironmentOptions {
  dataDir?: string;
  host?: string;
  port?: number;
  ownerId?: string;
  canvasId?: string;
  skillName?: string;
  skillRoots?: SkillRootSpec[];
  keepData?: boolean;
}

export interface MockEnvironment {
  readonly runtime: AgentRuntime;
  readonly store: SqliteStore;
  readonly canvas: LocalCanvasGateway;
  readonly provider: DeterministicMockProvider;
  readonly server: ReturnType<typeof createAgentServer>;
  readonly scope: Scope;
  readonly dataDir: string;
  readonly temporaryDataDir: boolean;
  readonly selectedSkillContent: string;
  readonly baseUrl?: string;
  close(): Promise<void>;
}

function mockSkillPackage(name: string) {
  return {
    name,
    description: 'Local-only fixture used to verify selected skill injection.',
    revision: 'mock-fixture-v1',
    scope: 'builtin' as const,
    implicit: true,
    content: MOCK_SKILL_CONTENT,
    path: `mock://${name}`,
  };
}

async function makeDataDir(explicit?: string): Promise<{ path: string; temporary: boolean }> {
  if (explicit) {
    const path = resolve(explicit);
    await mkdir(path, { recursive: true });
    return { path, temporary: false };
  }
  return { path: await mkdtemp(join(tmpdir(), 'dangoo-agent-mock-')), temporary: true };
}

function assertLoopbackHost(host: string): void {
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`Local mock must bind to a loopback host, received ${host}`);
  }
}

export async function createMockEnvironment(options: MockEnvironmentOptions = {}): Promise<MockEnvironment> {
  const host = options.host ?? '127.0.0.1';
  assertLoopbackHost(host);
  const data = await makeDataDir(options.dataDir);
  const ownerId = options.ownerId ?? DEFAULT_MOCK_OWNER_ID;
  const canvasId = options.canvasId ?? DEFAULT_MOCK_CANVAS_ID;
  const scope: Scope = { ownerId, canvasId };
  const canvas = new LocalCanvasGateway(join(data.path, 'canvas-workbench.sqlite'));
  canvas.seed(scope, { canvasId, revision: 0, nodes: [], edges: [] });
  const store = new SqliteStore(join(data.path, 'agent.sqlite'));
  const provider = new DeterministicMockProvider({ skillName: options.skillName });
  const providers = new ProviderRegistry([provider]);
  const skills = new SkillRegistry({ roots: options.skillRoots ?? [] });
  if (options.skillRoots?.length) await skills.discover();
  const skillName = options.skillName ?? MOCK_SKILL_NAME;
  if (!skills.snapshot().skills.some((skill) => skill.name === skillName)) {
    if (options.skillRoots?.length) throw new Error(`Selected mock skill ${skillName} was not found under the explicit skill root`);
    skills.register(mockSkillPackage(skillName));
  }
  const selectedSkillContent = await skills.read(skillName);
  const tools = createCanvasTools(canvas, new UnavailableAssetGateway());
  const runtime = new AgentRuntime({
    store,
    providers,
    tools,
    skills,
    context: new ContextManager(),
    canvas,
    assets: new UnavailableAssetGateway(),
    model: MOCK_MODEL,
    systemPrompt: [
      '你正在运行 Dangoo Agent 的本地确定性 Mock；只能使用当前注册的工具验证运行时，不得调用真实 Provider、网络、付费服务或媒体生成。',
      '修改画布前先读取最新版本，按工具返回的 revision 原子写入。',
    ].join('\n'),
  });
  await runtime.ready();
  const server = createAgentServer(runtime, {
    host,
    port: options.port ?? DEFAULT_MOCK_PORT,
    allowUnauthenticatedLocal: true,
    defaultPrincipal: { ownerId, canvasIds: [canvasId] },
    configured: true,
    canvas,
  });
  let closed = false;
  return {
    runtime,
    store,
    canvas,
    provider,
    server,
    scope,
    dataDir: data.path,
    temporaryDataDir: data.temporary,
    selectedSkillContent,
    close: async () => {
      if (closed) return;
      closed = true;
      if (server.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      store.close();
      canvas.close();
      if (data.temporary && !options.keepData) await rm(data.path, { recursive: true, force: true });
    },
  };
}

export async function startMockEnvironment(options: MockEnvironmentOptions = {}): Promise<MockEnvironment> {
  const environment = await createMockEnvironment(options);
  try {
    await listenAgentServer(environment.server, { host: options.host ?? '127.0.0.1', port: options.port ?? DEFAULT_MOCK_PORT });
  } catch (error) {
    await environment.close();
    throw error;
  }
  const address = environment.server.address();
  if (!address || typeof address === 'string') {
    await environment.close();
    throw new Error('Mock Agent server did not expose a TCP address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return Object.assign(environment, { baseUrl });
}

interface CliOptions extends Omit<MockEnvironmentOptions, 'port'> {
  port: number;
  help?: boolean;
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseMockArgs(args: readonly string[], defaults: { port: number } = { port: DEFAULT_MOCK_PORT }): CliOptions {
  const options: CliOptions = { port: defaults.port };
  const roots: SkillRootSpec[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--data-dir') { options.dataDir = valueAfter([...args], index, arg); index += 1; continue; }
    if (arg === '--port') { options.port = Number(valueAfter([...args], index, arg)); index += 1; continue; }
    if (arg === '--owner-id') { options.ownerId = valueAfter([...args], index, arg); index += 1; continue; }
    if (arg === '--canvas-id') { options.canvasId = valueAfter([...args], index, arg); index += 1; continue; }
    if (arg === '--skill') { options.skillName = valueAfter([...args], index, arg); index += 1; continue; }
    if (arg === '--skill-root') { roots.push({ path: resolve(valueAfter([...args], index, arg)), scope: 'workspace' }); index += 1; continue; }
    if (arg === '--keep-data') { options.keepData = true; continue; }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (roots.length) options.skillRoots = roots;
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) throw new Error('--port must be an integer from 0 to 65535');
  return options;
}

function cliDefaults(): CliOptions {
  const port = process.env.DANGOO_MOCK_PORT ? Number(process.env.DANGOO_MOCK_PORT) : DEFAULT_MOCK_PORT;
  const configuredRoots = (process.env.DANGOO_MOCK_SKILL_ROOTS ?? '').split(',').map((value) => value.trim()).filter(Boolean).map((path) => ({ path: resolve(path), scope: 'workspace' as const }));
  const roots = configuredRoots.length ? configuredRoots : existsSync(DEFAULT_MOCK_SKILL_ROOT) ? [{ path: DEFAULT_MOCK_SKILL_ROOT, scope: 'builtin' as const }] : [];
  return {
    port,
    dataDir: process.env.DANGOO_MOCK_DATA_DIR?.trim() || undefined,
    ownerId: process.env.DANGOO_MOCK_OWNER_ID?.trim() || undefined,
    canvasId: process.env.DANGOO_MOCK_CANVAS_ID?.trim() || undefined,
    skillName: process.env.DANGOO_MOCK_SKILL_NAME?.trim() || undefined,
    skillRoots: roots.length ? roots : undefined,
  };
}

export const MOCK_HELP = [
  'Dangoo Agent local mock (explicit deterministic provider; loopback only)',
  '',
  '  npm run dev:mock -- [--port 4317] [--data-dir PATH] [--skill-root PATH]',
  '',
  'Defaults: API 4317 (used by the existing dev:ui proxy), temporary data directory, owner mock-user, canvas demo-canvas.',
  'The existing UI can run separately with: npm run dev:ui. If --port changes, point the UI proxy at that API port.',
  'No .env file, Provider key, network request, billing operation, or media generation is used.',
].join('\n');

export async function runMockServer(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const defaults = cliDefaults();
  const parsed = parseMockArgs(args, { port: defaults.port });
  const options: MockEnvironmentOptions = {
    ...defaults,
    ...parsed,
    skillRoots: parsed.skillRoots ?? defaults.skillRoots,
  };
  if (parsed.help) { process.stdout.write(`${MOCK_HELP}\n`); return; }
  const environment = await startMockEnvironment(options);
  process.stdout.write(`Dangoo Agent local mock listening on ${environment.baseUrl}\n`);
  process.stdout.write(`data=${environment.dataDir}${environment.temporaryDataDir ? ' (temporary)' : ''}\n`);
  process.stdout.write(`owner=${environment.scope.ownerId} canvas=${environment.scope.canvasId} provider=${MOCK_PROVIDER_ID}@${MOCK_PROVIDER_REVISION}\n`);
  process.stdout.write('Run npm run dev:ui separately to open the existing Agent UI.\n');
  await new Promise<void>((resolveExit) => {
    const shutdown = () => { void environment.close().finally(resolveExit); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runMockServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
