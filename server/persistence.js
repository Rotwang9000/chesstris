/**
 * World Persistence for Tetches
 *
 * Saves and restores **the** single authoritative world (see
 * `server/world/World.js`) so that server restarts, code upgrades and
 * rule changes don't wipe the global game.
 *
 * File layout:
 *   data/world.json          — current snapshot
 *   data/world.json.bak      — previous snapshot (safety net)
 *
 * Snapshot schema (v2):
 *   {
 *     version: 2,
 *     savedAt: <ISO string>,
 *     world: <WorldState>             // see World.js
 *   }
 *
 * Legacy snapshots (v1) used a split `game` / `gameManagerGame`
 * structure plus separate `humanPlayers` / `computerPlayers` /
 * `persistentPlayers` maps.  `loadWorld()` migrates those forward.
 */

const fs = require('fs');
const path = require('path');

const { BOARD_SETTINGS } = require('./game/Constants');
const World = require('./world/World');
// metrics is a fire-and-forget side-effect; load it lazily so test
// environments that mock the persistence module don't pull in the
// Prometheus registry.
let _metrics = null;
function metrics() {
	if (_metrics === null) {
		try { _metrics = require('./observability/metrics'); }
		catch (_e) { _metrics = false; }
	}
	return _metrics;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'world.json');
const BACKUP_FILE = STATE_FILE + '.bak';
const ROLLING_BACKUP_DIR = path.join(DATA_DIR, 'backups');

const CURRENT_VERSION = 2;
const SAVE_INTERVAL_MS = 30000;
const SAVE_THROTTLE_MS = 10000;
// Take a snapshot copy at most once per hour, keep this many.
// Restoring from a rolling backup is a manual `mv` — we're not
// trying to be a full DB, just buying ourselves an "oh god the
// world.json got corrupt" rewind.
const ROLLING_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const ROLLING_BACKUP_KEEP = 6;

let _lastSaveTs = 0;
let _lastRollingBackupTs = 0;
let _saveTimer = null;

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
}

function ensureBackupDir() {
	if (!fs.existsSync(ROLLING_BACKUP_DIR)) {
		fs.mkdirSync(ROLLING_BACKUP_DIR, { recursive: true });
	}
}

/**
 * Copy the current state file into the rolling-backup directory if
 * we haven't done so recently. Cheap, idempotent, and keeps at most
 * `ROLLING_BACKUP_KEEP` files by mtime (oldest gets pruned).
 *
 * Called from the auto-save tick so the backup cadence is bounded
 * by the save cadence and not a separate timer.
 */
function maybeRollBackup() {
	if (!fs.existsSync(STATE_FILE)) return;
	const now = Date.now();
	if (now - _lastRollingBackupTs < ROLLING_BACKUP_INTERVAL_MS) return;
	try {
		ensureBackupDir();
		const stamp = new Date(now)
			.toISOString()
			.replace(/[:.]/g, '-')
			.replace(/T/, '_')
			.replace(/Z$/, '');
		const target = path.join(ROLLING_BACKUP_DIR, `world.${stamp}.json`);
		fs.copyFileSync(STATE_FILE, target);
		_lastRollingBackupTs = now;
		// Prune by mtime — leave the newest `ROLLING_BACKUP_KEEP`.
		const entries = fs.readdirSync(ROLLING_BACKUP_DIR)
			.filter(f => f.startsWith('world.') && f.endsWith('.json'))
			.map(f => {
				const full = path.join(ROLLING_BACKUP_DIR, f);
				return { full, mtimeMs: fs.statSync(full).mtimeMs };
			})
			.sort((a, b) => b.mtimeMs - a.mtimeMs);
		for (const { full } of entries.slice(ROLLING_BACKUP_KEEP)) {
			try { fs.unlinkSync(full); }
			catch (_err) { /* best-effort */ }
		}
	} catch (err) {
		console.warn('[Persistence] Rolling backup failed:', err.message);
	}
}

// ── Save ──────────────────────────────────────────────────────────────────

/**
 * Build a serialisable snapshot of the live world. The world's player
 * records already carry all the persistent fields we care about
 * (cooldowns, balance, AI metadata, etc.); we just drop runtime-only
 * helpers like AI strategy callbacks.
 */
function buildSnapshot() {
	const world = World.getWorld();
	if (!world) return null;

	const persistablePlayers = {};
	for (const [id, p] of Object.entries(world.players)) {
		persistablePlayers[id] = {
			id: p.id,
			name: p.name,
			color: p.color,
			isObserver: !!p.isObserver,
			isComputer: !!p.isComputer,
			eliminated: !!p.eliminated,
			balance: typeof p.balance === 'number' ? p.balance : 0,
			capturedStyles: Array.isArray(p.capturedStyles) ? p.capturedStyles : [],
			// New per-player ledgers (added with the promotion-credit
			// rework). Without these the player loses every captured
			// piece + banked credit on a server restart.
			capturedBasket: Array.isArray(p.capturedBasket) ? p.capturedBasket : [],
			promotionCredits: Array.isArray(p.promotionCredits) ? p.promotionCredits : [],
			lastTetrominoPlacement: p.lastTetrominoPlacement || null,
			lastTetrominoPlacementAt: p.lastTetrominoPlacementAt || 0,
			lastChessMoveAt: p.lastChessMoveAt || 0,
			lastActiveAt: p.lastActiveAt || 0,
			moveCount: Number.isFinite(p.moveCount) ? p.moveCount : 0,
			tetrominoBag: Array.isArray(p.tetrominoBag) ? p.tetrominoBag : [],
			availableTetrominos: Array.isArray(p.availableTetrominos) ? p.availableTetrominos : [],
			difficulty: p.difficulty || null,
			minMoveInterval: p.minMoveInterval || 0,
			consecutiveMoves: p.consecutiveMoves || 0,
			lastMoveTime: p.lastMoveTime || 0,
		};
	}

	return {
		version: CURRENT_VERSION,
		savedAt: new Date().toISOString(),
		world: {
			id: world.id,
			createdAt: world.createdAt,
			updatedAt: world.updatedAt,
			startTime: world.startTime || null,
			status: world.status,
			result: world.result || null,
			maxPlayers: world.maxPlayers,
			homeZoneDistance: world.homeZoneDistance,
			gameMode: world.gameMode,
			difficulty: world.difficulty || 'normal',
			startLevel: world.startLevel || 1,
			renderMode: world.renderMode || '3d',
			turnPhase: world.turnPhase || 'tetris',
			board: world.board,
			chessPieces: world.chessPieces,
			islands: world.islands,
			homeZones: world.homeZones,
			currentTurns: world.currentTurns,
			kingPrison: Array.isArray(world.kingPrison) ? world.kingPrison : [],
			pendingKingCaptures: Array.isArray(world.pendingKingCaptures) ? world.pendingKingCaptures : [],
			disconnectedSince: (world.disconnectedSince && typeof world.disconnectedSince === 'object')
				? world.disconnectedSince
				: {},
			lastAction: world.lastAction,
			activityLog: Array.isArray(world.activityLog) ? world.activityLog.slice() : [],
			_activityLogNextId: Number.isFinite(world._activityLogNextId) ? world._activityLogNextId : 1,
			players: persistablePlayers,
			powerUps: Array.isArray(world.powerUps) ? world.powerUps.slice() : [],
		},
	};
}

/** Atomically write the snapshot. */
function writeSnapshotSync(snapshot) {
	ensureDataDir();
	const json = JSON.stringify(snapshot, null, 2);
	const tmpFile = STATE_FILE + '.tmp';

	if (fs.existsSync(STATE_FILE)) {
		try { fs.copyFileSync(STATE_FILE, BACKUP_FILE); }
		catch (_e) { /* best-effort backup */ }
	}
	fs.writeFileSync(tmpFile, json, 'utf8');
	fs.renameSync(tmpFile, STATE_FILE);
}

/** Save the world right now (synchronous, safe for shutdown hooks). */
function saveWorldSync() {
	try {
		const snapshot = buildSnapshot();
		if (!snapshot) {
			console.log('[Persistence] Nothing to save (world not initialised).');
			return false;
		}
		writeSnapshotSync(snapshot);
		_lastSaveTs = Date.now();
		World.clearDirty();
		const w = snapshot.world;
		const cellCount = Object.keys(w.board.cells || {}).length;
		const playerCount = Object.keys(w.players || {}).length;
		console.log(`[Persistence] World saved (${cellCount} cells, ${playerCount} players).`);
		const m = metrics();
		if (m && m.recordSaveResult) m.recordSaveResult(true);
		return true;
	} catch (err) {
		console.error('[Persistence] Failed to save world:', err.message);
		const m = metrics();
		if (m && m.recordSaveResult) m.recordSaveResult(false);
		return false;
	}
}

function markDirty() {
	World.markDirty();
}

function startAutoSave() {
	if (_saveTimer) return;
	_saveTimer = setInterval(() => {
		if (!World.isDirty()) return;
		const now = Date.now();
		if (now - _lastSaveTs < SAVE_THROTTLE_MS) return;
		if (saveWorldSync()) maybeRollBackup();
	}, SAVE_INTERVAL_MS);
	if (typeof _saveTimer.unref === 'function') _saveTimer.unref();
}

function stopAutoSave() {
	if (_saveTimer) {
		clearInterval(_saveTimer);
		_saveTimer = null;
	}
}

// ── Load + migrate ────────────────────────────────────────────────────────

/**
 * Read a JSON file, returning null on missing/invalid file.
 */
function readSnapshotFile(filePath) {
	if (!fs.existsSync(filePath)) return null;
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		console.warn(`[Persistence] Failed to read ${path.basename(filePath)}: ${err.message}`);
		return null;
	}
}

/**
 * Migrate a v1 snapshot (split `game`/`gameManagerGame` schema) up to v2.
 *
 * @param {Object} legacy
 * @returns {Object} v2 snapshot
 */
function migrateLegacyV1(legacy) {
	console.log('[Persistence] Migrating v1 snapshot to v2 unified world.');

	const gmg = legacy.gameManagerGame || {};
	const socketGame = legacy.game || {};
	const state = socketGame.state || {};
	const board = gmg.board || state.board || { cells: {}, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
	const chessPieces = gmg.chessPieces || state.chessPieces || [];
	const islands = gmg.islands || [];
	const homeZones = gmg.homeZones || state.homeZones || {};

	const merged = {};
	const sourcePlayerIds = new Set([
		...Object.keys(gmg.players || {}),
		...Object.keys(legacy.humanPlayers || {}),
		...Object.keys(legacy.computerPlayers || {}),
		...Object.keys(legacy.persistentPlayers || {}),
	]);

	for (const pid of sourcePlayerIds) {
		const gmpRec = (gmg.players || {})[pid] || {};
		const humanRec = (legacy.humanPlayers || {})[pid] || null;
		const compRec = (legacy.computerPlayers || {})[pid] || null;
		const persistentRec = (legacy.persistentPlayers || {})[pid] || {};

		merged[pid] = {
			id: pid,
			gameId: legacy.globalGameId || 'global_game',
			name: gmpRec.name || humanRec?.name || compRec?.name || persistentRec.name || `Player_${pid.substring(0, 6)}`,
			color: gmpRec.color || 0xDD0000,
			isObserver: !!gmpRec.isObserver,
			isComputer: !!compRec,
			eliminated: !!(gmpRec.eliminated || persistentRec.eliminated),
			balance: typeof gmpRec.balance === 'number' ? gmpRec.balance : 0,
			capturedStyles: Array.isArray(gmpRec.capturedStyles) ? gmpRec.capturedStyles : [],
			lastTetrominoPlacement:
				gmpRec.lastTetrominoPlacement
				|| humanRec?.lastTetrominoPlacement
				|| compRec?.lastTetrominoPlacement
				|| null,
			lastTetrominoPlacementAt: humanRec?.lastTetrominoPlacementAt || 0,
			lastChessMoveAt: humanRec?.lastChessMoveAt || 0,
			lastActiveAt: Date.now(),
			moveCount: Number.isFinite(gmpRec.moveCount)
				? gmpRec.moveCount
				: (humanRec?.moveCount || compRec?.moveCount || 0),
			tetrominoBag: Array.isArray(gmpRec.tetrominoBag) ? gmpRec.tetrominoBag : [],
			availableTetrominos: Array.isArray(gmpRec.availableTetrominos) ? gmpRec.availableTetrominos : [],
			difficulty: compRec?.difficulty || null,
			minMoveInterval: compRec?.minMoveInterval || 0,
			consecutiveMoves: compRec?.consecutiveMoves || 0,
			lastMoveTime: compRec?.lastMoveTime || 0,
		};
	}

	return {
		version: CURRENT_VERSION,
		savedAt: legacy.savedAt || new Date().toISOString(),
		world: {
			id: legacy.globalGameId || socketGame.id || gmg.id || 'global_game',
			createdAt: socketGame.created || Date.now(),
			updatedAt: Date.now(),
			startTime: state.startTime || null,
			status: gmg.status || state.status || 'active',
			result: state.result || null,
			maxPlayers: gmg.maxPlayers || socketGame.maxPlayers || BOARD_SETTINGS.MAX_PLAYERS_PER_GAME,
			homeZoneDistance: gmg.homeZoneDistance || BOARD_SETTINGS.HOME_ZONE_DISTANCE,
			gameMode: state.gameMode || 'standard',
			difficulty: state.difficulty || 'normal',
			startLevel: state.startLevel || 1,
			renderMode: state.renderMode || '3d',
			turnPhase: state.turnPhase || 'tetris',
			board,
			chessPieces,
			islands,
			homeZones,
			currentTurns: state.currentTurns || {},
			kingPrison: Array.isArray(state.kingPrison) ? state.kingPrison : [],
			pendingKingCaptures: Array.isArray(state.pendingKingCaptures) ? state.pendingKingCaptures : [],
			disconnectedSince: (state.disconnectedSince && typeof state.disconnectedSince === 'object')
				? state.disconnectedSince
				: {},
			lastAction: state.lastAction || null,
			players: merged,
		},
	};
}

/**
 * Sequential migration table. v0 → v1 was the pre-existing migration
 * framework; we now skip straight from v1 (legacy schema) to v2
 * (unified world).
 */
const MIGRATIONS = {
	2: migrateLegacyV1,
};

/**
 * Load a snapshot from disk, migrating older versions in place.
 * @returns {Object|null} v2 snapshot, or null if no valid file.
 */
function loadWorld() {
	const candidates = [STATE_FILE, BACKUP_FILE];
	for (const filePath of candidates) {
		const raw = readSnapshotFile(filePath);
		if (!raw) continue;

		const isLegacy = raw.version === 1 || (!raw.world && (raw.game || raw.gameManagerGame));
		const snapshot = isLegacy ? MIGRATIONS[2](raw) : raw;

		if (!snapshot || !snapshot.world || !snapshot.world.id) {
			console.warn(`[Persistence] ${path.basename(filePath)} exists but looks invalid, skipping.`);
			continue;
		}

		console.log(`[Persistence] Loaded world from ${path.basename(filePath)} (saved ${snapshot.savedAt}, version ${snapshot.version}).`);
		return snapshot;
	}
	return null;
}

/**
 * Restore a loaded snapshot into the live world.
 *
 * @param {Object} snapshot - The v2 snapshot returned by `loadWorld()`.
 * @returns {boolean}
 */
function restoreWorld(snapshot) {
	try {
		World.restoreWorldFromSnapshot(snapshot.world);
		const w = World.getWorld();
		const cellCount = Object.keys(w.board.cells || {}).length;
		const humanCount = Object.values(w.players).filter(p => !p.isComputer).length;
		const aiCount = Object.values(w.players).filter(p => p.isComputer).length;
		console.log(`[Persistence] World restored: ${cellCount} cells, ${humanCount} human player(s), ${aiCount} AI player(s).`);
		return true;
	} catch (err) {
		console.error('[Persistence] Failed to restore world:', err);
		return false;
	}
}

module.exports = {
	loadWorld,
	restoreWorld,
	saveWorldSync,
	markDirty,
	startAutoSave,
	stopAutoSave,
	STATE_FILE,
	BACKUP_FILE,
	CURRENT_VERSION,
};
