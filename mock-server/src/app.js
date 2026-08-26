'use strict';

const crypto = require('crypto');
const express = require('express');
const { Store } = require('./store');
const { ERRORS } = require('./errors');
const { DEFAULT_NOW } = require('./config');
const { SCENES } = require('./corpus');
const time = require('./time');

/**
 * Build the Express app (T1.2).
 *
 * Contract (matches the committed miniprogram client + docs/api.md):
 *   - success (2xx): body = { code: 0, message: 'ok', profile, ...payload }
 *   - error   (non-2xx): body = { code: '<STRING>', message: '...' , data? }
 *
 * `profile` is a resolved profile object (see profiles.js).
 */
function buildApp({ profile, defaultNow } = {}) {
  const app = express();
  const store = new Store();
  const nowDefault = defaultNow || DEFAULT_NOW;
  app.disable('x-powered-by');
  app.use(express.json());

  const rid = () => crypto.randomBytes(8).toString('hex');

  function ok(res, payload) {
    const body = { code: 0, message: 'ok', profile: profile.name, ...(payload || {}) };
    if (profile.includeRequestId) body.requestId = rid();
    return res.status(200).json(body);
  }
  function fail(res, errKey, data) {
    const e = ERRORS[errKey] || ERRORS.BAD_REQUEST;
    const body = { code: e.code, message: e.message, profile: profile.name };
    if (data) body.data = data;
    if (profile.includeRequestId) body.requestId = rid();
    return res.status(e.http).json(body);
  }

  // --- auth -------------------------------------------------------------
  function tokenFromReq(req) {
    let token = req.get('x-mock-token');
    const h = req.get('authorization') || '';
    if (!token && /^Bearer\s+/i.test(h)) token = h.replace(/^Bearer\s+/i, '').trim();
    return token || null;
  }
  function authUser(req) {
    const token = tokenFromReq(req);
    if (!token) return null;
    const userId = store.sessionUser(token);
    if (!userId) return null;
    return store.accountByUserId(userId) || { userId, openid: userId, nickname: 'unknown', bound: true };
  }
  const requireAuth = (req, res, next) => {
    const user = authUser(req);
    if (!user) return fail(res, 'AUTH_INVALID', { reason: 'missing_or_invalid_token' });
    req.user = user;
    next();
  };

  app.get('/', (req, res) => {
    res.json({
      name: 'anim-prison-mock-server',
      profile: profile.name,
      endpoints: routeMap(),
    });
  });
  app.get('/health', (req, res) => ok(res, { status: 'ok' }));

  // --- 1. login: WeChat code -> session stub -----------------------------
  app.post('/api/auth/login', (req, res) => {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) return fail(res, 'AUTH_INVALID', { reason: 'missing_code' });
    const c = code.trim();

    let account = store.accountByLoginCode(c) || store.accountByStubCode(c);

    // dev profile only: ad-hoc `dev:<openid>` identities for local client work.
    if (!account && !profile.strictLogin && c.startsWith('dev:')) {
      const openid = c.slice(4).trim();
      account = store.addAccount({
        userId: `dev_${openid}`,
        openid,
        nickname: 'dev账号',
        loginCode: c,
        bound: false,
      });
    }
    if (!account) return fail(res, 'AUTH_INVALID', { reason: 'unknown_code' });

    const token = store.createSession(account.userId);
    const bound = !!store.animalForUser(account.userId);
    return ok(res, {
      token,
      bound,
      user: {
        userId: account.userId,
        openid: account.openid,
        nickname: account.nickname,
        avatar: account.avatar || null,
      },
    });
  });

  // --- 2. invite code binding -------------------------------------------
  app.post('/api/bind', requireAuth, (req, res) => {
    const { inviteCode } = req.body || {};
    if (typeof inviteCode !== 'string' || !/^[A-Za-z0-9-]{6,}$/.test(inviteCode.trim())) {
      return fail(res, 'BIND_INVALID', { reason: 'format', hint: 'e.g. INVITE-ALPHA' });
    }
    const out = store.bind(req.user.userId, inviteCode.trim());
    if (out.error) return fail(res, out.error.code, out.data);
    return ok(res, { bound: true, animal: out.animal });
  });

  // --- 3. animal + map data ---------------------------------------------
  // M8: 随响应返回一条环境/主动语料（scene=enter，docs/corpus-system.md §3.6）。
  app.get('/api/animal', requireAuth, (req, res) => {
    const now = time.effectiveNow(req, nowDefault);
    const data = store.animalData(req.user.userId, { weather: weatherFromReq(req), now });
    if (!data) return fail(res, 'ANIMAL_NOT_FOUND');
    return ok(res, { animal: data.animal, map: data.map, bound: true, corpus: data.corpus });
  });

  // --- 3b. M8 环境/主动语料（P1 条件触发）--------------------------------
  // 进入牢房/地图/定时展示点拉一条；上下文键由服务端按当前档位/昼夜/天气/最近互动计算并回退。
  app.get('/api/corpus', requireAuth, (req, res) => {
    const scene = typeof req.query.scene === 'string' && SCENES.includes(req.query.scene) ? req.query.scene : 'enter';
    const now = time.effectiveNow(req, nowDefault);
    const corpus = store.environmentCorpus(req.user.userId, { scene, weather: weatherFromReq(req) }, now);
    if (!corpus) return fail(res, 'ANIMAL_NOT_FOUND');
    return ok(res, { corpus });
  });

  // --- 4. cafeteria interaction submit ----------------------------------
  // M8: 响应新增 corpus 字段（即时反馈语料，P0 必出，docs/corpus-system.md §3.6）。
  app.post('/api/interaction', requireAuth, (req, res) => {
    const { action, animalId, requestId } = req.body || {};
    const now = time.effectiveNow(req, nowDefault);
    const out = store.interact(req.user.userId, { action, animalId, requestId }, now, weatherFromReq(req));
    if (out.error) return fail(res, out.error.code, out.data);
    return ok(res, out.result);
  });

  // --- 5. rating / satisfaction query -----------------------------------
  app.get('/api/rating', requireAuth, (req, res) => {
    const rating = store.rating(req.user.userId);
    if (!rating) return fail(res, 'RATING_NOT_FOUND');
    return ok(res, { rating });
  });

  // --- ops: hot-reload corpus config (M8 §3.4：条目/去重参数/AI 配额可热更) ----
  app.post('/api/corpus/reload', requireAuth, (req, res) => {
    const body = req.body || {};
    if (body.items !== undefined && !Array.isArray(body.items)) {
      return fail(res, 'BAD_REQUEST', { reason: 'items_must_be_array' });
    }
    const described = store.corpus.replaceConfig(body);
    return ok(res, { corpusConfig: described });
  });

  // --- ops: reset fixtures ------------------------------------------------
  app.post('/api/reset', (req, res) => {
    store.reset();
    return ok(res, store.summary());
  });

  app.use((req, res) => fail(res, 'BAD_REQUEST', { path: req.originalUrl }));

  app.locals.store = store;
  return app;
}

function routeMap() {
  return [
    'GET  /health',
    'POST /api/auth/login',
    'POST /api/bind',
    'GET  /api/animal',
    'GET  /api/corpus',
    'POST /api/interaction',
    'GET  /api/rating',
    'POST /api/corpus/reload',
    'POST /api/reset',
  ];
}

/** M8 天气修饰（M11 未上线：mock 期由 X-Mock-Weather 头覆盖，缺省 = 不约束，D6 边缘定位）。 */
function weatherFromReq(req) {
  const w = req.get('x-mock-weather');
  return w && w.trim() ? w.trim() : null;
}

module.exports = { buildApp };