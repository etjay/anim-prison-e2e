// 成就 stub。demo 用本地固定列表，未达成的可勾连互动后点亮。
// 面向 5 只囚犯各设一条“专属成就”，另有等级/社交类通用成就。
//
// 字段约定：
//   id       成就编号（分享页路由参数）
//   title    成就名
//   desc     达成条件（幽默口吻）
//   emoji    图标
//   animalId 关联的囚犯编号（无则 null）
//   level    展示用星级（1-3，决定分享卡配色强度）
//   done     是否已达成
//   reachedAt 达成时间描述（仅达成时有值，用于“最近达成”高亮）

const { getAll } = require('./animals');

function animalById(id) {
  return getAll().find((a) => a.id === String(id)) || null;
}

// 由动画种子生成的成就（done 与动物满意度挂钩，简单可跑通）。
const BASE = [
  {
    id: 'ach-1024',
    animalId: '1024',
    title: '卷王的贴身助理',
    emoji: '🐹',
    desc: '把 1024 的满意度喂到 90+，让他今晚心甘情愿打卡下班。',
    level: 3,
  },
  {
    id: 'ach-1001',
    animalId: '1001',
    title: '奶酪产权公证人',
    emoji: '🐭',
    desc: '守住切达的最后一格奶酪，成功贿赂一次。',
    level: 2,
  },
  {
    id: 'ach-0707',
    animalId: '0707',
    title: '第八次越狱劝退师',
    emoji: '🐰',
    desc: '让皮皮兔连续三天忘记越狱，成功拔掉他的念头。',
    level: 3,
  },
  {
    id: 'ach-0001',
    animalId: '0001',
    title: '冰山消融委员会',
    emoji: '🐧',
    desc: '让阿冷和你说上一整句话，不下雪也值得。',
    level: 2,
  },
  {
    id: 'ach-0520',
    animalId: '0520',
    title: '汪汪队编外教官',
    emoji: '🐶',
    desc: '配合汪汪完成一次正规上岗培训，颁发骨头顶配。',
    level: 1,
  },
  {
    id: 'ach-score',
    title: '经营首破 4 分',
    emoji: '📈',
    desc: '监狱经营评分首次冲上 4.0，众囚犯集体鼓掌。',
    level: 2,
  },
  {
    id: 'ach-level',
    title: '升任正经看守',
    emoji: '🎖️',
    desc: '外显等级达到 Lv.3，正式脱离实习期。',
    level: 3,
  },
];

// 运行时给部分成就补上“已达成”状态 + 达成时间（用于“最近达成”高亮）。
const DONE_IDS = ['ach-1024', 'ach-score', 'ach-level'];
const REACHED_AT = [
  '昨天 22:47',
  '前天 09:12',
  '上周五 18:30',
];

function build() {
  const animals = getAll();
  let doneIdx = 0;
  return BASE.map((a) => {
    const animal = a.animalId ? animalById(a.animalId) : null;
    const done = DONE_IDS.indexOf(a.id) >= 0;
    const item = Object.assign({}, a, {
      animalEmoji: animal ? animal.emoji : '',
      animalName: animal ? animal.name : '',
      done,
    });
    if (done) {
      item.reachedAt = REACHED_AT[doneIdx % REACHED_AT.length];
      doneIdx += 1;
    }
    return item;
  });
}

// 最近达成的一条（分享页默认高亮对象）。
function recentDone() {
  const list = build();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].done) return list[i];
  }
  return list[0] || null;
}

function getById(id) {
  return build().find((a) => a.id === String(id)) || recentDone();
}

module.exports = { build, recentDone, getById };
