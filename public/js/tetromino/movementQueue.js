/**
 * Tetromino movement queue — the state machine that orders all moves
 * (horizontal, vertical, rotate, hard-drop, place, explode, cleanup)
 * so they don't race against each other or against the placement
 * round-trip with the server.
 *
 * Every public action below pushes one operation onto the queue and
 * lets the asynchronous processor handle rendering side effects in
 * order.  Direct calls (e.g. from `enhanced-gameCore.js`) should
 * always go through this module rather than mutating `gameState`
 * directly.
 */

import { boardFunctions } from '../boardFunctions.js';
import { showToastMessage } from '../showToastMessage.js';
import { displaySponsorInfo } from '../../utils/sponsors.js';
import {
	showDropAnimation,
	showExplosionAnimation,
	showSandDissolveFallAnimation,
	showPlacementEffect,
} from './animations.js';
import { checkTetrominoCollision } from './validation.js';
import {
	renderTetromino,
	cleanupCurrentTetromino,
	cleanupGhostPiece,
} from './rendering.js';
import {
	sendTetrominoPlacementToServer,
	setPlacementFailureHandler,
} from './network.js';
import { initializeNextTetromino } from './spawn.js';
import {
	armSkipChessTimer,
	cancelSkipChessTimer,
	cancelSkipDropTimer,
} from '../skipChessButton.js';
import { updateNextPieceHint } from './nextPiece.js';

export const MOVEMENT_TYPES = Object.freeze({
	MOVE_X: 'moveX',
	MOVE_Z: 'moveZ',
	MOVE_Y: 'moveY',
	ROTATE: 'rotate',
	HARD_DROP: 'hardDrop',
	PLACE: 'place',
	EXPLODE: 'explode',
	CLEANUP: 'cleanup',
});

export const FAILURE_EFFECTS = Object.freeze({
	EXPLODE: 'explode',
	DISSOLVE_FALL: 'dissolve_fall',
});

let _gameStateRef = null;

function ensureQueueState(gameState) {
	if (!Array.isArray(gameState.tetrominoMovementQueue)) {
		gameState.tetrominoMovementQueue = [];
	}
}

export function setGameStateRef(gameState) {
	_gameStateRef = gameState;
	ensureQueueState(gameState);
}

function getGameState() {
	return _gameStateRef;
}

function queueOperation(type, params = {}) {
	const gameState = getGameState();
	if (!gameState) {
		console.warn(`queueTetrominoMovement(${type}) called before gameState was set`);
		return false;
	}
	ensureQueueState(gameState);

	if (!gameState.currentTetromino && type !== MOVEMENT_TYPES.CLEANUP) {
		console.log(`Cannot queue ${type} operation - no tetromino exists`);
		return false;
	}
	if (gameState.turnPhase !== 'tetris' && type !== MOVEMENT_TYPES.CLEANUP) {
		console.log(`Cannot queue ${type} operation - not in tetris phase`);
		return false;
	}

	gameState.tetrominoMovementQueue.push({ type, params, timestamp: Date.now() });

	if (!gameState.isProcessingMovementQueue) {
		setTimeout(processQueue, 0);
	}
	return true;
}

function processQueue() {
	const gameState = getGameState();
	if (!gameState) return;
	if (gameState.isProcessingMovementQueue) return;
	if (!gameState.tetrominoMovementQueue || gameState.tetrominoMovementQueue.length === 0) return;

	gameState.isProcessingMovementQueue = true;
	try {
		while (gameState.tetrominoMovementQueue.length > 0) {
			const operation = gameState.tetrominoMovementQueue.shift();
			if (!gameState.currentTetromino && operation.type !== MOVEMENT_TYPES.CLEANUP) {
				console.log(`Skipping ${operation.type} operation - no tetromino exists`);
				continue;
			}
			if (gameState.turnPhase !== 'tetris' && operation.type !== MOVEMENT_TYPES.CLEANUP) {
				console.log(`Skipping ${operation.type} operation - not in tetris phase`);
				continue;
			}

			switch (operation.type) {
				case MOVEMENT_TYPES.MOVE_X: processHorizontalMove(true, operation.params.dir); break;
				case MOVEMENT_TYPES.MOVE_Z: processHorizontalMove(false, operation.params.dir); break;
				case MOVEMENT_TYPES.MOVE_Y: processVerticalMove(operation.params.height, operation.params.isRelative); break;
				case MOVEMENT_TYPES.ROTATE: processRotate(operation.params.dir); break;
				case MOVEMENT_TYPES.HARD_DROP: processHardDrop(); break;
				case MOVEMENT_TYPES.PLACE: processPlaceTetromino(); break;
				case MOVEMENT_TYPES.EXPLODE:
					processExplosion(
						operation.params.x,
						operation.params.z,
						operation.params.message,
						operation.params.effect || FAILURE_EFFECTS.EXPLODE,
					);
					break;
				case MOVEMENT_TYPES.CLEANUP: processCleanup(operation.params.message); break;
				default: console.warn(`Unknown operation type: ${operation.type}`);
			}
		}

		if (gameState.currentTetromino && gameState.pendingRender) {
			renderTetromino(gameState);
			gameState.pendingRender = false;
		}
	} catch (error) {
		console.error('Error processing movement queue:', error);
	} finally {
		gameState.isProcessingMovementQueue = false;
	}
}

function processHorizontalMove(isXAxis, dir) {
	const gameState = getGameState();
	if (!gameState.currentTetromino) return;

	const newPos = {
		x: isXAxis ? gameState.currentTetromino.position.x + dir : gameState.currentTetromino.position.x,
		z: isXAxis ? gameState.currentTetromino.position.z : gameState.currentTetromino.position.z + dir,
	};
	gameState.currentTetromino.position = newPos;
	gameState.pendingRender = true;
}

function processVerticalMove(height, isRelative) {
	const gameState = getGameState();
	if (!gameState.currentTetromino) return;

	let targetHeight = isRelative
		? gameState.currentTetromino.heightAboveBoard + height
		: height;
	if (targetHeight > gameState.TETROMINO_START_HEIGHT) targetHeight = gameState.TETROMINO_START_HEIGHT;
	if (targetHeight < 0) targetHeight = 0;

	if (targetHeight === 0) {
		const shape = gameState.currentTetromino.shape;
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;

		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] !== 1) continue;
				const cell = gameState.board?.cells?.[`${posX + x},${posZ + z}`];
				if (cell !== undefined && cell !== null) {
					console.log(`Vertical move failed - collision at Y=0 with existing piece at (${posX + x}, ${posZ + z})`);
					gameState.currentTetromino.heightAboveBoard = 0;
					queueOperation(MOVEMENT_TYPES.EXPLODE, {
						x: posX, z: posZ,
						message: 'Collision on landing',
					});
					return;
				}
			}
		}

		const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ);
		if (!isAdjacent) {
			console.log('Vertical move failed - tetromino not adjacent at landing position (Y=0)');
			gameState.currentTetromino.heightAboveBoard = 0;
			queueOperation(MOVEMENT_TYPES.EXPLODE, {
				x: posX, z: posZ,
				message: 'Missed connection - tetromino dissolved into sand.',
				effect: FAILURE_EFFECTS.DISSOLVE_FALL,
			});
			return;
		}

		console.log('Vertical move successful - landed at Y=0 adjacently. Queueing PLACE.');
		gameState.currentTetromino.heightAboveBoard = 0;
		gameState.pendingRender = true;
		queueOperation(MOVEMENT_TYPES.PLACE, {});
		return;
	}

	gameState.currentTetromino.heightAboveBoard = targetHeight;
	gameState.pendingRender = true;
}

function processRotate(dir) {
	const gameState = getGameState();
	if (!gameState.currentTetromino) return;

	const currentShape = gameState.currentTetromino.shape;
	const size = currentShape.length;
	const newShape = [];
	for (let i = 0; i < size; i++) newShape.push(new Array(size).fill(0));

	for (let z = 0; z < size; z++) {
		for (let x = 0; x < size; x++) {
			if (dir === 1) newShape[x][size - 1 - z] = currentShape[z][x];
			else newShape[size - 1 - x][z] = currentShape[z][x];
		}
	}

	gameState.currentTetromino.shape = newShape;
	gameState.pendingRender = true;
}

function processHardDrop() {
	const gameState = getGameState();
	if (!gameState.currentTetromino) return;

	console.log('Processing hard drop: Setting Y=0');
	gameState.currentTetromino.heightAboveBoard = 0;
	showDropAnimation(gameState);
	gameState.pendingRender = true;

	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;

	if (checkTetrominoCollision(gameState, shape, posX, posZ)) {
		console.log(`Hard drop failed - collision at (${posX}, ${posZ})`);
		queueOperation(MOVEMENT_TYPES.EXPLODE, { x: posX, z: posZ, message: 'Collision on landing' });
		return;
	}

	const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ);
	if (!isAdjacent) {
		console.log('Hard drop failed - tetromino not adjacent at landing position');
		queueOperation(MOVEMENT_TYPES.EXPLODE, {
			x: posX, z: posZ,
			message: 'Missed connection - tetromino dissolved into sand.',
			effect: FAILURE_EFFECTS.DISSOLVE_FALL,
		});
		return;
	}

	console.log('Hard drop successful - landed adjacently. Queueing PLACE.');
	queueOperation(MOVEMENT_TYPES.PLACE, {});
}

function rejectionMessageForReason(response) {
	let rejectionMessage = 'Missed drop - tetromino dissolved into sand.';
	let rejectionEffect = FAILURE_EFFECTS.EXPLODE;
	const reason = response?.reason;
	let message = response?.message;

	if (!message && reason) {
		switch (reason) {
			case 'occupied': message = 'That space is already occupied.'; break;
			case 'not_adjacent':
				message = 'Missed connection - tetromino dissolved into sand.';
				rejectionEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
				break;
			case 'no_path_to_king':
				message = 'No king path - tetromino dissolved into sand.';
				rejectionEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
				break;
			default:
				message = 'Placement rejected - tetromino exploded.';
		}
	}
	if (reason === 'not_adjacent' || reason === 'no_path_to_king') {
		rejectionEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
	}
	if (message) rejectionMessage = message;
	return { rejectionMessage, rejectionEffect };
}

function processPlaceTetromino() {
	const gameState = getGameState();
	if (!gameState.currentTetromino) return;
	if (gameState.isSubmittingTetrominoPlacement) return;
	gameState.isSubmittingTetrominoPlacement = true;

	const originalX = gameState.currentTetromino.position.x;
	const originalZ = gameState.currentTetromino.position.z;
	const placedTetrominoSponsor = gameState.currentTetromino.sponsor;
	cleanupGhostPiece(gameState);

	sendTetrominoPlacementToServer(gameState.currentTetromino, gameState)
		.then(response => {
			if (response && response.placedCells) {
				console.log(`Server confirmed placement of ${response.placedCells.length} cells`);
			}
			if (response && response.position) {
				console.log(`Server returned position: (${response.position.x}, ${response.position.z})`);
				showPlacementEffect(response.position.x, response.position.z, gameState);
			}

			if (response && response.success === true) {
				gameState._hasPlacedTetromino = true;
				if (placedTetrominoSponsor) {
					console.log('Displaying sponsor ad for:', placedTetrominoSponsor.name);
					displaySponsorInfo(placedTetrominoSponsor);
				}

				cleanupCurrentTetromino(gameState);
				if (typeof window.updateBoardVisuals === 'function') window.updateBoardVisuals();

				console.log('Placement successful. Server hasValidMoves:', response.hasValidMoves);
				cancelSkipDropTimer();
				if (response.hasValidMoves === false) {
					console.log('Server says no valid chess moves - waiting for new tetromino');
					gameState.turnPhase = 'tetris';
					cancelSkipChessTimer();
					if (typeof showToastMessage === 'function') {
						showToastMessage('No chess moves available - next piece incoming');
					}
				} else {
					gameState.turnPhase = 'chess';
					armSkipChessTimer();
					console.log('Valid chess moves available, switched to chess phase');
					if (typeof showToastMessage === 'function') {
						showToastMessage('Make your chess move!');
					}
				}
				updateNextPieceHint(gameState);

				if (typeof window.updateGameStatusDisplay === 'function') {
					window.updateGameStatusDisplay();
				}
				return;
			}

			if (response && response.success === false) {
				const isRateLimited = response.reason === 'rate_limited'
					|| response.error === 'rate_limited'
					|| response.message === 'rate_limited';

				if (isRateLimited) {
					const retryAfterMs = Number(response.retryAfterMs || 0);
					const seconds = retryAfterMs > 0
						? Math.max(0.1, Math.ceil(retryAfterMs / 100) / 10)
						: null;

					if (typeof showToastMessage === 'function') {
						showToastMessage(seconds ? `Too fast. Placing in ${seconds}s...` : 'Too fast. Placing shortly...');
					}

					if (gameState._placementRetryTimeoutId) {
						clearTimeout(gameState._placementRetryTimeoutId);
					}
					gameState._placementRetryTimeoutId = setTimeout(() => {
						if (gameState.currentTetromino && gameState.turnPhase === 'tetris') {
							queueOperation(MOVEMENT_TYPES.PLACE, {});
						}
					}, Math.max(0, retryAfterMs));
					return;
				}

				const { rejectionMessage, rejectionEffect } = rejectionMessageForReason(response);
				console.error('Server rejected placement:', response.reason || response.error || 'Unknown error');
				processExplosion(originalX, originalZ, rejectionMessage, rejectionEffect);
			}
		})
		.catch(error => {
			console.error('Error during tetromino placement:', error);
			processExplosion(originalX, originalZ, 'Placement failed - tetromino exploded.', FAILURE_EFFECTS.EXPLODE);
		})
		.finally(() => {
			gameState.isSubmittingTetrominoPlacement = false;
		});
}

function processExplosion(x, z, message, effect = FAILURE_EFFECTS.EXPLODE) {
	const gameState = getGameState();
	const shapeSnapshot = gameState.currentTetromino?.shape
		? gameState.currentTetromino.shape.map(row => row.slice())
		: null;

	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	cleanupCurrentTetromino(gameState);
	cleanupGhostPiece(gameState);

	if (effect === FAILURE_EFFECTS.DISSOLVE_FALL) {
		showSandDissolveFallAnimation(x, z, shapeSnapshot, gameState);
	} else {
		showExplosionAnimation(x, z, gameState);
	}

	processCleanup(message || 'Tetromino exploded');
}

function processCleanup(message) {
	const gameState = getGameState();
	if (message && typeof showToastMessage === 'function') {
		showToastMessage(message);
	}

	console.log('Current turnPhase before cleanup:', gameState.turnPhase);
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	cleanupGhostPiece(gameState);
	gameState.currentTetromino = null;
	gameState.ghostTetromino = null;

	// After a tetromino is rejected, hand the player a fresh tetromino
	// rather than dropping them straight into a chess phase the server
	// might disagree with. The next placement response carries the
	// authoritative `hasValidMoves` flag from the server, which is what
	// actually drives the chess phase.
	console.log('Tetromino exploded — issuing replacement tetromino');
	gameState.turnPhase = 'tetris';
	const newTetromino = initializeNextTetromino(gameState);
	if (newTetromino) {
		gameState.currentTetromino = newTetromino;
		gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT || 20;
	}
	cancelSkipChessTimer();
	updateNextPieceHint(gameState);

	console.log('Tetromino cleanup completed, phase:', gameState.turnPhase);
	if (typeof window.updateBoardVisuals === 'function') window.updateBoardVisuals();
	if (typeof window.updateGameStatusDisplay === 'function') window.updateGameStatusDisplay();
}

// Public API ─────────────────────────────────────────────────────────

export function queueTetrominoMovement(type, params = {}) {
	return queueOperation(type, params);
}

export function moveTetrominoX(dir) {
	return queueOperation(MOVEMENT_TYPES.MOVE_X, { dir });
}

export function moveTetrominoZ(dir) {
	return queueOperation(MOVEMENT_TYPES.MOVE_Z, { dir });
}

export function moveTetrominoY(height, isRelative = true) {
	return queueOperation(MOVEMENT_TYPES.MOVE_Y, { height, isRelative });
}

export function rotateTetromino(dir) {
	return queueOperation(MOVEMENT_TYPES.ROTATE, { dir });
}

export function hardDropTetromino() {
	return queueOperation(MOVEMENT_TYPES.HARD_DROP, {});
}

export function cleanupTetrominoAndTransitionToChess(_gameState, message, x, z, effect = FAILURE_EFFECTS.EXPLODE) {
	return queueOperation(MOVEMENT_TYPES.EXPLODE, { x, z, message, effect });
}

export function enhancedPlaceTetromino() {
	return queueOperation(MOVEMENT_TYPES.PLACE, {});
}

// Wire the network module's failure handler into our explosion logic
// so a `tetrominoFailed` socket event triggers the same animation path
// as a server-rejected placement.
setPlacementFailureHandler((x, z, message, effect) => {
	queueOperation(MOVEMENT_TYPES.EXPLODE, {
		x, z, message,
		effect: effect === 'DISSOLVE_FALL' ? FAILURE_EFFECTS.DISSOLVE_FALL : FAILURE_EFFECTS.EXPLODE,
	});
});
