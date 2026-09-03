// 我的（tab）：账号 / 等级 / 设置列表。demo 用本地 stub。
const { getAll } = require('../../data/animals');

Page({
  data: {
    level: 3,
    nickname: '现任典狱长',
    animalsCount: 0,
    items: [
      { key: 'score', label: '等级与评分', value: '→' },
      { key: 'events', label: '监狱事件', value: '→' },
      { key: 'achievements', label: '成就墙', value: '→' },
      { key: 'settings', label: '推送提醒 / 设置', value: '→' },
      { key: 'privacy', label: '隐私与用户协议', value: '预览' },
      { key: 'help', label: '帮助与反馈', value: '→' },
    ],
  },

  onShow() {
    this.setData({ animalsCount: getAll().length });
  },

  onLevel() {
    wx.navigateTo({ url: '/pages/score/score' });
  },

  onItemTap(e) {
    const key = e.currentTarget.dataset.key;
    const routes = {
      score: '/pages/score/score',
      events: '/pages/events/events',
      achievements: '/pages/achievements/achievements',
      settings: '/pages/settings/settings',
      privacy: '/pages/privacy/privacy',
      help: '/pages/help/help',
    };
    const url = routes[key];
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: '演示页，敬请期待', icon: 'none' });
    }
  },
});
