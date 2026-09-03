// 事件页：随机事件列表 -> 点开详情 -> 分支选择 -> 本地改好感/评分。
// demo 读 data/events.js，事件结果也在本地累加，橙色突出“可参与”事件。
const { EVENTS, randomEvent, buildState } = require('../../data/events');

function pickUnique(n) {
  const pool = EVENTS.slice();
  const picked = [];
  for (let i = 0; i < n && pool.length; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

Page({
  data: {
    state: null,
    events: [],
    selectedId: null,
    selected: null,
    optionIndex: -1,
    result: null,
  },

  onLoad() {
    this.setState(buildState());
    this.roll();
  },

  setState(state) {
    this.setData({ state });
  },

  roll() {
    const events = pickUnique(3);
    this.setData({
      events,
      selectedId: null,
      selected: null,
      optionIndex: -1,
      result: null,
    });
  },

  onSelect(e) {
    const id = e.currentTarget.dataset.id;
    const selected = this.data.events.find((ev) => ev.id === id) || null;
    this.setData({
      selectedId: id,
      selected,
      optionIndex: -1,
      result: null,
    });
  },

  onChoose(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const { selected, state } = this.data;
    if (!selected || !selected.options[idx]) return;
    const opt = selected.options[idx];
    const sat = Math.max(0, Math.min(100, state.satisfaction + opt.deltaSat));
    const points = state.points + opt.deltaScore;
    const newState = {
      satisfaction: sat,
      points: Math.max(0, points),
      interactions: state.interactions + 1,
    };
    this.setState(newState);
    this.setData({ optionIndex: idx, result: opt });
    wx.vibrateShort({ type: 'light' });
  },

  saveScore() {
    wx.showToast({ title: `积分已达 ${this.data.state.points}`, icon: 'none' });
  },

  onShareAppMessage() {
    return {
      title: '动物监狱 · 今日事件：你是哪个选项？',
      path: '/pages/events/events',
    };
  },
});
