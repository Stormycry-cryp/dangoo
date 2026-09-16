import type { SkillMetadata } from '../contracts/index';

export interface SlashSkillInvocation {
  start: number;
  end: number;
  query: string;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function skillMetadataFromUnknown(value: unknown): SkillMetadata | undefined {
  const source = recordValue(value);
  if (!source) return undefined;
  const name = stringValue(source.name)?.trim();
  const description = stringValue(source.description)?.trim();
  const scope = source.scope === 'builtin' || source.scope === 'workspace' || source.scope === 'user' ? source.scope : undefined;
  if (!name || description === undefined || !scope || typeof source.revision !== 'string' || typeof source.enabled !== 'boolean' || typeof source.implicit !== 'boolean' || typeof source.path !== 'string') return undefined;
  const dependencies = Array.isArray(source.dependencies)
    ? source.dependencies.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    name,
    description,
    revision: source.revision,
    scope,
    enabled: source.enabled,
    implicit: source.implicit,
    dependencies,
    path: source.path,
  };
}

/** Read the runtime capabilities contract and keep only selectable skills. */
export function enabledSkillsFromCapabilities(value: unknown): SkillMetadata[] {
  const source = recordValue(value);
  const rawSkills = Array.isArray(source?.skills) ? source.skills : [];
  const seen = new Set<string>();
  return rawSkills.flatMap((item) => {
    const skill = skillMetadataFromUnknown(item);
    if (!skill || !skill.enabled || seen.has(skill.name)) return [];
    seen.add(skill.name);
    return [skill];
  });
}

export function filterSkills(skills: readonly SkillMetadata[], query: string): SkillMetadata[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...skills];
  return skills.filter((skill) => `${skill.name}\n${skill.description}`.toLocaleLowerCase().includes(normalized));
}

/**
 * Slash invocation is intentionally limited to a slash command at the start of
 * a whitespace-delimited segment. This keeps ordinary URLs and prose untouched.
 */
export function parseSlashSkillInvocation(text: string, cursor = text.length): SlashSkillInvocation | undefined {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(beforeCursor);
  if (!match || match.index < 0) return undefined;
  const query = match[1] ?? '';
  const start = match.index + match[0].length - query.length - 1;
  return { start, end: safeCursor, query };
}

export function replaceSlashSkillInvocation(text: string, invocation: SlashSkillInvocation, replacement: string): string {
  return `${text.slice(0, invocation.start)}${replacement}${text.slice(invocation.end)}`;
}
