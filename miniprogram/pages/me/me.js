// 我的（tab）：账号 / 等级 / 设置列表。demo 用本地 stub。
const { getAll } = require('../../data/animals');

Page({
  data: {
    level: 3,
    nickname: '现任典狱长',
    animalsCount: 0,
    items: [
      { key: 'push', label: '推送提醒', value: '已开启' },
      { key: 'privacy', label: '隐私与用户协议', value: '预览' },
      { key: 'help', label: '帮助与反馈', value: '→' },
    ],
  },

  onShow() {
    this.setData({ animalsCount: getAll().length });
  },

  onItemTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'privacy') {
      wx.navigateTo({ url: '/pages/privacy/privacy' });
    } else {
      wx.showToast({ title: '演示页，敬请期待', icon: 'none' });
    }
  },
});
