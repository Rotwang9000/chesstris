/**
 * Touch-gesture support for the tetromino phase.
 *
 * The existing touch handlers in `inputManager.js` cover chess
 * piece selection via raycast. This module adds the missing piece:
 * gesture-driven control of the falling tetromino so a phone-only
 * player can shift, rotate, and hard-drop without using the
 * keyboard.
 *
 * Gestures:
 *   • Tap (short, no drift)       — handled by existing chess code.
 *   • Swipe horizontal (>40 px)   — moveTetrominoX  in that direction.
 *   • Swipe vertical (>40 px)     — moveTetrominoZ  in that direction.
 *   • Double-tap (<300 ms apart)  — rotate clockwise.
 *   • Long-press (>500 ms still)  — hard drop.
 *   • Two-finger tap              — rotate counter-clockwise (chord).
 *
 * Each gesture only fires when `turnPhase === 'tetris'`. Outside of
 * that the events are passed through to the existing chess-raycast
 * handler — single-finger taps on the board still select pieces.
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
const LONG_PRESS_MS = 500;
const TAP_DRIFT_THRESHOLD_PX = 12;

let attached = false;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let lastTapTime = 0;
let longPressTimer = null;
let gestureConsumed = false;
let twoFingerActive = false;

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

function onTouchStart(event) {
	const gameState = getGameState();
	// Two-finger gesture: rotate counter-clockwise on the second
	// finger landing, then ignore further moves until release.
	if (event.touches.length === 2 && gameState?.turnPhase === 'tetris' && gameState.currentTetromino) {
		twoFingerActive = true;
		gestureConsumed = true;
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

	// Set up long-press for hard drop.
	clearLongPress();
	if (gameState?.turnPhase === 'tetris' && gameState.currentTetromino) {
		longPressTimer = setTimeout(() => {
			if (gestureConsumed) return;
			gestureConsumed = true;
			tetrominoModule.hardDropTetromino();
			try { playSound('hardDrop'); } catch (_e) { /* sound is best-effort */ }
		}, LONG_PRESS_MS);
	}
}

function onTouchMove(event) {
	if (twoFingerActive) return;
	if (event.touches.length !== 1) return;
	const t = event.touches[0];
	const dx = t.clientX - touchStartX;
	const dy = t.clientY - touchStartY;

	// If the touch has moved beyond the long-press dead-zone, the
	// long-press is cancelled (this is a swipe in progress).
	if (Math.abs(dx) > TAP_DRIFT_THRESHOLD_PX || Math.abs(dy) > TAP_DRIFT_THRESHOLD_PX) {
		clearLongPress();
	}
}

function onTouchEnd(event) {
	const gameState = getGameState();
	clearLongPress();
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
		lastTapTime = now;
		if (isDouble && gameState?.turnPhase === 'tetris' && gameState.currentTetromino) {
			tetrominoModule.rotateTetromino(1);
			try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
			event.preventDefault();
			gestureConsumed = true;
			lastTapTime = 0;
		}
		// Single-tap falls through to the existing raycast handler
		// (which lives in inputManager.handleTouchStart) so chess
		// piece selection on a tap still works.
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
