// 成就页：达成 / 未达成列表，每条可「分享」。橙框突出最近达成。
const { build, recentDone } = require('../../data/achievements');

Page({
  data: {
    list: [],
    recentId: null,
  },

  onShow() {
    const list = build();
    const recent = recentDone();
    this.setData({ list, recentId: recent ? recent.id : null });
  },

  onShare(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/share/share?id=${id}` });
  },
});
