/**
 * Shared helpers for server-side tests.
 * Constructs real game objects using the actual managers.
 */

const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');
const { BOARD_SETTINGS } = require('../../server/game/Constants');

function createManagers() {
	const boardManager = new BoardManager();
	const islandManager = new IslandManager();
	const chessManager = new ChessManager(boardManager, islandManager);
	return { boardManager, islandManager, chessManager };
}

function createGame(boardManager) {
	const board = boardManager.createEmptyBoard();
	return {
		board,
		players: {},
		chessPieces: [],
		islands: [],
		state: {},
	};
}

function addPlayer(game, playerId, options = {}) {
	game.players[playerId] = {
		id: playerId,
		name: options.name || `Player-${playerId}`,
		color: options.color || 0xDD0000,
		balance: options.balance || 0,
		eliminated: false,
		isObserver: false,
		...options,
	};
}

function createHomeZone(game, boardManager, playerId, startX, startZ, orientation) {
	const zone = {
		x: startX,
		z: startZ,
		width: BOARD_SETTINGS.HOME_ZONE_WIDTH,
		height: BOARD_SETTINGS.HOME_ZONE_HEIGHT,
		orientation: orientation || 0,
		player: playerId,
	};

	if (!game.homeZones) game.homeZones = {};
	game.homeZones[playerId] = zone;

	const isHorizontal = orientation === 0 || orientation === 2;
	const w = isHorizontal ? BOARD_SETTINGS.HOME_ZONE_WIDTH : BOARD_SETTINGS.HOME_ZONE_HEIGHT;
	const h = isHorizontal ? BOARD_SETTINGS.HOME_ZONE_HEIGHT : BOARD_SETTINGS.HOME_ZONE_WIDTH;

	for (let dx = 0; dx < w; dx++) {
		for (let dz = 0; dz < h; dz++) {
			boardManager.setCell(game.board, startX + dx, startZ + dz, [
				{ type: 'home', player: playerId, color: game.players[playerId].color, orientation },
			]);
		}
	}

	return zone;
}

function placeTetromino(game, boardManager, playerId, cells) {
	for (const { x, z } of cells) {
		boardManager.addToCellContents(game.board, x, z, {
			type: 'tetromino',
			player: playerId,
			placedAt: Date.now(),
		});
	}
}

module.exports = {
	createManagers,
	createGame,
	addPlayer,
	createHomeZone,
	placeTetromino,
};
