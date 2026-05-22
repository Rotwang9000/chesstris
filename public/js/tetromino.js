/**
 * Tetromino public API for Tetches (Phase-4 refactored).
 *
 * The bulk of the tetromino logic now lives in the `./tetromino/*`
 * sub-modules. This file remains as the legacy entry point used by the
 * rest of the client code; it wires the modules together and re-exports
 * the public surface as both named exports and the historical
 * `tetrominoModule` object.
 *
 * Tetches 3D coordinate system
 * =============================
 * - X-axis: left → right (right is positive)
 * - Y-axis: down → up (up is positive); Y = 0 is the board surface
 * - Z-axis: toward camera → away (away is positive)
 * Chess pieces and tetromino blocks both lie on the XZ plane when
 * placed on the board.
 */

import gameState from './utils/gameState.js';
import { translatePosition } from './centreBoardMarker.js';
import { boardFunctions } from './boardFunctions.js';

import { tetrominoPool } from './tetromino/pool.js';
import {
	showDropAnimation,
	showExplosionAnimation,
	showSandDissolveFallAnimation,
	showPlacementEffect,
	highlightClearedLines,
	highlightClearedRows,
} from './tetromino/animations.js';
import {
	hasPathToKing,
	updatePathVisualization,
	highlightPathToKing,
	animateWithPathVisualization,
	installAnimationHook,
} from './tetromino/pathViz.js';
import {
	checkTetrominoCollision,
	isValidTetrominoPosition,
	isTetrominoAdjacentToExistingCells,
} from './tetromino/validation.js';
import {
	createTetrominoBlock,
	createTetrominoMesh,
	renderTetromino,
	cleanupCurrentTetromino,
	cleanupGhostPiece,
	synchronizeCenterPositions,
	preloadTetrominoBlocks,
} from './tetromino/rendering.js';
import {
	updateNextTetrominoDisplay,
	updateNextPieceHint,
	setStartTetrisPhaseHandler,
} from './tetromino/nextPiece.js';
import {
	determineInitialTetrominoPosition,
	initializeNewTetromino,
	initializeNextTetromino,
} from './tetromino/spawn.js';
import { sendTetrominoPlacementToServer, initializeTetrominoSocketListeners } from './tetromino/network.js';
import {
	setGameStateRef,
	queueTetrominoMovement,
	moveTetrominoX,
	moveTetrominoZ,
	moveTetrominoY,
	rotateTetromino,
	hardDropTetromino,
	cleanupTetrominoAndTransitionToChess,
	enhancedPlaceTetromino,
	MOVEMENT_TYPES,
	FAILURE_EFFECTS,
} from './tetromino/movementQueue.js';

setGameStateRef(gameState);
installAnimationHook();

// Movement helper used by the legacy input layer: a Z-axis "horizontal"
// move expressed as `moveTetrominoForwardBack(dir)`.
function moveTetrominoForwardBack(dir) {
	return moveTetrominoZ(dir);
}

// The HUD widget calls back into the spawn pipeline when the player
// clicks "Next piece" during the chess phase.  Wire it up here so the
// HUD module stays free of game-state side effects.
setStartTetrisPhaseHandler((state) => {
	state.turnPhase = 'tetris';
	if (typeof window.updateGameStatusDisplay === 'function') window.updateGameStatusDisplay();
	updateNextPieceHint(state);

	const spawned = initializeNextTetromino(state);
	if (!spawned) {
		console.log('Tetromino: No current tetromino found, returning');
		return;
	}
	state.currentTetromino = spawned;

	renderTetromino(state);
	if (typeof state.handleTurnPhaseChange === 'function') state.handleTurnPhaseChange('tetris');

	if (state.renderer && state.camera && state.scene) {
		state.renderer.render(state.scene, state.camera);
	} else if (typeof state.renderScene === 'function') {
		state.renderScene();
	}
});

// ── Legacy single-step movement (no queue) ─────────────────────────────
// Used by direct callers (e.g., input fallbacks); behaves identically to
// the pre-refactor `moveTetrominoHorizontal`.
export function moveTetrominoHorizontal(dir, isXAxis = true) {
	if (!gameState || !gameState.currentTetromino) return false;
	if (gameState.turnPhase !== 'tetris') return false;
	if (gameState.isProcessingHardDrop) return false;
	if (gameState.isMovingTetromino) return false;
	gameState.isMovingTetromino = true;

	try {
		const newPos = {
			x: isXAxis ? gameState.currentTetromino.position.x + dir : gameState.currentTetromino.position.x,
			z: isXAxis ? gameState.currentTetromino.position.z : gameState.currentTetromino.position.z + dir,
		};

		// Near the board, refuse to move into a non-adjacent cell so the
		// next vertical step can trigger the "dissolved into sand" effect
		// rather than silently sliding off the board.
		if (gameState.currentTetromino.heightAboveBoard <= 1) {
			const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
				gameState, gameState.currentTetromino.shape, newPos.x, newPos.z,
			);
			if (!isAdjacent) {
				console.log(
					`Horizontal move rejected - tetromino at Y=${gameState.currentTetromino.heightAboveBoard} `
					+ 'is not adjacent to any cells at new position',
				);
				setTimeout(() => {
					if (!gameState.currentTetromino) return;
					cleanupTetrominoAndTransitionToChess(
						gameState,
						'Missed connection - tetromino dissolved into sand.',
						gameState.currentTetromino.position.x,
						gameState.currentTetromino.position.z,
						FAILURE_EFFECTS.DISSOLVE_FALL,
					);
				}, 0);
				return false;
			}
		}

		gameState.currentTetromino.position = newPos;

		if (gameState.currentTetrominoShapeGroup) {
			const absPos = translatePosition(newPos, gameState, true);
			gameState.currentTetrominoShapeGroup.position.x = absPos.x;
			gameState.currentTetrominoShapeGroup.position.z = absPos.z;
		} else {
			renderTetromino(gameState);
		}
		return true;
	} catch (error) {
		console.error('Error in moveTetrominoHorizontal:', error);
		return false;
	} finally {
		gameState.isMovingTetromino = false;
	}
}

// ── Re-exports ─────────────────────────────────────────────────────────

export {
	tetrominoPool,
	showDropAnimation,
	showExplosionAnimation,
	showSandDissolveFallAnimation,
	showPlacementEffect,
	highlightClearedLines,
	highlightClearedRows,
	hasPathToKing,
	updatePathVisualization,
	highlightPathToKing,
	animateWithPathVisualization,
	checkTetrominoCollision,
	isValidTetrominoPosition,
	isTetrominoAdjacentToExistingCells,
	createTetrominoBlock,
	createTetrominoMesh,
	renderTetromino,
	cleanupCurrentTetromino,
	cleanupGhostPiece,
	synchronizeCenterPositions,
	preloadTetrominoBlocks,
	updateNextTetrominoDisplay,
	updateNextPieceHint,
	determineInitialTetrominoPosition,
	initializeNewTetromino,
	initializeNextTetromino,
	sendTetrominoPlacementToServer,
	initializeTetrominoSocketListeners,
	queueTetrominoMovement,
	moveTetrominoX,
	moveTetrominoZ,
	moveTetrominoY,
	moveTetrominoForwardBack,
	rotateTetromino,
	hardDropTetromino,
	cleanupTetrominoAndTransitionToChess,
	enhancedPlaceTetromino,
	MOVEMENT_TYPES,
	FAILURE_EFFECTS,
};

export const tetrominoModule = Object.freeze({
	moveTetrominoX,
	moveTetrominoZ,
	moveTetrominoY,
	moveTetrominoForwardBack,
	moveTetrominoHorizontal,
	rotateTetromino,
	hardDropTetromino,
	enhancedPlaceTetromino,
	queueTetrominoMovement,
	cleanupTetrominoAndTransitionToChess,
	showPlacementEffect,
	showDropAnimation,
	showExplosionAnimation,
	showSandDissolveFallAnimation,
	highlightClearedLines,
	highlightClearedRows,
	createTetrominoBlock,
	createTetrominoMesh,
	renderTetromino,
	cleanupCurrentTetromino,
	cleanupGhostPiece,
	determineInitialTetrominoPosition,
	initializeNewTetromino,
	initializeNextTetromino,
	updateNextTetrominoDisplay,
	updateNextPieceHint,
	preloadTetrominoBlocks,
	isTetrominoAdjacentToExistingCells,
	isValidTetrominoPosition,
	checkTetrominoCollision,
	hasPathToKing,
	updatePathVisualization,
	highlightPathToKing,
	sendTetrominoPlacementToServer,
	synchronizeCenterPositions,
	initializeTetrominoSocketListeners,
});
