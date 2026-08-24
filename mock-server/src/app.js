'use strict';

const crypto = require('crypto');
const express = require('express');
const { Store } = require('./store');
const { ERRORS } = require('./errors');
const { DEFAULT_NOW } = require('./config');
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
  app.get('/api/animal', requireAuth, (req, res) => {
    const data = store.animalData(req.user.userId);
    if (!data) return fail(res, 'ANIMAL_NOT_FOUND');
    return ok(res, { animal: data.animal, map: data.map, bound: true });
  });

  // --- 4. cafeteria interaction submit ----------------------------------
  app.post('/api/interaction', requireAuth, (req, res) => {
    const { action, animalId, requestId } = req.body || {};
    const now = time.effectiveNow(req, nowDefault);
    const out = store.interact(req.user.userId, { action, animalId, requestId }, now);
    if (out.error) return fail(res, out.error.code, out.data);
    return ok(res, out.result);
  });

  // --- 5. rating / satisfaction query -----------------------------------
  app.get('/api/rating', requireAuth, (req, res) => {
    const rating = store.rating(req.user.userId);
    if (!rating) return fail(res, 'RATING_NOT_FOUND');
    return ok(res, { rating });
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
    'POST /api/interaction',
    'GET  /api/rating',
    'POST /api/reset',
  ];
}

module.exports = { buildApp };