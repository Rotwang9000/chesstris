/**
 * Single answer to "is this a local/dev box?" for every security gate.
 *
 * Only an unset NODE_ENV, `development` or `test` count as dev. Staging
 * is a public deployment too, so gates written as
 * `NODE_ENV !== 'production'` used to leave staging wide open (admin
 * routes, /metrics, dev socket events, and no `trust proxy`, so every
 * visitor shared one rate-limit bucket).
 */

function isDevelopmentEnv() {
	const env = process.env.NODE_ENV;
	return !env || env === 'development' || env === 'test';
}

module.exports = { isDevelopmentEnv };
