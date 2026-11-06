/**
 * Tetches service worker: keeps the game playable with no connection
 * once it's been installed as an app (or opened in offline mode).
 *
 * Registered by public/js/offline/appShell.js, only for the installed
 * app, offline mode or an install in progress — the ordinary website
 * doesn't use it.
 *
 * Strategy, chosen per request by `strategyFor`:
 *   • the game's own files: network first (online you always get the
 *     latest deploy), the cached copy when the network fails;
 *   • three.js and the font from their CDNs: cache first (pinned versions);
 *   • live traffic (socket.io, the API, admin, ads): never touched.
 *
 * The page asks it to `warm` the cache with everything it has loaded,
 * so the next launch works offline.
 */

/* eslint-env serviceworker */

const CACHE = 'tetches-app-v1';
const NAVIGATION_TIMEOUT_MS = 4000;
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const LIVE_PATHS = [/^\/socket\.io\//, /^\/api\//, /^\/admin/, /^\/advertise/, /^\/metrics/, /^\/mcp/, /^\/uploads\//, /^\/sw\.js$/];

/** 'network-first' | 'cache-first' | 'pass' for a request URL. */
function strategyFor(url, origin) {
	if (url.origin === origin) {
		return LIVE_PATHS.some(re => re.test(url.pathname)) ? 'pass' : 'network-first';
	}
	return CDN_HOSTS.includes(url.hostname) ? 'cache-first' : 'pass';
}

/**
 * Store a response, dropping older copies of the same file (a new
 * deploy's `app.bundle.js?v=…` replaces the last one). Pages are kept
 * per address, since `/?offline=1` and `/?play=battle` differ.
 */
async function put(request, response, { isPage = false } = {}) {
	if (!response || !(response.ok || response.type === 'opaque')) return;
	const cache = await caches.open(CACHE);
	const url = new URL(request.url || request);
	if (!isPage && url.search) {
		for (const key of await cache.keys()) {
			const k = new URL(key.url);
			if (k.origin === url.origin && k.pathname === url.pathname && k.search !== url.search) await cache.delete(key);
		}
	}
	await cache.put(request, response);
}

async function cached(request) {
	const cache = await caches.open(CACHE);
	return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
}

function withTimeout(promise, ms) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), ms);
		promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
	});
}

async function networkFirst(event) {
	const { request } = event;
	const isPage = request.mode === 'navigate';
	const network = fetch(request).then((response) => {
		if (response.ok) event.waitUntil(put(request, response.clone(), { isPage }));
		return response;
	});
	try {
		// A page on a hopeless connection falls back to the copy we have.
		return await (isPage ? withTimeout(network, NAVIGATION_TIMEOUT_MS) : network);
	} catch (err) {
		const copy = await cached(request) || (isPage ? await cached(new Request('/')) : null);
		if (copy) return copy;
		if (isPage) return network;  // nothing cached: let the slow network finish
		throw err;
	}
}

async function cacheFirst(event) {
	const copy = await cached(event.request);
	if (copy) return copy;
	const response = await fetch(event.request);
	event.waitUntil(put(event.request, response.clone()));
	return response;
}

/** Fetch and store each URL (the page sends what it loaded). */
async function warm(urls) {
	await Promise.all([...new Set(urls)].map(async (raw) => {
		try {
			const url = new URL(raw, self.location.origin);
			const strategy = strategyFor(url, self.location.origin);
			if (strategy === 'pass') return;
			if (strategy === 'cache-first' && await cached(new Request(url.href))) return;
			let response = await fetch(url.href, { cache: 'no-cache' }).catch(() => null);
			if (!response && url.origin !== self.location.origin) response = await fetch(url.href, { mode: 'no-cors' });
			const isPage = url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('.html'));
			await put(new Request(url.href), response, { isPage });
		} catch (_e) { /* best effort: the next visit tries again */ }
	}));
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
	self.addEventListener('install', () => self.skipWaiting());

	self.addEventListener('activate', (event) => {
		event.waitUntil((async () => {
			for (const name of await caches.keys()) {
				if (name.startsWith('tetches-') && name !== CACHE) await caches.delete(name);
			}
			await self.clients.claim();
		})());
	});

	self.addEventListener('fetch', (event) => {
		if (event.request.method !== 'GET') return;
		const strategy = strategyFor(new URL(event.request.url), self.location.origin);
		if (strategy === 'network-first') event.respondWith(networkFirst(event));
		else if (strategy === 'cache-first') event.respondWith(cacheFirst(event));
	});

	self.addEventListener('message', (event) => {
		const data = event.data || {};
		if (data.type === 'warm' && Array.isArray(data.urls)) {
			const done = warm(data.urls).then(() => event.source?.postMessage?.({ type: 'warmed' }));
			if (event.waitUntil) event.waitUntil(done);
		}
	});
}

if (typeof module !== 'undefined') module.exports = { strategyFor };
