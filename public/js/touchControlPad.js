/**
 * Touch control pad — on-screen arrow + rotate + drop buttons that
 * appear only on touch-capable devices during the tetris phase.
 *
 * Why: swipe gestures are great for power users but invisible to
 * first-time mobile players. The pad makes the controls discoverable
 * and gives a reliable fallback when a swipe gets mis-detected on a
 * small screen.
 *
 * Layout (anchored bottom-centre, safe-area aware):
 *   ┌──────────────────────────────┐
 *   │      ▲                       │
 *   │  ◀   ▼   ▶     ⟳    ⬇        │
 *   └──────────────────────────────┘
 *
 * The pad is hidden during chess phase and on non-touch devices.
 */

import { getGameState } from './gameContext.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { playSound } from './audio/soundManager.js';

const PAD_ID = 'touch-control-pad';
let attached = false;
let visibilityTimer = null;

// ── Direction resolution ────────────────────────────────────────────────────

/**
 * Resolve a logical direction ("left" / "right" / "up" / "down") to
 * the (dx, dz) tetromino delta that "feels" right from the local
 * player's perspective. Mirrors the same orientation table used by
 * the keyboard and swipe handlers so all three control surfaces
 * agree.
 */
function resolveDirection(key) {
	const gameState = getGameState();
	if (!gameState || !gameState.currentTetromino) return null;

	let orientation = gameState.orientation || 0;
	const kingPiece = boardFunctions.getPlayersKing(
		gameState, gameState.currentPlayer, false
	);
	if (kingPiece && Number.isFinite(kingPiece.orientation)) {
		orientation = kingPiece.orientation;
	}

	const MOVE_MAP = {
		left:  [[ 1, 0], [0, -1], [-1, 0], [0,  1]],
		right: [[-1, 0], [0,  1], [ 1, 0], [0, -1]],
		down:  [[0, -1], [-1, 0], [0,  1], [1,  0]],
		up:    [[0,  1], [ 1, 0], [0, -1], [-1, 0]],
	};
	const entry = MOVE_MAP[key];
	if (!entry) return null;
	return entry[orientation] || entry[0];
}

function moveDir(key) {
	const dir = resolveDirection(key);
	if (!dir) return;
	if (dir[0] !== 0) tetrominoModule.moveTetrominoX(dir[0]);
	if (dir[1] !== 0) tetrominoModule.moveTetrominoZ(dir[1]);
	try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
}

function rotate() {
	const gameState = getGameState();
	if (!gameState || !gameState.currentTetromino) return;
	tetrominoModule.rotateTetromino(1);
	try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
}

function hardDrop() {
	const gameState = getGameState();
	if (!gameState || !gameState.currentTetromino) return;
	tetrominoModule.hardDropTetromino();
	try { playSound('hardDrop'); } catch (_e) { /* sound is best-effort */ }
}

// ── DOM ─────────────────────────────────────────────────────────────────────

function makeButton(label, title, handler) {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.textContent = label;
	btn.title = title;
	btn.setAttribute('aria-label', title);
	Object.assign(btn.style, {
		width: '52px',
		height: '52px',
		fontSize: '22px',
		lineHeight: '1',
		border: '1px solid rgba(255, 204, 0, 0.55)',
		borderRadius: '10px',
		background: 'rgba(0, 0, 0, 0.55)',
		color: '#ffcc00',
		cursor: 'pointer',
		userSelect: 'none',
		WebkitTapHighlightColor: 'transparent',
		touchAction: 'manipulation',
	});
	// `touchstart` for snappy response; click as a fallback for
	// hybrid devices (e.g. iPad with a trackpad).
	const fire = (e) => {
		e.preventDefault();
		e.stopPropagation();
		try { handler(); } catch (err) { console.warn('touch pad action failed', err); }
	};
	btn.addEventListener('touchstart', fire, { passive: false });
	btn.addEventListener('click', fire);
	return btn;
}

function buildPad() {
	const pad = document.createElement('div');
	pad.id = PAD_ID;
	Object.assign(pad.style, {
		position: 'fixed',
		left: '50%',
		bottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
		transform: 'translateX(-50%)',
		// Sit above the canvas (z=1) and the title HUD, but below
		// any modal/tutorial overlay (z=1000+) and the activity
		// log panel (z=11500). Bottom-centre placement means we
		// don't visually collide with the next-piece HUD even
		// though both share the ~950 stacking band.
		zIndex: '950',
		display: 'none',
		gridTemplateColumns: 'repeat(3, auto) 12px auto auto',
		gridTemplateRows: 'auto auto',
		alignItems: 'center',
		justifyItems: 'center',
		columnGap: '6px',
		rowGap: '6px',
		padding: '10px 14px',
		background: 'rgba(10, 10, 14, 0.7)',
		border: '1px solid rgba(255, 204, 0, 0.4)',
		borderRadius: '14px',
		boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
		pointerEvents: 'auto',
	});

	// Row 1: spacer | up | spacer | spacer | rotate | drop
	const empty1 = document.createElement('span');
	const up = makeButton('▲', 'Move up', () => moveDir('up'));
	const empty2 = document.createElement('span');
	const empty3 = document.createElement('span');
	const rotateBtn = makeButton('⟳', 'Rotate', rotate);
	const dropBtn = makeButton('⬇', 'Hard drop', hardDrop);
	dropBtn.style.borderColor = '#ff7a00';
	dropBtn.style.color = '#ffcc00';

	// Row 2: left | down | right | spacer | (rotate spans both rows visually with rowSpan)
	const left = makeButton('◀', 'Move left', () => moveDir('left'));
	const down = makeButton('▼', 'Move down', () => moveDir('down'));
	const right = makeButton('▶', 'Move right', () => moveDir('right'));

	// Grid placement.
	empty1.style.gridArea = '1 / 1';
	up.style.gridArea = '1 / 2';
	empty2.style.gridArea = '1 / 3';
	empty3.style.gridArea = '1 / 4';
	rotateBtn.style.gridArea = '1 / 5 / span 2 / span 1';
	dropBtn.style.gridArea = '1 / 6 / span 2 / span 1';
	left.style.gridArea = '2 / 1';
	down.style.gridArea = '2 / 2';
	right.style.gridArea = '2 / 3';

	pad.style.display = 'grid';
	pad.style.visibility = 'hidden'; // toggled by showPad/hidePad
	pad.append(empty1, up, empty2, empty3, rotateBtn, dropBtn, left, down, right);

	document.body.appendChild(pad);
	return pad;
}

function getPad() {
	return document.getElementById(PAD_ID) || buildPad();
}

function showPad() {
	const pad = getPad();
	pad.style.visibility = 'visible';
}

function hidePad() {
	const pad = document.getElementById(PAD_ID);
	if (pad) pad.style.visibility = 'hidden';
}

/**
 * `true` when a tutorial / dialogue / join overlay is on screen
 * and is blocking interaction with the canvas. The pad would
 * otherwise float on top of the canvas (correct) which also means
 * sitting next to whatever the modal is asking the user to do —
 * confusing in screenshots and worse on a phone where the pad's
 * buttons live right where the modal's CTA usually is.
 */
function isBlockingOverlayVisible() {
	const overlay = document.getElementById('tutorial-message');
	if (overlay && overlay.offsetParent !== null) return true;
	const loading = document.getElementById('loading');
	if (loading && loading.offsetParent !== null && loading.style.display !== 'none') return true;
	return false;
}

function tick() {
	const gameState = getGameState();
	const inTetris = !!(gameState && gameState.turnPhase === 'tetris' && gameState.currentTetromino);
	if (inTetris && !isBlockingOverlayVisible()) showPad();
	else hidePad();
}

// ── Device detection ────────────────────────────────────────────────────────

/**
 * Decide whether the running device benefits from an on-screen
 * control pad. We err on the side of *showing* it — touch laptops
 * and tablets both win, and a desktop user can dismiss it with the
 * close button if they want to.
 */
function isTouchCapable() {
	if (typeof window === 'undefined') return false;
	if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
	if ('ontouchstart' in window) return true;
	if (navigator && navigator.maxTouchPoints > 0) return true;
	return false;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function setupTouchControlPad() {
	if (attached) return;
	if (!isTouchCapable()) return;
	attached = true;
	buildPad();
	// Poll the phase so the pad shows/hides without the gameLoop
	// having to know about it. 250 ms is well under human reaction
	// time and tiny next to a tetris fall tick.
	if (visibilityTimer) clearInterval(visibilityTimer);
	visibilityTimer = setInterval(tick, 250);
}

export function teardownTouchControlPad() {
	if (visibilityTimer) {
		clearInterval(visibilityTimer);
		visibilityTimer = null;
	}
	const pad = document.getElementById(PAD_ID);
	if (pad && pad.parentNode) pad.parentNode.removeChild(pad);
	attached = false;
}
