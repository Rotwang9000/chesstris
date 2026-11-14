/**
 * The Viking chunk's loader, production bundle only.
 *
 * scripts/build-client.js puts this file in dist/app.bundle.js in place
 * of loader.js, and every module under js/viking/, js/longships/ and
 * js/paintings/ (bar the small doors that stay: longships/shipEvents.js,
 * paintings/index.js) into dist/viking.bundle.js. The app bundle keeps
 * a stub of each one it imports (stubs/), which forwards to the real
 * module once the chunk is here and does nothing Viking before — so a
 * standard visitor never downloads or runs the Viking code.
 *
 * The chunk is fetched the first time it is wanted: at boot with
 * ?edition=viking, when a Viking battle is adopted (paintings/index.js),
 * or from a stub that sees `vikingActive` (the theme's per-frame check,
 * the land dressing, a ship on the board). When it lands it redraws
 * the board (chunk.js) and runs what was waiting for it (onVikingReady).
 *
 * The chunk reuses the app's own running modules (gameState, the toast,
 * the network, …) through `window.__tetchesHost`, filled here from the
 * list the build generated (`window.__tetchesHostModules`); it runs only
 * if it was built with this very app bundle (`__tetchesHostBuild`).
 */

import { vikingActive, isViking } from '../edition.js';

const RETRY_MS = 10000;
let loading = null;
let failedAt = -Infinity;
const waiting = [];

function api() {
	return (typeof window !== 'undefined' && window.__tetchesViking) || null;
}

/** One Viking module's namespace (e.g. 'shipRenderer'), or null before the chunk is here. */
export function vk(name) {
	const v = api();
	return v ? v[name] || null : null;
}

export function vikingLoaded() {
	return api() !== null;
}

/**
 * Where the chunk lives: beside the app bundle, same version. (The
 * server's index.html swap preloads this same address for a Viking
 * page, and the offline app's cache keeps it: offline/appShell.js.)
 */
export function vikingChunkUrl() {
	if (typeof document === 'undefined') return null;
	return chunkUrl();
}

function chunkUrl() {
	const tag = document.querySelector('script[src*="dist/app.bundle.js"]');
	if (tag && tag.getAttribute('src')) return tag.getAttribute('src').replace('app.bundle.js', 'viking.bundle.js');
	const v = window.__BUNDLE_VERSION__ ? `?v=${window.__BUNDLE_VERSION__}` : '';
	return `dist/viking.bundle.js${v}`;
}

function settle() {
	for (const fn of waiting.splice(0)) {
		try { fn(); } catch (err) { console.error('[viking] ready callback failed:', err); }
	}
}

function inject(resolve) {
	const fail = (why) => {
		console.warn('[viking] could not load the Viking edition:', why);
		loading = null;
		failedAt = Date.now();
		resolve(null);
	};
	try {
		// The bundle has finished evaluating (this runs a task later), so
		// the host list is complete.
		if (typeof window.__tetchesHostModules !== 'function') { fail('no host modules'); return; }
		if (!window.__tetchesHost) window.__tetchesHost = window.__tetchesHostModules();
	} catch (err) { fail(err?.message || err); return; }
	const s = document.createElement('script');
	s.src = chunkUrl();
	s.async = true;
	s.onload = () => {
		if (!api()) { s.remove(); fail(`${s.src} did not start (another build?)`); return; }
		resolve(api());
		settle();
	};
	s.onerror = () => { s.remove(); fail(s.src); };
	document.head.appendChild(s);
}

/**
 * Fetch the chunk (once; after a failure, again no sooner than RETRY_MS).
 * @returns {Promise<Object|null>} the module table, or null
 */
export function loadViking() {
	if (api()) return Promise.resolve(api());
	if (loading) return loading;
	if (typeof document === 'undefined' || Date.now() - failedAt < RETRY_MS) return Promise.resolve(null);
	loading = new Promise((resolve) => { setTimeout(() => inject(resolve), 0); });
	return loading;
}

/** One module's namespace once the chunk is here (null if it can't load). */
export function loadVikingModule(name) {
	return loadViking().then(v => (v ? v[name] || null : null));
}

/** The stubs' trigger: fetch the chunk when the Viking edition is in force. */
export function wantViking(gameState) {
	if (loading || api()) return;
	try { if (vikingActive(gameState)) loadViking(); } catch (_e) { /* never in the way */ }
}

/** Run `fn` when the chunk is here (now, if it is). */
export function onVikingReady(fn) {
	if (api()) { fn(); return; }
	waiting.push(fn);
}

// A Viking page (data-edition="viking", set before first paint by
// index.html, which also preloads the chunk) asks for it at once rather
// than when the app's start-up reaches it, so the first frames are
// already in the Viking dress. (The fetch waits a task, for the app
// bundle to finish evaluating.)
try { if (typeof document !== 'undefined' && isViking()) loadViking(); } catch (_e) { /* asked for again later */ }
