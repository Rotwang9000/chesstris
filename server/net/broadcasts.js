/**
 * `game_update` broadcasts and the sparse-board-delta cache that backs
 * them.
 *
 * Every fan-out broadcast goes through `broadcastGameUpdate` so we can
 * piggy-back delta calculation and `persistence.markDirty()` on a single
 * call site.  When too many cells change we fall back to a full update.
 */

const World = require('../world/World');
const Sessions = require('../world/Sessions');

const MAX_BOARD_DELTA_CELLS = 800;
const ISLAND_DECAY_ANIMATION_MAX_CELLS = 160;

function createBroadcaster({ io, persistence }) {
	if (!io) throw new Error('createBroadcaster: io is required');
	if (!persistence) throw new Error('createBroadcaster: persistence is required');

	// One delta cache per world id.  In the single-world model this map only
	// ever has one entry, but keeping it keyed keeps future multi-world
	// support trivial.
	const boardDeltaCache = new Map();

	function parseBoardKey(key) {
		const [xStr, zStr] = String(key).split(',');
		return { x: Number(xStr), z: Number(zStr) };
	}

	function snapshotBoard(board) {
		const next = new Map();
		if (!board || !board.cells) return next;
		for (const [key, value] of Object.entries(board.cells)) {
			next.set(key, JSON.stringify(value));
		}
		return next;
	}

	function computeBoardDelta(worldId, board) {
		if (!board || typeof board.cells !== 'object') {
			return {
				fullUpdate: true,
				board,
				boardChanges: [],
				removedCells: [],
				boardBounds: null,
			};
		}

		const prev = boardDeltaCache.get(worldId);
		const next = snapshotBoard(board);
		const boardBounds = {
			minX: board.minX,
			maxX: board.maxX,
			minZ: board.minZ,
			maxZ: board.maxZ,
		};

		if (!prev) {
			boardDeltaCache.set(worldId, next);
			return { fullUpdate: true, board, boardChanges: [], removedCells: [], boardBounds };
		}

		const boardChanges = [];
		for (const [key, serialised] of next.entries()) {
			if (prev.get(key) !== serialised) {
				const { x, z } = parseBoardKey(key);
				boardChanges.push({ x, z, value: JSON.parse(serialised) });
			}
		}

		const removedCells = [];
		for (const key of prev.keys()) {
			if (!next.has(key)) {
				const { x, z } = parseBoardKey(key);
				removedCells.push({ x, z });
			}
		}

		boardDeltaCache.set(worldId, next);

		const totalDelta = boardChanges.length + removedCells.length;
		const fullUpdate = totalDelta > MAX_BOARD_DELTA_CELLS;
		return {
			fullUpdate,
			board: fullUpdate ? board : null,
			boardChanges: fullUpdate ? [] : boardChanges,
			removedCells: fullUpdate ? [] : removedCells,
			boardBounds,
		};
	}

	/**
	 * Build the player-summary array (`{id, name, isComputer}`) used by all
	 * game_update / player_joined / player_left broadcasts.
	 */
	function buildPlayersList(world = World.getWorld()) {
		const players = world && world.players ? world.players : {};
		return Object.keys(players).map(id => {
			const record = players[id];
			return {
				id,
				name: record?.name || `Player_${String(id).substring(0, 6)}`,
				isComputer: !!record?.isComputer,
				// Client uses this to hide eliminated players from the
				// sidebar — the user reported beaten kings cluttering
				// the menu and pushing new joiners away from active
				// players in the spawn algorithm.
				eliminated: !!record?.eliminated,
			};
		});
	}

	function buildBoardBounds(board) {
		if (!board) return undefined;
		return {
			minX: board.minX,
			maxX: board.maxX,
			minZ: board.minZ,
			maxZ: board.maxZ,
		};
	}

	/**
	 * Strip non-serialisable / private fields and return a payload-safe
	 * snapshot of the world for socket clients.
	 */
	function buildGameStatePayload(world = World.getWorld()) {
		return {
			id: world.id,
			board: world.board,
			chessPieces: world.chessPieces,
			homeZones: world.homeZones,
			islands: world.islands,
			currentTurns: world.currentTurns,
			kingPrison: world.kingPrison,
			pendingKingCaptures: world.pendingKingCaptures,
			lastAction: world.lastAction,
			disconnectedSince: world.disconnectedSince || {},
			gameMode: world.gameMode,
			difficulty: world.difficulty,
			startLevel: world.startLevel,
			renderMode: world.renderMode,
			turnPhase: world.turnPhase,
			status: world.status,
			result: world.result,
			startTime: world.startTime,
			maxPlayers: world.maxPlayers,
			homeZoneDistance: world.homeZoneDistance,
			gameId: world.id,
		};
	}

	/**
	 * Broadcast a state update.  Uses a sparse delta when the change set is
	 * small; otherwise sends a full snapshot.
	 */
	function broadcastGameUpdate({ forceFullUpdate = false } = {}) {
		const world = World.getWorld();
		if (!world) return;

		persistence.markDirty();

		const worldId = world.id;
		const timestamp = Date.now();
		const playersList = buildPlayersList(world);
		const fullPayload = buildGameStatePayload(world);

		const delta = computeBoardDelta(worldId, world.board);
		const useFull = forceFullUpdate || delta.fullUpdate;

		if (useFull) {
			io.to(worldId).emit('game_update', {
				...fullPayload,
				players: playersList,
				boardBounds: buildBoardBounds(world.board),
				timestamp,
				fullUpdate: true,
			});
			return;
		}

		io.to(worldId).emit('game_update', {
			timestamp,
			fullUpdate: false,
			boardChanges: delta.boardChanges,
			removedCells: delta.removedCells,
			boardBounds: delta.boardBounds,
			chessPieces: world.chessPieces,
			lastAction: world.lastAction,
			disconnectedSince: world.disconnectedSince || {},
			players: playersList,
		});
	}

	/**
	 * Send a full game state payload to a single socket (used for join,
	 * spectator catch-up, explicit state requests etc).
	 */
	function emitFullStateTo(socket, { stateOverride = null } = {}) {
		const world = World.getWorld();
		if (!world || !socket) return;
		const state = stateOverride || world;
		socket.emit('game_update', {
			...buildGameStatePayload(state),
			players: buildPlayersList(world),
			boardBounds: buildBoardBounds(state.board),
			timestamp: Date.now(),
			fullUpdate: true,
		});
	}

	function emitIslandDecayAnimation(cells) {
		if (!Array.isArray(cells) || cells.length === 0) return;

		let payloadCells = cells;
		if (cells.length > ISLAND_DECAY_ANIMATION_MAX_CELLS) {
			const step = Math.ceil(cells.length / ISLAND_DECAY_ANIMATION_MAX_CELLS);
			payloadCells = cells.filter((_, idx) => idx % step === 0)
				.slice(0, ISLAND_DECAY_ANIMATION_MAX_CELLS);
		}

		io.to(World.getWorldId()).emit('island_decay', {
			cells: payloadCells,
			totalCells: cells.length,
		});
	}

	/**
	 * Direct-message a player. Falls back silently when the player isn't
	 * online or doesn't have an active socket. Callers should *not* rely
	 * on every player receiving the event — this is best-effort.
	 */
	function emitToPlayer(playerId, eventName, payload) {
		try {
			const socket = Sessions.socketForPlayer(playerId);
			if (!socket || typeof socket.emit !== 'function') return false;
			socket.emit(eventName, payload);
			return true;
		} catch (error) {
			console.error('[Broadcast] emitToPlayer failed:', error);
			return false;
		}
	}

	function clearDeltaCache(worldId = World.getWorldId()) {
		boardDeltaCache.delete(worldId);
	}

	return {
		broadcastGameUpdate,
		emitFullStateTo,
		emitIslandDecayAnimation,
		emitToPlayer,
		buildPlayersList,
		buildBoardBounds,
		buildGameStatePayload,
		clearDeltaCache,
		parseBoardKey,
	};
}

module.exports = {
	createBroadcaster,
	MAX_BOARD_DELTA_CELLS,
	ISLAND_DECAY_ANIMATION_MAX_CELLS,
};
