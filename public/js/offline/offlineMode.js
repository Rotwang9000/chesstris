/**
 * Offline mode: the whole game runs on the device, no server. Battles
 * against computer opponents only.
 *
 * On: `?offline=1` in the address (browser testing), or the phone
 * app's page setting `window.__TETCHES_OFFLINE__ = true` before the
 * game loads. The game's server code runs in a Web Worker
 * (`dist/offline-engine.js`) and `localSocket.js` stands in for the
 * socket.io connection.
 */

export function isOffline() {
	try {
		if (window.__TETCHES_OFFLINE__ === true) return true;
		return new URLSearchParams(window.location.search).get('offline') === '1';
	} catch (_e) {
		return false;
	}
}

/**
 * Where the engine script lives, plus any dev knobs to pass it (the
 * sea speed-up for local playtests: `?offline=1&seaScale=0.2`).
 */
export function offlineEngineUrl() {
	const base = window.__TETCHES_OFFLINE_ENGINE__ || '/dist/offline-engine.js';
	const params = new URLSearchParams();
	// Pinned to the page's build, so a cached engine always matches the
	// cached page that loads it (the app works from the cache offline).
	if (window.__BUNDLE_VERSION__) params.set('v', window.__BUNDLE_VERSION__);
	try {
		const seaScale = new URLSearchParams(window.location.search).get('seaScale');
		if (seaScale) params.set('seaScale', seaScale);
	} catch (_e) { /* no knobs */ }
	const query = params.toString();
	return query ? `${base}?${query}` : base;
}
