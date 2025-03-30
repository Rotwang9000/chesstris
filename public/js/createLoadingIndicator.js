import { handleTetrisPhaseClick, handleChessPhaseClick, resetGameState, startPlayingGame } from './enhanced-gameCore';
import * as sceneModule from './scene';
import gameState from './utils/gameState.js';

/**
 * Create a loading indicator with Russian-themed styling
 */
export function createLoadingIndicator() {
	// Remove existing loading indicator if present
	const existingIndicator = document.getElementById('loading-indicator');
	if (existingIndicator) {
		document.body.removeChild(existingIndicator);
	}

	// Create loading indicator
	const loadingIndicator = document.createElement('div');
	loadingIndicator.id = 'loading-indicator';

	// Style with Russian/chess/tetris theme
	Object.assign(loadingIndicator.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '100%',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: '#ffcc00', // Gold text
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: '9999',
		fontFamily: 'Times New Roman, serif'
	});

	// Create animated chess piece with tetris blocks
	const animationContainer = document.createElement('div');
	Object.assign(animationContainer.style, {
		position: 'relative',
		width: '100px',
		height: '100px',
		marginBottom: '20px'
	});

	// Chess knight symbol with animation
	const chessSymbol = document.createElement('div');
	chessSymbol.innerHTML = '♞';
	Object.assign(chessSymbol.style, {
		fontSize: '80px',
		animation: 'pulse 1.5s infinite',
		color: '#ffcc00',
		textShadow: '0 0 10px rgba(255, 204, 0, 0.7)'
	});

	// Create animation keyframes
	const styleElement = document.createElement('style');
	styleElement.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); }
			50% { transform: scale(1.1); }
			100% { transform: scale(1); }
		}
		@keyframes tetrisfall {
			0% { transform: translateY(-20px); opacity: 0; }
			100% { transform: translateY(0); opacity: 1; }
		}
	`;
	document.head.appendChild(styleElement);

	// Create loading text
	const loadingText = document.createElement('div');
	loadingText.textContent = 'Preparing Shaktris World...';
	Object.assign(loadingText.style, {
		fontSize: '24px',
		marginBottom: '10px',
		fontWeight: 'bold',
		textShadow: '0 0 5px rgba(255, 204, 0, 0.5)'
	});

	// Create subtitle
	const subtitle = document.createElement('div');
	subtitle.textContent = 'Please wait while the pieces are arranged';
	Object.assign(subtitle.style, {
		fontSize: '16px',
		opacity: '0.8',
		marginBottom: '30px'
	});

	// Add elements to document
	animationContainer.appendChild(chessSymbol);
	loadingIndicator.appendChild(animationContainer);
	loadingIndicator.appendChild(loadingText);
	loadingIndicator.appendChild(subtitle);
	document.body.appendChild(loadingIndicator);

	return loadingIndicator;
}
export function hideError() {
	const errorElement = document.getElementById('error-message');
	if (errorElement) {
		errorElement.style.display = 'none';
	}
}


/**
 * Show error message in a styled overlay
 * @param {string} message - Error message to display
 */
export function showErrorMessage(message) {
	// Create error message container if it doesn't exist
	let errorElement = document.getElementById('error-message');
	if (!errorElement) {
		errorElement = document.createElement('div');
		errorElement.id = 'error-message';

		// Style the error message with Russian theme
		Object.assign(errorElement.style, {
			position: 'fixed',
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			backgroundColor: 'rgba(0, 0, 0, 0.9)',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: '1001',
			color: '#ffcc00',
			textAlign: 'center',
			fontFamily: 'Times New Roman, serif',
			padding: '20px'
		});

		document.body.appendChild(errorElement);
	}

	// Set error message with Russian-themed styling
	errorElement.innerHTML = `
		<div style="max-width: 600px; background-color: rgba(50, 0, 0, 0.8); padding: 30px; border-radius: 10px; border: 2px solid #ffcc00;">
			<h2 style="color: #ffcc00; margin-top: 0;">Error</h2>
			<p style="font-size: 18px; margin-bottom: 20px;">${message}</p>
			<button onclick="window.location.reload()" style="background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 10px 20px; font-size: 16px; cursor: pointer; font-family: 'Times New Roman', serif;">
				Reload Page
			</button>

		</div>
	`;

	// Show the error message
	errorElement.style.display = 'flex';
}
/**
 * Create game status display
 */
export function createGameStatusDisplay(gameState) {
	console.log('Creating game status display...');

	// Create or get status container
	let statusContainer = document.getElementById('game-status');
	if (!statusContainer) {
		statusContainer = document.createElement('div');
		statusContainer.id = 'game-status';

		// Style the container with Russian theme
		Object.assign(statusContainer.style, {
			position: 'fixed',
			top: '10px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '15px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			fontSize: '16px',
			zIndex: '100',
			minWidth: '220px',
			textAlign: 'center',
			border: '2px solid #ffcc00', // Gold border
			boxShadow: '0 0 10px rgba(255, 204, 0, 0.3)' // Gold glow
		});

		document.body.appendChild(statusContainer);
	}

	// Create or get controls container for debug options
	let controlsContainer = document.getElementById('debug-controls');
	if (!controlsContainer) {
		controlsContainer = document.createElement('div');
		controlsContainer.id = 'debug-controls';

		// Style the container with Russian theme
		Object.assign(controlsContainer.style, {
			position: 'fixed',
			top: '200px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '10px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			fontSize: '14px',
			zIndex: '100',
			minWidth: '150px',
			border: '1px solid #ffcc00' // Gold border
		});

		// Add simplified debug controls with Russian-style buttons
		controlsContainer.innerHTML = `
			<div style="text-align: center; margin-bottom: 10px; font-weight: bold;">Game Controls</div>
			<div style="margin-bottom: 10px;">
				<button id="debug-tetris-phase" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; margin-bottom: 5px; cursor: pointer;">Tetris Phase</button>
				<button id="debug-chess-phase" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; cursor: pointer;">Chess Phase</button>
			</div>
			<div>
				<button id="debug-reset-board" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; margin-bottom: 5px; cursor: pointer;">Reset Board</button>
				<button id="debug-reset-camera" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; cursor: pointer;">Reset Camera</button>
			</div>
		`;

		document.body.appendChild(controlsContainer);

		// Add event listeners for debug controls
		document.getElementById('debug-tetris-phase').addEventListener('click', handleTetrisPhaseClick);
		document.getElementById('debug-chess-phase').addEventListener('click', handleChessPhaseClick);

		document.getElementById('debug-reset-board').addEventListener('click', () => {
			resetGameState(gameState);
			sceneModule.createBoard(boardGroup, gameState);
			updateGameStatusDisplay(gameState);
		});

		document.getElementById('debug-reset-camera').addEventListener('click', () => {
			resetCameraView(true);
		});
	}

	// Initial update
	updateGameStatusDisplay(gameState);
}
/**
 * Update the game status display
 * Uses the global gameState object to show the current status
 */
export function updateGameStatusDisplay(gameState) {
	// Get status container
	const statusContainer = document.getElementById('game-status');
	
	// Skip update if container not found
	if (!statusContainer) {
		return;
	}
	
	// Default status HTML
	let statusHTML = '';
	
	// Check if we have game state
	if (!gameState) {
		statusHTML = '<div>Game ready to start</div>';
		statusContainer.innerHTML = statusHTML;
		return;
	}
	
	
	// Check various game status conditions
	if (gameState.gameOver) {
		statusHTML = `
			<div>Game Over!</div>
			<div>Player ${gameState.winner} wins!</div>
		`;
	} 
	else {
		// Get phase name - default to 'tetris' if no phase is defined
		const phase = !gameState.turnPhase || gameState.turnPhase === 'tetris' ? 'Tetris Phase' : 'Chess Phase';
		
		// Use a simplified status that focuses on current player's phase
		const playerColor = '#DD0000';  // Red for local player
		
		statusHTML = `
			<div>
				<span style="color: ${playerColor};">${phase}</span>
			</div>
		`;
		
		// Show appropriate action prompt based on the phase
		if (gameState.turnPhase === 'tetris') {
			statusHTML += `
				<div style="font-weight: bold; margin-top: 5px;">Place Your Tetromino</div>
			`;
		} else if (gameState.turnPhase === 'chess') {
			statusHTML += `
				<div style="font-weight: bold; margin-top: 5px;">Move Your Chess Piece</div>
			`;
		}
		
		// Add connected players info
		if (gameState.players) {
			const playerCount = Object.keys(gameState.players).length;
			if (playerCount > 0) {
				statusHTML += `<div style="font-size: 14px; margin-top: 5px;">${playerCount} players connected</div>`;
			}
		}
	}
	
	// Update the display
	statusContainer.innerHTML = statusHTML;
}
/**
 * Update the network status display
 * @param {string} status - The current network status: 'connecting', 'connected', or 'disconnected'
 */

export function updateNetworkStatus(status) {
	const networkStatusElement = document.getElementById('network-status');

	if (!networkStatusElement) return;

	// Set text and color based on status with Russian theme
	switch (status) {
		case 'connected':
			networkStatusElement.textContent = 'Network: Connected';
			networkStatusElement.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		case 'disconnected':
			networkStatusElement.textContent = 'Network: Disconnected';
			networkStatusElement.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		case 'connecting':
			networkStatusElement.textContent = 'Network: Connecting...';
			networkStatusElement.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		default:
			networkStatusElement.textContent = `Network: ${status}`;
			networkStatusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
	}
}
/**
 * Show a tutorial message with Russian-themed styling
 * This should appear automatically when the game loads
 */
export function showTutorialMessage(startGameFunction) {
	// Check if tutorial is already showing
	if (document.getElementById('tutorial-message')) {
		console.log('Tutorial already showing, not creating another one');
		return;
	}

	console.log('Creating tutorial message overlay');

	// Create tutorial message
	const tutorialElement = document.createElement('div');
	tutorialElement.id = 'tutorial-message';

	// Style the container with Russian theme
	Object.assign(tutorialElement.style, {
		position: 'fixed',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: 'white',
		padding: '20px',
		borderRadius: '10px',
		fontFamily: 'Times New Roman, serif', // Russian-style font
		fontSize: '16px',
		zIndex: '1000',
		maxWidth: '80%',
		textAlign: 'center',
		border: '2px solid #ffcc00', // Gold border
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.5)' // Gold glow
	});

	// Create the start button - store reference directly
	const startButton = document.createElement('button');
	startButton.textContent = 'START PLAYING';
	startButton.style.padding = '12px 30px';
	startButton.style.backgroundColor = '#333';
	startButton.style.color = '#ffcc00';
	startButton.style.border = '2px solid #ffcc00';
	startButton.style.borderRadius = '5px';
	startButton.style.cursor = 'pointer';
	startButton.style.fontSize = '18px';
	startButton.style.fontWeight = 'bold';
	startButton.style.fontFamily = 'Times New Roman, serif';
	startButton.style.animation = 'pulse 2s infinite';

	// Add pulse animation style
	const style = document.createElement('style');
	style.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); }
			50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(255, 204, 0, 0); }
			100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
		}
	`;
	document.head.appendChild(style);

	// Add event listener directly to the button before it's in the DOM
	startButton.addEventListener('click', function(event) {
		// Log the click immediately
		console.log('START PLAYING button clicked - starting game...', event);
		
		// Disable the button immediately to prevent multiple clicks
		startButton.disabled = true;
		startButton.textContent = 'Starting...';
		startButton.style.cursor = 'default';
		startButton.style.opacity = '0.7';
		
		// Remove the tutorial first
		if (tutorialElement.parentNode) {
			tutorialElement.parentNode.removeChild(tutorialElement);
		}
		
		// Find and use the best available start game function
		if (typeof startGameFunction === 'function') {
			console.log('Starting game using passed function');
			startGameFunction();
		} else if (typeof window.startShaktrisGame === 'function') {
			console.log('Starting game using global function');
			window.startShaktrisGame();
		} else {
			console.error('No game start function available!');
			alert('Error: Could not start the game. Please refresh and try again.');
		}
	});

	// Build the HTML content
	tutorialElement.innerHTML = `
		<h2 style="color: #ffcc00; margin-top: 0; font-family: 'Times New Roman', serif;">Welcome to Shaktris</h2>
		<p>A massively multiplayer game combining Chess and Tetris with Russian-inspired visuals</p>
		
		<div style="text-align: left; margin: 15px 0;">
			<h3 style="color: #ffcc00; font-family: 'Times New Roman', serif;">How to Play:</h3>
			<ul style="line-height: 1.5;">
				<li><strong>All Players Play Simultaneously</strong> - There are no turns between players!</li>
				<li><strong>Player Cycle:</strong> Each player follows their own cycle:
					<ol>
						<li>First, place a Tetromino (pieces now fall vertically from above)</li>
						<li>Then, move one of your chess pieces</li>
						<li>Repeat - each player plays at their own pace</li>
					</ol>
				</li>
				<li><strong>Tetris Phase:</strong> Tetris pieces automatically fall from above
					<ul>
						<li>Arrow keys: Move tetromino horizontally/vertically on the board</li>
						<li>Z/X: Rotate tetromino</li>
						<li>Space: Hard drop tetromino</li>
						<li>Pieces will explode if they collide with existing blocks!</li>
					</ul>
				</li>
				<li><strong>Chess Phase:</strong> After placing your tetromino
					<ul>
						<li>Click on your piece to select it</li>
						<li>Green circles show where you can move</li>
						<li>Click on a green circle to move there</li>
						<li>After moving, your chess phase ends and you start a new tetris phase</li>
					</ul>
				</li>
				<li><strong>Objective:</strong> Capture opponent kings!</li>
			</ul>
		</div>
		
		<p style="font-style: italic; margin-top: 10px;">This is a massively multiplayer game where all players play independently at the same time.</p>
		
		<div style="text-align: center; margin-top: 20px;">
			<div style="font-size: 36px; color: #ffcc00; margin-bottom: 10px;">☦</div>
			<div id="start-button-container"></div>
		</div>
	`;

	// Add the element to the document
	document.body.appendChild(tutorialElement);
	
	// Add the button to the container after the HTML is set
	const buttonContainer = tutorialElement.querySelector('#start-button-container');
	if (buttonContainer) {
		buttonContainer.appendChild(startButton);
	} else {
		// Fallback if container not found
		tutorialElement.appendChild(startButton);
	}
}
/**
 * Utility function to hide all loading elements
 */
export function hideAllLoadingElements() {
	console.log("Forcibly hiding all loading elements");

	// Hide loading screen
	const loadingElement = document.getElementById('loading');
	if (loadingElement) {
		loadingElement.style.display = 'none';
	}

	// Remove loading indicator
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator && loadingIndicator.parentNode) {
		loadingIndicator.parentNode.removeChild(loadingIndicator);
	}

	// Hide any other loading elements
	const elements = document.querySelectorAll('[id*="loading"]');
	elements.forEach(el => {
		el.style.display = 'none';
	});
}
/**
 * Update game ID display
 * @param {string} gameId - Game ID
 */
export function updateGameIdDisplay(gameId) {
	const gameIdDisplay = document.getElementById('game-id-display');
	if (gameIdDisplay) {
		gameIdDisplay.value = gameId;
	}
}

