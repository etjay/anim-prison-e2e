'use strict';

/**
 * Self-contained smoke test (npm run smoke).
 *
 * Boots the mock app in-process on an ephemeral port and drives the exact
 * client contract + gameplay interaction rules the stage2 E2E asserts on:
 *   - all 5 endpoints return the documented shape (flat success body)
 *   - string error codes (AUTH_INVALID / BIND_INVALID / BIND_DUPLICATE /
 *     ANIMAL_NOT_FOUND / INTERACTION_* / RATING_NOT_FOUND)
 *   - feed time-window gating, daily limits, w_t, requestId idempotency
 *   - dev vs preview profile differences
 *
 * Exits 0 on all-pass, 1 otherwise.
 */
const { buildApp } = require('../src/app');
const { resolveProfile } = require('../src/profiles');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

async function main() {
  const profile = resolveProfile(process.env.MOCK_PROFILE || 'dev');
  const app = buildApp({ profile });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const H = { 'Content-Type': 'application/json' };
  const j = (r) => r.json();
  const post = (path, body, token, extra) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: Object.assign({}, H, token ? { Authorization: `Bearer ${token}` } : {}, extra || {}),
      body: JSON.stringify(body),
    }).then(j);
  const get = (path, token, extra) =>
    fetch(`${base}${path}`, {
      headers: Object.assign({}, token ? { Authorization: `Bearer ${token}` } : {}, extra || {}),
    }).then(j);

  // --- login ---
  let r = await post('/api/auth/login', { code: 'stub-wechat-code' });
  check('login: stub code -> token + bound=false', r.code === 0 && !!r.token && r.bound === false, r);
  const tokenA = r.token;

  r = await post('/api/auth/login', { code: 'code_user_10002' });
  check('login: pre-bound user_10002 -> bound=true', r.code === 0 && r.bound === true, r);
  const tokenB = r.token;

  r = await get('/api/animal', tokenB);
  check(
    'animal: pre-bound user_10002 -> pre-seeded hamster + map.cells',
    r.code === 0 && r.animal.type === 'hamster' && r.animal.species === '仓鼠' && Array.isArray(r.map.cells),
    r
  );

  r = await post('/api/auth/login', { code: 'code_nope' });
  check('login: unknown code -> AUTH_INVALID (non-2xx)', r.code === 'AUTH_INVALID', r);

  r = await get('/api/animal', 'nope');
  check('animal: invalid token -> AUTH_INVALID', r.code === 'AUTH_INVALID', r);

  // --- unbound user: animal/rating ---
  r = await get('/api/animal', tokenA);
  check('animal: unbound -> ANIMAL_NOT_FOUND', r.code === 'ANIMAL_NOT_FOUND', r);
  r = await get('/api/rating', tokenA);
  check('rating: unbound -> RATING_NOT_FOUND', r.code === 'RATING_NOT_FOUND', r);

  // --- bind errors ---
  r = await post('/api/bind', { inviteCode: 'x' }, tokenA);
  check('bind: bad format -> BIND_INVALID', r.code === 'BIND_INVALID', r);
  r = await post('/api/bind', { inviteCode: 'INVITE-ZZZZ' }, tokenA);
  check('bind: not found -> BIND_INVALID', r.code === 'BIND_INVALID', r);
  r = await post('/api/bind', { inviteCode: 'INVITE-BRAVO' }, tokenA);
  check('bind: pre-bound INVITE-BRAVO -> BIND_DUPLICATE', r.code === 'BIND_DUPLICATE', r);

  // --- happy path: bind INVITE-ALPHA ---
  r = await post('/api/bind', { inviteCode: 'INVITE-ALPHA' }, tokenA);
  check(
    'bind: happy path -> animal penguin',
    r.code === 0 && r.bound === true && r.animal.type === 'penguin' && r.animal.species === '企鹅' && r.animal.emoji === '🐧',
    r
  );
  r = await post('/api/bind', { inviteCode: 'INVITE-ALPHA' }, tokenA);
  check('bind: user already bound (2nd) -> BIND_DUPLICATE', r.code === 'BIND_DUPLICATE', r);

  // --- animal + map ---
  r = await get('/api/animal', tokenA);
  check(
    'animal: bound -> animal + map.cells',
    r.code === 0 && r.animal && Array.isArray(r.map.cells) && r.map.cells.length > 0 && typeof r.animal.mood === 'number',
    r
  );

  // --- interaction: feed success (default now = 12:00, in window) ---
  r = await post('/api/interaction', { action: 'feed' }, tokenA);
  check(
    'interaction: feed -> ok + deltaS/points/w_t/remaining',
    r.code === 0 && r.ok === true && r.w_t === 1.5 && r.deltaS === 6 && typeof r.points === 'number' && r.remaining === 2,
    r
  );
  const afterFeed = r.satisfaction;

  r = await post('/api/interaction', { action: 'nope' }, tokenA);
  check('interaction: invalid action -> INTERACTION_FAILED', r.code === 'INTERACTION_FAILED', r);

  // --- rating reflects interaction ---
  r = await get('/api/rating', tokenA);
  check(
    'rating: score/satisfaction/count/points + count=1',
    r.code === 0 &&
      r.rating &&
      typeof r.rating.score === 'number' &&
      r.rating.satisfaction === afterFeed &&
      r.rating.count === 1 &&
      typeof r.rating.points === 'number',
    r
  );

  // --- feed time window: outside all 3 windows -> INTERACTION_NOT_IN_WINDOW ---
  r = await post('/api/interaction', { action: 'feed' }, tokenA, { 'X-Mock-Now': '2026-01-15T10:00:00+08:00' });
  check('interaction: feed @10:00 (out of window) -> INTERACTION_NOT_IN_WINDOW', r.code === 'INTERACTION_NOT_IN_WINDOW', r);

  // --- daily limit: reset, then feed 3x ok, 4th -> INTERACTION_DAILY_LIMIT ---
  await post('/api/reset', {});
  const tC = (await post('/api/auth/login', { code: 'code_user_10001' })).token;
  await post('/api/bind', { inviteCode: 'INVITE-ALPHA' }, tC);
  let last = await post('/api/interaction', { action: 'feed' }, tC);
  for (let i = 0; i < 2; i++) last = await post('/api/interaction', { action: 'feed' }, tC);
  check('interaction: 3rd feed ok, remaining=0', last.code === 0 && last.remaining === 0, last);
  r = await post('/api/interaction', { action: 'feed' }, tC);
  check('interaction: 4th feed -> INTERACTION_DAILY_LIMIT', r.code === 'INTERACTION_DAILY_LIMIT', r);

  // --- requestId idempotency: same requestId twice -> no double count ---
  await post('/api/reset', {});
  const tD = (await post('/api/auth/login', { code: 'code_user_10001' })).token;
  await post('/api/bind', { inviteCode: 'INVITE-ALPHA' }, tD);
  const req1 = { action: 'feed', requestId: 'r-123' };
  const first = await post('/api/interaction', req1, tD);
  const dup = await post('/api/interaction', req1, tD);
  const ratAfter = (await get('/api/rating', tD)).rating;
  check(
    'interaction: duplicate requestId idempotent, no double count',
    first.code === 0 && dup.code === 0 && dup.idempotent === true && dup.deltaS === first.deltaS && ratAfter.count === 1,
    { first, dup, ratAfter }
  );

  // --- exercise w_t: suggested (15:00) vs other (12:00) ---
  await post('/api/reset', {});
  const tE = (await post('/api/auth/login', { code: 'code_user_10001' })).token;
  await post('/api/bind', { inviteCode: 'INVITE-ALPHA' }, tE);
  const exSuggested = await post('/api/interaction', { action: 'exercise' }, tE, { 'X-Mock-Now': '2026-01-15T15:30:00+08:00' });
  const exOther = await post('/api/interaction', { action: 'exercise' }, tE, { 'X-Mock-Now': '2026-01-15T12:00:00+08:00' });
  check(
    'interaction: exercise w_t 1.2 (suggested) vs 1.0 (other)',
    exSuggested.code === 0 && exSuggested.w_t === 1.2 && exOther.code === 0 && exOther.w_t === 1.0,
    { exSuggested, exOther }
  );

  // --- play night (02:00) w_t 0.8 vs day (12:00) w_t 1.0 ---
  const plNight = await post('/api/interaction', { action: 'play' }, tE, { 'X-Mock-Now': '2026-01-15T02:00:00+08:00' });
  const plDay = await post('/api/interaction', { action: 'play' }, tE, { 'X-Mock-Now': '2026-01-15T12:00:00+08:00' });
  check(
    'interaction: play w_t 0.8 (night) vs 1.0 (day)',
    plNight.code === 0 && plNight.w_t === 0.8 && plDay.code === 0 && plDay.w_t === 1.0,
    { plNight, plDay }
  );

  // --- reset ---
  r = await post('/api/reset', {});
  check('reset: POST /api/reset -> 200 + summary', r.code === 0 && Array.isArray(r.accounts) && Array.isArray(r.inviteCodes), r);

  // --- preview profile specifics ---
  if (profile.name === 'preview') {
    const papp = buildApp({ profile });
    const pserver = papp.listen(0, '127.0.0.1');
    await new Promise((rr) => pserver.once('listening', rr));
    const pbase = `http://127.0.0.1:${pserver.address().port}`;
    const pl = await fetch(`${pbase}/api/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ code: 'code_user_10001' }) }).then(j);
    const pw = await fetch(`${pbase}/api/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ code: 'dev:xyz' }) }).then(j);
    check('preview: real login carries requestId', pl.code === 0 && !!pl.requestId, pl);
    check('preview: strict login rejects dev: wildcard -> AUTH_INVALID', pw.code === 'AUTH_INVALID', pw);
    pserver.close();
  } else {
    const rDev = await post('/api/auth/login', { code: 'dev:abc' });
    check('dev: wildcard dev:<openid> accepted', rDev.code === 0 && rDev.bound === false, rDev);
  }

  server.close();
  console.log(`\nsmoke: ${passed} passed, ${failed} failed (profile=${profile.name})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke error:', err);
  process.exit(1);
});