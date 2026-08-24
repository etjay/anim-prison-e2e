// 邀请码绑定页。输入邀请码 -> mock 绑定接口。
// 覆盖分支：成功 / 错误邀请码 / 重复绑定（错误码对齐 T1.2 API 文档）。
const { post } = require('../../utils/request');

Page({
  data: {
    code: '',
    loading: false,
    error: '',
    errorMsg: '',
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value, error: '' });
  },

  onConfirm() {
    const code = (this.data.code || '').trim();
    if (!code) {
      this.setData({ error: '请输入邀请码' });
      return;
    }

    this.setData({ loading: true, error: '', errorMsg: '' });
    post('/api/bind', { inviteCode: code })
      .then((res) => {
        const app = getApp();
        app.globalData.bound = true;
        app.globalData.animal = res && res.animal;
        wx.showToast({ title: '绑定成功', icon: 'success' });
        wx.reLaunch({ url: '/pages/home/home' });
      })
      .catch((err) => {
        // 错误码约定（T1.2）：BIND_INVALID=错误邀请码；BIND_DUPLICATE=重复绑定。
        const code = err && err.code;
        let msg = (err && err.message) || '绑定失败，请重试';
        if (code === 'BIND_INVALID') {
          msg = '邀请码无效，请检查后重试';
        } else if (code === 'BIND_DUPLICATE') {
          msg = '该邀请码已绑定过，不可重复使用';
        }
        this.setData({ error: msg, errorMsg: code ? `[${code}] ` + msg : msg });
      })
      .finally(() => this.setData({ loading: false }));
  },

  gotoHome() {
    const app = getApp();
    app.globalData.bound = true;
    wx.reLaunch({ url: '/pages/home/home' });
  },
});