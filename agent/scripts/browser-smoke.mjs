// Run against `npm run dev:mock` + `npm run dev:ui` only.
// Supply PLAYWRIGHT_MODULE if Playwright is installed outside this package.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { moduleSpecifier } from './module-specifier.mjs';
const { chromium } = await import(moduleSpecifier(process.env.PLAYWRIGHT_MODULE || 'playwright'));
const baseUrl = process.env.DANGOO_MOCK_UI_URL || 'http://127.0.0.1:5173';
const parsed = new URL(baseUrl);
assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname), 'Mock browser test must target localhost');
const output = resolve(process.env.DANGOO_MOCK_SCREENSHOTS || 'artifacts/mock-browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const submissions = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.method() === 'POST' && /\/sessions\/[^/]+\/messages$/.test(request.url())) submissions.push(request.postDataJSON());
});
try {
  await page.goto(baseUrl);
  await page.getByText('mock · dangoo-local-mock', { exact: true }).waitFor();
  const beforeCanvas = await (await page.request.get(`${baseUrl}/api/canvas?canvasId=demo-canvas`)).json();
  const composer = page.locator('.agent-composer textarea');
  await composer.fill('/fashion');
  await page.getByRole('option').filter({ hasText: 'fashion-ecommerce-image-set' }).waitFor();
  await composer.press('ArrowDown');
  await composer.press('Enter');
  await page.getByRole('button', { name: '移除技能 fashion-ecommerce-image-set', exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '');
  const message = `本地画布节点测试 ${Date.now()}`;
  const repliesBefore = await page.locator('.agent-message--assistant').count();
  await composer.fill(message);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.agent-message--assistant').length > count, repliesBefore);
  await page.locator('.agent-message--assistant').last().filter({ hasText: '已完成本地 Mock 画布流程' }).waitFor();
  assert.deepEqual(submissions.at(-1).skillNames, ['fashion-ecommerce-image-set']);
  const canvas = await (await page.request.get(`${baseUrl}/api/canvas?canvasId=demo-canvas`)).json();
  assert.ok(canvas.nodes.some(node => node.data?.title === '本地 Mock 提示词'));
  assert.ok(canvas.revision > beforeCanvas.revision, 'Every completed mock edit must actually change the canvas');
  await page.reload();
  await page.locator('.agent-message--user').filter({ hasText: message }).waitFor();
  assert.equal(await page.getByRole('button', { name: '移除技能 fashion-ecommerce-image-set', exact: true }).count(), 0);
  await page.getByRole('button', { name: '选择技能', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索技能', exact: true }).fill('不存在的技能');
  await page.getByText('未找到匹配技能', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '搜索技能', exact: true }).fill('服装');
  await page.getByRole('option').filter({ hasText: 'fashion-ecommerce-image-set' }).waitFor();
  const checkPopover = async () => {
    const panel = await page.locator('.agent-panel').boundingBox();
    const popover = await page.locator('.agent-skill-popover').boundingBox();
    assert.ok(panel && popover);
    assert.ok(popover.x >= panel.x && popover.x + popover.width <= panel.x + panel.width + 1, 'Skill popover must fit inside panel');
  };
  await checkPopover();
  await page.screenshot({ path: resolve(output, 'skills-desktop.png'), animations: 'disabled' });
  await page.getByRole('textbox', { name: '搜索技能', exact: true }).press('Escape');
  const stopMessagesBefore = await page.locator('.agent-message--user').filter({ hasText: /^mock:stop$/ }).count();
  await composer.fill('mock:stop');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.locator('.agent-message--assistant').filter({ hasText: '等待停止' }).waitFor();
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('button', { name: '停止', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.agent-message--user').filter({ hasText: /^mock:stop$/ }).count(), stopMessagesBefore + 1, 'A user submission must have only one bubble');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '选择技能', exact: true }).click();
  await checkPopover();
  await page.screenshot({ path: resolve(output, 'skills-mobile.png'), animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: ['slash-keyboard', 'selected-skill-payload', 'canvas-write', 'history-reload', 'button-search-empty', 'popover-bounds', 'stream-stop', 'mobile-layout'], screenshots: output }));
} finally {
  await browser.close();
}
