/**
 * Game-lifecycle socket handlers (restart, start, exit, disconnect-game).
 * The disconnect grace timer logic lives in connection.js — these
 * handlers cover the explicit user actions.
 */

const World = require('../world/World');
const Sessions = require('../world/Sessions');

function registerLifecycleHandlers(socket, ctx) {
	const {
		playerId,
		io,
		broadcaster,
		lifecycleService,
		aiRunner,
		spectatorRegistry,
	} = ctx;

	socket.on('restart_game', () => {
		try {
			lifecycleService.restartWorld({ requestedBy: playerId });
		} catch (error) {
			console.error('Error handling restart_game request:', error);
			socket.emit('error', { message: 'Error restarting game' });
		}
	});

	socket.on('startGame', (options = {}, callback) => {
		try {
			const world = World.getWorld();
			if (!world) {
				if (callback) callback({ success: false, error: 'World not initialised' });
				return;
			}

			socket.join(world.id);
			world.status = 'playing';
			world.startTime = Date.now();
			World.markDirty();

			const humans = World.listHumanPlayers();
			if (humans.length === 1 && !options.noComputer && World.listComputerPlayers().length === 0) {
				aiRunner.addComputerPlayer();
			}

			io.to(world.id).emit('game_started', {
				gameId: world.id,
				players: broadcaster.buildPlayersList(world),
				state: broadcaster.buildGameStatePayload(world),
			});

			if (callback) callback({ success: true, gameId: world.id });
			console.log(`Game ${world.id} started by player ${playerId}`);
		} catch (error) {
			console.error('Error starting game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('disconnect_game', (_data, callback) => {
		try {
			const world = World.getWorld();
			if (!world) {
				if (callback) callback({ success: true });
				return;
			}

			try { socket.leave(world.id); } catch (_ignore) {}

			spectatorRegistry.stop(playerId);
			if (callback) callback({ success: true });
		} catch (error) {
			console.error('Error handling disconnect_game:', error);
			if (callback) callback({ success: false, error: 'Error leaving game' });
		}
	});

	socket.on('exit_game', (_data, callback) => {
		console.log(`Player ${playerId} explicitly exiting game`);
		lifecycleService.removePlayerCompletely(playerId);
		Sessions.unbind(socket.id);
		if (callback) callback({ success: true });
	});
}

module.exports = { registerLifecycleHandlers };
