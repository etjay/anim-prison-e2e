'use strict';
// Jest globalSetup 独立入口：仅供 npm run e2e:spike（T2.1 历史入口）挂接全程录像。
// Xvfb 已由前置的 ensure-devtools.js 启动；E2E_RECORD 未设时为 no-op（零开销）。
const { startRecording } = require('./record');

module.exports = async function globalSetup() {
  await startRecording();
};