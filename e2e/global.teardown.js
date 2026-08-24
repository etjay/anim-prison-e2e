'use strict';
// Jest globalTeardown：suite 结束（含失败/中断后 forceExit 场景）关闭 DevTools。
//
// stopAllIde = `cli quit` + 等待主进程退出 + 按安装路径 pkill 孤儿 appservice
// renderer（spike 补丁 D：`cli quit` 杀不掉的孤儿 renderer 会占住旧 auto
// tunnel 端口，影响下一轮 suite）。Xvfb 保留（跨 suite 复用，无副作用）。
const { stopAllIde } = require('./tools/ensure-devtools');

module.exports = async function globalTeardown() {
  stopAllIde();
  console.log('[globalTeardown] DevTools 已关闭（Xvfb 保留复用）');
};