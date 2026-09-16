import { createHash } from 'node:crypto';
import type { Session, Run, ToolCall, ToolContext, ToolDefinition, ToolResult } from '../contracts/index.js';
import { KeyedMutex } from './mutex.js';
import { ToolInputError, ToolRegistry } from './tool-registry.js';
import { DEFAULT_RUNTIME_LIMITS, stableJson, type RuntimeLimits, type StoredOperation } from './types.js';
import { SqliteStore } from './store.js';

export interface ToolExecutionRequest {
  call: ToolCall;
  session: Session;
  run: Run;
  selection?: import('../contracts/index.js').Selection;
  signal: AbortSignal;
}

export interface ToolExecutionResult {
  call: ToolCall;
  result: ToolResult;
  operationId: string;
  operation: StoredOperation;
}

export interface ToolSchedulerOptions {
  store: SqliteStore;
  registry: ToolRegistry;
  limits?: Partial<RuntimeLimits>;
  parallelism?: number;
  locks?: KeyedMutex;
  sideEffects?: Map<string, Promise<void>>;
  special?: (request: ToolExecutionRequest, operationId: string) => Promise<ToolResult | undefined>;
  /** Server-side authorization/quote gate. A model response cannot grant this. */
  beforeExecute?: (request: ToolExecutionRequest, definition?: ToolDefinition) => Promise<void | boolean | ToolResult> | (void | boolean | ToolResult);
  /** Audit hook; failures do not rewrite a completed business result. */
  afterExecute?: (request: ToolExecutionRequest, definition: ToolDefinition | undefined, result: ToolResult) => Promise<void> | void;
  /** Intended only for explicitly trusted local fixtures. */
  allowExternalWithoutPolicy?: boolean;
}

function errorResult(code: string, message: string, retryable = false): ToolResult {
  return { content: [{ type: 'text', text: message }], error: { code, message, retryable } };
}

function validationResult(error: unknown): ToolResult {
  if (error instanceof ToolInputError) return errorResult(error.code, `${error.message}: ${error.errors.map((item) => item.instancePath ? `${item.instancePath} ${item.message ?? ''}` : item.message ?? '').join('; ')}`.trim());
  if (error instanceof Error) return errorResult('tool_error', error.message);
  return errorResult('tool_error', String(error));
}

/** Executes registered tools with durable operation records, per-canvas write
 * locking, bounded read retries and cancellation/timeout propagation. */
export class ToolScheduler {
  private readonly store: SqliteStore;
  private readonly registry: ToolRegistry;
  private readonly limits: RuntimeLimits;
  private readonly parallelism: number;
  private readonly locks: KeyedMutex;
  private readonly pendingSideEffects: Map<string, Promise<void>>;
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly special?: ToolSchedulerOptions['special'];
  private readonly beforeExecute?: ToolSchedulerOptions['beforeExecute'];
  private readonly afterExecute?: ToolSchedulerOptions['afterExecute'];
  private readonly allowExternalWithoutPolicy: boolean;

  constructor(options: ToolSchedulerOptions) {
    this.store = options.store;
    this.registry = options.registry;
    this.limits = { ...DEFAULT_RUNTIME_LIMITS, ...(options.limits ?? {}) };
    this.parallelism = Math.max(1, Math.min(64, options.parallelism ?? 4));
    this.locks = options.locks ?? new KeyedMutex();
    this.pendingSideEffects = options.sideEffects ?? new Map<string, Promise<void>>();
    this.special = options.special;
    this.beforeExecute = options.beforeExecute;
    this.afterExecute = options.afterExecute;
    this.allowExternalWithoutPolicy = options.allowExternalWithoutPolicy ?? false;
  }

  async executeBatch(requests: readonly ToolExecutionRequest[]): Promise<ToolExecutionResult[]> {
    const output: Array<ToolExecutionResult | undefined> = new Array(requests.length);
    let pausedAt: number | undefined;
    const pauseAfter = (index: number): void => {
      if (pausedAt !== undefined && pausedAt <= index) return;
      pausedAt = index;
      const request = requests[index];
      if (!request) return;
      const wait = output[index]?.result.wait;
      if (!wait) return;
      this.store.persistPendingWait({
        runId: request.run.id,
        sessionId: request.session.id,
        wait,
        calls: requests.slice(index + 1).map((pending) => ({ call: pending.call, selection: pending.selection })),
      });
    };
    // A write/external call is a barrier. This preserves model order for
    // [read, write, read] while still allowing each contiguous read segment to
    // use the bounded worker pool. Running all reads up front would observe a
    // stale canvas state after a write.
    let segment: Array<{ index: number; request: ToolExecutionRequest }> = [];
    const drainReads = async (): Promise<void> => {
      const parallel = segment;
      segment = [];
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (true) {
          const item = parallel[cursor++];
          if (!item) return;
          output[item.index] = await this.execute(item.request);
          if (output[item.index]?.result.wait) pauseAfter(item.index);
        }
      };
      if (parallel.length) await Promise.all(Array.from({ length: Math.min(this.parallelism, parallel.length) }, () => worker()));
      if (pausedAt !== undefined) return;
    };
    for (const [index, request] of requests.entries()) {
      if (pausedAt !== undefined) break;
      const definition = this.registry.has(request.call.name) ? this.registry.get(request.call.name) : undefined;
      if (definition?.effect === 'read' && definition.parallelSafe && !definition.lockKey) {
        segment.push({ index, request });
      } else {
        await drainReads();
        if (pausedAt !== undefined) break;
        output[index] = await this.execute(request);
        if (output[index]?.result.wait) {
          pauseAfter(index);
          break;
        }
      }
    }
    if (pausedAt === undefined) await drainReads();
    return output.filter((item): item is ToolExecutionResult => Boolean(item));
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const operationId = this.operationIdFor(request);
    const existing = this.store.getOperation(operationId);
    const definition = this.registry.has(request.call.name) ? this.registry.get(request.call.name) : undefined;
    const effect = definition?.effect ?? 'read';
    const fingerprint = stableJson({ name: request.call.name, arguments: request.call.arguments });

    if (existing) {
      if (existing.fingerprint !== fingerprint) return this.result(request.call, errorResult('operation_conflict', `Operation ${operationId} was already used with different arguments`), operationId);
      if (existing.state === 'succeeded' && existing.result) return this.result(request.call, existing.result, operationId, existing);
      const reconciled = await this.tryReconcile(existing, definition, request);
      if (reconciled) return this.result(request.call, reconciled, operationId, this.store.getOperation(operationId));
      if (existing.state === 'failed' && (effect !== 'read' || !existing.error?.retryable)) return this.result(request.call, existing.result ?? errorResult(existing.error?.code ?? 'tool_failed', existing.error?.message ?? 'Tool failed'), operationId, existing);
      // An in-flight write or external effect has an unknown side effect. It is
      // surfaced to the model rather than executed a second time.
      if (existing.state === 'running' || existing.state === 'pending' || existing.state === 'submission_unknown') {
        if (effect !== 'read') return this.result(request.call, errorResult('operation_reconciliation_required', `Operation ${operationId} is unresolved; reconcile it before retrying`), operationId, existing);
      }
    } else {
      this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: 'pending', arguments: request.call.arguments });
    }

    if (request.signal.aborted) {
      const canceled = errorResult('aborted', 'Tool execution was canceled');
      // A caller can abort while a write/external request is still waiting for
      // its lock. Keep that operation unresolved: the side effect may already
      // have been submitted by another process, so reporting cancellation as
      // a completed negative outcome would make a later retry unsafe.
      const state: StoredOperation['state'] = effect === 'read' ? 'canceled' : 'submission_unknown';
      const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state, arguments: request.call.arguments, result: canceled, error: canceled.error });
      return this.result(request.call, canceled, operationId, op);
    }

    if (!definition && !this.special) {
      const unknown = errorResult('unknown_tool', `Unknown tool: ${request.call.name}`);
      const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: 'failed', arguments: request.call.arguments, result: unknown, error: unknown.error });
      return this.result(request.call, unknown, operationId, op);
    }

    if (effect === 'external' && !this.beforeExecute && !this.allowExternalWithoutPolicy) {
      const denied = errorResult('execution_policy_required', '外部副作用工具需要服务端执行策略授权；模型不能自行批准。');
      const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: 'failed', arguments: request.call.arguments, result: denied, error: denied.error });
      return this.result(request.call, denied, operationId, op);
    }

    if (definition) {
      try { this.registry.validate(definition.name, request.call.arguments); }
      catch (error) {
        const invalid = validationResult(error);
        const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: 'failed', arguments: request.call.arguments, result: invalid, error: invalid.error });
        return this.result(request.call, invalid, operationId, op);
      }
    }

    const run = async (): Promise<ToolResult> => {
      this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: 'running', arguments: request.call.arguments });
      requestRunEmit(request, 'tool.started', { toolCallId: request.call.id, name: request.call.name, arguments: request.call.arguments });
      const controller = new AbortController();
      const abortFromParent = () => controller.abort();
      request.signal.addEventListener('abort', abortFromParent, { once: true });
      this.activeControllers.set(operationId, controller);
      const timeout = Math.max(1, Math.min(86_400_000, definition?.timeoutMs ?? this.limits.toolTimeoutMs));
      let timer: ReturnType<typeof setTimeout> | undefined;
      let execution: Promise<ToolResult> | undefined;
      try {
        const context: ToolContext = {
          session: request.session,
          run: request.run,
          signal: controller.signal,
          operationId,
          selection: request.selection,
          emit: (type, data) => requestRunEmit(request, type, data),
        };
        execution = Promise.resolve().then(async () => {
          if (this.special) {
            const specialResult = await this.special(request, operationId);
            if (specialResult !== undefined) return specialResult;
          }
          if (!definition) return errorResult('unknown_tool', `Unknown tool: ${request.call.name}`);
          return definition.execute(request.call.arguments, context);
        });
        execution.catch(() => undefined);
        const timeoutPromise = new Promise<ToolResult>((_, reject) => { timer = setTimeout(() => { reject(new Error(`Tool timed out after ${timeout}ms`)); controller.abort(); }, timeout); });
        const abortPromise = new Promise<ToolResult>((_, reject) => {
          if (controller.signal.aborted) reject(new Error('Tool execution aborted'));
          else controller.signal.addEventListener('abort', () => reject(new Error('Tool execution aborted')), { once: true });
        });
        return await Promise.race([execution, timeoutPromise, abortPromise]);
      } catch (error) {
        // AbortController is cooperative. If an external/write tool ignores it,
        // keep the canvas lock occupied until its promise settles so a later
        // call cannot overlap an unknown side effect.
        if (effect !== 'read' && execution) this.holdSideEffect(lockKey, execution);
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        request.signal.removeEventListener('abort', abortFromParent);
        this.activeControllers.delete(operationId);
      }
    };

    const lockKey = definition && (definition.effect !== 'read' || definition.lockKey)
      ? (definition.lockKey?.(request.call.arguments, { session: request.session, run: request.run, signal: request.signal, operationId, selection: request.selection, emit: () => undefined }) ?? `canvas:${request.session.scope.canvasId}`)
      : undefined;
    const attempts = effect === 'read' ? Math.max(0, this.limits.readRetries) + 1 : 1;
    let lastError: ToolResult | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        if (this.beforeExecute && definition) {
          const decision = await this.beforeExecute(request, definition);
          if (decision === false || (decision && typeof decision === 'object' && Array.isArray((decision as ToolResult).content))) {
            const denied = decision === false ? errorResult('execution_denied', '服务端执行策略拒绝了该工具操作。') : decision as ToolResult;
            // A policy may deliberately park an operation behind an approval
            // wait. It has not reached the side-effect boundary, so retain it
            // as pending; a later model turn must not treat the wait as a
            // successful external submission or execute the same operation
            // blindly.
            const state: StoredOperation['state'] = denied.wait ? 'pending' : 'failed';
            const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state, arguments: request.call.arguments, result: denied, error: denied.error });
            return this.result(request.call, denied, operationId, op);
          }
        }
        const result = lockKey ? await this.withLock(lockKey, run) : await run();
        const normalized = this.normalizeResult(result);
        try { await this.afterExecute?.(request, definition, normalized); } catch { /* auditing must not change side-effect semantics */ }
        const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: normalized.error && effect !== 'read' ? 'submission_unknown' : normalized.error ? 'failed' : 'succeeded', arguments: request.call.arguments, result: normalized, error: normalized.error });
        if (!normalized.error || !normalized.error.retryable || attempt + 1 >= attempts) return this.result(request.call, normalized, operationId, op);
        lastError = normalized;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = effect === 'read' && attempt + 1 < attempts;
        const aborted = request.signal.aborted || /aborted|canceled/i.test(message);
        const failed = errorResult(aborted ? 'aborted' : (message.startsWith('Tool timed out') ? 'timeout' : 'tool_error'), message, retryable);
        lastError = failed;
        if (!retryable) {
          const state: StoredOperation['state'] = effect !== 'read' ? 'submission_unknown' : aborted ? 'canceled' : 'failed';
          const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state, arguments: request.call.arguments, result: failed, error: failed.error });
          return this.result(request.call, failed, operationId, op);
        }
      }
    }
    const op = this.store.saveOperation({ operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect, fingerprint, state: 'failed', arguments: request.call.arguments, result: lastError, error: lastError?.error });
    return this.result(request.call, lastError ?? errorResult('tool_error', 'Tool failed'), operationId, op);
  }

  cancelRun(runId: string): void {
    for (const [operationId, controller] of this.activeControllers) {
      const operation = this.store.getOperation(operationId);
      if (operation?.runId === runId) controller.abort();
    }
  }

  private async tryReconcile(existing: StoredOperation, definition: ToolDefinition | undefined, request: ToolExecutionRequest): Promise<ToolResult | undefined> {
    if (!definition?.reconcile) return undefined;
    try {
      const context: ToolContext = { session: request.session, run: request.run, signal: request.signal, operationId: existing.operationId, selection: request.selection, emit: (type, data) => requestRunEmit(request, type, data) };
      const result = await definition.reconcile(existing.operationId, context);
      if (result) {
        const next = this.store.saveOperation({ operationId: existing.operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect: definition.effect, fingerprint: existing.fingerprint, state: result.error ? 'failed' : 'succeeded', arguments: existing.arguments, result, error: result.error });
        return next.result;
      }
    } catch (error) {
      const failed = errorResult('reconciliation_failed', error instanceof Error ? error.message : String(error), true);
      this.store.saveOperation({ operationId: existing.operationId, sessionId: request.session.id, runId: request.run.id, callId: request.call.id, toolName: request.call.name, effect: definition.effect, fingerprint: existing.fingerprint, state: 'submission_unknown', arguments: existing.arguments, result: failed, error: failed.error });
    }
    return undefined;
  }

  private operationIdFor(request: ToolExecutionRequest): string {
    return operationIdFor(request.run.id, request.call.id);
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const pending = this.pendingSideEffects.get(key);
    if (pending) await pending;
    return this.locks.runExclusive(key, fn);
  }

  private holdSideEffect(key: string | undefined, execution: Promise<unknown>): void {
    if (!key) return;
    const settled = execution.then(() => undefined, () => undefined);
    this.pendingSideEffects.set(key, settled);
    void settled.then(() => {
      if (this.pendingSideEffects.get(key) === settled) this.pendingSideEffects.delete(key);
    });
  }

  private normalizeResult(result: ToolResult | undefined): ToolResult {
    if (!result || !Array.isArray(result.content)) return errorResult('invalid_tool_result', 'Tool returned an invalid result');
    return result;
  }

  private result(call: ToolCall, result: ToolResult, operationId: string, operation?: StoredOperation): ToolExecutionResult {
    return { call, result, operationId, operation: operation ?? this.store.getOperation(operationId)! };
  }
}

/** Stable, gateway-safe operation identity shared by runtime recovery and the scheduler. */
export function operationIdFor(runId: string, callId: string): string {
  return `op-${createHash('sha256').update(`${runId}\0${callId}`).digest('hex')}`;
}

function requestRunEmit(request: ToolExecutionRequest, type: string, data: Record<string, unknown>): void {
  // A scheduler request can optionally carry an event sink without extending
  // the stable contract. Runtime assigns it as a non-enumerable property.
  const sink = (request as ToolExecutionRequest & { emit?: (type: string, data: Record<string, unknown>) => void }).emit;
  sink?.(type, data);
}

export type ToolExecutionRequestWithEmit = ToolExecutionRequest & { emit?: (type: string, data: Record<string, unknown>) => void };
