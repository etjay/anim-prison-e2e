// 隐私页：登录/绑定前同意协议。同意 -> 绑定；拒绝 -> 返回登录。
Page({
  data: {},
  onAccept() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },
  onDecline() {
    wx.showToast({ title: '不同意将无法绑定', icon: 'none' });
    setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 900);
  },
  gotoLogin() {
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
