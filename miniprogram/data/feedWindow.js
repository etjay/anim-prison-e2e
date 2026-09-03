// 餐点窗口判定（假数据）。demo 期用固定时段模拟“定时发餐”。
// 若 mock 服务未启动，页面用一个本地时钟，仍能演示“非时段按钮变灰”。
//
// 时段：早餐 07:00-09:30 / 午餐 12:00-13:30 / 晚餐 18:00-19:30。
const MEALS = [
  { key: 'breakfast', label: '早餐', start: '07:00', end: '09:30', emoji: '🌅' },
  { key: 'lunch', label: '午餐', start: '12:00', end: '13:30', emoji: '🍚' },
  { key: 'dinner', label: '晚餐', start: '18:00', end: '19:30', emoji: '🌙' },
];

function nowHM(date) {
  const d = date || new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 返回当前可领取的餐 key；没有则返回 null。
function currentMealKey(date) {
  const hm = nowHM(date);
  for (const m of MEALS) {
    if (hm >= m.start && hm <= m.end) return m.key;
  }
  return null;
}

// 返回“活跃”餐 key：当前时段内则取当前餐；否则取下一餐（跨天回绕到早餐）。
// demo 目的：保证食堂页总有“现在就领”的橙色引导，同时仍演示时段窗口。
function activeMealKey(date) {
  const cur = currentMealKey(date);
  if (cur) return cur;
  const hm = nowHM(date);
  for (const m of MEALS) {
    if (m.start > hm) return m.key;
  }
  return MEALS[0].key; // 已过晚餐 -> 下一餐为次日早餐
}

// 喂食窗口是否打开（用于牢房互动页的“喂食”按钮）。
function feedWindowOpen(date) {
  return !!currentMealKey(date);
}

module.exports = { MEALS, currentMealKey, activeMealKey, feedWindowOpen, nowHM };
