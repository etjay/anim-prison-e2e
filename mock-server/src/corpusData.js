'use strict';

/**
 * M8 语料系统 · 默认配置数据（ANIM-15，docs/corpus-system.md v1.0 §3.4/§3.5）。
 *
 * 四张"热更配置表"（mock 期 = 内存配置，可经 POST /api/corpus/reload 热更）：
 *   - CORPUS_ITEMS         语料条目 corpus_item（§3.1/§3.5）
 *   - CORPUS_CONDITION_TAG 条件标签字典（§3.2）
 *   - CORPUS_DEDUP_POLICY  去重策略（§2.3：滑窗 20 + 同上下文键 24h TTL + 回退顺序）
 *   - CORPUS_AI_QUOTA      AI 语料配额（§4.2：默认关，5 条/日/只 + 20 条/日/账号）
 *
 * 标签取值对齐（避免两套实体）：
 *   - tier        低 0–29 / 中 30–69 / 高 70–100（ANIM-16 §1.4 满意度档位，语料触发共用）
 *   - daypart     对齐 ANIM-16 §2.2（白天 10–22 / 夜间 22–07）：
 *                 morning 07–10 / noon 10–15 / evening 15–22 / night 22–07（UTC+8）
 *   - interaction feed/play/exercise（对齐 ANIM-13 /api/interaction action 取值）
 *   - weather     sunny/rainy/overcast/snow（M11 季节池；D6 边缘辅助 → 仅低权重加权，
 *                 不做硬门槛；mock 期由 X-Mock-Weather 头覆盖，缺省 = 不约束）
 *   - recent      active/idle（近 3 日互动频率修饰，仅加权）
 *
 * 分层（§3.3）：
 *   - pool=universal   物种通用池（按 species 归属，跨性格共享，最低成本兜底）
 *   - pool=personality 动物性格语料集（按 animalType 归属，文案风格承载性格差异）
 *   - tags 全 null     = 该池的无条件兜底条目（性格通用池 / 物种兜底）
 *
 * 任何时刻必出 ≥1 条：条件池 → 档位池 → 性格通用池 → 物种通用池（§2.2 回退）。
 */

const CORPUS_CONDITION_TAG = {
  tier: ['low', 'mid', 'high'],
  daypart: ['morning', 'noon', 'evening', 'night'],
  weather: ['sunny', 'rainy', 'overcast', 'snow'],
  interaction: ['feed', 'play', 'exercise'],
  recent: ['active', 'idle'],
};

const CORPUS_DEDUP_POLICY = {
  // 去重滑动窗口（per-animal 最近已播条数上限），调参值（§2.3）。
  window: 20,
  // 同上下文键不重复同一句 TTL（对齐日切 UTC+8），调参值（§2.3）。
  ctxTtlHours: 24,
  // 回退层级顺序（§2.2 第 2 步）：条件池 → 档位池 → 性格通用池 → 物种通用池。
  fallbackOrder: ['personality_cond', 'personality_tier', 'personality_generic', 'universal'],
};

// AI 语料配额（§4.2，P2 默认关；三重控本前两层，生成侧离线批量不改变在线契约）。
const CORPUS_AI_QUOTA = {
  enabled: false, // feature_flag: ai_corpus.enabled（§4.3），热更即时关断
  perAnimalPerDay: 5,
  perAccountPerDay: 20,
};

const TAGS_NULL = { tier: null, daypart: null, weather: null, interaction: null, recent: null };
const t = (o = {}) => Object.assign({}, TAGS_NULL, o);

const CORPUS_ITEMS = [
  // ================= 企鹅（penguin / 皮皮） =================
  // --- 物种通用池 universal（species=企鹅，跨性格兜底）---
  { id: 'corp_pengu_uni_01', species: '企鹅', text: '（打了个哈欠，翅膀轻拍地面）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_uni_02', species: '企鹅', text: '（低头理了理羽毛）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_uni_03', species: '企鹅', text: '（晃晃悠悠走了两步）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_uni_04', species: '企鹅', text: '（盯着食堂的方向张望）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_uni_05', species: '企鹅', text: '（安静地看着你）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },

  // --- 性格语料集 personality（animalType=penguin：黏人、爱撒娇）---
  // 条件池（tier × daypart 核心二维，§2.2）
  { id: 'corp_pengu_001', animalType: 'penguin', text: '（缩在角落只露出眼睛）……又是新的一天啊。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', daypart: 'morning' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_002', animalType: 'penguin', text: '（背对着你发呆）……中午就这样过去吗。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', daypart: 'noon' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_003', animalType: 'penguin', text: '（抱着自己的小鱼干）今晚……自己待一会儿。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', daypart: 'night' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_004', animalType: 'penguin', text: '（晃过来蹭了蹭你的手）早上好呀。', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', daypart: 'morning' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_005', animalType: 'penguin', text: '（歪头看你）想点什么菜呢？', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', daypart: 'noon' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_006', animalType: 'penguin', text: '（安静地蹲在你脚边）今晚风挺大的。', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', daypart: 'night' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_007', animalType: 'penguin', text: '（扑扇着翅膀一路小跑过来）等你一天了！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'morning' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_008', animalType: 'penguin', text: '（叼着小鱼干塞给你）给你给你！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'noon' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_009', animalType: 'penguin', text: '（叼着罐头看你）今晚多待一会儿？', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'night' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_010', animalType: 'penguin', text: '（在门口扑腾了两下）今天过得怎么样？', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'evening' }), weight: 1.0, valid_from: null, valid_to: null },
  // 互动修饰条目（interaction 低权重加权，非硬筛选；tier/daypart=null 不约束）
  { id: 'corp_pengu_011', animalType: 'penguin', text: '（勉强低头啄了一口）……喂就喂吧。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', interaction: 'feed' }), weight: 1.2, valid_from: null, valid_to: null },
  { id: 'corp_pengu_012', animalType: 'penguin', text: '（眼睛亮了）是要开饭了吗？', source: 'rule', pool: 'personality', tags: t({ interaction: 'feed' }), weight: 1.5, valid_from: null, valid_to: null },
  { id: 'corp_pengu_013', animalType: 'penguin', text: '（开心转了个圈）这个好吃！再来一份！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', interaction: 'feed' }), weight: 1.5, valid_from: null, valid_to: null },
  { id: 'corp_pengu_014', animalType: 'penguin', text: '（拍了拍肚子）出去溜达一圈也不错。', source: 'rule', pool: 'personality', tags: t({ interaction: 'exercise' }), weight: 1.2, valid_from: null, valid_to: null },
  { id: 'corp_pengu_015', animalType: 'penguin', text: '（伸了个懒腰）走走走，放风去！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', interaction: 'exercise' }), weight: 1.5, valid_from: null, valid_to: null },
  { id: 'corp_pengu_016', animalType: 'penguin', text: '（歪头看你扔的球）……行吧，陪你玩一会儿。', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', interaction: 'play' }), weight: 1.2, valid_from: null, valid_to: null },
  { id: 'corp_pengu_017', animalType: 'penguin', text: '（兴奋地原地蹦了两下）再玩一局！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', interaction: 'play' }), weight: 1.5, valid_from: null, valid_to: null },
  // 天气修饰条目（D6 边缘：低权重加权）
  { id: 'corp_pengu_018', animalType: 'penguin', text: '（望着窗外）下雨天适合发呆。', source: 'rule', pool: 'personality', tags: t({ weather: 'rainy' }), weight: 1.1, valid_from: null, valid_to: null },
  { id: 'corp_pengu_019', animalType: 'penguin', text: '（眯着眼晒太阳）……舒服。', source: 'rule', pool: 'personality', tags: t({ weather: 'sunny' }), weight: 1.1, valid_from: null, valid_to: null },
  // 近期频率修饰条目（recent 低权重加权）
  { id: 'corp_pengu_020', animalType: 'penguin', text: '（趴在门口张望）……你怎么才来？', source: 'rule', pool: 'personality', tags: t({ recent: 'idle' }), weight: 1.2, valid_from: null, valid_to: null },
  // 性格通用兜底池（tags 全 null = 该动物无条件兜底，§2.3）
  { id: 'corp_pengu_021', animalType: 'penguin', text: '（用小翅膀朝你挥了挥）', source: 'rule', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_022', animalType: 'penguin', text: '（歪着头看你）', source: 'rule', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_023', animalType: 'penguin', text: '（尾巴似的尾脂腺蹭了蹭你的手心）', source: 'rule', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  // AI 灰度条目（source=ai，同池同触发同去重；flag 默认关 → 不参与选择，§4）
  { id: 'corp_pengu_ai_01', animalType: 'penguin', text: '（把今天吃剩的小鱼干藏进雪堆里）给你留了一条！', source: 'ai', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_pengu_ai_02', animalType: 'penguin', text: '（学你走路的样子走了两步，又晃回去）你平时就这样走的吗？', source: 'ai', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },

  // ================= 仓鼠（hamster / 团团） =================
  // --- 物种通用池 universal（species=仓鼠）---
  { id: 'corp_ham_uni_01', species: '仓鼠', text: '（腮帮子鼓鼓的，慢慢嚼）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_uni_02', species: '仓鼠', text: '（在跑轮里转了两圈）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_uni_03', species: '仓鼠', text: '（拿前爪擦了擦眼睛）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_uni_04', species: '仓鼠', text: '（把脑袋埋进垫料里拱了拱）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_uni_05', species: '仓鼠', text: '（竖着耳朵听动静）', source: 'rule', pool: 'universal', tags: t(), weight: 1.0, valid_from: null, valid_to: null },

  // --- 性格语料集 personality（animalType=hamster：温吞、社恐、爱吃）---
  // 条件池（tier × daypart）
  { id: 'corp_ham_001', animalType: 'hamster', text: '（只探出半颗脑袋）……早、早上好。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', daypart: 'morning' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_002', animalType: 'hamster', text: '（抱着瓜子一动不动）……中午好。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', daypart: 'noon' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_003', animalType: 'hamster', text: '（把窝的被子往上拉了拉）晚安……', source: 'rule', pool: 'personality', tags: t({ tier: 'low', daypart: 'night' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_004', animalType: 'hamster', text: '（小跑过来又害羞地停住）早上好……', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', daypart: 'morning' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_005', animalType: 'hamster', text: '（把一颗瓜子推到你手边）……给你。', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', daypart: 'noon' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_006', animalType: 'hamster', text: '（在跑轮边停下了）……也困了吗。', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', daypart: 'night' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_007', animalType: 'hamster', text: '（一看到你就开始转圈）早！早上好！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'morning' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_008', animalType: 'hamster', text: '（把最大的一颗瓜子塞进你手心）吃！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'noon' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_009', animalType: 'hamster', text: '（趴在你手心里没走）今晚别走嘛……', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'night' }), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_010', animalType: 'hamster', text: '（在窝门口来回踱步等你）回来啦！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', daypart: 'evening' }), weight: 1.0, valid_from: null, valid_to: null },
  // 互动修饰条目
  { id: 'corp_ham_011', animalType: 'hamster', text: '（闻了闻，慢吞吞地吃了一口）……还行。', source: 'rule', pool: 'personality', tags: t({ tier: 'low', interaction: 'feed' }), weight: 1.2, valid_from: null, valid_to: null },
  { id: 'corp_ham_012', animalType: 'hamster', text: '（腮帮子一下子鼓起来了）要、要开饭了吗？', source: 'rule', pool: 'personality', tags: t({ interaction: 'feed' }), weight: 1.5, valid_from: null, valid_to: null },
  { id: 'corp_ham_013', animalType: 'hamster', text: '（吃完立刻去囤粮）谢谢！嘿嘿！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', interaction: 'feed' }), weight: 1.5, valid_from: null, valid_to: null },
  { id: 'corp_ham_014', animalType: 'hamster', text: '（被抱出来时小小地"吱"了一声）……出去吗。', source: 'rule', pool: 'personality', tags: t({ interaction: 'exercise' }), weight: 1.2, valid_from: null, valid_to: null },
  { id: 'corp_ham_015', animalType: 'hamster', text: '（主动爬上你的手指）放风放风！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', interaction: 'exercise' }), weight: 1.5, valid_from: null, valid_to: null },
  { id: 'corp_ham_016', animalType: 'hamster', text: '（用爪子拨了拨小皮球）……那、那陪你一下。', source: 'rule', pool: 'personality', tags: t({ tier: 'mid', interaction: 'play' }), weight: 1.2, valid_from: null, valid_to: null },
  { id: 'corp_ham_017', animalType: 'hamster', text: '（追着球满场跑，跑累了倒在你手心）还要！', source: 'rule', pool: 'personality', tags: t({ tier: 'high', interaction: 'play' }), weight: 1.5, valid_from: null, valid_to: null },
  // 天气修饰条目
  { id: 'corp_ham_018', animalType: 'hamster', text: '（贴着玻璃窗）下雨啦……不想动。', source: 'rule', pool: 'personality', tags: t({ weather: 'rainy' }), weight: 1.1, valid_from: null, valid_to: null },
  { id: 'corp_ham_019', animalType: 'hamster', text: '（摊在晒到太阳的垫子上）……好暖。', source: 'rule', pool: 'personality', tags: t({ weather: 'sunny' }), weight: 1.1, valid_from: null, valid_to: null },
  // 近期频率修饰条目
  { id: 'corp_ham_020', animalType: 'hamster', text: '（把窝门开了一条缝）……你最近都去哪儿了。', source: 'rule', pool: 'personality', tags: t({ recent: 'idle' }), weight: 1.2, valid_from: null, valid_to: null },
  // 性格通用兜底池（tags 全 null）
  { id: 'corp_ham_021', animalType: 'hamster', text: '（从垫料里探出脑袋）', source: 'rule', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_022', animalType: 'hamster', text: '（慢慢嚼着，眼睛弯弯的）', source: 'rule', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_023', animalType: 'hamster', text: '（朝你小跑了两步又停住）', source: 'rule', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  // AI 灰度条目
  { id: 'corp_ham_ai_01', animalType: 'hamster', text: '（在垫料里挖了一个洞，铺上软草）……给你留的位置。', source: 'ai', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
  { id: 'corp_ham_ai_02', animalType: 'hamster', text: '（把五颗瓜子排成一排，歪头看了看，又加了一颗）今天有五颗半。', source: 'ai', pool: 'personality', tags: t(), weight: 1.0, valid_from: null, valid_to: null },
];

const DEFAULT_CORPUS_CONFIG = {
  items: CORPUS_ITEMS,
  conditionTag: CORPUS_CONDITION_TAG,
  dedup: CORPUS_DEDUP_POLICY,
  aiQuota: CORPUS_AI_QUOTA,
};

module.exports = { DEFAULT_CORPUS_CONFIG, CORPUS_CONDITION_TAG, CORPUS_DEDUP_POLICY, CORPUS_AI_QUOTA, CORPUS_ITEMS };