/**
 * The longship builder, fetched on demand (production bundle only).
 *
 * scripts/build-client.js resolves shipRenderer's `./longship.js` import
 * to this file in dist/app.bundle.js, and bundles the real builder into
 * dist/viking.bundle.js (longshipChunk.js). Standard visitors never
 * load it: the first Viking battle does, by a <script> next to the app
 * bundle (same ?v= version). Until it has arrived buildLongship returns
 * null and the renderer waits (shipRenderer.syncShips draws the fleet
 * when it lands). Dev (unbundled modules) and tests use longship.js
 * directly, which is always ready.
 */

const READY_EVENT = 'tetches:longship-ready';
let loading = false;
const waiting = [];

function builder() {
	return (typeof window !== 'undefined' && window.__tetchesLongship && window.__tetchesLongship.buildLongship) || null;
}

/** Where the chunk lives: beside the app bundle, same version. */
function chunkUrl() {
	const tag = typeof document !== 'undefined'
		? document.querySelector('script[src*="dist/app.bundle.js"]')
		: null;
	if (tag && tag.getAttribute('src')) return tag.getAttribute('src').replace('app.bundle.js', 'viking.bundle.js');
	const v = typeof window !== 'undefined' && window.__BUNDLE_VERSION__ ? `?v=${window.__BUNDLE_VERSION__}` : '';
	return `dist/viking.bundle.js${v}`;
}

function settle() {
	const fns = waiting.splice(0);
	for (const fn of fns) {
		try { fn(); } catch (err) { console.error('[longship] ready callback failed:', err); }
	}
}

export function longshipReady() {
	return builder() !== null;
}

/** Fetch the builder (once); `onReady` runs when it is there. */
export function preloadLongship(onReady) {
	if (builder()) { if (typeof onReady === 'function') onReady(); return; }
	if (typeof onReady === 'function') waiting.push(onReady);
	if (loading || typeof document === 'undefined') return;
	loading = true;
	window.addEventListener(READY_EVENT, settle, { once: true });
	const s = document.createElement('script');
	s.src = chunkUrl();
	s.async = true;
	s.onload = () => { if (builder()) settle(); };
	s.onerror = () => {
		// Let a later battle try again (a blip, or offline before it was cached).
		loading = false;
		window.removeEventListener(READY_EVENT, settle);
		console.warn('[longship] could not load', s.src);
		s.remove();
	};
	document.head.appendChild(s);
}

/** The real builder once loaded; null (and a fetch started) before. */
export function buildLongship(THREE, opts) {
	const fn = builder();
	if (!fn) { preloadLongship(); return null; }
	return fn(THREE, opts);
}
