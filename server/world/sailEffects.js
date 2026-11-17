/**
 * What follows a longship sail that went through, shared by the
 * `ship_sail` socket handler (sockets/boats.js) and the bots sailing in
 * the shared world (ai/actions.js `maybeSail`), so a bot's sail looks
 * exactly like a human's to everyone watching:
 *
 *   • the sail spends the turn's chess move (cooldown stamp, move count);
 *   • orbs on the squares the ship crossed are hauled aboard;
 *   • island integrity re-anchors landing parties;
 *   • the world is marked dirty and the new state broadcast;
 *   • `ship_sailed` goes to the world room (or the battle's sockets).
 */

'use strict';

const World = require('./World');
const ships = require('../battle/ships');

/**
 * @param {Object} args
 * @param {Object} args.world
 * @param {string} args.playerId
 * @param {Object} args.player   The acting player's record (stamped).
 * @param {{event:Object}} args.result  A successful `sail` result.
 * @param {Object|null} [args.battle]  The Viking battle, or null for the world.
 * @param {number} [args.now]
 * @param {Object} [args.powerUpManager]
 * @param {Object} [args.integrityService]
 * @param {Object} [args.persistence]
 * @param {Object} [args.broadcaster]
 * @param {Object} [args.io]
 * @returns {Array} The orb claims (PowerUpManager.claimBySail outcomes).
 */
function afterSail({
	world, playerId, player, result, battle = null, now = Date.now(),
	powerUpManager = null, integrityService = null, persistence = null, broadcaster = null, io = null,
}) {
	if (player) {
		player.lastActiveAt = now;
		player.lastChessMoveAt = now;
		player.moveCount = (player.moveCount || 0) + 1;
	}
	let orbClaims = [];
	if (powerUpManager && typeof powerUpManager.claimBySail === 'function' && result && result.event) {
		try {
			orbClaims = powerUpManager.claimBySail(world, playerId, result.event.from, result.event.to) || [];
		} catch (orbErr) {
			console.warn('[Ships] orb claim on sail failed:', orbErr.message);
		}
	}
	if (integrityService) integrityService.runIslandIntegrityPass({ emitAnimation: true });
	World.markDirty();
	if (persistence && typeof persistence.markDirty === 'function') persistence.markDirty();
	if (broadcaster) broadcaster.broadcastGameUpdate();
	if (result && result.event) {
		if (battle) ships.emitToBattle(battle, 'ship_sailed', result.event);
		else if (io) io.to(world.id).emit('ship_sailed', result.event);
	}
	return orbClaims;
}

module.exports = { afterSail };
