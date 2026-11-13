/**
 * The installable app: registers the service worker (public/sw.js) so
 * the game keeps working with no connection, and answers "can we reach
 * the server right now?" for the online/offline switch.
 *
 * The worker is only used where offline play matters — the installed
 * app, offline mode, or just as the player installs — never for the
 * ordinary website or inside a portal's frame.
 */

import { isOffline, offlineEngineUrl } from './offlineMode.js';
import { isEmbedded } from '../portal.js';
import { vikingChunkUrl } from '../vikingLazy/loader.js';

/** The paintings' list (paintings/paintingCatalogue.js MANIFEST_URL). */
const PAINTINGS_MANIFEST_URL = '/img/paintings/manifest.json';
/** The Viking wordmark: its carved mark and Futhark face (index.html, viking-brand style). */
const VIKING_BRAND_URLS = [
	'/fonts/viking-futhark.woff2',
	'/img/brand/viking-mark.svg', '/img/brand/viking-mark-cute.svg', '/img/brand/viking-mark-retro.svg',
];

/** The cute look's rounded face (index.html, tx-ui-theme): either edition. */
const CUTE_FONT_URLS = ['/fonts/cute-fredoka-600.woff2', '/fonts/cute-fredoka-700.woff2'];

/** Running as an installed app (home screen / desktop install)? */
export function isInstalledApp() {
	try {
		if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
		if (window.navigator.standalone === true) return true;  // iOS home screen
		return new URLSearchParams(window.location.search).get('app') === '1';
	} catch (_e) {
		return false;
	}
}

/** Where to go for each mode, staying "the app" if we are one. */
export function onlineUrl() {
	return `/?play=battle${isInstalledApp() ? '&app=1' : ''}`;
}

export function offlineUrl() {
	return `/?offline=1${isInstalledApp() ? '&app=1' : ''}`;
}

/**
 * Can we play online right now? A quick health check; the service
 * worker never answers it from cache.
 */
export async function canReachServer(timeoutMs = 2500) {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
	const controller = typeof AbortController === 'function' ? new AbortController() : null;
	const timer = setTimeout(() => controller?.abort(), timeoutMs);
	try {
		const res = await fetch('/api/health', { cache: 'no-store', signal: controller?.signal });
		return res.ok;
	} catch (_e) {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

function absolute(url) {
	return new URL(url, window.location.href).href;
}

/**
 * Everything this page has loaded, plus what offline play will need —
 * the Viking edition's code and paintings list included, whichever
 * edition this page is, so the app can open `?edition=viking` (or a
 * Viking battle) later with no connection. Kept only, never run.
 */
export function urlsToKeep() {
	const loaded = (performance.getEntriesByType?.('resource') || []).map(e => e.name);
	const chunk = vikingChunkUrl();
	return [
		window.location.href,
		absolute(offlineUrl()),
		absolute(offlineEngineUrl()),
		absolute('/img/welcome-hero.png'),
		absolute('/manifest.json'),
		...CUTE_FONT_URLS.map(absolute),
		...(chunk ? [absolute(chunk), absolute(PAINTINGS_MANIFEST_URL), ...VIKING_BRAND_URLS.map(absolute)] : []),
		...loaded,
	].filter(u => /^https?:/.test(u));
}

let registering = null;

/** Register the worker and fill its cache (idempotent). */
export function enableOfflineApp() {
	if (registering) return registering;
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || isEmbedded()) {
		return Promise.resolve(false);
	}
	registering = navigator.serviceWorker.register('/sw.js', { scope: '/' })
		.then(() => navigator.serviceWorker.ready)
		.then((reg) => {
			const warm = () => reg.active?.postMessage({ type: 'warm', urls: urlsToKeep() });
			// Resource timings are complete once the page has loaded.
			if (document.readyState === 'complete') setTimeout(warm, 3000);
			else window.addEventListener('load', () => setTimeout(warm, 3000), { once: true });
			return true;
		})
		.catch((err) => {
			console.warn('[app] offline support unavailable:', err?.message || err);
			registering = null;
			return false;
		});
	return registering;
}

/** Called once at startup. */
export function initAppShell() {
	// The packaged phone app (scripts/build-app.js) ships every file
	// locally; it needs no service worker.
	if (window.__TETCHES_OFFLINE__ === true) return;
	try {
		if (isInstalledApp() || isOffline()) {
			enableOfflineApp();
			return;
		}
		// Installing from the browser: get ready to work offline
		// before the first launch from the home screen.
		window.addEventListener('appinstalled', () => enableOfflineApp());
		window.addEventListener('beforeinstallprompt', () => enableOfflineApp(), { once: true });
	} catch (_e) { /* no offline support: the website works as before */ }
}
