'use strict';

/**
 * Open checks, keyed by defender id: `world.pendingChecks[defenderId]`.
 *
 * There used to be a single `world.pendingCheck` for the whole world, so
 * while any one king was in check every OTHER king attack — anywhere in
 * the shared world or in any battle arena — skipped the grace window and
 * took the king on the spot (bible §9: "a king is never taken on the
 * spot"). A legacy single `pendingCheck` (old saves) is folded in.
 */

function checksOf(world) {
	if (!world) return {};
	if (!world.pendingChecks || typeof world.pendingChecks !== 'object') {
		world.pendingChecks = {};
	}
	if (world.pendingCheck && typeof world.pendingCheck === 'object') {
		const legacy = world.pendingCheck;
		if (legacy.defenderId != null && !world.pendingChecks[legacy.defenderId]) {
			world.pendingChecks[legacy.defenderId] = legacy;
		}
		world.pendingCheck = null;
	}
	return world.pendingChecks;
}

function allChecks(world) {
	return Object.values(checksOf(world)).filter(Boolean);
}

function checkForDefender(world, defenderId) {
	if (defenderId == null) return null;
	return checksOf(world)[String(defenderId)] || null;
}

function checkForAttackerPiece(world, pieceId) {
	if (pieceId == null) return null;
	return allChecks(world).find(c => String(c.attackerPieceId) === String(pieceId)) || null;
}

function checksByAttacker(world, attackerId) {
	return allChecks(world).filter(c => String(c.attackerId) === String(attackerId));
}

module.exports = {
	checksOf,
	allChecks,
	checkForDefender,
	checkForAttackerPiece,
	checksByAttacker,
};
