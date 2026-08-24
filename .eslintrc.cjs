/* ESLint 配置（CommonJS，eslint 8）。
 * 覆盖 miniprogram/ 与 scripts/ 下的 JS。小程序全局对象（wx/App/Page/getApp 等）
 * 在 globals 中声明，避免 no-undef。
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },
  globals: {
    // 微信原生小程序全局 API / 构造器
    wx: 'readonly',
    App: 'readonly',
    Page: 'readonly',
    Component: 'readonly',
    Behavior: 'readonly',
    getApp: 'readonly',
    getCurrentPages: 'readonly',
    AppService: 'readonly',
    // 小程序常见注入对象
    PageMixin: 'readonly',
    requirePlugin: 'readonly',
  },
  extends: ['eslint:recommended'],
  overrides: [
    // Jest 单测（e2e/）：jest 全局（describe/test/expect/beforeAll 等）。
    {
      files: ['e2e/**/*.test.js'],
      env: { jest: true, node: true },
    },
  ],
  rules: {
    semi: ['error', 'always'],
    'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_' }],
    'no-console': 'off',
    eqeqeq: ['warn', 'smart'],
    'no-undef': 'error',
  },
  ignorePatterns: ['node_modules/', 'miniprogram/miniprogram_npm/'],
};