// 随机事件 stub。demo 期本地随机抽取事件 + 分支，修改本地满意度/评分。
//
// 字段约定：
//   id       事件编号
//   title    事件标题
//   emoji    事件图标
//   desc     事件正文（幽默口吻）
//   animalId 关联囚犯（可空）
//   weight   抽取权重（越大越常见）
//   options  分支选择 [{ label, deltaSat, deltaScore, result }]
//            deltaSat   满意度增减（-10 ~ +15）
//            deltaScore 经营积分增减
//            result     选择后返回的一句结果文案
//   corpus   随机结果语料（选择后随机吐一句口吻）

const { getAll } = require('./animals');

const EVENTS = [
  {
    id: 'ev-escape',
    title: '深夜越狱算盘',
    emoji: '🌙',
    desc: '凌晨两点，皮皮兔在墙上画起了越狱通道，并诚邀你当导航员。',
    animalId: '0707',
    weight: 5,
    corpus: ['这次我真的有计划了！', '老规矩，翻墙记得叫我。'],
    options: [
      { label: '假装没看见，放他自由', deltaSat: -10, deltaScore: -20, result: '皮皮兔翻出去三米，被菜刀追了回来。满意度 -10。' },
      { label: '递地图，反手给看守打小报告', deltaSat: 8, deltaScore: 15, result: '看守收网，给你点了个赞。满意度 +8，积分 +15。' },
      { label: '陪他再画一遍，趁机劝退', deltaSat: 12, deltaScore: 20, result: '你把第八次越狱劝成了一顿夜宵。满意度 +12，积分 +20。' },
    ],
  },
  {
    id: 'ev-cheese',
    title: '最后一格奶酪争夺战',
    emoji: '🧀',
    desc: '切达宣称仓库最后一格奶酪是祖传遗产，要求你做个公正裁决。',
    animalId: '1001',
    weight: 5,
    corpus: ['这块奶酪，我登记过了。', '看守同志，库存告急，麻烦补货。'],
    options: [
      { label: '判给切达，稳住监狱秩序', deltaSat: 6, deltaScore: 10, result: '切达满意退场。满意度 +6，积分 +10。' },
      { label: '公平分配，一人一半', deltaSat: 3, deltaScore: 8, result: '众人鼓掌。满意度 +3，积分 +8。' },
      { label: '当场没收，充公当晚饭', deltaSat: -6, deltaScore: 5, result: '切达的目光足以杀人。满意度 -6，积分 +5。' },
    ],
  },
  {
    id: 'ev-shift',
    title: '门卫轮岗大事件',
    emoji: '🚪',
    desc: '汪汪正襟危坐在大门口，要求正式版轮岗表，否则拒绝下班。',
    animalId: '0520',
    weight: 4,
    corpus: ['汪！今天也看大门！', '带根骨头来就行，朋友。'],
    options: [
      { label: '发一根骨头，立即上岗', deltaSat: 10, deltaScore: 12, result: '汪汪心满意足。满意度 +10，积分 +12。' },
      { label: '画饼：下周就发', deltaSat: -5, deltaScore: 3, result: '汪汪尾巴瞬间耷拉。满意度 -5，积分 +3。' },
      { label: '亲自陪岗一小时', deltaSat: 14, deltaScore: 18, result: '你们成了全镇最靓的搭档。满意度 +14，积分 +18。' },
    ],
  },
  {
    id: 'ev-cold',
    title: '冰山冷场警告',
    emoji: '🧊',
    desc: '阿冷站在食堂门口没说话，但温度已经降了五度，气氛很微妙。',
    animalId: '0001',
    weight: 4,
    corpus: ['……', '冷。别聊。'],
    options: [
      { label: '递上一杯热饮破冰', deltaSat: 9, deltaScore: 10, result: '阿冷难得看了你一眼。满意度 +9，积分 +10。' },
      { label: '跟着一起沉默', deltaSat: 12, deltaScore: 14, result: '你们沉默地度过了一下午，谁也没输。满意度 +12，积分 +14。' },
      { label: '试图讲个热梗', deltaSat: -8, deltaScore: 0, result: '更冷了。满意度 -8。' },
    ],
  },
  {
    id: 'ev-extra',
    title: '典狱长福利到账',
    emoji: '📮',
    desc: '总部发来一笔意外福利：要么兑换成零食，要么折算成积分。',
    animalId: null,
    weight: 3,
    corpus: ['今天是运气在上班。'],
    options: [
      { label: '换成零食，众人分食', deltaSat: 8, deltaScore: 5, result: '监狱里飘起了薯片味。满意度 +8，积分 +5。' },
      { label: '折算积分，给评分上分', deltaSat: 0, deltaScore: 25, result: '评分+，大家很满足。积分 +25。' },
      { label: '留着不加，偷偷落袋', deltaSat: -3, deltaScore: 15, result: '你赢了积分但输了人心。满意度 -3，积分 +15。' },
    ],
  },
];

// 本地经营档案（与 score stub 一致起步，可被事件累加）。
function buildState() {
  return {
    points: 428,
    satisfaction: 76,
    interactions: 128,
  };
}

// 按权重随机挑一个可参与事件。
function randomEvent() {
  const total = EVENTS.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of EVENTS) {
    r -= e.weight || 1;
    if (r <= 0) return e;
  }
  return EVENTS[0];
}

function getById(id) {
  return EVENTS.find((e) => e.id === String(id)) || randomEvent();
}

module.exports = { EVENTS, randomEvent, getById, buildState };
