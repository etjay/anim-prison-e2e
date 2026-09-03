'use strict';
// 逐页截图：导航到 demo 各页面并截图到 e2e/screenshots/（作为页面样式快照）。
// 供人工/用户查看页面观感。离线兜底，页内有 stub 数据可渲染。
const e2e = require('../helpers');
const { waitFor } = e2e;

// 未绑定态页面（登录/欢迎/绑定/隐私）
const UNBOUND = ['login', 'welcome', 'bind', 'privacy'];
// 需已绑定态页面（其余全部）
const BOUND = [
  'office', 'jail', 'town', 'me', 'cell-detail', 'card', 'canteen',
  'home', 'score', 'events', 'achievements', 'share', 'settings', 'help',
];

async function navShot(p) {
  // 容忍个别页 onShow 自动重定向：等到当前路径稳定为目标或超时后即截当前页
  await e2e.goto(`/pages/${p}/${p}`).catch(() => {});
  const file = await e2e.screenshot(p);
  console.log(`[shot] ${p} -> ${file}`);
  return file;
}

beforeAll(async () => {
  await e2e.bootstrap();
});

test('未绑定态页截图', async () => {
  await e2e.assumeState({ bound: false });
  for (const p of UNBOUND) {
    await navShot(p);
  }
});

test('已绑定态页截图', async () => {
  await e2e.assumeState({ bound: true });
  for (const p of BOUND) {
    await navShot(p);
  }
});
