/**
 * Tetches World — the single source of truth for the live game on the
 * server. Everything else (sockets, AI tick loops, persistence, REST API)
 * derives from or mutates this one object.
 *
 * Design notes:
 *
 *   • There is exactly **one world** for now (the global multiplayer game).
 *     Multiple worlds can be added later by promoting this module to a
 *     `Map<worldId, WorldState>` and keying mutators by id.
 *
 *   • The world owns *gameplay* state only. Per-socket runtime state (the
 *     active socket reference, reconnect timers, AI tick intervals) lives in
 *     `Sessions.js`/`Disconnects.js`/`AiRunners.js` and is **not** persisted.
 *
 *   • Mutator functions go through this module so we can flip a `dirty` flag
 *     for the persistence layer and emit change notifications later if we
 *     ever need pub/sub-style broadcasts.
 *
 *   • Player records carry everything we need to reconstruct that player on
 *     reconnect: name, colour, balance, captured styles, cooldown
 *     timestamps, the personal 7-bag and any AI metadata.  Reconnect itself
 *     just looks up the player by id (via the cookie) and re-attaches a
 *     fresh socket reference in `Sessions`.
 */

const { BOARD_SETTINGS } = require('../game/Constants');

// Historical id (matches the legacy persisted world.json so reboots
// don't need a migration of the id itself).  Underscore, not hyphen.
const GLOBAL_WORLD_ID = 'global_game';

/** @type {WorldState} */
let world = freshWorld(GLOBAL_WORLD_ID);
let dirty = false;

/**
 * Stable per-player colour. We pick from a small palette of high-
 * contrast, distinguishable hues. Hashing on the playerId means the
 * same player gets the same hue every time the record is recreated.
 * RED is deliberately omitted from the palette — the previous
 * default of `0xDD0000` caused the "everyone is red" bug because
 * players that fell through the default branch and players that
 * legitimately rolled a red hue were indistinguishable. The local
 * player's UI palette (warm wood/red) sits on the client; the
 * server now hands out non-red hues so they never collide visually.
 */
const PLAYER_PALETTE = Object.freeze([
	'#2266dd', // royal blue
	'#22aa66', // forest green
	'#9933dd', // violet
	'#dd9922', // amber
	'#22ccbb', // teal
	'#dd66aa', // pink
	'#6688cc', // sky blue
	'#88cc22', // chartreuse
	'#cc7733', // ochre
	'#33aacc', // cyan
	'#bb44dd', // magenta
	'#669944', // olive
]);

function pickDeterministicColor(playerId) {
	const str = String(playerId || '');
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = (h * 31 + str.charCodeAt(i)) >>> 0;
	}
	return PLAYER_PALETTE[h % PLAYER_PALETTE.length];
}

/**
 * Build a fresh empty world with default settings.
 * @param {string} id
 * @returns {WorldState}
 */
function freshWorld(id = GLOBAL_WORLD_ID) {
	const now = Date.now();
	return {
		id,
		createdAt: now,
		updatedAt: now,
		startTime: null,
		status: 'active',
		result: null,

		// Tunable rules baked into this world.
		maxPlayers: BOARD_SETTINGS.MAX_PLAYERS_PER_GAME,
		homeZoneDistance: BOARD_SETTINGS.HOME_ZONE_DISTANCE,
		gameMode: 'standard',
		difficulty: 'normal',
		startLevel: 1,
		renderMode: '3d',
		turnPhase: 'tetris',

		// Sparse 3D board.  Cells are indexed by `${x},${z}` and contain
		// arrays of layered content items (`home`, `tetromino`, `chess`).
		board: {
			cells: {},
			minX: 0,
			maxX: 0,
			minZ: 0,
			maxZ: 0,
		},

		// Top-level chess pieces (mirrors the chess content on the board so
		// movement code can iterate without scanning every cell).
		chessPieces: [],

		// Connectivity components (cached for AI / decay heuristics).
		islands: [],

		// Per-player records keyed by playerId.  See createPlayerRecord().
		players: {},

		// Per-player home zones keyed by playerId.
		homeZones: {},

		// Per-player turn-state for the chess/tetris alternation.
		currentTurns: {},

		// Captured-king ledger (one entry per king ever taken).
		kingPrison: [],

		// Recently-recorded king captures awaiting the
		// `SIMULTANEOUS_CAPTURE_WINDOW_MS` window so we can detect
		// reciprocal captures and trigger the King's Duel mini-game.
		pendingKingCaptures: [],

		// Per-cell decay bookkeeping for territory that's become
		// disconnected from its owning player's king. Each entry is a
		// `${playerId}:${x},${z}` keyed object holding:
		//   - `since`:        epoch ms when the cell first lost its link.
		//   - `moveSnapshot`: the owning player's `moveCount` at that
		//                     moment.
		// The cell decays once **either** of these thresholds is hit:
		//   - The player has taken `IslandManager.DISCONNECTED_MOVE_LIMIT`
		//     moves without bridging back (active-player decay).
		//   - `IslandManager.DISCONNECTED_TIME_LIMIT_MS` of wall-clock has
		//     elapsed (backstop for AFK players).
		// Islands carrying a chess piece use the higher
		// `DISCONNECTED_PIECE_*` thresholds so losing a piece always
		// requires more inaction than losing terrain.
		disconnectedSince: {},

		// Most recent globally-broadcast action (small enough to be safely
		// included in `game_update` deltas).
		lastAction: null,

		// Active power-up orbs (struggling-player aid pickups). Spawned
		// by `PowerUpManager` and claimed when a tetromino lands on the
		// orb cell. Deliberately mutable in-place: persistence captures
		// them on the next save, but a server-restart that drops them is
		// harmless (they regenerate within a minute).
		powerUps: [],
	};
}

/**
 * Build a new player record with sensible defaults.  Callers can override
 * any field.
 *
 * @param {string} playerId
 * @param {Partial<PlayerRecord>} [overrides]
 * @returns {PlayerRecord}
 */
function createPlayerRecord(playerId, overrides = {}) {
	const now = Date.now();
	return {
		id: playerId,
		// In the single-world model every player belongs to the singleton.
		// Stored explicitly so legacy code that reads `player.gameId`
		// keeps working without special-casing.
		gameId: GLOBAL_WORLD_ID,
		name: overrides.name || `Player_${String(playerId).substring(0, 6)}`,
		// We used to default to red (0xDD0000), so any player that
		// arrived through `upsertPlayer` from `connection.js`
		// *before* `PlayerManager.register` later set a real color
		// got stuck red — and because that red counts as truthy, the
		// register path's `existing.color || generateRandomColor()`
		// preserved the broken value. The user reported "all the
		// pieces are red" because half the world had this baked-in
		// default. Picking a deterministic per-id colour at record
		// creation kills the bug at the source and stays stable
		// across reconnects.
		color: overrides.color || pickDeterministicColor(playerId),

		isObserver: false,
		isComputer: false,
		eliminated: false,

		balance: 0,
		capturedStyles: [],

		// Pieces captured from opponents (other than pawns). Each entry
		// records { type, originalOwner, originalOwnerName, capturedAt }.
		// Used by the promotion-redeem flow: a pawn that walks the full
		// promotion distance becomes a credit; the player can later
		// spend a credit + one matching basket entry to deploy that
		// captured piece.
		capturedBasket: [],

		// Banked promotion credits — one entry per pawn that completed
		// the promotion walk. Format:
		//   { id, originalX, originalZ, createdAt }
		// Redeemed via `redeem_promotion { creditId, capturedType }`
		// which spawns the chosen captured piece at the original cell
		// (or the nearest owned cell to the king if the original is
		// gone). Persistent across sessions.
		promotionCredits: [],

		// Cooldowns
		lastTetrominoPlacement: null,
		lastTetrominoPlacementAt: 0,
		lastChessMoveAt: 0,
		lastActiveAt: now,

		// Monotonic counter of *committed* turns this player has taken
		// (one tetromino placement + one chess move per turn). Used by
		// the move-based disconnected-island decay (bible §15.2) so a
		// player who's actively making moves elsewhere on the board
		// eventually loses stranded territory regardless of wall-clock
		// time.
		moveCount: 0,

		// 7-bag tetromino state
		tetrominoBag: [],
		availableTetrominos: [],

		// AI-only fields (populated when isComputer === true)
		difficulty: null,
		minMoveInterval: 0,
		consecutiveMoves: 0,
		lastMoveTime: 0,

		...overrides,
	};
}

// ── Read API ───────────────────────────────────────────────────────────────

/** @returns {WorldState} The single world (mutable; callers should mark
 *  dirty after edits). */
function getWorld() {
	return world;
}

/** @returns {string} */
function getWorldId() {
	return world.id;
}

function getPlayer(playerId) {
	if (!playerId) return null;
	return world.players[playerId] || null;
}

function getOrCreatePlayer(playerId, overrides = {}) {
	if (!world.players[playerId]) {
		world.players[playerId] = createPlayerRecord(playerId, overrides);
		markDirty();
	}
	return world.players[playerId];
}

function listPlayers() {
	return Object.values(world.players);
}

function listHumanPlayers() {
	return listPlayers().filter(p => !p.isComputer);
}

function listComputerPlayers() {
	return listPlayers().filter(p => p.isComputer);
}

function listActivePlayers() {
	return listPlayers().filter(p => !p.eliminated && !p.isObserver);
}

function playerCount() {
	return Object.keys(world.players).length;
}

function isFull() {
	return playerCount() >= world.maxPlayers;
}

// ── Mutate API ─────────────────────────────────────────────────────────────

/**
 * Add (or replace) a player.  Callers should call `markDirty()` themselves
 * after follow-up edits like assigning a home zone.
 */
function upsertPlayer(playerId, overrides = {}) {
	const existing = world.players[playerId];
	world.players[playerId] = existing
		? { ...existing, ...overrides }
		: createPlayerRecord(playerId, overrides);
	markDirty();
	return world.players[playerId];
}

function removePlayer(playerId) {
	if (!world.players[playerId]) return false;
	delete world.players[playerId];
	delete world.homeZones[playerId];
	delete world.currentTurns[playerId];
	world.chessPieces = world.chessPieces.filter(
		piece => piece && String(piece.player) !== String(playerId)
	);
	for (const key of Object.keys(world.board.cells)) {
		const cell = world.board.cells[key];
		if (!Array.isArray(cell)) continue;
		const filtered = cell.filter(item => !item || String(item.player) !== String(playerId));
		if (filtered.length === 0) delete world.board.cells[key];
		else world.board.cells[key] = filtered;
	}
	markDirty();
	return true;
}

/**
 * Mark a player as eliminated. Their pieces and territory are NOT
 * immediately removed — that's the chess `executeKingCapture` flow's job.
 */
function eliminatePlayer(playerId) {
	const p = world.players[playerId];
	if (!p) return false;
	p.eliminated = true;
	markDirty();
	return true;
}

function setLastAction(action) {
	world.lastAction = { ...action, timestamp: Date.now() };
	markDirty();
}

/**
 * Replace the entire world with a snapshot loaded from disk. Used by
 * persistence on startup. Throws if the snapshot is structurally invalid.
 */
function restoreWorldFromSnapshot(snapshot) {
	if (!snapshot || typeof snapshot !== 'object') {
		throw new Error('restoreWorldFromSnapshot: snapshot is not an object');
	}
	if (!snapshot.id || !snapshot.board || !snapshot.players) {
		throw new Error('restoreWorldFromSnapshot: snapshot missing required fields');
	}
	const fresh = freshWorld(snapshot.id);
	const players = snapshot.players || {};
	// Backfill new player-record fields onto restored records so we
	// don't have to scatter null-guards across the server when a new
	// field is introduced. Cheap (constant time per player on boot).
	const remappedRedToColour = {};
	for (const pid of Object.keys(players)) {
		const p = players[pid];
		if (!p) continue;
		if (!Array.isArray(p.capturedBasket)) p.capturedBasket = [];
		if (!Array.isArray(p.promotionCredits)) p.promotionCredits = [];
		if (!Array.isArray(p.capturedStyles)) p.capturedStyles = [];
		// One-shot migration: any player carrying the legacy default
		// red gets remapped to a deterministic palette colour. Without
		// this, persistence preserves the bug we just fixed in
		// createPlayerRecord forever.
		const isLegacyRed =
			p.color === 0xDD0000 ||
			p.color === 14483456 ||
			(typeof p.color === 'string' && /^#?dd0000$/i.test(p.color));
		if (isLegacyRed) {
			const replacement = pickDeterministicColor(pid);
			remappedRedToColour[pid] = replacement;
			p.color = replacement;
		}
	}
	let didMigrateColours = false;
	if (Object.keys(remappedRedToColour).length > 0) {
		didMigrateColours = true;
		console.log(`[World] Migrated ${Object.keys(remappedRedToColour).length} legacy-red player(s) to palette colours.`);
		// Cascade the new colours onto every chess piece that carried
		// the bad red so the client doesn't render mixed palettes
		// until those pieces happen to be respawned.
		const pieces = Array.isArray(snapshot.chessPieces) ? snapshot.chessPieces : [];
		for (const piece of pieces) {
			if (!piece) continue;
			const newColour = remappedRedToColour[piece.player];
			if (!newColour) continue;
			const isBadRed =
				piece.color === 0xDD0000 ||
				piece.color === 14483456 ||
				(typeof piece.color === 'string' && /^#?dd0000$/i.test(piece.color));
			if (isBadRed) piece.color = newColour;
		}
	}
	// Dedupe restored chess pieces by id. Earlier code paths could
	// occasionally double-push the same piece (e.g. the chess-move
	// handler reassigning `chessPieces[idx] = piece` while a stale
	// duplicate sat further along the array). Restoring the snapshot
	// as-is would replay the corruption forever; cleaning it here is
	// cheap and idempotent.
	let restoredPieces = Array.isArray(snapshot.chessPieces) ? snapshot.chessPieces : [];
	{
		const seen = new Set();
		const deduped = [];
		let droppedDuplicates = 0;
		for (const piece of restoredPieces) {
			if (!piece || !piece.id) {
				deduped.push(piece);
				continue;
			}
			const id = String(piece.id);
			if (seen.has(id)) { droppedDuplicates++; continue; }
			seen.add(id);
			deduped.push(piece);
		}
		if (droppedDuplicates > 0) {
			console.log(`[World] Restore deduped ${droppedDuplicates} duplicate chess piece(s).`);
		}
		restoredPieces = deduped;
	}

	world = {
		...fresh,
		...snapshot,
		board: snapshot.board,
		chessPieces: restoredPieces,
		islands: Array.isArray(snapshot.islands) ? snapshot.islands : [],
		players,
		homeZones: snapshot.homeZones || {},
		currentTurns: snapshot.currentTurns || {},
		kingPrison: Array.isArray(snapshot.kingPrison) ? snapshot.kingPrison : [],
		pendingKingCaptures: Array.isArray(snapshot.pendingKingCaptures) ? snapshot.pendingKingCaptures : [],
		pendingCheck: (snapshot.pendingCheck && typeof snapshot.pendingCheck === 'object')
			? snapshot.pendingCheck
			: null,
		disconnectedSince: (snapshot.disconnectedSince && typeof snapshot.disconnectedSince === 'object')
			? snapshot.disconnectedSince
			: {},
		activityLog: Array.isArray(snapshot.activityLog) ? snapshot.activityLog : [],
		_activityLogNextId: Number.isFinite(snapshot._activityLogNextId) ? snapshot._activityLogNextId : 1,
		powerUps: Array.isArray(snapshot.powerUps) ? snapshot.powerUps : [],
	};
	// If we mutated the snapshot to fix legacy red colours, mark
	// the world dirty so the next persistence cycle flushes the
	// repair to disk. Without this the migration log would run on
	// every boot until something else happened to dirty the world.
	dirty = didMigrateColours === true;
}

/**
 * Wipe the world back to its initial empty state. Used for tests.
 */
function resetWorld(id = GLOBAL_WORLD_ID) {
	world = freshWorld(id);
	dirty = false;
}

// ── Dirty-tracking for persistence ─────────────────────────────────────────

function markDirty() {
	dirty = true;
	world.updatedAt = Date.now();
}

function isDirty() {
	return dirty;
}

function clearDirty() {
	dirty = false;
}

module.exports = {
	GLOBAL_WORLD_ID,
	getWorld,
	getWorldId,
	getPlayer,
	getOrCreatePlayer,
	upsertPlayer,
	removePlayer,
	eliminatePlayer,
	listPlayers,
	listHumanPlayers,
	listComputerPlayers,
	listActivePlayers,
	playerCount,
	isFull,
	createPlayerRecord,
	setLastAction,
	restoreWorldFromSnapshot,
	resetWorld,
	markDirty,
	isDirty,
	clearDirty,
};
