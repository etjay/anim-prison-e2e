# mock-server（服务端 mock 环境）

> **边界说明（T1.1 协调约束）**：本目录由 **T1.2 / 服务端** 负责实现，客户端骨架（T1.1）仅创建目录占位，不写业务代码。

## 约定（与 miniprogram 骨架对齐）

客户端 `miniprogram/config/env.js` 与 `utils/request.js` 已按以下接口契约对接本地 mock（默认 `http://127.0.0.1:3000`）。T1.2 实现时需与之一致：

| # | 端点 | 方法 | 说明 | 约定错误码 |
|---|------|------|------|-----------|
| 1 | `/api/auth/login` | POST | stub 登录（code → session），返回 `{ token, bound }` | `AUTH_INVALID` |
| 2 | `/api/bind` | POST | 邀请码绑定（入参 `{ inviteCode }`），一次性绑定 + 重复绑定查重 | `BIND_INVALID`（错误码）/ `BIND_DUPLICATE`（重复） |
| 3 | `/api/animal` | GET | 动物 + 地图数据，返回 `{ animal, map: { cells: [] } }` | `ANIMAL_NOT_FOUND` |
| 4 | `/api/interaction` | POST | 食堂互动提交（入参 `{ animalId, action }`） | `INTERACTION_FAILED` |
| 5 | `/api/rating` | GET | 评分/满意度查询，返回 `{ score, satisfaction, count }` | `RATING_NOT_FOUND` |

## 交付物（T1.2）

- Node mock 服务（Express 或等价）实现上述 5 端点；
- fixtures：2 测试账号、2 邀请码（1 未绑定 / 1 已绑定）、2 动物类型；
- dev / preview 独立 profile（dev=3000，preview=3001，与客户端 `BASE_URLS` 对应）；
- API 文档（端点 / 入参 / 响应 / 错误码 / fixtures 清单）；
- 单脚本重置 fixtures。