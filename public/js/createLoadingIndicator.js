import { handleTetrisPhaseClick, handleChessPhaseClick, resetGameState, startPlayingGame } from './enhanced-gameCore.js';
import * as sceneModule from './scene';
import gameState from './utils/gameState.js';
import { loginWithEmail, handleAuthRedirect, isSignedIn } from './auth/auth0Client.js';

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
	loadingText.textContent = 'Preparing Tetches World...';
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
	// Allow callers to omit the parameter (many modules call `window.updateGameStatusDisplay()`)
	// while keeping the existing explicit-arg behaviour.
	const effectiveState = gameState || window.gameState;
	gameState = effectiveState;
	
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
 * Features: scrollable content, fixed buttons, game selection options
 */
export function showTutorialMessage(startGameFunction, options = {}) {
	// Check if tutorial is already showing
	if (document.getElementById('tutorial-message')) {
		console.log('Tutorial already showing, not creating another one');
		return;
	}

	console.log('Creating tutorial message overlay');

	// Check for previous game key in localStorage
	const previousGameKey = localStorage.getItem('tetches_game_key');

	// Create tutorial message container (full screen overlay)
	const tutorialElement = document.createElement('div');
	tutorialElement.id = 'tutorial-message';

	// Style the container as a full-screen modal with flexbox
	Object.assign(tutorialElement.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '100%',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		color: 'white',
		fontFamily: 'Times New Roman, serif',
		fontSize: '16px',
		zIndex: '1000',
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center'
	});

	// Create the inner modal box
	const modalBox = document.createElement('div');
	Object.assign(modalBox.style, {
		display: 'flex',
		flexDirection: 'column',
		maxWidth: 'min(90%, 600px)',
		maxHeight: '90vh',
		backgroundColor: 'rgba(10, 10, 30, 0.98)',
		borderRadius: '12px',
		border: '2px solid #ffcc00',
		boxShadow: '0 0 30px rgba(255, 204, 0, 0.4)',
		overflow: 'hidden'
	});

	// Create scrollable content area
	const scrollContent = document.createElement('div');
	Object.assign(scrollContent.style, {
		flex: '1',
		overflowY: 'auto',
		padding: '24px',
		textAlign: 'center'
	});

	// Create fixed button area at bottom
	const buttonArea = document.createElement('div');
	Object.assign(buttonArea.style, {
		padding: '16px 24px',
		borderTop: '1px solid rgba(255, 204, 0, 0.3)',
		backgroundColor: 'rgba(10, 10, 30, 1)',
		display: 'flex',
		flexDirection: 'column',
		gap: '12px'
	});

	// Add pulse animation style
	const style = document.createElement('style');
	style.id = 'tutorial-styles';
	style.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); }
			50% { transform: scale(1.02); box-shadow: 0 0 0 8px rgba(255, 204, 0, 0); }
			100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
		}
		.tutorial-btn {
			padding: 14px 28px;
			background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
			color: #ffcc00;
			border: 2px solid #ffcc00;
			border-radius: 8px;
			cursor: pointer;
			font-size: 16px;
			font-weight: bold;
			font-family: 'Times New Roman', serif;
			transition: all 0.2s ease;
			width: 100%;
		}
		.tutorial-btn:hover {
			background: linear-gradient(135deg, #2a2a4e 0%, #26315e 100%);
			transform: translateY(-1px);
		}
		.tutorial-btn.primary {
			font-size: 18px;
			animation: pulse 2s infinite;
			background: linear-gradient(135deg, #2a2a1e 0%, #3a3a2e 100%);
		}
		.tutorial-btn:disabled {
			opacity: 0.6;
			cursor: default;
			animation: none;
		}
		.game-key-input {
			padding: 12px 16px;
			background: rgba(255, 255, 255, 0.1);
			border: 1px solid rgba(255, 204, 0, 0.5);
			border-radius: 6px;
			color: #fff;
			font-size: 14px;
			font-family: monospace;
			width: 100%;
			box-sizing: border-box;
		}
		.game-key-input::placeholder {
			color: rgba(255, 255, 255, 0.5);
		}
		.tutorial-divider {
			display: flex;
			align-items: center;
			margin: 12px 0;
			color: rgba(255, 204, 0, 0.6);
			font-size: 12px;
		}
		.tutorial-divider::before, .tutorial-divider::after {
			content: '';
			flex: 1;
			border-bottom: 1px solid rgba(255, 204, 0, 0.3);
		}
		.tutorial-divider span {
			padding: 0 12px;
		}
	`;
	if (!document.getElementById('tutorial-styles')) {
		document.head.appendChild(style);
	}

	// Function to close tutorial and start game
	const startGame = (gameKey = null) => {
		// Store the game key if provided
		if (gameKey) {
			localStorage.setItem('tetches_game_key', gameKey);
		}
		
		// Remove the tutorial
		if (tutorialElement.parentNode) {
			tutorialElement.parentNode.removeChild(tutorialElement);
		}
		
		// Start the game with the key if provided
		if (typeof startGameFunction === 'function') {
			console.log('Entering world using passed function', gameKey ? `with key: ${gameKey}` : 'default shared world');
			startGameFunction(gameKey);
		} else if (typeof window.startTetchesGame === 'function') {
			console.log('Entering world using global function');
			window.startTetchesGame(gameKey);
		} else {
			console.error('No game start function available!');
			alert('Error: Could not start the game. Please refresh and try again.');
		}
	};

	// Build the scrollable content
	scrollContent.innerHTML = `
		<h2 style="color: #ffcc00; margin: 0 0 8px 0; font-family: 'Times New Roman', serif; font-size: 28px;">
			☦ Welcome to Tetches ☦
		</h2>
		<p style="margin: 0 0 20px 0; opacity: 0.8;">A massively multiplayer shared-world game combining Chess and Tetris</p>
		
		<div style="text-align: left; margin: 0 0 20px 0; padding: 16px; background: rgba(255, 204, 0, 0.05); border-radius: 8px;">
			<h3 style="color: #ffcc00; margin: 0 0 12px 0; font-size: 16px;">How to Play:</h3>
			<ul style="line-height: 1.6; margin: 0; padding-left: 20px;">
				<li><strong>All Players Play Simultaneously</strong> - No waiting for turns!</li>
				<li><strong>Your Cycle:</strong>
					<ol style="margin: 4px 0; padding-left: 18px;">
						<li>Place a Tetromino (falls from above)</li>
						<li>Move one chess piece</li>
						<li>Repeat!</li>
					</ol>
				</li>
				<li><strong>Tetris Controls:</strong>
					<span style="color: #ffcc00;">Arrow keys</span> move, 
					<span style="color: #ffcc00;">Z/X</span> rotate, 
					<span style="color: #ffcc00;">Space</span> drop
				</li>
				<li><strong>Chess:</strong> Click piece → click green circle to move</li>
				<li><strong>Goal:</strong> Capture opponent kings! 👑</li>
			</ul>
		</div>
		
		<div style="padding: 12px; background: rgba(255, 204, 0, 0.08); border-radius: 8px; border-left: 3px solid #ffcc00;">
			<p style="margin: 0; font-style: italic; font-size: 14px; opacity: 0.9;">
				Tip: Place tetrominos to expand your territory, then use your chess pieces to attack!
			</p>
		</div>
		<div style="margin-top: 12px; padding: 12px; background: rgba(0, 0, 0, 0.25); border-radius: 8px; text-align: left;">
			<div style="font-weight: bold; color: #ffcc00; margin-bottom: 6px;">Terminology</div>
			<div style="font-size: 13px; line-height: 1.5;">
				<div><strong>World:</strong> the shared global board everyone plays on.</div>
				<div><strong>Player Code:</strong> your personal identity/progress inside that world.</div>
			</div>
		</div>
	`;

	// Build the button area
	let buttonHTML = '';
	
	// If player has a previous game key, show rejoin option
	if (previousGameKey) {
		buttonHTML += `
			<button id="rejoin-game-btn" class="tutorial-btn primary">
				⟲ REJOIN WITH SAVED WORLD KEY
			</button>
			<div class="tutorial-divider"><span>OR</span></div>
		`;
	}
	
	buttonHTML += `
		<button id="new-game-btn" class="tutorial-btn ${!previousGameKey ? 'primary' : ''}">
			✦ ENTER SHARED WORLD
		</button>
		<div style="font-size: 12px; opacity: 0.8; text-align: center; margin-top: -2px;">
			Resumes your position if your Player Code/session is known.
		</div>
		<div class="tutorial-divider"><span>OR ENTER SPECIFIC WORLD KEY</span></div>
		<div style="display: flex; gap: 8px;">
			<input type="text" id="game-key-input" class="game-key-input" 
				placeholder="Enter world key..." 
				style="flex: 1;">
			<button id="join-key-btn" class="tutorial-btn" style="width: auto; padding: 12px 20px;">
				JOIN
			</button>
		</div>
		<div class="tutorial-divider"><span>OR SIGN IN TO SAVE PROGRESS</span></div>
		<div id="auth-section">
			<button id="auth-login-btn" class="tutorial-btn" style="width: 100%;">
				✉ SIGN IN / SIGN UP
			</button>
			<p style="margin: 6px 0 0 0; font-size: 11px; color: #888; text-align: center;">
				Saves your progress across devices. Sign-in is handled securely by Auth0 — we never see your password or store your email.
			</p>
			<p id="auth-status" style="margin: 8px 0 0 0; font-size: 12px; color: #888; display: none;"></p>
		</div>
	`;
	
	buttonArea.innerHTML = buttonHTML;

	// Assemble the modal
	modalBox.appendChild(scrollContent);
	modalBox.appendChild(buttonArea);
	tutorialElement.appendChild(modalBox);

	// Add the element to the document
	document.body.appendChild(tutorialElement);

	// Set up button event handlers
	const newGameBtn = tutorialElement.querySelector('#new-game-btn');
	const rejoinBtn = tutorialElement.querySelector('#rejoin-game-btn');
	const joinKeyBtn = tutorialElement.querySelector('#join-key-btn');
	const gameKeyInput = tutorialElement.querySelector('#game-key-input');

	if (newGameBtn) {
		newGameBtn.addEventListener('click', () => {
			newGameBtn.disabled = true;
			newGameBtn.textContent = 'Entering...';
			startGame(null); // Default shared world (session may restore position)
		});
	}

	if (rejoinBtn) {
		rejoinBtn.addEventListener('click', () => {
			rejoinBtn.disabled = true;
			rejoinBtn.textContent = 'Rejoining...';
			startGame(previousGameKey);
		});
	}

	if (joinKeyBtn && gameKeyInput) {
		const joinWithKey = () => {
			const key = gameKeyInput.value.trim();
			if (key) {
				joinKeyBtn.disabled = true;
				joinKeyBtn.textContent = '...';
				startGame(key);
			} else {
				gameKeyInput.style.borderColor = '#ff4444';
				gameKeyInput.focus();
				setTimeout(() => {
					gameKeyInput.style.borderColor = 'rgba(255, 204, 0, 0.5)';
				}, 1000);
			}
		};
		
		joinKeyBtn.addEventListener('click', joinWithKey);
		gameKeyInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') joinWithKey();
		});
	}

	// Email sign-in via Auth0. Auth0 hosts the email entry, the one-time
	// code/link delivery, and verification on its own pages, so the game
	// never sees an email address. After sign-in Auth0 redirects back here.
	const authLoginBtn = tutorialElement.querySelector('#auth-login-btn');
	const authStatus = tutorialElement.querySelector('#auth-status');

	const setAuthStatus = (text, color) => {
		if (!authStatus) return;
		authStatus.textContent = text || '';
		authStatus.style.color = color || '#888';
		authStatus.style.display = text ? 'block' : 'none';
	};

	if (authLoginBtn) {
		authLoginBtn.addEventListener('click', async () => {
			const originalLabel = authLoginBtn.textContent;
			authLoginBtn.disabled = true;
			try {
				// Returning player with a live session? Skip straight in.
				if (await isSignedIn()) {
					authLoginBtn.textContent = 'Entering…';
					startGame(gameKeyInput?.value.trim() || previousGameKey || null);
					return;
				}
				authLoginBtn.textContent = 'Redirecting…';
				setAuthStatus('Opening secure sign-in…', '#ffcc00');
				await loginWithEmail(gameKeyInput?.value.trim() || null);
				// loginWithRedirect navigates away; control won't return here.
			} catch (error) {
				console.error('[auth] sign-in failed to start:', error);
				setAuthStatus(error.message || 'Could not start sign-in. Please try again.', '#ff6666');
				authLoginBtn.disabled = false;
				authLoginBtn.textContent = originalLabel;
			}
		});
	}

	// Complete an Auth0 redirect (if this page load is the return leg of
	// one) and otherwise reflect any existing session in the button.
	(async () => {
		try {
			const appState = await handleAuthRedirect();
			if (appState) {
				const resumedGameKey = appState.gameKey || null;
				if (resumedGameKey) localStorage.setItem('tetches_game_key', resumedGameKey);
				setAuthStatus('✓ Signed in! Entering…', '#66ff66');
				setTimeout(() => startGame(resumedGameKey), 500);
				return;
			}
			if ((await isSignedIn()) && authLoginBtn) {
				authLoginBtn.textContent = '✓ SIGNED IN — ENTER';
				setAuthStatus('You are signed in. Click to enter.', '#66ff66');
			}
		} catch (error) {
			console.error('[auth] redirect handling failed:', error);
			setAuthStatus('Sign-in could not be completed. Please try again.', '#ff6666');
		}
	})();
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

