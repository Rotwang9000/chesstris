/**
 * Unified Player Bar Component for Tetches
 * 
 * This file implements a slide-out player bar that appears from the right side of the screen.
 * It provides player info and highlights pieces on hover.
 */

import * as NetworkManager from './utils/networkManager.js';
import { highlightPlayerPieces, removePlayerPiecesHighlight } from './pieceHighlightManager.js';
import { showToastMessage } from './showToastMessage.js';
import { showPromotionRedeemDialog } from './uiOverlays.js';
import { promptInlineRename } from './renameDialog.js';

// State tracking variables
let isBarVisible = false;
let lastPlayerDataHash = '';
let forcedPlayerUpdateCounter = 0;

/**
 * Coerce the various colour formats the server emits — bare integers
 * (0xDD0000), prefixed strings ("0xff0000" / "#ff0000") and named
 * CSS colours ("red") — into a CSS-safe hex string. Returns an
 * empty string for nullish/invalid inputs so callers can fall back
 * to their default.
 */
function normaliseColour(value) {
	if (value === null || value === undefined || value === '') return '';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return '';
		return '#' + (value & 0xFFFFFF).toString(16).padStart(6, '0');
	}
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('#')) return trimmed;
	if (/^0x[0-9a-f]{6}$/i.test(trimmed)) return '#' + trimmed.slice(2);
	if (/^[0-9a-f]{6}$/i.test(trimmed)) return '#' + trimmed;
	return trimmed; // Trust named CSS colours / rgb() / hsl()
}

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

function isPlaceholderPlayerName(name) {
	if (!name || typeof name !== 'string') return true;
	const trimmed = name.trim();
	if (!trimmed || trimmed === 'Guest') return true;
	if (/^Player_[a-f0-9]{6}$/i.test(trimmed)) return true;
	if (/^DevPlayer_/i.test(trimmed)) return true;
	return false;
}

/**
 * Footer + nameplate: prefer a name the user chose in localStorage when
 * the server still has a placeholder (`Guest`, `Player_xxx`, etc.).
 */
function resolveLocalDisplayName(gameState, localPlayerId) {
	let stored = '';
	try {
		stored = (localStorage.getItem('playerName') || '').trim();
	} catch (_e) { /* private browsing */ }

	const serverName = (localPlayerId && gameState?.players?.[localPlayerId]?.name)
		? String(gameState.players[localPlayerId].name).trim()
		: '';

	if (stored && (!serverName || isPlaceholderPlayerName(serverName))) {
		return stored;
	}
	if (serverName && !isPlaceholderPlayerName(serverName)) {
		return serverName;
	}
	return stored || serverName || 'Guest';
}

function getCookieValue(name) {
	const cookieText = document.cookie || '';
	if (!cookieText) return null;
	const entries = cookieText.split(';');
	for (const entry of entries) {
		const [rawKey, ...rawValue] = entry.trim().split('=');
		if (rawKey === name) {
			return decodeURIComponent(rawValue.join('='));
		}
	}
	return null;
}

function resolvePlayerCode(gameState) {
	if (NetworkManager && typeof NetworkManager.getPlayerId === 'function') {
		const networkId = NetworkManager.getPlayerId();
		if (networkId) return String(networkId);
	}
	if (gameState && gameState.localPlayerId) return String(gameState.localPlayerId);
	const cookieId = getCookieValue('tetches_player_id');
	return cookieId ? String(cookieId) : '';
}

function resolveWorldId() {
	if (NetworkManager && typeof NetworkManager.getGameId === 'function') {
		const networkGameId = NetworkManager.getGameId();
		if (networkGameId) return String(networkGameId);
	}
	const params = new URLSearchParams(window.location.search);
	return params.get('gameId') || params.get('game') || 'shared-world';
}

function updateSessionDetails(gameState) {
	const worldInput = document.getElementById('sidebar-world-id-display');
	if (worldInput) {
		worldInput.value = resolveWorldId();
	}
	const playerCodeInput = document.getElementById('sidebar-player-code-display');
	if (playerCodeInput) {
		playerCodeInput.value = resolvePlayerCode(gameState) || 'Not assigned yet';
	}
}

function copyInputFieldValue(inputId, button, successText = 'Copied!') {
	const input = document.getElementById(inputId);
	if (!input) return;
	input.focus();
	input.select();
	input.setSelectionRange(0, 99999);
	let copied = false;
	try {
		copied = document.execCommand('copy');
	} catch (_error) {
		copied = false;
	}
	const originalText = button.textContent;
	button.textContent = copied ? successText : 'Copy failed';
	setTimeout(() => {
		button.textContent = originalText;
	}, 1400);
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
		left: '0',
		width: '250px',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		color: '#fff',
		zIndex: '10000',
		boxShadow: '0 0 15px rgba(255, 204, 0, 0.5)',
		fontFamily: 'Playfair Display, Times New Roman, serif',
		borderRight: '2px solid #ffcc00',
		transform: 'translateX(-250px)', // Start hidden off-screen
		transition: 'transform 0.3s ease-in-out',
		backdropFilter: 'blur(5px)',
		overflowY: 'auto',
		display: 'flex',
		flexDirection: 'column'
	});
	
	// Create the tab that will always be visible
	const pullTab = document.createElement('button');
	pullTab.id = 'player-bar-tab';
	pullTab.type = 'button';
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
		pointerEvents: 'auto',
		zIndex: '20001', // Keep above floating overlays/banners
		paddingTop: '10px',
		paddingBottom: '10px',
		fontSize: '14px',
		fontWeight: 'bold',
		textShadow: '0 0 5px rgba(255, 204, 0, 0.5)',
		outline: 'none'
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
	
	// Header title (button to make expand/collapse affordance explicit)
	const headerTitle = document.createElement('button');
	headerTitle.textContent = 'PLAYERS';
	headerTitle.type = 'button';
	Object.assign(headerTitle.style, {
		margin: '0',
		color: '#ffcc00',
		fontFamily: 'Playfair Display, Times New Roman, serif',
		textShadow: '0 0 5px rgba(255, 204, 0, 0.5)',
		cursor: 'pointer',
		background: 'none',
		border: 'none',
		padding: '0',
		fontSize: '18px'
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

	
	// Add World / Player session section
	const gameIdSection = document.createElement('div');
	gameIdSection.id = 'sidebar-game-id';
	Object.assign(gameIdSection.style, {
		padding: '15px',
		borderTop: '1px solid rgba(255, 204, 0, 0.5)'
	});
	
	const worldId = resolveWorldId();
	const playerCode = resolvePlayerCode(gameState);
	
	gameIdSection.innerHTML = `
		<div style="font-weight: bold; margin-bottom: 5px; color: #ffcc00;">World ID</div>
		<div style="display: flex; align-items: center; margin-bottom: 10px;">
			<input id="sidebar-world-id-display" type="text" value="${worldId}" 
				style="flex-grow: 1; margin-right: 5px; background: rgba(34, 34, 34, 0.8); color: #ffcc00; 
				border: 1px solid #ffcc00; border-radius: 3px; font-family: monospace; padding: 5px;" readonly>
			<button id="sidebar-copy-world-id" 
				style="background: #333; color: #ffcc00; border: 1px solid #ffcc00; 
				border-radius: 3px; padding: 5px 8px; cursor: pointer; font-family: 'Playfair Display', serif;">
				Copy
			</button>
		</div>
		<div style="font-size: 11px; color: #bbb; margin-bottom: 12px;">Shared board identifier</div>
		<div style="font-weight: bold; margin-bottom: 5px; color: #ffcc00;">Player Code</div>
		<div style="display: flex; align-items: center; margin-bottom: 6px;">
			<input id="sidebar-player-code-display" type="text" value="${playerCode || 'Not assigned yet'}" 
				style="flex-grow: 1; margin-right: 5px; background: rgba(34, 34, 34, 0.8); color: #ffcc00; 
				border: 1px solid #ffcc00; border-radius: 3px; font-family: monospace; padding: 5px;" readonly>
			<button id="sidebar-copy-player-code" 
				style="background: #333; color: #ffcc00; border: 1px solid #ffcc00; 
				border-radius: 3px; padding: 5px 8px; cursor: pointer; font-family: 'Playfair Display', serif;">
				Copy
			</button>
		</div>
		<div style="font-size: 11px; color: #bbb;">Use this code to restore your saved position in the world.</div>
	`;
	playerBar.appendChild(gameIdSection);
	
	// Add mouse controls help
	const controlsHelp = document.createElement('div');
	controlsHelp.id = 'sidebar-controls-help';
	Object.assign(controlsHelp.style, {
		padding: '15px',
		borderTop: '1px solid rgba(255, 204, 0, 0.5)',
		color: '#ffffff',
		fontSize: '13px',
		lineHeight: '1.5'
	});
	
	controlsHelp.innerHTML = `
		<div style="font-weight: bold; margin-bottom: 5px; color: #ffcc00;">Controls</div>
		<div>🖱️ <b>Mouse controls:</b></div>
		<ul style="margin: 5px 0 10px 20px; padding: 0;">
			<li>Left click + drag: Rotate camera</li>
			<li>Right click + drag: Pan camera</li>
			<li>Scroll wheel: Zoom in/out</li>
		</ul>
	`;
	playerBar.appendChild(controlsHelp);
	
	// Create footer with player info if available
	const localPlayerId = getLocalPlayerId(gameState);
	if (localPlayerId || localStorage.getItem('playerName')) {
		const footer = document.createElement('div');
		Object.assign(footer.style, {
			borderTop: '1px solid #ffcc00',
			padding: '15px',
			marginTop: 'auto'
		});
		
		const playerName = resolveLocalDisplayName(gameState, localPlayerId);
		
		footer.innerHTML = `
			<div style="font-size: 14px; color: #ffcc00;">You are playing as:</div>
			<div style="margin-top: 5px; font-weight: bold;">${playerName}</div>
			<button id="change-player-name" style="margin-top: 10px; padding: 5px; background: #333; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%;">
				Change Name
			</button>
			<button id="pause-player-btn" title="Pause your zone and pieces — uncapturable while paused. Limited uses per session." style="margin-top: 8px; padding: 5px; background: #224; color: #cef; border: 1px solid #66f; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%;">
				⏸ Pause
			</button>
			<div id="pause-player-meta" style="margin-top: 4px; font-size: 10px; color: #aaa; text-align: center; min-height: 12px;"></div>
			<button id="exit-game-sidebar-btn" style="margin-top: 8px; padding: 5px; background: #600; color: #fff; border: 1px solid #f44; border-radius: 3px; cursor: pointer; font-size: 12px; width: 100%;">
				Exit Game
			</button>
		`;
		playerBar.appendChild(footer);
		try { wirePauseButton(); } catch (_e) { /* pause UI is non-critical */ }
		
		// Inline rename. The previous version cleared localStorage and
		// reloaded the page — which kicked the user out of the game,
		// raced the dev-mode auto-init, and routinely landed them
		// back as "Guest" or "DevPlayer_xxx". Sending a `change_name`
		// socket message lets the server update the existing record
		// in-place.
		document.getElementById('change-player-name')?.addEventListener('click', () => {
			promptInlineRename(playerName);
		});
	}
	
	// Add to document
	document.body.appendChild(playerBar);
	
	const worldCopyButton = document.getElementById('sidebar-copy-world-id');
	if (worldCopyButton) {
		worldCopyButton.addEventListener('click', () => {
			copyInputFieldValue('sidebar-world-id-display', worldCopyButton, 'Copied!');
		});
	}
	const playerCodeCopyButton = document.getElementById('sidebar-copy-player-code');
	if (playerCodeCopyButton) {
		playerCodeCopyButton.addEventListener('click', () => {
			copyInputFieldValue('sidebar-player-code-display', playerCodeCopyButton, 'Copied!');
		});
	}
	
	// Event listeners
	pullTab.addEventListener('click', togglePlayerBar);
	// Make header title/header clickable too (users naturally click "PLAYERS")
	headerTitle.addEventListener('click', togglePlayerBar);
	header.addEventListener('click', (event) => {
		if (event.target === closeButton) return;
		togglePlayerBar();
	});
	closeButton.addEventListener('click', (event) => {
		event.stopPropagation();
		hidePlayerBar();
	});
	
	// Add touch support for mobile devices
	pullTab.addEventListener('touchstart', (e) => {
		e.preventDefault(); // Prevent scrolling
		togglePlayerBar();
	});
	
	// Populate player information
	updateUnifiedPlayerBar(gameState);
	updateSessionDetails(gameState);
	
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

// ── Pause / resume button ──────────────────────────────────────────────────

let pauseStatusCache = null;
let pauseStatusListenerInstalled = false;

function formatPauseMinutesLeft(status) {
	if (!status) return '';
	const remainingMs = Math.max(0,
		Number(status.maxTotalMs || 0) - Number(status.totalPausedMs || 0)
	);
	const remainingMin = Math.floor(remainingMs / 60000);
	return `${status.usesRemaining ?? 0} uses · ${remainingMin} min`;
}

function applyPauseButtonState(status) {
	const btn = document.getElementById('pause-player-btn');
	const meta = document.getElementById('pause-player-meta');
	if (!btn) return;
	if (!status) {
		btn.textContent = 'Pause';
		btn.disabled = false;
		if (meta) meta.textContent = '';
		return;
	}
	if (status.active) {
		btn.textContent = '▶ Resume';
		btn.style.background = '#460';
		btn.style.borderColor = '#6f6';
		btn.disabled = false;
	} else {
		const exhausted = (status.usesRemaining ?? 0) <= 0
			|| (status.maxTotalMs - status.totalPausedMs) <= 0;
		btn.textContent = exhausted ? 'Pause (no uses left)' : '⏸ Pause';
		btn.style.background = '#224';
		btn.style.borderColor = '#66f';
		btn.disabled = !!exhausted;
	}
	if (meta) meta.textContent = formatPauseMinutesLeft(status);
}

function sendPauseRequest(eventType) {
	if (!NetworkManager || typeof NetworkManager.sendMessage !== 'function') {
		return Promise.reject(new Error('pause unavailable'));
	}
	return NetworkManager.sendMessage(eventType, {});
}

let pauseStatusRetryTimer = null;
function requestPauseStatus({ retryOnFail = true } = {}) {
	sendPauseRequest('pause_status')
		.then((resp) => {
			if (resp && resp.success && resp.status) {
				pauseStatusCache = resp.status;
				applyPauseButtonState(resp.status);
				if (pauseStatusRetryTimer) {
					clearTimeout(pauseStatusRetryTimer);
					pauseStatusRetryTimer = null;
				}
			} else if (retryOnFail && !pauseStatusRetryTimer) {
				// Server responded but join hadn't fully completed
				// yet — try once more after the connection settles.
				pauseStatusRetryTimer = setTimeout(() => {
					pauseStatusRetryTimer = null;
					requestPauseStatus({ retryOnFail: false });
				}, 2500);
			}
		})
		.catch(() => {
			// Server may not yet support the pause endpoint, or the
			// socket isn't connected. Retry once more so the button
			// resolves to a sensible state after auto-connect.
			if (retryOnFail && !pauseStatusRetryTimer) {
				pauseStatusRetryTimer = setTimeout(() => {
					pauseStatusRetryTimer = null;
					requestPauseStatus({ retryOnFail: false });
				}, 2500);
			} else {
				// Give up and show a usable default.
				applyPauseButtonState(null);
			}
		});
}

function wirePauseButton() {
	const btn = document.getElementById('pause-player-btn');
	if (!btn) return;
	btn.addEventListener('click', () => {
		const willPause = !(pauseStatusCache && pauseStatusCache.active);
		const event = willPause ? 'pause_player' : 'resume_player';
		btn.disabled = true;
		btn.textContent = willPause ? 'Pausing…' : 'Resuming…';
		sendPauseRequest(event)
			.then((resp) => {
				if (!resp || !resp.success) {
					showToastMessage(resp && resp.error
						? `Pause failed: ${resp.error}`
						: 'Pause request failed');
					requestPauseStatus();
					return;
				}
				pauseStatusCache = resp.status || pauseStatusCache;
				applyPauseButtonState(pauseStatusCache);
				showToastMessage(willPause
					? 'Paused — your pieces and zone are frozen.'
					: 'Resumed — back in the game!');
			})
			.catch((err) => {
				showToastMessage(`Pause request failed: ${err?.message || err}`);
				requestPauseStatus();
			});
	});

	if (!pauseStatusListenerInstalled && NetworkManager && typeof NetworkManager.on === 'function') {
		pauseStatusListenerInstalled = true;
		NetworkManager.on('player_pause_state', (payload) => {
			if (!payload) return;
			const localId = getLocalPlayerId({});
			if (String(payload.playerId) !== String(localId)) return;
			pauseStatusCache = payload;
			applyPauseButtonState(payload);
			if (payload.resumeReason === 'auto_timeout') {
				showToastMessage('Auto-resumed — pause time elapsed.');
			}
		});
	}

	requestPauseStatus();
}

/**
 * Toggle the player bar visibility
 */
export function togglePlayerBar() {
	const playerBar = document.getElementById('unified-player-bar');
	const tab = document.getElementById('player-bar-tab');
	if (!playerBar) return;
	
	isBarVisible = !isBarVisible;
	playerBar.style.left = '0';
	playerBar.style.transform = isBarVisible ? 'translateX(0)' : 'translateX(-250px)';
	
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
	playerBar.style.transform = 'translateX(0)';
	
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
	playerBar.style.left = '0';
	playerBar.style.transform = 'translateX(-250px)';
	
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
	
	// Generate the player color, defensively coerced so a 0xDD0000
	// integer (the server's wire format for player colour) still
	// renders as CSS.
	const playerColor = normaliseColour(playerInfo.color) || generatePlayerColor(playerId);
	
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
	if (playerInfo.paused) {
		const pauseBadge = document.createElement('span');
		pauseBadge.textContent = ' ⏸ paused';
		pauseBadge.style.marginLeft = '6px';
		pauseBadge.style.fontSize = '11px';
		pauseBadge.style.color = '#9cf';
		pauseBadge.style.background = 'rgba(60,80,140,0.35)';
		pauseBadge.style.padding = '0 5px';
		pauseBadge.style.borderRadius = '3px';
		nameDisplay.appendChild(pauseBadge);
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

	// Show captured-piece basket as a compact badge: "♜ 3" etc.
	// Each glyph is rendered in the *original owner's* colour so a
	// captured red-bishop reads as "I took this from the red player",
	// not as "this is mine". Falls back to the old single-colour
	// rendering for legacy server payloads that don't include the
	// breakdown.
	const capturedCount = Number(playerInfo.capturedCount) || 0;
	if (capturedCount > 0) {
		const PIECE_GLYPH = { QUEEN: '\u265B', ROOK: '\u265C', BISHOP: '\u265D', KNIGHT: '\u265E' };
		const order = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
		const breakdown = Array.isArray(playerInfo.capturedBreakdown) ? playerInfo.capturedBreakdown : null;

		const basketDisplay = document.createElement('div');
		Object.assign(basketDisplay.style, {
			marginLeft: '6px',
			fontSize: '12px',
			padding: '2px 6px',
			borderRadius: '3px',
			backgroundColor: 'rgba(0,0,0,0.45)',
			fontFamily: 'serif',
			letterSpacing: '2px',
			display: 'inline-flex',
			gap: '4px',
			alignItems: 'center',
		});
		basketDisplay.title = `Captured pieces awaiting redemption (${capturedCount}). Glyph colour matches the original owner.`;

		if (breakdown && breakdown.length > 0) {
			// Per-(type, owner-colour) chips so the captured player's
			// hue is preserved. We still respect the promotion order
			// (queens first) for visual consistency.
			breakdown
				.slice()
				.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
				.forEach(entry => {
					const glyph = PIECE_GLYPH[entry.type] || '\u265F';
					const colour = normaliseColour(entry.color) || '#ffd97a';
					const chip = document.createElement('span');
					chip.textContent = `${glyph}${entry.count}`;
					chip.style.color = colour;
					chip.style.textShadow = '0 0 2px rgba(0,0,0,0.6)';
					basketDisplay.appendChild(chip);
				});
		} else {
			const summary = playerInfo.capturedSummary || {};
			const parts = order
				.filter(type => summary[type] > 0)
				.map(type => `${PIECE_GLYPH[type]}${summary[type]}`)
				.join(' ');
			basketDisplay.textContent = parts || `${capturedCount}`;
			basketDisplay.style.color = '#ffd97a';
		}
		playerElement.appendChild(basketDisplay);
	}

	// Promotion-credits badge. Only meaningful for the local player —
	// other players' credits are private (the server doesn't expose
	// per-credit positions). The badge is clickable and opens the
	// redeem dialog.
	const promotionCreditCount = Number(playerInfo.promotionCreditCount) || 0;
	if (promotionCreditCount > 0) {
		const creditDisplay = document.createElement('div');
		creditDisplay.textContent = `\u2605${promotionCreditCount}`;
		Object.assign(creditDisplay.style, {
			marginLeft: '6px',
			fontSize: '12px',
			padding: '2px 6px',
			borderRadius: '3px',
			backgroundColor: 'rgba(76,175,80,0.2)',
			color: '#a8e6a3',
			fontFamily: 'serif',
			letterSpacing: '1px',
			border: '1px solid rgba(76,175,80,0.5)',
		});
		if (isLocalPlayer) {
			creditDisplay.title = 'Banked promotion credits. Click to spend one against a captured piece.';
			creditDisplay.style.cursor = 'pointer';
			creditDisplay.style.boxShadow = '0 0 6px rgba(168,230,163,0.5)';
			creditDisplay.addEventListener('mouseenter', () => {
				creditDisplay.style.backgroundColor = 'rgba(76,175,80,0.4)';
			});
			creditDisplay.addEventListener('mouseleave', () => {
				creditDisplay.style.backgroundColor = 'rgba(76,175,80,0.2)';
			});
			creditDisplay.addEventListener('click', (e) => {
				e.stopPropagation();
				try { showPromotionRedeemDialog(); }
				catch (err) { console.warn('Failed to open redeem dialog:', err); }
			});
		} else {
			creditDisplay.title = `Banked promotion credits (${promotionCreditCount})`;
		}
		playerElement.appendChild(creditDisplay);
	}

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
	
	// Click flies the camera to that player's king (or home zone if
	// the king is missing).
	//
	// Notes:
	//   - One listener per row, on `pointerdown` so mobile + desktop
	//     behave identically and we don't queue up two animations from
	//     a click that lands on a child element (the previous version
	//     fired on both `click` and `touchstart`, which caused the
	//     "laggy / does nothing" behaviour the user reported).
	//   - A short cooldown stops rapid double-clicks from stacking
	//     fly animations on top of each other.
	playerElement.dataset.playerId = playerId;
	playerElement.style.cursor = 'pointer';
	playerElement.title = `Fly to ${playerInfo.name || playerId}`;
	let lastFlyAt = 0;
	const FLY_COOLDOWN_MS = 250;
	const flyHandler = (event) => {
		if (event && event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const now = Date.now();
		if (now - lastFlyAt < FLY_COOLDOWN_MS) return;
		lastFlyAt = now;

		console.log('[player-bar] fly-to click for playerId=', playerId);

		playerElement.style.transition = 'transform 120ms ease, background-color 120ms ease';
		const previousBg = playerElement.style.backgroundColor;
		playerElement.style.backgroundColor = 'rgba(255, 204, 0, 0.55)';
		playerElement.style.transform = 'translateX(-5px) scale(1.04)';
		setTimeout(() => {
			playerElement.style.backgroundColor = previousBg;
			playerElement.style.transform = 'translateX(-5px)';
		}, 180);

		if (window.gameCore && typeof window.gameCore.flyToPlayerKing === 'function') {
			const moved = window.gameCore.flyToPlayerKing(playerId);
			if (moved === false) {
				showToastMessage(`Couldn't fly to ${playerInfo.name || playerId} — no king and no home zone found.`);
			} else {
				showToastMessage(`Flying to ${playerInfo.name || playerId}...`);
			}
		} else {
			console.warn('[player-bar] flyToPlayerKing is not exposed on window.gameCore yet');
			showToastMessage('Camera not ready — try again in a second.');
		}
	};
	playerElement.addEventListener('pointerdown', flyHandler);

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
	
	// Debug the game state (gated to avoid performance hit from serialising the full object)
	if (gameState?.debugMode) console.log('Updating player bar with game state:', gameState);
	
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
			return `${playerId}-${player.name || ''}-${player.score || 0}-${player.isActive ? 1 : 0}-${player.eliminated ? 1 : 0}-${player.paused ? 1 : 0}-${player.color || ''}-${player.capturedCount || 0}`;
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
	updateSessionDetails(gameState);
	
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
	
	// Ensure local player appears in the list — match by ID, not name,
	// to avoid creating phantom entries when names drift.
	if (localPlayerId && gameState.players && !gameState.players[localPlayerId]) {
		const storedPlayerName = localStorage.getItem('playerName');
		gameState.players[localPlayerId] = {
			name: storedPlayerName || `Player ${localPlayerId.substring(0, 6)}`,
			id: localPlayerId,
			score: 0
		};
	}
	
	// Add each player. The local player is pinned to the top of the
	// list — they're the user looking at this UI, and "Fly to my king"
	// is by far the most common reason for opening the panel.
	// Eliminated players are filtered out entirely because the user
	// asked: "players that have been totally beaten are staying in the
	// system... they are all apearing in the left menu". Keeping them
	// would also bias the spawn algorithm towards dead-king coords.
	if (gameState.players && Object.keys(gameState.players).length > 0) {
		const visibleIds = Object.keys(gameState.players).filter(pid => {
			const player = gameState.players[pid];
			if (!player) return false;
			// Always show the local player even if a stale flag claims
			// they're eliminated — we'd rather show a wrong row than
			// hide the user from their own UI.
			if (pid === localPlayerId) return true;
			return !player.eliminated;
		});
		console.log('Players in game state:', Object.keys(gameState.players).length,
			'visible:', visibleIds.length);
		const sortedIds = visibleIds.sort((a, b) => {
			if (a === localPlayerId) return -1;
			if (b === localPlayerId) return 1;
			return 0;
		});
		sortedIds.forEach(playerId => {
			const player = gameState.players[playerId];
			if (!player) return;

			addPlayerToBar(
				playerBar,
				playerId,
				{
					name: player.name || `Player ${playerId.substring(0, 6)}`,
					color: player.color,
					score: player.score || 0,
					capturedCount: player.capturedCount || 0,
					capturedSummary: player.capturedSummary || {},
				},
				gameState
			);
		});
		if (sortedIds.length === 0) {
			const noOneMessage = document.createElement('div');
			noOneMessage.textContent = 'No active opponents — you have the world to yourself.';
			Object.assign(noOneMessage.style, {
				textAlign: 'center',
				color: '#ffcc00',
				padding: '20px',
				fontStyle: 'italic',
			});
			const container = document.getElementById('unified-player-container');
			if (container) container.appendChild(noOneMessage);
		}
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
	
	// Keep world/session details in sync with latest connection state
	updateSessionDetails(gameState);
}

/**
 * Generate a deterministic color for a player ID
 */
function generatePlayerColor(playerId) {
	// Local player gets the same warm-wood swatch their chess pieces
	// use in the scene, so the sidebar matches what they see on the
	// board (was previously a misleading red).
	if (NetworkManager && NetworkManager.getPlayerId && playerId === NetworkManager.getPlayerId()) {
		return '#C4A265';
	}

	let hash = 0;
	const id = playerId || 'unknown';
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}

	// Match the in-scene palette (greens/cyans/blues — h ∈ [120, 240]).
	const h = 120 + (Math.abs(hash) % 120);
	const s = 65 + (Math.abs(hash >> 8) % 35);
	const l = 45 + (Math.abs(hash >> 16) % 20);
	return `hsl(${h}, ${s}%, ${l}%)`;
} 