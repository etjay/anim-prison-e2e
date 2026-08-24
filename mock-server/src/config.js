'use strict';

/**
 * Mock-server tuning constants (T1.2).
 *
 * Values are the E2E assertion baseline and align with:
 *   - the committed miniprogram client contract (mock-server/README.md table), and
 *   - docs/gameplay/prison-interactions.md v1.0 (ANIM-13) — the /api/interaction
 *     time-window / daily-limit / ΔS / 行为分 spec.
 *
 * Keep in sync with docs/api.md.
 */

// Actions supported by POST /api/interaction.
const ACTIONS = ['feed', 'exercise', 'play'];

// All time logic is authoritative in UTC+8 (per gameplay baseline).
const TZ_OFFSET_MIN = 8 * 60;

// Feed = hard gate: only these meal windows (minutes-of-day, UTC+8).
const FEED_WINDOWS = [
  { start: 7 * 60, end: 9 * 60 }, // 07:00–09:00
  { start: 11 * 60 + 30, end: 13 * 60 }, // 11:30–13:00
  { start: 17 * 60 + 30, end: 19 * 60 }, // 17:30–19:00
];

// Exercise = soft gate: suggested window earns w_t 1.2, otherwise 1.0.
const EXERCISE_SUGGESTED = { start: 15 * 60, end: 17 * 60 }; // 15:00–17:00

// Play = soft gate: night (22:00–07:00) earns w_t 0.8, day earns 1.0.
const PLAY_NIGHT_START = 22 * 60; // 22:00
const PLAY_NIGHT_END = 7 * 60; // 07:00

// Per-day, per-animal interaction limits (gameplay baseline §1.2/§2.5).
const DAILY_LIMITS = { feed: 3, exercise: 2, play: 3 };

// Base ΔS per action (gameplay baseline; 喜好/性格 k held at 1.0/×1.0 in mock).
const BASE_DELTA_S = { feed: 6, exercise: 5, play: 5 };

// Base 行为分 (points) per action, scaled by w_t and c_S.
const BASE_POINTS = 5;

// Time-of-day weights (w_t).
const WT = {
  feed: 1.5,
  exerciseSuggested: 1.2,
  exerciseOther: 1.0,
  playDay: 1.0,
  playNight: 0.8,
};

// Per-day satisfaction (ΔS) and 行为分 (points) caps per animal.
const DAILY_DELTA_S_CAP = 15;
const DAILY_POINTS_CAP = 50;

// Satisfaction-tier coefficient c_S (gameplay baseline §1.4).
const CS_TIERS = [
  { min: 80, cs: 1.2 },
  { min: 60, cs: 1.0 },
  { min: 0, cs: 0.8 },
];

// Deterministic default server clock (UTC+8). Inside the 11:30–13:00 feed
// window and a daytime play window, so the stage1 client's feed happy path
// succeeds out of the box. Override per-request with the `X-Mock-Now` header
// or globally via MOCK_DEFAULT_NOW (see docs/api.md).
const DEFAULT_NOW = '2026-01-15T12:00:00+08:00';

// Camp map cells rendered by the home page (matches client offline stub shape).
const MAP = {
  id: 'campus_1',
  name: '校园主地图',
  cells: ['🌳', '🏠', '🍲', '🪺', '🌿', '🛖'],
};

module.exports = {
  ACTIONS,
  TZ_OFFSET_MIN,
  FEED_WINDOWS,
  EXERCISE_SUGGESTED,
  PLAY_NIGHT_START,
  PLAY_NIGHT_END,
  DAILY_LIMITS,
  BASE_DELTA_S,
  BASE_POINTS,
  WT,
  DAILY_DELTA_S_CAP,
  DAILY_POINTS_CAP,
  CS_TIERS,
  DEFAULT_NOW,
  MAP,
};