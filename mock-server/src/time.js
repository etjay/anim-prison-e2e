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

module.exports = {
  effectiveNow,
  parseTime,
  inUTC8,
  isFeedWindow,
  isExerciseSuggested,
  isPlayNight,
};