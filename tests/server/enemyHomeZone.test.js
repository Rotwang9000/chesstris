/**
 * Bible §15.3: an opponent's tetromino cannot be placed inside a SAFE
 * home zone (one that still holds a chess piece). Home markers don't
 * block in general, so this used to be allowed.
 */

const TetrominoManager = require('../../server/game/TetrominoManager');
const { createManagers, createGame, addPlayer, createHomeZone } = require('./testHelpers');

function setup({ withPiece }) {
	const { boardManager, islandManager } = createManagers();
	const tm = new TetrominoManager(boardManager, islandManager);
	const game = createGame(boardManager);
	addPlayer(game, 'A');
	addPlayer(game, 'B');
	createHomeZone(game, boardManager, 'A', 0, 0, 0);
	if (withPiece) {
		game.chessPieces.push({ id: 'a-king', player: 'A', type: 'KING', position: { x: 4, z: 0 } });
		boardManager.addToCellContents(game.board, 4, 0, { type: 'chess', player: 'A', pieceId: 'a-king' });
	}
	return { tm, game };
}

describe('building inside another player\'s home zone', () => {
	test('refused while the zone is safe', () => {
		const { tm, game } = setup({ withPiece: true });
		const res = tm.validateTetrominoPlacement(game, { shape: [[1]] }, 0, 1, 0, 'B');
		expect(res).toMatchObject({ valid: false, reason: 'enemy_home' });
	});

	test('not refused for that reason once the zone has no pieces (unsafe)', () => {
		const { tm, game } = setup({ withPiece: false });
		const res = tm.validateTetrominoPlacement(game, { shape: [[1]] }, 0, 1, 0, 'B');
		expect(res.reason).not.toBe('enemy_home');
	});

	test('the owner can still build on their own home cells', () => {
		const { tm, game } = setup({ withPiece: true });
		const res = tm.validateTetrominoPlacement(game, { shape: [[1]] }, 0, 1, 0, 'A');
		expect(res.reason).not.toBe('enemy_home');
	});
});
