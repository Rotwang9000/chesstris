// main.js - Client-side game logic and rendering

// Import network and game state modules
import Network from './js/utils/network-patch.js';
import * as GameState from './js/core/gameState.js';
import * as TetrominoManager from './js/core/tetrominoManager.js';
import * as ChessPieceManager from './js/core/chessPieceManager.js';
import * as GameManager from './js/core/gameManager.js';
import * as Renderer from './js/rendering/renderer.js';
import * as SoundManager from './js/utils/soundManager.js';

// ----- Constants -----
const CELL_SIZE = 30;
const DEFAULT_BOARD_WIDTH = 20;
const DEFAULT_BOARD_HEIGHT = 20;

// ----- Game State -----
let playerId = null;
let playerColor = null;
let playerUsername = null;
let selectedPiece = null;
let validMoves = [];
let isGameInitialized = false;
let isConnectedToServer = false;

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
	// Wait for socket to be ready before initializing the game
	if (window.socketInitialized) {
		initGame();
	} else {
		window.addEventListener('socketReady', initGame);
	}
});

/**
 * Initialize the game
 */
async function initGame() {
	console.log('Initializing game...');
	
	// Get the container element
	const container = document.getElementById('game-container');
	if (!container) {
		console.error('Game container not found');
		showErrorMessage('Game container not found. Please refresh the page.');
		return;
	}
	
	// Show loading screen
	showLoadingScreen('Initializing game...');
	
	try {
		// Create canvas element if it doesn't exist
		let canvas = document.getElementById('game-canvas');
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.id = 'game-canvas';
			container.appendChild(canvas);
		}
		
		// Set canvas dimensions
		canvas.width = window.innerWidth * 0.8;
		canvas.height = window.innerHeight * 0.8;
		
		// Create board container if it doesn't exist
		let boardContainer = document.getElementById('board-container');
		if (!boardContainer) {
			boardContainer = document.createElement('div');
			boardContainer.id = 'board-container';
			boardContainer.style.position = 'relative';
			boardContainer.style.width = canvas.width + 'px';
			boardContainer.style.height = canvas.height + 'px';
			container.appendChild(boardContainer);
			
			// Move canvas into board container
			canvas.remove();
			boardContainer.appendChild(canvas);
		}
		
		// Initialize the renderer
		try {
			Renderer.init('game-canvas');
		} catch (rendererError) {
			console.error('Error initializing renderer:', rendererError);
			showErrorMessage('Failed to initialize renderer. Please refresh the page.', rendererError);
			return;
		}
		
		// Initialize the game
		try {
			const gameInitialized = await GameManager.initGame({
				boardWidth: DEFAULT_BOARD_WIDTH,
				boardHeight: DEFAULT_BOARD_HEIGHT,
				cellSize: CELL_SIZE
			});
			
			if (!gameInitialized) {
				showErrorMessage('Failed to initialize game. Please refresh the page.');
				return;
			}
		} catch (gameInitError) {
			console.error('Error initializing game manager:', gameInitError);
			showErrorMessage('Failed to initialize game manager. Please refresh the page.', gameInitError);
			return;
		}
		
		isGameInitialized = true;
		isConnectedToServer = Network.isConnected();
		
		// Set up UI elements
		setupUI();
		
		// Set up event listeners
		setupEventListeners();
		
		// Hide loading screen
		hideLoadingScreen();
		
		// Show welcome message
		showWelcomeMessage();
		
		// Start a new game
		try {
			await startNewGame();
		} catch (startGameError) {
			console.error('Error starting new game:', startGameError);
			showErrorMessage('Failed to start new game. Trying offline mode...', startGameError);
			
			// Try to start in offline mode
			try {
				const gameData = {
					gameId: 'universal-chesstris-game',
					playerId: 'offline-' + Math.random().toString(36).substr(2, 9),
					offline: true
				};
				
				playerId = gameData.playerId;
				GameState.setPlayerId(playerId);
				
				await GameManager.startGame(gameData.gameId);
				showNotification('Playing in offline mode');
			} catch (offlineError) {
				console.error('Error starting offline mode:', offlineError);
				showErrorMessage('Failed to start in offline mode. Please refresh the page.', offlineError);
				return;
			}
		}
		
		// Start animation loop
		try {
			animate();
		} catch (animateError) {
			console.error('Error starting animation loop:', animateError);
			showErrorMessage('Failed to start animation loop. Please refresh the page.', animateError);
			return;
		}
		
		console.log('Game initialized successfully');
		
		// Add event listeners for score updates
		window.addEventListener('scoreUpdate', handleScoreUpdate);
		window.addEventListener('levelUp', handleLevelUp);
		
		// Initialize sound manager
		SoundManager.init({
			volume: 0.5,
			muted: false
		});
	} catch (error) {
		console.error('Error initializing game:', error);
		showErrorMessage('Failed to initialize game: ' + error.message, error);
	}
}

/**
 * Set up UI elements
 */
function setupUI() {
	// Create game controls
	const controlsContainer = document.createElement('div');
	controlsContainer.id = 'game-controls';
	controlsContainer.className = 'game-controls';
	
	// New Game button
	const newGameButton = document.createElement('button');
	newGameButton.textContent = 'New Game';
	newGameButton.addEventListener('click', startNewGame);
	controlsContainer.appendChild(newGameButton);
	
	// Pause button
	const pauseButton = document.createElement('button');
	pauseButton.textContent = 'Pause';
	pauseButton.addEventListener('click', togglePause);
	controlsContainer.appendChild(pauseButton);
	
	// Debug button
	const debugButton = document.createElement('button');
	debugButton.textContent = 'Debug';
	debugButton.addEventListener('click', toggleDebugPanel);
	controlsContainer.appendChild(debugButton);
	
	// Add controls to the container
	document.getElementById('game-container').appendChild(controlsContainer);
	
	// Create game info display
	setupGameInfoDisplay();
	
	// Create chess piece shop
	setupChessPieceShop();
	
	// Create debug panel
	setupDebugPanel();
	
	// Create chat input
	const chatContainer = document.createElement('div');
	chatContainer.id = 'chat-input-container';
	chatContainer.className = 'chat-input-container';
	
	const chatInput = document.createElement('input');
	chatInput.type = 'text';
	chatInput.id = 'chat-input';
	chatInput.placeholder = 'Type a message...';
	chatInput.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			sendChatMessage();
		}
	});
	chatContainer.appendChild(chatInput);
	
	const chatButton = document.createElement('button');
	chatButton.textContent = 'Send';
	chatButton.addEventListener('click', sendChatMessage);
	chatContainer.appendChild(chatButton);
	
	// Add chat input to the container
	document.getElementById('game-container').appendChild(chatContainer);
}

/**
 * Set up the game info display
 */
function setupGameInfoDisplay() {
	// Create game info container
	const gameInfoContainer = document.createElement('div');
	gameInfoContainer.id = 'game-info';
	gameInfoContainer.className = 'game-info';
	
	// Score display
	const scoreContainer = document.createElement('div');
	scoreContainer.className = 'info-item';
	
	const scoreLabel = document.createElement('span');
	scoreLabel.className = 'info-label';
	scoreLabel.textContent = 'Score:';
	scoreContainer.appendChild(scoreLabel);
	
	const scoreValue = document.createElement('span');
	scoreValue.id = 'score-value';
	scoreValue.className = 'info-value';
	scoreValue.textContent = '0';
	scoreContainer.appendChild(scoreValue);
	
	gameInfoContainer.appendChild(scoreContainer);
	
	// Level display
	const levelContainer = document.createElement('div');
	levelContainer.className = 'info-item';
	
	const levelLabel = document.createElement('span');
	levelLabel.className = 'info-label';
	levelLabel.textContent = 'Level:';
	levelContainer.appendChild(levelLabel);
	
	const levelValue = document.createElement('span');
	levelValue.id = 'level-value';
	levelValue.className = 'info-value';
	levelValue.textContent = '1';
	levelContainer.appendChild(levelValue);
	
	gameInfoContainer.appendChild(levelContainer);
	
	// Lines cleared display
	const linesContainer = document.createElement('div');
	linesContainer.className = 'info-item';
	
	const linesLabel = document.createElement('span');
	linesLabel.className = 'info-label';
	linesLabel.textContent = 'Lines:';
	linesContainer.appendChild(linesLabel);
	
	const linesValue = document.createElement('span');
	linesValue.id = 'lines-value';
	linesValue.className = 'info-value';
	linesValue.textContent = '0';
	linesContainer.appendChild(linesValue);
	
	gameInfoContainer.appendChild(linesContainer);
	
	// Next piece preview
	const nextPieceContainer = document.createElement('div');
	nextPieceContainer.className = 'next-piece-container';
	
	const nextPieceLabel = document.createElement('div');
	nextPieceLabel.className = 'next-piece-label';
	nextPieceLabel.textContent = 'Next:';
	nextPieceContainer.appendChild(nextPieceLabel);
	
	const nextPiecePreview = document.createElement('div');
	nextPiecePreview.id = 'next-piece-preview';
	nextPiecePreview.className = 'next-piece-preview';
	nextPieceContainer.appendChild(nextPiecePreview);
	
	gameInfoContainer.appendChild(nextPieceContainer);
	
	// Add game info to the container
	document.getElementById('game-container').appendChild(gameInfoContainer);
	
	// Update game info when game state changes
	window.addEventListener('gameStateUpdate', updateGameInfo);
}

/**
 * Update the game information display
 */
function updateGameInfo() {
	const gameState = GameState.getGameState();
	
	// Update score
	const scoreValue = document.getElementById('score-value');
	if (scoreValue) {
		scoreValue.textContent = gameState.score || 0;
	}
	
	// Update level
	const levelValue = document.getElementById('level-value');
	if (levelValue) {
		levelValue.textContent = gameState.level || 1;
	}
	
	// Update lines cleared
	const linesValue = document.getElementById('lines-value');
	if (linesValue) {
		linesValue.textContent = gameState.linesCleared || 0;
	}
	
	// Update next piece preview
	const nextPieceContainer = document.getElementById('next-piece-preview');
	if (nextPieceContainer) {
		const nextPiece = TetrominoManager.getNextPiece();
		if (nextPiece) {
			Renderer.drawNextPiecePreview(nextPiece, nextPieceContainer);
		}
	}
}

/**
 * Get tetromino color based on type
 * @param {string} type - The tetromino type
 * @returns {string} The color
 */
function getTetrominoColor(type) {
	switch (type) {
		case 'I': return '#00bcd4'; // Cyan
		case 'O': return '#ffeb3b'; // Yellow
		case 'T': return '#9c27b0'; // Purple
		case 'J': return '#2196f3'; // Blue
		case 'L': return '#ff9800'; // Orange
		case 'S': return '#4caf50'; // Green
		case 'Z': return '#f44336'; // Red
		default: return '#ffffff'; // White
	}
}

/**
 * Set up the chess piece shop UI
 */
function setupChessPieceShop() {
	// Create shop container
	const shopContainer = document.createElement('div');
	shopContainer.id = 'chess-piece-shop';
	shopContainer.className = 'chess-piece-shop';
	
	// Shop title
	const shopTitle = document.createElement('h3');
	shopTitle.textContent = 'Chess Piece Shop';
	shopContainer.appendChild(shopTitle);
	
	// Shop instructions
	const shopInstructions = document.createElement('p');
	shopInstructions.textContent = 'Select a piece to purchase, then click on your home zone to place it.';
	shopContainer.appendChild(shopInstructions);
	
	// Piece buttons container
	const pieceButtonsContainer = document.createElement('div');
	pieceButtonsContainer.className = 'piece-buttons';
	
	// Create buttons for each purchasable piece type
	const purchasablePieces = [
		{ type: 'pawn', value: 1, symbol: '♟' },
		{ type: 'knight', value: 3, symbol: '♞' },
		{ type: 'bishop', value: 3, symbol: '♝' },
		{ type: 'rook', value: 5, symbol: '♜' },
		{ type: 'queen', value: 9, symbol: '♛' }
	];
	
	for (const piece of purchasablePieces) {
		const pieceButton = document.createElement('button');
		pieceButton.className = 'piece-button';
		pieceButton.dataset.pieceType = piece.type;
		pieceButton.dataset.pieceValue = piece.value;
		pieceButton.innerHTML = `${piece.symbol} <span>${piece.type} (${piece.value})</span>`;
		
		pieceButton.addEventListener('click', () => {
			// Deselect any previously selected piece
			document.querySelectorAll('.piece-button.selected').forEach(btn => {
				btn.classList.remove('selected');
			});
			
			// Select this piece
			pieceButton.classList.add('selected');
			
			// Set the selected piece type for purchase
			window.selectedPieceForPurchase = piece.type;
			
			// Show notification
			showNotification(`Selected ${piece.type} for purchase (${piece.value} resources)`);
		});
		
		pieceButtonsContainer.appendChild(pieceButton);
	}
	
	shopContainer.appendChild(pieceButtonsContainer);
	
	// Resources display
	const resourcesDisplay = document.createElement('div');
	resourcesDisplay.id = 'resources-display';
	resourcesDisplay.className = 'resources-display';
	resourcesDisplay.textContent = 'Resources: 0';
	shopContainer.appendChild(resourcesDisplay);
	
	// Add shop to the container
	document.getElementById('game-container').appendChild(shopContainer);
	
	// Update resources display when game state changes
	window.addEventListener('gameStateUpdate', updateResourcesDisplay);
}

/**
 * Update the resources display
 */
function updateResourcesDisplay() {
	const resourcesDisplay = document.getElementById('resources-display');
	if (!resourcesDisplay) return;
	
	const gameState = GameState.getGameState();
	const playerId = GameState.getPlayerId();
	const resources = gameState.players[playerId]?.resources || 0;
	
	resourcesDisplay.textContent = `Resources: ${resources}`;
	
	// Update piece buttons based on available resources
	document.querySelectorAll('.piece-button').forEach(button => {
		const pieceValue = parseInt(button.dataset.pieceValue);
		if (pieceValue > resources) {
			button.disabled = true;
			button.classList.add('disabled');
		} else {
			button.disabled = false;
			button.classList.remove('disabled');
		}
	});
}

/**
 * Set up the debug panel
 */
function setupDebugPanel() {
	// Create debug panel container
	const debugPanel = document.createElement('div');
	debugPanel.id = 'debug-panel';
	debugPanel.className = 'debug-panel';
	debugPanel.style.display = 'none'; // Hidden by default
	
	// Debug panel title
	const debugTitle = document.createElement('h3');
	debugTitle.textContent = 'Debug Panel';
	debugPanel.appendChild(debugTitle);
	
	// Close button
	const closeButton = document.createElement('button');
	closeButton.className = 'close-button';
	closeButton.textContent = 'X';
	closeButton.addEventListener('click', () => {
		debugPanel.style.display = 'none';
	});
	debugPanel.appendChild(closeButton);
	
	// Connection status
	const connectionStatus = document.createElement('div');
	connectionStatus.id = 'connection-status';
	connectionStatus.className = 'debug-section';
	
	const connectionTitle = document.createElement('h4');
	connectionTitle.textContent = 'Connection Status';
	connectionStatus.appendChild(connectionTitle);
	
	const connectionInfo = document.createElement('div');
	connectionInfo.id = 'connection-info';
	connectionStatus.appendChild(connectionInfo);
	
	debugPanel.appendChild(connectionStatus);
	
	// Game state
	const gameStateSection = document.createElement('div');
	gameStateSection.id = 'game-state-section';
	gameStateSection.className = 'debug-section';
	
	const gameStateTitle = document.createElement('h4');
	gameStateTitle.textContent = 'Game State';
	gameStateSection.appendChild(gameStateTitle);
	
	const gameStateInfo = document.createElement('div');
	gameStateInfo.id = 'game-state-info';
	gameStateSection.appendChild(gameStateInfo);
	
	debugPanel.appendChild(gameStateSection);
	
	// Player info
	const playerSection = document.createElement('div');
	playerSection.id = 'player-section';
	playerSection.className = 'debug-section';
	
	const playerTitle = document.createElement('h4');
	playerTitle.textContent = 'Player Information';
	playerSection.appendChild(playerTitle);
	
	const playerInfo = document.createElement('div');
	playerInfo.id = 'player-info';
	playerSection.appendChild(playerInfo);
	
	debugPanel.appendChild(playerSection);
	
	// Board info
	const boardSection = document.createElement('div');
	boardSection.id = 'board-section';
	boardSection.className = 'debug-section';
	
	const boardTitle = document.createElement('h4');
	boardTitle.textContent = 'Board Information';
	boardSection.appendChild(boardTitle);
	
	const boardInfo = document.createElement('div');
	boardInfo.id = 'board-info';
	boardSection.appendChild(boardInfo);
	
	debugPanel.appendChild(boardSection);
	
	// Error log
	const errorSection = document.createElement('div');
	errorSection.id = 'error-section';
	errorSection.className = 'debug-section';
	
	const errorTitle = document.createElement('h4');
	errorTitle.textContent = 'Error Log';
	errorSection.appendChild(errorTitle);
	
	const errorLog = document.createElement('div');
	errorLog.id = 'error-log';
	errorSection.appendChild(errorLog);
	
	const clearErrorsButton = document.createElement('button');
	clearErrorsButton.textContent = 'Clear Errors';
	clearErrorsButton.addEventListener('click', () => {
		errorLog.innerHTML = '';
	});
	errorSection.appendChild(clearErrorsButton);
	
	debugPanel.appendChild(errorSection);
	
	// Add debug panel to the container
	document.getElementById('game-container').appendChild(debugPanel);
	
	// Update debug panel when game state changes
	window.addEventListener('gameStateUpdate', updateDebugPanel);
}

/**
 * Toggle the debug panel
 */
function toggleDebugPanel() {
	const debugPanel = document.getElementById('debug-panel');
	if (debugPanel) {
		if (debugPanel.style.display === 'none') {
			debugPanel.style.display = 'block';
			updateDebugPanel();
		} else {
			debugPanel.style.display = 'none';
		}
	}
}

/**
 * Update the debug panel with current information
 */
function updateDebugPanel() {
	const debugPanel = document.getElementById('debug-panel');
	if (!debugPanel || debugPanel.style.display === 'none') return;
	
	// Update connection status
	const connectionInfo = document.getElementById('connection-info');
	if (connectionInfo) {
		const isConnected = Network.isConnected();
		connectionInfo.innerHTML = `
			<p>Connected: <span class="${isConnected ? 'connected' : 'disconnected'}">${isConnected ? 'Yes' : 'No'}</span></p>
			<p>Offline Mode: <span class="${GameState.isOfflineMode() ? 'offline' : 'online'}">${GameState.isOfflineMode() ? 'Yes' : 'No'}</span></p>
		`;
	}
	
	// Update game state info
	const gameStateInfo = document.getElementById('game-state-info');
	if (gameStateInfo) {
		const gameState = GameState.getGameState();
		gameStateInfo.innerHTML = `
			<p>Game ID: ${gameState.gameId || 'N/A'}</p>
			<p>Paused: ${gameState.isPaused ? 'Yes' : 'No'}</p>
			<p>Game Over: ${gameState.isGameOver ? 'Yes' : 'No'}</p>
			<p>Winner: ${gameState.winner || 'None'}</p>
		`;
	}
	
	// Update player info
	const playerInfo = document.getElementById('player-info');
	if (playerInfo) {
		const gameState = GameState.getGameState();
		const playerId = GameState.getPlayerId();
		
		let playerHtml = `<p>Your ID: ${playerId || 'N/A'}</p>`;
		
		if (gameState.players) {
			playerHtml += '<p>Players in game:</p><ul>';
			
			for (const id in gameState.players) {
				const player = gameState.players[id];
				playerHtml += `<li>${player.name || id} ${id === playerId ? '(You)' : ''} - Resources: ${player.resources || 0}</li>`;
			}
			
			playerHtml += '</ul>';
		}
		
		playerInfo.innerHTML = playerHtml;
	}
	
	// Update board info
	const boardInfo = document.getElementById('board-info');
	if (boardInfo) {
		const gameState = GameState.getGameState();
		
		boardInfo.innerHTML = `
			<p>Board Size: ${gameState.boardWidth} x ${gameState.boardHeight}</p>
			<p>Cell Size: ${gameState.cellSize}px</p>
			<p>Chess Pieces: ${countChessPieces(gameState)}</p>
			<p>Falling Piece: ${gameState.fallingPiece ? gameState.fallingPiece.type : 'None'}</p>
		`;
	}
}

/**
 * Count the number of chess pieces on the board
 * @param {Object} gameState - The game state
 * @returns {number} The number of chess pieces
 */
function countChessPieces(gameState) {
	let count = 0;
	
	if (gameState.board) {
		for (let y = 0; y < gameState.boardHeight; y++) {
			if (gameState.board[y]) {
				for (let x = 0; x < gameState.boardWidth; x++) {
					if (gameState.board[y][x] && gameState.board[y][x].piece) {
						count++;
					}
				}
			}
		}
	}
	
	return count;
}

/**
 * Log an error to the debug panel
 * @param {string} message - The error message
 * @param {Error} error - The error object
 */
function logErrorToDebugPanel(message, error) {
	const errorLog = document.getElementById('error-log');
	if (!errorLog) return;
	
	const errorEntry = document.createElement('div');
	errorEntry.className = 'error-entry';
	
	const timestamp = new Date().toLocaleTimeString();
	errorEntry.innerHTML = `
		<p><strong>${timestamp}</strong>: ${message}</p>
		${error ? `<p class="error-stack">${error.stack || error.message || 'Unknown error'}</p>` : ''}
	`;
	
	errorLog.appendChild(errorEntry);
	
	// Scroll to bottom
	errorLog.scrollTop = errorLog.scrollHeight;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
	
	// Mouse events
	const canvas = document.getElementById('game-canvas');
	canvas.addEventListener('click', onMouseClick);
	canvas.addEventListener('mousemove', onMouseMove);
	
	// Window resize event
	window.addEventListener('resize', handleResize);
}

/**
 * Start a new game or join the universal game
 */
async function startNewGame() {
	try {
		// Show loading screen
		showLoadingScreen('Joining universal game...');
		
		// Get player name
		const playerName = localStorage.getItem('playerName') || prompt('Enter your name:', 'Player_' + Math.floor(Math.random() * 1000));
		if (playerName) {
			localStorage.setItem('playerName', playerName);
		}
		
		// Universal game ID - all players join the same game
		const universalGameId = 'universal-chesstris-game';
		
		// Join the universal game
		let gameData;
		try {
			// Try to join the universal game
			gameData = await Network.joinGame(universalGameId, playerName);
			showNotification(`Joined universal game`);
		} catch (error) {
			console.warn('Could not join universal game, creating offline mode:', error);
			
			// If server is unavailable, create an offline game
			if (!Network.isConnected()) {
				// Create mock game data for offline mode
				gameData = {
					gameId: universalGameId,
					playerId: 'offline-' + Math.random().toString(36).substr(2, 9),
					offline: true
				};
				
				showNotification('Playing in offline mode');
			} else {
				// If connected but still failed, try to create the universal game
				try {
					gameData = await Network.createGame(playerName, { gameId: universalGameId });
					showNotification(`Created universal game`);
				} catch (createError) {
					console.error('Failed to create universal game:', createError);
					
					// Last resort - create mock game data
					gameData = {
						gameId: universalGameId,
						playerId: 'offline-' + Math.random().toString(36).substr(2, 9),
						offline: true
					};
					
					showNotification('Playing in offline mode due to server error');
				}
			}
		}
		
		// Update URL with game ID
		const newUrl = `${window.location.pathname}?gameId=${universalGameId}`;
		window.history.pushState({ gameId: universalGameId }, '', newUrl);
		
		// Store player ID
		playerId = gameData.playerId;
		GameState.setPlayerId(playerId);
		
		// Expose player ID for debugging
		window.playerId = playerId;
		
		// Start the game
		const gameStarted = await GameManager.startGame(universalGameId);
		
		if (!gameStarted) {
			showErrorMessage('Failed to start game');
			return;
		}
		
		// Hide loading screen
		hideLoadingScreen();
		
		console.log('Game started successfully');
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorMessage('Failed to start game: ' + error.message);
	}
}

/**
 * Toggle pause state
 */
async function togglePause() {
	try {
		if (GameState.isGamePaused()) {
			await GameState.resumeGame();
			showNotification('Game resumed');
		} else {
			await GameState.pauseGame();
			showNotification('Game paused');
		}
	} catch (error) {
		console.error('Error toggling pause:', error);
		showErrorMessage('Failed to toggle pause: ' + error.message, error);
	}
}

/**
 * Send a chat message
 */
async function sendChatMessage() {
	const chatInput = document.getElementById('chat-input');
	const message = chatInput.value.trim();
	
	if (message) {
		try {
			await Network.emit('chatMessage', {
				playerId: GameState.getPlayerId(),
				message
			});
			
			chatInput.value = '';
		} catch (error) {
			console.error('Error sending chat message:', error);
			showErrorMessage('Failed to send message: ' + error.message);
		}
	}
}

/**
 * Show welcome message
 */
function showWelcomeMessage() {
	showNotification('Welcome to Shaktris! Use arrow keys to move, space to drop pieces, and click to select chess pieces.');
}

/**
 * Show error message
 * @param {string} message - The error message to show
 * @param {Error} [error] - The error object (optional)
 */
function showErrorMessage(message, error) {
	// Log to console
	if (error) {
		console.error(message, error);
	} else {
		console.error(message);
	}
	
	// Log to debug panel
	logErrorToDebugPanel(message, error);
	
	// Remove existing error message
	const existingError = document.getElementById('error-message');
	if (existingError) {
		existingError.remove();
	}
	
	// Create error message element
	const errorElement = document.createElement('div');
	errorElement.id = 'error-message';
	errorElement.className = 'error-message';
	
	// Add error message
	const messageElement = document.createElement('p');
	messageElement.textContent = message;
	errorElement.appendChild(messageElement);
	
	// Add close button
	const closeButton = document.createElement('button');
	closeButton.textContent = 'Close';
	closeButton.addEventListener('click', () => {
		errorElement.remove();
	});
	errorElement.appendChild(closeButton);
	
	// Add retry button if not connected to server
	if (!isConnectedToServer) {
		const retryButton = document.createElement('button');
		retryButton.textContent = 'Retry Connection';
		retryButton.addEventListener('click', async () => {
			errorElement.remove();
			showLoadingScreen('Reconnecting to server...');
			
			try {
				await Network.initSocket();
				isConnectedToServer = true;
				hideLoadingScreen();
				showNotification('Reconnected to server');
			} catch (error) {
				hideLoadingScreen();
				showErrorMessage('Failed to reconnect: ' + error.message, error);
			}
		});
		errorElement.appendChild(retryButton);
	}
	
	// Add to document
	document.body.appendChild(errorElement);
}

/**
 * Show loading screen
 * @param {string} message - The message to show on the loading screen
 */
function showLoadingScreen(message = 'Loading...') {
	// Get or create loading screen
	let loadingScreen = document.getElementById('loading-screen');
	
	if (!loadingScreen) {
		loadingScreen = document.createElement('div');
		loadingScreen.id = 'loading-screen';
		loadingScreen.className = 'loading-screen';
		
		// Create loading content
		const loadingContent = document.createElement('div');
		loadingContent.className = 'loading-content';
		
		// Game title
		const gameTitle = document.createElement('h1');
		gameTitle.className = 'game-title';
		gameTitle.textContent = 'Shaktris';
		loadingContent.appendChild(gameTitle);
		
		// Game subtitle
		const gameSubtitle = document.createElement('h2');
		gameSubtitle.className = 'game-subtitle';
		gameSubtitle.textContent = 'Chess meets Tetris';
		loadingContent.appendChild(gameSubtitle);
		
		// Loading message
		const loadingMessage = document.createElement('p');
		loadingMessage.id = 'loading-message';
		loadingMessage.textContent = message;
		loadingContent.appendChild(loadingMessage);
		
		// Loading spinner
		const loadingSpinner = document.createElement('div');
		loadingSpinner.className = 'loading-spinner';
		loadingContent.appendChild(loadingSpinner);
		
		loadingScreen.appendChild(loadingContent);
		document.body.appendChild(loadingScreen);
	} else {
		// Update loading message
		const loadingMessage = document.getElementById('loading-message');
		if (loadingMessage) {
			loadingMessage.textContent = message;
		}
	}
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
	const loadingScreen = document.getElementById('loading-screen');
	if (loadingScreen) {
		loadingScreen.style.display = 'none';
	}
}

/**
 * Animation loop
 */
function animate() {
	try {
		requestAnimationFrame(animate);
		
		// Update game state
		updateGame();
		
		// Render game
		Renderer.render(GameState.getGameState());
	} catch (error) {
		console.error('Error in animation loop:', error);
		// Don't show error message here to avoid spamming the user
		// Just log it and continue
	}
}

/**
 * Update game state
 */
function updateGame() {
	// Skip if game is paused or not initialized
	if (!isGameInitialized || GameState.isGamePaused()) {
		return;
	}
	
	// Update falling piece
	updateFallingPiece();
	
	// If in offline mode, handle automatic tetromino movement
	if (GameState.isOfflineMode()) {
		handleOfflineTetrominoMovement();
	}
}

/**
 * Handle automatic tetromino movement in offline mode
 */
function handleOfflineTetrominoMovement() {
	// Get the game state
	const gameState = GameState.getGameState();
	
	// If there's no falling piece, spawn one
	if (!gameState.fallingPiece) {
		TetrominoManager.spawnTetromino();
		return;
	}
	
	// Move the falling piece down automatically based on level
	const now = Date.now();
	const lastMoveTime = window.lastTetrominoMoveTime || 0;
	
	// Calculate the move interval based on level
	// Formula: baseInterval * (0.8 ^ (level - 1))
	const level = gameState.level || 1;
	const baseInterval = 1000; // 1 second at level 1
	const moveInterval = Math.max(100, Math.floor(baseInterval * Math.pow(0.8, level - 1)));
	
	if (now - lastMoveTime > moveInterval) {
		TetrominoManager.moveTetromino('down');
		window.lastTetrominoMoveTime = now;
	}
}

/**
 * Update falling piece
 */
function updateFallingPiece() {
	// Get the falling piece
	const fallingPiece = TetrominoManager.getFallingPiece();
	
	// If there's no falling piece, try to get one
	if (!fallingPiece) {
		if (GameState.isOfflineMode()) {
			// In offline mode, spawn a new tetromino
			TetrominoManager.spawnTetromino();
		} else {
			// In online mode, request a falling piece from the server
			Network.throttledEmit('requestFallingPiece', {
				playerId: GameState.getPlayerId()
			}).catch(error => {
				console.error('Error requesting falling piece:', error);
				
				// If there's an error, try to spawn a tetromino locally
				TetrominoManager.spawnTetromino();
			});
		}
	}
	
	// Update ghost piece
	updateGhostPiece();
}

/**
 * Move the falling piece
 * @param {string} direction - The direction to move (left, right, down)
 */
async function moveFallingPiece(direction) {
	try {
		// Get the falling piece
		const fallingPiece = TetrominoManager.getFallingPiece();
		
		if (!fallingPiece) {
			return;
		}
		
		// Move the piece
		const success = await TetrominoManager.moveTetromino(direction);
		
		if (success) {
			// Play move sound
			// playSound('move');
		}
	} catch (error) {
		console.error('Error moving falling piece:', error);
	}
}

/**
 * Drop the falling piece
 */
async function dropFallingPiece() {
	try {
		// Get the falling piece
		const fallingPiece = TetrominoManager.getFallingPiece();
		
		if (!fallingPiece) {
			return;
		}
		
		// Drop the piece
		const success = await TetrominoManager.dropTetromino();
		
		if (success) {
			// Play drop sound
			// playSound('drop');
		}
	} catch (error) {
		console.error('Error dropping falling piece:', error);
	}
}

/**
 * Rotate the falling piece
 */
async function rotateFallingPiece() {
	try {
		// Get the falling piece
		const fallingPiece = TetrominoManager.getFallingPiece();
		
		if (!fallingPiece) {
			return;
		}
		
		// Rotate the piece
		const success = await TetrominoManager.rotateTetromino();
		
		if (success) {
			// Play rotate sound
			// playSound('rotate');
		}
	} catch (error) {
		console.error('Error rotating falling piece:', error);
	}
}

/**
 * Show a notification
 * @param {string} message - The message to show
 * @param {number} duration - The duration to show the message in milliseconds
 */
function showNotification(message, duration = 3000) {
	// Remove existing notification
	const existingNotification = document.getElementById('notification');
	if (existingNotification) {
		existingNotification.remove();
	}
	
	// Create notification element
	const notificationElement = document.createElement('div');
	notificationElement.id = 'notification';
	notificationElement.className = 'notification';
	notificationElement.textContent = message;
	
	// Add to document
	document.body.appendChild(notificationElement);
	
	// Remove after duration
	setTimeout(() => {
		if (notificationElement.parentNode) {
			notificationElement.parentNode.removeChild(notificationElement);
		}
	}, duration);
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - The mouse event
 */
function onMouseMove(event) {
	// Update cursor based on what's under it
	const { x, y } = getMouseBoardPosition(event);
	
	// Check if there's a piece at this position
	const piece = GameState.getChessPiece(x, y);
	
	if (piece && piece.playerId === GameState.getPlayerId()) {
		document.body.style.cursor = 'pointer';
	} else if (selectedPiece && validMoves.some(([moveX, moveY]) => moveX === x && moveY === y)) {
		document.body.style.cursor = 'pointer';
	} else {
		document.body.style.cursor = 'default';
	}
}

/**
 * Handle mouse click event
 * @param {MouseEvent} event - The mouse event
 */
async function onMouseClick(event) {
	// Get board position
	const { x, y } = getMouseBoardPosition(event);
	
	// Check if we're trying to purchase a piece
	if (window.selectedPieceForPurchase) {
		try {
			const success = await ChessPieceManager.purchasePiece(
				window.selectedPieceForPurchase,
				x,
				y
			);
			
			if (success) {
				showNotification(`Purchased ${window.selectedPieceForPurchase} at (${x}, ${y})`);
				
				// Deselect the piece
				window.selectedPieceForPurchase = null;
				document.querySelectorAll('.piece-button.selected').forEach(btn => {
					btn.classList.remove('selected');
				});
			} else {
				showNotification(`Failed to purchase ${window.selectedPieceForPurchase} at (${x}, ${y})`);
			}
			
			return;
		} catch (error) {
			console.error('Error purchasing piece:', error);
			showErrorMessage('Failed to purchase piece: ' + error.message);
			return;
		}
	}
	
	// Check if we're clicking on a chess piece
	if (selectedPiece) {
		// Check if this is a valid move for the selected piece
		if (validMoves.some(([moveX, moveY]) => moveX === x && moveY === y)) {
			// Move the piece
			try {
				await ChessPieceManager.movePiece(selectedPiece, x, y);
				selectedPiece = null;
				validMoves = [];
				Renderer.clearHighlights();
			} catch (error) {
				console.error('Error moving piece:', error);
				showErrorMessage('Failed to move piece: ' + error.message);
			}
		} else {
			// Deselect piece
			selectedPiece = null;
			validMoves = [];
			Renderer.clearHighlights();
			
			// Try to select a new piece
			handleCellClick(x, y);
		}
	} else {
		// Try to select a piece
		handleCellClick(x, y);
	}
}

/**
 * Handle clicking on a cell
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
function handleCellClick(x, y) {
	try {
		const gameState = GameState.getGameState();
		const playerId = GameState.getPlayerId();
		
		// Check if coordinates are valid
		if (x < 0 || y < 0 || x >= gameState.boardWidth || y >= gameState.boardHeight) {
			return;
		}
		
		// Check if there's a piece at this position
		const piece = gameState.board[y] && gameState.board[y][x];
		
		if (piece && piece.type && piece.playerId === playerId) {
			// Select the piece
			selectedPiece = { x, y, ...piece };
			
			// Get valid moves for this piece
			try {
				validMoves = ChessPieceManager.getValidMoves(piece.type, playerId, x, y);
				
				// Highlight the selected piece and valid moves
				Renderer.highlightCell(x, y, 'selected');
				validMoves.forEach(([moveX, moveY]) => {
					Renderer.highlightCell(moveX, moveY, 'valid-move');
				});
				
				showNotification(`Selected ${piece.type} at (${x}, ${y})`);
			} catch (error) {
				console.error('Error getting valid moves:', error);
				showErrorMessage('Failed to get valid moves: ' + error.message);
			}
		} else if (piece && piece.type) {
			// Clicked on opponent's piece
			showNotification(`That's not your piece!`);
		} else {
			// Clicked on empty cell
			showNotification(`No piece at (${x}, ${y})`);
		}
	} catch (error) {
		console.error('Error handling cell click:', error);
		showErrorMessage('Error selecting piece: ' + error.message);
	}
}

/**
 * Get the board position from mouse coordinates
 * @param {MouseEvent} event - The mouse event
 * @returns {Object} The board position {x, y}
 */
function getMouseBoardPosition(event) {
	const gameState = GameState.getGameState();
	const canvas = document.getElementById('game-canvas');
	const rect = canvas.getBoundingClientRect();
	
	// Get mouse position relative to canvas
	const mouseX = event.clientX - rect.left;
	const mouseY = event.clientY - rect.top;
	
	// Calculate board position
	const boardX = Math.floor(mouseX / gameState.cellSize);
	const boardY = Math.floor(mouseY / gameState.cellSize);
	
	// Ensure coordinates are within board boundaries
	if (boardX >= 0 && boardX < gameState.boardWidth && boardY >= 0 && boardY < gameState.boardHeight) {
		return { x: boardX, y: boardY };
	}
	
	// Return invalid coordinates if outside the board
	return { x: -1, y: -1 };
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} event - The keyboard event
 */
async function handleKeyDown(event) {
	// Skip if game is paused or not initialized
	if (!isGameInitialized || GameState.isGamePaused()) {
		// Allow pause toggle even if game is paused
		if (event.key === 'p' || event.key === 'P') {
			await togglePause();
		}
		return;
	}
	
	try {
		// Handle tetromino movement
		switch (event.key) {
			case 'ArrowLeft':
				// Move tetromino left
				await TetrominoManager.moveTetromino('left');
				event.preventDefault();
				break;
			case 'ArrowRight':
				// Move tetromino right
				await TetrominoManager.moveTetromino('right');
				event.preventDefault();
				break;
			case 'ArrowDown':
				// Move tetromino down
				await TetrominoManager.moveTetromino('down');
				event.preventDefault();
				break;
			case 'ArrowUp':
				// Rotate tetromino
				await TetrominoManager.rotateTetromino();
				event.preventDefault();
				break;
			case ' ':
				// Drop tetromino
				await TetrominoManager.dropTetromino();
				event.preventDefault();
				break;
			case 'p':
			case 'P':
				// Toggle pause
				await togglePause();
				event.preventDefault();
				break;
			case 'd':
			case 'D':
				// Toggle debug panel
				toggleDebugPanel();
				event.preventDefault();
				break;
			case 'r':
			case 'R':
				// Restart game
				if (event.ctrlKey || event.metaKey) {
					await startNewGame();
					showNotification('Game restarted');
					event.preventDefault();
				}
				break;
		}
	} catch (error) {
		console.error('Error handling keyboard input:', error);
		logErrorToDebugPanel('Error handling keyboard input', error);
	}
}

/**
 * Handle window resize event
 */
function handleResize() {
	const canvas = document.getElementById('game-canvas');
	canvas.width = window.innerWidth * 0.8;
	canvas.height = window.innerHeight * 0.8;
	
	// Re-render the game
	Renderer.render(GameState.getGameState());
}

/**
 * Update game state with server data
 * @param {Object} data - The updated game state data
 */
function updateGameState(data) {
	GameState.updateGameState(data);
	
	// If the game state includes a falling piece, update it
	if (data.fallingPiece) {
		TetrominoManager.setFallingPiece(data.fallingPiece);
	}
	
	// Update debug info
	window.gameState = GameState.getGameState();
	
	// Dispatch event for debug panel
	const event = new CustomEvent('gameStateUpdate', { 
		detail: GameState.getGameState() 
	});
	window.dispatchEvent(event);
	
	// Render the updated state
	Renderer.render(GameState.getGameState());
}

/**
 * Update the ghost piece
 */
function updateGhostPiece() {
	// Get the falling piece
	const fallingPiece = TetrominoManager.getFallingPiece();
	
	if (!fallingPiece) {
		return;
	}
	
	// Get the ghost piece
	const ghostPiece = TetrominoManager.getGhostPiece();
	
	// Update the game state
	const gameState = GameState.getGameState();
	gameState.ghostPiece = ghostPiece;
	
	// No need to dispatch an event here as it would cause too many updates
}

/**
 * Handle score updates
 * @param {CustomEvent} event - The score update event
 */
function handleScoreUpdate(event) {
	// Update the game info display
	updateGameInfo();
	
	// Log the score update
	console.log('Score updated:', event.detail);
}

/**
 * Handle level up events
 * @param {CustomEvent} event - The level up event
 */
function handleLevelUp(event) {
	// Update the game info display
	updateGameInfo();
	
	// Increase game speed based on level
	updateGameSpeed();
	
	// Play level up sound
	if (window.SoundManager) {
		window.SoundManager.playSound('levelUp');
	}
	
	// Show level up notification
	showNotification(`Level Up! Level ${event.detail.level}`);
	
	// Log the level up
	console.log('Level up:', event.detail);
}

/**
 * Update the game speed based on the current level
 */
function updateGameSpeed() {
	const gameState = GameState.getGameState();
	const level = gameState.level || 1;
	
	// Calculate the new interval (milliseconds)
	// Formula: baseInterval * (0.8 ^ (level - 1))
	// This makes each level ~20% faster than the previous
	const baseInterval = 1000; // 1 second at level 1
	const newInterval = Math.max(100, Math.floor(baseInterval * Math.pow(0.8, level - 1)));
	
	// Update the game loop interval
	console.log(`Game speed updated: ${newInterval}ms per tick (Level ${level})`);
}
