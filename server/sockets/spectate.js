/**
 * Spectator socket handlers.  Spectating is fully ephemeral: the
 * spectator registry holds the mapping in memory only.
 */

const World = require('../world/World');

function registerSpectateHandlers(socket, ctx) {
	const { playerId, spectatorRegistry } = ctx;

	socket.on('request_spectate', (data) => {
		if (!data || !data.playerId) return;

		const targetPlayerId = data.playerId;
		const targetPlayer = World.getPlayer(targetPlayerId);
		if (!targetPlayer) {
			socket.emit('error', { message: 'Player not found' });
			return;
		}

		spectatorRegistry.watch(playerId, targetPlayerId);

		socket.emit('spectator_update', {
			playerId: targetPlayerId,
			gameState: World.getWorld(),
		});

		console.log(`Player ${playerId} is now spectating ${targetPlayerId}`);
	});

	socket.on('stop_spectating', () => {
		if (spectatorRegistry.stop(playerId)) {
			console.log(`Player ${playerId} stopped spectating`);
		}
	});
}

module.exports = { registerSpectateHandlers };
