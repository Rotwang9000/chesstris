import { highlightPlayerPieces, removePlayerPiecesHighlight } from './pieceHighlightManager';

/**
 * Create a player bar to display player information
 */
export function createPlayerBar(gameState) {
	// Check if player bar already exists
	let playerBar = document.getElementById('player-bar');
	if (playerBar) {
		// Player bar already exists, just update content
		updatePlayerBar(gameState);
		return playerBar;
	}
	
	console.log("Creating new player bar...");
	
	// Create player bar container
	playerBar = document.createElement('div');
	playerBar.id = 'player-bar';
	playerBar.className = 'player-bar';
	
	// Add styles directly to ensure visibility
	Object.assign(playerBar.style, {
		position: 'fixed',
		top: '20px',
		right: '20px',
		width: '250px',
		backgroundColor: 'rgba(0,0,0,0.85)',
		color: '#fff',
		padding: '15px',
		borderRadius: '8px',
		zIndex: '10000', // Very high to ensure visibility
		boxShadow: '0 0 15px rgba(255, 204, 0, 0.5)',
		fontFamily: 'Arial, sans-serif',
		border: '2px solid #ffcc00',
		backdropFilter: 'blur(5px)',
		transition: 'all 0.3s ease',
		opacity: '1',
		pointerEvents: 'auto'
	});

	// Setup header with more prominent styling
	const header = document.createElement('div');
	header.className = 'player-bar-header';
	Object.assign(header.style, {
		borderBottom: '2px solid #ffcc00',
		paddingBottom: '8px',
		marginBottom: '12px',
		textAlign: 'center'
	});
	header.innerHTML = '<h3 style="margin: 0; color: #ffcc00; font-size: 18px; text-shadow: 0 0 5px rgba(255,204,0,0.5);">Players</h3>';
	playerBar.appendChild(header);

	// Create player container
	const playerContainer = document.createElement('div');
	playerContainer.id = 'player-container';
	playerContainer.className = 'player-container';
	playerBar.appendChild(playerContainer);

	// Add to document
	document.body.appendChild(playerBar);
	
	// Add a close button to allow hiding
	const closeButton = document.createElement('button');
	closeButton.textContent = '×';
	Object.assign(closeButton.style, {
		position: 'absolute',
		top: '5px',
		right: '8px',
		background: 'none',
		border: 'none',
		color: '#ffcc00',
		fontSize: '20px',
		cursor: 'pointer',
		padding: '0',
		lineHeight: '20px',
		width: '20px',
		height: '20px'
	});
	closeButton.addEventListener('click', () => {
		playerBar.style.opacity = '0';
		setTimeout(() => {
			playerBar.style.display = 'none';
		}, 300);
		
		// Create a button to show it again
		const showButton = document.createElement('button');
		showButton.textContent = 'Show Players';
		Object.assign(showButton.style, {
			position: 'fixed',
			top: '20px',
			right: '20px',
			backgroundColor: 'rgba(0,0,0,0.7)',
			color: '#ffcc00',
			border: '1px solid #ffcc00',
			borderRadius: '4px',
			padding: '5px 10px',
			cursor: 'pointer',
			zIndex: '9999'
		});
		showButton.addEventListener('click', () => {
			playerBar.style.display = 'block';
			setTimeout(() => {
				playerBar.style.opacity = '1';
			}, 10);
			document.body.removeChild(showButton);
		});
		document.body.appendChild(showButton);
	});
	playerBar.appendChild(closeButton);

	// Populate player information
	if (gameState.players && Object.keys(gameState.players).length > 0) {
		console.log("Adding players to bar:", Object.keys(gameState.players));
		Object.keys(gameState.players).forEach(playerId => {
			const player = gameState.players[playerId];
			// Add player info to the bar
			addPlayerToBar(
				playerBar,
				playerId,
				player.name || `Player ${playerId}`,
				{
					color: player.color || '#4399ea',
					isCurrentTurn: playerId === gameState.currentPlayer,
					score: player.score || 0
				},
				playerId === gameState.localPlayerId,
				gameState
			);
		});
	} else {
		// If we don't have players yet, show a message
		console.log("No players found, showing waiting message");
		const waitingMessage = document.createElement('div');
		waitingMessage.className = 'waiting-message';
		waitingMessage.textContent = 'Waiting for players...';
		waitingMessage.style.textAlign = 'center';
		waitingMessage.style.color = '#ffcc00';
		waitingMessage.style.padding = '10px';
		waitingMessage.style.fontStyle = 'italic';
		playerContainer.appendChild(waitingMessage);
	}

	console.log("Player bar created and attached to DOM");
	return playerBar;
}
/**
 * Add a player to the player bar
 * @param {HTMLElement} playerBar - The player bar element
 * @param {string} playerId - Player ID
 * @param {string} playerName - Player name
 * @param {Object} colorInfo - Player color and turn information
 * @param {boolean} isLocalPlayer - Whether this is the local player
 */
function addPlayerToBar(playerBar, playerId, playerName, colorInfo, isLocalPlayer, gameState) {
	// Get or create the player container
	let playerContainer = document.getElementById('player-container');
	if (!playerContainer) {
		playerContainer = document.createElement('div');
		playerContainer.id = 'player-container';
		playerContainer.className = 'player-container';
		playerBar.appendChild(playerContainer);
	}

	// Check if player already exists
	let playerElement = document.getElementById(`player-${playerId}`);

	// If player element doesn't exist, create it
	if (!playerElement) {
		playerElement = document.createElement('div');
		playerElement.id = `player-${playerId}`;
		playerElement.className = 'player-item';
		
		// Add styling for player item
		Object.assign(playerElement.style, {
			margin: '8px 0',
			padding: '10px',
			borderRadius: '5px',
			display: 'flex',
			alignItems: 'center',
			transition: 'all 0.2s ease',
			cursor: 'pointer',
			border: '1px solid rgba(255,255,255,0.2)',
			backgroundColor: 'rgba(0,0,0,0.4)',
			boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
		});

		// Add player element to container
		playerContainer.appendChild(playerElement);
	}

	// Update player element content
	playerElement.innerHTML = '';

	// Create color indicator
	const colorIndicator = document.createElement('div');
	colorIndicator.className = 'player-color';
	Object.assign(colorIndicator.style, {
		width: '18px',
		height: '18px',
		borderRadius: '50%',
		marginRight: '10px',
		backgroundColor: colorInfo.color || '#4399ea',
		border: '2px solid #fff',
		boxShadow: '0 0 5px rgba(255,255,255,0.5)'
	});
	playerElement.appendChild(colorIndicator);

	// Create name display
	const nameDisplay = document.createElement('div');
	nameDisplay.className = 'player-name';
	nameDisplay.textContent = playerName;
	Object.assign(nameDisplay.style, {
		flexGrow: '1',
		fontSize: '14px',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	});

	// Highlight if this is the local player
	if (isLocalPlayer) {
		nameDisplay.style.fontWeight = 'bold';
		nameDisplay.style.color = '#ffcc00';
		nameDisplay.textContent += ' (You)';
		// Add a glow effect for local player
		playerElement.style.boxShadow = '0 0 8px rgba(255,204,0,0.5)';
	}

	// Highlight if this is the current player's turn
	if (colorInfo.isCurrentTurn) {
		playerElement.style.backgroundColor = 'rgba(255, 204, 0, 0.25)';
		playerElement.style.border = '1px solid #ffcc00';
		
		// Add animated turn indicator
		const turnIndicator = document.createElement('div');
		turnIndicator.className = 'turn-indicator';
		turnIndicator.textContent = '🎮';
		Object.assign(turnIndicator.style, {
			marginLeft: '5px',
			animation: 'pulse 1.5s infinite',
			fontSize: '16px'
		});
		
		// Add animation keyframes
		const style = document.createElement('style');
		style.textContent = `
			@keyframes pulse {
				0% { transform: scale(1); }
				50% { transform: scale(1.2); }
				100% { transform: scale(1); }
			}
		`;
		document.head.appendChild(style);
		
		nameDisplay.appendChild(turnIndicator);
	} else {
		playerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
		playerElement.style.border = '1px solid rgba(255,255,255,0.2)';
	}

	playerElement.appendChild(nameDisplay);

	// Create score display if score exists
	if (colorInfo.score !== undefined) {
		const scoreDisplay = document.createElement('div');
		scoreDisplay.className = 'player-score';
		scoreDisplay.textContent = `${colorInfo.score}`;
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

	// Add hover effect that highlights this player's pieces
	playerElement.addEventListener('mouseenter', () => {
		// Set this as the hovered player in game state
		gameState.hoveredPlayer = playerId;
		
		// Change background color on hover
		playerElement.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
		playerElement.style.transform = 'translateX(-5px)';

		// Highlight all of this player's pieces
		highlightPlayerPieces(playerId);
	});

	playerElement.addEventListener('mouseleave', () => {
		// Reset hovered player in game state
		gameState.hoveredPlayer = null;
		
		// Reset background color
		if (colorInfo.isCurrentTurn) {
			playerElement.style.backgroundColor = 'rgba(255, 204, 0, 0.25)';
		} else {
			playerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
		}
		
		playerElement.style.transform = 'translateX(0)';
		
		// Remove highlights
		removePlayerPiecesHighlight();
	});
}

// Add change detection
let lastPlayerDataHash = '';
let lastPlayerUpdateReason = '';
let forcedPlayerUpdateCounter = 0;

/**
 * Update the player bar with current player information
 * @param {Object} gameState - Current game state
 */
export function updatePlayerBar(gameState) {
	// Check if player bar exists, if not create it
	let playerBar = document.getElementById('player-bar');
	if (!playerBar) {
		playerBar = createPlayerBar(gameState);
		return;
	}
	
	// Check if player data has actually changed
	// Generate a simple hash of current player data
	let currentHash = '';
	if (gameState.players) {
		currentHash = Object.keys(gameState.players).map(playerId => {
			const player = gameState.players[playerId];
			if (!player) return '';
			// Include essential properties that would require a visual update
			return `${playerId}-${player.name || ''}-${player.score || 0}-${player.isActive ? 1 : 0}-${player.isCurrentPlayer ? 1 : 0}`;
		}).sort().join('|');
		
		// Add current player and phase to the hash
		currentHash += `|currentPlayer:${gameState.currentPlayer}|phase:${gameState.turnPhase}`;
	}
	
	// Force update every 20 intervals (about 5 seconds) even without changes
	const forcedUpdate = (++forcedPlayerUpdateCounter >= 20);
	
	// Skip update if nothing changed and this isn't a forced update
	if (currentHash === lastPlayerDataHash && !forcedUpdate) {
		return;
	}
	
	// Track update reason
	if (forcedUpdate) {
		forcedPlayerUpdateCounter = 0;
		lastPlayerUpdateReason = 'forced periodic update';
	} else if (currentHash !== lastPlayerDataHash) {
		lastPlayerUpdateReason = 'player data changed';
		// Update hash
		lastPlayerDataHash = currentHash;
	}
	
	// Log only when debug mode is enabled or for first run
	if (gameState.debugMode) {
		console.log(`Updating player bar (reason: ${lastPlayerUpdateReason})`);
	}
	
	// Continue with player bar update since there are changes
	// Get the player container
	const playerContainer = document.getElementById('player-container');
	if (!playerContainer) return;

	// Clear existing content
	playerContainer.innerHTML = '';

	// Add each player
	if (gameState.players && Object.keys(gameState.players).length > 0) {
		Object.keys(gameState.players).forEach(playerId => {
			const player = gameState.players[playerId];
			// Add player to bar
			addPlayerToBar(
				playerBar,
				playerId,
				player.name || `Player ${playerId}`,
				{
					color: player.color || '#4399ea',
					isCurrentTurn: playerId === gameState.currentPlayer,
					score: player.score || 0
				},
				playerId === gameState.localPlayerId,
				gameState
			);
		});
	} else {
		// If no players, show waiting message
		const waitingMessage = document.createElement('div');
		waitingMessage.className = 'waiting-message';
		waitingMessage.textContent = 'Waiting for players...';
		waitingMessage.style.textAlign = 'center';
		waitingMessage.style.color = '#ffcc00';
		waitingMessage.style.padding = '10px';
		waitingMessage.style.fontStyle = 'italic';
		playerContainer.appendChild(waitingMessage);
	}
	
	console.log("Player bar updated");
}
