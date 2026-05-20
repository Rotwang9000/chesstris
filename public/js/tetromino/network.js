/**
 * Client-side tetromino networking — sending placements to the server,
 * subscribing to placement-related socket events, and translating
 * server reasons into the right animation.
 *
 * The server is authoritative; this module only renders a hopeful
 * "local placement" effect when client-side validation thinks the move
 * will succeed.  Disagreement between client + server triggers a
 * silent correction.
 */

import NetworkManager from '../utils/networkManager.js';
import gameStateSingleton from '../utils/gameState.js';
import { showToastMessage } from '../showToastMessage.js';
import { highlightClearedLines, showPlacementEffect } from './animations.js';
import { validatePlacementLocally } from './validation.js';
import { cleanupCurrentTetromino, cleanupGhostPiece } from './rendering.js';
import { armSkipDropTimer } from '../skipChessButton.js';

let _onPlacementFailure = null;

export function setPlacementFailureHandler(fn) {
	_onPlacementFailure = typeof fn === 'function' ? fn : null;
}

function showLocalPlacementEffect(tetrominoData, gameState) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	showPlacementEffect(posX, posZ, gameState);
	if (typeof window.updateBoardVisuals === 'function') window.updateBoardVisuals();
}

async function ensureConnectedAndSend(serverData) {
	if (!NetworkManager.isConnected()) {
		console.log('Not connected to server. Attempting to reconnect...');
		if (typeof showToastMessage === 'function') {
			showToastMessage('Connection lost. Attempting to reconnect...');
		}
		const connected = await NetworkManager.ensureConnected(null, 5);
		if (!connected) {
			console.error('Failed to reconnect after multiple attempts');
			return {
				success: false,
				reason: 'network_error',
				message: 'Unable to connect to server after multiple attempts. Please refresh the page.',
			};
		}

		if (!NetworkManager.getGameId()) {
			console.log('No gameId after reconnection, attempting to join a game');
			try {
				const gameData = await NetworkManager.joinGame();
				console.log('Rejoined game:', gameData);
				if (gameData && gameData.gameId && typeof NetworkManager.updateGameId === 'function') {
					NetworkManager.updateGameId(gameData.gameId);
					serverData.gameId = gameData.gameId;
				}
			} catch (error) {
				console.error('Failed to rejoin game after reconnection:', error);
				return {
					success: false,
					reason: 'network_error',
					message: 'Failed to rejoin game after reconnection',
				};
			}
		}
	}

	try {
		return await NetworkManager.submitTetrominoPlacement(serverData);
	} catch (error) {
		console.error('Error submitting tetromino placement:', error);

		if (error && error.reason === 'rate_limited') {
			return {
				success: false,
				reason: 'rate_limited',
				retryAfterMs: error.retryAfterMs ?? error.details?.retryAfterMs,
				message: 'rate_limited',
				error,
			};
		}

		if (error && error.reason === 'validation_error' && error.details) {
			return {
				success: false,
				reason: error.details.reason || 'validation_error',
				message: error.details.message || error.message || 'Server rejected placement',
				error,
			};
		}

		const isNetworkError = error.message?.includes('connect')
			|| error.message?.includes('network')
			|| error.message?.includes('timeout')
			|| !NetworkManager.isConnected();

		if (isNetworkError) {
			return {
				success: false,
				reason: 'network_error',
				message: 'Network error during placement submission',
			};
		}

		return {
			success: false,
			reason: 'validation_error',
			message: error.message || 'Server rejected placement',
			error,
		};
	}
}

/**
 * Submit a tetromino placement.  Returns a promise that resolves with
 * the server's response object.  Side effects:
 *   - Shows an optimistic placement animation when local validation
 *     agrees with the server's likely answer.
 *   - On mismatch, silently cleans up the current piece + ghost.
 */
export function sendTetrominoPlacementToServer(tetrominoData, gameState) {
	console.log('Sending tetromino placement to server:', tetrominoData);
	console.log('Current turnPhase before placement:', gameState.turnPhase);

	const isLocallyValid = validatePlacementLocally(tetrominoData, gameState);
	console.log('Local validation result:', isLocallyValid ? 'valid' : 'invalid');

	const serverData = JSON.parse(JSON.stringify(tetrominoData));
	serverData.pieceType = tetrominoData.type;
	if (serverData.position) {
		serverData.x = serverData.position.x;
		serverData.z = serverData.position.z;
		serverData.y = serverData.heightAboveBoard || 0;
		console.log(`Sending coordinates to server: (${serverData.x}, ${serverData.z}, ${serverData.y})`);
	}
	const gameId = NetworkManager.getGameId();
	if (gameId) serverData.gameId = gameId;

	if (isLocallyValid) showLocalPlacementEffect(tetrominoData, gameState);
	else console.log('Local validation failed; awaiting server authority for final outcome.');

	return ensureConnectedAndSend(serverData).then(response => {
		const serverAccepted = response && response.success;
		if (serverAccepted !== isLocallyValid) {
			console.warn('Client/server validation mismatch — server:', serverAccepted, 'local:', isLocallyValid);
			cleanupCurrentTetromino(gameState);
			cleanupGhostPiece(gameState);
		}
		if (typeof window.updateBoardVisuals === 'function') window.updateBoardVisuals();
		return response;
	});
}

function handleRowCleared(data, gameState) {
	if (!data) return;
	const rows = Array.isArray(data.rows) ? data.rows : [];
	const cols = Array.isArray(data.cols) ? data.cols : [];
	if (rows.length === 0 && cols.length === 0) return;

	// Only flash row-clear highlights for the local player's own clears.
	// In a busy shared world, dozens of remote clears per minute would
	// otherwise spam giant cyan stripes across the whole board.
	const localId = gameState?.localPlayerId;
	const isOwnClear = localId != null && String(data.playerId) === String(localId);
	if (isOwnClear) highlightClearedLines(rows, cols, gameState);

	setTimeout(() => {
		if (typeof window.updateBoardVisuals === 'function') window.updateBoardVisuals();
	}, 1000);
}

function handleTetrominoFailed(data, gameState) {
	console.log('Tetromino placement failed:', data);
	const reason = data?.reason || '';
	let failureMessage = data?.message || 'Placement failed - tetromino exploded.';
	let effect = 'EXPLODE';

	if (reason === 'no_path_to_king') {
		failureMessage = 'No path back to your king - bridge from connected territory first.';
		effect = 'DISSOLVE_FALL';
	} else if (reason === 'not_adjacent') {
		failureMessage = 'Tetromino must touch your own territory.';
		effect = 'DISSOLVE_FALL';
	} else if (typeof failureMessage === 'string' && failureMessage.toLowerCase().includes('connect')) {
		failureMessage = 'Missed connection - tetromino dissolved into sand.';
		effect = 'DISSOLVE_FALL';
	}

	if (gameState.currentTetromino) {
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		if (_onPlacementFailure) _onPlacementFailure(posX, posZ, failureMessage, effect);
	} else if (typeof window.showToastMessage === 'function') {
		window.showToastMessage(failureMessage, 'error');
	}

	// If the player keeps failing to drop a tetromino, arm the
	// "Skip to chess move" affordance so they can escape the loop.
	armSkipDropTimer();
}

export function initializeTetrominoSocketListeners(gameState = gameStateSingleton) {
	if (!NetworkManager || typeof NetworkManager.addEventListener !== 'function') {
		console.warn('NetworkManager not available, tetromino socket events not initialised');
		return;
	}
	NetworkManager.addEventListener('row_cleared', (data) => handleRowCleared(data, gameState));
	NetworkManager.addEventListener('tetrominoFailed', (data) => handleTetrominoFailed(data, gameState));
}
