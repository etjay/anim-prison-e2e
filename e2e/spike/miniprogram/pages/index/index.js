// 计数按钮：data.count 在页面内维护，tap 后 +1（供 spike 断言 data 变化）。
// greeting 为数据驱动的文案，供 spike 断言 "Hello ANIM" 存在。
Page({
  data: {
    greeting: 'Hello ANIM',
    count: 0,
  },
  onTap() {
    this.setData({ count: this.data.count + 1 });
  },
});