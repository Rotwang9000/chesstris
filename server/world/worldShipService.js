/**
 * The world-longship sweep: runs `worldShips.reconcile` on a timer with
 * the live services plugged in (island paths, piece removal, sockets),
 * and broadcasts when the board changed. A no-op while world longships
 * are off.
 */

'use strict';

const World = require('./World');
const Sessions = require('./Sessions');
const worldShips = require('./worldShips');
const pieces = require('../game/pieces');

const WORLD_SHIP_TICK_MS = 2000;

function createWorldShipService({ gameManager, broadcaster, persistence, io, activityLog = null }) {
	function tick(now = Date.now()) {
		if (!worldShips.enabled()) return null;
		const world = World.getWorld();
		if (!world) return null;
		const result = worldShips.reconcile(world, {
			now,
			hasPathToKing: (x, z, pid) => gameManager.islandManager.hasPathToKing(world, x, z, pid),
			removePiece: (piece, why) => pieces.removePiece(world, piece, {
				reason: why === 'ship_trapped' ? pieces.REMOVAL_REASONS.SHIP_TRAPPED : pieces.REMOVAL_REASONS.RAID_EXPIRED,
				activityLog,
			}),
			emitTo: (pid, event, payload) => {
				try { Sessions.emitToPlayerSockets(pid, event, payload); } catch (_e) { /* closing */ }
			},
			emitAll: (event, payload) => {
				try { if (io && world.id) io.to(world.id).emit(event, payload); } catch (_e) { /* closing */ }
			},
		});
		if (result.changed) {
			World.markDirty();
			if (persistence && typeof persistence.markDirty === 'function') persistence.markDirty();
			if (broadcaster) broadcaster.broadcastGameUpdate();
		}
		return result;
	}
	return { tick, WORLD_SHIP_TICK_MS };
}

module.exports = { createWorldShipService, WORLD_SHIP_TICK_MS };
