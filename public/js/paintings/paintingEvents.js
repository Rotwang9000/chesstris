/**
 * Turn server events into painting "moments".
 *
 * The same capture can arrive twice — `chess_capture` and the
 * `chess_move` broadcast both carry it, and an AI piece escaping check
 * by capturing sends only `chess_move` — so every moment carries a
 * dedupe key (the captured piece's id, or the fallen king's owner).
 *
 * Piece types are always read from the event payload, never from
 * `gameState.chessPieces`: the server sends the board update before
 * the capture event, so the victim is usually gone locally by now.
 *
 * Only moments involving the viewer are painted (their piece took or
 * was taken); a busy shared world would otherwise be a slideshow.
 *
 * Pure functions, tested in tests/ui/paintings.test.js. A moment:
 *   { kind: 'capture'|'kingfall'|'arrival'|'battle', dedupeKey,
 *     attackerId?, victimId?, attackerType?, victimType?, pieceType?,
 *     playerId?, outcome?, siege?, extra: 0 }
 */

import { normalisePieceType } from './paintingCatalogue.js';

function same(a, b) {
	return a != null && b != null && String(a) === String(b);
}

/** Build a capture (or king's-fall) moment if the viewer is involved. */
function captureMoment({ attackerId, attackerType, victim }, localId) {
	if (!victim || victim.id == null || localId == null) return null;
	const victimId = victim.player;
	if (!same(attackerId, localId) && !same(victimId, localId)) return null;
	const victimType = normalisePieceType(victim.type);
	if (victimType === 'king') {
		return {
			kind: 'kingfall',
			dedupeKey: `kingfall:${victimId}`,
			attackerId, victimId,
			attackerType: normalisePieceType(attackerType),
			victimType,
			extra: 0,
		};
	}
	return {
		kind: 'capture',
		dedupeKey: `piece:${victim.id}`,
		attackerId, victimId,
		attackerType: normalisePieceType(attackerType),
		victimType,
		extra: 0,
	};
}

/** `chess_capture` `{ capturedPiece, capturedBy: { playerId, pieceType } }`. */
export function fromChessCapture(payload, localId) {
	if (!payload?.capturedPiece) return null;
	return captureMoment({
		attackerId: payload.capturedBy?.playerId,
		attackerType: payload.capturedBy?.pieceType,
		victim: payload.capturedPiece,
	}, localId);
}

/** `chess_move` `{ playerId, movedPiece, capturedPiece|null }`. */
export function fromChessMove(payload, localId) {
	if (!payload?.capturedPiece) return null;
	return captureMoment({
		attackerId: payload.playerId,
		attackerType: payload.movedPiece?.type,
		victim: payload.capturedPiece,
	}, localId);
}

/**
 * `king_captured` `{ captorId, defeatedId }`. Arrives after the
 * `chess_capture` of the king on a direct capture (deduped then), and
 * alone when the check timer ran out — the siege: no blow was struck.
 */
export function fromKingCaptured(payload, localId) {
	const { captorId, defeatedId } = payload || {};
	if (captorId == null || defeatedId == null || localId == null) return null;
	if (!same(captorId, localId) && !same(defeatedId, localId)) return null;
	return {
		kind: 'kingfall',
		dedupeKey: `kingfall:${defeatedId}`,
		attackerId: captorId,
		victimId: defeatedId,
		victimType: 'king',
		siege: true,
		extra: 0,
	};
}

/**
 * Promotion deployed (`pawn_promotion_deployed` / `promotion_credit_redeemed`,
 * `{ playerId, pieceId, pieceType }`). Only a queen is an arrival for now;
 * the longships will bring her later.
 */
export function fromPromotion(payload, localId) {
	if (!payload || !same(payload.playerId, localId)) return null;
	const pieceType = normalisePieceType(payload.pieceType);
	if (pieceType !== 'queen') return null;
	return {
		kind: 'arrival',
		dedupeKey: `arrival:${payload.pieceId ?? payload.creditId ?? payload.pawnId ?? Date.now()}`,
		pieceType,
		playerId: payload.playerId,
		extra: 0,
	};
}

/** Battle end for the viewer: `outcome` from battleResults.describeOutcome. */
export function fromBattleEnd({ battleId, outcome, playerId } = {}) {
	if (outcome !== 'victory' && outcome !== 'defeat' && outcome !== 'out') return null;
	return {
		kind: 'battle',
		dedupeKey: `battle:${battleId ?? 'current'}:${outcome === 'victory' ? 'victory' : 'defeat'}`,
		outcome: outcome === 'victory' ? 'victory' : 'defeat',
		playerId,
		extra: 0,
	};
}
