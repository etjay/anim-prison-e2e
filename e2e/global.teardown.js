'use strict';
// Jest globalTeardown：suite 结束（含失败/中断后 forceExit 场景）关闭 DevTools。
//
// stopAllIde = `cli quit` + 等待主进程退出 + 按安装路径 pkill 孤儿 appservice
// renderer（spike 补丁 D：`cli quit` 杀不掉的孤儿 renderer 会占住旧 auto
// tunnel 端口，影响下一轮 suite）。Xvfb 保留（跨 suite 复用，无副作用）。
const { stopAllIde } = require('./tools/ensure-devtools');
const { stopRecording } = require('./tools/record');

module.exports = async function globalTeardown() {
  // 先停全程录像（E2E_RECORD=1 时）再杀 IDE，避免录像以进程被杀的黑屏收尾。
  await stopRecording();
  stopAllIde();
  console.log('[globalTeardown] DevTools 已关闭（Xvfb 保留复用）');
};