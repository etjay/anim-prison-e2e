// 牢房（tab）：纵向列表，每项=动物缩略 + 名称 + 满意度条 + 今日剩余次数角标。
const { getAll } = require('../../data/animals');

Page({
  data: {
    animals: [],
    loading: true,
  },

  onShow() {
    this.load();
  },

  load() {
    const animals = getAll();
    // 挑一只“今日还没喂”的作橙色引导（demo：满意度最低的那只）。
    const lowest = animals.slice().sort((a, b) => a.satisfaction - b.satisfaction)[0] || null;
    const list = animals.map((a) => ({
      ...a,
      needFeed: !!(lowest && a.id === lowest.id),
    }));
    this.setData({ animals: list, loading: false });
  },

  gotoCellDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/cell-detail/cell-detail?id=${id}` });
  },
});
