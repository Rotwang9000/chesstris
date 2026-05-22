/**
 * GameManager — stateless facade over the gameplay sub-managers.
 *
 * Historically this class owned its own `this.games` Map.  That was the
 * primary source of the dual-state bug: the socket layer kept its own
 * `games` Map AND the GameManager kept another, and persistence wrote
 * BOTH.  The current Tetches design has a **single** authoritative
 * world (see `server/world/World.js`).  This class is now just a
 * convenience wrapper that exposes the per-domain managers (board,
 * chess, tetromino, islands, players, AI) and resolves `getGame(id)`
 * against that one world.
 *
 * Sub-managers continue to be stateless and take the `game` (= world)
 * as their first argument — no behavioural change there.
 */

const World = require('../world/World');
const { generateApiToken, log } = require('./GameUtilities');

const BoardManager = require('./BoardManager');
const ChessManager = require('./ChessManager');
const TetrominoManager = require('./TetrominoManager');
const IslandManager = require('./IslandManager');
const PlayerManager = require('./PlayerManager');
const ComputerPlayerManager = require('./ComputerPlayerManager');

class GameManager {
	constructor() {
		this.boardManager = new BoardManager();
		this.islandManager = new IslandManager();
		this.tetrominoManager = new TetrominoManager(this.boardManager, this.islandManager);
		this.chessManager = new ChessManager(this.boardManager, this.islandManager);
		this.playerManager = new PlayerManager(
			this.boardManager,
			this.chessManager,
			this.tetrominoManager
		);
		this.computerPlayerManager = new ComputerPlayerManager(this.playerManager);

		this.apiTokens = {};
	}

	/**
	 * Backwards-compatible lookup.  There is only one world, so the
	 * `gameId` argument is honoured but optional.
	 *
	 * @param {string} [gameId]
	 * @returns {Object|null}
	 */
	getGame(gameId) {
		const world = World.getWorld();
		if (gameId && gameId !== world.id) return null;
		return world;
	}

	/**
	 * Register a player in the world.  See `PlayerManager.registerPlayer`
	 * for the result shape.
	 */
	registerPlayer(gameId, playerId, playerName, isObserver = false) {
		const game = this.getGame(gameId);
		if (!game) return { success: false, error: 'World not initialised' };
		const result = this.playerManager.registerPlayer(game, playerId, playerName, isObserver);
		World.markDirty();
		return result;
	}

	setPlayerReady(gameId, playerId, isReady) {
		const game = this.getGame(gameId);
		if (!game) return { success: false, error: 'World not initialised' };
		const result = this.playerManager.setPlayerReady(game, playerId, isReady);
		if (result.success && result.allPlayersReady && game.status === 'active') {
			this.computerPlayerManager.startAllComputerPlayers(game);
		}
		World.markDirty();
		return result;
	}

	removePlayer(gameId, playerId) {
		const game = this.getGame(gameId);
		if (!game) return { success: false, error: 'World not initialised' };
		const isComputerPlayer = Object.keys(this.computerPlayerManager.computerPlayers)
			.includes(playerId);
		const result = isComputerPlayer
			? this.computerPlayerManager.removeComputerPlayer(game, playerId)
			: this.playerManager.removePlayer(game, playerId);
		World.markDirty();
		return result;
	}

	addComputerPlayer(gameId, difficulty = 'medium') {
		const game = this.getGame(gameId);
		if (!game) return { success: false, error: 'World not initialised' };
		const result = this.computerPlayerManager.initializeComputerPlayer(game, difficulty);
		World.markDirty();
		return result;
	}

	handlePlayerAction(gameId, playerId, action) {
		const game = this.getGame(gameId);
		if (!game) return { success: false, error: 'World not initialised' };
		const result = this.playerManager.handlePlayerAction(game, playerId, action);
		World.markDirty();
		return result;
	}

	/**
	 * Issue an API token bound to `playerId` (used by external AI bots
	 * authenticating against the REST surface).
	 */
	generateApiToken(playerId) {
		const token = generateApiToken();
		this.apiTokens[token] = playerId;
		log(`Generated API token for player ${playerId}`);
		return token;
	}

	validateApiToken(token) {
		return this.apiTokens[token] || null;
	}

	getGameStateForPlayer(gameId, playerId) {
		const game = this.getGame(gameId);
		if (!game) return { success: false, error: 'World not initialised' };
		if (!game.players[playerId]) {
			return { success: false, error: `Player ${playerId} not in world` };
		}
		const visibleRegion = {
			minX: game.board.minX,
			maxX: game.board.maxX,
			minZ: game.board.minZ,
			maxZ: game.board.maxZ,
		};
		const boardRegion = this.boardManager.getBoardRegion(
			game.board,
			visibleRegion.minX,
			visibleRegion.maxX,
			visibleRegion.minZ,
			visibleRegion.maxZ
		);
		const gameState = {
			id: game.id,
			status: game.status,
			board: boardRegion,
			boardBounds: {
				minX: game.board.minX,
				maxX: game.board.maxX,
				minZ: game.board.minZ,
				maxZ: game.board.maxZ,
				width: game.board.maxX - game.board.minX + 1,
				height: game.board.maxZ - game.board.minZ + 1,
			},
			chessPieces: game.chessPieces,
			players: game.players,
			homeZones: game.homeZones,
			currentPlayer: playerId,
			updatedAt: game.updatedAt,
		};
		return { success: true, gameState };
	}
}

module.exports = GameManager;
