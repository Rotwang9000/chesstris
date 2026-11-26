/**
 * A trail of how pieces got where they are, for the server log.
 *
 * 2026-11-26: a raiding knight's captures, read from the log, were not
 * all a knight's move apart, and nothing logged the steps between
 * (quiet moves, ships sailing with it aboard, line-clear gravity). The
 * rules allow three things besides an ordinary L:
 *
 *   • a move onto or off a longship is measured from the hull's second
 *     deck square, one square beside the ship's own (shipRules rule 8);
 *   • a ship sails carrying its passenger;
 *   • gravity after a line clear slides a cell, piece and all, towards
 *     its owner's king.
 *
 * So: every world move that touches a ship or a raid, every sail with a
 * passenger and every piece gravity shifts is logged in one line, and a
 * knight move that is neither an L nor an L from a square beside either
 * end is logged as a warning: that would be a real bug.
 *
 * TETCHES_MOVE_AUDIT=1 logs every chess move (for soak tests: a whole
 * path can then be checked).
 */

'use strict';

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function isL(a, b) {
	const ax = Math.abs(b.x - a.x);
	const az = Math.abs(b.z - a.z);
	return (ax === 1 && az === 2) || (ax === 2 && az === 1);
}

/**
 * How a knight's move from `from` to `to` is shaped: 'L', 'deck' (an L
 * from a square beside either end: boarding or landing through the
 * hull's second deck square) or 'odd'.
 */
function knightShape(from, to) {
	if (isL(from, to)) return 'L';
	for (const [dx, dz] of ORTHO) {
		if (isL({ x: from.x + dx, z: from.z + dz }, to)) return 'deck';
		if (isL(from, { x: to.x + dx, z: to.z + dz })) return 'deck';
	}
	return 'odd';
}

const at = p => `(${p.x}, ${p.z})`;
const label = piece => `${piece.player} ${String(piece.type || '').toUpperCase()} ${piece.id}`;

/**
 * A chess move just made. `note` says what kind (e.g. the ship plan's
 * kind). Logs when `loud` (a ship or raid move) and always warns on an
 * odd knight move.
 */
function chessMove(piece, from, to, { note = null, loud = false, logger = console } = {}) {
	if (!piece || !from || !to) return null;
	if (process.env.TETCHES_MOVE_AUDIT === '1') loud = true;
	const knight = String(piece.type || '').toUpperCase() === 'KNIGHT';
	const shape = knight ? knightShape(from, to) : null;
	const line = `[Move] ${label(piece)} ${at(from)} → ${at(to)}`
		+ (note ? ` ${note}` : '') + (shape && shape !== 'L' ? ` [${shape}]` : '');
	if (shape === 'odd') logger.warn(`${line} — not a knight's move`);
	else if (loud) logger.log(line);
	return shape;
}

/** A ship sailed with `passenger` aboard. */
function sail(passenger, shipId, from, to, { logger = console } = {}) {
	if (!passenger || !from || !to) return;
	logger.log(`[Sail] ${label(passenger)} aboard ${shipId} ${at(from)} → ${at(to)}`);
}

/** Gravity slid a piece. */
function gravity(piece, from, to, { logger = console } = {}) {
	if (!piece || !from || !to || (from.x === to.x && from.z === to.z)) return;
	logger.log(`[Gravity] ${label(piece)} ${at(from)} → ${at(to)}`);
}

module.exports = { knightShape, chessMove, sail, gravity };
