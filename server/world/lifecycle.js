/**
 * High-level world & player lifecycle helpers.  These compose the lower
 * level world / integrity / disconnect modules into single-call
 * operations that the socket and bootstrap layers can invoke directly.
 */

const World = require('../world/World');
const Sessions = require('../world/Sessions');
const Disconnects = require('../world/Disconnects');
const { BOARD_SETTINGS } = require('../game/Constants');

function createLifecycleService({
	io,
	gameManager,
	broadcaster,
	integrityService,
	homeZoneDegradation,
	aiRunner,
	persistence,
	spectatorRegistry,
	activityLog = null,
}) {
	if (!io) throw new Error('createLifecycleService: io required');
	if (!gameManager) throw new Error('createLifecycleService: gameManager required');
	if (!broadcaster) throw new Error('createLifecycleService: broadcaster required');
	if (!integrityService) throw new Error('createLifecycleService: integrityService required');
	if (!homeZoneDegradation) throw new Error('createLifecycleService: homeZoneDegradation required');
	if (!aiRunner) throw new Error('createLifecycleService: aiRunner required');
	if (!persistence) throw new Error('createLifecycleService: persistence required');

	function recordPiecesLostForPlayer(playerId, reason) {
		if (!activityLog) return;
		try {
			const world = World.getWorld();
			if (!world || !Array.isArray(world.chessPieces)) return;
			const lostPieces = world.chessPieces.filter(
				p => p && String(p.player) === String(playerId)
			);
			if (lostPieces.length === 0) return;
			const player = world.players ? world.players[playerId] : null;
			activityLog.recordPiecesLost({
				playerId,
				playerName: (player && (player.username || player.name)) || playerId,
				pieceCount: lostPieces.length,
				pieces: lostPieces.slice(0, 8).map(p => ({
					pieceType: String(p.type || '').toLowerCase(),
					pieceId: p.id,
					x: p.position?.x,
					z: p.position?.z,
				})),
				reason: reason || 'player_left',
			});
		} catch (err) {
			console.warn('[Lifecycle] activity log failed:', err.message);
		}
	}

	/**
	 * Fully remove a player from the world (after the grace period expires
	 * or on explicit `exit_game`).  Cleans up the AI tick interval if any
	 * and broadcasts the resulting roster.
	 */
	function removePlayerCompletely(playerId) {
		const record = World.getPlayer(playerId);
		if (!record) {
			Disconnects.clear(playerId);
			return;
		}

		aiRunner.stopAiPlayer(playerId);
		homeZoneDegradation.forgetPlayer(playerId);

		recordPiecesLostForPlayer(playerId, 'player_left');
		World.removePlayer(playerId);
		Disconnects.clear(playerId);

		const integrityResult = integrityService.runIslandIntegrityPass({ emitAnimation: false });
		if (integrityResult.changed) {
			broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
		}

		io.to(World.getWorldId()).emit('player_left', {
			playerId,
			gameId: World.getWorldId(),
			players: broadcaster.buildPlayersList(),
		});

		persistence.markDirty();
	}

	/**
	 * Restart the world: keep the current player roster, but reset the
	 * board, chess pieces, home zones and all ephemeral state.  AI bots
	 * are re-registered so their home zone + chess pieces are recreated.
	 */
	function restartWorld({ requestedBy = null } = {}) {
		const roster = World.listPlayers().map(p => ({
			id: p.id,
			name: p.name,
			isComputer: !!p.isComputer,
			difficulty: p.difficulty || null,
			minMoveInterval: p.minMoveInterval || 0,
		}));

		aiRunner.stopAll();
		homeZoneDegradation.reset();
		broadcaster.clearDeltaCache();

		World.resetWorld(World.GLOBAL_WORLD_ID);
		const world = World.getWorld();
		world.maxPlayers = roster.length || world.maxPlayers;
		world.startTime = Date.now();
		world.status = 'playing';
		world.turnPhase = 'tetris';
		World.markDirty();

		for (const r of roster) {
			if (r.isComputer) {
				aiRunner.registerAi(r.id, r.difficulty || 'medium', r.minMoveInterval || 10000, r.name);
			} else {
				gameManager.registerPlayer(World.GLOBAL_WORLD_ID, r.id, r.name, false);
			}
		}

		broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
		io.to(World.getWorldId()).emit('game_state', {
			gameId: World.getWorldId(),
			state: broadcaster.buildGameStatePayload(),
			players: broadcaster.buildPlayersList(),
		});

		console.log(`World ${World.getWorldId()} restarted${requestedBy ? ` by ${requestedBy}` : ''}`);
	}

	/**
	 * Apply the cosmetic settings passed via the legacy `create_game` /
	 * `startGame` flow.  In the single-world model this just tweaks
	 * tunables on the existing world.
	 */
	function applyWorldSettings(settings = {}) {
		const world = World.getWorld();
		world.maxPlayers = settings.maxPlayers || BOARD_SETTINGS.MAX_PLAYERS_PER_GAME;
		world.homeZoneDistance = BOARD_SETTINGS.HOME_ZONE_DISTANCE;
		world.gameMode = settings.gameMode || world.gameMode || 'standard';
		world.difficulty = settings.difficulty || world.difficulty || 'normal';
		world.startLevel = settings.startLevel || world.startLevel || 1;
		world.renderMode = settings.renderMode || world.renderMode || '3d';
		World.markDirty();
		return world.id;
	}

	function endWorld(result) {
		const world = World.getWorld();
		world.status = 'game_over';
		world.result = result;
		World.markDirty();
		broadcaster.clearDeltaCache();
		io.to(world.id).emit('game_over', result);
		console.log(`World ${world.id} ended. Winner: ${result?.winner ?? 'unknown'}`);
	}

	/**
	 * Repair stale state: when a player is in the world's roster but their
	 * board presence has been wiped (because of a crash mid-update or
	 * legacy data), drop them and re-register fresh.
	 */
	function rehydratePlayer(playerId, playerName) {
		const world = World.getWorld();
		if (!world) return { success: false, error: 'World not initialised' };

		const pid = String(playerId);
		recordPiecesLostForPlayer(playerId, 'rehydrate');
		delete world.players[playerId];
		delete world.homeZones[playerId];
		world.chessPieces = world.chessPieces.filter(
			piece => piece && String(piece.player) !== pid
		);
		for (const [key, cellContents] of Object.entries(world.board.cells)) {
			if (!Array.isArray(cellContents)) {
				delete world.board.cells[key];
				continue;
			}
			const remaining = cellContents.filter(item => {
				if (!item) return false;
				const ownerId = item.player != null
					? String(item.player)
					: (item.chessPiece && item.chessPiece.player != null
						? String(item.chessPiece.player) : null);
				return ownerId !== pid;
			});
			if (remaining.length > 0) world.board.cells[key] = remaining;
			else delete world.board.cells[key];
		}

		const registration = gameManager.registerPlayer(World.GLOBAL_WORLD_ID, playerId, playerName, false);
		if (!registration || !registration.success) {
			return registration || { success: false, error: 'Failed to re-register player' };
		}

		World.markDirty();
		return { success: true, homeZone: registration.homeZone || world.homeZones[playerId] || null };
	}

	return {
		removePlayerCompletely,
		restartWorld,
		applyWorldSettings,
		endWorld,
		rehydratePlayer,
	};
}

module.exports = { createLifecycleService };
