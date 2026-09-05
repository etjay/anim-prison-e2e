'use strict';
// 登录态 stub（ANIM-25 T2，主修复）：IDE 冷启前向 DevTools 的 Chromium Local Storage
// leveldb 注入一份「已登录」状态，使冷启动时 redux-persist 水合出一个已登录用户，
// 未登录态（logined==="no"）下的登录/授权浮层（「更改 AppID 失败 (touristappid)」
// 对话框、扫码卡，覆盖预览区、阻塞 E2E 录像）在出现之前就被消除。
//
// 机制（T1 spike 结论，本机 msojocs 社区移植版实测）：
//   IDE 登录态 = Chromium Local Storage leveldb：
//     ~/.config/wechat-devtools/Default/Local Storage/leveldb/
//   key 编码   = `<origin前缀>\x00\x01<localStorage key>`（UTF-8），
//                origin 前缀形如 `_chrome-extension://dcegbcempgeggbinkenabmmlccogdfjm`
//                （本安装实测；随安装包确定，可用 WDT_LS_ORIGIN 覆盖）。
//   value 编码 = 1 字节类型前缀 + 载荷：0x01 = UTF-8/ASCII 串；0x00 = UTF-16LE 串
//                （reduxPersist:* 大 JSON 实测为 UTF-16LE）。
//   相关键（真实登录态实测镜像）：
//     userInfo_loginStatus / userInfo_openid / userInfo_nickName / userInfo_newticket
//     / userInfo_signature / userInfo_signatureExpiredTime / userInfo_ticketExpiredTime
//     / userInfo_isTourist / userInfo_city / userInfo_country / userInfo_province
//     / userInfo_sex / userInfo_headUrl / userInfoKeys
//     / reduxPersist:user（完整用户 JSON，含 currentUser/loginUser）
//   IDE 侧：loginStatus 缺失或 signatureExpiredTime 到期 → logined="no" →
//   「更改 AppID 失败 (touristappid)」对话框 + 登录扫码卡覆盖预览并 2s 轮询
//   （core.wxvpkg 内 checkLogined() 轮询逻辑）。
//
// 写规则（幂等，零干扰）：
//   - 仅当「未登录」时写入：userInfo_loginStatus 缺失/!=SUCCESS，或
//     signatureExpiredTime 已过期/不足 24h（到期前重写，避免长会话跨期）；
//   - 真实登录有效 → 一个字节都不碰；
//   - WDT_LOGIN_STUB=0 → 只读不写（排障/对比用）；WDT_LOGIN_STUB=force → 无条件重写。
//   - 必须在 IDE 停止后调用（leveldb 单写者锁）——ensure-devtools 在 stopAllIde 之后、
//     冷启之前调用本模块。classic-level 惰性 require：未走到写路径时零原生依赖开销。
//
// 环境变量：
//   WDT_LOGIN_STUB   默认 auto（缺登录态才写）；0=只读；force=无条件重写
//   WDT_LS_DIR       leveldb 目录覆盖（默认 <XDG_CONFIG_HOME|~/.config>/wechat-devtools/
//                    Default/Local Storage/leveldb）
//   WDT_LS_ORIGIN    origin 前缀覆盖（含前导 `_`，默认按已装包实测值）

const fs = require('fs');
const os = require('os');
const path = require('path');

// 本安装（msojocs 社区移植版）实测的 LocalStorage origin 前缀（含前导 `_`）。
// 随安装包确定；如版本漂移换了 ID，设 WDT_LS_ORIGIN 覆盖。
const DEFAULT_ORIGIN = '_chrome-extension://dcegbcempgeggbinkenabmmlccogdfjm';
// stub 签名有效期：365 天（真实登录约 1 年；远大于任何单次 E2E 运行）。
const STUB_TTL_MS = 365 * 24 * 60 * 60 * 1000;
// 低于该剩余有效期视为「即将过期」，重写 stub（24h 余量）。
const MIN_VALIDITY_MS = 24 * 60 * 60 * 1000;

function lsDir() {
  if (process.env.WDT_LS_DIR) return process.env.WDT_LS_DIR;
  const cfg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(cfg, 'wechat-devtools', 'Default', 'Local Storage', 'leveldb');
}

function origin() {
  return process.env.WDT_LS_ORIGIN || DEFAULT_ORIGIN;
}

// value 编码（与实测一致）：ASCII 串 → 0x01 + UTF-8；JSON 大值 → 0x00 + UTF-16LE。
function encAscii(s) {
  return Buffer.concat([Buffer.from([0x01]), Buffer.from(s, 'utf8')]);
}
function encUtf16(s) {
  return Buffer.concat([Buffer.from([0x00]), Buffer.from(s, 'utf16le')]);
}

// 解码值载荷（容错：未知前缀时两种编码都试）。
function decValue(buf) {
  if (!buf || buf.length < 1) return null;
  const t = buf[0];
  const payload = buf.subarray(1);
  if (t === 0x01) return payload.toString('utf8');
  if (t === 0x00) return payload.toString('utf16le');
  return payload.toString('utf8');
}

// 惰性 require + 异步 open（classic-level 构造是惰性的，必须 await db.open()）。
async function openDb(create) {
  const { ClassicLevel } = require('classic-level');
  const dir = lsDir();
  if (create) fs.mkdirSync(dir, { recursive: true });
  const db = new ClassicLevel(dir, { createIfMissing: !!create });
  await db.open();
  return db;
}

/**
 * 只读检查当前 IDE 登录态（IDE 须已停止，避免与 Chromium 抢 leveldb 写锁）。
 * 返回 { exists, loginStatus, sigExpMs, loggedIn, origin, user }：
 *   exists        leveldb 目录存在且可打开
 *   loginStatus   userInfo_loginStatus（可能 null）
 *   sigExpMs      userInfo_signatureExpiredTime 数值（可能 null）
 *   loggedIn      判定「已登录」：SUCCESS 且 sigExp > now+24h
 *   origin        动态发现的 origin 前缀（含分隔符，可能 null → 用默认）
 */
async function readLoginState() {
  const dir = lsDir();
  if (!fs.existsSync(dir)) return { exists: false, loggedIn: false };
  let db;
  try {
    db = await openDb(false);
  } catch (e) {
    return { exists: true, loggedIn: false, error: e.message };
  }
  let foundOrigin = null;
  // 动态发现 origin 前缀（版本漂移兜底）：任一带 \x00\x01 分隔符的键即含正确前缀。
  try {
    // classic-level 3.x 的 iterator 是异步迭代器（await + for await）。
    const it = await db.iterator({ keys: true, values: false });
    for await (const [k] of it) {
      const s = String(k);
      const i = s.indexOf('\u0000\u0001');
      if (i >= 0) {
        foundOrigin = s.slice(0, i + 2);
        break;
      }
    }
    if (it.close) await it.close();
  } catch (_) {
    /* 空库/格式异常：用默认 origin */
  }
  const prefix = foundOrigin || origin() + '\u0000\u0001';
  // classic-level 3.x：get 返回 Promise（值可能为 Buffer）。
  const get = async (name) => {
    try {
      const v = await db.get(prefix + name);
      return decValue(Buffer.from(v));
    } catch (_) {
      return null;
    }
  };
  const loginStatus = await get('userInfo_loginStatus');
  const sigExpRaw = await get('userInfo_signatureExpiredTime');
  const sigExpMs = sigExpRaw ? parseInt(sigExpRaw, 10) : NaN;
  const user = await get('reduxPersist:user');
  const loggedIn =
    loginStatus === 'SUCCESS' &&
    Number.isFinite(sigExpMs) &&
    sigExpMs - Date.now() > MIN_VALIDITY_MS;
  await db.close();
  return {
    exists: true,
    loggedIn,
    loginStatus,
    sigExpMs: Number.isFinite(sigExpMs) ? sigExpMs : null,
    user: user || null,
    origin: foundOrigin,
  };
}

// 无锁只读字节扫描（录像前判定遮罩用；IDE 运行时也可安全调用，因为只读文件不抢锁）。
// 保守判据：在 leveldb 的 .ldb/.log 文件中找到未压缩的 `0x01 + "SUCCESS"`（即
// userInfo_loginStatus 值）视为「疑似已登录」。leveldb 块可能 Snappy 压缩，故查不到
// 不代表一定未登录——查不到时由调用方按「未登录」处理（遮罩偏保守开启，宁遮勿漏）。
function readRawLoginState() {
  const dir = lsDir();
  const needle = Buffer.from([0x01, ...Buffer.from('SUCCESS', 'ascii')]);
  let found = false;
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (_) {
    return { exists: false, loggedIn: false };
  }
  for (const f of files) {
    if (!/\.(ldb|log)$/i.test(f)) continue;
    let buf;
    try {
      buf = fs.readFileSync(path.join(dir, f));
    } catch (_) {
      continue;
    }
    if (buf.indexOf(needle) >= 0) {
      found = true;
      break;
    }
  }
  return { exists: files.length > 0, loggedIn: found };
}

// 构造 stub 用户对象（纯 ASCII 内容，编码确定）。
function stubUser() {
  const exp = Date.now() + STUB_TTL_MS;
  const core = {
    city: 'Guangzhou',
    country: 'CN',
    headUrl: 'https://wx.qlogo.cn/mmopen/vi_32/e2e-stub-avatar/132',
    loginStatus: 'SUCCESS',
    newticket: 'e2eStubNewticket00000000000000000000000',
    nickName: 'e2e-stub',
    openid: 'oe2estub010203040506070809a',
    province: 'Guangdong',
    sex: 'male',
    signature: 'e2eStubSignature00000000000000000000000',
    signatureExpiredTime: exp,
    ticketExpiredTime: exp,
    isTourist: true,
  };
  return {
    openid: core.openid,
    headUrl: core.headUrl,
    nickName: core.nickName,
    signatureExpiredTime: exp,
    sex: core.sex,
    province: core.province,
    newticket: core.newticket,
    city: core.city,
    country: core.country,
    ticketExpiredTime: exp,
    loginStatus: 'SUCCESS',
    currentUser: core,
    loginUser: core,
    eduInfo: {},
    signature: core.signature,
    isTourist: true,
  };
}

function log(...a) {
  console.log('[login-stub]', ...a);
}

/**
 * 冷启 IDE 前确保登录态存在。必须在 stopAllIde() 之后调用（异步）。
 * 返回 { applied, loggedInBefore, reason, dir }。
 *   applied=true 表示本次写入了 stub（冷启后 IDE 以 stub 登录态启动）；
 *   loggedInBefore=true 表示写入前已有有效登录态（未做任何修改）。
 * 写失败不抛（录屏/测试不阻断）：打印警告并返回 applied=false，
 * record.js 的登录浮层兜底遮罩（ANIM-25 T3）在此路径下兜底。
 */
async function seedLoginStub() {
  const mode = (process.env.WDT_LOGIN_STUB || 'auto').trim();
  const before = await readLoginState();
  if (mode === '0') {
    log(`只读模式（WDT_LOGIN_STUB=0）：loggedIn=${before.loggedIn}`);
    return { applied: false, loggedInBefore: !!before.loggedIn, reason: 'read-only' };
  }
  if (before.loggedIn) {
    log(`已存在有效登录态（sigExp=${before.sigExpMs}），不写 stub（零干扰）`);
    return { applied: false, loggedInBefore: true, reason: 'already-logged-in' };
  }
  let db = null;
  try {
    db = await openDb(true);
    // 动态 origin：已有键时以实际键的前缀为准（版本漂移兜底），否则用默认。
    const realOrigin = before.origin || origin() + '\u0000\u0001';
    const puts = [];
    const user = stubUser();
    const fields = ['city', 'country', 'headUrl', 'loginStatus', 'newticket', 'nickName',
      'openid', 'province', 'sex', 'signature', 'signatureExpiredTime', 'ticketExpiredTime',
      'isTourist'];
    for (const f of fields) {
      puts.push(db.put(realOrigin + `userInfo_${f}`, encAscii(String(user.currentUser[f]))));
    }
    puts.push(db.put(realOrigin + 'userInfoKeys', encAscii(JSON.stringify(fields))));
    puts.push(db.put(realOrigin + 'reduxPersist:user', encUtf16(JSON.stringify(user))));
    await Promise.all(puts);
    await db.close();
    db = null;
    log(
      `已注入登录态 stub（openid=${user.openid}，有效期至 ${new Date(user.signatureExpiredTime).toISOString().slice(0, 10)}）` +
        ` → ${lsDir()}`,
    );
    return { applied: true, loggedInBefore: false, reason: mode === 'force' ? 'forced' : 'missing' };
  } catch (e) {
    try {
      if (db) await db.close();
    } catch (_) {
      /* ignore */
    }
    log(`⚠️ 注入登录态 stub 失败（${e.message}）——本轮依赖 T3 遮罩兜底`);
    return { applied: false, loggedInBefore: !!before.loggedIn, reason: `error:${e.message}` };
  }
}

module.exports = {
  lsDir,
  origin,
  readLoginState,
  readRawLoginState,
  seedLoginStub,
  _internal: { encAscii, encUtf16, decValue, stubUser },
};