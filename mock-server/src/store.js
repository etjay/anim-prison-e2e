'use strict';

const { DEFAULT_FIXTURES, STUB_LOGIN_CODE } = require('./fixtures');
const { ERRORS } = require('./errors');
const {
  ACTIONS,
  DAILY_LIMITS,
  BASE_DELTA_S,
  BASE_POINTS,
  WT,
  DAILY_DELTA_S_CAP,
  DAILY_POINTS_CAP,
  CS_TIERS,
  MAP,
} = require('./config');
const time = require('./time');

/**
 * In-memory data store for the mock server (T1.2).
 *
 * State is a clone of the fixtures, mutated by bind / interact. No
 * persistence: restart or reset() returns to the default fixtures — exactly
 * what the E2E flow wants between runs.
 */
class Store {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      animalTypes: clone(DEFAULT_FIXTURES.animalTypes),
      accounts: clone(DEFAULT_FIXTURES.accounts),
      inviteCodes: clone(DEFAULT_FIXTURES.inviteCodes),
      sessions: {}, // token -> { userId }
      animals: {}, // userId -> animal
    };
    // Pre-seed the pre-bound account's animal so /api/animal and /api/rating
    // work for it out of the box.
    const preBound = this.state.accounts.find((a) => a.bound);
    if (preBound) {
      const code = this.state.inviteCodes.find((c) => c.boundUserId === preBound.userId);
      if (code) this.bindAnimal(preBound.userId, code);
    }
    return this.state;
  }

  // --- lookups ----------------------------------------------------------
  animalType(type) {
    return this.state.animalTypes[type] || null;
  }
  accountByUserId(userId) {
    return this.state.accounts.find((a) => a.userId === userId) || null;
  }
  accountByLoginCode(code) {
    return this.state.accounts.find((a) => a.loginCode === code) || null;
  }
  accountByStubCode(code) {
    if (code === STUB_LOGIN_CODE) {
      return this.state.accounts.find((a) => !a.bound) || this.state.accounts[0] || null;
    }
    return null;
  }
  inviteByCode(code) {
    return this.state.inviteCodes.find((c) => c.code === code) || null;
  }

  /** Register an ad-hoc account (dev-profile `dev:<openid>` wildcard). */
  addAccount(account) {
    if (!this.state.accounts.find((a) => a.userId === account.userId)) {
      this.state.accounts.push(account);
    }
    return this.state.accounts.find((a) => a.userId === account.userId);
  }

  // --- sessions ---------------------------------------------------------
  createSession(userId) {
    const token = `mock_session_${userId}`;
    this.state.sessions[token] = { userId, createdAt: new Date().toISOString() };
    return token;
  }
  sessionUser(token) {
    const s = this.state.sessions[token];
    return s ? s.userId : null;
  }

  // --- binding ----------------------------------------------------------
  animalForUser(userId) {
    return this.state.animals[userId] || null;
  }

  /** Create and register a bound animal for a user (internal, no validation). */
  bindAnimal(userId, invite) {
    const type = this.animalType(invite.animalType);
    const now = new Date().toISOString();
    const animal = {
      id: `animal_${userId}`,
      name: type.petName,
      species: type.species,
      type: type.type,
      emoji: type.emoji,
      satisfaction: type.baseSatisfaction,
      mood: type.baseSatisfaction, // display alias for the client
      points: 0,
      interactions: 0,
      daily: { dateKey: '', counts: { feed: 0, exercise: 0, play: 0 }, deltaS: 0, points: 0 },
      boundAt: now,
      lastInteractionAt: null,
      _req: {},
    };
    invite.bound = true;
    invite.boundUserId = userId;
    if (!invite.boundAt) invite.boundAt = now;
    this.state.animals[userId] = animal;
    return animal;
  }

  /**
   * Validate + bind. Returns { ok, animal } or { error: ERRORS[key] }.
   */
  bind(userId, inviteCode) {
    if (this.animalForUser(userId)) {
      return { error: ERRORS.BIND_DUPLICATE, data: { reason: 'user_already_bound' } };
    }
    const invite = this.inviteByCode(inviteCode);
    if (!invite) {
      return { error: ERRORS.BIND_INVALID, data: { reason: 'not_found', code: inviteCode } };
    }
    if (invite.bound) {
      return {
        error: ERRORS.BIND_DUPLICATE,
        data: { reason: 'invite_already_bound', code: inviteCode, boundUserId: invite.boundUserId },
      };
    }
    const animal = this.bindAnimal(userId, invite);
    return { ok: true, animal };
  }

  // --- interaction ------------------------------------------------------
  /**
   * Apply a cafeteria interaction with time-window + daily-limit + w_t +
   * ΔS/points caps + requestId idempotency (gameplay baseline ANIM-13).
   * @returns {{ok, result} | {error: ERRORS[key], data?}}
   */
  interact(userId, { action, animalId, requestId }, now) {
    const animal = this.animalForUser(userId);
    if (!animal) return { error: ERRORS.INTERACTION_FAILED, data: { reason: 'no_animal' } };
    if (!ACTIONS.includes(action)) {
      return { error: ERRORS.INTERACTION_FAILED, data: { reason: 'invalid_action', allowed: ACTIONS } };
    }
    if (animalId && animalId !== animal.id) {
      return { error: ERRORS.INTERACTION_FAILED, data: { reason: 'animal_id_mismatch', expected: animal.id } };
    }

    const clock = time.inUTC8(now);

    // Daily rollover (UTC+8 date boundary).
    if (animal.daily.dateKey !== clock.dateKey) {
      animal.daily = { dateKey: clock.dateKey, counts: { feed: 0, exercise: 0, play: 0 }, deltaS: 0, points: 0 };
    }

    // Idempotency (F4): a previously-processed requestId returns its result.
    if (requestId && animal._req[requestId]) {
      return { ok: true, result: Object.assign({}, animal._req[requestId], { idempotent: true }) };
    }

    // Time window: feed is a hard gate; exercise/play are soft (always allowed).
    if (action === 'feed' && !time.isFeedWindow(clock.minutes)) {
      return {
        error: ERRORS.INTERACTION_NOT_IN_WINDOW,
        data: { action, windows: ['07:00-09:00', '11:30-13:00', '17:30-19:00'] },
      };
    }

    // Daily limit.
    const limit = DAILY_LIMITS[action];
    if (animal.daily.counts[action] >= limit) {
      return {
        error: ERRORS.INTERACTION_DAILY_LIMIT,
        data: { action, limit, remaining: 0 },
      };
    }

    // Weights.
    const w_t =
      action === 'feed'
        ? WT.feed
        : action === 'exercise'
          ? (time.isExerciseSuggested(clock.minutes) ? WT.exerciseSuggested : WT.exerciseOther)
          : (time.isPlayNight(clock.minutes) ? WT.playNight : WT.playDay);

    // Satisfaction-tier coefficient c_S from CURRENT (pre-action) satisfaction.
    const cS = cSFor(animal.satisfaction);

    // ΔS (base, ×1.0 喜好/性格 in mock) with daily cap.
    const rawDeltaS = BASE_DELTA_S[action];
    const deltaS = Math.max(0, Math.min(rawDeltaS, DAILY_DELTA_S_CAP - animal.daily.deltaS));

    // 行为分 (points) with daily cap; round to 1 decimal.
    const rawPoints = BASE_POINTS * w_t * cS;
    const points = round1(Math.min(rawPoints, DAILY_POINTS_CAP - animal.daily.points));

    // Apply.
    animal.satisfaction = clampPct(animal.satisfaction + deltaS);
    animal.mood = animal.satisfaction;
    animal.points = round1(animal.points + points);
    animal.interactions += 1;
    animal.daily.counts[action] += 1;
    animal.daily.deltaS += deltaS;
    animal.daily.points = round1(animal.daily.points + points);
    animal.lastInteractionAt = now.toISOString();

    const result = {
      ok: true,
      deltaS,
      points,
      w_t,
      remaining: limit - animal.daily.counts[action],
      satisfaction: animal.satisfaction,
      pointsTotal: animal.points,
      animalId: animal.id,
      action,
      message: messageFor(action),
    };
    if (requestId) animal._req[requestId] = result;
    return { ok: true, result };
  }

  // --- rating -----------------------------------------------------------
  rating(userId) {
    const animal = this.animalForUser(userId);
    if (!animal) return null;
    return {
      score: round1(animal.satisfaction / 20), // 0–5 star scale
      satisfaction: animal.satisfaction, // S (0–100)
      count: animal.interactions, // total interactions
      points: animal.points, // P (cumulative 行为分)
    };
  }

  // --- data for /api/animal --------------------------------------------
  animalData(userId) {
    const animal = this.animalForUser(userId);
    if (!animal) return null;
    return { animal, map: MAP, bound: true };
  }

  // --- snapshot for reset/reporting -------------------------------------
  summary() {
    return {
      resetAt: new Date().toISOString(),
      stubLoginCode: STUB_LOGIN_CODE,
      accounts: this.state.accounts.map((a) => ({
        userId: a.userId,
        openid: a.openid,
        loginCode: a.loginCode,
        nickname: a.nickname,
        bound: !!this.animalForUser(a.userId),
      })),
      inviteCodes: this.state.inviteCodes.map((c) => ({
        code: c.code,
        animalType: c.animalType,
        bound: c.bound,
        boundUserId: c.boundUserId,
      })),
      animalTypes: Object.values(this.state.animalTypes).map((t) => ({
        type: t.type,
        species: t.species,
        emoji: t.emoji,
      })),
      map: MAP,
    };
  }
}

function cSFor(sat) {
  for (const t of CS_TIERS) if (sat >= t.min) return t.cs;
  return 0.8;
}
function clampPct(n) {
  return Math.max(0, Math.min(100, n));
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function messageFor(action) {
  return action === 'feed' ? '喂食成功' : action === 'exercise' ? '放风成功' : '陪玩成功';
}
function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

module.exports = { Store };