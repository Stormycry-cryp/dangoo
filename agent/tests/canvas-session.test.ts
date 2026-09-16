import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../src/core/store.js';

test('legacy duplicate histories are retained and both connections select the same canonical session', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dangoo-session-'));
  const path = join(directory, 'sessions.db');
  const first = new SqliteStore(path);
  const raw = new Database(path);
  raw.prepare('INSERT INTO agent_sessions VALUES(?,?,?,?,?,?)').run('z', 'owner', 'canvas', 1, 'fixture', 'model');
  raw.prepare('INSERT INTO agent_sessions VALUES(?,?,?,?,?,?)').run('a', 'owner', 'canvas', 1, 'fixture', 'model');
  first.appendMessage({ id: 'legacy-message', sessionId: 'z', role: 'user', content: [{ type: 'text', text: 'legacy history' }] });
  raw.close();
  const second = new SqliteStore(path);
  try {
    const record = { ownerId: 'owner', canvasId: 'canvas', createdAt: 2, providerId: 'fixture', model: 'model' };
    assert.equal(first.createSession({ ...record, id: 'new1' }).id, 'a');
    assert.equal(second.createSession({ ...record, id: 'new2' }).id, 'a');
    assert.equal(second.listSessions({ ownerId: 'owner', canvasId: 'canvas' }).length, 2);
    assert.equal(second.listMessages('z')[0].id, 'legacy-message');
    const newCanvas = { ...record, canvasId: 'fresh' };
    assert.equal(first.createSession({ ...newCanvas, id: 'fresh1' }).id, 'fresh1');
    assert.equal(second.createSession({ ...newCanvas, id: 'fresh2' }).id, 'fresh1');
  } finally {
    second.close();
    first.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
