/**
 * The service worker (public/sw.js) must never sit between the player
 * and live traffic: socket.io, the API, admin and ads always go to the
 * network. Only the game's files and the pinned CDN libraries are kept.
 */

const { strategyFor } = require('../../public/sw.js');

const ORIGIN = 'https://tetches.com';
const s = (url) => strategyFor(new URL(url, ORIGIN), ORIGIN);

describe('service worker routing', () => {
	test('live traffic is never cached', () => {
		for (const path of ['/socket.io/?EIO=4&transport=polling', '/api/health', '/api/advertisers/next',
			'/admin/advertisers', '/advertise', '/metrics', '/mcp', '/uploads/ad.png', '/sw.js']) {
			expect(s(path)).toBe('pass');
		}
	});

	test("the game's own files: network first, cache when offline", () => {
		for (const path of ['/', '/?offline=1&app=1', '/dist/app.bundle.js?v=123', '/dist/offline-engine.js?v=123',
			'/img/welcome-hero.png', '/manifest.json']) {
			expect(s(path)).toBe('network-first');
		}
	});

	test('pinned CDN libraries and fonts: cache first; anything else passes', () => {
		expect(s('https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js')).toBe('cache-first');
		expect(s('https://fonts.gstatic.com/s/playfairdisplay/v40/x.woff2')).toBe('cache-first');
		expect(s('https://unpkg.com/@solana/web3.js')).toBe('pass');
		expect(s('https://example.com/')).toBe('pass');
	});
});
