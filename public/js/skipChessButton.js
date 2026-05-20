/**
 * "Skip Chess Move" and "Skip Tetromino" buttons.
 *
 * Both buttons live in a small column directly under the Next Piece
 * widget (top-right) so the action-affordance is always co-located
 * with the turn-state UI and toasts never appear underneath them.
 *
 * Lifecycle:
 *   - chess phase entered             → arm 30 s timer for the chess-skip
 *   - chess move sent / phase ended   → cancel timer + hide chess-skip
 *   - tetris drop fails               → arm 30 s timer for the drop-skip
 *   - tetris drop succeeds / accepted → cancel timer + hide drop-skip
 *
 * Both buttons send `skip_chess_move` server-side — the server's
 * handler advances the player to the next tetromino regardless of
 * which phase the user is in. Tests rely on that single handler.
 */

import * as NetworkManager from './utils/networkManager.js';
import { showToastMessage } from './showToastMessage.js';

export const ACTION_STACK_ID = 'turn-action-stack';
const CHESS_BUTTON_ID = 'skip-chess-move-button';
const DROP_BUTTON_ID = 'skip-tetris-drop-button';
const SKIP_BUTTON_DELAY_MS = 30000;

let chessTimerId = null;
let dropTimerId = null;

/**
 * Get-or-create the shared action stack right under the Next Piece
 * widget. The detonate button reuses this container too so all turn
 * actions live in one place.
 */
export function ensureActionStack() {
	let container = document.getElementById(ACTION_STACK_ID);
	if (container) return container;

	container = document.createElement('div');
	container.id = ACTION_STACK_ID;
	Object.assign(container.style, {
		position: 'fixed',
		right: '20px',
		display: 'flex',
		flexDirection: 'column',
		gap: '8px',
		alignItems: 'stretch',
		width: '160px',
		zIndex: '4500',
		fontFamily: 'serif',
		pointerEvents: 'none',
	});

	document.body.appendChild(container);
	positionUnderNextPiece(container);
	window.addEventListener('resize', () => positionUnderNextPiece(container));
	return container;
}

export function positionUnderNextPiece(container) {
	if (!container) container = document.getElementById(ACTION_STACK_ID);
	if (!container) return;
	const next = document.getElementById('next-tetromino-display');
	if (next) {
		const rect = next.getBoundingClientRect();
		container.style.top = `${Math.round(rect.bottom + 12)}px`;
		container.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
		container.style.width = `${Math.max(160, Math.round(rect.width))}px`;
	} else {
		container.style.top = '140px';
		container.style.right = '20px';
	}
}

function ensureContainer() { return ensureActionStack(); }

function makeButton(id, label, color) {
	const button = document.createElement('button');
	button.id = id;
	button.type = 'button';
	button.textContent = label;
	Object.assign(button.style, {
		padding: '10px 14px',
		fontFamily: 'serif',
		fontSize: '13px',
		fontWeight: '700',
		color: '#fff8d8',
		background: color,
		border: '2px solid #ffcc00',
		borderRadius: '6px',
		boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
		letterSpacing: '0.4px',
		cursor: 'pointer',
		opacity: '0',
		pointerEvents: 'none',
		transition: 'opacity 0.35s ease',
		display: 'block',
	});
	return button;
}

function ensureChessButton() {
	let button = document.getElementById(CHESS_BUTTON_ID);
	if (button) return button;
	const container = ensureContainer();
	button = makeButton(CHESS_BUTTON_ID, 'Skip chess move', 'rgba(120, 30, 30, 0.92)');
	button.addEventListener('click', () => requestSkip(button, 'chess'));
	container.appendChild(button);
	return button;
}

function ensureDropButton() {
	let button = document.getElementById(DROP_BUTTON_ID);
	if (button) return button;
	const container = ensureContainer();
	button = makeButton(DROP_BUTTON_ID, 'Skip to chess move', 'rgba(40, 60, 110, 0.92)');
	button.addEventListener('click', () => requestSkip(button, 'drop'));
	container.appendChild(button);
	return button;
}

function showButton(button) {
	positionUnderNextPiece(ensureContainer());
	button.style.opacity = '1';
	button.style.pointerEvents = 'auto';
}

function hideButton(id) {
	const button = document.getElementById(id);
	if (!button) return;
	button.style.opacity = '0';
	button.style.pointerEvents = 'none';
}

export function hideSkipChessButton() { hideButton(CHESS_BUTTON_ID); }
export function hideSkipDropButton()  { hideButton(DROP_BUTTON_ID); }

function clearChessTimer() {
	if (chessTimerId) { clearTimeout(chessTimerId); chessTimerId = null; }
}

function clearDropTimer() {
	if (dropTimerId) { clearTimeout(dropTimerId); dropTimerId = null; }
}

/**
 * Arm the 30-second visibility timer for "Skip chess move".
 * Idempotent — re-arming resets the clock.
 */
export function armSkipChessTimer() {
	clearChessTimer();
	hideSkipChessButton();
	ensureChessButton();
	chessTimerId = setTimeout(() => {
		chessTimerId = null;
		showButton(ensureChessButton());
	}, SKIP_BUTTON_DELAY_MS);
}

export function cancelSkipChessTimer() {
	clearChessTimer();
	hideSkipChessButton();
}

/**
 * Arm the 30-second visibility timer for "Skip to chess move", which
 * appears when the player can't get a tetromino to land cleanly.
 */
export function armSkipDropTimer() {
	if (dropTimerId) return;          // already counting down
	clearDropTimer();
	hideSkipDropButton();
	ensureDropButton();
	dropTimerId = setTimeout(() => {
		dropTimerId = null;
		showButton(ensureDropButton());
	}, SKIP_BUTTON_DELAY_MS);
}

export function cancelSkipDropTimer() {
	clearDropTimer();
	hideSkipDropButton();
}

function requestSkip(button, kind) {
	if (button) button.disabled = true;
	NetworkManager.sendMessage('skip_chess_move', {})
		.then(response => {
			if (button) button.disabled = false;
			if (response && response.success) {
				cancelSkipChessTimer();
				cancelSkipDropTimer();
				showToastMessage(
					kind === 'drop'
						? 'Skipped failed tetromino — placing your next piece.'
						: 'Chess move skipped — placing your next tetromino.'
				);
			} else {
				showToastMessage(`Could not skip: ${response?.error || 'server error'}`);
			}
		})
		.catch(error => {
			if (button) button.disabled = false;
			showToastMessage(`Could not skip: ${error?.message || 'network error'}`);
		});
}
