/**
 * Skip the drop: C in the tetris phase goes straight to the chess move.
 *
 * Owner (2026-11-16): a raider far from home, or a warrior on a ship,
 * is hard to play when every turn sends the eye back home for the drop.
 * The skipped piece isn't lost (the server still holds it as the dealt
 * piece; it comes back after the chess move), but the kingdom doesn't
 * grow that turn, which is the price of minding the raid instead of
 * home affairs.
 *
 * Client-side only: the turn phase is the client's (the server only
 * spaces chess moves by its cooldown), as with the check alarm forcing
 * the chess phase (checkAlert.js).
 */

import { cleanupCurrentTetromino, cleanupGhostPiece } from './tetromino/rendering.js';
import { armSkipChessTimer, cancelSkipDropTimer } from './skipChessButton.js';
import { updateGameStatusDisplay } from './createLoadingIndicator.js';
import { updateNextPieceHint } from './tetromino/nextPiece.js';
import { showToastMessage } from './showToastMessage.js';

export const SKIP_TETRIS_KEY = 'c';

/** Can the drop be skipped now? */
export function canSkipTetris(gameState) {
	return !!gameState
		&& gameState.turnPhase === 'tetris'
		&& !gameState.processingMove
		&& !gameState.gameOver;
}

/** Skip this turn's drop and go to the chess move. Returns true if it did. */
export function skipTetrisMove(gameState, deps = {}) {
	if (!canSkipTetris(gameState)) return false;
	const d = {
		cleanupCurrentTetromino, cleanupGhostPiece, armSkipChessTimer, cancelSkipDropTimer,
		updateGameStatusDisplay, updateNextPieceHint, showToastMessage, ...deps,
	};
	try { d.cleanupCurrentTetromino(gameState); } catch (_e) { /* best-effort */ }
	try { d.cleanupGhostPiece(gameState); } catch (_e) { /* best-effort */ }
	gameState.currentTetromino = null;
	gameState.turnPhase = 'chess';
	gameState._forceUpdate = true;
	try { d.cancelSkipDropTimer(); } catch (_e) { /* best-effort */ }
	try { d.armSkipChessTimer(); } catch (_e) { /* best-effort */ }
	try { d.updateGameStatusDisplay(gameState); } catch (_e) { /* display is non-critical */ }
	try { d.updateNextPieceHint(gameState); } catch (_e) { /* display is non-critical */ }
	try { d.showToastMessage('Drop skipped: make your chess move. Your piece waits for next turn.', { duration: 2600 }); } catch (_e) { /* best-effort */ }
	return true;
}
