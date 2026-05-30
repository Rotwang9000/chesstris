/**
 * Input Manager Module
 *
 * Keyboard, mouse, and touch input handlers for the game.
 */

import {
	getTHREE, getGameState, getCamera,
	getContainerElement, getRenderer, getMouse, getControls,
	setMouse
} from './gameContext.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { isCameraRelativeControls } from './controlSettings.js';
import {
	performRaycast, clearChessSelection, inspectCellAtMouse, tryPriorityChessMoveClick,
} from './chessInteraction.js';
import { showToastMessage } from './showToastMessage.js';
import { playSound, initSoundManager } from './audio/soundManager.js';
import { setupKeyboardChess } from './keyboardChess.js';
import { setupTouchGestures } from './touchGestures.js';
import { setupTouchControlPad } from './touchControlPad.js';

let _onTetrisPhaseClick = null;

/**
 * Register the handler called when the player presses Space in chess phase.
 * This avoids a circular import between inputManager and enhanced-gameCore.
 */
export function setTetrisPhaseClickHandler(fn) {
	_onTetrisPhaseClick = fn;
}

let _updateAxisHelpersVisibility = null;
export function setAxisHelpersVisibilityHandler(fn) {
	_updateAxisHelpersVisibility = fn;
}

// ── Setup ───────────────────────────────────────────────────────────────────

export function setupInputHandlers() {
	const containerElement = getContainerElement();
	const renderer = getRenderer();
	const THREE = getTHREE();
	const gameState = getGameState();
	let mouse = getMouse();

	console.log('Setting up enhanced input handlers...');

	// Web Audio needs a user gesture before it'll play. We let the
	// first keydown / click / touchstart be that gesture by calling
	// initSoundManager (idempotent) from each handler.
	document.addEventListener('keydown', handleKeyDown);
	document.addEventListener('keydown', () => initSoundManager(), { once: true });
	document.addEventListener('click', () => initSoundManager(), { once: true });
	document.addEventListener('touchstart', () => initSoundManager(), { once: true });

	document.addEventListener('click', function (e) {
		if (!renderer || !renderer.domElement || !getMouse()) return;

		const canvasRect = renderer.domElement.getBoundingClientRect();
		const inCanvas = e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
			e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom;

		if (inCanvas) {
			const target = e.target;
			const isUIElement = target.closest('button, input, select, a, .player-list-container, #loading, .tutorial-message');
			if (isUIElement) return;

			const m = getMouse();
			m.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
			m.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

			if (gameState.turnPhase !== 'chess') {
				if (!gameState.processingMove && tryPriorityChessMoveClick(m)) {
					return;
				}
				if (gameState.selectedChessPiece) {
					showToastMessage(
						'Finish your tetromino drop first, or press Escape to deselect your piece.',
						4000,
					);
					return;
				}
				inspectCellAtMouse(m);
				return;
			}

			if (!gameState.processingMove) performRaycast();

			if (gameState.turnPhase === 'chess') {
				e.stopPropagation();
				e.preventDefault();
			}
		}
	}, true);

	if (!containerElement) {
		console.warn("Cannot set up mouse/touch handlers - container element is missing");
		return;
	}

	if (!mouse) {
		mouse = new THREE.Vector2();
		setMouse(mouse);
	}

	containerElement.addEventListener('mousemove', handleMouseMove);

	if (renderer && renderer.domElement) {
		renderer.domElement.style.pointerEvents = 'auto';
	}

	containerElement.addEventListener('touchstart', handleTouchStart, { passive: false });
	containerElement.addEventListener('touchmove', handleTouchMove, { passive: false });
	containerElement.addEventListener('touchend', handleTouchEnd, { passive: false });

	// Keyboard-only chess (Tab/arrows/Enter) and touch-only gestures
	// (swipe / single-tap rotate / double-tap drop) layer cleanly on
	// top of the existing handlers. Each is a no-op if its target
	// phase isn't active, so no further coordination is needed.
	//
	// `setupTouchControlPad` adds an on-screen ◀▲▼▶ ⟳ ⬇ pad for
	// touch-capable devices so mobile players have a discoverable
	// control surface alongside the gestures.
	setupKeyboardChess();
	setupTouchGestures();
	setupTouchControlPad();
}

// ── Keyboard ────────────────────────────────────────────────────────────────

// Desired on-screen direction for each movement key (NDC: +x right, +y up).
const SCREEN_INTENT = {
	ArrowRight: { x: 1, y: 0 },
	ArrowLeft: { x: -1, y: 0 },
	ArrowUp: { x: 0, y: 1 },
	ArrowDown: { x: 0, y: -1 },
};

/**
 * Map a movement key to the board step (±1 on X or Z) that best matches
 * its on-screen direction for the CURRENT camera. Works for any orbit
 * angle by projecting the board's X and Z axes into screen space and
 * picking whichever axis-step points most closely the way the key does.
 *
 * @returns {{x:number, z:number}|null} board step, or null if unavailable
 */
function cameraRelativeStep(key) {
	const intent = SCREEN_INTENT[key];
	if (!intent) return null;
	const THREE = getTHREE();
	const camera = getCamera();
	if (!THREE || !camera) return null;
	try {
		const origin = new THREE.Vector3(0, 0, 0).project(camera);
		const xTip = new THREE.Vector3(1, 0, 0).project(camera);
		const zTip = new THREE.Vector3(0, 0, 1).project(camera);
		// Screen-space deltas for a +1 step along each board axis. NDC y
		// is up-positive, matching SCREEN_INTENT.
		const xScreen = { x: xTip.x - origin.x, y: xTip.y - origin.y };
		const zScreen = { x: zTip.x - origin.x, y: zTip.y - origin.y };

		const candidates = [
			{ step: { x: 1, z: 0 }, s: xScreen },
			{ step: { x: -1, z: 0 }, s: { x: -xScreen.x, y: -xScreen.y } },
			{ step: { x: 0, z: 1 }, s: zScreen },
			{ step: { x: 0, z: -1 }, s: { x: -zScreen.x, y: -zScreen.y } },
		];
		let best = null;
		let bestDot = -Infinity;
		for (const c of candidates) {
			const dot = c.s.x * intent.x + c.s.y * intent.y;
			if (dot > bestDot) { bestDot = dot; best = c.step; }
		}
		// A near-zero best dot means the axis is almost edge-on to the
		// screen (degenerate top-down or grazing angle) — let the caller
		// fall back to the orientation scheme rather than guess.
		return bestDot > 1e-4 ? best : null;
	} catch (_e) {
		return null;
	}
}

function handleKeyDown(event) {
	const gameState = getGameState();

	if (event.key === 'd' && event.ctrlKey) {
		event.preventDefault();
		gameState.debugMode = !gameState.debugMode;
		if (_updateAxisHelpersVisibility) _updateAxisHelpersVisibility();
		if (typeof showToastMessage === 'function') {
			showToastMessage(`Debug mode ${gameState.debugMode ? 'enabled' : 'disabled'}`, 3000);
		}
		return;
	}

	if (event.key === 'Escape') {
		// Always allow Escape to clear chess selection / dismiss the
		// detonate button. This is the universal "get me out" key in
		// case the click flow ever leaves us in a stuck state.
		if (gameState.selectedChessPiece) {
			clearChessSelection();
			event.preventDefault();
			return;
		}
	}

	if (!gameState.currentTetromino) {
		if (event.key === ' ' && gameState.turnPhase === 'chess') {
			event.preventDefault();
			if (_onTetrisPhaseClick) _onTetrisPhaseClick();
			return;
		}
		return;
	}

	if (gameState.turnPhase !== 'tetris') return;

	let orientation = gameState.orientation;
	const currentPlayer = gameState.currentPlayer;
	const kingPiece = boardFunctions.getPlayersKing(gameState, currentPlayer, false);
	if (kingPiece && kingPiece.orientation !== undefined) {
		orientation = kingPiece.orientation;
	}

	/*
	 * Orientation-based movement:
	 * 0 = Facing up, 1 = Right, 2 = Down, 3 = Left
	 */
	const MOVE_MAP = {
		ArrowLeft:  [[ 1, 0], [0, -1], [-1, 0], [0,  1]],
		ArrowRight: [[-1, 0], [0,  1], [ 1, 0], [0, -1]],
		ArrowDown:  [[0, -1], [-1, 0], [0,  1], [1,  0]],
		ArrowUp:    [[0,  1], [ 1, 0], [0, -1], [-1, 0]]
	};

	const moveEntry = MOVE_MAP[event.key];
	if (moveEntry) {
		// Camera-relative controls (opt-in): move the piece in the
		// direction the key points ON SCREEN, regardless of how far the
		// player has orbited the board. Falls back to the fixed
		// orientation scheme if the projection isn't available.
		if (isCameraRelativeControls()) {
			const step = cameraRelativeStep(event.key);
			if (step) {
				if (step.x !== 0) tetrominoModule.moveTetrominoX(step.x);
				if (step.z !== 0) tetrominoModule.moveTetrominoZ(step.z);
				return;
			}
		}
		const dir = moveEntry[orientation] || moveEntry[0];
		if (dir[0] !== 0) tetrominoModule.moveTetrominoX(dir[0]);
		if (dir[1] !== 0) tetrominoModule.moveTetrominoZ(dir[1]);
		return;
	}

	switch (event.key) {
		case 'z': case 'Z':
		case 'q': case 'Q':
			tetrominoModule.rotateTetromino(-1);
			try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
			break;
		case 'x': case 'X':
		case 'r': case 'R':
		case 'e': case 'E':
			tetrominoModule.rotateTetromino(1);
			try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
			break;
		case ' ':
			event.preventDefault();
			tetrominoModule.hardDropTetromino();
			try { playSound('hardDrop'); } catch (_e) { /* sound is best-effort */ }
			break;
	}
}

// ── Mouse ───────────────────────────────────────────────────────────────────

function handleMouseMove(event) {
	const mouse = getMouse();
	const renderer = getRenderer();
	if (!mouse) return;

	try {
		const rect = renderer && renderer.domElement
			? renderer.domElement.getBoundingClientRect()
			: getContainerElement()?.getBoundingClientRect();
		if (!rect) return;
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	} catch (error) {
		console.warn("Error in handleMouseMove:", error);
	}
}

// ── Touch ───────────────────────────────────────────────────────────────────

function handleTouchStart(event) {
	const containerElement = getContainerElement();
	const mouse = getMouse();
	const gameState = getGameState();
	if (!containerElement || !mouse) return;

	try {
		event.preventDefault();
		if (event.touches.length > 0) {
			if (gameState.turnPhase !== 'chess') return;
			const rect = containerElement.getBoundingClientRect();
			mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
			if (!gameState.processingMove) performRaycast();
		}
	} catch (error) {
		console.warn("Error in handleTouchStart:", error);
	}
}

function handleTouchMove(event) {
	const containerElement = getContainerElement();
	const mouse = getMouse();
	if (!containerElement || !mouse) return;

	try {
		if (event.touches.length > 0) {
			const rect = containerElement.getBoundingClientRect();
			mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
		}
	} catch (error) {
		console.warn("Error in handleTouchMove:", error);
	}
}

function handleTouchEnd(_event) {
	const mouse = getMouse();
	if (!mouse) return;
	try {
		mouse.x = -1000;
		mouse.y = -1000;
	} catch (error) {
		console.warn("Error in handleTouchEnd:", error);
	}
}
