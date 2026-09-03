// 办公室（tab）：监狱总览。评分 + 外显等级徽章 + 横向动物卡片 + 快捷入口。
// demo 期直接读本地 stub 数据，mock 挂掉也能跑通。
const { getAll } = require('../../data/animals');

// stub 经营评分（真实场景由后端返回）。
const STUB_SCORE = { score: 4.2, satisfaction: 78, level: 3, count: 128 };

Page({
  data: {
    score: STUB_SCORE,
    animals: [],
    best: null,
    loading: true,
  },

  onShow() {
    this.load();
  },

  load() {
    const animals = getAll();
    // 找出满意度最高的那只作为“今天状态不错”的高亮对象。
    const best = animals.slice().sort((a, b) => b.satisfaction - a.satisfaction)[0] || null;
    this.setData({ animals, best, loading: false });
  },

  gotoCanteen() {
    wx.navigateTo({ url: '/pages/canteen/canteen' });
  },

  gotoJail() {
    wx.switchTab({ url: '/pages/jail/jail' });
  },

  gotoCellDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/cell-detail/cell-detail?id=${id}` });
  },

  gotoBind() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },
});
