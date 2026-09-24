/**
 * Ephemeral spectator registry.  Spectators are players watching another
 * player's view; their bindings are not persisted (a refresh drops them).
 */

const Sessions = require('../world/Sessions');

/**
 * @param {{ buildPayload?: (world: Object) => Object }} [opts] - turns the
 *   raw world into the public payload spectators receive.
 */
function createSpectatorRegistry({ buildPayload = () => ({}) } = {}) {
	// spectator playerId -> target playerId
	const spectators = new Map();

	function watch(spectatorPlayerId, targetPlayerId) {
		if (!spectatorPlayerId || !targetPlayerId) return false;
		spectators.set(spectatorPlayerId, targetPlayerId);
		return true;
	}

	function stop(spectatorPlayerId) {
		return spectators.delete(spectatorPlayerId);
	}

	function isWatching(spectatorPlayerId) {
		return spectators.has(spectatorPlayerId);
	}

	function broadcastUpdate(targetPlayerId, gameState) {
		if (!targetPlayerId) return;
		for (const [spectatorId, watchedId] of spectators.entries()) {
			if (watchedId !== targetPlayerId) continue;
			const socket = Sessions.socketForPlayer(spectatorId);
			if (socket) {
				socket.emit('spectator_update', {
					playerId: targetPlayerId,
					gameState: buildPayload(gameState),
				});
			}
		}
	}

	function clearAll() {
		spectators.clear();
	}

	return { watch, stop, isWatching, broadcastUpdate, clearAll, buildPayload };
}

module.exports = { createSpectatorRegistry };
