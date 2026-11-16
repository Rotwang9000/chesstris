/**
 * Owner report (2026-11-16): "placed my rook on some enemy's squares
 * which disappeared as they made a row. Rook was left hovering — any
 * future moves made with the rook worked but then said it wasn't
 * reachable!"
 *
 * Root cause: line-clear gravity moved the rook TWICE. The rook's
 * board marker carries a live `chessPiece` reference (every piece that
 * has ever landed after a clear gets one via `relocatePiece`), so
 * sliding its cell already updated `piece.position`; the follow-up
 * pass then looked the NEW square up in the "cells that moved" map,
 * found the cell that had slid out of it, and moved the piece a second
 * time. The rook's record ended a square away from its marker, on
 * someone else's terrain. When that square was cleared next, the clear
 * only lifted pieces by their marker, so the rook was never lifted:
 * its record stayed put over open water.
 */

const BoardManager = require('../../server/game/BoardManager');
const pieces = require('../../server/game/pieces');

function createGame(boardManager) {
	return {
		board: boardManager.createEmptyBoard(),
		players: {
			me: { id: 'me', name: 'me' },
			enemy: { id: 'enemy', name: 'enemy' },
		},
		homeZones: {},
		chessPieces: [],
		id: 'enemy-row-test-world',
	};
}

function addKing(game, boardManager, id, player, x, z) {
	const king = { id, type: 'KING', player, position: { x, z } };
	game.chessPieces.push(king);
	boardManager.setCell(game.board, x, z, [
		{ type: 'tetromino', player },
		{ type: 'chess', player, pieceId: id, pieceType: 'king' },
	]);
	return king;
}

function markerSquaresFor(game, pieceId) {
	const out = [];
	for (const [key, contents] of Object.entries(game.board.cells)) {
		if (!Array.isArray(contents)) continue;
		for (const item of contents) {
			if (item && item.type === 'chess' && String(item.pieceId) === String(pieceId)) out.push(key);
		}
	}
	return out;
}

describe('a piece on another player\'s squares when they clear a line', () => {
	let boardManager;
	beforeEach(() => { boardManager = new BoardManager(); });

	test('gravity carries the rook exactly once: its record stays on the square holding its marker', () => {
		const game = createGame(boardManager);
		// Both kings well "south", so every cell north of the cleared
		// row slides one step south towards them.
		addKing(game, boardManager, 'my-king', 'me', 2, -10);
		addKing(game, boardManager, 'enemy-king', 'enemy', 6, -10);

		// The enemy's row, about to be completed.
		for (let x = 0; x < 8; x++) {
			boardManager.setCell(game.board, x, 0, [{ type: 'tetromino', player: 'enemy' }]);
		}
		// My own square between the row and the rook (links the rook's
		// cell to the clear, so it is gravity-eligible).
		boardManager.setCell(game.board, 3, 1, [{ type: 'tetromino', player: 'me' }]);
		// My rook standing on an enemy square. It landed there after an
		// earlier clear, so its marker was written by relocatePiece and
		// holds a live reference to the piece record.
		boardManager.setCell(game.board, 3, 2, [{ type: 'tetromino', player: 'enemy' }]);
		const rook = { id: 'my-rook', type: 'ROOK', player: 'me', position: { x: 3, z: 2 } };
		game.chessPieces.push(rook);
		pieces.relocatePiece(game, rook, { x: 3, z: 2 });

		const { rows } = boardManager.checkAndClearLines(game);
		expect(rows).toEqual([0]);

		// The rook's cell slid one square south, from z=2 to z=1.
		expect(markerSquaresFor(game, 'my-rook')).toEqual(['3,1']);
		expect(rook.position).toEqual({ x: 3, z: 1 });
		const under = boardManager.getCell(game.board, 3, 1);
		expect(under.some(item => item.type === 'tetromino')).toBe(true);
	});

	test('a piece whose square is cleared is lifted even if its board marker is elsewhere', () => {
		// The state the double move above left behind (and that a save
		// from the old build can still hold): the rook's record says
		// (3,0), on enemy terrain, but its marker sits on (3,5).
		const game = createGame(boardManager);
		addKing(game, boardManager, 'my-king', 'me', 20, 20);
		addKing(game, boardManager, 'enemy-king', 'enemy', 30, 20);

		for (let x = 0; x < 8; x++) {
			boardManager.setCell(game.board, x, 0, [{ type: 'tetromino', player: 'enemy' }]);
		}
		const rook = { id: 'my-rook', type: 'ROOK', player: 'me', position: { x: 3, z: 0 } };
		game.chessPieces.push(rook);
		boardManager.setCell(game.board, 3, 5, [
			{ type: 'tetromino', player: 'me' },
			{ type: 'chess', player: 'me', pieceId: 'my-rook', pieceType: 'rook' },
		]);

		const { rows, settleOutcomes } = boardManager.checkAndClearLines(game);
		expect(rows).toEqual([0]);

		// Nothing slid under (3,0), so the rook falls into the sea
		// instead of hovering with no square under it.
		expect(settleOutcomes).toEqual([
			expect.objectContaining({ pieceId: 'my-rook', outcome: 'fell' }),
		]);
		expect(game.chessPieces.find(p => p.id === 'my-rook')).toBeUndefined();
		expect(markerSquaresFor(game, 'my-rook')).toEqual([]);
		for (const piece of game.chessPieces) {
			expect(boardManager.getCell(game.board, piece.position.x, piece.position.z)).toBeTruthy();
		}
	});

	test('an airborne piece does not "land" on a square left with nothing to stand on', () => {
		const game = createGame(boardManager);
		addKing(game, boardManager, 'enemy-king', 'enemy', 30, 20);
		for (let x = 0; x < 8; x++) {
			boardManager.setCell(game.board, x, 0, [{ type: 'tetromino', player: 'enemy' }]);
		}
		const rook = { id: 'my-rook', type: 'ROOK', player: 'me', position: { x: 3, z: 0 } };
		game.chessPieces.push(rook);
		// A non-terrain marker survives the clear on the rook's square.
		boardManager.setCell(game.board, 3, 0, [
			{ type: 'tetromino', player: 'enemy' },
			{ type: 'specialMarker', player: null },
			{ type: 'chess', player: 'me', pieceId: 'my-rook', pieceType: 'rook' },
		]);

		const { settleOutcomes } = boardManager.checkAndClearLines(game);
		expect(settleOutcomes).toEqual([
			expect.objectContaining({ pieceId: 'my-rook', outcome: 'fell' }),
		]);
		expect(game.chessPieces.find(p => p.id === 'my-rook')).toBeUndefined();
	});

	test('a stale marker never knocks off a piece that is standing somewhere else', () => {
		const game = createGame(boardManager);
		addKing(game, boardManager, 'my-king', 'me', 20, -20);
		addKing(game, boardManager, 'enemy-king', 'enemy', 30, -20);
		for (let x = 0; x < 8; x++) {
			const items = [{ type: 'tetromino', player: 'enemy' }];
			if (x === 3) items.push({ type: 'chess', player: 'enemy', pieceId: 'enemy-pawn', pieceType: 'pawn' });
			boardManager.setCell(game.board, x, 0, items);
		}
		// (3,1) slides into the cleared square under the airborne pawn,
		// carrying a leftover marker for my rook, which is really on (9,9).
		boardManager.setCell(game.board, 3, 1, [
			{ type: 'tetromino', player: 'enemy' },
			{ type: 'chess', player: 'me', pieceId: 'my-rook', pieceType: 'rook' },
		]);
		game.chessPieces.push(
			{ id: 'enemy-pawn', type: 'PAWN', player: 'enemy', position: { x: 3, z: 0 } },
			{ id: 'my-rook', type: 'ROOK', player: 'me', position: { x: 9, z: 9 } },
		);
		boardManager.setCell(game.board, 9, 9, [
			{ type: 'tetromino', player: 'me' },
			{ type: 'chess', player: 'me', pieceId: 'my-rook', pieceType: 'rook' },
		]);

		const { settleOutcomes } = boardManager.checkAndClearLines(game);
		const pawn = settleOutcomes.find(o => o.pieceId === 'enemy-pawn');
		expect(pawn).toMatchObject({ outcome: 'landed', x: 3, z: 0 });
		expect(pawn.bumpedPieceId).toBeUndefined();
		expect(game.chessPieces.find(p => p.id === 'my-rook')).toBeDefined();
		expect(markerSquaresFor(game, 'my-rook')).toEqual(['9,9']);
	});
});
