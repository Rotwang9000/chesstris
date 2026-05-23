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

let attached = false;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let lastTapTime = 0;
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
	// Long-press hard-drop was retired in favour of double-tap drop;
	// keep the helper as a stub so the older call-sites keep working
	// in case anyone is wiring it via dynamic import.
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
	clearLongPress();
}

function onTouchMove(event) {
	if (twoFingerActive) return;
	if (event.touches.length !== 1) return;
	// We don't need to do anything per-frame: the tap-vs-swipe
	// decision is made on touchend using the start/end vector.
	void event;
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
