'use strict';

/**
 * M8 语料系统 · 服务端权威引擎（ANIM-15，docs/corpus-system.md v1.0 §1–§4）。
 *
 * 服务端权威：上下文键计算、查池、去重、回退、AI 配额**全在服务端**（§3.6）；
 * 客户端只渲染返回的 `text`。mock 期状态全内存（重启 / POST /api/reset 清零）。
 *
 * 分层（§1）：Layer1 规则语料（P0 兜底 + P1 条件触发，永不失效）
 *            Layer2 AI 语料（P2 灰度，默认关；命中优先，失败/超量无感回落 L1）。
 *
 * 上下文键（§2.2）= tier × daypart × weather × interaction（+ scene/recent 修饰）。
 *   - 核心二维 tier × daypart 精确查池（逐级回退：条件池 → 档位池 → 性格通用池 → 物种通用池）；
 *   - weather / interaction / recent 为**加权修饰**（§3.2 低权重，非硬筛选，D6 边缘定位）；
 *   - tier 直接复用 ANIM-16 §1.4 满意度三档（低 0–29 / 中 30–69 / 高 70–100）。
 *
 * 去重（§2.3，P0 验收硬指标）：
 *   - per-animal 最近已播 ID 滑动窗口（默认 20 条）；
 *   - 同一上下文键 24h（UTC+8 日切）内不重复同一句；
 *   - 池耗尽逐级放宽回退，**任意上下文必出 ≥1 条**（兜底永不空）。
 */
const { daypartFor, tierFor } = require('./time');

const SCENES = ['enter', 'map', 'timed', 'feedback'];

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

class CorpusEngine {
  constructor(config) {
    this.config = clone(config);
    this.state = {};
  }

  /** 热更整份配置（§3.4：条目/标签/去重参数/AI 配额均可热更，不硬编码）。 */
  replaceConfig(next) {
    this.config = {
      items: next.items ? clone(next.items) : this.config.items,
      conditionTag: next.conditionTag ? clone(next.conditionTag) : this.config.conditionTag,
      dedup: Object.assign({}, this.config.dedup, next.dedup || {}),
      aiQuota: Object.assign({}, this.config.aiQuota, next.aiQuota || {}),
    };
    return this.describeConfig();
  }

  describeConfig() {
    return {
      itemCount: this.config.items.length,
      conditionTag: this.config.conditionTag,
      dedup: this.config.dedup,
      aiQuota: this.config.aiQuota,
    };
  }

  reset() {
    this.state = {};
  }

  // --- 内部 ---------------------------------------------------------------
  animalState(animalId) {
    if (!this.state[animalId]) {
      this.state[animalId] = { lastPlayed: [], ctxLast: {}, aiDaily: {} };
    }
    return this.state[animalId];
  }

  itemsForAnimal(animal) {
    return this.config.items.filter(
      (it) =>
        (it.pool === 'personality' && it.animalType === animal.type) ||
        (it.pool === 'universal' && it.species === animal.species)
    );
  }

  isExpired(item, nowMs) {
    if (item.valid_from && new Date(item.valid_from).getTime() > nowMs) return true;
    if (item.valid_to && new Date(item.valid_to).getTime() <= nowMs) return true;
    return false;
  }

  /**
   * 选择一条语料并记录去重状态。
   * @param {Object} animal  { id, type, species, satisfaction }
   * @param {Object} ctx     { scene, interaction?, weather?, recent?, clock(inUTC8), nowMs }
   * @param {string} accountKey 账号级 AI 配额键（userId）
   * @returns {{text, source, itemId, ctx}}
   */
  select(animal, ctx, accountKey) {
    const { scene = 'enter', interaction = null, weather = null, recent = null, clock, nowMs } = ctx;
    const tier = tierFor(animal.satisfaction);
    const daypart = daypartFor(clock.minutes);
    const ctxKey = [scene, tier, daypart, weather || '-', interaction || '-', recent || '-'].join('|');
    const st = this.animalState(animal.id);
    const dedup = this.config.dedup;
    const ttlMs = (dedup.ctxTtlHours || 24) * 3600 * 1000;

    // ctx 内过期的 24h 记录顺手清掉（内存态，惰性清理）。
    const bucket = st.ctxLast[ctxKey] || (st.ctxLast[ctxKey] = {});
    if (bucket) {
      for (const id of Object.keys(bucket)) {
        if (nowMs - bucket[id] >= ttlMs) delete bucket[id];
      }
    }

    const seen = new Set(st.lastPlayed);
    const aiQuota = this.config.aiQuota;

    const aiAllowed = (item) => {
      if (item.source !== 'ai') return true;
      if (!aiQuota.enabled) return false;
      const day = st.aiDaily[clock.dateKey] || { animal: 0, account: 0 };
      if (day.animal >= aiQuota.perAnimalPerDay) return false;
      const acc = (this.state.__aiAccount ||= {})[clock.dateKey] || {};
      if ((acc[accountKey] || 0) >= aiQuota.perAccountPerDay) return false;
      return true;
    };

    const valid = (it) => !this.isExpired(it, nowMs) && !seen.has(it.id) && !bucket[it.id] && aiAllowed(it);
    const base = this.itemsForAnimal(animal);
    const tag = (it, k) => it.tags && it.tags[k];
    const allNull = (it) => Object.values(it.tags || {}).every((v) => v == null);

    // 逐级回退（§2.2 第 2 步 + §2.3 池耗尽回退）：
    //   L1 条件池：tier×daypart 精确（tag 匹配或 null 不约束）
    //   L2 档位池：仅 tier
    //   L3 性格通用池：personality 且 tags 全 null
    //   L4 物种通用池：universal
    const levels = [
      base.filter((it) => it.pool === 'personality' && (tag(it, 'tier') == null || tag(it, 'tier') === tier) && (tag(it, 'daypart') == null || tag(it, 'daypart') === daypart)),
      base.filter((it) => it.pool === 'personality' && (tag(it, 'tier') == null || tag(it, 'tier') === tier)),
      base.filter((it) => it.pool === 'personality' && allNull(it)),
      base.filter((it) => it.pool === 'universal'),
    ];

    let pool = null;
    for (const cand of levels) {
      const ok = cand.filter(valid);
      if (ok.length > 0) {
        pool = ok;
        break;
      }
    }
    // 兜底永不空（§2.3）：滑窗/TTL 全挡住时退到 仅 ctx-TTL 去重 → 再退到 无去重。
    if (!pool) {
      const relaxed = levels[2].concat(levels[3]).filter((it) => !this.isExpired(it, nowMs) && !bucket[it.id]);
      pool = relaxed.length > 0 ? relaxed : levels[2].concat(levels[3]).filter((it) => !this.isExpired(it, nowMs));
    }
    if (!pool || pool.length === 0) {
      // 配置层面就空了（不该发生）：给一条占位，保证接口"必出"。
      return { text: '（安静地看着你）', source: 'rule', itemId: 'corpus_fallback', ctx: { scene, tier, daypart, weather, interaction, recent } };
    }

    // 加权选取：基础 weight + 低权重修饰（weather / interaction / recent 命中加权，§2.2/§3.2）。
    const scored = pool.map((it) => {
      let w = it.weight || 1.0;
      if (weather && tag(it, 'weather') === weather) w *= 1.3;
      if (interaction && tag(it, 'interaction') === interaction) w *= 1.5;
      if (recent && tag(it, 'recent') === recent) w *= 1.2;
      return { it, w };
    });
    const total = scored.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    let picked = scored[0].it;
    for (const x of scored) {
      r -= x.w;
      if (r <= 0) {
        picked = x.it;
        break;
      }
    }

    // 记录去重状态（§2.3 数据结构）。
    st.lastPlayed.push(picked.id);
    if (st.lastPlayed.length > (dedup.window || 20)) st.lastPlayed.shift();
    if (!st.ctxLast[ctxKey]) st.ctxLast[ctxKey] = {};
    st.ctxLast[ctxKey][picked.id] = nowMs;
    if (picked.source === 'ai') {
      const day = (st.aiDaily[clock.dateKey] ||= { animal: 0, account: 0 });
      day.animal += 1;
      const acc = (this.state.__aiAccount ||= {})[clock.dateKey] ||= {};
      acc[accountKey] = (acc[accountKey] || 0) + 1;
    }

    return {
      text: picked.text,
      source: picked.source,
      itemId: picked.id,
      ctx: { scene, tier, daypart, weather, interaction, recent },
    };
  }
}

module.exports = { CorpusEngine, SCENES };