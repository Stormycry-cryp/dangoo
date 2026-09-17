// Original Canvas + built widget, with only HTTP business responses simulated.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moduleSpecifier } from './module-specifier.mjs';
const { chromium } = await import(moduleSpecifier(process.env.PLAYWRIGHT_MODULE || 'playwright'));
const base = process.env.DANGOO_HOST_UI_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.local-fixture`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(10000);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const agentRequests = [];
let rejectIdentity = false;
const session = { id: 'auth-fixture-session', scope: { ownerId: 'fixture@example.test', canvasId: 'fixture' }, providerId: 'mock', model: 'mock', createdAt: Date.now() };
try {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname.startsWith('/__pb/')) {
      if (url.pathname.endsWith('/auth-with-password')) return route.fulfill({ json: { token, record: { id: 'fixture-user', collectionName: 'users', collectionId: '_pb_users_auth_', email: 'fixture@example.test', name: '认证测试用户' } } });
      return route.fulfill({ json: { id: 'fixture', title: 'Agent 鉴权测试', canvas_data: { rev: 0, cards: [], connections: [] }, items: [], models: [] } });
    }
    if (url.pathname.startsWith('/agent-api/')) {
      agentRequests.push({ path: url.pathname, authorization: request.headers().authorization });
      if (rejectIdentity && !url.pathname.endsWith('/health')) return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
      assert.equal(request.headers().authorization, token, 'widget must use current original PB login');
      if (url.pathname.endsWith('/health')) return route.fulfill({ json: { ok: true, configured: true } });
      if (url.pathname.endsWith('/capabilities')) return route.fulfill({ json: { providers: [{ id: 'mock', model: 'mock' }], skills: [], tools: [] } });
      if (url.pathname.endsWith('/sessions')) return route.fulfill({ json: request.method() === 'POST' ? { session } : { sessions: [session] } });
      if (url.pathname.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      return route.fulfill({ json: { session, runs: [], messages: [], eventSequence: 0 } });
    }
    return route.continue();
  });
  await page.goto(`${base}/canvas/fixture`);
  await page.getByRole('button', { name: '登录后使用 Agent', exact: true }).click();
  const login = page.getByRole('dialog');
  await login.getByPlaceholder('邮箱', { exact: true }).fill('fixture@example.test');
  await login.getByPlaceholder('密码', { exact: true }).fill('local-test-password');
  await login.getByRole('button', { name: '登录', exact: true }).last().click();
  await page.locator('.agent-panel').waitFor();
  assert.ok(agentRequests.some(item => item.path.endsWith('/capabilities')));
  assert.equal(await page.getByRole('button', { name: '登录后使用 Agent', exact: true }).count(), 0);
  // Simulate another tab logging out through PB's own storage subscription.
  await page.evaluate(() => {
    const oldValue = localStorage.getItem('pb_auth_local');
    localStorage.removeItem('pb_auth_local');
    window.dispatchEvent(new StorageEvent('storage', { key: 'pb_auth_local', oldValue, newValue: null, storageArea: localStorage }));
  });
  await page.locator('.agent-panel').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '登录后使用 Agent', exact: true }).click();
  await login.getByPlaceholder('邮箱', { exact: true }).fill('fixture@example.test');
  await login.getByPlaceholder('密码', { exact: true }).fill('local-test-password');
  rejectIdentity = true;
  await login.getByRole('button', { name: '登录', exact: true }).last().click();
  await page.getByRole('button', { name: '登录后使用 Agent', exact: true, includeHidden: true }).waitFor();
  await login.waitFor();
  assert.equal(await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('pb_auth_local') || '{}');
    return Boolean(value.token);
  }), false, '401 must clear the current rejected login');
  assert.deepEqual(pageErrors, []);
  console.log('Host browser auth PASS: original login dialog, PB credential forwarding, logout unmount, 401 clears stale session and reopens original login. Business HTTP is mocked.');
} catch (error) {
  console.error(await page.locator('body').innerText());
  const failureDir = await mkdtemp(join(tmpdir(), 'dangoo-host-auth-'));
  const screenshot = join(failureDir, 'failure.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  console.error(`Failure screenshot: ${screenshot}`);
  throw error;
} finally {
  await browser.close();
}
