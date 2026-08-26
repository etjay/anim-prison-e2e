'use strict';

/**
 * Time helpers for the mock server (T1.2).
 *
 * All time-window / daily-limit logic is authoritative in UTC+8. The server
 * clock can be overridden per request (header `X-Mock-Now`) or globally
 * (env `MOCK_DEFAULT_NOW`); otherwise a deterministic default (inside a feed
 * window) is used so tests are reproducible.
 */
const {
  TZ_OFFSET_MIN,
  FEED_WINDOWS,
  EXERCISE_SUGGESTED,
  PLAY_NIGHT_START,
  PLAY_NIGHT_END,
} = require('./config');

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Resolve the effective "now" for a request.
 * @param {Object} req express request (reads X-Mock-Now header)
 * @param {string} [defaultNow] override default (from env)
 * @returns {Date}
 */
function effectiveNow(req, defaultNow) {
  const header = req ? req.get('x-mock-now') : undefined;
  if (header && header.trim()) return parseTime(header.trim());
  const dflt = (defaultNow && defaultNow.trim()) || require('./config').DEFAULT_NOW;
  return parseTime(dflt);
}

/** Parse an RFC3339 string (with/without offset) or epoch ms into a Date. */
function parseTime(value) {
  const asNum = Number(value);
  if (!Number.isNaN(asNum) && /^\d+$/.test(String(value).trim())) {
    return new Date(asNum);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid time value: ${value}`);
  }
  return d;
}

/**
 * Project a Date into UTC+8 and return clock fields.
 * @returns {{hour:number, minute:number, minutes:number, dateKey:string}}
 */
function inUTC8(date) {
  const t = date.getTime() + TZ_OFFSET_MIN * 60 * 1000;
  const z = new Date(t);
  return {
    hour: z.getUTCHours(),
    minute: z.getUTCMinutes(),
    minutes: z.getUTCHours() * 60 + z.getUTCMinutes(),
    dateKey: `${z.getUTCFullYear()}-${pad(z.getUTCMonth() + 1)}-${pad(z.getUTCDate())}`,
  };
}

function inWindow(minutes, win) {
  return minutes >= win.start && minutes < win.end;
}

function isFeedWindow(minutes) {
  return FEED_WINDOWS.some((w) => inWindow(minutes, w));
}

function isExerciseSuggested(minutes) {
  return inWindow(minutes, EXERCISE_SUGGESTED);
}

function isPlayNight(minutes) {
  // Night = 22:00–24:00 or 00:00–07:00.
  return minutes >= PLAY_NIGHT_START || minutes < PLAY_NIGHT_END;
}

/**
 * 语料 daypart 四段（M8，docs/corpus-system.md §2.2 对齐 ANIM-16 §2.2：
 * 白天 10–22 / 夜间 22–07；早段取 07–10）。
 * morning 07:00–10:00 / noon 10:00–15:00 / evening 15:00–22:00 / night 22:00–07:00。
 */
function daypartFor(minutes) {
  if (minutes >= 7 * 60 && minutes < 10 * 60) return 'morning';
  if (minutes >= 10 * 60 && minutes < 15 * 60) return 'noon';
  if (minutes >= 15 * 60 && minutes < 22 * 60) return 'evening';
  return 'night';
}

/** 满意度档位（ANIM-16 §1.4，语料触发共用）：低 0–29 / 中 30–69 / 高 70–100。 */
function tierFor(satisfaction) {
  const s = Number(satisfaction) || 0;
  if (s >= 70) return 'high';
  if (s >= 30) return 'mid';
  return 'low';
}

module.exports = {
  effectiveNow,
  parseTime,
  inUTC8,
  isFeedWindow,
  isExerciseSuggested,
  isPlayNight,
  daypartFor,
  tierFor,
};