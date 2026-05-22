/**
 * `join_game` and `create_game` socket handlers.  In the single-world
 * model both flows end with the socket joined to the global world room
 * and the player record present in `World.players`.
 */

const World = require('../world/World');
const { validatePlayerName } = require('../utils/validation');

function registerJoinHandlers(socket, ctx) {
	const {
		playerId,
		io,
		broadcaster,
		integrityService,
		lifecycleService,
		persistence,
		gameManager,
	} = ctx;

	socket.on('join_game', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Player not registered' });
				return;
			}

			const requestedName = validatePlayerName(data?.playerName);
			if (requestedName) player.name = requestedName;

			const worldId = World.getWorldId();

			// Ensures the player has a home zone + chess pieces.  If they
			// already have both, registerPlayer is a no-op and returns the
			// existing record.
			const registration = gameManager.registerPlayer(worldId, playerId, player.name, false);
			if (!registration.success) {
				console.error(`Failed to register player ${playerId}:`, registration.error);
				if (callback) callback({ success: false, error: registration.error });
				return;
			}
			persistence.markDirty();

			socket.join(worldId);

			const integrityResult = integrityService.runIslandIntegrityPass({ emitAnimation: false });
			if (integrityResult.changed) {
				persistence.markDirty();
				broadcaster.broadcastGameUpdate();
			}

			const playersList = broadcaster.buildPlayersList();

			io.to(worldId).emit('player_joined', {
				playerId,
				playerName: player.name,
				gameId: worldId,
				players: playersList,
			});

			broadcaster.emitFullStateTo(socket);

			// Send the captured-piece basket so reconnects + first
			// joins both see what they already hold. We don't bake
			// this into `game_update` because the basket is per-player
			// private state.
			if (typeof broadcaster.emitCapturedBasket === 'function') {
				try { broadcaster.emitCapturedBasket(playerId); }
				catch (basketErr) { console.warn('[Join] basket emit failed:', basketErr.message); }
			}
			if (typeof broadcaster.emitPromotionCredits === 'function') {
				try { broadcaster.emitPromotionCredits(playerId); }
				catch (creditErr) { console.warn('[Join] credits emit failed:', creditErr.message); }
			}

			if (callback) {
				callback({
					success: true,
					gameId: worldId,
					playerId,
					playerName: player.name,
					gameState: broadcaster.buildGameStatePayload(),
					players: playersList,
					timestamp: Date.now(),
				});
			}

			console.log(`Player ${playerId} joined world ${worldId}`);
		} catch (error) {
			console.error('Error joining world:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('create_game', (settings, callback) => {
		try {
			const worldId = lifecycleService.applyWorldSettings(settings || {});
			if (callback) callback({ success: true, gameId: worldId });
		} catch (error) {
			console.error('Error creating game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
}

module.exports = { registerJoinHandlers };
