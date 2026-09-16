import type {
  AgentEvent,
  ContextState,
  Json,
  Message,
  Run,
  Session,
  Selection,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolSpec,
  WaitRequest,
} from '../contracts/index.js';

export type { AgentEvent, ContextState, Json, Message, Run, Session, ToolDefinition, ToolResult, ToolSpec, WaitRequest };

export interface StoredOperation {
  operationId: string;
  sessionId: string;
  runId?: string;
  callId?: string;
  toolName: string;
  effect: 'read' | 'write' | 'external';
  fingerprint: string;
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'submission_unknown';
  arguments: unknown;
  result?: ToolResult;
  error?: { code: string; message: string; retryable?: boolean };
  createdAt: number;
  updatedAt: number;
}

export interface StoredJob {
  id: string;
  operationId: string;
  sessionId: string;
  runId?: string;
  nodeId: string;
  state: 'created' | 'submitting' | 'submitted' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'submission_unknown';
  remoteId?: string;
  results: Array<{ assetId: string; version: number; role?: 'reference' | 'edit_source' | 'result' }>;
  storageState: 'pending' | 'stored' | 'failed';
  applyState: 'pending' | 'applied' | 'conflict' | 'target_missing';
  error?: string;
  updatedAt: number;
}

export interface StoreSessionInput {
  id: string;
  ownerId: string;
  canvasId: string;
  createdAt: number;
  providerId: string;
  model: string;
}

export interface StoreRunInput {
  id: string;
  sessionId: string;
  turnId: string;
  state: Run['state'];
  providerId: string;
  model: string;
  providerRevision: string;
  toolRevision: string;
  skillRevision: string;
  createdAt: number;
  updatedAt: number;
  wait?: WaitRequest;
  error?: string;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  runId?: string;
  state: ContextState;
  summaryVersion: number;
  createdAt: number;
  lastMessageOrdinal?: number;
}

export interface StoredPendingCall {
  runId: string;
  sessionId: string;
  position: number;
  call: ToolCall;
  selection?: Selection;
  createdAt: number;
}

export interface ResultPage {
  ref: string;
  sessionId: string;
  value: unknown;
  createdAt: number;
}

export interface SessionEventListener {
  (event: AgentEvent): void;
}

export interface RuntimeLimits {
  maxToolResultChars: number;
  maxContextTokens: number;
  maxModelTurns: number;
  maxMessageChars: number;
  maxSelectionItems: number;
  toolTimeoutMs: number;
  readRetries: number;
}

export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  maxToolResultChars: 20_000,
  maxContextTokens: 100_000,
  maxModelTurns: 1_000,
  maxMessageChars: 50_000,
  maxSelectionItems: 100,
  toolTimeoutMs: 120_000,
  readRetries: 1,
};

export function asJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(asJson);
  if (typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = asJson(item);
    return out;
  }
  return String(value);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export function now(): number {
  return Date.now();
}
