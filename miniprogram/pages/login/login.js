// 登录页（入口）。stub 登录：调用 mock 登录接口，写入会话 token，
// 然后按绑定状态跳转（未绑定 -> welcome；已绑定 -> home）。
const { post } = require('../../utils/request');
const env = require('../../config/env');

Page({
  data: {
    env: env.env,
    baseURL: env.baseURL,
    loading: false,
    error: '',
    ok: false,
  },

  onShow() {
    const app = getApp();
    this.setData({
      env: app.globalData.env,
      baseURL: app.globalData.baseURL,
    });
  },

  // stub 登录：真实场景为 wx.login 拿 code -> 后端换 session。
  onLogin() {
    this.setData({ loading: true, error: '', ok: false });
    post('/api/auth/login', { code: 'stub-wechat-code' })
      .then((res) => {
        const app = getApp();
        app.globalData.token = (res && res.token) || 'stub-token';
        app.globalData.bound = !!(res && res.bound);
        this.setData({ ok: true });
        // 未绑定进欢迎页，已绑定进办公室（首页 tab）。
        wx.reLaunch({ url: app.globalData.bound ? '/pages/office/office' : '/pages/welcome/welcome' });
      })
      .catch((err) => {
        // 骨架期允许离线手动走通：失败不阻塞，给出提示 + 手动入口。
        this.setData({ error: err.message || '登录失败' });
      })
      .finally(() => this.setData({ loading: false }));
  },

  // 手动走通用：直接进入欢迎页（未绑定态）。
  gotoWelcome() {
    wx.reLaunch({ url: '/pages/welcome/welcome' });
  },

  // 手动走通用：直接进入办公室 tab（已绑定态）。
  gotoHome() {
    const app = getApp();
    app.globalData.bound = true;
    wx.switchTab({ url: '/pages/office/office' });
  },
});