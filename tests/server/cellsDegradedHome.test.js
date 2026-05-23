/**
 * Tests for the degraded-home rule introduced when fixing the
 * "returning idle player loses everything in one placement" bug.
 *
 * Cells that hold a `home_converted` (fromHomeZone) tetromino without
 * any other clearable terrain should:
 *   • break line-clear runs (`onlyDegradedOrMarkers === true`),
 *   • survive `stripForLineClear` and `stripClearable`,
 *   • not count as line-clear targets.
 */

const cells = require('../../server/game/cells');

function degradedItem(player = 'p1') {
	return {
		type: 'tetromino',
		pieceType: 'home_converted',
		player,
		placedAt: 0,
		fromHomeZone: true,
	};
}

function liveItem(player = 'p1') {
	return {
		type: 'tetromino',
		pieceType: 'tetromino',
		player,
	};
}

describe('cells — degraded-home behaviour', () => {
	test('hasDegradedHomeRemnant detects fromHomeZone items', () => {
		expect(cells.hasDegradedHomeRemnant([degradedItem()])).toBe(true);
		expect(cells.hasDegradedHomeRemnant([liveItem()])).toBe(false);
	});

	test('onlyDegradedOrMarkers true when cell holds only degraded / markers', () => {
		expect(cells.onlyDegradedOrMarkers([degradedItem()])).toBe(true);
		expect(cells.onlyDegradedOrMarkers([
			degradedItem(),
			{ type: 'specialMarker', isCentreMarker: true },
		])).toBe(true);
		expect(cells.onlyDegradedOrMarkers([degradedItem(), liveItem()])).toBe(false);
		expect(cells.onlyDegradedOrMarkers([])).toBe(false);
	});

	test('isLineClearTarget skips degraded-only cells', () => {
		expect(cells.isLineClearTarget([degradedItem()])).toBe(false);
		expect(cells.isLineClearTarget([degradedItem(), liveItem()])).toBe(true);
	});

	test('isClearable false when only degraded content present', () => {
		expect(cells.isClearable([degradedItem()])).toBe(false);
		expect(cells.isClearable([liveItem()])).toBe(true);
	});

	test('stripForLineClear preserves degraded remnants', () => {
		const { preserved, lifted } = cells.stripForLineClear([
			degradedItem(),
			liveItem(),
			{ type: 'chess', player: 'p1', pieceId: 'piece-1' },
		]);
		expect(lifted).toBeTruthy();
		expect(preserved.some(item => item.fromHomeZone === true)).toBe(true);
		expect(preserved.some(item => item.pieceType === 'tetromino' && !item.fromHomeZone)).toBe(false);
	});

	test('stripClearable preserves degraded remnants', () => {
		const result = cells.stripClearable([
			degradedItem(),
			liveItem(),
		]);
		expect(result).toEqual([
			expect.objectContaining({ fromHomeZone: true }),
		]);
	});
});
