import type { SseEnvelope } from './types';

export interface ParsedSseEvent extends SseEnvelope {
  event: string;
  data: string;
}

/** A small WHATWG SSE parser that also works in Node tests without EventSource. */
export class SseParser {
  private buffer = '';
  private eventName = '';
  private eventId: string | undefined;
  private retry: number | undefined;
  private dataLines: string[] = [];

  feed(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk;
    const events: ParsedSseEvent[] = [];
    let lineEnd = this.findLineEnd(this.buffer);
    while (lineEnd !== undefined) {
      const line = this.buffer.slice(0, lineEnd.index);
      this.buffer = this.buffer.slice(lineEnd.nextIndex);
      this.consumeLine(line, events);
      lineEnd = this.findLineEnd(this.buffer);
    }
    return events;
  }

  end(): ParsedSseEvent[] {
    const events: ParsedSseEvent[] = [];
    if (this.buffer.length > 0) {
      this.consumeLine(this.buffer, events);
      this.buffer = '';
    }
    // A stream ending without a final blank line still commits a complete event.
    this.commit(events);
    return events;
  }

  private findLineEnd(value: string): { index: number; nextIndex: number } | undefined {
    const newline = value.indexOf('\n');
    const carriage = value.indexOf('\r');
    if (newline < 0 && carriage < 0) return undefined;
    if (newline < 0 || (carriage >= 0 && carriage < newline)) {
      const hasLineFeed = value[carriage + 1] === '\n';
      return { index: carriage, nextIndex: carriage + (hasLineFeed ? 2 : 1) };
    }
    return { index: newline, nextIndex: newline + 1 };
  }

  private consumeLine(line: string, events: ParsedSseEvent[]): void {
    if (line.length === 0) {
      this.commit(events);
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon >= 0 ? line.slice(0, colon) : line;
    const rawValue = colon >= 0 ? line.slice(colon + 1) : '';
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    switch (field) {
      case 'event':
        this.eventName = value;
        break;
      case 'data':
        this.dataLines.push(value);
        break;
      case 'id':
        // The SSE spec ignores IDs containing a NUL character.
        if (!value.includes('\0')) this.eventId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
      default:
        break;
    }
  }

  private commit(events: ParsedSseEvent[]): void {
    if (this.dataLines.length === 0) {
      this.eventName = '';
      this.retry = undefined;
      return;
    }
    const data = this.dataLines.join('\n');
    events.push({
      event: this.eventName || 'message',
      id: this.eventId,
      retry: this.retry,
      data,
      json: parseSsePayload(data),
    });
    this.eventName = '';
    this.retry = undefined;
    this.dataLines = [];
  }
}

export function parseSse(text: string): ParsedSseEvent[] {
  const parser = new SseParser();
  return [...parser.feed(text), ...parser.end()];
}

export function parseSsePayload(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

export async function* createSessionEventStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEnvelope> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('已取消', 'AbortError');
      const result = await reader.read();
      if (result.done) break;
      const text = decoder.decode(result.value, { stream: true });
      for (const event of parser.feed(text)) yield event;
    }
    for (const event of parser.feed(decoder.decode())) yield event;
    for (const event of parser.end()) yield event;
  } finally {
    reader.releaseLock();
  }
}

export function eventPayload(envelope: SseEnvelope): unknown {
  return envelope.json ?? parseSsePayload(envelope.data);
}

export function eventSequence(envelope: SseEnvelope): number | undefined {
  const payload = eventPayload(envelope);
  if (payload && typeof payload === 'object') {
    const source = payload as Record<string, unknown>;
    const raw = source.sequence ?? source.seq;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  }
  if (envelope.id && /^\d+$/.test(envelope.id)) return Number(envelope.id);
  return undefined;
}

export class SseGapError extends Error {
  readonly expected: number;
  readonly received: number;

  constructor(expected: number, received: number) {
    super(`事件序号缺口：${expected}–${received - 1}`);
    this.name = 'SseGapError';
    this.expected = expected;
    this.received = received;
  }
}

/**
 * Applies events to a cursor, dropping replayed events and surfacing missing ranges.
 * The reducer/store decides how to apply the payload; this function only handles ordering.
 */
export function acceptSequencedEvent<T extends SseEnvelope>(event: T, lastSequence: number): { event?: T; lastSequence: number } {
  const sequence = eventSequence(event);
  if (sequence === undefined) return { event, lastSequence };
  if (sequence <= lastSequence) return { lastSequence };
  if (sequence > lastSequence + 1) throw new SseGapError(lastSequence + 1, sequence);
  return { event, lastSequence: sequence };
}
