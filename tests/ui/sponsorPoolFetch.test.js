/**
 * The active sponsor list is asked for on every board redraw. One
 * request at a time, and a refused one (the server's /api rate limit)
 * waits out the cache period instead of being retried on every redraw:
 * a slow device redrawing during the sea used to fire dozens at once.
 */

jest.mock('../../public/js/offline/offlineMode.js', () => ({ isOffline: () => false }));

describe('fetchActiveSponsors', () => {
	let sponsors;
	let resolveFetch;

	beforeEach(() => {
		jest.resetModules();
		global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
		sponsors = require('../../public/utils/sponsors.js');
	});

	afterEach(() => {
		delete global.fetch;
	});

	test('concurrent callers share one request', async () => {
		const calls = [sponsors.fetchActiveSponsors(), sponsors.fetchActiveSponsors(), sponsors.fetchActiveSponsors()];
		await null; await null;
		expect(global.fetch).toHaveBeenCalledTimes(1);
		resolveFetch({ ok: true, json: async () => ({ advertisers: [{ id: 'a1' }] }) });
		const lists = await Promise.all(calls);
		for (const list of lists) expect(list).toEqual([{ id: 'a1' }]);
		// Cached afterwards.
		await sponsors.fetchActiveSponsors();
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	test('a refused request is not retried on the next redraw', async () => {
		const first = sponsors.fetchActiveSponsors();
		await null; await null;
		resolveFetch({ ok: false, status: 429, json: async () => ({}) });
		expect(await first).toEqual([]);
		expect(await sponsors.fetchActiveSponsors()).toEqual([]);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	test('a failed request lets the next caller try again', async () => {
		global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await sponsors.fetchActiveSponsors()).toEqual([]);
		expect(await sponsors.fetchActiveSponsors()).toEqual([]);
		expect(global.fetch).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});
});
