import Ajv, { type ValidateFunction } from 'ajv';
import { createHash } from 'node:crypto';
import type { JsonSchema, ToolDefinition, ToolRegistryLike, ToolSpec } from '../contracts/index.js';
import { stableJson } from './types.js';

export interface ToolValidationError {
  instancePath?: string;
  schemaPath?: string;
  keyword?: string;
  message?: string;
  params?: Record<string, unknown>;
}

export class ToolInputError extends Error {
  readonly code = 'invalid_tool_arguments';
  readonly errors: ToolValidationError[];

  constructor(toolName: string, errors: ToolValidationError[]) {
    super(`Invalid arguments for ${toolName}`);
    this.name = 'ToolInputError';
    this.errors = errors;
  }
}

/** Registry with a versioned immutable snapshot and Ajv schemas. */
export class ToolRegistry implements ToolRegistryLike {
  private readonly definitions = new Map<string, ToolDefinition>();
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly ajv: Ajv;
  private revisionNumber = 0;

  constructor(initial: readonly ToolDefinition[] = [], options: { ajv?: Ajv } = {}) {
    this.ajv = options.ajv ?? new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    for (const definition of initial) this.register(definition);
  }

  register(definition: ToolDefinition): { revision: string; tool: ToolDefinition } {
    this.assertDefinition(definition);
    const validate = this.ajv.compile(definition.inputSchema as JsonSchema);
    this.definitions.set(definition.name, definition);
    this.validators.set(definition.name, validate);
    this.revisionNumber += 1;
    return { revision: this.revision, tool: definition };
  }

  unregister(name: string): boolean {
    const removed = this.definitions.delete(name);
    this.validators.delete(name);
    if (removed) this.revisionNumber += 1;
    return removed;
  }

  get(name: string): ToolDefinition {
    const definition = this.definitions.get(name);
    if (!definition) throw new Error(`Unknown tool: ${name}`);
    return definition;
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  list(): ToolDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  discover(query?: string): ToolSpec[] {
    const normalized = query?.trim().toLocaleLowerCase();
    return this.list().filter((definition) => !normalized || definition.name.toLocaleLowerCase().includes(normalized) || definition.description.toLocaleLowerCase().includes(normalized));
  }

  validate(name: string, args: unknown): void {
    const definition = this.get(name);
    const validator = this.validators.get(name) ?? this.ajv.compile(definition.inputSchema as JsonSchema);
    if (!validator(args)) throw new ToolInputError(name, (validator.errors ?? []) as ToolValidationError[]);
  }

  snapshot(): { revision: string; tools: readonly ToolDefinition[] } {
    // The revision includes declaration revisions so a turn can pin the exact
    // schema set even if registrations happen in a different order.
    const material = this.list().map((tool) => ({ name: tool.name, revision: tool.revision, effect: tool.effect, parallelSafe: tool.parallelSafe, inputSchema: tool.inputSchema }));
    return { revision: `tools-${this.revisionNumber}-${createHash('sha256').update(stableJson(material)).digest('hex').slice(0, 16)}`, tools: this.list() };
  }

  get revision(): string {
    return this.snapshot().revision;
  }

  private assertDefinition(definition: ToolDefinition): void {
    if (!definition.name || !/^[A-Za-z0-9_.:-]{1,160}$/.test(definition.name)) throw new Error('Tool name must be a non-empty namespaced identifier');
    if (!definition.description) throw new Error(`Tool ${definition.name} requires a description`);
    if (!definition.revision) throw new Error(`Tool ${definition.name} requires a revision`);
    if (!definition.inputSchema || typeof definition.inputSchema !== 'object') throw new Error(`Tool ${definition.name} requires an input schema`);
    if (!['read', 'write', 'external'].includes(definition.effect)) throw new Error(`Tool ${definition.name} has an invalid effect`);
    if (typeof definition.execute !== 'function') throw new Error(`Tool ${definition.name} requires execute()`);
  }
}

export function toolSpec(definition: ToolDefinition): ToolSpec {
  return { name: definition.name, description: definition.description, inputSchema: definition.inputSchema, revision: definition.revision };
}
