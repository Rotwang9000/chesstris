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
		missingKingSweep,
	} = ctx;

	socket.on('join_game', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Player not registered' });
				return;
			}

			const requestedName = validatePlayerName(data?.playerName);
			// `'Guest'` is the client's connection placeholder — never let it
			// stomp a name the player already chose.
			if (requestedName && requestedName.toLowerCase() !== 'guest') {
				player.name = requestedName;
			}

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

			// Rescue the player on the spot if their persisted state is
			// missing a king (corruption case — see missingKingSweep
			// docs). Without this the user is locked out: the client's
			// tetromino spawn returns null because there's no king to
			// anchor against. Reloading wouldn't help either — the bad
			// state lives on the server.
			if (missingKingSweep && typeof missingKingSweep.tick === 'function') {
				try { missingKingSweep.tick(); }
				catch (rescueErr) {
					console.warn('[Join] Missing-king rescue failed:', rescueErr.message);
				}
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

	// Rename without reconnecting. The previous "Change Name" UI
	// destroyed and recreated the socket via a page reload, which
	// produced two server-side bugs at once:
	//   1. Anything mid-flight (in-flight chess move, pending
	//      tetromino) was discarded, and
	//   2. If the client raced the auto-init flow it'd send the
	//      mock `DevPlayer_xxx` name and overwrite the real name.
	// This handler exists so the client can just push a new name to
	// the server and have it broadcast in-place.
	socket.on('change_name', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Player not registered' });
				return;
			}
			const newName = validatePlayerName(data?.playerName);
			if (!newName) {
				if (callback) callback({ success: false, error: 'Invalid name' });
				return;
			}
			if (player.name === newName) {
				if (callback) callback({ success: true, playerName: newName, unchanged: true });
				return;
			}
			const previousName = player.name;
			player.name = newName;
			player.lastActiveAt = Date.now();
			World.markDirty();
			persistence.markDirty();

			const worldId = World.getWorldId();
			const playersList = broadcaster.buildPlayersList();
			io.to(worldId).emit('player_renamed', {
				playerId,
				previousName,
				playerName: newName,
				players: playersList,
			});
			broadcaster.broadcastGameUpdate();
			if (callback) callback({ success: true, playerName: newName });
		} catch (error) {
			console.error('Error renaming player:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
}

module.exports = { registerJoinHandlers };
