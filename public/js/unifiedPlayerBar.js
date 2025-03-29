/**
 * Unified Player Bar Component for Shaktris
 * 
 * This file implements a slide-out player bar that appears from the right side of the screen.
 * It provides player info and highlights pieces on hover.
 */

import * as NetworkManager from './utils/networkManager.js';

// Import these if they exist, otherwise provide fallbacks
let highlightPlayerPieces;
let removePlayerPiecesHighlight;

// Fallback functions in case import fails
const fallbackHighlightPlayerPieces = (playerId) => {
	console.log('Fallback: Highlight requested for player', playerId);
	// Use gameCore functions if available
	if (window.gameCore && window.gameCore.highlightPlayerPieces) {
		window.gameCore.highlightPlayerPieces(playerId);
	}
};

const fallbackRemovePlayerPiecesHighlight = () => {
	console.log('Fallback: Removing highlights');
	// Use gameCore functions if available
	if (window.gameCore && window.gameCore.removePlayerPiecesHighlight) {
		window.gameCore.removePlayerPiecesHighlight();
	}
};

// Set initial fallbacks
highlightPlayerPieces = fallbackHighlightPlayerPieces;
removePlayerPiecesHighlight = fallbackRemovePlayerPiecesHighlight;

// Try to load the real functions
import('./pieceHighlightManager.js')
	.then(module => {
		console.log('Successfully imported pieceHighlightManager.js');
		// Replace fallbacks with real functions
		highlightPlayerPieces = module.highlightPlayerPieces;
		removePlayerPiecesHighlight = module.removePlayerPiecesHighlight;
	})
	.catch(error => {
		console.warn('Could not import pieceHighlightManager.js, using fallbacks:', error);
	});

// State tracking variables
let isBarVisible = false;
let lastPlayerDataHash = '';
let forcedPlayerUpdateCounter = 0;

// Add a utility function to get the player ID
/**
 * Get the local player ID using various methods
 */
function getLocalPlayerId(gameState) {
	// First try to get it from the game state
	if (gameState && gameState.localPlayerId) {
		return gameState.localPlayerId;
	}
	
	// Then try to get it from NetworkManager
	if (NetworkManager && typeof NetworkManager.getPlayerId === 'function') {
		const networkPlayerId = NetworkManager.getPlayerId();
		if (networkPlayerId) {
			return networkPlayerId;
		}
	}
	
	// Last resort - look for a player with the same name as in localStorage
	const storedPlayerName = localStorage.getItem('playerName');
	if (storedPlayerName && gameState && gameState.players) {
		for (const playerId in gameState.players) {
			if (gameState.players[playerId].name === storedPlayerName) {
				return playerId;
			}
		}
	}
	
	// Return null if we couldn't find a local player ID
	return null;
}

/**
 * Create the unified player bar that slides out from the right
 */
export function createUnifiedPlayerBar(gameState) {
	// First, check if it already exists
	let playerBar = document.getElementById('unified-player-bar');
	if (playerBar) {
		// Bar already exists, just update the content
		updateUnifiedPlayerBar(gameState);
		return playerBar;
	}
	
	console.log("Creating new unified player bar...");
	
	// Create the main container
	playerBar = document.createElement('div');
	playerBar.id = 'unified-player-bar';
	
	// Add core styles
	Object.assign(playerBar.style, {
		position: 'fixed',
		top: '0',
		left: '-250px', // Start off-screen
		width: '250px',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		color: '#fff',
		zIndex: '10000',
		boxShadow: '0 0 15px rgba(255, 204, 0, 0.5)',
		fontFamily: 'Playfair Display, Times New Roman, serif',
		borderRight: '2px solid #ffcc00',
		transition: 'left 0.3s ease-in-out', // Change transform to left for cleaner animation
		backdropFilter: 'blur(5px)',
		overflowY: 'auto',
		display: 'flex',
		flexDirection: 'column'
	});
	
	// Create the tab that will always be visible
	const pullTab = document.createElement('div');
	pullTab.id = 'player-bar-tab';
	Object.assign(pullTab.style, {
		position: 'fixed', // Fixed position so it stays visible
		top: '50%',
		left: '0', // Tab at edge of screen
		width: '30px',
		height: '100px',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: '#ffcc00',
		borderRadius: '0 5px 5px 0',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
		cursor: 'pointer',
		boxShadow: '3px 0 10px rgba(0, 0, 0, 0.5)',
		borderTop: '2px solid #ffcc00',
		borderRight: '2px solid #ffcc00',
		borderBottom: '2px solid #ffcc00',
		transform: 'translateY(-50%)',
		writingMode: 'vertical-rl',
		textOrientation: 'mixed',
		userSelect: 'none',
		zIndex: '10001', // Higher than the panel itself
		paddingTop: '10px',
		paddingBottom: '10px',
		fontSize: '14px',
		fontWeight: 'bold',
		textShadow: '0 0 5px rgba(255, 204, 0, 0.5)'
	});
	pullTab.innerHTML = '👥 PLAYERS';
	document.body.appendChild(pullTab);
	
	// Create the header
	const header = document.createElement('div');
	header.className = 'player-bar-header';
	Object.assign(header.style, {
		borderBottom: '2px solid #ffcc00',
		padding: '15px',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center'
	});
	
	// Header title
	const headerTitle = document.createElement('h3');
	headerTitle.textContent = 'PLAYERS';
	Object.assign(headerTitle.style, {
		margin: '0',
		color: '#ffcc00',
		fontFamily: 'Playfair Display, Times New Roman, serif',
		textShadow: '0 0 5px rgba(255, 204, 0, 0.5)'
	});
	header.appendChild(headerTitle);
	
	// Close button
	const closeButton = document.createElement('button');
	closeButton.innerHTML = '&times;';
	Object.assign(closeButton.style, {
		background: 'none',
		border: 'none',
		color: '#ffcc00',
		fontSize: '24px',
		cursor: 'pointer',
		padding: '0',
		lineHeight: '24px',
		width: '24px',
		height: '24px',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center'
	});
	header.appendChild(closeButton);
	playerBar.appendChild(header);
	
	// Create player container
	const playerContainer = document.createElement('div');
	playerContainer.id = 'unified-player-container';
	Object.assign(playerContainer.style, {
		padding: '15px',
		flex: '1 1 auto',
		overflowY: 'auto'
	});
	playerBar.appendChild(playerContainer);
	
	// Create footer with player info if available
	const localPlayerId = getLocalPlayerId(gameState);
	if (localPlayerId || localStorage.getItem('playerName')) {
		const footer = document.createElement('div');
		Object.assign(footer.style, {
			borderTop: '1px solid #ffcc00',
			padding: '15px',
			marginTop: 'auto'
		});
		
		const playerName = localPlayerId && gameState.players && gameState.players[localPlayerId] ? 
			gameState.players[localPlayerId].name : 
			localStorage.getItem('playerName') || 'Guest';
		
		footer.innerHTML = `
			<div style="font-size: 14px; color: #ffcc00;">You are playing as:</div>
			<div style="margin-top: 5px; font-weight: bold;">${playerName}</div>
			<button id="change-player-name" style="margin-top: 10px; padding: 5px; background: #333; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%;">
				Change Name
			</button>
		`;
		playerBar.appendChild(footer);
		
		// Add event listener for name change
		document.getElementById('change-player-name')?.addEventListener('click', () => {
			localStorage.removeItem('playerName');
			window.location.reload();
		});
	}
	
	// Add to document
	document.body.appendChild(playerBar);
	
	// Event listeners
	pullTab.addEventListener('click', togglePlayerBar);
	closeButton.addEventListener('click', hidePlayerBar);
	
	// Add touch support for mobile devices
	pullTab.addEventListener('touchstart', (e) => {
		e.preventDefault(); // Prevent scrolling
		togglePlayerBar();
	});
	
	// Populate player information
	updateUnifiedPlayerBar(gameState);
	
	// Show the bar initially
	showPlayerBar();
	
	// Automatically hide after 5 seconds
	setTimeout(() => {
		if (isBarVisible) {
			hidePlayerBar();
		}
	}, 5000);
	
	console.log("Unified player bar created and attached to DOM");
	return playerBar;
}

/**
 * Toggle the player bar visibility
 */
export function togglePlayerBar() {
	const playerBar = document.getElementById('unified-player-bar');
	const tab = document.getElementById('player-bar-tab');
	if (!playerBar) return;
	
	isBarVisible = !isBarVisible;
	playerBar.style.left = isBarVisible ? '0' : '-250px';
	
	// Move tab when panel is visible
	if (tab) {
		tab.style.left = isBarVisible ? '250px' : '0';
	}
}

/**
 * Show the player bar
 */
export function showPlayerBar() {
	const playerBar = document.getElementById('unified-player-bar');
	const tab = document.getElementById('player-bar-tab');
	if (!playerBar) return;
	
	isBarVisible = true;
	playerBar.style.left = '0';
	
	// Move tab
	if (tab) {
		tab.style.left = '250px';
	}
}

/**
 * Hide the player bar
 */
export function hidePlayerBar() {
	const playerBar = document.getElementById('unified-player-bar');
	const tab = document.getElementById('player-bar-tab');
	if (!playerBar) return;
	
	isBarVisible = false;
	playerBar.style.left = '-250px';
	
	// Move tab back to edge
	if (tab) {
		tab.style.left = '0';
	}
}

/**
 * Add a player to the player bar
 */
function addPlayerToBar(playerBar, playerId, playerInfo, gameState) {
	// Get the container
	const playerContainer = document.getElementById('unified-player-container');
	if (!playerContainer) return;
	
	// Check if player already exists
	let playerElement = document.getElementById(`player-${playerId}`);
	
	// Create if it doesn't exist
	if (!playerElement) {
		playerElement = document.createElement('div');
		playerElement.id = `player-${playerId}`;
		playerElement.className = 'player-item';
		
		// Add styling
		Object.assign(playerElement.style, {
			margin: '8px 0',
			padding: '12px',
			borderRadius: '5px',
			display: 'flex',
			alignItems: 'center',
			transition: 'all 0.2s ease',
			cursor: 'pointer',
			border: '1px solid rgba(255,255,255,0.2)',
			backgroundColor: 'rgba(0,0,0,0.4)',
			boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
		});
		
		// Add to container
		playerContainer.appendChild(playerElement);
	}
	
	// Clear existing content
	playerElement.innerHTML = '';
	
	// Generate the player color
	const playerColor = playerInfo.color || generatePlayerColor(playerId);
	
	// Create color indicator
	const colorIndicator = document.createElement('div');
	Object.assign(colorIndicator.style, {
		width: '18px',
		height: '18px',
		borderRadius: '50%',
		marginRight: '10px',
		backgroundColor: playerColor,
		border: '2px solid #fff',
		boxShadow: '0 0 5px rgba(255,255,255,0.5)'
	});
	playerElement.appendChild(colorIndicator);
	
	// Create name display
	const nameDisplay = document.createElement('div');
	nameDisplay.textContent = playerInfo.name || `Player ${playerId.substring(0, 6)}`;
	Object.assign(nameDisplay.style, {
		flexGrow: '1',
		fontSize: '14px',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	});
	
	// Highlight if local player
	const localPlayerId = getLocalPlayerId(gameState);
	const isLocalPlayer = playerId === localPlayerId;
	if (isLocalPlayer) {
		nameDisplay.style.fontWeight = 'bold';
		nameDisplay.style.color = '#ffcc00';
		nameDisplay.textContent += ' (You)';
		playerElement.style.boxShadow = '0 0 8px rgba(255,204,0,0.5)';
	}
	
	// Highlight if current turn
	const isCurrentTurn = gameState.currentPlayer === playerId;
	if (isCurrentTurn) {
		playerElement.style.backgroundColor = 'rgba(255, 204, 0, 0.25)';
		playerElement.style.border = '1px solid #ffcc00';
		
		// Add animated turn indicator
		const turnIndicator = document.createElement('div');
		turnIndicator.textContent = '🎮';
		Object.assign(turnIndicator.style, {
			marginLeft: '5px',
			animation: 'pulse 1.5s infinite',
			fontSize: '16px'
		});
		
		// Create animation if it doesn't exist
		if (!document.getElementById('player-pulse-animation')) {
			const style = document.createElement('style');
			style.id = 'player-pulse-animation';
			style.textContent = `
				@keyframes pulse {
					0% { transform: scale(1); }
					50% { transform: scale(1.2); }
					100% { transform: scale(1); }
				}
			`;
			document.head.appendChild(style);
		}
		
		nameDisplay.appendChild(turnIndicator);
	}
	
	playerElement.appendChild(nameDisplay);
	
	// Add score if available
	if (playerInfo.score !== undefined) {
		const scoreDisplay = document.createElement('div');
		scoreDisplay.textContent = `${playerInfo.score}`;
		Object.assign(scoreDisplay.style, {
			marginLeft: 'auto',
			fontWeight: 'bold',
			color: '#ffcc00',
			fontSize: '16px',
			padding: '2px 6px',
			borderRadius: '3px',
			backgroundColor: 'rgba(0,0,0,0.3)'
		});
		playerElement.appendChild(scoreDisplay);
	}
	
	// Add hover events for piece highlighting
	playerElement.addEventListener('mouseenter', () => {
		// Highlight this player in the game state
		if (gameState) {
			gameState.hoveredPlayer = playerId;
		}
		
		// Change background color
		playerElement.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
		playerElement.style.transform = 'translateX(-5px)';
		
		// Highlight pieces
		if (highlightPlayerPieces) {
			highlightPlayerPieces(playerId);
		}
	});
	
	playerElement.addEventListener('mouseleave', () => {
		// Reset hovered player
		if (gameState) {
			gameState.hoveredPlayer = null;
		}
		
		// Reset background
		if (isCurrentTurn) {
			playerElement.style.backgroundColor = 'rgba(255, 204, 0, 0.25)';
		} else {
			playerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
		}
		
		playerElement.style.transform = 'translateX(0)';
		
		// Remove highlights
		if (removePlayerPiecesHighlight) {
			removePlayerPiecesHighlight();
		}
		
		// Restore current player highlight if needed
		if (gameState && gameState.currentPlayer && window.gameCore && window.gameCore.highlightCurrentPlayerPieces) {
			window.gameCore.highlightCurrentPlayerPieces(gameState.currentPlayer);
		}
	});
	
	// Add touch events for mobile devices
	playerElement.addEventListener('touchstart', (e) => {
		// Prevent default to avoid scrolling
		e.preventDefault();
		
		// If already highlighted, unhighlight
		if (gameState && gameState.hoveredPlayer === playerId) {
			// Reset hovered player
			gameState.hoveredPlayer = null;
			
			// Reset background
			if (isCurrentTurn) {
				playerElement.style.backgroundColor = 'rgba(255, 204, 0, 0.25)';
			} else {
				playerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
			}
			
			playerElement.style.transform = 'translateX(0)';
			
			// Remove highlights
			if (removePlayerPiecesHighlight) {
				removePlayerPiecesHighlight();
			}
			
			// Restore current player highlight if needed
			if (gameState && gameState.currentPlayer && window.gameCore && window.gameCore.highlightCurrentPlayerPieces) {
				window.gameCore.highlightCurrentPlayerPieces(gameState.currentPlayer);
			}
		} else {
			// First remove any existing highlights
			if (gameState && gameState.hoveredPlayer) {
				// Remove highlights from previous player
				if (removePlayerPiecesHighlight) {
					removePlayerPiecesHighlight();
				}
			}
			
			// Highlight this player
			gameState.hoveredPlayer = playerId;
			
			// Change background color and transform
			playerElement.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
			playerElement.style.transform = 'translateX(-5px)';
			
			// Highlight pieces
			if (highlightPlayerPieces) {
				highlightPlayerPieces(playerId);
			}
		}
	});
}

/**
 * Update the player bar with current game state
 */
export function updateUnifiedPlayerBar(gameState) {
	if (!gameState) return;
	
	// Debug the game state
	console.log('Updating player bar with game state:', gameState);
	
	// Ensure the bar exists
	let playerBar = document.getElementById('unified-player-bar');
	if (!playerBar) {
		playerBar = createUnifiedPlayerBar(gameState);
		return;
	}
	
	// Check if player data has changed
	let currentHash = '';
	if (gameState.players) {
		currentHash = Object.keys(gameState.players).map(playerId => {
			const player = gameState.players[playerId];
			if (!player) return '';
			return `${playerId}-${player.name || ''}-${player.score || 0}-${player.isActive ? 1 : 0}-${player.color || ''}`;
		}).sort().join('|');
		
		// Add current player to hash
		currentHash += `|currentPlayer:${gameState.currentPlayer || ''}`;
	}
	
	// Force update every 20 intervals
	const forcedUpdate = (++forcedPlayerUpdateCounter >= 20);
	
	// Skip if nothing changed
	if (currentHash === lastPlayerDataHash && !forcedUpdate) {
		return;
	}
	
	// Reset counter on forced update
	if (forcedUpdate) {
		forcedPlayerUpdateCounter = 0;
		console.log('Forced player bar update');
	}
	
	// Update hash
	lastPlayerDataHash = currentHash;
	
	// Get the player container
	const playerContainer = document.getElementById('unified-player-container');
	if (!playerContainer) return;
	
	// Clear existing content
	playerContainer.innerHTML = '';
	
	// Make sure we have a localPlayerId
	const localPlayerId = getLocalPlayerId(gameState);
	if (!gameState.localPlayerId && localPlayerId) {
		gameState.localPlayerId = localPlayerId;
	}
	
	// Add our local player manually if not in the list
	const storedPlayerName = localStorage.getItem('playerName');
	if (storedPlayerName && (!gameState.players || !Object.values(gameState.players).some(p => p.name === storedPlayerName))) {
		// Create a minimal game state if none exists
		if (!gameState.players) {
			gameState.players = {};
		}
		
		// If we have a local player ID but it's not in the list, add it
		if (localPlayerId && !gameState.players[localPlayerId]) {
			gameState.players[localPlayerId] = {
				name: storedPlayerName,
				id: localPlayerId,
				score: 0
			};
		}
		// If we don't have a local player ID, make one up
		else if (!localPlayerId) {
			const newId = 'local-' + Math.random().toString(36).substring(2, 9);
			gameState.players[newId] = {
				name: storedPlayerName,
				id: newId,
				score: 0
			};
			gameState.localPlayerId = newId;
		}
	}
	
	// Add each player
	if (gameState.players && Object.keys(gameState.players).length > 0) {
		console.log('Players in game state:', Object.keys(gameState.players).length);
		Object.keys(gameState.players).forEach(playerId => {
			const player = gameState.players[playerId];
			if (!player) return;
			
			addPlayerToBar(
				playerBar,
				playerId,
				{
					name: player.name || `Player ${playerId.substring(0, 6)}`,
					color: player.color,
					score: player.score || 0
				},
				gameState
			);
		});
	} else {
		// Show waiting message
		const waitingMessage = document.createElement('div');
		waitingMessage.textContent = 'Waiting for players...';
		Object.assign(waitingMessage.style, {
			textAlign: 'center',
			color: '#ffcc00',
			padding: '20px',
			fontStyle: 'italic'
		});
		playerContainer.appendChild(waitingMessage);
	}
}

/**
 * Generate a deterministic color for a player ID
 */
function generatePlayerColor(playerId) {
	// Check if player is local
	if (NetworkManager && NetworkManager.getPlayerId && playerId === NetworkManager.getPlayerId()) {
		return '#AA0000'; // Red for local player
	}
	
	// Generate deterministic color based on ID
	let hash = 0;
	const id = playerId || 'unknown';
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}
	
	// Generate blue/green-ish colors (keep red low)
	const r = Math.abs(hash % 80); // Keep red low
	const g = 100 + Math.abs((hash >> 4) % 155);
	const b = 150 + Math.abs((hash >> 8) % 105);
	
	return `rgb(${r}, ${g}, ${b})`;
} 