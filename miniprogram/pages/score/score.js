// 等级 / 评分页：账号外显等级 + 监狱经营评分 + 8 档升级门槛。
// demo 读本地 stub（data/score.js），橙框突出当前等级徽章。
const { LEVELS, STUB_PROFILE, getProfile } = require('../../data/score');

Page({
  data: {
    profile: null,
    levels: [],
    satisfaction: STUB_PROFILE.satisfaction,
    interactions: STUB_PROFILE.interactions,
  },

  onLoad() {
    this.refresh();
  },

  refresh() {
    const profile = getProfile();
    // 给每档补一个“是否当前档 / 是否已解锁 / 进度条”标记。
    const levels = LEVELS.map((l) => {
      const isCurrent = l.level === profile.level;
      const unlocked = profile.points >= l.min;
      let percent = 0;
      if (isCurrent) {
        percent = profile.percent;
      } else if (unlocked) {
        percent = 100;
      }
      return {
        level: l.level,
        name: l.name,
        min: l.min,
        isCurrent,
        unlocked,
        percent,
      };
    });
    this.setData({ profile, levels });
  },
});
