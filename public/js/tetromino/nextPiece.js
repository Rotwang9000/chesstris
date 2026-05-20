/**
 * "Next piece" HUD widget — a small canvas in the top-right that
 * previews the upcoming tetromino and also acts as the
 * "click to start the tetris phase" affordance.
 *
 * All DOM is created lazily on first use and re-used afterwards.  The
 * widget needs an `onStartTetrisPhase` callback so it can stay
 * independent of the wider game-state side effects (rendering,
 * pulling the next piece, …).
 */

import { getShape, getColourCss } from './shapes.js';

const HUD_ID = 'next-tetromino-display';
const CANVAS_ID = 'next-tetromino-canvas';
const HINT_ID = 'next-piece-hint';
const CONTROLS_ID = 'tetromino-controls-hint';

let _onStartTetrisPhase = null;

export function setStartTetrisPhaseHandler(fn) {
	_onStartTetrisPhase = typeof fn === 'function' ? fn : null;
}

function createWidget() {
	const widget = document.createElement('div');
	widget.id = HUD_ID;
	widget.setAttribute('role', 'button');
	widget.setAttribute('aria-label', 'Next piece: click to start tetris turn');
	widget.tabIndex = 0;
	Object.assign(widget.style, {
		position: 'fixed', top: '20px', right: '20px',
		zIndex: '1000',
		background: 'rgba(0, 0, 0, 0.7)',
		padding: '10px', borderRadius: '5px',
		fontFamily: 'Arial, sans-serif',
		color: 'white',
		userSelect: 'none',
		pointerEvents: 'auto',
		cursor: 'pointer',
	});

	const title = document.createElement('div');
	title.textContent = 'NEXT PIECE';
	title.style.cssText = 'text-align:center; margin-bottom:5px; font-weight:bold;';
	widget.appendChild(title);

	const canvas = document.createElement('canvas');
	canvas.id = CANVAS_ID;
	canvas.width = 80;
	canvas.height = 80;
	widget.appendChild(canvas);

	const hint = document.createElement('div');
	hint.id = HINT_ID;
	hint.textContent = 'Click to play';
	hint.style.cssText = 'text-align:center; font-size:10px; margin-top:5px; opacity:0.7;';
	widget.appendChild(hint);

	const controls = document.createElement('div');
	controls.id = CONTROLS_ID;
	controls.style.cssText = [
		'margin-top: 8px',
		'padding-top: 6px',
		'border-top: 1px solid rgba(255, 255, 255, 0.2)',
		'font-size: 10px',
		'line-height: 1.4',
		'color: #ddd',
		'text-align: left',
	].join(';');
	controls.innerHTML = [
		'<div style="font-weight:bold;color:#ffcc00;margin-bottom:3px;">Controls</div>',
		'<div><kbd style="background:#222;border:1px solid #555;padding:0 4px;border-radius:3px;">\u2190\u2192\u2191\u2193</kbd> move</div>',
		'<div><kbd style="background:#222;border:1px solid #555;padding:0 4px;border-radius:3px;">Z</kbd> / <kbd style="background:#222;border:1px solid #555;padding:0 4px;border-radius:3px;">X</kbd> rotate (\u21B7)</div>',
		'<div><kbd style="background:#222;border:1px solid #555;padding:0 4px;border-radius:3px;">Space</kbd> drop</div>',
	].join('');
	widget.appendChild(controls);

	widget.addEventListener('click', onClick);
	widget.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onClick(event);
		}
	});
	widget.addEventListener('mouseenter', () => {
		widget.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
	});
	widget.addEventListener('mouseleave', () => {
		widget.style.boxShadow = 'none';
	});

	document.body.appendChild(widget);
	return widget;
}

function drawPreview(canvas, shape, colour) {
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	const blockSize = 15;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const offsetX = (canvas.width - shape[0].length * blockSize) / 2;
	const offsetY = (canvas.height - shape.length * blockSize) / 2;

	ctx.fillStyle = colour;
	ctx.strokeStyle = '#FFFFFF';
	ctx.lineWidth = 1;

	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x] !== 1) continue;
			const blockX = offsetX + x * blockSize;
			const blockY = offsetY + y * blockSize;
			ctx.fillRect(blockX, blockY, blockSize, blockSize);
			ctx.strokeRect(blockX, blockY, blockSize, blockSize);
			ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
			ctx.fillRect(blockX, blockY, blockSize, blockSize / 3);
			ctx.fillStyle = colour;
		}
	}
}

export function updateNextTetrominoDisplay(tetrominoType, gameState) {
	let widget = document.getElementById(HUD_ID);
	if (!widget) widget = createWidget();

	if (gameState) {
		widget.gameState = gameState;
		updateNextPieceHint(gameState);
	}

	drawPreview(
		document.getElementById(CANVAS_ID),
		getShape(tetrominoType),
		getColourCss(tetrominoType),
	);
}

export function updateNextPieceHint(gameState) {
	const hint = document.getElementById(HINT_ID);
	if (!hint) return;

	if (gameState && gameState.turnPhase === 'chess') {
		hint.textContent = 'Click to start tetris turn';
		hint.style.color = '#4CAF50';
		hint.style.opacity = '1';
	} else {
		hint.textContent = 'Playing tetris turn — Z/X to rotate';
		hint.style.color = '#FFA500';
		hint.style.opacity = '0.9';
		showFirstDropRotationHint();
	}

	const widget = document.getElementById(HUD_ID);
	if (widget) {
		widget.setAttribute(
			'aria-label',
			gameState && gameState.turnPhase === 'chess'
				? 'Next piece: click to start tetris turn'
				: 'Next piece: tetris turn active',
		);
	}
}

const FIRST_DROP_HINT_KEY = 'shaktris_seen_rotation_hint_v1';
let firstDropHintShown = false;
function showFirstDropRotationHint() {
	if (firstDropHintShown) return;
	try {
		if (window.localStorage && window.localStorage.getItem(FIRST_DROP_HINT_KEY)) {
			firstDropHintShown = true;
			return;
		}
	} catch (_) {
		// localStorage might be blocked; just show it once per page load.
	}
	firstDropHintShown = true;

	const banner = document.createElement('div');
	banner.id = 'rotation-hint-banner';
	banner.innerHTML = `
		<div style="font-weight:bold;color:#ffcc00;margin-bottom:6px;">Tip</div>
		<div>Press <kbd style="background:#222;border:1px solid #777;padding:0 4px;border-radius:3px;">Z</kbd>
			or <kbd style="background:#222;border:1px solid #777;padding:0 4px;border-radius:3px;">X</kbd>
			to rotate the tetromino while it's falling.</div>
		<div style="font-size:11px;margin-top:6px;opacity:0.7;">Click anywhere to dismiss</div>
	`;
	Object.assign(banner.style, {
		position: 'fixed',
		bottom: '90px',
		left: '50%',
		transform: 'translateX(-50%)',
		background: 'rgba(0, 0, 0, 0.85)',
		color: '#eee',
		padding: '14px 20px',
		border: '2px solid #ffcc00',
		borderRadius: '8px',
		fontFamily: 'Playfair Display, Times New Roman, serif',
		fontSize: '14px',
		zIndex: '11700',
		boxShadow: '0 0 24px rgba(255, 204, 0, 0.4)',
		textAlign: 'center',
		maxWidth: '420px',
		cursor: 'pointer',
		animation: 'shaktris-fade-in 280ms ease-out',
	});
	const dismiss = () => {
		try { if (window.localStorage) window.localStorage.setItem(FIRST_DROP_HINT_KEY, '1'); } catch (_) {}
		banner.style.transition = 'opacity 250ms ease';
		banner.style.opacity = '0';
		setTimeout(() => banner.remove(), 260);
		document.removeEventListener('keydown', onKey, true);
		document.removeEventListener('click', dismiss, true);
	};
	const onKey = (e) => {
		if (['z', 'Z', 'x', 'X', 'r', 'R', 'q', 'Q', 'e', 'E', 'Escape'].includes(e.key)) dismiss();
	};
	banner.addEventListener('click', dismiss);
	document.addEventListener('keydown', onKey, true);
	document.addEventListener('click', dismiss, true);
	document.body.appendChild(banner);

	setTimeout(() => { if (banner.parentNode) dismiss(); }, 10000);
}

function flashWaitMessage(text) {
	const note = document.createElement('div');
	note.textContent = text;
	Object.assign(note.style, {
		position: 'fixed', top: '50%', left: '50%',
		transform: 'translate(-50%, -50%)',
		background: 'rgba(0, 0, 0, 0.5)', color: 'white',
		padding: '10px', borderRadius: '5px',
		zIndex: '1000', fontFamily: 'Arial, sans-serif', fontSize: '20px',
	});
	document.body.appendChild(note);
	setTimeout(() => note.remove(), 2500);
}

function onClick(event) {
	const widget = document.getElementById(HUD_ID);
	const gameState = widget && widget.gameState;

	if (!gameState) {
		console.error('No gameState available for next piece click handler');
		return;
	}

	if (gameState.turnPhase !== 'chess') {
		console.log('Next piece click ignored (not in chess phase):', gameState.turnPhase);
		flashWaitMessage('Finish your tetris drop first');
		updateNextPieceHint(gameState);
		try { event?.stopPropagation?.(); } catch (_) {}
		try { event?.preventDefault?.(); } catch (_) {}
		return;
	}

	if (widget) {
		widget.style.transform = 'scale(0.95)';
		setTimeout(() => { widget.style.transform = 'scale(1)'; }, 100);
	}

	try { event?.stopPropagation?.(); } catch (_) {}
	if (_onStartTetrisPhase) _onStartTetrisPhase(gameState);
}
