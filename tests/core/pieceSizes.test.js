/**
 * Unit tests for the shared per-type piece SIZE map.
 *
 * Size is the primary "tell pieces apart at a glance" cue and is shared
 * by BOTH render profiles (detailed Russian + cute), so the contract
 * worth pinning is: rank order is strictly increasing (pawn → king) and
 * footprints stay inside a cell. This module is dependency-free (no
 * THREE / no game context), so it imports cleanly in Node — exactly why
 * the size map was extracted out of `russianPieces.js`.
 */

const { PIECE_SIZE_BY_TYPE, pieceSizeFor } = require('../../public/js/chessPieceCreator/pieceSizes.js');

// Largest cell-safe scale: the widest builder footprint is radius ≈ 0.28,
// and a cell half-extent is 0.5, so scale must stay below 0.5 / 0.28.
const MAX_CELL_SAFE_SCALE = 0.5 / 0.28;
const RANKS = [1, 2, 3, 4, 5, 6];

describe('PIECE_SIZE_BY_TYPE', () => {
	it('defines a scale for every piece type 1-6', () => {
		for (const rank of RANKS) {
			expect(typeof PIECE_SIZE_BY_TYPE[rank]).toBe('number');
			expect(Number.isFinite(PIECE_SIZE_BY_TYPE[rank])).toBe(true);
		}
	});

	it('is strictly increasing by rank so the king never reads smaller than a pawn', () => {
		for (let i = 1; i < RANKS.length; i++) {
			const lower = PIECE_SIZE_BY_TYPE[RANKS[i - 1]];
			const higher = PIECE_SIZE_BY_TYPE[RANKS[i]];
			expect(higher).toBeGreaterThan(lower);
		}
		// And the spread is meaningful, not a hairline difference (the bug
		// was every piece sharing one footprint).
		expect(PIECE_SIZE_BY_TYPE[6] - PIECE_SIZE_BY_TYPE[1]).toBeGreaterThan(0.3);
	});

	it('keeps every footprint inside a single cell', () => {
		for (const rank of RANKS) {
			expect(PIECE_SIZE_BY_TYPE[rank]).toBeGreaterThan(0);
			expect(PIECE_SIZE_BY_TYPE[rank]).toBeLessThan(MAX_CELL_SAFE_SCALE);
		}
	});

	it('is frozen so a stray write cannot silently flatten the hierarchy', () => {
		expect(Object.isFrozen(PIECE_SIZE_BY_TYPE)).toBe(true);
	});
});

describe('pieceSizeFor', () => {
	it('returns the matching scale for each known type', () => {
		for (const rank of RANKS) {
			expect(pieceSizeFor(rank)).toBe(PIECE_SIZE_BY_TYPE[rank]);
		}
	});

	it('falls back to the pawn size for unknown / missing types', () => {
		expect(pieceSizeFor(0)).toBe(PIECE_SIZE_BY_TYPE[1]);
		expect(pieceSizeFor(99)).toBe(PIECE_SIZE_BY_TYPE[1]);
		expect(pieceSizeFor(undefined)).toBe(PIECE_SIZE_BY_TYPE[1]);
		expect(pieceSizeFor('king')).toBe(PIECE_SIZE_BY_TYPE[1]);
	});
});
