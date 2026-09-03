// 帮助 / FAQ：常见问题可展开，含绑定 / 互动 / 评分说明。本地 stub。
Page({
  data: {
    faqs: [
      {
        id: 'bind',
        q: '怎么绑定一只小动物（囚犯）？',
        a: '在「牢房」页点“去绑定”，或用 NFC 贴一下手办、输入邀请码即可登记入狱。demo 里可直接输编号提交。',
        open: false,
      },
      {
        id: 'feed',
        q: '喂食什么时候能点？',
        a: '喂食只在餐点开放：早餐 07:00-09:30 / 午餐 12:00-13:30 / 晚餐 18:00-19:30。非时段按钮会变灰。',
        open: false,
      },
      {
        id: 'interact',
        q: '放风和陪玩每天有次数限制吗？',
        a: '有。每只囚犯每天 喂食 2 次、放风 1 次、陪玩 3 次。用完就等明天，别让囚犯闹情绪。',
        open: false,
      },
      {
        id: 'score',
        q: '经营评分和等级怎么算？',
        a: '喂食 / 放风 / 陪玩 / 事件都会累积经营积分，积分决定你的外显等级（共 8 档）。满意度和事件结果影响评分。',
        open: false,
      },
      {
        id: 'event',
        q: '随机事件有什么用？',
        a: '事件会给你几个分支选择，选对了加好感加积分，选错了可能扣分。天天都是运气在上班。',
        open: false,
      },
      {
        id: 'share',
        q: '成就怎么分享？',
        a: '在「成就墙」点亮某条成就后点“分享”，会生成一张卡片，可保存到相册发给街坊。',
        open: false,
      },
      {
        id: 'privacy',
        q: '我的数据安全吗？',
        a: 'demo 阶段数据全部保存在本机。正式版只收集微信身份用于绑定与同步，不做他用（见隐私协议）。',
        open: false,
      },
    ],
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    const faqs = this.data.faqs.map((f) =>
      f.id === id ? Object.assign({}, f, { open: !f.open }) : f,
    );
    this.setData({ faqs });
  },

  onContact() {
    wx.showToast({ title: '客服：看守大人（演示）', icon: 'none' });
  },
});
