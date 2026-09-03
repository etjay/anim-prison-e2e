// 等级 / 外显评分 stub 模型。
// 真实场景由后端返回；demo 期用本地累加的“经营积分”推导外显等级（8 档）。
//
// 字段约定：
//   points   累计经营积分（喂食/放风/陪玩/事件获得）
//   score    经营评分（0-5，用于办公室顶部展示）
//   satisfaction  平均满意度（0-100）

const LEVELS = [
  { level: 1, name: '见习典狱长', min: 0 },
  { level: 2, name: '门卫助理', min: 120 },
  { level: 3, name: '正经看守', min: 300 },
  { level: 4, name: '牢房督察', min: 600 },
  { level: 5, name: '监狱长', min: 1000 },
  { level: 6, name: '大典狱长', min: 1600 },
  { level: 7, name: '典狱长之王', min: 2400 },
  { level: 8, name: '传奇典狱长', min: 3600 },
];

// 当前本地经营档案（demo 每次启动读这个值起步）。
const STUB_PROFILE = {
  points: 428,
  score: 4.2,
  satisfaction: 76,
  interactions: 128,
};

// 依据积分推导当前档位与升级进度。
function getProfile(points) {
  const p = typeof points === 'number' ? points : STUB_PROFILE.points;
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (p >= LEVELS[i].min) idx = i;
  }
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const base = cur.min;
  const span = next ? next.min - cur.min : 1;
  const into = p - base;
  const percent = next ? Math.min(100, Math.floor((into / span) * 100)) : 100;
  return {
    points: p,
    level: cur.level,
    name: cur.name,
    next: next,
    percent,
    into,
    span,
  };
}

module.exports = { LEVELS, STUB_PROFILE, getProfile };
