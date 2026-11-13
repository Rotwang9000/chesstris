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
import { isTouchPrimary } from '../utils/inputMode.js';
import { avoidRect } from '../showToastMessage.js';

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
	// The panel's look is `#next-tetromino-display` in the UI theme
	// (index.html); only its place on screen is set here.
	Object.assign(widget.style, {
		position: 'fixed', top: '20px', right: '20px',
		zIndex: '1000',
		userSelect: 'none',
		pointerEvents: 'auto',
		cursor: 'pointer',
	});

	const title = document.createElement('div');
	title.className = 'tx-hud-title';
	title.textContent = 'NEXT PIECE';
	widget.appendChild(title);

	const canvas = document.createElement('canvas');
	canvas.id = CANVAS_ID;
	canvas.width = 80;
	canvas.height = 80;
	widget.appendChild(canvas);

	const hint = document.createElement('div');
	hint.id = HINT_ID;
	hint.textContent = 'Click to play';
	widget.appendChild(hint);

	const controls = document.createElement('div');
	controls.id = CONTROLS_ID;
	controls.innerHTML = [
		'<div class="tx-hud-sub">Controls</div>',
		'<div class="tx-hud-key"><kbd>\u2190\u2192\u2191\u2193</kbd><span>move</span></div>',
		'<div class="tx-hud-key"><kbd>Z</kbd><kbd>X</kbd><span>rotate</span></div>',
		'<div class="tx-hud-key"><kbd>Space</kbd><span>drop</span></div>',
	].join('');
	// Phones: the on-screen pad already labels its buttons, and screen
	// space is scarce — skip the keyboard legend and shrink the panel.
	if (isTouchPrimary()) {
		controls.style.display = 'none';
		widget.classList.add('is-compact');
		Object.assign(widget.style, { top: '8px', right: '8px' });
		canvas.style.width = '56px';
		canvas.style.height = '56px';
	}
	widget.appendChild(controls);

	widget.addEventListener('click', (event) => {
		// A mouse click left keyboard focus here, so every later Space
		// (hard drop) went to this widget instead of the game. Hand
		// focus back; keyboard activation (detail === 0) keeps it.
		if (event.detail > 0) widget.blur();
		onClick(event);
	});
	widget.addEventListener('keydown', (event) => {
		// Only a chess turn has anything to activate. Otherwise let
		// Space through to the game as a drop.
		if (widget.gameState?.turnPhase !== 'chess') return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onClick(event);
		}
	});

	document.body.appendChild(widget);
	return widget;
}

function drawPreview(canvas, shape, colour) {
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	const blockSize = 15;

	// (the well behind the piece is the canvas's CSS background)
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const offsetX = (canvas.width - shape[0].length * blockSize) / 2;
	const offsetY = (canvas.height - shape.length * blockSize) / 2;

	ctx.fillStyle = colour;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
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

	// Knocked out and watching the battle play on (battleMode.js): no
	// turn of ours to describe.
	const battle = gameState?.activeBattle;
	if (battle && gameState.battleWatching && gameState.battleWatching === battle.id) {
		hint.textContent = 'Knocked out — watching';
		hint.dataset.phase = 'out';
		return;
	}

	if (gameState && gameState.turnPhase === 'chess') {
		hint.textContent = isTouchPrimary() ? 'Tap to start tetris turn' : 'Click to start tetris turn';
		hint.dataset.phase = 'chess';
		// A Viking battle's first chess turn introduces the longships
		// (once per device); otherwise the usual chess-turn tip.
		if (!(gameState?.activeBattle?.edition === 'viking' && showFirstLongshipHint())) showFirstChessTurnHint();
	} else {
		hint.textContent = isTouchPrimary()
			? 'Tetris turn — tap \u27F3 to rotate'
			: 'Playing tetris turn — Z/X to rotate';
		hint.dataset.phase = 'tetris';
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

const FIRST_DROP_HINT_KEY = 'tetches_seen_rotation_hint_v1';
const FIRST_CHESS_HINT_KEY = 'tetches_seen_chess_turn_hint_v1';
const FIRST_LONGSHIP_HINT_KEY = 'tetches_seen_longship_hint_v1';
// (<kbd> and <b> in a tip are styled by `.one-time-tip` in the UI theme)
const tipsShown = new Set();
let dismissActiveTip = null;

function showFirstDropRotationHint() {
	const touch = isTouchPrimary();
	showOneTimeTip(FIRST_DROP_HINT_KEY, touch
		? 'Tap <b>\u27F3</b> to rotate the tetromino while it\'s falling.'
		: `Press <kbd>Z</kbd> or <kbd>X</kbd> to rotate the tetromino while it's falling.`,
	['z', 'Z', 'x', 'X', 'r', 'R', 'q', 'Q', 'e', 'E']);
}

// After the first drop the game silently switches to chess; nothing
// told a newcomer they were now expected to move a piece, or how to
// skip back to building.
function showFirstChessTurnHint() {
	const touch = isTouchPrimary();
	const verb = touch ? 'Tap' : 'Click';
	showOneTimeTip(FIRST_CHESS_HINT_KEY,
		`<b>Chess turn.</b> ${verb} one of your pieces, then a highlighted square to move it.<br>`
		+ `Nothing worth moving? ${verb} <b>NEXT PIECE</b> to skip to your next block.`);
}

// Viking battles: nothing in the battle said how to board or sail.
function showFirstLongshipHint() {
	const touch = isTouchPrimary();
	const verb = touch ? 'Tap' : 'Click';
	const key = touch ? '' : ` (or press <kbd>L</kbd>)`;
	return showOneTimeTip(FIRST_LONGSHIP_HINT_KEY,
		`<span class="tx-longship-icon" aria-hidden="true"></span><b>Longships.</b> Move a knight, bishop, rook or queen onto the gold ring on your ship, `
		+ `then ${verb.toLowerCase()} <b>Longship</b>${key} and a glowing sea tile to sail.<br>`
		+ 'Land beside an enemy shore to raid it.', [], 14000);
}

/**
 * Show a tip once per device (localStorage key), or once per page load
 * if storage is blocked. A newer tip replaces one still on screen.
 * Dismissed by any click, Escape, one of `dismissKeys`, or after
 * `lingerMs` (10 s). Returns whether it was shown now.
 */
function showOneTimeTip(storageKey, messageHtml, dismissKeys = [], lingerMs = 10000) {
	// Never behind the welcome card (a world turn can start under it):
	// keep the tip for a later moment rather than use it up unseen.
	if (document.getElementById('tutorial-message')) return false;
	if (tipsShown.has(storageKey)) return false;
	tipsShown.add(storageKey);
	try {
		if (window.localStorage && window.localStorage.getItem(storageKey)) return false;
	} catch (_) {
		// localStorage might be blocked; just show it once per page load.
	}
	if (dismissActiveTip) dismissActiveTip();

	const banner = document.createElement('div');
	banner.className = 'one-time-tip';
	const touch = isTouchPrimary();
	banner.setAttribute('role', 'status');
	banner.innerHTML = `
		<div class="tx-tip-head">Tip</div>
		<div>${messageHtml}</div>
		<div class="tx-tip-foot">${touch ? 'Tap' : 'Click'} anywhere to dismiss</div>
	`;
	Object.assign(banner.style, {
		position: 'fixed',
		// Mid-screen: the home view puts the waiting piece above this
		// and the player's own pieces below it (the bottom sat on the
		// home row on phones, just above the touch pad).
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		width: 'max-content',
		maxWidth: 'min(420px, calc(100vw - 32px))',
		boxSizing: 'border-box',
		zIndex: '11700',
		textAlign: 'center',
		cursor: 'pointer',
		animation: 'tetches-fade-in 280ms ease-out',
	});
	let timer = null;
	const dismiss = () => {
		if (dismissActiveTip === dismiss) dismissActiveTip = null;
		clearTimeout(timer);
		try { if (window.localStorage) window.localStorage.setItem(storageKey, '1'); } catch (_) {}
		banner.style.transition = 'opacity 250ms ease';
		banner.style.opacity = '0';
		setTimeout(() => banner.remove(), 260);
		document.removeEventListener('keydown', onKey, true);
		document.removeEventListener('click', dismiss, true);
	};
	const onKey = (e) => {
		if (e.key === 'Escape' || dismissKeys.includes(e.key)) dismiss();
	};
	document.addEventListener('keydown', onKey, true);
	document.addEventListener('click', dismiss, true);
	document.body.appendChild(banner);
	placeTip(banner);
	keepTipClear(banner);
	dismissActiveTip = dismiss;
	timer = setTimeout(dismiss, lingerMs);
	return true;
}

// The top HUD a tip goes just under (title and button strip, Next
// piece, the Longship card, the sea banner).
const TOP_HUD = ['.game-title', '.debug-indicator', '#next-tetromino-display', '#longship-button', '#tetches-sea-hud',
	'#audio-mute-toggle', '#activity-log-toggle'];

/**
 * Where a tip goes: up top, out of the play. Mid-screen it sat on the
 * player's own home row and pieces (or, moved off the ship, right over
 * them). A phone held upright: just under the top HUD (the round
 * buttons are part of it there), edge to edge. Elsewhere: top
 * centre, between the title and the Next piece panel, or under them
 * when it would touch either. (The tip stays centred on its `top`:
 * translateY(-50%), as keepTipClear expects.)
 */
function placeTip(banner) {
	if (typeof window === 'undefined') return;
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const rects = [];
	for (const sel of TOP_HUD) {
		const el = document.querySelector(sel);
		if (!el) continue;
		const q = el.getBoundingClientRect();
		if (q.height > 0 && q.width > 0 && q.top < vh * 0.4) rects.push(q);
	}
	const hudBottom = rects.reduce((m, q) => Math.max(m, q.bottom), 0);
	if (vw <= 600 && vh > vw) {
		Object.assign(banner.style, {
			left: '12px',
			transform: 'translateY(-50%)',
			maxWidth: 'calc(100vw - 24px)',
		});
		const h = banner.getBoundingClientRect().height;
		banner.style.top = `${Math.round(hudBottom + 10 + h / 2)}px`;
		return;
	}
	const b = banner.getBoundingClientRect();
	if (!(b.height > 0)) return;
	const top = 14;
	const hits = rects.some(q => b.left < q.right + 8 && b.right > q.left - 8 && top < q.bottom + 8);
	const at = hits ? hudBottom + 10 : top;
	banner.style.top = `${Math.round(at + b.height / 2)}px`;
}

/**
 * Viking edition: a tip that would sit on the player's own longship
 * (avoidRect, set only while ships are drawn) moves above it, or below
 * it when there is no room above.
 */
function keepTipClear(banner) {
	// (only while a Viking battle draws the player's longship: never in
	// the standard game)
	const r = avoidRect();
	if (!r) return;
	const b = banner.getBoundingClientRect();
	if (!(b.height > 0)) return;
	// Keep clear of the ship and of the buttons the tip is about (the
	// Longship / Skip stack, the piece card): a tip on top of the button
	// it names is no help.
	const rectOf = (id) => {
		const el = document.getElementById(id);
		if (!el || el.style.display === 'none') return null;
		const q = el.getBoundingClientRect();
		return q.height > 0 && q.width > 0 ? q : null;
	};
	const avoid = [r, rectOf('turn-action-stack'), rectOf('selected-piece-card')].filter(Boolean);
	const vh = window.innerHeight;
	const clearAt = (top) => top >= 8 && top + b.height <= vh - 8
		&& !avoid.some(a => b.left < a.right && b.right > a.left && top < a.bottom && top + b.height > a.top);
	if (clearAt(b.top)) return;
	const tops = [r.top - 12 - b.height, vh * 0.7 - b.height / 2, vh * 0.32 - b.height / 2,
		vh * 0.82 - b.height / 2, r.bottom + 12, vh * 0.22 - b.height / 2];
	const top = tops.find(clearAt);
	if (top === undefined) return;
	banner.style.top = `${Math.round(top + b.height / 2)}px`;
}

function flashWaitMessage(text) {
	const note = document.createElement('div');
	note.textContent = text;
	note.className = 'tx-flash';
	Object.assign(note.style, {
		position: 'fixed', top: '50%', left: '50%',
		transform: 'translate(-50%, -50%)',
		zIndex: '1000',
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
