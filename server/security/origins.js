/**
 * Origin allowlist helper used by both the Express CORS middleware
 * and the Socket.IO CORS layer in `bootstrap.js`.
 *
 * In production, set `ALLOWED_ORIGIN` to a comma-separated list:
 *
 *     ALLOWED_ORIGIN=https://tetches.com,https://www.tetches.com,https://staging.tetches.com
 *
 * In development the helper additionally lets through any
 * `localhost` / `127.0.0.1` origin on any port — useful for tools
 * like Storybook or a separately-served React build.
 */

'use strict';

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/**
 * Parse a comma-separated env value into a normalised origin array.
 *
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseAllowedOrigins(raw) {
	if (!raw) return [];
	return raw
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
		.map(normaliseOrigin);
}

/**
 * Drop trailing slashes and force lowercase scheme+host for stable
 * comparison. Origins must never include a path.
 *
 * @param {string} origin
 * @returns {string}
 */
function normaliseOrigin(origin) {
	try {
		const url = new URL(origin);
		return `${url.protocol}//${url.host}`.toLowerCase();
	} catch (_err) {
		return origin.toLowerCase().replace(/\/+$/, '');
	}
}

/**
 * Decide whether to allow a Request `Origin` header.
 *
 * @param {string} origin
 * @param {string[]} allowed - Output of {@link parseAllowedOrigins}.
 * @param {Object} [opts]
 * @param {boolean} [opts.allowLocalhost] - Treat any localhost as allowed.
 * @returns {boolean}
 */
function isOriginAllowed(origin, allowed, { allowLocalhost = false } = {}) {
	if (!origin) return true;  // no-Origin requests can't be cross-origin
	const normalised = normaliseOrigin(origin);
	if (allowLocalhost && LOCALHOST_RE.test(normalised)) return true;
	return allowed.includes(normalised);
}

module.exports = {
	parseAllowedOrigins,
	isOriginAllowed,
	normaliseOrigin,
};
