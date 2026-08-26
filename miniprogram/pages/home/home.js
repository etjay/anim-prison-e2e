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
// M8（ANIM-15）离线兜底：mock 未启动时仍能看到语料气泡（真实场景由 GET /api/animal.corpus 返回）。
const STUB_CORPUS = {
  text: '（探出爪子看看你）今天也在牢里待着呢？',
  source: 'rule',
  itemId: 'stub_corpus',
  ctx: null,
};

Page({
  data: {
    animal: null,
    cells: [],
    corpus: null,
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
        // M8（ANIM-15）：环境/主动语料（scene=enter）随动物数据返回，客户端只渲染 text。
        const corpus = (res && res.corpus) || null;
        const app = getApp();
        app.globalData.animal = animal;
        app.globalData.map = { cells };
        app.globalData.corpus = corpus;
        this.setData({ animal, cells, corpus, loading: false });
      })
      .catch(() => {
        // 离线兜底：仍展示 stub 数据 + 内置语料，保证可手动走通。
        this.setData({
          animal: STUB_ANIMAL,
          cells: STUB_MAP,
          corpus: STUB_CORPUS,
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