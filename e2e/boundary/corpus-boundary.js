#!/usr/bin/env node
'use strict';
/*
 * M8 语料服务端边界探测（ANIM-15 测试交付物，配套 smoke.js 未覆盖的边界）。
 * 直接对 mock-server（dev profile）发 HTTP。响应为扁平包：
 *   成功 { code: 0, ...payload } / 失败 { code: '<CODE>', ... }（非 2xx）。
 *
 * 覆盖（对照 docs/corpus-system.md）：
 *   B1 P0 必出：50 连发同上下文 → text 恒非空；去重有效性下限（unique≥10、相邻重复≤12）。
 *      §2.3 兜底：同 ctx 桶饱和后放宽回退允许重复（设计行为），断言取其边界而非零重复。
 *   B1b 观测：AI 默认关（aiQuota.enabled=false）时，兜底路径（levels2+3 过滤仅 isExpired）
 *      会选中 source=ai 条目 → 50 连发中 ai 出现数 ≥1（(0.8)^40≈0.13% 失手率，P2 观测项）。
 *   B2 小池+滑窗2：桶未饱和前 3 连发两两不同（主路径 valid=池\窗口∪桶，确定性）。
 *   B3 池耗尽回退：小池全进窗+桶后仍必出非空（§2.3 放宽/无去重兜底）。
 *   B4' 24h TTL：次日（>24h）同上下文 3 连发两两不同（桶过期 → relaxed 路径确定性）。
 *      实现注：TTL 按条目惰性清理（≥ttl 即删）；relaxed 兜底仅滤桶不滤滑窗。
 *   B4 daypart 边界 8 点：06:59/07:00/09:59/10:00/14:59/15:00/21:59/22:00。
 *   B5 tier 边界：喂食 55→61→67→70（日 ΔS 上限 15），响应 ctx.tier mid/mid/mid→high（70 线，§3.3/§5.3）。
 *   B6 AI 配额：每账号池 5 条（4 rule+1 ai），5 连发=确定性全排列 → ai 恰 1/账号（perAccount 隔离）；
 *      perAccountPerDay=0 与 enabled=false 各 4 连发（新池新 ctx）→ ai 恰 0。
 *      注：滑窗 lastPlayed 为动物级全局，每阶段换新 itemId 池保证主路径 valid 集干净。
 *   B7 未绑定账号 GET /api/corpus → ANIMAL_NOT_FOUND（非 2xx）。
 *   B8 非法 weather 头不炸 + ctx 回显；非法 scene 回退 enter。
 *   B9 互动响应 corpus：scene=feedback、interaction=action（feed/play/exercise，§3.6）。
 * 收尾：POST /api/reset（重建 fixtures + corpus engine，配置/状态归默认）。
 * 用法：MOCK_BASE=http://127.0.0.1:3001 node e2e/boundary/corpus-boundary.js
 */
const assert = require('node:assert');

const BASE = process.env.MOCK_BASE || 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ok   ${name}`);
}
function bad(name, e) {
  failed += 1;
  console.error(`  FAIL ${name}: ${e && e.message ? e.message : e}`);
}
async function check(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(name, e);
  }
}

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    /* non-JSON */
  }
  return { status: res.status, json };
}
async function login(code) {
  const r = await api('/api/auth/login', { method: 'POST', body: { code } });
  assert.ok(r.status === 200, `login ${code} -> ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json.token;
}
async function bind(token, code) {
  const r = await api('/api/bind', { method: 'POST', token, body: { inviteCode: code } });
  assert.ok(r.status === 200, `bind ${code} -> ${r.status}: ${JSON.stringify(r.json)}`);
}
async function corpus(token, { scene, now, weather } = {}) {
  const q = scene ? `?scene=${scene}` : '';
  const headers = {
    ...(now ? { 'x-mock-now': now } : {}),
    ...(weather ? { 'x-mock-weather': weather } : {}),
  };
  const r = await api(`/api/corpus${q}`, { token, headers });
  assert.ok(r.status === 200, `corpus -> ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json.corpus;
}
async function interact(token, action, { now } = {}) {
  const headers = now ? { 'x-mock-now': now } : {};
  const r = await api('/api/interaction', {
    method: 'POST',
    token,
    body: { action, requestId: `bnd-${action}-${Math.random().toString(36).slice(2)}` },
    headers,
  });
  assert.ok(r.status === 200, `interaction ${action} -> ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json;
}

const SMALL = [
  { id: 'bnd_a', animalType: 'penguin', text: '（边界 A）', source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
  { id: 'bnd_b', animalType: 'penguin', text: '（边界 B）', source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
  { id: 'bnd_c', animalType: 'penguin', text: '（边界 C）', source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
];
const POOL5 = (type, tag) => [
  { id: `bnd_${tag}_${type}_r1`, animalType: type, text: `（${tag} ${type} 规则 1）`, source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
  { id: `bnd_${tag}_${type}_r2`, animalType: type, text: `（${tag} ${type} 规则 2）`, source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
  { id: `bnd_${tag}_${type}_r3`, animalType: type, text: `（${tag} ${type} 规则 3）`, source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
  { id: `bnd_${tag}_${type}_r4`, animalType: type, text: `（${tag} ${type} 规则 4）`, source: 'rule', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
  { id: `bnd_${tag}_${type}_ai`, animalType: type, text: `（${tag} ${type} AI）`, source: 'ai', pool: 'personality', tags: {}, weight: 1.0, valid_from: null, valid_to: null },
];

(async () => {
  // ===== 阶段一：默认配置 =====
  await api('/api/reset', { method: 'POST' });
  let t1 = await login('dev:u1');
  await bind(t1, 'INVITE-ALPHA'); // 企鹅（皮皮），初始 satisfaction 55

  await check('B1 P0 必出：50 连发同上下文 text 恒非空；去重下限（unique≥10、相邻重复≤12）', async () => {
    let prev = null;
    let adjDup = 0;
    const ids = [];
    for (let i = 0; i < 50; i += 1) {
      const c = await corpus(t1); // scene 默认 enter，时钟 12:00 → noon/mid
      assert.ok(typeof c.text === 'string' && c.text.length > 0, `第 ${i + 1} 次 text 空`);
      assert.ok(/^corp_/.test(c.itemId || ''), `itemId 格式异常: ${c.itemId}`);
      assert.ok(['rule', 'ai'].includes(c.source), `source 异常: ${c.source}`);
      if (c.itemId === prev) adjDup += 1;
      ids.push(c.itemId);
      prev = c.itemId;
    }
    const uniq = new Set(ids).size;
    assert.ok(uniq >= 10, `50 次仅 ${uniq} 条不同（去重退化）`);
    assert.ok(adjDup <= 12, `相邻重复 ${adjDup} 次（超过 §2.3 兜底预期，去重失效嫌疑）`);
    console.log(`       (去重统计: unique=${uniq}, 相邻重复=${adjDup}/49 —— §2.3 允许桶饱和后兜底重复)`);
  });

  await check('B1b [观测] AI 默认关时兜底路径可出 source=ai（50 连发 ai≥1，P2）', async () => {
    let ai = 0;
    for (let i = 0; i < 50; i += 1) {
      const c = await corpus(t1, { now: '2026-04-01T12:00:00+08:00' });
      if (c.source === 'ai') ai += 1;
    }
    assert.ok(ai >= 1, '50 连发无 ai —— 与预期兜底泄漏不符（池/权重变化时人工复核）');
    console.log(`       (ai 泄漏计数=${ai}/50，aiQuota.enabled=false；建议 P2：放宽/兜底路径补 aiAllowed 过滤)`);
  });

  // ===== 阶段二：小池 3 条 + 滑窗 2（热更 items+dedup）=====
  const rl = await api('/api/corpus/reload', {
    method: 'POST',
    token: t1,
    body: { items: SMALL, dedup: { window: 2, ctxTtlHours: 24 } },
  });
  assert.ok(rl.status === 200, `reload 小池 -> ${rl.status}`);

  await check('B2 小池+滑窗2：桶未饱和前 3 连发两两不同（§2.2 去重生效）', async () => {
    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      const c = await corpus(t1, { scene: 'enter', now: '2026-02-01T08:00:00+08:00' });
      assert.ok(['bnd_a', 'bnd_b', 'bnd_c'].includes(c.itemId), `意外 itemId ${c.itemId}`);
      assert.ok(!seen.includes(c.itemId), `第 ${i + 1} 次重复 ${c.itemId}（桶未饱和不应重复）`);
      seen.push(c.itemId);
    }
  });

  await check('B3 池耗尽回退：小池全进窗+桶后仍必出非空（§2.3 兜底永不空）', async () => {
    for (let i = 0; i < 5; i += 1) {
      const c = await corpus(t1, { scene: 'enter', now: '2026-02-01T08:00:00+08:00' });
      assert.ok(c.text && c.itemId, '耗尽后仍必出');
    }
  });

  await check("B4' 24h TTL：次日（>24h）同上下文 3 连发两两不同（桶过期清理，§2.2/§2.3）", async () => {
    // 实现语义（corpus.js）：TTL 按条目惰性清理（nowMs-ts ≥ ttl 即删）；桶过期后走
    // relaxed 路径（仅滤桶，不滤滑窗）→ R1 任取、R2 余 2、R3 余 1，3 连发两两不同（确定性）。
    // 若桶未清理（全部条目仍在）→ relaxed 空 → 无去重兜底，两两不同概率降至 2/9。
    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      // 2026-02-02T09:00 > 最晚前日条目 08:30 + 24h（TTL 边界已过）
      const c = await corpus(t1, { scene: 'enter', now: '2026-02-02T09:00:00+08:00' });
      assert.ok(['bnd_a', 'bnd_b', 'bnd_c'].includes(c.itemId), `意外 itemId ${c.itemId}`);
      assert.ok(!seen.includes(c.itemId), `次日第 ${i + 1} 次重复 ${c.itemId}（TTL 未清理，relaxed 退化为无去重）`);
      seen.push(c.itemId);
    }
  });

  await check('B4 daypart 边界 8 点映射正确（§3.3）', async () => {
    const cases = [
      ['2026-02-01T06:59:00+08:00', 'night'],
      ['2026-02-01T07:00:00+08:00', 'morning'],
      ['2026-02-01T09:59:00+08:00', 'morning'],
      ['2026-02-01T10:00:00+08:00', 'noon'],
      ['2026-02-01T14:59:00+08:00', 'noon'],
      ['2026-02-01T15:00:00+08:00', 'evening'],
      ['2026-02-01T21:59:00+08:00', 'evening'],
      ['2026-02-01T22:00:00+08:00', 'night'],
    ];
    for (const [now, want] of cases) {
      const c = await corpus(t1, { now });
      assert.strictEqual(c.ctx.daypart, want, `${now} -> ${c.ctx.daypart}（期望 ${want}）`);
    }
  });

  await check('B8 非法 weather 头不炸且 ctx 回显；非法 scene 回退 enter', async () => {
    const c1 = await corpus(t1, { weather: 'tornado' });
    assert.strictEqual(c1.ctx.weather, 'tornado');
    assert.ok(c1.text.length > 0);
    const c2 = await corpus(t1, { scene: 'bogus' });
    assert.strictEqual(c2.ctx.scene, 'enter');
    assert.ok(c2.text.length > 0);
  });

  // ===== 阶段三：重置回默认，tier/AI 配额/错误码 =====
  await api('/api/reset', { method: 'POST' });
  t1 = await login('dev:u1'); // reset 清会话，重登重绑
  await bind(t1, 'INVITE-ALPHA');
  const t2 = await login('code_user_10002'); // 预绑定 user_10002 → 仓鼠

  await check('B5 tier 边界：喂食 55→61→67→70（日 ΔS 上限 15 卡第三次为 3）跨 70 线 mid→high', async () => {
    // ΔS/feed=6，DAILY_DELTA_S_CAP=15：第三次仅 +3 → 55→61→67→70，恰落在 high 线（§3.3 high ≥70）。
    const seq = ['mid', 'mid', 'high'];
    for (let i = 0; i < 3; i += 1) {
      const r = await interact(t1, 'feed', { now: '2026-01-15T12:00:00+08:00' });
      assert.strictEqual(r.corpus.ctx.tier, seq[i], `第 ${i + 1} 次喂食 tier=${r.corpus.ctx.tier}（期望 ${seq[i]}）`);
    }
    const an = await api('/api/animal', { token: t1 });
    assert.strictEqual(an.json.animal.mood, 70, `喂食三次后 mood=${an.json.animal.mood}（期望 70：日 ΔS 上限 15）`);
    const c = await corpus(t1, { now: '2026-01-15T12:30:00+08:00' });
    assert.strictEqual(c.ctx.tier, 'high');
  });

  await check('B6 AI 配额：池5条 5 连发=全排列 → 两账号各 ai 恰 1（perAccount 隔离）', async () => {
    const rl2 = await api('/api/corpus/reload', {
      method: 'POST',
      token: t1,
      body: {
        aiQuota: { enabled: true, perAnimalPerDay: 99, perAccountPerDay: 1 },
        items: [...POOL5('penguin', 'v1'), ...POOL5('hamster', 'v1')],
      },
    });
    assert.ok(rl2.status === 200, `reload 池5 -> ${rl2.status}`);
    for (const [tk, label] of [[t1, '账号A(企鹅)'], [t2, '账号B(仓鼠)']]) {
      let ai = 0;
      for (let i = 0; i < 5; i += 1) {
        const c = await corpus(tk, { scene: 'map', now: '2026-03-01T10:00:00+08:00' });
        if (c.source === 'ai') ai += 1;
      }
      assert.strictEqual(ai, 1, `${label} ai=${ai}（期望恰 1：5 连发确定性全排列含唯一 ai 条）`);
    }
  });
  // 注：滑窗 lastPlayed 是动物级全局（非按 ctx），每阶段用新 itemId 池保证主路径 valid 集干净（确定性全排列前提）。
  await check('B6 配额0：perAccountPerDay=0 → 4 连发（新池新 ctx）ai 恰 0', async () => {
    const r0 = await api('/api/corpus/reload', { method: 'POST', token: t1, body: { items: POOL5('penguin', 'v2') } });
    assert.ok(r0.status === 200, `reload v2 -> ${r0.status}`);
    const r = await api('/api/corpus/reload', { method: 'POST', token: t1, body: { aiQuota: { perAccountPerDay: 0 } } });
    assert.ok(r.status === 200, `reload quota0 -> ${r.status}`);
    let ai = 0;
    for (let i = 0; i < 4; i += 1) {
      const c = await corpus(t1, { scene: 'timed', now: '2026-03-01T11:00:00+08:00' });
      if (c.source === 'ai') ai += 1;
    }
    assert.strictEqual(ai, 0, '配额 0 仍出 ai');
  });
  await check('B6 关断：enabled=false → 4 连发（新池新 ctx）ai 恰 0；配置回显合并', async () => {
    const r0 = await api('/api/corpus/reload', { method: 'POST', token: t1, body: { items: POOL5('penguin', 'v3') } });
    assert.ok(r0.status === 200, `reload v3 -> ${r0.status}`);
    const r = await api('/api/corpus/reload', { method: 'POST', token: t1, body: { aiQuota: { enabled: false } } });
    assert.ok(r.status === 200, `reload off -> ${r.status}`);
    let ai = 0;
    for (let i = 0; i < 4; i += 1) {
      const c = await corpus(t1, { scene: 'rating', now: '2026-03-01T16:00:00+08:00' });
      if (c.source === 'ai') ai += 1;
    }
    assert.strictEqual(ai, 0, '关断仍出 ai');
    const rl3 = await api('/api/corpus/reload', { method: 'POST', token: t1, body: { aiQuota: { enabled: true, perAnimalPerDay: 5, perAccountPerDay: 20 } } });
    assert.deepStrictEqual(rl3.json.corpusConfig.aiQuota, { enabled: true, perAnimalPerDay: 5, perAccountPerDay: 20 });
  });

  await check('B7 未绑定账号 GET /api/corpus → ANIMAL_NOT_FOUND（非 2xx）', async () => {
    const t3 = await login('dev:u3');
    const r = await api('/api/corpus?scene=enter', { token: t3 });
    assert.ok(r.status >= 400, `status=${r.status}`);
    assert.strictEqual(r.json.code, 'ANIMAL_NOT_FOUND');
  });

  await check('B9 互动响应 corpus：scene=feedback 且 interaction=action（§3.6）', async () => {
    for (const action of ['feed', 'play', 'exercise']) {
      // 新日期（B5 已用尽 2026-01-15 的 3 次喂食；喂食当日限 3）
      const r = await interact(t1, action, { now: '2026-01-16T12:05:00+08:00' });
      assert.strictEqual(r.corpus.ctx.scene, 'feedback', `${action}: scene=${r.corpus.ctx.scene}`);
      assert.strictEqual(r.corpus.ctx.interaction, action, `${action}: interaction=${r.corpus.ctx.interaction}`);
      assert.ok(r.corpus.text.length > 0, `${action}: text 空`);
    }
  });

  // 收尾：reset 恢复默认（fixtures + corpus engine + 配置）
  await api('/api/reset', { method: 'POST' });

  console.log(`\ncorpus-boundary: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`corpus-boundary 崩溃: ${e.stack || e}`);
  process.exit(1);
});