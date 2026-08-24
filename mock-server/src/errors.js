'use strict';

/**
 * Error codes for the Animal Prison mock server (T1.2).
 *
 * Envelope: every response body is flat.
 *   - success: { code: 0, message: 'ok', ...payload }   (HTTP 2xx)
 *   - error:   { code: '<STRING>', message: '...' }      (HTTP non-2xx)
 *
 * String codes are the contract the committed client reads (it rejects any
 * non-2xx and inspects body.code / body.message). Keep in sync with
 * docs/api.md.
 */
const ERRORS = {
  OK: { code: 0, message: 'ok', http: 200 },

  // Login / auth
  AUTH_INVALID: { code: 'AUTH_INVALID', message: 'invalid login code or session', http: 400 },

  // Invite binding
  BIND_INVALID: { code: 'BIND_INVALID', message: 'invite code invalid', http: 400 },
  BIND_DUPLICATE: { code: 'BIND_DUPLICATE', message: 'invite code already bound', http: 409 },

  // Animal / map
  ANIMAL_NOT_FOUND: { code: 'ANIMAL_NOT_FOUND', message: 'no bound animal', http: 404 },

  // Interaction (POST /api/interaction)
  INTERACTION_NOT_IN_WINDOW: { code: 'INTERACTION_NOT_IN_WINDOW', message: 'interaction not in time window', http: 409 },
  INTERACTION_DAILY_LIMIT: { code: 'INTERACTION_DAILY_LIMIT', message: 'daily interaction limit reached', http: 409 },
  INTERACTION_IN_PROGRESS: { code: 'INTERACTION_IN_PROGRESS', message: 'interaction already in progress', http: 409 },
  INTERACTION_FAILED: { code: 'INTERACTION_FAILED', message: 'interaction failed', http: 400 },

  // Rating
  RATING_NOT_FOUND: { code: 'RATING_NOT_FOUND', message: 'no rating available', http: 404 },

  // Generic
  BAD_REQUEST: { code: 'BAD_REQUEST', message: 'bad request', http: 400 },
};

module.exports = { ERRORS };