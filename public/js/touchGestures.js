/**
 * Touch-gesture support for the tetromino phase.
 *
 * The existing touch handlers in `inputManager.js` cover chess
 * piece selection via raycast. This module adds the missing piece:
 * gesture-driven control of the falling tetromino so a phone-only
 * player can shift, rotate, and hard-drop without using the
 * keyboard.
 *
 * Gestures (tetris phase only):
 *   • Single tap (short, no drift)  — rotate clockwise.
 *   • Double-tap (<300 ms apart)    — hard drop.
 *   • Swipe horizontal (>40 px)     — moveTetrominoX in that direction.
 *   • Swipe vertical (>40 px)       — moveTetrominoZ in that direction.
 *   • Two-finger tap                — rotate counter-clockwise (chord).
 *   • Long-press + drag             — drag the falling piece around
 *                                     while it keeps falling at the
 *                                     normal rate.
 *
 * Outside of the tetris phase, taps fall through to the existing
 * chess-raycast handler so single-finger taps still select pieces.
 *
 * Tap / swipe coordinates are in screen space; we don't need to map
 * them to board space because the tetromino reacts to relative
 * deltas only.
 */

import { getGameState, getContainerElement } from './gameContext.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { playSound } from './audio/soundManager.js';

const SWIPE_THRESHOLD_PX = 40;
const DOUBLE_TAP_MS = 300;
const TAP_DRIFT_THRESHOLD_PX = 12;

// How long the finger must stay (mostly) still before the gesture
// promotes from "potential tap/swipe" to "drag the falling piece".
const LONG_PRESS_MS = 280;
// Finger pixels per board cell during drag. Smaller = piece tracks
// finger more eagerly; larger = more deliberate moves.
const DRAG_PX_PER_CELL = 32;
// Maximum drift allowed during the long-press wait before we abort
// the drag intent (the user is clearly swiping instead).
const LONG_PRESS_DRIFT_LIMIT_PX = 14;

let attached = false;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let lastTapTime = 0;
let gestureConsumed = false;
let twoFingerActive = false;

let longPressTimer = null;
let dragActive = false;
let dragOriginX = 0;
let dragOriginY = 0;
let dragStepsX = 0;
let dragStepsZ = 0;
let dragOrientation = 0;

/**
 * Translate a screen-space swipe vector into a board-space step,
 * using the local king's facing to keep the gesture intuitive.
 *
 * @param {number} dx
 * @param {number} dy
 */
function applySwipe(dx, dy) {
	const gameState = getGameState();
	if (!gameState || !gameState.currentTetromino) return false;

	let orientation = gameState.orientation || 0;
	const kingPiece = boardFunctions.getPlayersKing(gameState, gameState.currentPlayer, false);
	if (kingPiece && Number.isFinite(kingPiece.orientation)) orientation = kingPiece.orientation;

	// Same MOVE_MAP idea as the keyboard handler.
	const MOVE_MAP = {
		left:  [[ 1, 0], [0, -1], [-1, 0], [0,  1]],
		right: [[-1, 0], [0,  1], [ 1, 0], [0, -1]],
		down:  [[0, -1], [-1, 0], [0,  1], [1,  0]],
		up:    [[0,  1], [ 1, 0], [0, -1], [-1, 0]],
	};

	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);
	if (absDx < SWIPE_THRESHOLD_PX && absDy < SWIPE_THRESHOLD_PX) return false;

	const key = absDx >= absDy
		? (dx > 0 ? 'right' : 'left')
		: (dy > 0 ? 'down' : 'up');

	const entry = MOVE_MAP[key];
	const dir = entry[orientation] || entry[0];
	if (dir[0] !== 0) tetrominoModule.moveTetrominoX(dir[0]);
	if (dir[1] !== 0) tetrominoModule.moveTetrominoZ(dir[1]);
	try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
	return true;
}

function clearLongPress() {
	if (longPressTimer) {
		clearTimeout(longPressTimer);
		longPressTimer = null;
	}
}

/**
 * Read the player-facing orientation so left/right/forward/back map
 * to "intuitive from where the king is sitting".
 */
function readDragOrientation(gameState) {
	let orientation = gameState?.orientation || 0;
	const kingPiece = boardFunctions.getPlayersKing(gameState, gameState?.currentPlayer, false);
	if (kingPiece && Number.isFinite(kingPiece.orientation)) orientation = kingPiece.orientation;
	return orientation;
}

/**
 * Translate (screenDx, screenDy) into a board-space (xStep, zStep)
 * for the local player's view, using the same MOVE_MAP convention
 * the swipe handler does.
 */
function screenDeltaToBoardSteps(orientation, screenDx, screenDy) {
	const cellsX = Math.trunc(screenDx / DRAG_PX_PER_CELL);
	const cellsY = Math.trunc(screenDy / DRAG_PX_PER_CELL);

	// MOVE_MAP entry shape: [[dx, dz], ...] indexed by orientation.
	const MOVE_MAP = {
		right: [[-1, 0], [0,  1], [ 1, 0], [0, -1]],
		left:  [[ 1, 0], [0, -1], [-1, 0], [0,  1]],
		down:  [[0, -1], [-1, 0], [0,  1], [1,  0]],
		up:    [[0,  1], [ 1, 0], [0, -1], [-1, 0]],
	};

	const horizDir = cellsX >= 0 ? 'right' : 'left';
	const vertDir = cellsY >= 0 ? 'down' : 'up';

	const horizUnit = MOVE_MAP[horizDir][orientation] || MOVE_MAP[horizDir][0];
	const vertUnit = MOVE_MAP[vertDir][orientation] || MOVE_MAP[vertDir][0];

	const cellsHoriz = Math.abs(cellsX);
	const cellsVert = Math.abs(cellsY);

	return {
		xSteps: horizUnit[0] * cellsHoriz + vertUnit[0] * cellsVert,
		zSteps: horizUnit[1] * cellsHoriz + vertUnit[1] * cellsVert,
	};
}

/**
 * Try to begin drag mode. Called from the long-press timer.
 */
function beginDrag() {
	longPressTimer = null;
	const gameState = getGameState();
	if (!gameState || gameState.turnPhase !== 'tetris' || !gameState.currentTetromino) {
		return;
	}
	dragActive = true;
	dragOriginX = touchStartX;
	dragOriginY = touchStartY;
	dragStepsX = 0;
	dragStepsZ = 0;
	dragOrientation = readDragOrientation(gameState);
	gestureConsumed = true;
	try { navigator.vibrate && navigator.vibrate(20); } catch (_e) { /* haptics best-effort */ }
}

/**
 * Step the tetromino so the cumulative (xSteps, zSteps) deltas
 * since drag start match `target`. Returns true if anything was
 * applied.
 */
function applyDragSteps(target) {
	if (!dragActive) return false;
	const gameState = getGameState();
	if (!gameState || !gameState.currentTetromino) return false;

	let xDelta = target.xSteps - dragStepsX;
	let zDelta = target.zSteps - dragStepsZ;
	if (xDelta === 0 && zDelta === 0) return false;

	// Limit per-event steps so a fast flick doesn't queue up hundreds
	// of moves that fight the move-validator.
	const MAX_STEPS = 4;
	const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

	let appliedX = 0;
	let appliedZ = 0;
	while (Math.abs(xDelta) + Math.abs(zDelta) > 0 && (appliedX + appliedZ) < MAX_STEPS) {
		if (Math.abs(xDelta) >= Math.abs(zDelta) && xDelta !== 0) {
			const step = sign(xDelta);
			tetrominoModule.moveTetrominoX(step);
			xDelta -= step;
			dragStepsX += step;
			appliedX++;
		} else if (zDelta !== 0) {
			const step = sign(zDelta);
			tetrominoModule.moveTetrominoZ(step);
			zDelta -= step;
			dragStepsZ += step;
			appliedZ++;
		} else {
			break;
		}
	}

	if (appliedX + appliedZ > 0) {
		try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
	}
	return appliedX + appliedZ > 0;
}

function onTouchStart(event) {
	const gameState = getGameState();
	// Two-finger gesture: rotate counter-clockwise on the second
	// finger landing, then ignore further moves until release.
	if (event.touches.length === 2 && gameState?.turnPhase === 'tetris' && gameState.currentTetromino) {
		twoFingerActive = true;
		gestureConsumed = true;
		dragActive = false;
		clearLongPress();
		tetrominoModule.rotateTetromino(-1);
		try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
		event.preventDefault();
		return;
	}

	if (event.touches.length !== 1) return;
	const t = event.touches[0];
	touchStartX = t.clientX;
	touchStartY = t.clientY;
	touchStartTime = Date.now();
	gestureConsumed = false;
	twoFingerActive = false;
	dragActive = false;
	dragStepsX = 0;
	dragStepsZ = 0;
	clearLongPress();
	// Only arm the long-press → drag timer when we're actually in
	// the tetris phase with a falling piece. Outside of that the
	// rest of the gesture pipeline (chess raycast etc.) needs to
	// stay snappy.
	if (gameState?.turnPhase === 'tetris' && gameState.currentTetromino) {
		longPressTimer = setTimeout(beginDrag, LONG_PRESS_MS);
	}
}

function onTouchMove(event) {
	if (twoFingerActive) return;
	if (event.touches.length !== 1) return;
	const t = event.touches[0];
	const dx = t.clientX - touchStartX;
	const dy = t.clientY - touchStartY;

	if (dragActive) {
		const steps = screenDeltaToBoardSteps(
			dragOrientation,
			t.clientX - dragOriginX,
			t.clientY - dragOriginY,
		);
		if (applyDragSteps(steps)) {
			event.preventDefault();
		}
		return;
	}

	// If the finger has drifted past the long-press tolerance before
	// the timer fires, the user is swiping (or panning) — kill the
	// drag-arm so they don't get a surprise drag a beat later.
	if (longPressTimer && (Math.abs(dx) > LONG_PRESS_DRIFT_LIMIT_PX || Math.abs(dy) > LONG_PRESS_DRIFT_LIMIT_PX)) {
		clearLongPress();
	}
}

function onTouchEnd(event) {
	const gameState = getGameState();
	clearLongPress();
	if (dragActive) {
		dragActive = false;
		gestureConsumed = true;
		event.preventDefault();
		return;
	}
	if (twoFingerActive) {
		twoFingerActive = false;
		return;
	}
	if (gestureConsumed) return;

	const elapsed = Date.now() - touchStartTime;
	const changed = event.changedTouches && event.changedTouches[0];
	if (!changed) return;
	const dx = changed.clientX - touchStartX;
	const dy = changed.clientY - touchStartY;
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	// Swipe?
	if (absDx >= SWIPE_THRESHOLD_PX || absDy >= SWIPE_THRESHOLD_PX) {
		if (gameState?.turnPhase === 'tetris' && gameState.currentTetromino) {
			if (applySwipe(dx, dy)) {
				event.preventDefault();
				gestureConsumed = true;
			}
		}
		return;
	}

	// Tap candidate — check double-tap window.
	if (absDx < TAP_DRIFT_THRESHOLD_PX && absDy < TAP_DRIFT_THRESHOLD_PX && elapsed < 300) {
		const now = Date.now();
		const isDouble = (now - lastTapTime) < DOUBLE_TAP_MS;
		const inTetris = gameState?.turnPhase === 'tetris' && gameState.currentTetromino;

		if (inTetris) {
			if (isDouble) {
				// Double-tap → hard drop.
				tetrominoModule.hardDropTetromino();
				try { playSound('hardDrop'); } catch (_e) { /* sound is best-effort */ }
				event.preventDefault();
				gestureConsumed = true;
				lastTapTime = 0;
			} else {
				// First tap of a potential double. We can't act
				// immediately (need to wait for the second tap),
				// so schedule a single-tap rotate that fires
				// after the double-tap window if no follow-up
				// tap arrives. The double-tap branch above will
				// pre-empt this by resetting `lastTapTime` and
				// marking the gesture consumed before the
				// timer ticks.
				lastTapTime = now;
				const startedAt = now;
				setTimeout(() => {
					if (gestureConsumed) return;
					if (lastTapTime !== startedAt) return;
					const gs = getGameState();
					if (!gs || gs.turnPhase !== 'tetris' || !gs.currentTetromino) return;
					tetrominoModule.rotateTetromino(1);
					try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
					gestureConsumed = true;
				}, DOUBLE_TAP_MS + 10);
			}
			return;
		}

		// Out of tetris phase — let the chess-raycast handler in
		// inputManager.handleTouchStart deal with it (single-tap
		// piece select etc.).
		lastTapTime = now;
	}
}

export function setupTouchGestures() {
	if (attached) return;
	attached = true;
	const container = getContainerElement();
	if (!container) {
		// Defer until container exists — gameContext may not be
		// populated when this is called.
		setTimeout(setupTouchGestures, 500);
		attached = false;
		return;
	}
	// `capture: true` so we get the events before the raycast
	// handler in inputManager. We only call preventDefault when we
	// actually consume the gesture, so the raycast still fires for
	// chess taps.
	container.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
	container.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
	container.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
}
