// 多环境配置：dev / preview 可切换后端 baseURL。
//
// 用法：
//   1. 直接改 CURRENT_ENV 常量切换环境（本地最省事）。
//   2. 或在 DevTools 的「编译模式」中为不同模式设置，然后在此读取（见下方说明）。
//
// 后端（mock-server / T1.2）约定：
//   dev     -> 本地开发 mock 服务，默认 http://127.0.0.1:3000
//   preview -> 预览/预发环境，默认仍是本地，但可指向另一端口或远程 mock。
//
// 说明：小程序内 wx.request 的跨域需在 DevTools 勾选「不校验合法域名」
//（http 而非 https），或由 mock-server 提供 https。见 docs/environment.md。

const CURRENT_ENV = 'dev'; // 切换：'dev' | 'preview'

const BASE_URLS = {
  dev: 'http://127.0.0.1:3000',
  // 预览环境：默认可指向另一个本地端口或远程 mock 地址，便于区分环境。
  preview: 'http://127.0.0.1:3001',
};

const env = BASE_URLS[CURRENT_ENV] ? CURRENT_ENV : 'dev';

module.exports = {
  env,
  baseURL: BASE_URLS[env],
  BASE_URLS,
};