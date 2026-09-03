// 囚犯卡片（角色资料卡）：竖版卡片，头像 + 编号（橙色高亮）+ 资料字段。
const { getById } = require('../../data/animals');

Page({
  data: { animal: null },
  onLoad(options) {
    this.setData({ animal: getById(options.id || '1024') });
  },
});
