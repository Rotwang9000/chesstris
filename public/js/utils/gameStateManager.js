/**
 * Game State Manager
 *
 * Manages game state synchronization between client and server
 * Processes game events and updates the renderer
 */

import * as network from './network.js';
import * as gameRenderer from './gameRenderer.js';
import * as soundManager from './soundManager.js';

// Game state constants
export const GAME_STATES = {
	LOADING: 'LOADING',
	MENU: 'MENU',
	CONNECTING: 'CONNECTING',
	PLAYING: 'PLAYING',
	PAUSED: 'PAUSED',
	GAME_OVER: 'GAME_OVER'
};

// Game state
let gameState = {
	board: [],
	chessPieces: [],
	currentTetromino: null,
	nextTetromino: null,
	ghostPosition: null,
	players: {},
	currentPlayer: null,
	turnPhase: null, // 'tetromino' or 'chess'
	turnTimeRemaining: 0,
	scores: {},
	homeZones: {},
	islands: [],
	isSpectating: false,
	spectatingPlayer: null,
	isPaused: false,
	pauseTimeRemaining: 0
};

let _verbose = false;
// Global module state
let initialized = false;
let isGameBoardCreated = false;

// Event callbacks
const eventCallbacks = {};
// State change callbacks
const stateChangeCallbacks = [];

/**
 * Game state for selected chess piece and valid moves
 */
let selectedPiece = null;
let validMoves = [];

// Add this near the top with other variables
let lastStateChange = 0;
const MIN_STATE_CHANGE_INTERVAL = 100; // ms
let lastGameStateUpdate = 0;
const MIN_GAME_STATE_UPDATE_INTERVAL = 100; // ms

// Turn management
let currentTurnStartTime = 0;
let minimumTurnDuration = 10000; // 10 seconds minimum per turn
const TURN_PHASES = {
	TETROMINO: 'tetromino',
	CHESS: 'chess',
	WAITING: 'waiting' // When waiting for minimum turn duration
};

/**
 * Initialize the game state manager
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - True if initialization was successful
 */
export async function init(options = {}) {
	try {
		if (initialized) {
			console.log('Game state manager already initialized');
			return true;
		}
		
		console.log('Initializing game state manager with options:', options);
		
		// Set verbose mode
		_verbose = options.verbose || false;
		
		// Register event handlers
		registerEventHandlers();
		
		// Connect to server via network module if available
		if (typeof network !== 'undefined' && network.init && !network.isConnected()) {
			const networkInitialized = await network.init({
				autoConnect: options.autoConnect !== false,
				onConnect: handleConnect,
				onDisconnect: handleDisconnect,
				onError: handleError
			});
			
			if (!networkInitialized) {
				console.warn('Failed to initialize network module, will use local state only');
			}
		}
		
		// Initialize modules that might be needed 
		if (typeof uiManager !== 'undefined' && uiManager.init) {
			await uiManager.init();
		}
		
		if (typeof inputController !== 'undefined' && inputController.init) {
			await inputController.init();
		}
		
		// Mark as initialized
		initialized = true;
		console.log('Game state manager initialized');
		
		// Return success
		return true;
	} catch (error) {
		console.error('Error initializing game state manager:', error);
		return false;
	}
}

/**
 * Register a callback for any state change
 * @param {Function} callback - Function to call when state changes
 */
export function onAnyStateChange(callback) {
	if (typeof callback === 'function') {
		stateChangeCallbacks.push(callback);
		console.log('Registered state change callback');
	} else {
		console.error('Invalid callback provided to onAnyStateChange');
	}
}

/**
 * Trigger state change callbacks
 * @param {Object} newState - New game state
 * @param {Object} oldState - Previous game state
 */
function notifyStateChangeListeners(newState, oldState) {
	if (debugMode) {
		console.log(`Notifying ${stateChangeCallbacks.length} state change listeners`);
	}
	
	for (const callback of stateChangeCallbacks) {
		try {
			callback(newState, oldState);
		} catch (error) {
			console.error('Error in state change callback:', error);
		}
	}
}

/**
 * Register network event handlers
 */
function registerEventHandlers() {
	// Game flow events
	network.on('gameStarted', handleGameStarted);
	network.on('gameOver', handleGameOver);
	network.on('turnChanged', handleTurnChanged);
	network.on('phaseChanged', handlePhaseChanged);
	
	// Game state events
	network.on('gameStateUpdate', handleGameStateUpdate);
	network.on('boardUpdate', handleBoardUpdate);
	
	// Player events
	network.on('playerJoined', handlePlayerJoined);
	network.on('playerLeft', handlePlayerLeft);
	network.on('playerPaused', handlePlayerPaused);
	network.on('playerResumed', handlePlayerResumed);
	network.on('playerPauseTimeout', handlePlayerPauseTimeout);
	
	// Chess events
	network.on('pieceMoved', handlePieceMoved);
	network.on('pieceCaptured', handlePieceCaptured);
	network.on('kingCaptured', handleKingCaptured);
	network.on('pawnPromoted', handlePawnPromoted);
	network.on('piecePurchased', handlePiecePurchased);
	network.on('piecePurchaseFailed', handlePiecePurchaseFailed);
	network.on('validMoves', handleValidMoves);
	
	// Tetromino events
	network.on('tetrominoPlaced', handleTetrominoPlaced);
	network.on('tetrominoAttached', handleTetrominoAttached);
	network.on('tetrominoDisintegrated', handleTetrominoDisintegrated);
	network.on('rowCleared', handleRowCleared);
	network.on('tetrominoChanged', handleTetrominoChanged);
	
	// Home zone events
	network.on('homeZoneDegraded', handleHomeZoneDegraded);
	network.on('homeZoneRemoved', handleHomeZoneRemoved);
	
	// Island events
	network.on('islandSplit', handleIslandSplit);
	network.on('islandMerged', handleIslandMerged);
	
	// Error events
		network.on('error', handleError);
		
	// Catch-all for debugging
	network.on('*', (event, data) => {
		console.debug(`Received event: ${event}`, data);
	});
}

/**
 * Handle connection to server
 */
function handleConnect() {
	console.log('Connected to game server');
	
	// Request initial game state
	requestGameState();
	
	// Trigger connected event
	triggerEvent('connected');
}

/**
 * Handle disconnection from server
 * @param {string} reason - Disconnection reason
 */
function handleDisconnect(reason) {
	console.log(`Disconnected from game server: ${reason}`);
	
	// Update game state
	gameState.isPaused = true;
	
	// Trigger disconnected event
	triggerEvent('disconnected', { reason });
}

/**
 * Handle network error
 * @param {Object} error - Error data
 */
function handleError(error) {
	console.error('Network error:', error);
	
	// Trigger error event
	triggerEvent('error', { error });
}

/**
 * Request current game state from server
 */
function requestGameState() {
	network.send('requestGameState');
}

/**
 * Handle game started event
 * @param {Object} data - Event data
 */
function handleGameStarted(data) {
	console.log('Game started:', data);
	
	// Update game state with initial data
	if (data.gameState) {
		updateGameState(data.gameState);
	}
	
	// Trigger game started event
	triggerEvent('gameStarted', data);
}

/**
 * Handle game over event
 * @param {Object} data - Event data
 */
function handleGameOver(data) {
	console.log('Game over:', data);
	
	// Update game state
	gameState.isGameOver = true;
	gameState.winner = data.winner;
	
	// Determine if the local player has won
	const isLocalPlayerWin = data.winner === gameState.localPlayerId;
	
	// Show appropriate animation
	import('./gameRenderer.js').then(gameRenderer => {
		if (isLocalPlayerWin) {
			// Show victory animation with player data
			const player = gameState.players[gameState.localPlayerId];
			gameRenderer.showVictoryAnimation(player);
			
			// Play victory sound
			soundManager.play('victory');
			soundManager.playMusic('gameOverMusic');
		} else {
			// Show defeat animation
			gameRenderer.showDefeatAnimation();
			
			// Play game over sound
			soundManager.play('gameOver');
			soundManager.playMusic('gameOverMusic');
		}
	});
	
	// Trigger game over event
	triggerEvent('gameOver', data);
}

/**
 * Handle turn changed event
 * @param {Object} data - Event data
 */
function handleTurnChanged(data) {
	console.log('Turn changed:', data);
	
	// Update game state
	gameState.currentPlayer = data.playerId;
	gameState.turnTimeRemaining = data.timeRemaining;
	
	// Trigger turn changed event
	triggerEvent('turnChanged', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle phase changed event
 * @param {Object} data - Event data
 */
function handlePhaseChanged(data) {
	console.log('Phase changed:', data);
	
	// Update game state
	gameState.turnPhase = data.phase;
	
	// Trigger phase changed event
	triggerEvent('phaseChanged', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle complete game state update
 * @param {Object} data - Complete game state
 */
function handleGameStateUpdate(data) {
	if (!data) return;
	
	console.log('Game state update received:', data);
	
	// Save old state for comparison
	const oldState = { ...gameState };
	
	// Update game state with new data
	Object.assign(gameState, data);
	
	// Add derived properties
	addDerivedStateProperties();
	
	// Update UI based on state changes
	if (typeof uiManager !== 'undefined' && uiManager.updateUI) {
		uiManager.updateUI(gameState);
	}
	
	// Update board visualization if available
	if (gameRenderer && typeof gameRenderer.setGameState === 'function') {
		gameRenderer.setGameState(gameState);
	}
	
	// Update game entities if available
	if (gameRenderer && typeof gameRenderer.updateGameEntities === 'function') {
		gameRenderer.updateGameEntities(gameState);
	}
	
	// Create game board if it doesn't exist
	if (gameRenderer && typeof gameRenderer.createGameBoard === 'function' && 
		(!isGameBoardCreated || oldState.board?.length !== gameState.board?.length)) {
		const boardSize = gameState.board?.length || 16;
		gameRenderer.createGameBoard(boardSize, boardSize);
		isGameBoardCreated = true;
	}
	
	// Notify state change listeners
	notifyStateChangeListeners(gameState, oldState);
	
	// Trigger event
	triggerEvent('gameStateUpdated', gameState);
}

/**
 * Handle board update event
 * @param {Object} data - Board update data
 */
function handleBoardUpdate(data) {
	console.log('Board updated');
	
	// Update board in game state
	if (data.board) {
		gameState.board = data.board;
	}
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
	
	// Trigger board updated event
	triggerEvent('boardUpdated', data);
}

/**
 * Handle player joined event
 * @param {Object} data - Player data
 */
function handlePlayerJoined(data) {
	console.log('Player joined:', data);
	
	// Add player to game state
	if (data.playerId && data.playerData) {
		gameState.players[data.playerId] = data.playerData;
	}
	
	// Trigger player joined event
	triggerEvent('playerJoined', data);
}

/**
 * Handle player left event
 * @param {Object} data - Player data
 */
function handlePlayerLeft(data) {
	console.log('Player left:', data);
	
	// Remove player from game state
	if (data.playerId && gameState.players[data.playerId]) {
		delete gameState.players[data.playerId];
	}
	
	// Trigger player left event
	triggerEvent('playerLeft', data);
}

/**
 * Handle player paused event
 * @param {Object} data - Pause data
 */
function handlePlayerPaused(data) {
	console.log('Player paused:', data);
	
	// Update player in game state
	if (data.playerId && gameState.players[data.playerId]) {
		gameState.players[data.playerId].isPaused = true;
		gameState.players[data.playerId].pauseTimeRemaining = data.timeRemaining;
	}
	
	// If it's the local player, update game state
	if (data.playerId === gameState.localPlayerId) {
		gameState.isPaused = true;
		gameState.pauseTimeRemaining = data.timeRemaining;
	}
	
	// Trigger player paused event
	triggerEvent('playerPaused', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle player resumed event
 * @param {Object} data - Resume data
 */
function handlePlayerResumed(data) {
	console.log('Player resumed:', data);
	
	// Update player in game state
	if (data.playerId && gameState.players[data.playerId]) {
		gameState.players[data.playerId].isPaused = false;
		gameState.players[data.playerId].pauseTimeRemaining = 0;
	}
	
	// If it's the local player, update game state
	if (data.playerId === gameState.localPlayerId) {
		gameState.isPaused = false;
		gameState.pauseTimeRemaining = 0;
	}
	
	// Trigger player resumed event
	triggerEvent('playerResumed', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle player pause timeout event
 * @param {Object} data - Timeout data
 */
function handlePlayerPauseTimeout(data) {
	console.log('Player pause timeout:', data);
	
	// Update player in game state
	if (data.playerId && gameState.players[data.playerId]) {
		gameState.players[data.playerId].isPaused = false;
		gameState.players[data.playerId].pauseTimeRemaining = 0;
		gameState.players[data.playerId].isDisconnected = true;
	}
	
	// Trigger player pause timeout event
	triggerEvent('playerPauseTimeout', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle piece moved event
 * @param {Object} data - Move data
 */
function handlePieceMoved(data) {
	console.log('Piece moved:', data);
	
	// Update piece in game state
	if (data.pieceId && data.position) {
		const piece = findChessPiece(data.pieceId);
		if (piece) {
			piece.position = data.position;
		}
	}
	
	// Play move sound
	soundManager.play('move');
	
	// Trigger piece moved event
	triggerEvent('pieceMoved', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle piece captured event
 * @param {Object} data - Capture data
 */
function handlePieceCaptured(data) {
	console.log('Piece captured:', data);
	
	// Update chess pieces in game state
	if (data.capturedPieceId) {
		const pieceIndex = gameState.chessPieces.findIndex(p => p.id === data.capturedPieceId);
		if (pieceIndex !== -1) {
			gameState.chessPieces.splice(pieceIndex, 1);
		}
	}
	
	// Play capture sound
	soundManager.play('capture');
	
	// Trigger piece captured event
	triggerEvent('pieceCaptured', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle king captured event
 * @param {Object} data - King capture data
 */
function handleKingCaptured(data) {
	console.log('King captured:', data);
	
	// Update chess pieces and players in game state
	if (data.capturedKingId && data.capturedPlayerId && data.captorPlayerId) {
		// Transfer pieces to capturing player
		gameState.chessPieces.forEach(piece => {
			if (piece.playerId === data.capturedPlayerId && piece.id !== data.capturedKingId) {
				piece.playerId = data.captorPlayerId;
			}
		});
		
		// Remove captured king
		const kingIndex = gameState.chessPieces.findIndex(p => p.id === data.capturedKingId);
		if (kingIndex !== -1) {
			gameState.chessPieces.splice(kingIndex, 1);
		}
		
		// Update player status
		if (gameState.players[data.capturedPlayerId]) {
			gameState.players[data.capturedPlayerId].isDefeated = true;
		}
	}
	
	// Play special capture sound
	soundManager.play('check', { volume: 1.0 });
	
	// Trigger king captured event
	triggerEvent('kingCaptured', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle pawn promoted event
 * @param {Object} data - Promotion data
 */
function handlePawnPromoted(data) {
	console.log('Pawn promoted:', data);
	
	// Update piece in game state
	if (data.pieceId && data.newType) {
		const piece = findChessPiece(data.pieceId);
		if (piece) {
			piece.type = data.newType;
		}
	}
	
	// Trigger pawn promoted event
	triggerEvent('pawnPromoted', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle piece purchased event
 * @param {Object} data - Purchase data
 */
function handlePiecePurchased(data) {
	console.log('Piece purchased:', data);
	
	// Add new piece to game state
	if (data.piece) {
		gameState.chessPieces.push(data.piece);
	}
	
	// Update player balance
	if (data.playerId && data.newBalance !== undefined && gameState.players[data.playerId]) {
		gameState.players[data.playerId].balance = data.newBalance;
	}
	
	// Trigger piece purchased event
	triggerEvent('piecePurchased', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle piece purchase failed event
 * @param {Object} data - Failure data
 */
function handlePiecePurchaseFailed(data) {
	console.log('Piece purchase failed:', data);
	
	// Trigger piece purchase failed event
	triggerEvent('piecePurchaseFailed', data);
}

/**
 * Handle tetromino placed event
 * @param {Object} data - Tetromino data
 */
function handleTetrominoPlaced(data) {
	console.log('Tetromino placed:', data);
	
	// Update current tetromino in game state
	gameState.currentTetromino = data.newTetromino || null;
	
	// Play place sound
	soundManager.play('place');
	
	// Trigger tetromino placed event
	triggerEvent('tetrominoPlaced', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle tetromino attached event
 * @param {Object} data - Tetromino data
 */
function handleTetrominoAttached(data) {
	console.log('Tetromino attached:', data);
	
	// Update game state
	if (data.tetromino) {
		// Set tetromino state to attaching for animation
		data.tetromino.state = 'attaching';
		gameState.currentTetromino = data.tetromino;
		
		// Set flag to indicate no animation is playing yet
		gameState.attachmentAnimationActive = false;
		
		// Create animation
		gameRenderer.createTetrominoAttachAnimation(data.tetromino);
		
		// Play place sound
		soundManager.play('place');
		
		// Setup timer to update state after animation completes
		setTimeout(() => {
			// If we have an updated board, apply it
			if (data.updatedBoard) {
				gameState.board = data.updatedBoard;
			}
			
			// Clear current tetromino after attachment
			gameState.currentTetromino = null;
			gameState.attachmentAnimationActive = false;
			
			// Update renderer with new state
			gameRenderer.setGameState(gameState);
		}, 400); // Allow animation to complete (animation is 300ms)
					} else {
		// If no tetromino data, just update the board directly
		if (data.updatedBoard) {
			gameState.board = data.updatedBoard;
		}
	}
	
	// Trigger tetromino attached event
	triggerEvent('tetrominoAttached', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle tetromino disintegrated event
 * @param {Object} data - Tetromino data
 */
function handleTetrominoDisintegrated(data) {
	console.log('Tetromino disintegrated:', data);
	
	// Update game state
	if (data.tetromino) {
		// Set tetromino state to disintegrating for animation
		data.tetromino.state = 'disintegrating';
		gameState.currentTetromino = data.tetromino;
		
		// Set flag to indicate no animation is playing yet
		gameState.disintegrationAnimationActive = false;
		
		// Create animation
		gameRenderer.createTetrominoDisintegrationAnimation(data.tetromino);
		
		// Setup timer to update state after animation completes
		setTimeout(() => {
			// If we have an updated board, apply it
			if (data.updatedBoard) {
				gameState.board = data.updatedBoard;
			}
			
			// Clear current tetromino after disintegration
			gameState.currentTetromino = null;
			gameState.disintegrationAnimationActive = false;
			
			// Update renderer with new state
			gameRenderer.setGameState(gameState);
		}, 600); // Allow animation to complete (animation is 500ms)
			} else {
		// If no tetromino data, just update the board directly
		if (data.updatedBoard) {
			gameState.board = data.updatedBoard;
		}
	}
	
	// Trigger tetromino disintegrated event
	triggerEvent('tetrominoDisintegrated', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle row cleared event
 * @param {Object} data - Row cleared data
 */
function handleRowCleared(data) {
	console.log('Rows cleared:', data);
	
	// Update game state
	if (data.rowsCleared && data.rowsCleared.length > 0) {
		// Store the rows that need to be cleared for animation
		gameState.rowsClearing = data.rowsCleared;
		
		// Set flag to indicate no animation is playing yet
		gameState.rowClearingAnimationActive = false;
		
		// Update scores
		if (data.scores) {
			gameState.scores = data.scores;
		}
		
		// Update level
		if (data.level !== undefined) {
			gameState.level = data.level;
		}
		
		// Create animation
		gameRenderer.createRowClearingAnimation(data.rowsCleared);
		
		// Play clear sound with varying volume based on number of rows
		const volume = Math.min(0.5 + (data.rowsCleared.length * 0.1), 1.0);
		soundManager.play('clear', { volume });
		
		// Setup timer to remove rows from animation state after animation completes
		setTimeout(() => {
			// Update board in game state
			if (data.updatedBoard) {
				gameState.board = data.updatedBoard;
			}
			
			// Clear animation state
			gameState.rowsClearing = [];
			gameState.rowClearingAnimationActive = false;
			
			// Update the renderer
			gameRenderer.setGameState(gameState);
		}, 600); // Allow animation to complete (animation is 500ms)
	} else {
		// If no actual rows to clear, just update the board immediately
		if (data.updatedBoard) {
			gameState.board = data.updatedBoard;
		}
	}
	
	// Trigger row cleared event
	triggerEvent('rowCleared', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle tetromino changed event
 * @param {Object} data - Tetromino data
 */
function handleTetrominoChanged(data) {
	console.log('Tetromino changed:', data);
	
	// Update tetrominos in game state
	if (data.currentTetromino !== undefined) {
		gameState.currentTetromino = data.currentTetromino;
	}
	
	if (data.nextTetromino !== undefined) {
		gameState.nextTetromino = data.nextTetromino;
	}
	
	if (data.ghostPosition !== undefined) {
		gameState.ghostPosition = data.ghostPosition;
	}
	
	// Trigger tetromino changed event
	triggerEvent('tetrominoChanged', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle home zone degraded event
 * @param {Object} data - Degradation data
 */
function handleHomeZoneDegraded(data) {
	console.log('Home zone degraded:', data);
	
	// Update home zone in game state
	if (data.playerId && data.homeZone) {
		gameState.homeZones[data.playerId] = data.homeZone;
	}
	
	// Update board if included
	if (data.updatedBoard) {
		gameState.board = data.updatedBoard;
	}
	
	// Trigger home zone degraded event
	triggerEvent('homeZoneDegraded', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle home zone removed event
 * @param {Object} data - Removal data
 */
function handleHomeZoneRemoved(data) {
	console.log('Home zone removed:', data);
	
	// Remove home zone from game state
	if (data.playerId && gameState.homeZones[data.playerId]) {
		delete gameState.homeZones[data.playerId];
	}
	
	// Update board if included
	if (data.updatedBoard) {
		gameState.board = data.updatedBoard;
	}
	
	// Trigger home zone removed event
	triggerEvent('homeZoneRemoved', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle island split event
 * @param {Object} data - Split data
 */
function handleIslandSplit(data) {
	console.log('Island split:', data);
	
	// Update islands in game state
	if (data.islands) {
		gameState.islands = data.islands;
	}
	
	// Update board if included
	if (data.updatedBoard) {
		gameState.board = data.updatedBoard;
	}
	
	// Trigger island split event
	triggerEvent('islandSplit', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Handle island merged event
 * @param {Object} data - Merge data
 */
function handleIslandMerged(data) {
	console.log('Island merged:', data);
	
	// Update islands in game state
	if (data.islands) {
		gameState.islands = data.islands;
	}
	
	// Update board if included
	if (data.updatedBoard) {
		gameState.board = data.updatedBoard;
	}
	
	// Trigger island merged event
	triggerEvent('islandMerged', data);
	
	// Update the renderer
	gameRenderer.setGameState(gameState);
}

/**
 * Update the game state
 * @param {Object} newState - New state to merge with the current state
 */
export function updateGameState(newState) {
	// Throttle updates to prevent excessive rendering
	const now = Date.now();
	if (now - lastGameStateUpdate < MIN_GAME_STATE_UPDATE_INTERVAL) {
		if (debugMode) {
			console.log(`Game state update throttled`);
		}
		return;
	}
	lastGameStateUpdate = now;
	
	const oldState = {...gameState};
	
	// Clone the new state to avoid reference issues
	const clonedNewState = {...newState};
	
	// Deep merge for nested objects
	if (clonedNewState.players) {
		gameState.players = gameState.players || {};
		for (const [playerId, playerData] of Object.entries(clonedNewState.players)) {
			gameState.players[playerId] = {...(gameState.players[playerId] || {}), ...playerData};
		}
		delete clonedNewState.players;
	}
	
	if (clonedNewState.homeZones) {
		gameState.homeZones = gameState.homeZones || {};
		for (const [zoneId, zoneData] of Object.entries(clonedNewState.homeZones)) {
			gameState.homeZones[zoneId] = {...(gameState.homeZones[zoneId] || {}), ...zoneData};
		}
		delete clonedNewState.homeZones;
	}
	
	// Merge the rest of the state
	Object.assign(gameState, clonedNewState);
	
	// Check for and add derived state properties
	addDerivedStateProperties();
	
	// Update the game renderer
	if (gameRenderer) {
		gameRenderer.setGameState(gameState);
	}
	
	// Notify state change listeners
	notifyStateChangeListeners(gameState, oldState);
}

/**
 * Find a chess piece by ID
 * @param {string} pieceId - Piece ID
 * @returns {Object|null} - Chess piece or null if not found
 */
function findChessPiece(pieceId) {
	return gameState.chessPieces.find(piece => piece.id === pieceId) || null;
}

/**
 * Register a callback for a game event
 * @param {string} event - Event name
 * @param {Function} callback - Callback function
 */
export function on(event, callback) {
	if (typeof callback !== 'function') {
		return;
	}
	
	if (!eventCallbacks[event]) {
		eventCallbacks[event] = [];
	}
	
	eventCallbacks[event].push(callback);
}

/**
 * Remove a callback for a game event
 * @param {string} event - Event name
 * @param {Function} callback - Callback function to remove
 */
export function off(event, callback) {
	if (!eventCallbacks[event]) {
		return;
	}
	
	if (callback) {
		// Remove specific callback
		eventCallbacks[event] = eventCallbacks[event].filter(cb => cb !== callback);
	} else {
		// Remove all callbacks for this event
		delete eventCallbacks[event];
	}
}

/**
 * Trigger a game event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function triggerEvent(event, data) {
	// Call handlers for this event
	if (eventCallbacks[event]) {
		for (const callback of eventCallbacks[event]) {
			try {
				callback(data);
	} catch (error) {
				console.error(`Error in callback for event '${event}':`, error);
			}
		}
	}
}

/**
 * Get the current game state
 * @returns {Object} - Current game state
 */
export function getGameState() {
	return { ...gameState };
}

/**
 * Get the current state name
 * @returns {string} - Current game state name
 */
export function getCurrentState() {
	return gameState.currentGameState || GAME_STATES.LOADING;
}

/**
 * Move a chess piece
 * @param {string} pieceId - Piece ID
 * @param {Object} position - New position
 * @returns {boolean} - True if request sent successfully
 */
export function movePiece(pieceId, position) {
	return network.send('movePiece', { pieceId, position });
}

/**
 * Place a tetromino
 * @param {Object} tetromino - Tetromino data
 * @param {Object} position - Position data
 * @returns {boolean} - True if request sent successfully
 */
export function placeTetromino(tetromino, position) {
	return network.send('placeTetromino', { tetromino, position });
}

/**
 * Rotate tetromino
 * @param {string} direction - Rotation direction ('left', 'right')
 * @returns {boolean} - True if request sent successfully
 */
export function rotateTetromino(direction) {
	return network.send('rotateTetromino', { direction });
}

/**
 * Move tetromino
 * @param {string} direction - Movement direction ('left', 'right', 'down')
 * @returns {boolean} - True if request sent successfully
 */
export function moveTetromino(direction) {
	return network.send('moveTetromino', { direction });
}

/**
 * Drop tetromino
 * @returns {boolean} - True if request sent successfully
 */
export function dropTetromino() {
	return network.send('dropTetromino');
}

/**
 * Purchase a chess piece
 * @param {string} type - Piece type
 * @returns {boolean} - True if request sent successfully
 */
export function purchasePiece(type) {
	return network.send('purchasePiece', { type });
}

/**
 * Pause the game
 * @returns {boolean} - True if request sent successfully
 */
export function pauseGame() {
	return network.send('pauseGame');
}

/**
 * Resume the game
 * @returns {boolean} - True if request sent successfully
 */
export function resumeGame() {
	return network.send('resumeGame');
}

/**
 * Start spectating a player
 * @param {string} playerId - Player ID to spectate
 * @returns {boolean} - True if request sent successfully
 */
export function startSpectating(playerId) {
	return network.send('startSpectating', { playerId });
}

/**
 * Stop spectating
 * @returns {boolean} - True if request sent successfully
 */
export function stopSpectating() {
	return network.send('stopSpectating');
}

/**
 * Clean up resources
 */
export function cleanup() {
	// Clear game state
	gameState = {
		board: [],
		chessPieces: [],
		currentTetromino: null,
		nextTetromino: null,
		ghostPosition: null,
		players: {},
		currentPlayer: null,
		turnPhase: null,
		turnTimeRemaining: 0,
		scores: {},
		homeZones: {},
		islands: [],
		isSpectating: false,
		spectatingPlayer: null,
		isPaused: false,
		pauseTimeRemaining: 0
	};
	
	// Clear event callbacks
	for (const event in eventCallbacks) {
		delete eventCallbacks[event];
	}
	
	// Clean up network
	network.cleanup();
}

/**
 * Set the game state
 * @param {string} newState - New state to set
 * @param {Object} data - Additional data for the state change
 */
export function setState(newState, data = {}) {
	// Throttle state changes to prevent loops
	const now = Date.now();
	if (now - lastStateChange < MIN_STATE_CHANGE_INTERVAL) {
		if (debugMode) {
			console.log(`State change throttled: ${newState}`);
		}
		return false;
	}
	lastStateChange = now;
	
	if (!Object.values(GAME_STATES).includes(newState)) {
		console.error(`Invalid game state: ${newState}`);
		return false;
	}

	const oldState = gameState.currentGameState || GAME_STATES.LOADING;
	
	// Don't trigger state change if state is the same
	if (oldState === newState) {
		if (debugMode) {
			console.log(`State already set to ${newState}, ignoring`);
		}
		return false;
	}
	
	gameState.currentGameState = newState;
	
	// Additional state changes based on the new state
	switch (newState) {
		case GAME_STATES.PLAYING:
			gameState.isGameStarted = true;
			gameState.isGamePaused = false;
			gameState.isGameOver = false;
			break;
			
		case GAME_STATES.PAUSED:
			gameState.isGamePaused = true;
			break;
			
		case GAME_STATES.GAME_OVER:
			gameState.isGameOver = true;
			break;
			
		case GAME_STATES.MENU:
			gameState.isGameStarted = false;
			gameState.isGamePaused = false;
			gameState.isGameOver = false;
			break;
	}
	
	// Trigger event for state change
	triggerEvent('stateChanged', { oldState, newState, data });
	
	// Notify state change listeners
	notifyStateChangeListeners(gameState, oldState);
	
	return true;
}

/**
 * Start a new game
 * @param {Object} options - Game options
 */
export function startGame(options = {}) {
	console.log('Starting game with options:', options);
	
	// First ensure we're in the correct state
	if (gameState.state !== GAME_STATES.PLAYING) {
		// Set state to playing immediately to give user feedback
		setState(GAME_STATES.PLAYING);
	}
	
	// Send startGame event to server
	network.send('startGame', options, (response) => {
		if (response && response.success) {
			console.log('Game started successfully:', response);
			// Server confirmed game start
			gameState.isGameStarted = true;
			
			// If we have a board, update it
			if (gameRenderer && typeof gameRenderer.updateBoardVisualization === 'function' && gameState.board) {
				gameRenderer.updateBoardVisualization(gameState.board);
			}
			
			// Notify listeners that game has started
			triggerEvent('gameStarted', gameState);
		} else {
			console.error('Failed to start game:', response ? response.error : 'Unknown error');
			// Show error message to user
			if (typeof uiManager !== 'undefined' && uiManager.showNotification) {
				uiManager.showNotification('Failed to start game. Please try again.', 'error');
			}
		}
	});
}

/**
 * Select a chess piece and highlight valid moves
 * @param {string} pieceId - ID of the chess piece
 * @returns {boolean} - True if selection was successful
 */
export function selectChessPiece(pieceId) {
	try {
		// Clear previous selection
		clearChessPieceSelection();
		
		// Find the piece
		const piece = findChessPiece(pieceId);
		if (!piece) {
			console.warn(`Piece with ID ${pieceId} not found`);
			return false;
		}
		
		// Check if it's the player's turn and the right phase
		if (gameState.turnPhase !== 'chess' || gameState.currentPlayer !== gameState.localPlayerId) {
			console.warn("It's not your turn to move a chess piece");
			return false;
		}
		
		// Check if it's the player's piece
		if (piece.playerId !== gameState.localPlayerId) {
			console.warn("You can only select your own pieces");
			return false;
		}
		
		// Set as selected piece
		selectedPiece = piece;
		
		// Request valid moves from server
		network.send('requestValidMoves', { pieceId });
		
		// We'll highlight valid moves when the server responds
		return true;
	} catch (error) {
		console.error('Error selecting chess piece:', error);
		return false;
	}
}

/**
 * Clear chess piece selection
 */
export function clearChessPieceSelection() {
	selectedPiece = null;
	validMoves = [];
	
	// Clear highlights in renderer
	gameRenderer.clearHighlights();
}

/**
 * Handle valid moves response from server
 * @param {Object} data - Valid moves data
 */
function handleValidMoves(data) {
	console.log('Received valid moves:', data);
	
	// Check if we still have a selected piece
	if (!selectedPiece || selectedPiece.id !== data.pieceId) {
		console.warn('No piece selected or piece ID mismatch');
		return;
	}
	
	// Store valid moves
	validMoves = data.validMoves || [];
	
	// Highlight valid moves in renderer
	gameRenderer.highlightValidMoves(selectedPiece, validMoves);
	
	// Trigger valid moves event
	triggerEvent('validMoves', { pieceId: selectedPiece.id, validMoves });
}

/**
 * Get the currently selected chess piece
 * @returns {Object|null} - Selected chess piece or null if none selected
 */
export function getSelectedChessPiece() {
	return selectedPiece;
}

/**
 * Get valid moves for the selected chess piece
 * @returns {Array} - Array of valid move positions
 */
export function getValidMoves() {
	return validMoves;
}

/**
 * Check if a move is valid for the selected piece
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {boolean} - True if the move is valid
 */
export function isValidMove(x, z) {
	if (!selectedPiece || !validMoves.length) {
		return false;
	}
	
	return validMoves.some(move => move.x === x && move.z === z);
}

/**
 * Move the selected chess piece to a position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {boolean} - True if move was sent successfully
 */
export function moveSelectedPiece(x, z) {
	if (!selectedPiece) {
		console.warn('No piece selected');
		return false;
	}
	
	if (!isValidMove(x, z)) {
		console.warn('Invalid move position');
		return false;
	}
	
	// Send move to server
	const result = movePiece(selectedPiece.id, { x, z });
	
	// Clear selection after move
	clearChessPieceSelection();
	
	return result;
}

image.png
/**
 * Add derived state properties based on the current game state
 */
function addDerivedStateProperties() {
	// Check if it's the local player's turn
	if (gameState.currentPlayerId && gameState.localPlayerId) {
		gameState.isLocalPlayerTurn = gameState.currentPlayerId === gameState.localPlayerId;
	}
	
	// Get current player data if available
	if (gameState.currentPlayerId && gameState.players && gameState.players[gameState.currentPlayerId]) {
		gameState.currentPlayer = gameState.players[gameState.currentPlayerId];
	}
	
	// If we have a local player ID, mark the local player
	if (gameState.localPlayerId && gameState.players && gameState.players[gameState.localPlayerId]) {
		gameState.localPlayer = gameState.players[gameState.localPlayerId];
	}
}

/**
 * Get the current turn duration
 * @returns {number} Turn duration in milliseconds
 */
export function getCurrentTurnDuration() {
	if (currentTurnStartTime === 0) return 0;
	return Date.now() - currentTurnStartTime;
}

/**
 * Check if the minimum turn duration has elapsed
 * @returns {boolean} True if minimum turn duration has elapsed
 */
export function hasMinimumTurnElapsed() {
	return getCurrentTurnDuration() >= minimumTurnDuration;
}

/**
 * Get remaining time until minimum turn duration is met
 * @returns {number} Remaining time in milliseconds
 */
export function getRemainingMinimumTurnTime() {
	if (hasMinimumTurnElapsed()) return 0;
	return minimumTurnDuration - getCurrentTurnDuration();
}

/**
 * Start a new turn
 */
export function startNewTurn() {
	currentTurnStartTime = Date.now();
	gameState.turnPhase = TURN_PHASES.TETROMINO;
	
	// Update UI
	if (typeof uiManager !== 'undefined' && uiManager.updateTurnIndicator) {
		uiManager.updateTurnIndicator(gameState);
	}
}

/**
 * Advance to the next turn phase
 */
export function advanceTurnPhase() {
	switch (gameState.turnPhase) {
		case TURN_PHASES.TETROMINO:
			gameState.turnPhase = TURN_PHASES.CHESS;
			break;
			
		case TURN_PHASES.CHESS:
			// If minimum turn duration hasn't elapsed, enter waiting phase
			if (!hasMinimumTurnElapsed()) {
				gameState.turnPhase = TURN_PHASES.WAITING;
				
				// Set a timeout to end the waiting phase
				setTimeout(() => {
					if (gameState.turnPhase === TURN_PHASES.WAITING) {
						startNewTurn();
					}
				}, getRemainingMinimumTurnTime());
			} else {
				// Start a new turn immediately
				startNewTurn();
			}
			break;
			
		case TURN_PHASES.WAITING:
			// Only advance from waiting if minimum turn has elapsed
			if (hasMinimumTurnElapsed()) {
				startNewTurn();
			}
			break;
			
		default:
			gameState.turnPhase = TURN_PHASES.TETROMINO;
	}
	
	// Update UI
	if (typeof uiManager !== 'undefined' && uiManager.updateTurnIndicator) {
		uiManager.updateTurnIndicator(gameState);
	}
}

/**
 * Export the current game state as JSON
 * @returns {string} JSON representation of the current game state
 */
export function exportGameState() {
	try {
		const currentState = getGameState();
		return JSON.stringify(currentState, null, 2);
	} catch (error) {
		console.error('Error exporting game state:', error);
		return '{}';
	}
}

/**
 * Import game state from JSON
 * @param {string} jsonState - JSON string to import
 * @returns {boolean} Success status
 */
export function importGameState(jsonState) {
	try {
		const newState = JSON.parse(jsonState);
		if (newState) {
			setState(newState);
			return true;
		}
		return false;
	} catch (error) {
		console.error('Error importing game state:', error);
		return false;
	}
}

/**
 * Load a sample/test game state for debugging
 */
export function loadTestState() {
	try {
		console.log('Loading test game state...');
		
		// Create a sample game state with board, pieces, etc.
		const testState = {
			board: Array(16).fill().map(() => Array(16).fill(0)),
			chessPieces: [
				{ id: 'p1-pawn-1', type: 'pawn', player: 1, x: 2, z: 14 },
				{ id: 'p1-pawn-2', type: 'pawn', player: 1, x: 3, z: 14 },
				{ id: 'p1-rook-1', type: 'rook', player: 1, x: 0, z: 15 },
				{ id: 'p1-knight-1', type: 'knight', player: 1, x: 1, z: 15 },
				{ id: 'p1-bishop-1', type: 'bishop', player: 1, x: 2, z: 15 },
				{ id: 'p1-queen-1', type: 'queen', player: 1, x: 3, z: 15 },
				{ id: 'p1-king-1', type: 'king', player: 1, x: 4, z: 15 },
				{ id: 'p1-bishop-2', type: 'bishop', player: 1, x: 5, z: 15 },
				{ id: 'p1-knight-2', type: 'knight', player: 1, x: 6, z: 15 },
				{ id: 'p1-rook-2', type: 'rook', player: 1, x: 7, z: 15 },
				
				{ id: 'p2-pawn-1', type: 'pawn', player: 2, x: 8, z: 1 },
				{ id: 'p2-pawn-2', type: 'pawn', player: 2, x: 9, z: 1 },
				{ id: 'p2-rook-1', type: 'rook', player: 2, x: 8, z: 0 },
				{ id: 'p2-knight-1', type: 'knight', player: 2, x: 9, z: 0 },
				{ id: 'p2-bishop-1', type: 'bishop', player: 2, x: 10, z: 0 },
				{ id: 'p2-queen-1', type: 'queen', player: 2, x: 11, z: 0 },
				{ id: 'p2-king-1', type: 'king', player: 2, x: 12, z: 0 },
				{ id: 'p2-bishop-2', type: 'bishop', player: 2, x: 13, z: 0 },
				{ id: 'p2-knight-2', type: 'knight', player: 2, x: 14, z: 0 },
				{ id: 'p2-rook-2', type: 'rook', player: 2, x: 15, z: 0 }
			],
			currentTetromino: {
				type: 'Z',
				position: { x: 8, y: 5, z: 7 },
				shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
			},
			ghostPiece: {
				position: { x: 8, y: 0, z: 7 }
			},
			
			// Game status
			players: [
				{ id: 1, name: 'Player 1', score: 0 },
				{ id: 2, name: 'Computer', score: 0 }
			],
			turnPhase: 'tetris',
			turnStartTime: Date.now(),
			
			// Game flags
			isGameStarted: true,
			isGamePaused: false,
			isGameOver: false,
			state: 'PLAYING'
		};
		
		// Add player home areas
		// Player 1 (blue, bottom)
		for (let z = 14; z <= 15; z++) {
			for (let x = 0; x < 8; x++) {
				testState.board[z][x] = 6; // Blue 
			}
		}
		
		// Player 2 (orange, top)
		for (let z = 0; z <= 1; z++) {
			for (let x = 8; x < 16; x++) {
				testState.board[z][x] = 7; // Orange
			}
		}
		
		// Create some floating islands/paths
		const islandCoords = [
			// Left path
			{ x: 1, z: 13, type: 1 }, { x: 2, z: 12, type: 2 }, { x: 3, z: 11, type: 3 },
			{ x: 3, z: 10, type: 4 }, { x: 4, z: 9, type: 5 }, { x: 5, z: 8, type: 1 },
			{ x: 6, z: 7, type: 2 }, { x: 7, z: 6, type: 3 }, { x: 8, z: 5, type: 4 },
			
			// Right path
			{ x: 9, z: 2, type: 2 }, { x: 10, z: 3, type: 3 }, { x: 11, z: 4, type: 4 },
			{ x: 12, z: 5, type: 5 }, { x: 13, z: 6, type: 1 }, { x: 14, z: 7, type: 2 },
			
			// Center islands
			{ x: 7, z: 8, type: 3 }, { x: 8, z: 8, type: 4 }, { x: 9, z: 8, type: 5 },
			{ x: 7, z: 9, type: 1 }, { x: 8, z: 9, type: 2 }, { x: 9, z: 9, type: 3 },
			{ x: 8, z: 7, type: 4 }, { x: 9, z: 7, type: 5 }
		];
		
		// Add islands to the board
		islandCoords.forEach(coord => {
			testState.board[coord.z][coord.x] = coord.type;
		});
		
		// Set the test state
		setState(testState);
		console.log('Test game state loaded successfully');
		return true;
	} catch (error) {
		console.error('Error loading test state:', error);
		return false;
	}
}
