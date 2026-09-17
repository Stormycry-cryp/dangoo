import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleSpecifier } from '../agent/scripts/module-specifier.mjs';

test('browser tooling imports native absolute/relative paths with spaces and Unicode', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dangoo module 测试 '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'mock #module.mjs');
  await writeFile(file, 'export const fixture = true;');
  const absolute = moduleSpecifier(file);
  assert.equal(absolute, pathToFileURL(file).href);
  assert.equal((await import(absolute)).fixture, true);
  const localPath = relative(process.cwd(), file);
  // Different Windows drives cannot be expressed as a cwd-relative path.
  if (!/^[A-Za-z]:/.test(localPath)) {
    const specifier = moduleSpecifier(`./${localPath}`);
    assert.equal((await import(specifier)).fixture, true);
  }
  assert.equal(moduleSpecifier('playwright'), 'playwright');
  assert.equal(moduleSpecifier('@scope/package'), '@scope/package');
  assert.equal(moduleSpecifier(absolute), absolute);
});
