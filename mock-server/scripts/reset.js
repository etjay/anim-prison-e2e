'use strict';

/**
 * Single-script fixture reset (T1.2 acceptance: "fixtures 可用单脚本重置").
 *
 * Always prints the canonical (pristine) fixture state from a fresh in-memory
 * Store. If a live server is reachable (env MOCK_RESET_URL, default
 * http://127.0.0.1:3000) it also POSTs /api/reset to return that instance to
 * the same baseline. Unreachable server is not an error.
 */
const { Store } = require('../src/store');

const store = new Store();
store.reset();
const summary = store.summary();

console.log('=== canonical fixture reset (in-memory) ===');
console.log(JSON.stringify(summary, null, 2));

const url = process.env.MOCK_RESET_URL || 'http://127.0.0.1:3000';

async function resetLive() {
  try {
    const res = await fetch(`${url}/api/reset`, { method: 'POST' });
    const body = await res.json();
    console.log(`\n=== live server reset at ${url} (HTTP ${res.status}) ===`);
    console.log(JSON.stringify(body, null, 2));
  } catch (err) {
    console.log(
      `\n(live server at ${url} not reachable: ${err.message} — in-memory reset above is the canonical baseline)`
    );
  }
}

if (!process.env.MOCK_RESET_OFF) {
  resetLive();
}