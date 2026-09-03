// 食堂页（定时发餐）：今日三餐时间轴 + 领取按钮（demo）；
// 同时保留 onFeed 互动入口（e2e 契约：POST /api/interaction + 即时反馈语料）。
const { post, get } = require('../../utils/request');
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
    submitting: false,
    resultMsg: '',
    error: '',
    // M8（ANIM-15）：互动后即时反馈语料（scene=feedback），客户端只渲染 text。
    corpus: null,
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

  // 喂食互动（e2e 契约）：POST /api/interaction，成功展示反馈 + 即时语料并重载评分。
  onFeed() {
    const app = getApp();
    this.setData({ submitting: true, resultMsg: '', error: '', corpus: null });
    post('/api/interaction', {
      animalId: app.globalData.animal && app.globalData.animal.id,
      action: 'feed',
    })
      .then((res) => {
        const corpus = (res && res.corpus) || null;
        this.setData({ resultMsg: '喂食成功！小动物心情 +10', corpus });
        this.loadRating();
      })
      .catch((err) => {
        this.setData({ resultMsg: '', corpus: null, error: (err && err.message) || '互动提交失败' });
      })
      .finally(() => this.setData({ submitting: false }));
  },
});
