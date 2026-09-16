import test from 'node:test';
import { runMockSmoke } from '../scripts/mock-smoke.js';

test('explicit local mock deployment passes the bounded HTTP/SSE integration smoke', async () => {
  await runMockSmoke();
});
