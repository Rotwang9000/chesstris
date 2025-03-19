/**
 * Computer Player Test Framework
 * 
 * This test framework validates the operation of both built-in and external computer players.
 * It simulates game scenarios and assesses player performance based on defined criteria.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3020/api';
const TEST_DURATION = process.env.TEST_DURATION || 60000; // 1 minute by default

// Test players
const COMPUTER_PLAYER_TYPES = {
	BUILT_IN: 'built-in',   // Server's built-in computer player
	EXTERNAL: 'external',   // External API-based computer player
	RANDOM: 'random'        // Random move player (baseline)
};

// Difficulty levels
const DIFFICULTY_LEVELS = {
	EASY: 'easy',
	MEDIUM: 'medium',
	HARD: 'hard'
};

// Test scenarios
const TEST_SCENARIOS = {
	SOLO: 'solo',               // Player plays alone, building structures
	VERSUS_RANDOM: 'vsrandom',  // Player vs random move player
	VERSUS_BUILTIN: 'vsbuiltin', // External player vs built-in player
	TOURNAMENT: 'tournament'    // Multiple players in a round-robin
};

class ComputerPlayerTest {
	constructor(options = {}) {
		this.options = {
			playerType: options.playerType || COMPUTER_PLAYER_TYPES.BUILT_IN,
			difficulty: options.difficulty || DIFFICULTY_LEVELS.MEDIUM,
			scenario: options.scenario || TEST_SCENARIOS.SOLO,
			duration: options.duration || TEST_DURATION,
			apiEndpoint: options.apiEndpoint || null,
			numberOfPlayers: options.numberOfPlayers || 2
		};
		
		this.testId = `test-${uuidv4().substring(0, 8)}`;
		this.gameId = null;
		this.playerId = null;
		this.apiToken = null;
		this.testStartTime = null;
		this.testEndTime = null;
		this.movesMade = 0;
		this.movesSuccessful = 0;
		this.errors = [];
		this.gameState = null;
		this.testIntervals = [];
	}
	
	/**
	 * Start the test
	 */
	async start() {
		try {
			console.log(`Starting computer player test: ${this.testId}`);
			console.log(`Player type: ${this.options.playerType}`);
			console.log(`Difficulty: ${this.options.difficulty}`);
			console.log(`Scenario: ${this.options.scenario}`);
			console.log(`Duration: ${this.options.duration}ms`);
			
			this.testStartTime = Date.now();
			
			// Create a new game for testing
			await this.createGame();
			
			// Set up players based on scenario
			await this.setupPlayers();
			
			// Start test loop
			this.startTestLoop();
			
			// Set timeout to end test
			setTimeout(() => this.endTest(), this.options.duration);
		} catch (error) {
			console.error('Error starting test:', error);
			this.recordError('test_start', error.message);
		}
	}
	
	/**
	 * Create a new game for testing
	 */
	async createGame() {
		try {
			// Create a new game with the test ID
			const response = await axios.post(`${API_URL}/games`, {
				playerId: this.testId,
				username: `Test_${this.testId}`,
				options: {
					testMode: true,
					name: `Test Game ${this.testId}`
				}
			});
			
			if (response.data.success) {
				this.gameId = response.data.gameId;
				this.playerId = response.data.playerId;
				console.log(`Created test game: ${this.gameId}`);
			} else {
				throw new Error(`Failed to create game: ${response.data.message}`);
			}
		} catch (error) {
			console.error('Error creating game:', error);
			this.recordError('game_creation', error.message);
			throw error;
		}
	}
	
	/**
	 * Set up players based on the test scenario
	 */
	async setupPlayers() {
		try {
			switch (this.options.scenario) {
				case TEST_SCENARIOS.SOLO:
					// Add a single computer player
					await this.addComputerPlayer();
					break;
					
				case TEST_SCENARIOS.VERSUS_RANDOM:
					// Add a computer player and a random player
					await this.addComputerPlayer();
					await this.addRandomPlayer();
					break;
					
				case TEST_SCENARIOS.VERSUS_BUILTIN:
					// Add an external player and a built-in player
					if (this.options.playerType === COMPUTER_PLAYER_TYPES.EXTERNAL) {
						await this.registerExternalPlayer();
					} else {
						throw new Error('VERSUS_BUILTIN scenario requires an external player');
					}
					await this.addBuiltInPlayer();
					break;
					
				case TEST_SCENARIOS.TOURNAMENT:
					// Add multiple players
					const playerCount = Math.max(2, Math.min(this.options.numberOfPlayers, 8));
					
					for (let i = 0; i < playerCount; i++) {
						if (i === 0 && this.options.playerType === COMPUTER_PLAYER_TYPES.EXTERNAL) {
							await this.registerExternalPlayer();
						} else {
							await this.addBuiltInPlayer(
								i % 3 === 0 ? DIFFICULTY_LEVELS.EASY : 
								i % 3 === 1 ? DIFFICULTY_LEVELS.MEDIUM : 
								DIFFICULTY_LEVELS.HARD
							);
						}
					}
					break;
					
				default:
					throw new Error(`Unknown scenario: ${this.options.scenario}`);
			}
		} catch (error) {
			console.error('Error setting up players:', error);
			this.recordError('player_setup', error.message);
			throw error;
		}
	}
	
	/**
	 * Register an external computer player
	 */
	async registerExternalPlayer() {
		try {
			if (!this.options.apiEndpoint) {
				throw new Error('API endpoint is required for external players');
			}
			
			// Register external player
			const response = await axios.post(`${API_URL}/computer-players/register`, {
				name: `External_${this.testId}`,
				apiEndpoint: this.options.apiEndpoint,
				description: `Test external player for ${this.testId}`
			});
			
			if (response.data.success) {
				this.playerId = response.data.playerId;
				this.apiToken = response.data.apiToken;
				
				// Add player to the game
				await this.addExternalPlayerToGame();
				
				console.log(`Registered external player: ${this.playerId}`);
			} else {
				throw new Error(`Failed to register external player: ${response.data.message}`);
			}
		} catch (error) {
			console.error('Error registering external player:', error);
			this.recordError('external_player_registration', error.message);
			throw error;
		}
	}
	
	/**
	 * Add external player to the game
	 */
	async addExternalPlayerToGame() {
		try {
			const response = await axios.post(`${API_URL}/games/${this.gameId}/add-computer-player`, {
				computerId: this.playerId,
				apiToken: this.apiToken
			});
			
			if (!response.data.success) {
				throw new Error(`Failed to add external player to game: ${response.data.message}`);
			}
			
			console.log(`Added external player to game: ${this.gameId}`);
		} catch (error) {
			console.error('Error adding external player to game:', error);
			this.recordError('add_external_player', error.message);
			throw error;
		}
	}
	
	/**
	 * Add a built-in computer player
	 */
	async addBuiltInPlayer(difficulty = this.options.difficulty) {
		try {
			const response = await axios.post(`${API_URL}/games/${this.gameId}/computer-players`, {
				difficulty
			});
			
			if (response.data.success) {
				console.log(`Added built-in computer player (${difficulty}): ${response.data.computerId}`);
				return response.data.computerId;
			} else {
				throw new Error(`Failed to add built-in player: ${response.data.message}`);
			}
		} catch (error) {
			console.error('Error adding built-in player:', error);
			this.recordError('add_builtin_player', error.message);
			throw error;
		}
	}
	
	/**
	 * Add a random move player
	 */
	async addRandomPlayer() {
		try {
			const randomPlayerId = `random-${uuidv4().substring(0, 8)}`;
			
			// Join game as random player
			const response = await axios.post(`${API_URL}/games/${this.gameId}/join`, {
				playerId: randomPlayerId,
				username: `Random_${randomPlayerId.substring(0, 5)}`
			});
			
			if (response.data.success) {
				console.log(`Added random player: ${randomPlayerId}`);
				
				// Start interval for random moves
				const interval = setInterval(() => this.makeRandomMove(randomPlayerId), 11000);
				this.testIntervals.push(interval);
				
				return randomPlayerId;
			} else {
				throw new Error(`Failed to add random player: ${response.data.message}`);
			}
		} catch (error) {
			console.error('Error adding random player:', error);
			this.recordError('add_random_player', error.message);
			throw error;
		}
	}
	
	/**
	 * Make a random move for the random player
	 */
	async makeRandomMove(randomPlayerId) {
		try {
			// Get current game state
			const gameState = await this.getGameState();
			
			// 50/50 chance of tetromino or chess move
			const moveType = Math.random() > 0.5 ? 'tetromino' : 'chess';
			
			if (moveType === 'tetromino') {
				// Make random tetromino move
				const tetrominoShapes = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
				const shape = tetrominoShapes[Math.floor(Math.random() * tetrominoShapes.length)];
				const rotation = Math.floor(Math.random() * 4);
				const x = Math.floor(Math.random() * 20);
				const y = Math.floor(Math.random() * 20);
				
				await axios.post(`${API_URL}/games/${this.gameId}/tetromino`, {
					playerId: randomPlayerId,
					moveData: {
						shape,
						rotation,
						x,
						y
					}
				});
			} else {
				// Make random chess move
				// Get player's chess pieces
				const chessPieces = gameState.chessPieces.filter(piece => piece.player === randomPlayerId);
				
				if (chessPieces.length > 0) {
					const piece = chessPieces[Math.floor(Math.random() * chessPieces.length)];
					const dx = Math.floor(Math.random() * 3) - 1;
					const dy = Math.floor(Math.random() * 3) - 1;
					
					await axios.post(`${API_URL}/games/${this.gameId}/chess-move`, {
						playerId: randomPlayerId,
						moveData: {
							pieceId: piece.id,
							fromX: piece.position.x,
							fromY: piece.position.y,
							toX: piece.position.x + dx,
							toY: piece.position.y + dy
						}
					});
				}
			}
		} catch (error) {
			// Ignore random move errors
			console.log('Random move error (expected):', error.message);
		}
	}
	
	/**
	 * Start the test loop
	 */
	startTestLoop() {
		// Update game state every 5 seconds
		const stateInterval = setInterval(() => this.updateGameState(), 5000);
		this.testIntervals.push(stateInterval);
		
		// Log status every 10 seconds
		const statusInterval = setInterval(() => this.logStatus(), 10000);
		this.testIntervals.push(statusInterval);
	}
	
	/**
	 * Update the game state
	 */
	async updateGameState() {
		try {
			this.gameState = await this.getGameState();
		} catch (error) {
			console.error('Error updating game state:', error);
			this.recordError('update_game_state', error.message);
		}
	}
	
	/**
	 * Get the current game state
	 */
	async getGameState() {
		try {
			const response = await axios.get(`${API_URL}/games/${this.gameId}`);
			
			if (response.data.success) {
				return response.data.gameState;
			} else {
				throw new Error(`Failed to get game state: ${response.data.message}`);
			}
		} catch (error) {
			console.error('Error getting game state:', error);
			this.recordError('get_game_state', error.message);
			throw error;
		}
	}
	
	/**
	 * Log the current test status
	 */
	logStatus() {
		const elapsedTime = Date.now() - this.testStartTime;
		const remainingTime = Math.max(0, this.options.duration - elapsedTime);
		
		console.log(`\n----- Test Status: ${this.testId} -----`);
		console.log(`Time remaining: ${Math.floor(remainingTime / 1000)}s`);
		console.log(`Moves made: ${this.movesMade}`);
		console.log(`Moves successful: ${this.movesSuccessful}`);
		console.log(`Success rate: ${this.movesMade > 0 ? ((this.movesSuccessful / this.movesMade) * 100).toFixed(2) : 0}%`);
		console.log(`Errors: ${this.errors.length}`);
		
		if (this.gameState) {
			console.log(`Players: ${Object.keys(this.gameState.players).length}`);
			console.log(`Chess pieces: ${this.gameState.chessPieces ? this.gameState.chessPieces.length : 0}`);
			console.log(`Board size: ${this.gameState.board ? `${this.gameState.board.length}x${this.gameState.board[0] ? this.gameState.board[0].length : 0}` : 'N/A'}`);
		}
		
		console.log('-----------------------------\n');
	}
	
	/**
	 * Record an error
	 */
	recordError(type, message) {
		this.errors.push({
			type,
			message,
			timestamp: new Date().toISOString()
		});
	}
	
	/**
	 * End the test
	 */
	async endTest() {
		try {
			this.testEndTime = Date.now();
			
			// Stop all intervals
			this.testIntervals.forEach(interval => clearInterval(interval));
			
			// Get final game state
			await this.updateGameState();
			
			// Generate test report
			const report = this.generateReport();
			
			// Log report
			console.log('\n======= TEST REPORT =======');
			console.log(JSON.stringify(report, null, 2));
			console.log('=========================\n');
			
			// Cleanup
			await this.cleanup();
		} catch (error) {
			console.error('Error ending test:', error);
		}
	}
	
	/**
	 * Generate test report
	 */
	generateReport() {
		const testDuration = this.testEndTime - this.testStartTime;
		
		return {
			testId: this.testId,
			playerType: this.options.playerType,
			difficulty: this.options.difficulty,
			scenario: this.options.scenario,
			testDuration,
			movesMade: this.movesMade,
			movesSuccessful: this.movesSuccessful,
			successRate: this.movesMade > 0 ? (this.movesSuccessful / this.movesMade) : 0,
			errors: this.errors,
			gameSummary: this.generateGameSummary()
		};
	}
	
	/**
	 * Generate game summary
	 */
	generateGameSummary() {
		if (!this.gameState) {
			return { status: 'unknown' };
		}
		
		return {
			status: this.gameState.status,
			playerCount: Object.keys(this.gameState.players).length,
			chessPieceCount: this.gameState.chessPieces ? this.gameState.chessPieces.length : 0,
			boardSize: this.gameState.board ? {
				rows: this.gameState.board.length,
				cols: this.gameState.board[0] ? this.gameState.board[0].length : 0
			} : 'N/A'
		};
	}
	
	/**
	 * Clean up after the test
	 */
	async cleanup() {
		try {
			// Leave the game
			if (this.playerId && this.gameId) {
				await axios.post(`${API_URL}/games/${this.gameId}/leave`, {
					playerId: this.playerId
				});
			}
		} catch (error) {
			console.error('Error cleaning up:', error);
		}
	}
}

// Export test framework
module.exports = {
	ComputerPlayerTest,
	COMPUTER_PLAYER_TYPES,
	DIFFICULTY_LEVELS,
	TEST_SCENARIOS
};

// Run a test if this file is executed directly
if (require.main === module) {
	// Parse command line arguments
	const argv = require('minimist')(process.argv.slice(2));
	
	const test = new ComputerPlayerTest({
		playerType: argv.type || COMPUTER_PLAYER_TYPES.BUILT_IN,
		difficulty: argv.difficulty || DIFFICULTY_LEVELS.MEDIUM,
		scenario: argv.scenario || TEST_SCENARIOS.SOLO,
		duration: argv.duration || TEST_DURATION,
		apiEndpoint: argv.api || null,
		numberOfPlayers: argv.players || 2
	});
	
	test.start().catch(console.error);
} 