#!/usr/bin/env node
// 兼容入口（T2.1 原始 spike 脚本）。T2.2 起 ensure 逻辑收敛到
// e2e/tools/ensure-devtools.js（npm run e2e 的 Jest globalSetup 与本 spike 共用）。
'use strict';

require('../tools/ensure-devtools').main();