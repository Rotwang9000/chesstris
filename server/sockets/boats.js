/**
 * Viking longship socket handlers:
 *   • ship_sail {shipId, to:{x,z}} → ack {success, error?, reason?, readyAt?}
 *
 * Sailing is not a chess move: it doesn't stamp the chess cooldown or
 * change phase. The ship's own 3 s rowing lock is the throttle. The
 * guard list mirrors chess_move's, in order:
 *
 *   1. the acting seat exists, isn't eliminated and isn't paused;
 *   2. it sits in an ACTIVE battle that plays the Viking edition;
 *   3. the ship exists and this seat controls it;
 *   4. the ship has finished rowing;
 *   5. the leg is integer, orthogonal, 1–5 squares, all open water.
 *
 * (3–5 live in ships.sail so the bots and tests share them.)
 */

'use strict';

const World = require('../world/World');
const ships = require('../battle/ships');

function registerBoatHandlers(socket, ctx) {
	const { playerId: boundPlayerId, broadcaster, integrityService, persistence } = ctx;
	// While in an active battle the socket acts as its SEAT id.
	const actingPlayerId = typeof ctx.resolveActingPlayerId === 'function'
		? ctx.resolveActingPlayerId
		: () => boundPlayerId;

	socket.on('ship_sail', (data, callback) => {
		const ack = typeof callback === 'function' ? callback : () => {};
		const refuse = (reason, error) => ack({ success: false, reason, error });
		try {
			const playerId = actingPlayerId();
			const player = World.getPlayer(playerId);
			if (!player) return refuse('not_registered', 'Not registered');

			// 1. Eliminated players are out; paused players are protected,
			// so letting them sail would make pause a free shield.
			if (player.eliminated) return refuse('eliminated', 'You have been eliminated — your king is gone.');
			if (player.paused) return refuse('paused', 'You are paused — press Resume to play.');

			// 2. Only seats of an active Viking battle have ships to sail.
			const world = World.getWorld();
			const battle = ships.vikingBattleOf(world, playerId);
			if (!battle || battle.status !== 'active') {
				return refuse('not_viking', 'There are no longships in this game.');
			}

			const shipId = data && typeof data === 'object' ? data.shipId : null;
			const to = data && typeof data === 'object' ? data.to : null;
			const now = Date.now();
			const result = ships.sail(world, battle, playerId, { shipId, to }, { now });
			if (!result.success) return refuse(result.reason, result.error);

			// Sailing is activity (for idle decay), not a chess move.
			player.lastActiveAt = now;
			// A ship sailing off (or in) re-anchors landing parties.
			if (integrityService) integrityService.runIslandIntegrityPass({ emitAnimation: true });
			World.markDirty();
			if (persistence && typeof persistence.markDirty === 'function') persistence.markDirty();
			if (broadcaster) broadcaster.broadcastGameUpdate();
			ships.emitToBattle(battle, 'ship_sailed', result.event);

			return ack({ success: true, ...result.event });
		} catch (err) {
			console.error('[Ships] ship_sail failed:', err);
			return refuse('server_error', 'Server error');
		}
	});
}

module.exports = { registerBoatHandlers };
