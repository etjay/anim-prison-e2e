'use strict';

const { buildApp } = require('./src/app');
const { resolveProfile } = require('./src/profiles');

const profile = resolveProfile(process.env.MOCK_PROFILE || 'dev');
// Port: explicit MOCK_PORT wins; otherwise the profile default (dev=3000,
// preview=3001 — matching the client's BASE_URLS).
const port = process.env.MOCK_PORT
  ? parseInt(process.env.MOCK_PORT, 10)
  : profile.defaultPort;
const host = process.env.MOCK_HOST || '127.0.0.1';
const defaultNow = process.env.MOCK_DEFAULT_NOW || undefined;

const app = buildApp({ profile, defaultNow });

app.listen(port, host, () => {
  console.log(`[mock-server] profile=${profile.name} listening on http://${host}:${port}`);
  if (process.env.MOCK_DEFAULT_NOW) {
    console.log(`[mock-server] mock clock default = ${process.env.MOCK_DEFAULT_NOW} (UTC+8 authoritative)`);
  }
});

module.exports = { app, profile, port, host };