# e2e（E2E 自动化框架与用例）

> **边界说明（T1.1 协调约束）**：本目录由 **stage2（测试工程师 / T2.x）** 负责实现。客户端骨架（T1.1）仅创建目录占位，不写 E2E 业务用例。

## 预留（供 stage2 落位）

- 框架：`miniprogram-automator` + Jest（方案 A，见父 issue ANIM-3 需求设计 v0.2）。
- 目录规范（stage2 定稿后落地）：`e2e/smoke/`（冒烟用例）、`e2e/helpers/`（automator API 仅出现在此层，为二期真机迁移留缝）。
- 单一入口：根 `package.json` 预留 `npm run e2e`（stage2 添加）。
- 产物：失败截图 / 日志落到 `e2e/screenshots/`、`e2e/reports/`（已在根 `.gitignore` 忽略）。

## 待接入的 5 个可走通页面（T1.1 已交付）

`pages/login`、`pages/welcome`、`pages/bind`、`pages/home`、`pages/canteen` —— DevTools 中可手动走通，供 stage2 的 spike 与冒烟用例引用。