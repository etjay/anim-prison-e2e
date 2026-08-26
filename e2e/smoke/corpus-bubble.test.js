'use strict';
// M8 语料气泡 e2e（ANIM-15，docs/corpus-system.md v1.0 §3.6 契约）：
//   客户端只渲染 corpus.text；source/itemId/ctx 仅作调试徽标。
// 覆盖（客户端开发交接单 01a03d3d 指定的断言）：
//   C1 首页环境语料（P1，scene=enter）：GET /api/animal.corpus → data.corpus 契约字段
//      + 渲染层 .corpus-bubble / __text / __tag 可见 + 文案与数据层一致 + ctx 确定性值
//      （mock 默认时钟 2026-01-15T12:00+08:00 → daypart=noon；初始 satisfaction 55 → tier=mid）。
//   C2 食堂即时反馈（P0 必出，scene=feedback）：互动前气泡不显示（corpus=null，wx:if 兜底不白屏）
//      → onFeed 成功后 topPageData().corpus 契约 + .corpus-bubble 可见 + 文案一致。
//   C3 缺失/空值边界：corpus.text 空串 → 气泡 wx:if 不显示；恢复非空 → 重新显示（纯数据驱动渲染）。
//
// 编写规范同 happy-path：只 require('../helpers')；禁固定 sleep，一律 waitFor 轮询；
// S4 起经 navigateTo 入栈，用例内用栈顶 helper（topPageData/topTap/topRect/topText）。
const e2e = require('../helpers');

// mock-server 端口：与 happy-path 一致（E2E_MOCK_PORT 覆盖，本机 3001 / CI 3000）。
const MOCK_BASE = `http://127.0.0.1:${process.env.E2E_MOCK_PORT || 3000}`;

/** 重置 fixtures（POST /api/reset，T1.2 ops 接口）。 */
async function resetFixtures() {
  const res = await fetch(`${MOCK_BASE}/api/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`fixtures 重置失败: HTTP ${res.status}`);
}

/** 栈顶页 data（同 happy-path topPageData）。 */
async function topPageData() {
  return e2e.evaluate(() => {
    const ps = getCurrentPages();
    const p = ps[ps.length - 1];
    return { depth: ps.length, data: p ? p.data : null };
  });
}

/** 栈顶页方法调用（如食堂 onFeed）。 */
function topTap(method, ...args) {
  return e2e.evaluate(
    (n, a) => {
      const ps = getCurrentPages();
      const p = ps[ps.length - 1];
      if (!p) throw new Error('无顶层页');
      if (typeof p[n] !== 'function') throw new Error(`顶层页没有方法 ${n}`);
      const r = p[n](...a);
      return r === undefined ? true : r;
    },
    method,
    args,
  );
}

/** 栈顶页节点 rect（存在返回 rect，未挂载返回 null）。 */
async function topRect(selector) {
  return e2e.evaluate(
    (sel) =>
      new Promise((res) => {
        const ps = getCurrentPages();
        const p = ps[ps.length - 1];
        if (!p) return res(null);
        p.createSelectorQuery().select(sel).boundingClientRect().exec((q) => res(q && q.length ? q[0] : null));
      }),
    selector,
  );
}

/** 栈顶页 setData（C3 缺失/空值边界用；渲染层断言仍走 topRect 轮询）。 */
function topSetData(data) {
  return e2e.evaluate((d) => {
    const ps = getCurrentPages();
    const p = ps[ps.length - 1];
    if (!p) throw new Error('无顶层页');
    p.setData(d);
    return true;
  }, data);
}

// 冷启动首文件保护：本文件被 Jest 排序在 suite 首位时会承担冷 IDE 的
// automator.launch()（实测 ~9s）+ 首屏编译（热 Xvfb ~10s / 冷 40s+），远超 Jest 默认
// 5000ms hook 超时；其余文件复用暖隧道（~13ms）不受影响。显式给 bootstrap hook 一个
// 与 waitForAppReady 90s 上限相称的预算，避免首文件因 hook 超时被重试吞掉。
beforeAll(e2e.bootstrap, 120000);
beforeAll(async () => {
  // 对齐 app globalData.baseURL 到 mock-server（同 happy-path，防 dev env 回落 3001）。
  await e2e.setGlobalData({ baseURL: MOCK_BASE });
});
afterEach(e2e.autoShot);

/** corpus 契约断言（§3.6）：{ text(非空 string), source, itemId, ctx{scene,tier,daypart,weather,interaction,recent} }。 */
function expectCorpusContract(corpus, scene) {
  expect(corpus).toBeTruthy();
  expect(typeof corpus.text).toBe('string');
  expect(corpus.text.length).toBeGreaterThan(0);
  expect(corpus.source).toBe('rule'); // AI 默认关（§4/§6.4）：首发 source 恒 rule
  expect(typeof corpus.itemId).toBe('string');
  expect(corpus.itemId.length).toBeGreaterThan(0);
  expect(corpus.ctx).toBeTruthy();
  expect(corpus.ctx.scene).toBe(scene);
  expect(['low', 'mid', 'high']).toContain(corpus.ctx.tier);
  expect(['morning', 'noon', 'evening', 'night']).toContain(corpus.ctx.daypart);
}

// —— C1 首页环境语料（P1，scene=enter）——
test('C1 首页：环境语料气泡渲染（scene=enter，契约字段 + 渲染层 + 文案一致）', async () => {
  await resetFixtures();
  await e2e.stubLogin();
  await e2e.bindInvite('INVITE-ALPHA');

  // 首页 onShow → GET /api/animal；等动物数据 + 语料一起落地。
  const data = await e2e.waitFor(async () => {
    const d = await e2e.pageData();
    return d && d.animal && !d.loading && d.corpus ? d : null;
  }, { label: '首页动物数据 + 语料落地' });
  expect(data.animal.name).toBe('皮皮');

  // 数据层：契约字段 + 确定性上下文键（默认时钟 12:00 → noon；初始 S=55 → mid）。
  expectCorpusContract(data.corpus, 'enter');
  expect(data.corpus.ctx.daypart).toBe('noon');
  expect(data.corpus.ctx.tier).toBe('mid');

  // app.globalData.corpus 已同步（客户端实现约定）。
  const gCorpus = await e2e.evaluate(() => getApp().globalData.corpus);
  expect(gCorpus).toEqual(data.corpus);

  // 渲染层：气泡 + 正文 + 调试徽标均挂载且布局非空。
  for (const sel of ['.corpus-bubble', '.corpus-bubble__text', '.corpus-bubble__tag']) {
    const r = await e2e.visible(sel, { label: `首页 ${sel}` });
    expect(r.width).toBeGreaterThan(0);
  }

  // 文案断言（spike §4C：移植版拿不到 webview DOM 文本 → 文案 = 数据层值 + 渲染层 rect）：
  //   数据层 = data.corpus.text 非空（上方契约已断言）；
  //   渲染层 = .corpus-bubble__text 已挂载且布局非空（上方 rect 循环已断言）。
});

// —— C2 食堂即时反馈（P0 必出，scene=feedback）——
test('C2 食堂：onFeed 成功后即时反馈气泡（scene=feedback，互动前不显示、成功后显示）', async () => {
  // 归位首页并等待就绪（同 happy-path S4 自愈守卫的精简版：本用例从 C1 绑定态进入）。
  let p = await e2e.currentPath();
  if (p !== 'pages/home/home') await e2e.goto('/pages/home/home');
  await e2e.waitFor(async () => {
    const q = await e2e.currentPath();
    if (q !== 'pages/home/home') return null;
    const d = await e2e.pageData();
    return d && d.animal && !d.loading ? true : null;
  }, { label: 'C2 前置：首页就绪', timeoutMs: 20000 });

  await e2e.tap('gotoCanteen');
  await e2e.expectPage('/pages/canteen/canteen');

  // 互动前：corpus=null → 气泡 wx:if 不显示（不白屏：评分卡正常挂载）。
  const pre = await e2e.waitFor(async () => {
    const t = await topPageData();
    return t.data && t.data.loaded && t.data.rating ? t : null;
  }, { label: '食堂评分加载' });
  expect(pre.depth).toBe(2); // [home, canteen]
  expect(pre.data.corpus).toBeNull();
  expect(await topRect('.corpus-bubble')).toBeNull(); // wx:if false → 未挂载
  const card = await topRect('.card');
  expect(card && card.width).toBeGreaterThan(0); // 气泡缺席不影响页面主体

  // onFeed → 互动成功响应携带 corpus（P0 必出）。
  await topTap('onFeed');
  const t = await e2e.waitFor(async () => {
    const r = await topPageData();
    return r.data && r.data.resultMsg && r.data.corpus ? r : null;
  }, { label: '喂食成功 + 即时反馈语料落地' });
  const { data } = t;
  expect(data.resultMsg).toBe('喂食成功！小动物心情 +10');
  expect(data.error).toBe('');

  // 数据层：契约字段 + feedback 场景 + interaction=feed。
  expectCorpusContract(data.corpus, 'feedback');
  expect(data.corpus.ctx.interaction).toBe('feed');

  // 渲染层（spike §4C：文案 = 数据层值 + 渲染层 rect）：气泡/正文/调试徽标均挂载。
  //   数据层值：corpus.text 非空 + source='rule' + itemId 非空（上方契约已断言）。
  for (const sel of ['.corpus-bubble', '.corpus-bubble__text', '.corpus-bubble__tag']) {
    const r = await topRect(sel);
    expect(r && r.width).toBeGreaterThan(0);
  }
});

// —— C3 缺失/空值边界：wx:if 纯数据驱动（不白屏、可恢复）——
test('C3 边界：corpus.text 空串 → 气泡隐藏；恢复非空 → 重新显示', async () => {
  const p = await e2e.currentPath();
  expect(p).toBe('pages/canteen/canteen'); // 承接 C2 栈态 [home, canteen]

  // 空 text：wx:if="{{corpus && corpus.text}}" → 气泡卸载。
  await topSetData({ corpus: { text: '', source: 'rule', itemId: 'x' } });
  const hidden = await e2e.waitFor(async () => (await topRect('.corpus-bubble')) === null ? true : null, {
    label: '空 text → 气泡卸载',
    timeoutMs: 10000,
  });
  expect(hidden).toBe(true);
  const cardAfter = await topRect('.card');
  expect(cardAfter && cardAfter.width).toBeGreaterThan(0); // 主体不受影响

  // 恢复非空：重新显示且文案随数据更新。
  await topSetData({ corpus: { text: '（测试恢复语料）', source: 'rule', itemId: 't2' } });
  const restored = await e2e.waitFor(async () => topRect('.corpus-bubble'), {
    label: '恢复非空 → 气泡重新挂载',
    timeoutMs: 10000,
  });
  expect(restored && restored.width).toBeGreaterThan(0);
  // 文案随数据更新（数据层：corpus.text 已更新为恢复值；spike §4C 文案断言）。
  const after = await topPageData();
  expect(after.data.corpus.text).toBe('（测试恢复语料）');
});