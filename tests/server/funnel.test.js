/**
 * Visitor-funnel counter tests (server/observability/funnel.js).
 *
 * The module resolves its data dir from TETCHES_DATA_DIR at require time,
 * so each test loads it fresh inside jest.isolateModules with the env
 * pointed at a throwaway temp dir.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('visitor funnel', () => {
	let tempDir;
	let funnel;

	function loadFunnel() {
		let mod;
		jest.isolateModules(() => {
			mod = require('../../server/observability/funnel');
		});
		return mod;
	}

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetches-funnel-'));
		process.env.TETCHES_DATA_DIR = tempDir;
		funnel = loadFunnel();
	});

	afterEach(() => {
		delete process.env.TETCHES_DATA_DIR;
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('counts each stage in totals and daily buckets', () => {
		funnel.recordPageView('Mozilla/5.0 (Windows NT 10.0) Chrome/125.0');
		funnel.recordPageView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1');
		funnel.recordNewVisitor();
		funnel.recordWorldJoin();
		funnel.recordFirstPlacement();

		const snapshot = funnel.getSnapshot();
		expect(snapshot.totals).toEqual({
			pageViews: 2,
			newVisitors: 1,
			worldJoins: 1,
			firstPlacements: 1,
		});
		expect(snapshot.days).toHaveLength(1);
		expect(snapshot.days[0].pageViews).toBe(2);
		expect(snapshot.days[0].date).toBe(new Date().toISOString().slice(0, 10));
	});

	test('filters obvious crawlers from page views but keeps real browsers', () => {
		funnel.recordPageView('Googlebot/2.1 (+http://www.google.com/bot.html)');
		funnel.recordPageView('curl/8.5.0');
		funnel.recordPageView('UptimeRobot/2.0');
		funnel.recordPageView('Mozilla/5.0 (X11; Linux x86_64) Firefox/126.0');
		funnel.recordPageView(undefined); // missing UA — counted, not stored

		expect(funnel.getSnapshot().totals.pageViews).toBe(2);
	});

	test('persists via saveNow and reloads from disk', () => {
		funnel.recordNewVisitor();
		funnel.recordNewVisitor();
		funnel.saveNow();

		expect(fs.existsSync(funnel.FUNNEL_FILE)).toBe(true);

		// Fresh module instance (same env) must pick up the saved counts.
		const reloaded = loadFunnel();
		expect(reloaded.getSnapshot().totals.newVisitors).toBe(2);
	});

	test('survives a corrupt funnel file by starting fresh', () => {
		fs.writeFileSync(path.join(tempDir, 'funnel.json'), '{not json');
		const fresh = loadFunnel();
		fresh.recordWorldJoin();
		expect(fresh.getSnapshot().totals.worldJoins).toBe(1);
	});

	test('snapshot limits the daily window and orders newest first', () => {
		funnel.recordPageView('Mozilla/5.0 Chrome');
		funnel.saveNow();

		// Inject synthetic history: three extra days spread over a week.
		const onDisk = JSON.parse(fs.readFileSync(funnel.FUNNEL_FILE, 'utf8'));
		const dayMs = 24 * 60 * 60 * 1000;
		for (const offset of [1, 3, 7]) {
			const key = new Date(Date.now() - offset * dayMs).toISOString().slice(0, 10);
			onDisk.daily[key] = { pageViews: offset };
		}
		fs.writeFileSync(funnel.FUNNEL_FILE, JSON.stringify(onDisk));

		const reloaded = loadFunnel();
		const snapshot = reloaded.getSnapshot(2);
		expect(snapshot.days).toHaveLength(2);
		// Newest (today) first.
		expect(snapshot.days[0].date > snapshot.days[1].date).toBe(true);
	});
});
