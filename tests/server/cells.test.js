/**
 * Tests for the cell-level helper module — the single source of truth
 * for what a `board.cells[key]` entry means.
 *
 * The bible rules being exercised here are §8 (line clears + gravity)
 * and §15.2 (single-owner gravity + chess-piece anchoring).
 */

const cells = require('../../server/game/cells');

describe('cells helper', () => {
	describe('getOwner', () => {
		test('returns null for empty / nullish input', () => {
			expect(cells.getOwner(null)).toBeNull();
			expect(cells.getOwner(undefined)).toBeNull();
			expect(cells.getOwner([])).toBeNull();
		});

		test('returns the sole non-home owner', () => {
			const items = [
				{ type: 'home', player: 'p1' },
				{ type: 'tetromino', player: 'p2' },
			];
			expect(cells.getOwner(items)).toBe('p2');
		});

		test('returns null when more than one player owns non-home content', () => {
			const items = [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'tetromino', player: 'p2' },
			];
			expect(cells.getOwner(items)).toBeNull();
		});

		test('a chess marker counts toward ownership', () => {
			const items = [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'k1' },
			];
			expect(cells.getOwner(items)).toBe('p1');
		});

		test('chess marker disagreeing with terrain owner -> conflict -> null', () => {
			const items = [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p2', pieceId: 'k1' },
			];
			expect(cells.getOwner(items)).toBeNull();
		});
	});

	describe('gravityAnchor', () => {
		test('immovable for empty cells', () => {
			expect(cells.gravityAnchor([])).toEqual({ movable: false, owner: null });
		});

		test('immovable for bare home cells', () => {
			const items = [{ type: 'home', player: 'p1' }];
			expect(cells.gravityAnchor(items)).toEqual({ movable: false, owner: null });
		});

		test('single-owner cell is movable', () => {
			const items = [{ type: 'tetromino', player: 'p1' }];
			expect(cells.gravityAnchor(items)).toEqual({ movable: true, owner: 'p1' });
		});

		test('chess-marker cell always moves with the piece owner', () => {
			const items = [
				{ type: 'home', player: 'enemy' },
				{ type: 'chess', player: 'p1', pieceId: 'k1' },
			];
			expect(cells.gravityAnchor(items)).toEqual({ movable: true, owner: 'p1' });
		});

		test('multi-owner cell is immovable', () => {
			const items = [
				{ type: 'tetromino', player: 'p1' },
				{ type: 'tetromino', player: 'p2' },
			];
			expect(cells.gravityAnchor(items)).toEqual({ movable: false, owner: null });
		});
	});

	describe('isClearable', () => {
		test('false for empty / home-only / chess-only / centre-only cells', () => {
			expect(cells.isClearable([])).toBe(false);
			expect(cells.isClearable([{ type: 'home', player: 'p1' }])).toBe(false);
			expect(cells.isClearable([{ type: 'chess', player: 'p1', pieceId: 'k1' }])).toBe(false);
			expect(cells.isClearable([{ type: 'boardCentre' }])).toBe(false);
			expect(cells.isClearable([{ type: 'specialMarker' }])).toBe(false);
		});

		test('true for plain tetromino terrain', () => {
			expect(cells.isClearable([{ type: 'tetromino', player: 'p1' }])).toBe(true);
		});

		test('home + chess cell is NOT clearable — chess gate protects it', () => {
			const items = [
				{ type: 'home', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'k1' },
			];
			expect(cells.isClearable(items)).toBe(false);
		});
	});

	describe('transferOwnership', () => {
		test('transfers non-home items to new owner; home stays put', () => {
			const items = [
				{ type: 'home', player: 'p1' },
				{ type: 'tetromino', player: 'p1' },
			];
			cells.transferOwnership(items, 'p2', 0xaabbcc);
			expect(items[0]).toEqual({ type: 'home', player: 'p1' });
			expect(items[1]).toEqual({ type: 'tetromino', player: 'p2', color: 0xaabbcc });
		});

		test('skips items already owned by newOwner', () => {
			const items = [{ type: 'tetromino', player: 'p1', color: 0xff0000 }];
			cells.transferOwnership(items, 'p1', 0x00ff00);
			// Same owner — color shouldn't change.
			expect(items[0]).toEqual({ type: 'tetromino', player: 'p1', color: 0xff0000 });
		});

		test('does not touch boardCentre markers', () => {
			const items = [{ type: 'boardCentre' }];
			cells.transferOwnership(items, 'p2', 0x123456);
			expect(items[0]).toEqual({ type: 'boardCentre' });
		});
	});

	describe('stripClearable', () => {
		test('returns array preserving home / chess / centre / special only', () => {
			const items = [
				{ type: 'home', player: 'p1' },
				{ type: 'tetromino', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'k1' },
				{ type: 'boardCentre' },
				{ type: 'specialMarker' },
			];
			const result = cells.stripClearable(items);
			expect(result).toEqual([
				{ type: 'home', player: 'p1' },
				{ type: 'chess', player: 'p1', pieceId: 'k1' },
				{ type: 'boardCentre' },
				{ type: 'specialMarker' },
			]);
		});
	});
});
