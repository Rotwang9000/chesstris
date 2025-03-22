/**
 * Standard mock for GameManager
 * This can be imported in tests that need to mock the GameManager
 * Use: import GameManagerMock from '../mocks/GameManagerMock';
 */

export default class GameManagerMock {
	constructor() {
		this.games = {};
		this.players = {};
		this.computerPlayerManager = {
			initializeComputerPlayer: jest.fn().mockReturnValue({
				success: true,
				computerId: 'computer-1',
				computerName: 'Computer Medium',
				difficulty: 'medium'
			}),
			removeComputerPlayer: jest.fn().mockReturnValue({ success: true }),
			startAllComputerPlayers: jest.fn()
		};
	}

	// Game creation and management
	createGame(options = {}) {
		const gameId = options.gameId || `test-game-${Date.now()}`;
		this.games[gameId] = {
			id: gameId,
			width: options.width || 30,
			height: options.height || 30,
			maxPlayers: options.maxPlayers || 4,
			players: {},
			chessPieces: [],
			board: [],
			status: 'waiting',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		
		return {
			gameId,
			width: options.width || 30,
			height: options.height || 30
		};
	}

	getGame(gameId) {
		return this.games[gameId] || null;
	}

	startGame(gameId) {
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		game.status = 'active';
		game.updatedAt = Date.now();
		
		return {
			success: true,
			gameId
		};
	}

	// Player management
	registerPlayer(game, playerId, playerName) {
		if (!game) {
			return {
				success: false,
				error: 'Game not found'
			};
		}
		
		game.players[playerId] = {
			id: playerId,
			name: playerName,
			type: 'human',
			ready: false,
			eliminated: false,
			createdAt: Date.now()
		};
		
		this.players[playerId] = {
			id: playerId,
			name: playerName,
			gameId: game.id
		};
		
		return {
			success: true,
			playerId,
			player: game.players[playerId]
		};
	}

	addPlayer(gameId, playerId, playerName) {
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		return this.registerPlayer(game, playerId, playerName);
	}

	removePlayer(gameId, playerId) {
		const game = this.getGame(gameId);
		if (!game || !game.players[playerId]) {
			return {
				success: false,
				error: 'Game or player not found'
			};
		}
		
		delete game.players[playerId];
		delete this.players[playerId];
		
		return {
			success: true,
			playerId
		};
	}

	// Computer player management
	addComputerPlayer(gameId, difficulty = 'medium') {
		const game = this.getGame(gameId);
		if (!game) {
			return {
				success: false,
				error: `Game with ID ${gameId} not found`
			};
		}
		
		const result = this.computerPlayerManager.initializeComputerPlayer(game, difficulty);
		if (result.success) {
			game.updatedAt = Date.now();
			const computerId = result.computerId;
			
			// Add player to game
			game.players[computerId] = {
				id: computerId,
				name: result.computerName,
				type: 'computer',
				difficulty,
				ready: true,
				eliminated: false,
				createdAt: Date.now()
			};
			
			return {
				success: true,
				playerId: computerId,
				playerDetails: game.players[computerId]
			};
		}
		
		return result;
	}

	// Chess/tetromino functionality - simplified mocks
	placeTetromino(gameId, playerId, tetromino, position) {
		return {
			success: true,
			tetrominoId: `tetromino-${Date.now()}`,
			affectedCells: []
		};
	}

	moveChessPiece(gameId, playerId, pieceId, destination) {
		return {
			success: true,
			pieceId,
			from: { x: 0, y: 0, z: 0 },
			to: destination
		};
	}

	// Game state helpers
	getGameState(gameId) {
		const game = this.getGame(gameId);
		if (!game) return null;
		
		return {
			id: game.id,
			status: game.status,
			players: { ...game.players },
			board: [...game.board],
			chessPieces: [...game.chessPieces]
		};
	}

	// Reset mock data and tracking
	_reset() {
		this.games = {};
		this.players = {};
	}
} 