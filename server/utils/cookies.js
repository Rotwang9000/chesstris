/**
 * Tiny cookie parser used by the Socket.IO handshake.
 * The full Express middleware stack is unavailable on the WebSocket
 * upgrade path, so we keep this dependency-free.
 */

function parseCookies(cookieHeader) {
	const cookies = {};
	if (!cookieHeader) return cookies;

	for (const pair of String(cookieHeader).split(';')) {
		const idx = pair.indexOf('=');
		if (idx <= 0) continue;
		const key = pair.substring(0, idx).trim();
		cookies[key] = pair.substring(idx + 1).trim();
	}

	return cookies;
}

module.exports = { parseCookies };
