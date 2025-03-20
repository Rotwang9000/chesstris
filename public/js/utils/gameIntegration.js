/**
 * Game Integration Utility
 *
 * Connects all game managers and handles their interactions
 */

import * as gameStateManager from './gameStateManager.js';
import * as tetrominoManager from './tetrominoManager.js';
import * as chessManager from './chessManager.js';
import * as gameRenderer from './gameRenderer.js';
import * as inputController from './inputController.js';
import * as soundManager from './soundManager.js';
import * as uiManager from './uiManager.js';
import * as network from './network.js';
import * as sessionManager from './sessionManager.js';

// Integration state
let isInitialized = false;
let gameContainer = null;
let debugMode = false;
let lastUpdateTime = 0;
let updateInterval = 1000 / 60; // 60 FPS
let gameLoopId = null;
let isSpectatorMode = false;
let spectatingPlayerId = null;

// Module configuration
let _options = {
	verbose: false,
	renderMode: '3d',
	showStats: false,
	autoStartGame: false
};
let _verbose = false;
let _isInitialized = false;

/**
 * Initialize the game integration
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
export async function init(options = {}) {
	try {
		console.log('Initializing game integration with options:', options);
		
		// Store options
		_options = { ..._options, ...options };
		_verbose = _options.verbose || false;
		
		// Store container element
		if (options.containerElement) {
			gameContainer = options.containerElement;
		}
		
		// Initialize modules in order
		await initModules();
		
		// Create event handlers
		setupEventListeners();

		// Initialize managers
		await initManagers(options);
		// Setup game state change listener
		if (gameStateManager.onAnyStateChange) {
			gameStateManager.onAnyStateChange(handleGameStateChange);
		}
		
		// Initialize game renderer
		if (_options.containerElement && typeof gameRenderer !== 'undefined') {
			// Initialize renderer
			const rendererInitialized = await gameRenderer.init(_options.containerElement, {
				renderMode: _options.renderMode || '3d',
				verbose: _verbose
			});
			
			if (!rendererInitialized) {
				console.error('Failed to initialize game renderer');
				return false;
			}
			
			console.log('Game renderer initialized successfully');
			
			// Start render loop
			if (typeof gameRenderer.startRenderLoop === 'function') {
				const renderLoopStarted = gameRenderer.startRenderLoop();
				if (!renderLoopStarted) {
					console.warn('Failed to start render loop');
				}
			}
			
			// Create initial game board
			if (typeof gameRenderer.createGameBoard === 'function') {
				gameRenderer.createGameBoard();
			}
		}
		
		// Start game loops
		startGameLoop();
		
		// Mark as initialized
		_isInitialized = true;
		console.log('Game integration initialized successfully');
		
		return true;
	} catch (error) {
		console.error('Error initializing game integration:', error);
		return false;
	}
}

/**
 * Initialize required modules 
 */
async function initModules() {
	try {
		console.log('Initializing game modules...');
		
		// Initialize network first
		if (typeof network !== 'undefined' && network.init) {
			const networkInitialized = await network.init({
				autoConnect: true,
				verbose: _verbose
			});
			
			if (!networkInitialized) {
				console.warn('Failed to initialize network module, will use local mode');
			}
		}
		
		// Initialize game state manager
		if (typeof gameStateManager !== 'undefined' && gameStateManager.init) {
			const stateManagerInitialized = await gameStateManager.init({
				verbose: _verbose
			});
			
			if (!stateManagerInitialized) {
				console.error('Failed to initialize game state manager');
				throw new Error('Game state manager initialization failed');
			}
		}
		
		// Initialize tetromino manager
		if (typeof tetrominoManager !== 'undefined' && tetrominoManager.init) {
			await tetrominoManager.init();
		}
		
		// Initialize sound manager if available
		if (typeof soundManager !== 'undefined' && soundManager.init) {
			await soundManager.init();
		}
		
		// Initialize input controller
		if (typeof inputController !== 'undefined' && inputController.init) {
			await inputController.init();
		}
		
		console.log('All modules initialized successfully');
		return true;
	} catch (error) {
		console.error('Error initializing modules:', error);
		throw error;
	}
}

/**
 * Handle game state change
 * @param {string|Object} newState - New game state (string or object)
 * @param {string|Object} oldState - Old game state (string or object)
 */
function handleGameStateChange(newState, oldState) {
	// Handle different state formats (string or object)
	const newStateName = typeof newState === 'string' ? newState : (newState && newState.state ? newState.state : 'unknown');
	const oldStateName = typeof oldState === 'string' ? oldState : (oldState && oldState.state ? oldState.state : 'unknown');
	
	// Only log if the state name changed
	if (newStateName !== oldStateName) {
		console.log(`Game state changed: ${oldStateName} -> ${newStateName}`);
	} else if (newState && oldState) {
		// Track major changes without spamming console
		let changes = [];
		
		// Check for board changes (only log significant changes)
		if (newState.board && oldState.board) {
			const newCellCount = countCells(newState.board);
			const oldCellCount = countCells(oldState.board);
			
			if (Math.abs(newCellCount - oldCellCount) > 3) {
				changes.push(`cells: ${oldCellCount} → ${newCellCount}`);
			}
		}
		
		// Check for turn phase changes
		if (newState.turnPhase !== oldState.turnPhase) {
			changes.push(`phase: ${oldState.turnPhase || 'unknown'} → ${newState.turnPhase || 'unknown'}`);
		}
		
		// Check for chess piece count changes
		if (newState.chessPieces && oldState.chessPieces && 
			newState.chessPieces.length !== oldState.chessPieces.length) {
			changes.push(`pieces: ${oldState.chessPieces.length} → ${newState.chessPieces.length}`);
		}
		
		// Log significant changes if any detected
		if (changes.length > 0) {
			console.log(`Game state updates: ${changes.join(', ')}`);
		}
	}

	// Handle state-specific actions
	const stateToCheck = typeof newState === 'string' ? newState : (newState && newState.state ? newState.state : null);
	
	switch (stateToCheck) {
		case gameStateManager.GAME_STATES.LOADING:
			// Show loading screen
			uiManager.showScreen('loading');
			break;

		case gameStateManager.GAME_STATES.MENU:
			// Show menu screen
			uiManager.showScreen('menu');

			// Play menu music
			soundManager.playMusic('menu');
			break;

		case gameStateManager.GAME_STATES.PLAYING:
		case 'PLAYING':
			// Show game screen
			uiManager.showScreen('game');

			// Start the game if coming from menu or paused
			const oldStateName = typeof oldState === 'string' ? oldState : (oldState && oldState.state ? oldState.state : null);
			if (oldStateName === gameStateManager.GAME_STATES.MENU ||
				oldStateName === 'MENU' ||
				oldStateName === gameStateManager.GAME_STATES.PAUSED ||
				oldStateName === 'PAUSED') {
				startGame();
			}

			// Play game music
			soundManager.playMusic('game');
			break;

		case gameStateManager.GAME_STATES.PAUSED:
		case 'PAUSED':
			// Show pause screen
			uiManager.showScreen('pause');

			// Pause game
			pauseGame();

			// Play pause music
			soundManager.playMusic('pause');
			break;

		case gameStateManager.GAME_STATES.GAME_OVER:
		case 'GAME_OVER':
			// Show game over screen
			uiManager.showScreen('game-over');

			// End game
			endGame();

			// Play game over music
			soundManager.playMusic('game-over');
			break;
	}
}

/**
 * Count cells in a board array
 * @param {Array<Array<number>>} board - Board data
 * @returns {number} - Number of non-empty cells
 */
function countCells(board) {
	if (!board || !Array.isArray(board)) return 0;
	
	let count = 0;
	for (let row of board) {
		if (!Array.isArray(row)) continue;
		for (let cell of row) {
			if (cell) count++;
		}
	}
	return count;
}

/**
 * Initialize all game managers
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initManagers(options = {}) {
	try {
		// Initialize session manager first
		if (typeof sessionManager !== 'undefined' && sessionManager.init) {
			await sessionManager.init(options && options.session || {});
		}
		
		// Initialize network
		if (typeof network !== 'undefined' && network.init) {
			await network.init({
				autoConnect: options && options.autoConnect || false,
				onConnect: handleNetworkConnect,
				onDisconnect: handleNetworkDisconnect,
				onError: handleNetworkError
			});
		}
		
		// Initialize game state manager
		if (typeof gameStateManager !== 'undefined' && gameStateManager.init) {
			await gameStateManager.init({
				onStateChange: handleGameStateChange,
				initialState: options && options.initialState || 'MENU'
			});
		}
		
		// Initialize sound manager
		if (typeof soundManager !== 'undefined' && soundManager.init) {
			const settings = (typeof sessionManager !== 'undefined' && sessionManager.getSettings) ? 
				sessionManager.getSettings() : {};
			await soundManager.init({
				masterVolume: settings.masterVolume || 0.7,
				musicVolume: settings.musicVolume || 0.5,
				sfxVolume: settings.sfxVolume || 0.8
			});
			
			// Preload default sounds
			if (typeof soundManager.preloadDefaultSounds === 'function') {
				await soundManager.preloadDefaultSounds();
			}
		}
		
		// Initialize UI manager
		if (typeof uiManager !== 'undefined' && uiManager.init) {
			const settings = (typeof sessionManager !== 'undefined' && sessionManager.getSettings) ? 
				sessionManager.getSettings() : {};
			await uiManager.init({
				rootElement: options && options.uiRoot || document.body,
				theme: settings.theme || 'dark',
				onGameStateChange: handleGameStateChange
			});
		}
		
		// Initialize input controller
		if (typeof inputController !== 'undefined' && inputController.init) {
			const settings = (typeof sessionManager !== 'undefined' && sessionManager.getSettings) ? 
				sessionManager.getSettings() : {};
			await inputController.init({
				keyBindings: settings.keyBindings,
				onInput: handleInput
			});
		}
		
		// Initialize game renderer
		if (typeof gameRenderer !== 'undefined' && gameRenderer.init && gameContainer) {
			await gameRenderer.init(gameContainer, {
				mode: window.is2DMode ? '2d' : '3d',
				showGrid: (typeof sessionManager !== 'undefined' && sessionManager.getSettings) ? 
					sessionManager.getSettings().showGrid !== false : true,
				showShadows: (typeof sessionManager !== 'undefined' && sessionManager.getSettings) ? 
					sessionManager.getSettings().showShadows !== false : true,
				quality: (typeof sessionManager !== 'undefined' && sessionManager.getSettings) ? 
					sessionManager.getSettings().quality || 'medium' : 'medium'
			});
		}
		
		// Initialize tetromino manager
		if (typeof tetrominoManager !== 'undefined' && tetrominoManager.init) {
			await tetrominoManager.init({
				boardWidth: options && options.boardWidth || 10,
				boardHeight: options && options.boardHeight || 20,
				gameSpeed: options && options.gameSpeed || 1000,
				level: options && options.level || 1
			});
		}
		
	// Initialize chess manager
	if (typeof chessManager !== 'undefined' && chessManager.init) {
		await chessManager.init({
			boardWidth: options && options.chessWidth || 8,
			boardHeight: options && options.chessHeight || 8,
			playerColor: options && options.playerColor || 'white'
		});
	}
	
	return true;
} catch (error) {
	console.error('Error initializing managers:', error);
	return false;
}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	// Game state change events
	gameStateManager.on('stateChange', handleGameStateChange);
	
	// Network events
	network.on('player_joined', handlePlayerJoined);
	network.on('player_left', handlePlayerLeft);
	network.on('game_update', handleGameUpdate);
	network.on('tetromino_placed', handleTetrominoPlaced);
	network.on('chess_move', handleChessMove);
	network.on('game_over', handleGameOver);
	network.on('spectator_update', handleSpectatorUpdate);
	
	// Window events
	window.addEventListener('beforeunload', handleBeforeUnload);
	window.addEventListener('focus', handleWindowFocus);
	window.addEventListener('blur', handleWindowBlur);
	
	// Add keyboard shortcut for spectator mode (S key)
	document.addEventListener('keydown', (event) => {
		if (event.key === 's' && event.ctrlKey) {
			// Toggle spectator mode
			if (isSpectatorMode) {
				setSpectatorMode(false, null);
			} else {
				showPlayerListDialog();
			}
			event.preventDefault();
		}
	});
}

/**
 * Start the game loop
 */
function startGameLoop() {
	if (gameLoopId) {
		cancelAnimationFrame(gameLoopId);
	}
	
	const gameLoop = (timestamp) => {
		try {
			// Calculate delta time
			const deltaTime = timestamp - lastUpdateTime;
			
			// Update game if enough time has passed
			if (deltaTime >= updateInterval) {
				// Update game state
				update(deltaTime);
				
				// Store last update time
				lastUpdateTime = timestamp;
			}
			
			// Continue the loop
			gameLoopId = requestAnimationFrame(gameLoop);
		} catch (error) {
			console.error('Error in game loop:', error);
			// Continue the loop despite errors
			gameLoopId = requestAnimationFrame(gameLoop);
		}
	};
	
	// Start the loop
	gameLoopId = requestAnimationFrame(gameLoop);
	console.log('Game loop started');
}

/**
 * Update the game state
 * @param {number} deltaTime - Time since last update in ms
 */
function update(deltaTime) {
	// Get current game state
	const currentState = gameStateManager.getGameState();
	
	// Skip update if game is not in a playable state
	if (currentState.isGameOver || currentState.isPaused) {
		return;
	}
	
	// Update game data
	const gameData = {
		board: currentState.board || [],
		currentTetromino: currentState.currentTetromino,
		nextTetromino: currentState.nextTetromino,
		score: currentState.scores?.[currentState.localPlayerId] || 0,
		level: currentState.level || 1,
		chessPieces: currentState.chessPieces || [],
		players: currentState.players || {},
		turnPhase: currentState.turnPhase,
		currentPlayer: currentState.currentPlayer
	};
	
	// Update game state manager
	gameStateManager.updateGameState(gameData);
	
	// Update renderer
	gameRenderer.setGameState(gameData);
	
	// Update debug panel if in debug mode
	if (debugMode) {
		updateDebugPanel(gameData);
	}
}

/**
 * Update the debug panel
 * @param {Object} gameData - Game data
 */
function updateDebugPanel(gameData) {
	// Only update every 10 frames to reduce overhead
	if (Math.floor(performance.now() / 100) % 10 !== 0) {
		return;
	}
	
	const debugPanel = document.getElementById('debug-panel');
	if (!debugPanel) {
		return;
	}
	
	// Create debug info
	const debugInfo = {
		fps: gameRenderer.getFPS(),
		gameState: gameStateManager.getCurrentState(),
		tetrominoCount: gameData.board.flat().filter(cell => cell !== 0).length,
		chessPieceCount: gameData.chessPieces.length,
		score: gameData.score,
		level: gameData.level,
		lines: gameData.lines,
		networkStatus: network.isConnected() ? 'Connected' : 'Disconnected',
		playerID: sessionManager.getPlayerId()
	};
	
	// Update debug panel
	debugPanel.innerHTML = `
		<h3>Debug Info</h3>
		<pre>${JSON.stringify(debugInfo, null, 2)}</pre>
	`;
}

/**
 * Handle input events
 * @param {string} action - Input action
 * @param {Object} event - Original event
 */
function handleInput(action, event) {
	// Get current game state
	const currentState = gameStateManager.getCurrentState();
	
	// Handle global actions
	switch (action) {
		case 'toggleDebug':
			debugMode = !debugMode;
			const debugPanel = document.getElementById('debug-panel');
			if (debugPanel) {
				debugPanel.style.display = debugMode ? 'block' : 'none';
			}
			return;
			
		case 'toggleMute':
			soundManager.toggleMute();
			return;
			
		case 'toggleFullscreen':
			toggleFullscreen();
			return;
			
		case 'toggleSpectatorMode':
			// Toggle spectator mode if we have a valid player ID
			if (isSpectatorMode) {
				setSpectatorMode(false, null);
			} else {
				// Show player list to select who to spectate
				showPlayerListDialog();
			}
			return;
	}
	
	// If in spectator mode, ignore gameplay inputs
	if (isSpectatorMode && 
		(currentState === gameStateManager.GAME_STATES.PLAYING || 
		 currentState === gameStateManager.GAME_STATES.PAUSED)) {
		return;
	}
	
	// Handle state-specific actions
	switch (currentState) {
		case gameStateManager.GAME_STATES.MENU:
			handleMenuInput(action, event);
			break;
			
		case gameStateManager.GAME_STATES.PLAYING:
			handleGameInput(action, event);
			break;
			
		case gameStateManager.GAME_STATES.PAUSED:
			handlePausedInput(action, event);
			break;
			
		case gameStateManager.GAME_STATES.GAME_OVER:
			handleGameOverInput(action, event);
			break;
	}
}

/**
 * Handle input in menu state
 * @param {string} action - Input action
 * @param {Object} event - Original event
 */
function handleMenuInput(action, event) {
	switch (action) {
		case 'confirm':
			// Start game
			gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
			break;
			
		case 'settings':
			// Show settings dialog
			uiManager.showDialog('settings');
			break;
			
		case 'help':
			// Show help dialog
			uiManager.showDialog('help');
			break;
	}
}

/**
 * Handle input in playing state
 * @param {string} action - Input action
 * @param {Object} event - Original event
 */
function handleGameInput(action, event) {
	// Handle tetromino actions
	switch (action) {
		case 'moveLeft':
			tetrominoManager.moveLeft();
			break;
			
		case 'moveRight':
			tetrominoManager.moveRight();
			break;
			
		case 'moveDown':
			tetrominoManager.moveDown();
			break;
			
		case 'rotateClockwise':
			tetrominoManager.rotateClockwise();
			break;
			
		case 'rotateCounterClockwise':
			tetrominoManager.rotateCounterClockwise();
			break;
			
		case 'hardDrop':
			tetrominoManager.hardDrop();
			break;
			
		case 'hold':
			tetrominoManager.holdTetromino();
			break;
			
		case 'pause':
			gameStateManager.setState(gameStateManager.GAME_STATES.PAUSED);
			break;
	}
	
	// Handle chess piece actions
	if (action === 'select') {
		// Get mouse position
		const mouseX = event.clientX;
		const mouseY = event.clientY;
		
		// Convert to board coordinates
		const boardCoords = screenToBoardCoordinates(mouseX, mouseY);
		
		if (boardCoords) {
			// Try to move the selected piece or select a new piece
			// In asynchronous multiplayer, players can always move their own pieces
			if (!chessManager.moveSelectedPiece(boardCoords.x, boardCoords.y)) {
				// If move failed, try to select a piece
				chessManager.selectPiece(boardCoords.x, boardCoords.y);
			}
		}
	}
}

/**
 * Handle input in paused state
 * @param {string} action - Input action
 * @param {Object} event - Original event
 */
function handlePausedInput(action, event) {
	switch (action) {
		case 'pause':
		case 'confirm':
			// Resume game
			gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
			break;
			
		case 'quit':
			// Return to menu
			gameStateManager.setState(gameStateManager.GAME_STATES.MENU);
			break;
	}
}

/**
 * Handle input in game over state
 * @param {string} action - Input action
 * @param {Object} event - Original event
 */
function handleGameOverInput(action, event) {
	switch (action) {
		case 'confirm':
			// Return to menu
			gameStateManager.setState(gameStateManager.GAME_STATES.MENU);
			break;
			
		case 'restart':
			// Restart game
			gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
			break;
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object|null} Board coordinates or null if outside board
 */
function screenToBoardCoordinates(screenX, screenY) {
	// This is a placeholder implementation
	// In a real implementation, this would use the renderer to convert coordinates
	
	// Get board element
	const boardElement = document.getElementById('game-board');
	if (!boardElement) {
		return null;
	}
	
	// Get board rect
	const boardRect = boardElement.getBoundingClientRect();
	
	// Check if coordinates are within board
	if (screenX < boardRect.left || screenX > boardRect.right ||
		screenY < boardRect.top || screenY > boardRect.bottom) {
		return null;
	}
	
	// Calculate board coordinates
	const boardX = Math.floor((screenX - boardRect.left) / (boardRect.width / 10));
	const boardY = Math.floor((screenY - boardRect.top) / (boardRect.height / 20));
	
	return { x: boardX, y: boardY };
}

/**
 * Start the game
 */
function startGame() {
	// Reset managers
	tetrominoManager.reset();
	chessManager.reset();
	
	// Spawn first tetromino
	tetrominoManager.spawnTetromino();
	
	// Play start sound
	soundManager.play('start');
	
	// Show notification
	uiManager.showNotification('Game started!');
}

/**
 * Pause the game
 */
function pauseGame() {
	// Pause managers
	tetrominoManager.pause();
	
	// Play pause sound
	soundManager.play('pause');
	
	// Show notification
	uiManager.showNotification('Game paused');
}

/**
 * Resume the game
 */
function resumeGame() {
	// Resume managers
	tetrominoManager.resume();
	
	// Play resume sound
	soundManager.play('resume');
	
	// Show notification
	uiManager.showNotification('Game resumed');
}

/**
 * End the game
 */
function endGame() {
	// Stop managers
	tetrominoManager.pause();
	
	// Play game over sound
	soundManager.play('game-over');
	
	// Show notification
	uiManager.showNotification('Game over!');
	
	// Save score
	const score = tetrominoManager.getScore();
	const level = tetrominoManager.getLevel();
	const lines = tetrominoManager.getLines();
	
	sessionManager.saveScore({
		score,
		level,
		lines,
		date: new Date().toISOString()
	});
}

/**
 * Toggle fullscreen
 */
function toggleFullscreen() {
	if (!document.fullscreenElement) {
		document.documentElement.requestFullscreen().catch(err => {
			console.error(`Error attempting to enable fullscreen: ${err.message}`);
		});
	} else {
		if (document.exitFullscreen) {
			document.exitFullscreen();
		}
	}
}

/**
 * Handle network connect event
 */
function handleNetworkConnect() {
	console.log('Connected to server');
	
	// Show notification
	uiManager.showNotification('Connected to server');
	
	// Get socket ID (but don't try to set it on sessionManager)
	const socketId = network.getSocketId();
	console.log(`Socket ID: ${socketId}`);
}

/**
 * Handle network disconnect event
 */
function handleNetworkDisconnect() {
	console.log('Disconnected from server');
	
	// Show notification
	uiManager.showNotification('Disconnected from server', 'error');
}

/**
 * Handle network error event
 * @param {Error} error - Error object
 */
function handleNetworkError(error) {
	console.error('Network error:', error);
	
	// Show notification
	uiManager.showNotification(`Network error: ${error.message}`, 'error');
}

/**
 * Handle player joined event
 * @param {Object} data - Player data
 */
function handlePlayerJoined(data) {
	console.log('Player joined:', data);
	
	// Show notification
	uiManager.showNotification(`${data.playerName} joined the game`);
}

/**
 * Handle player left event
 * @param {Object} data - Player data
 */
function handlePlayerLeft(data) {
	console.log('Player left:', data);
	
	// Show notification
	uiManager.showNotification(`Player left the game`);
}

/**
 * Handle game update event
 * @param {Object} data - Game data
 */
function handleGameUpdate(data) {
	console.log('Game update:', data);
	
	// Update game state
	gameStateManager.updateGameData(data);
}

/**
 * Handle tetromino placed event
 * @param {Object} data - Tetromino data
 */
function handleTetrominoPlaced(data) {
	console.log('Tetromino placed:', data);
	
	// Update board
	// This would typically update the local board state based on the server data
}

/**
 * Handle chess move event
 * @param {Object} data - Chess move data
 */
function handleChessMove(data) {
	console.log('Chess move:', data);
	
	// Update chess pieces
	// This would typically update the local chess state based on the server data
}

/**
 * Handle game over event
 * @param {Object} data - Game over data
 */
function handleGameOver(data) {
	console.log('Game over:', data);
	
	// Set game state to game over
	gameStateManager.setState(gameStateManager.GAME_STATES.GAME_OVER);
	
	// Show game over dialog with result
	uiManager.showDialog('game-over', {
		winner: data.winner,
		reason: data.reason
	});
}

/**
 * Handle window focus event
 */
function handleWindowFocus() {
	// Resume sounds if they were playing
	soundManager.resumeAll();
}

/**
 * Handle window blur event
 */
function handleWindowBlur() {
	// Don't auto-pause game when tabbing away
	// Players need to press a key to pause
	console.log('Window blur - game continues');
}

/**
 * Handle before unload event
 * @param {Event} event - Before unload event
 */
function handleBeforeUnload(event) {
	// Save session data
	sessionManager.saveSession();
	
	// Clean up resources
	cleanup();
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up game integration resources...');
		
		// Stop game loop
		if (gameLoopId) {
			cancelAnimationFrame(gameLoopId);
			gameLoopId = null;
		}
		
		// Remove event listeners
		window.removeEventListener('beforeunload', handleBeforeUnload);
		window.removeEventListener('focus', handleWindowFocus);
		window.removeEventListener('blur', handleWindowBlur);
		
		// Clean up managers
		gameRenderer.cleanup();
		tetrominoManager.cleanup();
		chessManager.cleanup();
		inputController.cleanup();
		soundManager.cleanup();
		uiManager.cleanup();
		network.cleanup();
		
		isInitialized = false;
		
		console.log('Game integration cleaned up');
	} catch (error) {
		console.error('Error cleaning up game integration resources:', error);
	}
}

/**
 * Set spectator mode
 * @param {boolean} enabled - Whether spectator mode is enabled
 * @param {string} playerId - ID of the player to spectate
 */
export function setSpectatorMode(enabled, playerId) {
	isSpectatorMode = enabled;
	spectatingPlayerId = playerId;
	
	// Update UI to show spectator mode
	if (isSpectatorMode) {
		uiManager.showNotification(`Spectating player: ${playerId}`, 'info');
		
		// Request the current game state from the server
		network.emit('request_game_state', { playerId: spectatingPlayerId });
	} else {
		uiManager.showNotification('Returned to player mode', 'info');
	}
}

/**
 * Check if in spectator mode
 * @returns {boolean} Whether in spectator mode
 */
export function isInSpectatorMode() {
	return isSpectatorMode;
}

/**
 * Get the ID of the player being spectated
 * @returns {string|null} Player ID or null if not spectating
 */
export function getSpectatingPlayerId() {
	return spectatingPlayerId;
}

/**
 * Show dialog with list of players to spectate
 */
function showPlayerListDialog() {
	// Get list of players from network
	const players = network.getPlayers();
	
	if (!players || players.length === 0) {
		uiManager.showNotification('No players available to spectate', 'error');
		return;
	}
	
	// Create dialog content
	const content = document.createElement('div');
	content.innerHTML = '<h3>Select a player to spectate</h3>';
	
	// Create player list
	const playerList = document.createElement('ul');
	playerList.className = 'player-list';
	
	players.forEach(player => {
		// Skip current player
		if (player.id === sessionManager.getPlayerId()) {
			return;
		}
		
		const playerItem = document.createElement('li');
		playerItem.className = 'player-item';
		playerItem.innerHTML = `
			<span>${player.name || player.id}</span>
			<button class="spectate-button">Spectate</button>
		`;
		
		// Add click handler
		const spectateButton = playerItem.querySelector('.spectate-button');
		spectateButton.addEventListener('click', () => {
			setSpectatorMode(true, player.id);
			uiManager.closeDialog();
		});
		
		playerList.appendChild(playerItem);
	});
	
	content.appendChild(playerList);
	
	// Show dialog
	uiManager.showCustomDialog({
		title: 'Spectator Mode',
		content: content,
		buttons: [
			{
				label: 'Cancel',
				action: () => uiManager.closeDialog()
			}
		]
	});
}

/**
 * Handle spectator update event
 * @param {Object} data - Spectator data
 */
function handleSpectatorUpdate(data) {
	if (!isSpectatorMode || data.playerId !== spectatingPlayerId) {
		return;
	}
	
	// Update game state with spectated player's data
	gameStateManager.updateState(data.gameState);
	
	// Update renderer
	gameRenderer.setGameState(data.gameState);
} 