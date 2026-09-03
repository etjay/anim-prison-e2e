// 牢房详情（核心互动）：大头像 + 满意度 + 喂食/放风/陪玩三项剩余次数 + 结果卡。
// 互动直接在本地 stub 数据上跑通（更新剩余次数 + 满意度 + 语料气泡）。
const { getById } = require('../../data/animals');
const { feedWindowOpen } = require('../../data/feedWindow');

// 每种互动的常数：Δ好感 / 得分 / 时段提示。
const ACTIONS = {
  feed: { label: '喂食', emoji: '🍲', delta: 6, score: 5, windowTip: '现在不是饭点，等等再喂（喂食仅限餐点）。' },
  walk: { label: '放风', emoji: '🏃', delta: 4, score: 5, windowTip: '今日放风次数用完了。' },
  play: { label: '陪玩', emoji: '🎮', delta: 5, score: 4, windowTip: '今日陪玩次数用完了。' },
};

Page({
  data: {
    animal: null,
    actions: [],
    result: null, // { delta, score, corpus, actionLabel, emoji }
    feedWindow: true,
  },

  onLoad(options) {
    this.animalId = options.id || '1024';
    this.refresh();
  },

  refresh() {
    const animal = getById(this.animalId);
    const feedWindow = feedWindowOpen();
    const actions = Object.keys(ACTIONS).map((key) => {
      const conf = ACTIONS[key];
      const remain = animal.interactions[key];
      // 喂食在非时段视为不可用（其余按剩余次数判断）。
      const available = key === 'feed' ? (remain > 0 && feedWindow) : remain > 0;
      return {
        key,
        label: conf.label,
        emoji: conf.emoji,
        remain,
        available,
        windowTip: conf.windowTip,
      };
    });
    this.setData({ animal, actions, feedWindow });
  },

  onAction(e) {
    const key = e.currentTarget.dataset.key;
    const conf = ACTIONS[key];
    const animal = this.data.animal;
    const remain = animal.interactions[key];
    const available = this.data.actions.find((a) => a.key === key).available;

    if (!available) {
      wx.showToast({ title: conf.windowTip, icon: 'none' });
      return;
    }

    // 更新本地状态：剩余次数 -1，满意度按 Δ 上调（上限 100）。
    const newRemain = remain - 1;
    const newSatisfaction = Math.min(100, animal.satisfaction + conf.delta);
    const corpus = animal.corpus[Math.floor(Math.random() * animal.corpus.length)];

    // 回写 data 模块（让其它页面共享同一份“今日剩余次数”）。
    animal.interactions[key] = newRemain;
    animal.satisfaction = newSatisfaction;

    this.setData({
      result: {
        actionLabel: conf.label,
        emoji: conf.emoji,
        delta: conf.delta,
        score: conf.score,
        corpus,
      },
      'animal.interactions': animal.interactions,
      'animal.satisfaction': newSatisfaction,
    });

    this.refresh();
  },

  gotoCard() {
    wx.navigateTo({ url: `/pages/card/card?id=${this.animalId}` });
  },
});
