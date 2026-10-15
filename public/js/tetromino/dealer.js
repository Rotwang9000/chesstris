/**
 * Server-dealt tetrominoes (client side).
 *
 * The server decides every shape (`TetrominoManager.dealtPieces`): each
 * player has a `current` piece, the only one it will accept, and a
 * `next` preview. The client mirrors that as `gameState.dealtPieces`
 * and asks for the next piece (`draw_piece`) once its current one has
 * been used, i.e. placed, dissolved or dropped in the water.
 *
 * Spawning never waits on the network: the new piece is the `next` we
 * already know, and the draw's ack only corrects things if the server
 * disagrees (a restart, a reconnect, a battle seat, a draw that came
 * too fast). If nothing has been dealt yet, the local 7-bag stands in
 * until the first ack arrives.
 */

import NetworkManager from '../utils/networkManager.js';
import { drawFromBag } from './bag.js';
import { getShape } from './shapes.js';
import { renderTetromino } from './rendering.js';
import { updateNextTetrominoDisplay } from './nextPiece.js';

const TYPES = new Set(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);

function validPieces(pieces) {
	return !!pieces && TYPES.has(pieces.current) && TYPES.has(pieces.next);
}

/**
 * Type for the piece about to spawn. The first spawn after a fresh deal
 * uses `current`; every later spawn moves on to `next` and asks the
 * server to deal again.
 */
export function takeDealtPiece(gameState) {
	const dealt = gameState.dealtPieces;
	if (dealt && !dealt.used && TYPES.has(dealt.current)) {
		dealt.used = true;
		gameState.nextTetromino = dealt.next || gameState.nextTetromino;
		return dealt.current;
	}

	const type = (dealt && TYPES.has(dealt.next)) ? dealt.next : drawFromBag(gameState);
	gameState.dealtPieces = { current: type, next: null, used: true };
	requestDraw(gameState);
	return type;
}

/**
 * Adopt the server's `{ current, next }`. `used` says whether `current`
 * is already in play (or gone) on this client.
 */
export function applyServerPieces(gameState, pieces, { used = true } = {}) {
	if (!gameState || !validPieces(pieces)) return;
	gameState.dealtPieces = { current: pieces.current, next: pieces.next, used };
	gameState.nextTetromino = pieces.next;
	try { updateNextTetrominoDisplay(pieces.next, gameState); } catch (_e) { /* HUD not built yet */ }
	if (used) reconcileFallingPiece(gameState, pieces.current);
}

/** Fetch the deal without changing it, e.g. after joining. */
export function syncDealtPieces(gameState) {
	if (!NetworkManager.isConnected?.()) return;
	NetworkManager.sendMessage('get_pieces', {})
		.then((ack) => {
			if (!validPieces(ack?.pieces)) return;
			// Current is used if it's already placed, or something is falling.
			const used = !!ack.pieces.placed || !!gameState.currentTetromino;
			applyServerPieces(gameState, ack.pieces, { used });
		})
		.catch(() => { /* the next draw's ack will sync us */ });
}

function requestDraw(gameState) {
	if (!NetworkManager.isConnected?.()) return;
	NetworkManager.sendMessage('draw_piece', {})
		.then((ack) => applyServerPieces(gameState, ack?.pieces, { used: true }))
		.catch(() => { /* the placement ack will sync us */ });
}

/**
 * A piece still in the air that isn't the server's current one would
 * be refused on landing, so swap its shape now (same spot, rotation 0).
 */
function reconcileFallingPiece(gameState, type) {
	const tetromino = gameState.currentTetromino;
	if (!tetromino || tetromino.type === type) return;
	if (!(tetromino.heightAboveBoard > 0)) return;
	tetromino.type = type;
	tetromino.shape = getShape(type);
	tetromino.rotation = 0;
	try { renderTetromino(gameState); } catch (_e) { /* next frame re-renders */ }
}
