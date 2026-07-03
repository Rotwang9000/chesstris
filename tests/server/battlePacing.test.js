'use strict';

/**
 * Pure pacing helpers: rolling tempo window + adaptive bot interval.
 * The BattleManager integration is covered in battleMode.test.js; this
 * file locks in the maths.
 */

const {
	BOT_PACE,
	normaliseBotDifficulty,
	pushPaceSample,
	adaptiveBotIntervalMs,
} = require('../../server/battle/pacing');

describe('normaliseBotDifficulty', () => {
	test.each([
		['auto', 'auto'],
		['easy', 'easy'],
		['MEDIUM', 'medium'],
		[' Hard ', 'hard'],
		['ludicrous', 'auto'],
		[undefined, 'auto'],
		[null, 'auto'],
		[42, 'auto'],
	])('%p → %p', (input, expected) => {
		expect(normaliseBotDifficulty(input)).toBe(expected);
	});
});

describe('pushPaceSample', () => {
	test('appends and evicts samples older than the window', () => {
		let samples;
		samples = pushPaceSample(undefined, { t: 0, moves: 0 });
		samples = pushPaceSample(samples, { t: 30000, moves: 3 });
		samples = pushPaceSample(samples, { t: BOT_PACE.WINDOW_MS + 30000, moves: 9 });
		// The t=0 sample fell out of the 60s window behind the newest.
		expect(samples.map(s => s.t)).toEqual([30000, BOT_PACE.WINDOW_MS + 30000]);
	});

	test('always keeps at least the newest sample', () => {
		let samples = pushPaceSample(undefined, { t: 0, moves: 0 });
		samples = pushPaceSample(samples, { t: 10 * BOT_PACE.WINDOW_MS, moves: 50 });
		expect(samples).toHaveLength(1);
		expect(samples[0].t).toBe(10 * BOT_PACE.WINDOW_MS);
	});
});

describe('adaptiveBotIntervalMs', () => {
	test('defaults before two samples exist', () => {
		expect(adaptiveBotIntervalMs(undefined)).toBe(BOT_PACE.DEFAULT_INTERVAL_MS);
		expect(adaptiveBotIntervalMs([])).toBe(BOT_PACE.DEFAULT_INTERVAL_MS);
		expect(adaptiveBotIntervalMs([{ t: 0, moves: 0 }])).toBe(BOT_PACE.DEFAULT_INTERVAL_MS);
	});

	test('idle humans ease the bots to the ceiling', () => {
		const samples = [{ t: 0, moves: 5 }, { t: 40000, moves: 5 }];
		expect(adaptiveBotIntervalMs(samples)).toBe(BOT_PACE.MAX_INTERVAL_MS);
	});

	test('mirrors a steady human tempo with the handicap applied', () => {
		// 4 moves in 40s → 10s tempo → 11.5s with the 1.15 handicap.
		const samples = [{ t: 0, moves: 0 }, { t: 40000, moves: 4 }];
		expect(adaptiveBotIntervalMs(samples)).toBe(11500);
	});

	test('clamps a speed-running human to the floor', () => {
		// 60 moves in 30s → 500ms tempo → clamped to MIN_INTERVAL_MS.
		const samples = [{ t: 0, moves: 0 }, { t: 30000, moves: 60 }];
		expect(adaptiveBotIntervalMs(samples)).toBe(BOT_PACE.MIN_INTERVAL_MS);
	});

	test('interval always lands inside [floor, ceiling]', () => {
		for (let moves = 1; moves <= 50; moves += 7) {
			const samples = [{ t: 0, moves: 0 }, { t: 45000, moves }];
			const interval = adaptiveBotIntervalMs(samples);
			expect(interval).toBeGreaterThanOrEqual(BOT_PACE.MIN_INTERVAL_MS);
			expect(interval).toBeLessThanOrEqual(BOT_PACE.MAX_INTERVAL_MS);
		}
	});
});
