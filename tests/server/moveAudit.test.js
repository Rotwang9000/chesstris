/**
 * The move trail (2026-11-26: a raiding knight's logged captures were
 * not all a knight's move apart, and nothing showed the steps between).
 */
const moveAudit = require('../../server/game/moveAudit');

const quiet = () => ({ log: jest.fn(), warn: jest.fn() });
const knight = { id: 'n1', player: 'p1', type: 'KNIGHT' };

test('a knight: an L, an L through a deck square beside either end, or odd', () => {
	expect(moveAudit.knightShape({ x: 0, z: 0 }, { x: 1, z: 2 })).toBe('L');
	// landing from the hull's second deck square (one beside the ship)
	expect(moveAudit.knightShape({ x: 0, z: 0 }, { x: 2, z: 2 })).toBe('deck');
	// boarding: an L to the deck square, the piece stands on the ship beside it
	expect(moveAudit.knightShape({ x: 0, z: 0 }, { x: 1, z: 3 })).toBe('deck');
	expect(moveAudit.knightShape({ x: 0, z: 0 }, { x: 0, z: 1 })).toBe('odd');
	expect(moveAudit.knightShape({ x: 0, z: 0 }, { x: 1, z: -7 })).toBe('odd');
});

test('an odd knight move is always a warning; ordinary moves stay quiet', () => {
	const logger = quiet();
	moveAudit.chessMove(knight, { x: 0, z: 0 }, { x: 1, z: 2 }, { logger });
	expect(logger.log).not.toHaveBeenCalled();
	moveAudit.chessMove(knight, { x: 0, z: 0 }, { x: 0, z: 1 }, { logger });
	expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/not a knight's move/));
});

test('ship and raid moves, sails and gravity shifts are logged', () => {
	const logger = quiet();
	moveAudit.chessMove(knight, { x: 0, z: 0 }, { x: 2, z: 2 }, { note: 'raid', loud: true, logger });
	moveAudit.sail(knight, 's1', { x: 5, z: 5 }, { x: 5, z: 9 }, { logger });
	moveAudit.gravity(knight, { x: 5, z: 9 }, { x: 5, z: 8 }, { logger });
	moveAudit.gravity(knight, { x: 5, z: 8 }, { x: 5, z: 8 }, { logger });
	expect(logger.log.mock.calls.map(c => c[0])).toEqual([
		'[Move] p1 KNIGHT n1 (0, 0) → (2, 2) raid [deck]',
		'[Sail] p1 KNIGHT n1 aboard s1 (5, 5) → (5, 9)',
		'[Gravity] p1 KNIGHT n1 (5, 9) → (5, 8)',
	]);
	expect(logger.warn).not.toHaveBeenCalled();
});
