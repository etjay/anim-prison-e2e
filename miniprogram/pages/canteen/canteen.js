// 食堂页（定时发餐）：今日三餐时间轴 + 领取按钮。
// demo：餐点窗口来自本地时钟（data/feedWindow）；claim 走本地 stub，离线可跑通。
const { get } = require('../../utils/request');
const { MEALS, activeMealKey, nowHM } = require('../../data/feedWindow');
const { getAll } = require('../../data/animals');

const STUB_RATING = { score: 4.2, satisfaction: 90, count: 128 };

Page({
  data: {
    animalName: '皮皮兔',
    meals: [],
    now: '',
    currentKey: null,
    claimed: {}, // { breakfast: true, ... }
    rating: null,
    loaded: false,
    resultMsg: '',
    error: '',
  },

  onShow() {
    const app = getApp();
    const animal = app.globalData.animal || getAll()[0];
    this.setData({ animalName: (animal && animal.name) || '皮皮兔' });
    this.buildTimeline();
    this.loadRating();
  },

  buildTimeline() {
    const now = nowHM();
    const activeKey = activeMealKey();
    const meals = MEALS.map((m) => ({
      ...m,
      current: m.key === activeKey,
      claimed: !!this.data.claimed[m.key],
    }));
    this.setData({ now, meals, currentKey: activeKey });
  },

  loadRating() {
    get('/api/rating')
      .then((res) => {
        this.setData({ rating: (res && res.rating) || res || STUB_RATING, loaded: true });
      })
      .catch(() => {
        this.setData({ rating: STUB_RATING, loaded: true, error: '未连接 mock，展示内置评分' });
      });
  },

  onClaim(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.claimed[key]) return;
    if (key !== this.data.currentKey) {
      wx.showToast({ title: '还没到这一餐的点儿', icon: 'none' });
      return;
    }
    const claimed = { ...this.data.claimed, [key]: true };
    this.setData({ claimed, resultMsg: '本餐已发放，去牢房喂你的囚犯吧。' });
    this.buildTimeline();
  },
});
