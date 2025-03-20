/**
 * Shaktris Game - Main Entry Point
 * 
 * This file initializes all game components and starts the game.
 */

// Use the minimal version for now until we fix all the issues
import * as gameCore from './minimal-gameCore.js';
import * as debugUtils from './utils/debugUtils.js';

// Global state
let isGameStarted = false;
let initFailed = false;

// Main initialization
async function init() {
	try {
		console.log('Initializing Shaktris game...');
		
		// Run diagnostics
		const diagnostics = debugUtils.printSystemDiagnostics();
		
		// Check if THREE is available
		if (typeof THREE === 'undefined') {
			throw new Error('THREE.js is not loaded properly!');
		}
		
		// Set up UI
		setupUI();
		
		// Register event listeners
		registerEventListeners();
		
		// Show diagnostic overlay in development
		const gameContainer = document.getElementById('game-container');
		if (gameContainer) {
			const renderTest = debugUtils.testThreeJsRendering(gameContainer);
			diagnostics.renderTest = renderTest;
			
			if (!renderTest.success) {
				console.error('THREE.js render test failed:', renderTest);
				throw new Error(`THREE.js rendering test failed at step '${renderTest.errorStep}': ${renderTest.error}`);
			}
		}
		
		// Show diagnostics overlay
		debugUtils.showDiagnosticOverlay(diagnostics);
		
		console.log('Shaktris game initialized successfully');
	} catch (error) {
		console.error('Failed to initialize game:', error);
		showErrorMessage('Failed to initialize game: ' + error.message);
		initFailed = true;
	}
}

/**
 * Show error message
 */
function showErrorMessage(message) {
	// Check if error element exists, create if not
	let errorElement = document.getElementById('error-message');
	if (!errorElement) {
		errorElement = document.createElement('div');
		errorElement.id = 'error-message';
		errorElement.style.position = 'fixed';
		errorElement.style.top = '0';
		errorElement.style.left = '0';
		errorElement.style.width = '100%';
		errorElement.style.padding = '20px';
		errorElement.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
		errorElement.style.color = '#ff5555';
		errorElement.style.textAlign = 'center';
		errorElement.style.zIndex = '1000';
		document.body.appendChild(errorElement);
	}
	
	errorElement.innerHTML = `
		<h3>Error</h3>
		<p>${message}</p>
		<button onclick="window.location.reload()">Reload</button>
	`;
	
	// Hide loading and other elements
	const loadingElement = document.getElementById('loading');
	if (loadingElement) {
		loadingElement.style.display = 'none';
	}
}

/**
 * Set up UI elements
 */
function setupUI() {
	// Create game container if it doesn't exist
	let gameContainer = document.getElementById('game-container');
	if (!gameContainer) {
		gameContainer = document.createElement('div');
		gameContainer.id = 'game-container';
		gameContainer.style.width = '100%';
		gameContainer.style.height = '100%';
		document.body.appendChild(gameContainer);
	}
	
	// Create or show menu screen
	let menuScreen = document.getElementById('menu-screen');
	if (!menuScreen) {
		menuScreen = document.createElement('div');
		menuScreen.id = 'menu-screen';
		menuScreen.className = 'screen';
		menuScreen.innerHTML = `
			<div class="menu-content">
				<h1>SHAKTRIS</h1>
				<div class="menu-buttons">
					<button id="play-button" class="btn btn-primary">Play Game</button>
					<button id="options-button" class="btn">Options</button>
					<button id="how-to-play-button" class="btn">How to Play</button>
				</div>
			</div>
		`;
		document.body.appendChild(menuScreen);
	}
	
	// Create or show game UI
	let gameUI = document.getElementById('game-ui');
	if (!gameUI) {
		gameUI = document.createElement('div');
		gameUI.id = 'game-ui';
		gameUI.innerHTML = `
			<div class="player-info">
				<div id="current-player">Player 1's Turn</div>
				<div id="turn-phase">Phase: Tetris</div>
			</div>
			<div class="controls-info">
				<p>Arrow Keys: Move Tetromino</p>
				<p>Space: Hard Drop</p>
				<p>Click: Select & Move Chess Pieces</p>
			</div>
		`;
		document.body.appendChild(gameUI);
		gameUI.style.display = 'none';
	}
	
	// Add basic CSS for UI
	const styleSheet = document.createElement('style');
	styleSheet.textContent = `
		body, html {
			margin: 0;
			padding: 0;
			width: 100%;
			height: 100%;
			overflow: hidden;
			font-family: Arial, sans-serif;
		}
		
		.screen {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: center;
			align-items: center;
			z-index: 100;
			background-color: rgba(0, 0, 0, 0.8);
		}
		
		.menu-content {
			text-align: center;
			color: white;
		}
		
		.menu-content h1 {
			font-size: 4em;
			margin-bottom: 40px;
			color: #3498db;
			text-shadow: 0 0 10px rgba(52, 152, 219, 0.7);
		}
		
		.menu-buttons {
			display: flex;
			flex-direction: column;
			gap: 15px;
		}
		
		.btn {
			padding: 15px 30px;
			font-size: 1.2em;
			border: none;
			border-radius: 5px;
			cursor: pointer;
			transition: all 0.2s;
		}
		
		.btn-primary {
			background-color: #3498db;
			color: white;
		}
		
		.btn:hover {
			transform: translateY(-3px);
			box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
		}
		
		#game-container {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 1;
		}
		
		#game-ui {
			position: fixed;
			top: 10px;
			left: 10px;
			z-index: 10;
			color: white;
			background-color: rgba(0, 0, 0, 0.5);
			padding: 15px;
			border-radius: 5px;
		}
		
		.player-info {
			margin-bottom: 15px;
			font-size: 1.2em;
		}
		
		.controls-info {
			font-size: 0.9em;
			opacity: 0.8;
		}
		
		.modal {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.7);
			display: flex;
			justify-content: center;
			align-items: center;
			z-index: 200;
		}
		
		.modal-content {
			background-color: white;
			padding: 20px;
			border-radius: 10px;
			max-width: 600px;
			max-height: 80vh;
			overflow-y: auto;
		}
		
		.close-button {
			float: right;
			font-size: 1.5em;
			cursor: pointer;
		}
		
		.help-content h2 {
			color: #3498db;
			margin-top: 0;
		}
		
		#error-message {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.9);
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			z-index: 1001;
			color: #ff5555;
			font-size: 1.2em;
			text-align: center;
			padding: 20px;
		}
		
		#error-message button {
			margin-top: 20px;
			padding: 10px 20px;
			background-color: #3498db;
			color: white;
			border: none;
			border-radius: 5px;
			cursor: pointer;
		}
	`;
	document.head.appendChild(styleSheet);
	
	// Show menu screen by default
	menuScreen.style.display = 'flex';
	
	// Hide loading screen if it exists
	const loadingElement = document.getElementById('loading');
	if (loadingElement) {
		loadingElement.style.display = 'none';
	}
}

/**
 * Register event listeners
 */
function registerEventListeners() {
	// Play button
	const playButton = document.getElementById('play-button');
	if (playButton) {
		playButton.addEventListener('click', startGame);
	}
	
	// Options button
	const optionsButton = document.getElementById('options-button');
	if (optionsButton) {
		optionsButton.addEventListener('click', showOptions);
	}
	
	// How to play button
	const howToPlayButton = document.getElementById('how-to-play-button');
	if (howToPlayButton) {
		howToPlayButton.addEventListener('click', showHowToPlay);
	}
	
	// Window resize
	window.addEventListener('resize', handleResize);
}

/**
 * Start the game
 */
function startGame() {
	try {
		console.log('Starting game...');
		
		if (initFailed) {
			window.location.reload();
			return;
		}
		
		// Hide menu screen
		const menuScreen = document.getElementById('menu-screen');
		if (menuScreen) {
			menuScreen.style.display = 'none';
		}
		
		// Get game container
		const gameContainer = document.getElementById('game-container');
		if (!gameContainer) {
			throw new Error('Game container not found!');
		}
		
		// Show game UI
		const gameUI = document.getElementById('game-ui');
		if (gameUI) {
			gameUI.style.display = 'block';
		}
		
		// Initialize game if not already started
		if (!isGameStarted) {
			// Try to initialize the game
			const success = gameCore.initGame(gameContainer);
			
			if (!success) {
				throw new Error('Game initialization failed!');
			}
			
			isGameStarted = true;
			
			// Set up game state change listener
			setInterval(() => {
				try {
					const gameState = gameCore.getGameState();
					updateUI(gameState);
				} catch (error) {
					console.error('Error updating UI:', error);
				}
			}, 500);
		}
		
		// Show game container
		gameContainer.style.display = 'block';
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorMessage('Failed to start game: ' + error.message);
	}
}

/**
 * Update UI based on game state
 * @param {Object} gameState - Current game state
 */
function updateUI(gameState) {
	// Update current player info
	const currentPlayerElement = document.getElementById('current-player');
	if (currentPlayerElement) {
		currentPlayerElement.textContent = `Player ${gameState.currentPlayer}'s Turn`;
	}
	
	// Update turn phase
	const turnPhaseElement = document.getElementById('turn-phase');
	if (turnPhaseElement) {
		turnPhaseElement.textContent = `Phase: ${gameState.turnPhase.charAt(0).toUpperCase() + gameState.turnPhase.slice(1)}`;
	}
	
	// Check for game over
	if (gameState.isGameOver && gameState.winner) {
		showGameOver(gameState.winner);
	}
}

/**
 * Show game over screen
 * @param {number} winner - Winning player
 */
function showGameOver(winner) {
	// Create modal
	const modal = document.createElement('div');
	modal.className = 'modal';
	modal.innerHTML = `
		<div class="modal-content">
			<h2>Game Over!</h2>
			<p>Player ${winner} has won the game!</p>
			<button id="play-again" class="btn btn-primary">Play Again</button>
		</div>
	`;
	
	// Add to body
	document.body.appendChild(modal);
	
	// Show modal
	modal.style.display = 'block';
	
	// Play again button
	const playAgainButton = modal.querySelector('#play-again');
	playAgainButton.addEventListener('click', () => {
		modal.style.display = 'none';
		document.body.removeChild(modal);
		window.location.reload();
	});
}

/**
 * Show options menu
 */
function showOptions() {
	// Create modal
	const modal = document.createElement('div');
	modal.className = 'modal';
	modal.innerHTML = `
		<div class="modal-content">
			<span class="close-button">&times;</span>
			<h2>Game Options</h2>
			<div>
				<label>
					Camera Speed:
					<input type="range" min="0.1" max="2" step="0.1" value="1" id="camera-speed">
				</label>
			</div>
			<div>
				<label>
					<input type="checkbox" id="show-hints" checked>
					Show Move Hints
				</label>
			</div>
			<button id="save-options" class="btn btn-primary">Save Options</button>
		</div>
	`;
	
	// Add to body
	document.body.appendChild(modal);
	
	// Show modal
	modal.style.display = 'block';
	
	// Close button
	const closeButton = modal.querySelector('.close-button');
	closeButton.addEventListener('click', () => {
		modal.style.display = 'none';
		document.body.removeChild(modal);
	});
	
	// Save button
	const saveButton = modal.querySelector('#save-options');
	saveButton.addEventListener('click', () => {
		// Save options (placeholder for now)
		modal.style.display = 'none';
		document.body.removeChild(modal);
	});
}

/**
 * Show how to play screen
 */
function showHowToPlay() {
	const helpContent = `
		<div class="help-content">
			<h2>How to Play Shaktris</h2>
			
			<p>Shaktris combines Chess and Tetris on floating islands in the sky.</p>
			
			<h3>Game Rules:</h3>
			<ul>
				<li><strong>Tetris Phase:</strong> Place tetrominos to build paths between islands</li>
				<li><strong>Chess Phase:</strong> Move chess pieces to capture your opponent's pieces</li>
				<li><strong>Win Condition:</strong> Capture your opponent's king</li>
			</ul>
			
			<h3>Controls:</h3>
			<ul>
				<li><strong>Arrow Keys:</strong> Move tetromino left/right or rotate</li>
				<li><strong>W/S:</strong> Move tetromino forward/backward</li>
				<li><strong>Space:</strong> Hard drop tetromino</li>
				<li><strong>Mouse:</strong> Select and move chess pieces</li>
				<li><strong>WASD + Shift:</strong> Move camera</li>
			</ul>
		</div>
	`;
	
	// Create modal
	const modal = document.createElement('div');
	modal.className = 'modal';
	modal.innerHTML = `
		<div class="modal-content">
			<span class="close-button">&times;</span>
			${helpContent}
		</div>
	`;
	
	// Add to body
	document.body.appendChild(modal);
	
	// Show modal
	modal.style.display = 'block';
	
	// Close button
	const closeButton = modal.querySelector('.close-button');
	closeButton.addEventListener('click', () => {
		modal.style.display = 'none';
		setTimeout(() => {
			document.body.removeChild(modal);
		}, 300);
	});
}

/**
 * Handle window resize
 */
function handleResize() {
	// Update game renderer size
	if (isGameStarted) {
		try {
			gameCore.updateRenderSize();
		} catch (error) {
			console.error('Error resizing game renderer:', error);
		}
	}
}

// Start initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export for ES modules
export { init };
