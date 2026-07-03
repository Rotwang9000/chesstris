'use strict';

/**
 * Shared pawn-promotion helpers.
 *
 * The "freeze in place, await deployment" promotion rule is used by
 * BOTH the human chess handler (`server/sockets/chess.js`) and the AI
 * (`server/ai/actions.js`). Keeping the freeze logic in one place means
 * an AI pawn that reaches the promotion threshold locks down exactly
 * like a human one (immune to line-clear / decay, can't keep marching)
 * instead of silently walking on as an unkillable super-pawn.
 *
 * Per the bible's revised promotion rule: when a pawn reaches the
 * promotion threshold it is NOT consumed. Instead it freezes in place,
 * the cell becomes home-like, and the owner may later swap the pawn for
 * a piece they have previously captured (always optional).
 */

const WorldModule = require('../world/World');

/**
 * Mark a pawn as frozen, awaiting deployment of a captured piece.
 *
 * Idempotent: re-calling on a pawn already marked is a no-op that
 * re-emits the event so reconnecting clients can resync.
 *
 * @param {Object} world
 * @param {string} playerId
 * @param {Object} pawn                     The pawn piece object.
 * @param {Object} hooks
 * @param {Object} [hooks.broadcaster]
 * @param {Object} [hooks.activityLog]
 * @param {Object} [hooks.io]
 * @returns {Object|null} the pawn, or null if it wasn't a promotable pawn.
 */
function markPawnAwaitingPromotion(world, playerId, pawn, { broadcaster, activityLog, io } = {}) {
	const player = world.players?.[playerId];
	if (!player) return null;
	if (!pawn || pawn.type !== 'PAWN') return null;

	const wasAlready = !!pawn.awaitingPromotion;
	pawn.awaitingPromotion = true;
	pawn.awaitingPromotionAt = pawn.awaitingPromotionAt || Date.now();

	// Mirror the flag onto the chess marker so cell-level helpers
	// (line-clear scan, decay, etc.) can detect "frozen" cells without
	// having to cross-reference world.chessPieces.
	const pos = pawn.position || {};
	const key = `${pos.x},${pos.z}`;
	const cellContents = world.board?.cells?.[key];
	if (Array.isArray(cellContents)) {
		for (const item of cellContents) {
			if (!item) continue;
			if (item.type !== 'chess') continue;
			if (String(item.pieceId) !== String(pawn.id)) continue;
			item.awaitingPromotion = true;
		}
	}

	WorldModule.markDirty();

	if (!wasAlready && activityLog && typeof activityLog.recordPawnAwaitingPromotion === 'function') {
		try {
			activityLog.recordPawnAwaitingPromotion({
				playerId,
				playerName: player.username || player.name || playerId,
				pieceId: pawn.id,
				x: pos.x,
				z: pos.z,
			});
		} catch (logErr) {
			console.warn('[Promotion] awaiting-promotion log failed:', logErr.message);
		}
	}

	if (io && world?.id) {
		try {
			io.to(world.id).emit('pawn_awaiting_promotion', {
				playerId,
				pieceId: pawn.id,
				x: pos.x,
				z: pos.z,
				awaitingSince: pawn.awaitingPromotionAt,
				firstTime: !wasAlready,
			});
		} catch (emitErr) {
			console.warn('[Promotion] pawn_awaiting_promotion emit failed:', emitErr.message);
		}
	}

	try { broadcaster && broadcaster.broadcastGameUpdate(); }
	catch (broadcastErr) { console.warn('[Promotion] broadcast failed:', broadcastErr.message); }

	if (!wasAlready) {
		console.log(
			`Player ${playerId} pawn ${pawn.id} frozen at (${pos.x}, ${pos.z}) — awaiting promotion.`
		);
	}
	return pawn;
}

module.exports = { markPawnAwaitingPromotion };
