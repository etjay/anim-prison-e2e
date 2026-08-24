// 食堂页：一次互动（喂食）+ 评分/满意度查询。
// 提交互动 POST /api/interaction；查询评分 GET /api/rating。
const { post, get } = require('../../utils/request');

const STUB_RATING = { score: 4.2, satisfaction: 90, count: 128 };

Page({
  data: {
    animalName: '',
    rating: null,
    submitting: false,
    loaded: false,
    resultMsg: '',
    error: '',
  },

  onShow() {
    const app = getApp();
    const animal = app.globalData.animal;
    this.setData({
      animalName: animal && animal.name ? animal.name : '皮皮兔',
    });
    this.loadRating();
  },

  loadRating() {
    get('/api/rating')
      .then((res) => {
        const rating = (res && res.rating) || res || STUB_RATING;
        this.setData({ rating, loaded: true });
      })
      .catch(() => {
        // 离线兜底：展示内置评分，保证可手动走通。
        this.setData({ rating: STUB_RATING, loaded: true, error: '未连接到 mock 服务，展示内置评分' });
      });
  },

  onFeed() {
    const app = getApp();
    this.setData({ submitting: true, resultMsg: '', error: '' });
    post('/api/interaction', {
      animalId: app.globalData.animal && app.globalData.animal.id,
      action: 'feed',
    })
      .then(() => {
        this.setData({ resultMsg: '喂食成功！小动物心情 +10' });
        this.loadRating();
      })
      .catch((err) => {
        this.setData({ resultMsg: '', error: (err && err.message) || '互动提交失败' });
      })
      .finally(() => this.setData({ submitting: false }));
  },
});