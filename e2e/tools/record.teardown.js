'use strict';
// Jest globalTeardown 独立入口：仅供 npm run e2e:spike（T2.1 历史入口）挂接全程录像。
// E2E_RECORD 未设时为 no-op（零开销）。
const { stopRecording } = require('./record');

module.exports = async function globalTeardown() {
  await stopRecording();
};