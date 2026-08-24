// 统一的 wx.request 封装：Promise 化 + baseURL 注入 + token 头。
// 骨架期接口指向本地 mock 服务（见 config/env.js）。
const env = require('../config/env');

/**
 * 发起请求。
 * @param {Object}   options
 * @param {string}   options.url     相对路径，如 '/api/auth/login'
 * @param {string}   [options.method]
 * @param {Object}   [options.data]
 * @param {Object}   [options.header]
 * @returns {Promise<any>} resolve 后端返回的 data；reject 错误（含 code）
 */
function request(options) {
  const app = getApp();
  const token = app && app.globalData ? app.globalData.token : null;

  const header = Object.assign(
    { 'content-type': 'application/json' },
    options.header || {},
  );
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  const baseURL =
    (app && app.globalData && app.globalData.baseURL) || env.baseURL;
  const url = /^https?:\/\//.test(options.url)
    ? options.url
    : baseURL + options.url;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: (options.method || 'GET').toUpperCase(),
      data: options.data,
      header,
      timeout: 10000,
      success(res) {
        // mock/后端约定：2xx 视为成功，否则 reject（透传 code/message）。
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const err = new Error((res.data && res.data.message) || `HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.code = res.data && res.data.code;
          reject(err);
        }
      },
      fail(err) {
        const e = new Error(err.errMsg || 'network error');
        e.errMsg = err.errMsg;
        reject(e);
      },
    });
  });
}

module.exports = {
  request,
  get: (url, data) => request({ url, method: 'GET', data }),
  post: (url, data) => request({ url, method: 'POST', data }),
};