/**
 * Input Manager Module
 *
 * Keyboard, mouse, and touch input handlers for the game.
 */

import {
	getTHREE, getGameState,
	getContainerElement, getRenderer, getMouse, getControls,
	setMouse
} from './gameContext.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { performRaycast } from './chessInteraction.js';
import { showToastMessage } from './showToastMessage.js';

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

	document.addEventListener('keydown', handleKeyDown);

	document.addEventListener('click', function (e) {
		if (!renderer || !renderer.domElement || !getMouse()) return;

		const canvasRect = renderer.domElement.getBoundingClientRect();
		const inCanvas = e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
			e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom;

		if (inCanvas) {
			const target = e.target;
			const isUIElement = target.closest('button, input, select, a, .player-list-container, #loading, .tutorial-message');
			if (isUIElement) return;
			if (gameState.turnPhase !== 'chess') return;

			const m = getMouse();
			m.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
			m.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

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
}

// ── Keyboard ────────────────────────────────────────────────────────────────

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
		const dir = moveEntry[orientation] || moveEntry[0];
		if (dir[0] !== 0) tetrominoModule.moveTetrominoX(dir[0]);
		if (dir[1] !== 0) tetrominoModule.moveTetrominoZ(dir[1]);
		return;
	}

	switch (event.key) {
		case 'z': case 'Z':
			tetrominoModule.rotateTetromino(-1);
			break;
		case 'x': case 'X':
			tetrominoModule.rotateTetromino(1);
			break;
		case ' ':
			event.preventDefault();
			tetrominoModule.hardDropTetromino();
			break;
	}
}

// ── Mouse ───────────────────────────────────────────────────────────────────

function handleMouseDown(event) {
	const containerElement = getContainerElement();
	const mouse = getMouse();
	const renderer = getRenderer();
	const gameState = getGameState();

	if (!containerElement || !mouse) return;

	try {
		const rect = renderer && renderer.domElement
			? renderer.domElement.getBoundingClientRect()
			: containerElement.getBoundingClientRect();

		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		if (gameState.processingMove) return;
		performRaycast();
	} catch (error) {
		console.warn("Error in handleMouseDown:", error);
	}
}

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
