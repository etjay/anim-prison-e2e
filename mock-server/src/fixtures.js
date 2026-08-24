'use strict';

/**
 * Default test fixtures for the Animal Prison mock server (T1.2).
 *
 * These are the alignment baseline for stage2 E2E assertions. Values here
 * MUST match docs/api.md (fixtures section).
 *
 * Contents (per task spec):
 *   - 2 test accounts (one unbound, one pre-bound)
 *   - 2 invite codes (1 unbound, 1 pre-bound)
 *   - 2 animal types
 */

// --- Animal types (2) ---------------------------------------------------
const ANIMAL_TYPES = {
  penguin: {
    type: 'penguin',
    species: '企鹅',
    emoji: '🐧',
    // Pet display name used when this type is bound.
    petName: '皮皮',
    baseSatisfaction: 55,
  },
  hamster: {
    type: 'hamster',
    species: '仓鼠',
    emoji: '🐹',
    petName: '团团',
    baseSatisfaction: 50,
  },
};

// --- Test accounts (2) --------------------------------------------------
// The committed client (miniprogram/pages/login) always logs in with the
// fixed stub code below and routes by the returned `bound` flag.
const STUB_LOGIN_CODE = 'stub-wechat-code';

const ACCOUNTS = [
  {
    // Default for the stub login code — starts UNBOUND so the client routes
    // to the welcome page (happy path: welcome -> bind -> home).
    userId: 'user_10001',
    openid: 'test_openid_0001',
    loginCode: 'code_user_10001',
    nickname: '测试选手A',
    avatar: 'https://mock.local/avatar/a.png',
    bound: false,
  },
  {
    // Pre-bound (via INVITE-BRAVO) — used for the "already bound -> home"
    // routing and the "duplicate bind" branch.
    userId: 'user_10002',
    openid: 'test_openid_0002',
    loginCode: 'code_user_10002',
    nickname: '测试选手B',
    avatar: 'https://mock.local/avatar/b.png',
    bound: true,
  },
];

// --- Invite codes (2): 1 unbound, 1 pre-bound ---------------------------
const INVITE_CODES = [
  {
    // Unbound — the happy-path / E2E bind target.
    code: 'INVITE-ALPHA',
    animalType: 'penguin',
    bound: false,
    boundUserId: null,
    boundAt: null,
  },
  {
    // Pre-bound to user_10002 — exercises the "already bound" branch.
    code: 'INVITE-BRAVO',
    animalType: 'hamster',
    bound: true,
    boundUserId: 'user_10002',
    boundAt: '2026-01-01T00:00:00.000Z',
  },
];

const DEFAULT_FIXTURES = {
  animalTypes: ANIMAL_TYPES,
  stubLoginCode: STUB_LOGIN_CODE,
  accounts: ACCOUNTS,
  inviteCodes: INVITE_CODES,
};

module.exports = { DEFAULT_FIXTURES, STUB_LOGIN_CODE };