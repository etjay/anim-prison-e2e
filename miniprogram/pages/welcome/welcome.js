// 欢迎页（未绑定态）。提示用户使用邀请码绑定小动物。
const env = require('../../config/env');

Page({
  data: {
    env: env.env,
  },

  onShow() {
    const app = getApp();
    this.setData({ env: app.globalData.env });
    // 若已绑定则直接进入首页（避免停在欢迎页）。
    if (app.globalData.bound) {
      wx.reLaunch({ url: '/pages/home/home' });
    }
  },

  gotoBind() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },

  gotoLogin() {
    wx.reLaunch({ url: '/pages/login/login' });
  },
});