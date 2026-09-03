// 动物镇（tab）：发布/浏览成就事件、点赞。demo 用本地 stub feed。
const { getAll } = require('../../data/animals');

// stub 街坊动态（发布者 + 内容 + 点赞）。未连接 mock 时仍可浏览/点赞。
function stubFeed() {
  const a = getAll();
  return a.map((animal, i) => ({
    id: 'post_' + i,
    publisher: `${animal.emoji} ${animal.name}`,
    content: animalPost(animal),
    likes: (animal.satisfaction % 20) + 3,
    liked: false,
  }));
}

function animalPost(a) {
  switch (a.id) {
    case '1024': return '今日总结：蹲牢 +1，加班 +2，快乐 -3。领导放心。';
    case '1001': return '公告：食堂仓库最后一格奶酪，本座已于今日封存。';
    case '0707': return '预告第八次越狱，装备齐全，就等看守换岗。';
    case '0001': return '今日气温 28°，本人已进入低温模式。勿扰。';
    default: return '汪！今天也在看大门，谁想排队进来？';
  }
}

Page({
  data: {
    feed: [],
    publishing: false,
  },

  onShow() {
    if (this.data.feed.length === 0) {
      this.setData({ feed: stubFeed() });
    }
  },

  onLike(e) {
    const index = e.currentTarget.dataset.index;
    const feed = this.data.feed.slice();
    feed[index] = {
      ...feed[index],
      liked: !feed[index].liked,
      likes: feed[index].likes + (feed[index].liked ? -1 : 1),
    };
    this.setData({ feed });
  },

  onPublish() {
    wx.showToast({ title: '已广播出去', icon: 'success' });
    const feed = this.data.feed.slice();
    feed.unshift({
      id: 'post_new_' + Date.now(),
      publisher: '🕵️ 现任典狱长',
      content: '监狱通告：今晚放风取消，改为集体静坐。',
      likes: 0,
      liked: false,
    });
    this.setData({ feed });
  },
});
