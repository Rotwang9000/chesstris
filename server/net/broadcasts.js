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
			// Summarise the captured-piece basket so the client UI can
			// show "3 captured" / piece icons without us streaming the
			// whole basket on every broadcast. The full basket is
			// included for the local player only, via a separate
			// per-socket event when it changes.
			const basket = Array.isArray(record?.capturedBasket) ? record.capturedBasket : [];
			const basketSummary = basket.reduce((acc, item) => {
				const t = String(item?.type || '').toUpperCase();
				if (!t) return acc;
				acc[t] = (acc[t] || 0) + 1;
				return acc;
			}, {});
			// Per-piece breakdown that preserves the original owner's
			// colour so the player bar / nameplate can render each
			// captured-piece icon in the colour of the player whose
			// piece it was. Cap at a sane upper bound to keep the
			// payload tidy — 99% of baskets sit under 12 items.
			const capturedBreakdown = (() => {
				const counts = new Map();
				for (const item of basket) {
					const t = String(item?.type || '').toUpperCase();
					if (!t) continue;
					const colour = item?.originalColor;
					const key = `${t}|${colour}`;
					const entry = counts.get(key);
					if (entry) entry.count += 1;
					else counts.set(key, { type: t, color: colour, count: 1 });
				}
				return Array.from(counts.values());
			})();
			const credits = Array.isArray(record?.promotionCredits)
				? record.promotionCredits
				: [];
			return {
				id,
				name: record?.name || `Player_${String(id).substring(0, 6)}`,
				isComputer: !!record?.isComputer,
				// Client uses this to hide eliminated players from the
				// sidebar — the user reported beaten kings cluttering
				// the menu and pushing new joiners away from active
				// players in the spawn algorithm.
				eliminated: !!record?.eliminated,
				// Pause snapshot — used by the player bar to render a
				// "💤 paused" badge over the opponent's nameplate and
				// disable capture cursors. The pause service is the
				// source of truth; this is just the broadcast copy.
				paused: !!record?.paused,
				pauseUsesRemaining: Number.isFinite(record?.pauseState?.usesRemaining)
					? record.pauseState.usesRemaining
					: null,
				// Total count + per-type summary of captured pieces.
				// Used by the sidebar to render "Captured: 4 ♜" etc.
				capturedCount: basket.length,
				capturedSummary: basketSummary,
				// Per-piece breakdown with original owner colour for
				// the "cosmetic captured-piece colours" feature — see
				// `unifiedPlayerBar.js`.
				capturedBreakdown,
				// Banked promotion credits — each represents a pawn that
				// walked the full promotion distance and is waiting to
				// be redeemed against a captured-piece basket entry.
				promotionCreditCount: credits.length,
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
			// Active power-up orbs. Always streamed in full — the array
			// is tiny (a handful of orbs at most) and clients need it
			// to draw glowing floating spheres at the right cells.
			powerUps: Array.isArray(world.powerUps) ? world.powerUps : [],
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
			powerUps: Array.isArray(world.powerUps) ? world.powerUps : [],
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

	/**
	 * Push the full captured-piece basket to a player. We don't fold
	 * this into `game_update` because the basket is private (only the
	 * owning player should see exactly what they hold) and rarely
	 * changes, so spamming it on every broadcast would be wasteful.
	 */
	function emitCapturedBasket(playerId) {
		const world = World.getWorld();
		if (!world) return false;
		const record = world.players?.[playerId];
		const basket = Array.isArray(record?.capturedBasket) ? record.capturedBasket : [];
		return emitToPlayer(playerId, 'captured_basket', { basket });
	}

	/**
	 * Push the full promotion-credit list to a player. Like the basket
	 * this is per-player private state — the credit's `originalX/Z` tells
	 * the client where the pawn promoted, which is useful information
	 * to the owner but irrelevant to other players.
	 */
	function emitPromotionCredits(playerId) {
		const world = World.getWorld();
		if (!world) return false;
		const record = world.players?.[playerId];
		const credits = Array.isArray(record?.promotionCredits) ? record.promotionCredits : [];
		return emitToPlayer(playerId, 'promotion_credits', { credits });
	}

	function clearDeltaCache(worldId = World.getWorldId()) {
		boardDeltaCache.delete(worldId);
	}

	return {
		broadcastGameUpdate,
		emitFullStateTo,
		emitIslandDecayAnimation,
		emitToPlayer,
		emitCapturedBasket,
		emitPromotionCredits,
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
