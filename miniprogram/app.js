// 应用入口
// 全局共享状态：登录会话、绑定状态、当前环境 baseURL。
const env = require('./config/env');

App({
  globalData: {
    // 当前环境名（'dev' | 'preview'）与对应后端 baseURL，来源于 config/env.js。
    env: env.env,
    baseURL: env.baseURL,
    // stub 登录后的会话 token（真实场景由 wx.login + 后端换取）。
    token: null,
    // 是否已绑定小动物（决定进入 welcome 还是 home）。
    bound: false,
    // 当前绑定/加载的动物 + 地图数据（stub 展示用）。
    animal: null,
    map: null,
    // M8（ANIM-15）：最近一条环境/主动语料，服务端权威返回；客户端只渲染 text。
    corpus: null,
  },

  onLaunch() {
    // 首次启动：若已有 token 但状态未知，可在此触发一次登录/绑定查询。
    // 本期为骨架，仅记录环境信息便于排查。
    console.log('[anim-prison] launched, env=%s baseURL=%s', env.env, env.baseURL);
  },
});