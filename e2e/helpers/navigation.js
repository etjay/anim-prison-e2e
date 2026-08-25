'use strict';
// 页面导航 helper（基于 runtime 的 reLaunch/currentPath + waitFor，无固定 sleep）。
const runtime = require('./runtime');
const { waitFor } = require('./wait');

function normalize(route) {
  return String(route).replace(/^\//, '');
}

// 导航到指定页（reLaunch 清栈跳转）并等待页面路径切换完成。
// route 形如 '/pages/welcome/welcome'（前导斜杠可有可无）。
async function goto(route) {
  const target = normalize(route);
  await runtime.reLaunch(route);
  await waitFor(
    async () => (await runtime.currentPath()) === target ? target : null,
    { label: `导航到 ${route}`, timeoutMs: 20000 },
  );
  return target;
}

// 断言型导航：只等待并返回当前页路径（不触发跳转）。
// 用法：const p = await expectPage('/pages/home/home'); expect(p).toBe('pages/home/home');
async function expectPage(route) {
  const target = normalize(route);
  const p = await waitFor(
    async () => (await runtime.currentPath()) === target ? target : null,
    { label: `页面为 ${route}`, timeoutMs: 20000 },
  );
  if (p !== target) throw new Error(`expectPage：当前页 ${p} 与期望 ${target} 不一致`);
  return p;
}

module.exports = { goto, expectPage, currentPath: runtime.currentPath };