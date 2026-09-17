import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enabledSkillsFromCapabilities,
  filterSkills,
  parseSlashSkillInvocation,
  replaceSlashSkillInvocation,
} from '../src/ui/skills';
import type { SkillMetadata } from '../src/contracts/index';

const fashionSkill: SkillMetadata = {
  name: 'fashion-ecommerce-image-set',
  description: '规划和生成服装详情页、A+ 页面及其卖点、尺码规格和穿搭模块。',
  revision: 'fashion@1',
  scope: 'user',
  enabled: true,
  implicit: false,
  dependencies: [],
  path: '/skills/fashion-ecommerce-image-set',
};

test('skill catalog keeps enabled SkillMetadata and omits disabled entries', () => {
  const result = enabledSkillsFromCapabilities({ skills: [fashionSkill, { ...fashionSkill, name: 'disabled-skill', enabled: false }, fashionSkill] });
  assert.deepEqual(result, [fashionSkill]);
});

test('skill query matches names and Chinese descriptions', () => {
  const other: SkillMetadata = { ...fashionSkill, name: 'product-shot', description: '商品主图与场景图' };
  assert.deepEqual(filterSkills([fashionSkill, other], '服装'), [fashionSkill]);
  assert.deepEqual(filterSkills([fashionSkill, other], 'product'), [other]);
});

test('slash invocation is limited to a trailing whitespace-delimited command', () => {
  assert.deepEqual(parseSlashSkillInvocation('/fashion'), { start: 0, end: 8, query: 'fashion' });
  assert.deepEqual(parseSlashSkillInvocation('请使用 /fashion'), { start: 4, end: 12, query: 'fashion' });
  assert.deepEqual(parseSlashSkillInvocation('https://example.com'), undefined);
  const invocation = parseSlashSkillInvocation('请使用 /fashion')!;
  assert.equal(replaceSlashSkillInvocation('请使用 /fashion', invocation, ''), '请使用 ');
});
