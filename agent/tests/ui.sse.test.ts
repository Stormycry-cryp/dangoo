import assert from 'node:assert/strict';
import test from 'node:test';
import { SseGapError, SseParser, acceptSequencedEvent, eventSequence, parseSse } from '../src/ui/sse';

test('SSE parser handles split UTF-8 text, CRLF, comments, and multiline data', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.feed(': heartbeat\r\nevent: assistant.delta\r\nid: 7\r\ndata: {"sequence":7,\r\n'), []);
  const events = parser.feed('data: "text"}\r\n\r\n');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, 'assistant.delta');
  assert.equal(events[0]?.id, '7');
  assert.equal(events[0]?.data, '{"sequence":7,\n"text"}');
  assert.deepEqual(events[0]?.json, '{"sequence":7,\n"text"}');
});

test('parseSse commits an event when the server closes without a blank line', () => {
  const [event] = parseSse('event: run.updated\ndata: {"sequence":3,"state":"running"}');
  assert.equal(event?.event, 'run.updated');
  assert.equal(eventSequence(event!), 3);
});

test('sequence acceptance drops replay and reports a gap', () => {
  const replay = acceptSequencedEvent({ id: '4', data: '{}', event: 'message' }, 4);
  assert.equal(replay.event, undefined);
  assert.equal(replay.lastSequence, 4);
  assert.throws(() => acceptSequencedEvent({ id: '8', data: '{}', event: 'message' }, 4), (error: unknown) => error instanceof SseGapError && error.expected === 5 && error.received === 8);
  const next = acceptSequencedEvent({ id: '5', data: '{}', event: 'message' }, 4);
  assert.equal(next.lastSequence, 5);
  assert.equal(next.event?.id, '5');
});
