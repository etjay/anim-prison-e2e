# Animal Prison · Mock Server API（T1.2）—— stage2 E2E 断言对齐基准

> 范围：ANIM-3《搭建微信小程序E2E开发验证环境》一期 stage1，服务端 mock 环境。
> **本文件是 stage2 E2E 断言的对齐基准**：端点、入参、响应结构、错误码、fixtures、互动规则以本文件为准。
> 本 mock 的契约与**已提交的客户端 `miniprogram/` 代码**逐字段一致（客户端是主消费者），
> 并进一步对齐 `docs/gameplay/prison-interactions.md`（ANIM-13）的 `/api/interaction` 规格。
> 接口契约变更由服务端同步客户端开发工程师。

- 服务：`mock-server/`（Node/Express，纯内存，无持久化）。
- 地址：dev `http://127.0.0.1:3000`，preview `http://127.0.0.1:3001`（对应 `miniprogram/config/env.js` 的 `BASE_URLS`）。
- 认证：请求头 `Authorization: Bearer <token>`（客户端写法）；兼容 `X-Mock-Token: <token>`。
- 响应包络（与 `miniprogram/utils/request.js` 对齐：成功读顶层字段，失败读 `code`/`message`）：
  - 成功（2xx）：`{ "code": 0, "message": "ok", "profile": "<dev|preview>", ...payload }`
  - 失败（非 2xx）：`{ "code": "<STRING>", "message": "...", "profile": "...", "data"?: {...} }`
  - preview 的每个响应额外带 `requestId`（8 位 hex）。

## 端点总览

| # | 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|---|
| 1 | POST | `/api/auth/login` | 微信 code → session stub | 否 |
| 2 | POST | `/api/bind` | 邀请码绑定（一次性 + 重复绑定查重） | 是 |
| 3 | GET | `/api/animal` | 动物 + 地图数据（含环境语料 `corpus`，M8） | 是 |
| 4 | POST | `/api/interaction` | 食堂互动（喂食/放风/陪玩；响应含即时反馈语料 `corpus`，M8） | 是 |
| 5 | GET | `/api/rating` | 评分 / 满意度查询 | 是 |
| 6 | GET | `/api/corpus` | 环境/主动语料（M8，P1 条件触发） | 是 |
| — | POST | `/api/corpus/reload` | 语料配置热更（M8，运维） | 是 |
| — | POST | `/api/reset` | 重置 fixtures | 否 |
| — | GET | `/health` | 健康检查 | 否 |

---

## 1. 登录 `POST /api/auth/login`

**入参（JSON body）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是 | 登录码。客户端固定发 `stub-wechat-code`。dev 另支持 `dev:<openid>` 通配。 |

**成功（200）**

```json
{
  "code": 0, "message": "ok", "profile": "dev",
  "token": "mock_session_user_10001",
  "bound": false,
  "user": { "userId": "user_10001", "openid": "test_openid_0001", "nickname": "测试选手A", "avatar": "https://mock.local/avatar/a.png" }
}
```

- `bound`：该账号是否已绑定（客户端据此跳 `welcome` / `home`）。stub 登录默认映射到**未绑定**的 `user_10001` → `bound:false`。
- `code_user_10002` 已预绑 → `bound:true`。

**错误**：`AUTH_INVALID`（400，未知/空 code）。

**curl**
```bash
curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"code":"stub-wechat-code"}'
```

---

## 2. 邀请码绑定 `POST /api/bind`

**入参（JSON body）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `inviteCode` | string | 是 | 形如 `INVITE-ALPHA`（≥6 位，字母/数字/连字符）。 |

**成功（200，首次绑定）**

```json
{
  "code": 0, "message": "ok", "profile": "dev",
  "bound": true,
  "animal": { "id": "animal_user_10001", "name": "皮皮", "species": "企鹅", "type": "penguin", "emoji": "🐧", "satisfaction": 55, "mood": 55, "points": 0, "interactions": 0 }
}
```

**错误（stage2 E2E 断言分支）**

| 场景 | code | HTTP |
|---|---|---|
| 邀请码格式非法 / 不存在 | `BIND_INVALID` | 400 |
| **重复绑定：邀请码已被绑定** | `BIND_DUPLICATE` | 409 |
| 当前用户已绑定过动物 | `BIND_DUPLICATE` | 409 |

> 客户端 `bind` 页只区分 `BIND_INVALID`（错误邀请码，可重试）与 `BIND_DUPLICATE`（已绑定，不可重复）两类，`data.reason` 供进一步细分（`not_found` / `invite_already_bound` / `user_already_bound`）。

**curl**
```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"code":"stub-wechat-code"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
# 首次绑定成功
curl -s -X POST http://127.0.0.1:3000/api/bind -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"inviteCode":"INVITE-ALPHA"}'
# 重复绑定（已绑定的 INVITE-BRAVO）
curl -s -X POST http://127.0.0.1:3000/api/bind -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"inviteCode":"INVITE-BRAVO"}'
```

---

## 3. 动物 + 地图数据 `GET /api/animal`

**入参**：无（仅鉴权）。

**成功（200）**

```json
{
  "code": 0, "message": "ok", "profile": "dev",
  "animal": { "id": "animal_user_10001", "name": "皮皮", "species": "企鹅", "type": "penguin", "emoji": "🐧", "mood": 55, "satisfaction": 55, "points": 0, "interactions": 0 },
  "map": { "id": "campus_1", "name": "校园主地图", "cells": ["🌳", "🏠", "🍲", "🪺", "🌿", "🛖"] },
  "bound": true,
  "corpus": { "text": "（歪着头看你）", "source": "rule", "itemId": "corp_pengu_022", "ctx": { "scene": "enter", "tier": "mid", "daypart": "noon", "weather": null, "interaction": null, "recent": "idle" } }
}
```

- 客户端 `home` 页渲染 `animal.emoji` / `animal.name` / `animal.species` / `animal.mood` 与 `map.cells`。
- `corpus`（M8，ANIM-15）：环境/主动语料（`scene=enter`），服务端权威选择（上下文键/去重/回退/AI 配额）；客户端只渲染 `text`，契约见 `docs/corpus-system.md`。同上下文键 24h 内不重复同一句。
- 未绑定用户 → `ANIMAL_NOT_FOUND`（404）；客户端有内置 stub 兜底。

**curl**
```bash
curl -s http://127.0.0.1:3000/api/animal -H "Authorization: Bearer $TOKEN"
```

---

## 4. 食堂互动 `POST /api/interaction`

对齐 `docs/gameplay/prison-interactions.md`（ANIM-13）：时段门控、每日频次上限、w_t、ΔS/行为分、requestId 幂等。

> **M8 语料（已实现，ANIM-15）**：响应含 `corpus` 字段（互动后即时反馈语料，P0 必出），上下文 `scene=feedback`、`interaction=<action>`；环境/主动语料由 `GET /api/animal`（`scene=enter`）或 `GET /api/corpus`（`scene=enter|map|timed`）承载。完整契约/触发/去重/热更规格见 `docs/corpus-system.md`。

**入参（JSON body）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `animalId` | string | 否 | 动物 id（客户端从 `globalData.animal.id` 带出）；与当前绑定动物不符 → `INTERACTION_FAILED`。 |
| `action` | string | 是 | `feed` \| `exercise` \| `play`。 |
| `foodId` / `toyId` | string | 否 | 子项（食物/玩具）；mock 默认按「普通」喜厌结算，预留位。 |
| `requestId` | string | 否 | 客户端生成的幂等键；同动物同 requestId 重复提交 → 幂等返回原结果（不重复计数，含 `corpus`）。 |
| `X-Mock-Now`（头） | string | 否 | 覆盖判定用时钟（RFC3339 或 epoch ms），UTC+8 权威。 |
| `X-Mock-Weather`（头） | string | 否 | M8 天气修饰（M11 未上线，mock 期覆盖）：`sunny`/`rainy`/`overcast`/`snow`；缺省 = 不约束（低权重加权，非硬筛选）。 |

**成功（200）**

```json
{
  "code": 0, "message": "喂食成功", "profile": "dev",
  "ok": true, "deltaS": 6, "points": 6, "w_t": 1.5, "remaining": 2,
  "satisfaction": 61, "pointsTotal": 6, "animalId": "animal_user_10001", "action": "feed", "idempotent": false,
  "corpus": { "text": "（眼睛亮了）是要开饭了吗？", "source": "rule", "itemId": "corp_pengu_012", "ctx": { "scene": "feedback", "tier": "mid", "daypart": "noon", "weather": null, "interaction": "feed", "recent": "idle" } }
}
```

字段含义：
- `deltaS`：本次满意度增量（受每日 ΔS 上限 +15 约束，可能为 0）。
- `points`：本次行为分（`5 × w_t × c_S`，受每日行为分上限 50 约束，1 位小数）。
- `w_t`：本次时段权重（见下表）。
- `remaining`：本动作当日剩余次数（本动作结算后）。
- `satisfaction` / `pointsTotal`：结算后的累计值。
- `idempotent`：`true` 表示命中 requestId 幂等、返回原结果。
- `corpus`（M8）：即时反馈语料 `{ text, source, itemId, ctx }`；`ctx.tier` 按结算前满意度档位（低 0–29 / 中 30–69 / 高 70–100，对齐 ANIM-16 §1.4），`ctx.daypart` 为 UTC+8 四段（morning 07–10 / noon 10–15 / evening 15–22 / night 22–07）。同一上下文键 24h 内不重复同一句；AI 语料默认关（`source` 恒为 `rule`），见 `docs/corpus-system.md`。

**互动规则（E2E 断言基准）**

| 项 | feed（喂食） | exercise（放风） | play（陪玩） |
|---|---|---|---|
| 时段 | **硬门控**：仅 07:00–09:00 / 11:30–13:00 / 17:30–19:00（UTC+8），否则 `INTERACTION_NOT_IN_WINDOW` | 软：15:00–17:00 建议时段 w_t 1.2，否则 1.0（均可提交） | 软：22:00–07:00 夜间 w_t 0.8，白天 1.0（均可提交） |
| 每日上限/只 | 3 | 2 | 3 |
| 基础 ΔS | +6 | +5 | +5 |
| w_t | 1.5 | 1.2 / 1.0 | 1.0 / 0.8 |
| c_S | 按结算前满意度档位：≥80→1.2，≥60→1.0，否则 0.8 | 同左 | 同左 |
| 达上限 | `INTERACTION_DAILY_LIMIT` | 同左 | 同左 |

- 时段/日切以 **UTC+8** 为权威；跨日自动清零当日计数。
- 服务端时钟默认为确定性值 `2026-01-15T12:00:00+08:00`（在 11:30–13:00 喂食时段内）→ 客户端 feed happy path 开箱即用；E2E 用 `X-Mock-Now` 覆盖以断言各时段分支。

**错误码**

| 场景 | code | HTTP |
|---|---|---|
| feed 非餐食时段 | `INTERACTION_NOT_IN_WINDOW` | 409 |
| 当日次数达上限 | `INTERACTION_DAILY_LIMIT` | 409 |
| 重复/在途（requestId 冲突未命中幂等缓存） | `INTERACTION_IN_PROGRESS` | 409 |
| 无已绑动物 / 非法 action / animalId 不符 | `INTERACTION_FAILED` | 400 |

**curl**
```bash
# 喂食（默认时钟在时段内）
curl -s -X POST http://127.0.0.1:3000/api/interaction -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"action":"feed"}'
# 放风建议时段（w_t 1.2）
curl -s -X POST http://127.0.0.1:3000/api/interaction -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -H 'X-Mock-Now: 2026-01-15T15:30:00+08:00' -d '{"action":"exercise"}'
# 非时段喂食（应 INTERACTION_NOT_IN_WINDOW）
curl -s -X POST http://127.0.0.1:3000/api/interaction -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -H 'X-Mock-Now: 2026-01-15T10:00:00+08:00' -d '{"action":"feed"}'
# 幂等：同 requestId 两次
curl -s -X POST http://127.0.0.1:3000/api/interaction -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"action":"feed","requestId":"r-1"}'
```

---

## 5. 评分 / 满意度查询 `GET /api/rating`

**入参**：无（仅鉴权）。

**成功（200）**

```json
{
  "code": 0, "message": "ok", "profile": "dev",
  "rating": { "score": 3.1, "satisfaction": 61, "count": 1, "points": 6 }
}
```

- `score`：0–5 星（= `satisfaction / 20`，1 位小数）。
- `satisfaction`（S）：0–100 满意度（随互动 ΔS 更新）。
- `count`：累计互动次数。
- `points`（P）：累计行为分（随互动更新）。
- 客户端 `canteen` 页读 `rating.score` / `rating.satisfaction` / `rating.count`；E2E 可进一步断言 `points` 与互动后 `satisfaction` 变化。

**错误**：未绑定 → `RATING_NOT_FOUND`（404）。

**curl**
```bash
curl -s http://127.0.0.1:3000/api/rating -H "Authorization: Bearer $TOKEN"
```

---

## 6. 语料端点（M8，ANIM-15）

> 规格全文：`docs/corpus-system.md`（v1.0 定稿）。服务端权威：上下文键计算 / 查池 / 去重 / 回退 / AI 配额全在服务端；客户端只渲染 `text`。

### 6.1 环境/主动语料 `GET /api/corpus`

**入参（query）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `scene` | string | 否 | `enter`（进牢房/首页）\| `map`（地图）\| `timed`（定时展示点）；缺省/非法 = `enter`。 |
| `X-Mock-Now`（头） | string | 否 | 同 §4。 |
| `X-Mock-Weather`（头） | string | 否 | 同 §4。 |

**成功（200）**

```json
{
  "code": 0, "message": "ok", "profile": "dev",
  "corpus": { "text": "（叼着小鱼干塞给你）给你给你！", "source": "rule", "itemId": "corp_pengu_008", "ctx": { "scene": "map", "tier": "high", "daypart": "noon", "weather": null, "interaction": "feed", "recent": "active" } }
}
```

- 上下文键 = `scene × tier × daypart × weather × interaction`（`interaction` = 当日最近一次互动类型，无 = null；`recent` = 近 3 日互动频率 active/idle）；服务端按 条件池 → 档位池 → 性格通用池 → 物种通用池 逐级回退，**任意上下文必出 ≥1 条**。
- 去重：per-animal 最近已播 ID 滑窗（默认 20 条）+ 同上下文键 24h（UTC+8 日切）不重复同一句。
- `source`：`rule`（规则语料）/ `ai`（AI 语料，P2 默认关，feature flag 热更即时关断）。

**错误**：未绑定 → `ANIMAL_NOT_FOUND`（404）。

**curl**
```bash
curl -s "http://127.0.0.1:3000/api/corpus?scene=map" -H "Authorization: Bearer $TOKEN"
```

### 6.2 语料配置热更 `POST /api/corpus/reload`（运维）

**入参（JSON body，均为可选，缺省保留现值）**

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 全量替换语料条目（`corpus_item`：id/species/animalType/text/source/pool/tags/weight/valid_from/valid_to）。 |
| `conditionTag` | object | 条件标签字典。 |
| `dedup` | object | 去重策略 `{ window, ctxTtlHours, fallbackOrder }`。 |
| `aiQuota` | object | AI 配额 `{ enabled, perAnimalPerDay, perAccountPerDay }`（默认 `enabled:false`、5 条/日/只、20 条/日/账号）。 |

**成功（200）**：返回热更后的配置摘要 `{ corpusConfig: { itemCount, conditionTag, dedup, aiQuota } }`。

**curl**
```bash
# 打开 AI 语料灰度（配额 5/20）
curl -s -X POST http://127.0.0.1:3000/api/corpus/reload -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"aiQuota":{"enabled":true}}'
```

---

## 运维端点

- `POST /api/reset`：重置到默认 fixtures（等价 `npm run reset` 的在线部分）；成功返回 fixtures 摘要。
- `GET /health`：`{ "code":0, "message":"ok", "profile":"dev", "status":"ok" }`。

---

## 错误码汇总

| code | HTTP | 触发端点 | 含义 |
|---|---|---|---|
| 0 | 200 | 全部 | 成功 |
| `AUTH_INVALID` | 400 / 401 | 登录 / 全部受保护端点 | 登录码无效 / token 缺失或无效 |
| `BIND_INVALID` | 400 | `/api/bind` | 邀请码格式非法或不存在 |
| `BIND_DUPLICATE` | 409 | `/api/bind` | 邀请码已被绑定 / 用户已绑定过动物 |
| `ANIMAL_NOT_FOUND` | 404 | `/api/animal`、`/api/corpus` | 用户无已绑动物 |
| `INTERACTION_NOT_IN_WINDOW` | 409 | `/api/interaction` | 喂食非餐食时段 |
| `INTERACTION_DAILY_LIMIT` | 409 | `/api/interaction` | 当日次数达上限 |
| `INTERACTION_IN_PROGRESS` | 409 | `/api/interaction` | 重复/在途互动 |
| `INTERACTION_FAILED` | 400 | `/api/interaction` | 无动物 / 非法 action / animalId 不符 |
| `RATING_NOT_FOUND` | 404 | `/api/rating` | 用户无已绑动物 |
| `BAD_REQUEST` | 400 | 通用 | 未匹配路由 / 通用错误 |

---

## Fixtures 清单（stage2 E2E 对齐基准）

> 与 `mock-server/src/fixtures.js` 一一对应。

### 测试账号（2）

| loginCode | userId | openid | nickname | 初始绑定 |
|---|---|---|---|---|
| `code_user_10001`（= stub `stub-wechat-code`） | `user_10001` | `test_openid_0001` | 测试选手A | 未绑定 |
| `code_user_10002` | `user_10002` | `test_openid_0002` | 测试选手B | 已绑定（仓鼠） |

### 邀请码（2：1 未绑定 / 1 已绑定）

| code | animalType | 初始状态 | 预绑用户 |
|---|---|---|---|
| `INVITE-ALPHA` | `penguin` | 未绑定 | — |
| `INVITE-BRAVO` | `hamster` | 已绑定 | `user_10002` |

### 动物类型（2）

| type | species | emoji | 基础满意度 |
|---|---|---|---|
| `penguin` | 企鹅 | 🐧 | 55 |
| `hamster` | 仓鼠 | 🐹 | 50 |

### 地图 cells

`["🌳", "🏠", "🍲", "🪺", "🌿", "🛖"]`

### 重置方式

- 单脚本：`cd mock-server && npm run reset`。
- 在线：`curl -s -X POST http://127.0.0.1:3000/api/reset`。
- 重启进程等价于重置（纯内存）。

---

## Profile

| 维度 | dev（默认，端口 3000） | preview（端口 3001） |
|---|---|---|
| 启动 | `npm run start:dev` / `MOCK_PROFILE=dev` | `npm run start:preview` / `MOCK_PROFILE=preview` |
| 登录 | fixture code + stub code + `dev:<openid>` 通配 | 仅 fixture code + stub code（严格） |
| 响应额外字段 | `profile` | `profile` + `requestId` |

---

## 假设与说明

- 微信登录为 stub：`code` 直接映射测试账号，不做真实 `code2session`；客户端固定发 `stub-wechat-code`。
- 状态纯内存；token 在进程生命周期内有效，`/api/reset` 会清除会话与互动状态。
- 喜厌/性格 k 在 mock 中按「普通 / k=1.0」结算（游戏侧性格配置表未落库），`foodId`/`toyId` 为预留位。
- M8 语料（ANIM-15）：条目/去重/AI 配额为内存配置（`mock-server/src/corpusData.js`），可经 `POST /api/corpus/reload` 热更；状态随 `/api/reset` 清零。AI 语料 P2 默认关（§4.3 三重控本），二期迁 MySQL 热更。
- 真实后端集成列为二期；本环境仅预留 baseURL 切换点（dev/preview profile）。