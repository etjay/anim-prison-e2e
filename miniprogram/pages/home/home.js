// 首页：地图 + 动物卡片。加载动物/地图数据（GET /api/animal）。
// 提供 stub 兜底数据，保证 mock-server 未启动时页面仍可手动走通。
const { get } = require('../../utils/request');

const STUB_ANIMAL = {
  name: '皮皮兔',
  species: 'rabbit',
  emoji: '🐰',
  mood: 80,
};
const STUB_MAP = ['🌳', '🏠', '🍲', '🪺', '🌿', '🛖'];

Page({
  data: {
    animal: null,
    cells: [],
    loading: true,
    error: '',
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: '' });
    get('/api/animal')
      .then((res) => {
        const animal = (res && res.animal) || STUB_ANIMAL;
        const cells = (res && res.map && res.map.cells) || STUB_MAP;
        const app = getApp();
        app.globalData.animal = animal;
        app.globalData.map = { cells };
        this.setData({ animal, cells, loading: false });
      })
      .catch(() => {
        // 离线兜底：仍展示 stub 数据，保证可手动走通。
        this.setData({
          animal: STUB_ANIMAL,
          cells: STUB_MAP,
          loading: false,
          error: '未连接到 mock 服务，展示内置数据',
        });
      });
  },

  gotoCanteen() {
    wx.navigateTo({ url: '/pages/canteen/canteen' });
  },

  gotoLogin() {
    wx.reLaunch({ url: '/pages/login/login' });
  },
});