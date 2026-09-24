/**
 * Gate for world-admin socket events (restart / reconfigure the shared
 * world). Open in development, tests, and with NODE_ENV unset (local
 * dev); anywhere else — production AND staging, both of which are
 * public — the caller must present ADMIN_TOKEN as `adminToken` in the
 * event payload.
 */

const crypto = require('crypto');

function isOpenEnv() {
	const env = process.env.NODE_ENV;
	return !env || env === 'development' || env === 'test';
}

function tokenMatches(provided) {
	const expected = process.env.ADMIN_TOKEN;
	if (!expected || typeof provided !== 'string') return false;
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isWorldAdminAllowed(payload) {
	if (isOpenEnv()) return true;
	return tokenMatches(payload && payload.adminToken);
}

module.exports = { isWorldAdminAllowed };
