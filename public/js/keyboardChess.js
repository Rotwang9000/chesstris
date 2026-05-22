/**
 * Keyboard-only chess interaction.
 *
 * Adds a "select pieces and move them without ever touching the
 * mouse" flow on top of the existing chess interaction. Bindings:
 *
 *   Tab / Shift+Tab   - Cycle through your movable pieces.
 *   Arrow keys        - Once a piece is selected, cycle the
 *                       highlighted target through valid moves in
 *                       that direction. Arrows compose with the
 *                       current cursor — pressing Right twice picks
 *                       the second-rightmost valid move.
 *   Enter / Space     - Confirm the highlighted move.
 *   Escape            - Cancel the current selection.
 *
 * The keyboard cursor is rendered as a brighter ring on top of the
 * existing move-highlight mesh; no separate render path is needed.
 *
 * The module is a pure side-effect: import + call
 * `setupKeyboardChess()` from inputManager and the listeners are
 * attached.
 */

import { getGameState, getChessPiecesGroup } from './gameContext.js';
import {
	selectChessPiece,
	clearChessSelection,
	moveChessPieceToCell,
} from './chessInteraction.js';
import { playSound } from './audio/soundManager.js';

let attached = false;
let cursorIndex = -1;

/**
 * Filter pieces down to the ones the current player can actually
 * move on their turn. Excludes captured / off-board meshes and
 * pieces owned by other players.
 */
function getOwnMovablePieces() {
	const gameState = getGameState();
	if (!gameState) return [];
	const group = getChessPiecesGroup();
	if (!group || !Array.isArray(group.children)) return [];
	const me = gameState.currentPlayer;
	if (!me) return [];
	return group.children
		.filter(p => p && p.userData && String(p.userData.player) === String(me))
		.sort((a, b) => {
			// Stable, predictable cycle: by board column, then row,
			// then piece id. Players who hit Tab repeatedly should see
			// the same order every time.
			const ax = a.userData.position?.x ?? 0;
			const az = a.userData.position?.z ?? 0;
			const bx = b.userData.position?.x ?? 0;
			const bz = b.userData.position?.z ?? 0;
			if (ax !== bx) return ax - bx;
			if (az !== bz) return az - bz;
			return String(a.userData.id || '').localeCompare(String(b.userData.id || ''));
		});
}

function getSelectedIndex(pieces) {
	const gameState = getGameState();
	const selected = gameState?.selectedChessPiece;
	if (!selected) return -1;
	return pieces.findIndex(p => p === selected);
}

function cyclePiece(direction) {
	const pieces = getOwnMovablePieces();
	if (pieces.length === 0) {
		try { playSound('error'); } catch (_e) { /* sound is best-effort */ }
		return;
	}
	const current = getSelectedIndex(pieces);
	let next;
	if (current === -1) next = direction > 0 ? 0 : pieces.length - 1;
	else next = (current + direction + pieces.length) % pieces.length;
	selectChessPiece(pieces[next]);
	cursorIndex = -1;
	try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
}

/**
 * Sort the valid-moves list by a compass direction relative to the
 * selected piece. The Direction key drives a deterministic order so
 * pressing Right twice moves the cursor twice along the same axis.
 *
 * @param {Array<{x:number, z:number}>} moves
 * @param {{x:number, z:number}} from - piece position
 * @param {'left'|'right'|'up'|'down'} direction
 * @returns {Array} A reordered copy of `moves`.
 */
function sortMovesByDirection(moves, from, direction) {
	if (!Array.isArray(moves) || moves.length === 0) return [];
	// Score each move so positive scores point in the chosen
	// direction first. Ties broken by absolute distance.
	function scoreOf(move) {
		const dx = move.x - from.x;
		const dz = move.z - from.z;
		switch (direction) {
			case 'right': return dx === 0 ? Infinity : (dx > 0 ? dx + Math.abs(dz) * 0.5 : 9999 + Math.abs(dx));
			case 'left':  return dx === 0 ? Infinity : (dx < 0 ? -dx + Math.abs(dz) * 0.5 : 9999 + Math.abs(dx));
			case 'down':  return dz === 0 ? Infinity : (dz > 0 ? dz + Math.abs(dx) * 0.5 : 9999 + Math.abs(dz));
			case 'up':    return dz === 0 ? Infinity : (dz < 0 ? -dz + Math.abs(dx) * 0.5 : 9999 + Math.abs(dz));
			default: return 0;
		}
	}
	return moves.slice().sort((a, b) => scoreOf(a) - scoreOf(b));
}

function moveCursor(direction) {
	const gameState = getGameState();
	const piece = gameState?.selectedChessPiece;
	if (!piece) {
		// No selection — pretend Arrow Right is Tab.
		cyclePiece(direction === 'right' || direction === 'down' ? 1 : -1);
		return;
	}
	const validMoves = Array.isArray(gameState.validMoves) ? gameState.validMoves : [];
	if (validMoves.length === 0) {
		try { playSound('error'); } catch (_e) { /* sound is best-effort */ }
		return;
	}
	const from = {
		x: Number(piece.userData?.position?.x ?? 0),
		z: Number(piece.userData?.position?.z ?? 0),
	};
	const sorted = sortMovesByDirection(validMoves, from, direction);
	cursorIndex = (cursorIndex + 1) % sorted.length;
	const target = sorted[cursorIndex];
	gameState._keyboardCursor = { x: target.x, z: target.z };
	highlightKeyboardCursor(target);
	try { playSound('tick'); } catch (_e) { /* sound is best-effort */ }
}

function highlightKeyboardCursor(target) {
	const gameState = getGameState();
	if (!gameState || !window.moveHighlightsGroup) return;
	// Walk the existing move-highlight meshes and bump the alpha /
	// emissive on the one that matches the cursor. Reset the rest.
	for (const child of window.moveHighlightsGroup.children) {
		if (!child || !child.userData) continue;
		const isCursor = Number(child.userData.x) === Number(target.x)
			&& Number(child.userData.z) === Number(target.z);
		if (child.material) {
			// Keep existing color but boost opacity/emissive for cursor.
			if (isCursor) {
				child.scale.set(1.2, 1.2, 1.2);
				if (child.material.emissive) child.material.emissive.setHex(0xffffaa);
				if ('opacity' in child.material) child.material.opacity = 1;
			} else {
				child.scale.set(1, 1, 1);
				if (child.material.emissive) child.material.emissive.setHex(0x000000);
				if ('opacity' in child.material) child.material.opacity = 0.85;
			}
		}
	}
}

function confirmMove() {
	const gameState = getGameState();
	const cursor = gameState?._keyboardCursor;
	if (!cursor) {
		try { playSound('error'); } catch (_e) { /* sound is best-effort */ }
		return;
	}
	moveChessPieceToCell(Number(cursor.x), Number(cursor.z));
	gameState._keyboardCursor = null;
	cursorIndex = -1;
}

function handleKeyboardChessKey(event) {
	const gameState = getGameState();
	if (!gameState || gameState.turnPhase !== 'chess') return;

	// Don't steal keys typed into a real input.
	const target = event.target;
	if (target && (
		target.tagName === 'INPUT'
		|| target.tagName === 'TEXTAREA'
		|| target.isContentEditable
	)) return;

	switch (event.key) {
		case 'Tab':
			event.preventDefault();
			cyclePiece(event.shiftKey ? -1 : 1);
			return;
		case 'ArrowLeft':
			event.preventDefault();
			moveCursor('left');
			return;
		case 'ArrowRight':
			event.preventDefault();
			moveCursor('right');
			return;
		case 'ArrowUp':
			event.preventDefault();
			moveCursor('up');
			return;
		case 'ArrowDown':
			event.preventDefault();
			moveCursor('down');
			return;
		case 'Enter':
			event.preventDefault();
			confirmMove();
			return;
		case 'Escape':
			event.preventDefault();
			clearChessSelection();
			gameState._keyboardCursor = null;
			cursorIndex = -1;
			return;
		default:
			return;
	}
}

export function setupKeyboardChess() {
	if (attached) return;
	attached = true;
	document.addEventListener('keydown', handleKeyboardChessKey, true);
}
