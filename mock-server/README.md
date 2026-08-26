# mock-server（服务端 mock 环境 · T1.2 实现）

> **边界（T1.2 / 服务端）**：本目录由服务端负责实现。客户端骨架（T1.1）只建了目录占位；
> 本文件由 T1.2 补全为**已实现**的接口文档 + 运行说明。接口契约是 **stage2 E2E 断言的对齐基准**，
> 详见 `docs/api.md`；接口契约变更需同步客户端开发工程师。

## 已实现（Express，纯内存，无持久化）

stub API，路径 / 入参 / 响应 / 错误码与客户端 `miniprogram/` 已提交代码**完全一致**，
并对齐 `docs/gameplay/prison-interactions.md`（ANIM-13）的 `/api/interaction` 时段/频次/ΔS/行为分 规格，
以及 M8 语料系统（ANIM-15，`docs/corpus-system.md` v1.0 定稿）的服务端权威契约：

| # | 端点 | 方法 | 说明 | 约定错误码 |
|---|------|------|------|-----------|
| 1 | `/api/auth/login` | POST | stub 登录（code → session），返回 `{ token, bound }` | `AUTH_INVALID` |
| 2 | `/api/bind` | POST | 邀请码绑定（入参 `{ inviteCode }`），一次性绑定 + 重复绑定查重 | `BIND_INVALID` / `BIND_DUPLICATE` |
| 3 | `/api/animal` | GET | 动物 + 地图数据，返回 `{ animal, map: { cells: [] }, corpus }`（M8 环境语料 `scene=enter`） | `ANIMAL_NOT_FOUND` |
| 4 | `/api/interaction` | POST | 食堂互动（入参 `{ animalId, action, requestId? }`），`action ∈ feed/exercise/play`；响应含 M8 即时反馈语料 `corpus` | `INTERACTION_NOT_IN_WINDOW` / `INTERACTION_DAILY_LIMIT` / `INTERACTION_IN_PROGRESS` / `INTERACTION_FAILED` |
| 5 | `/api/rating` | GET | 评分/满意度查询，返回 `{ rating: { score, satisfaction, count, points } }` | `RATING_NOT_FOUND` |
| 6 | `/api/corpus` | GET | M8 环境/主动语料（`?scene=enter\|map\|timed`），服务端权威上下文键/去重/回退/AI 配额 | `ANIMAL_NOT_FOUND` |
| — | `/api/corpus/reload` | POST | M8 语料配置热更（items/conditionTag/dedup/aiQuota），运维 | `BAD_REQUEST` |

### M8 语料系统（ANIM-15，规格见 `docs/corpus-system.md`）

- **两层架构**：Layer1 规则语料（P0 兜底 + P1 条件触发，永不失效）+ Layer2 AI 语料（P2 灰度，**默认关**，feature flag 热更即时关断）。
- **上下文键** = `scene × tier × daypart × weather × interaction`（服务端计算）：
  - `tier` 复用 ANIM-16 §1.4 满意度三档（低 0–29 / 中 30–69 / 高 70–100）；
  - `daypart` 四段（morning 07–10 / noon 10–15 / evening 15–22 / night 22–07，UTC+8，对齐 ANIM-16 §2.2）；
  - `weather` / `interaction` / `recent` 为低权重加权修饰（非硬筛选），`weather` 由 `X-Mock-Weather` 头覆盖（M11 未上线，缺省 = 不约束）。
- **去重（P0 验收硬指标）**：per-animal 最近已播 ID 滑窗（默认 20）+ 同上下文键 24h（UTC+8 日切）不重复同一句；池耗尽逐级回退 条件池 → 档位池 → 性格通用池 → 物种通用池，**任意上下文必出 ≥1 条**。
- **AI 配额**（§4.2）：默认 `enabled:false`、5 条/日/只 + 20 条/日/账号，命中优先、超量无感回落 L1。
- **热更**：条目/标签/去重参数/AI 配额均可经 `POST /api/corpus/reload` 热更（mock 期内存配置 `src/corpusData.js`，重启/`/api/reset` 清零）。
- 客户端只渲染 `corpus.text`；契约/触发/去重/热更规格全文见 `docs/corpus-system.md`。

统一响应包络（与 `miniprogram/utils/request.js` 对齐：成功读顶层字段，失败读 `code`/`message`）：
- 成功（2xx）：`{ code: 0, message: 'ok', profile, ...payload }`
- 失败（非 2xx）：`{ code: '<STRING>', message: '...', data? }`
- 认证：`Authorization: Bearer <token>`（客户端 request.js 的写法），也兼容 `X-Mock-Token: <token>`。

## 快速开始

```bash
cd mock-server
npm install
npm run start:dev      # dev     profile -> http://127.0.0.1:3000（客户端 dev baseURL）
npm run start:preview  # preview profile -> http://127.0.0.1:3001（客户端 preview baseURL）
```

端口：dev 默认 `3000`、preview 默认 `3001`（对应 `miniprogram/config/env.js` 的 `BASE_URLS`）。
可覆盖：`MOCK_HOST`、`MOCK_PORT`、`MOCK_PROFILE`。

> 若本机 `3000` 被占用（如 Multica 平台），`MOCK_PORT=3001 npm run start:dev` 即可；
> 客户端对应把 `env.js` 的 `dev` baseURL 指向该端口。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run start:dev` / `start:preview` | 以对应 profile 启动 |
| `npm run reset` | 单脚本重置 fixtures（打印规范态 + 尝试重置运行中的服务 `POST /api/reset`） |
| `npm run smoke` / `smoke:dev` / `smoke:preview` | 内置自检：起临时端口，跑全链路 + 全部错误码 + 时段/频次/幂等 + M8 语料（字段/去重/AI 默认关/热更） |

## 目录

```
mock-server/
  server.js           # 入口：读 profile/host/port/mock-clock，listen
  src/
    app.js            # Express app + 业务端点 + /api/corpus + /api/corpus/reload + /health + /api/reset（flat 包络）
    store.js          # 内存数据层：会话/绑定/互动(时段·频次·w_t·ΔS·行为分·幂等)/评分/语料接线(§3.6)
    config.js         # 常量：时段/频次上限/ΔS/行为分/w_t/c_S/默认时钟/地图 cells
    fixtures.js       # 默认 fixtures：2 账号 / 2 邀请码 / 2 动物类型 + 预绑动物
    errors.js         # 错误码表（字符串，E2E 对齐基准）
    profiles.js       # dev / preview profile（端口 + 严格登录 + requestId）
    time.js           # UTC+8 时钟/时段判定 + X-Mock-Now 覆盖 + daypart/tier 分档（M8）
    corpus.js         # M8 语料引擎：上下文键/查池/去重/回退/AI 配额（服务端权威，§1–§4）
    corpusData.js     # M8 语料默认配置（条目/标签字典/去重策略/AI 配额，可热更）
  scripts/
    reset.js          # fixtures 单脚本重置
    smoke.js          # 内置自检（全链路 + 错误码 + 互动规则）
```

## Fixtures（stage2 E2E 对齐基准，见 docs/api.md）

- **2 账号**：`code_user_10001`（测试选手A，未绑定，= stub 登录 `stub-wechat-code`）、
  `code_user_10002`（测试选手B，已绑定仓鼠）。
- **2 邀请码**：`INVITE-ALPHA`（企鹅，未绑定）、`INVITE-BRAVO`（仓鼠，已绑定给 user_10002）。
- **2 动物类型**：企鹅 `penguin` 🐧、仓鼠 `hamster` 🐹。
- 重置：`npm run reset` 或 `curl -X POST http://127.0.0.1:3000/api/reset`（或重启进程）。

## dev / preview profile

| 维度 | dev（默认，端口 3000） | preview（端口 3001） |
|---|---|---|
| 登录 | fixture code + stub code + `dev:<openid>` 通配 | 仅 fixture code + stub code（严格） |
| 响应额外字段 | `profile` | `profile` + `requestId` |

## 模拟时钟（`/api/interaction` 时段判定，供 E2E 确定性断言）

- 所有时段/频次判定以 **UTC+8** 为权威；服务端时钟默认是一个**确定性值**
  （`2026-01-15T12:00:00+08:00`，落在 11:30–13:00 喂食时段内，故客户端 feed happy path 开箱即用）。
- 覆盖方式：请求头 `X-Mock-Now: <RFC3339 或 epoch ms>`（单次）或环境变量 `MOCK_DEFAULT_NOW`（全局）。
- 例：测「非时段喂食」`curl -X POST .../api/interaction -H 'X-Mock-Now: 2026-01-15T10:00:00+08:00' ...`。
- M8 语料的 `daypart` / `tier` 同样由该时钟 + 结算前满意度推导；天气由 `X-Mock-Weather` 头覆盖（低权重加权，缺省 = 不约束）。