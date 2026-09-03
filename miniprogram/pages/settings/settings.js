// 设置页：推送提醒开关 + 隐私管理 + 关于。demo 本地 stub。
Page({
  data: {
    push: true,
    version: '0.1.0',
    accounts: [{ name: '当前账号', value: 'wx_warden_01' }],
  },

  onTogglePush(e) {
    const push = e.detail.value;
    this.setData({ push });
    wx.showToast({ title: push ? '推送提醒已开启' : '推送提醒已关闭', icon: 'none' });
  },

  onPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  onAbout() {
    wx.showModal({
      title: '关于动物监狱',
      content: `动物监狱 · 低保真交互原型\n版本 ${this.data.version}\n玩法：照顾 → 好感 → 评分 → 等级`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onReport() {
    wx.navigateTo({ url: '/pages/help/help' });
  },
});
