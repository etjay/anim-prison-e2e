'use strict';

/**
 * dev / preview profiles (T1.2).
 *
 * The committed client (miniprogram/config/env.js) points:
 *   dev     -> http://127.0.0.1:3000
 *   preview -> http://127.0.0.1:3001
 * so each profile has a matching default port. The profiles also differ in a
 * couple of behavioral knobs so the two environments are distinguishable:
 *
 *   dev      (default): lenient login (accepts `dev:<openid>` wildcard),
 *                       no extra trace field.
 *   preview:            strict login (only fixture / stub codes),
 *                       responses carry a `requestId`.
 */
const PROFILES = {
  dev: {
    name: 'dev',
    defaultPort: 3000,
    strictLogin: false,
    includeRequestId: false,
  },
  preview: {
    name: 'preview',
    defaultPort: 3001,
    strictLogin: true,
    includeRequestId: true,
  },
};

function resolveProfile(raw) {
  const key = (raw || 'dev').toLowerCase();
  if (!PROFILES[key]) {
    throw new Error(`unknown MOCK_PROFILE "${raw}" (expected dev|preview)`);
  }
  return PROFILES[key];
}

module.exports = { PROFILES, resolveProfile };