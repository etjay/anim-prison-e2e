// 绑定页：NFC 触碰（仅安卓/鸿蒙）或邀请码输入兜底。
// demo：无 NFC 能力时给橙色引导“别急，输邀请码也能进来”；成功用本地 stub 收押。
const { post } = require('../../utils/request');
const { getAll } = require('../../data/animals');

Page({
  data: {
    code: '',
    loading: false,
    error: '',
    successName: '',
    nfcFailed: true, // demo：默认无 NFC 能力，走邀请码兜底。
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value, error: '' });
  },

  // NFC 触碰（仅安卓/鸿蒙）：demo 无真实 NFC，直接给提示并亮邀请码引导。
  onNfc() {
    this.setData({ nfcFailed: true });
    wx.showToast({ title: '当前设备不支持 NFC，改用邀请码', icon: 'none' });
  },

  // 登记入狱：优先调用 mock；失败则用本地 stub 兜底收押，保证 demo 可走通。
  onConfirm() {
    const code = (this.data.code || '').trim();
    if (!code) {
      this.setData({ error: '请输入囚犯编号（邀请码）' });
      return;
    }
    this.setData({ loading: true, error: '', successName: '' });
    post('/api/bind', { inviteCode: code })
      .then((res) => this.bindOk(res))
      .catch(() => this.bindOk(null)); // 离线兜底：仍收押第一只囚犯。
  },

  bindOk(res) {
    const app = getApp();
    // 用邀请码近似匹配囚犯；找不到则默认收押编号 1024 的“卷王”瑞克。
    const animals = getAll();
    const animal = (res && res.animal) ||
      animals.find((a) => codeMatches(this.data.code, a)) || animals[0];
    app.globalData.bound = true;
    app.globalData.animal = animal;
    this.setData({ successName: animal.name });
    wx.showToast({ title: `已收押「${animal.name}」`, icon: 'success' });
    wx.switchTab({ url: '/pages/office/office' });
  },

  gotoHome() {
    const app = getApp();
    app.globalData.bound = true;
    wx.switchTab({ url: '/pages/office/office' });
  },
});

// 邀请码含编号片段（如 ANIM-1024 或 1024）时，匹配对应囚犯。
function codeMatches(code, a) {
  const c = String(code || '');
  return c.indexOf(a.id) !== -1 || c.toLowerCase().indexOf(a.id.toLowerCase()) !== -1;
}
