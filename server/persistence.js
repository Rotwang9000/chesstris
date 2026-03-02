/**
 * World Persistence for Shaktris
 *
 * Saves and restores the global game state to/from disk so that server
 * restarts, code upgrades, and rule changes don't wipe the world.
 *
 * File layout:
 *   data/world.json          - current snapshot
 *   data/world.json.bak      - previous snapshot (safety net)
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'world.json');
const BACKUP_FILE = STATE_FILE + '.bak';

const CURRENT_VERSION = 1;
const SAVE_INTERVAL_MS = 30000;
const SAVE_THROTTLE_MS = 10000;

let _lastSaveTs = 0;
let _saveTimer = null;
let _dirty = false;

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
}

/**
 * Build a serialisable snapshot of the global game world.
 */
function buildSnapshot(deps) {
	const { games, players, computerPlayers, persistentPlayers, globalGameId, gameManager } = deps;
	const game = games.get(globalGameId);
	if (!game) return null;

	const humanPlayers = {};
	for (const [id, p] of players) {
		if (p.gameId !== globalGameId) continue;
		humanPlayers[id] = {
			id: p.id,
			name: p.name,
			gameId: p.gameId,
			lastTetrominoPlacement: p.lastTetrominoPlacement || null,
			lastTetrominoPlacementAt: p.lastTetrominoPlacementAt || 0,
			lastChessMoveAt: p.lastChessMoveAt || 0,
		};
	}

	const cpData = {};
	for (const [id, cp] of computerPlayers) {
		if (cp.gameId !== globalGameId) continue;
		cpData[id] = {
			id: cp.id,
			name: cp.name,
			gameId: cp.gameId,
			isComputer: true,
			difficulty: cp.difficulty,
			lastMoveTime: cp.lastMoveTime || 0,
			consecutiveMoves: cp.consecutiveMoves || 0,
			minMoveInterval: cp.minMoveInterval || 10000,
			lastTetrominoPlacement: cp.lastTetrominoPlacement || null,
		};
	}

	const ppData = {};
	for (const [id, pp] of persistentPlayers) {
		ppData[id] = { name: pp.name, gameId: pp.gameId };
	}

	const gmGame = gameManager.getGame(globalGameId);

	return {
		version: 1,
		savedAt: new Date().toISOString(),
		globalGameId,
		game: {
			id: game.id,
			players: game.players,
			maxPlayers: game.maxPlayers,
			hasComputerPlayer: game.hasComputerPlayer,
			created: game.created,
			state: game.state,
		},
		humanPlayers,
		computerPlayers: cpData,
		persistentPlayers: ppData,
		gameManagerGame: gmGame ? {
			id: gmGame.id,
			board: gmGame.board,
			chessPieces: gmGame.chessPieces,
			islands: gmGame.islands,
			players: gmGame.players,
			homeZones: gmGame.homeZones,
			maxPlayers: gmGame.maxPlayers,
			homeZoneDistance: gmGame.homeZoneDistance,
			status: gmGame.status,
		} : null,
	};
}

/**
 * Write snapshot to disk using atomic rename.
 */
function writeSnapshotSync(snapshot) {
	ensureDataDir();

	const json = JSON.stringify(snapshot, null, 2);
	const tmpFile = STATE_FILE + '.tmp';

	if (fs.existsSync(STATE_FILE)) {
		try { fs.copyFileSync(STATE_FILE, BACKUP_FILE); } catch (_e) { /* best effort */ }
	}

	fs.writeFileSync(tmpFile, json, 'utf8');
	fs.renameSync(tmpFile, STATE_FILE);
}

/**
 * Save the world now (synchronous, safe for shutdown hooks).
 */
function saveWorldSync(deps) {
	try {
		const snapshot = buildSnapshot(deps);
		if (!snapshot) {
			console.log('[Persistence] Nothing to save (no global game).');
			return false;
		}
		writeSnapshotSync(snapshot);
		_lastSaveTs = Date.now();
		_dirty = false;
		const cells = (snapshot.game.state.board && snapshot.game.state.board.cells) || {};
		const cellCount = Object.keys(cells).length;
		const playerCount = snapshot.game.players.length;
		console.log('[Persistence] World saved (' + cellCount + ' cells, ' + playerCount + ' player slots).');
		return true;
	} catch (err) {
		console.error('[Persistence] Failed to save world:', err.message);
		return false;
	}
}

/** Mark state as dirty. The periodic timer will flush it. */
function markDirty() {
	_dirty = true;
}

/** Start the periodic auto-save timer. */
function startAutoSave(deps) {
	if (_saveTimer) return;
	_saveTimer = setInterval(function () {
		if (!_dirty) return;
		const now = Date.now();
		if (now - _lastSaveTs < SAVE_THROTTLE_MS) return;
		saveWorldSync(deps);
	}, SAVE_INTERVAL_MS);
	_saveTimer.unref();
}

function stopAutoSave() {
	if (_saveTimer) {
		clearInterval(_saveTimer);
		_saveTimer = null;
	}
}

/**
 * Apply sequential migrations to bring a snapshot up to CURRENT_VERSION.
 * Each migration is a function(snapshot) that mutates the snapshot in place.
 * Add new entries when bumping CURRENT_VERSION.
 */
const MIGRATIONS = {
	// Example for a future version 2:
	// 2: function (snapshot) {
	//     // e.g. remove diagonal island connections from saved board
	//     console.log('[Persistence] Migrating v1 -> v2');
	//     snapshot.version = 2;
	// },
};

function migrateSnapshot(snapshot) {
	let v = snapshot.version || 0;
	while (v < CURRENT_VERSION) {
		v++;
		const fn = MIGRATIONS[v];
		if (fn) {
			fn(snapshot);
			console.log('[Persistence] Applied migration to v' + v);
		}
		snapshot.version = v;
	}
	return snapshot;
}

/**
 * Attempt to load the world from disk.
 * @returns {Object|null} The snapshot, or null if no valid file.
 */
function loadWorld() {
	const candidates = [STATE_FILE, BACKUP_FILE];
	for (let i = 0; i < candidates.length; i++) {
		const filePath = candidates[i];
		if (!fs.existsSync(filePath)) continue;
		try {
			const raw = fs.readFileSync(filePath, 'utf8');
			const snapshot = JSON.parse(raw);
			if (!snapshot || !snapshot.game || !snapshot.globalGameId) {
				console.warn('[Persistence] ' + path.basename(filePath) + ' exists but looks invalid, skipping.');
				continue;
			}
			console.log('[Persistence] Loaded world from ' + path.basename(filePath) + ' (saved ' + snapshot.savedAt + ').');
			return migrateSnapshot(snapshot);
		} catch (err) {
			console.warn('[Persistence] Failed to read ' + path.basename(filePath) + ': ' + err.message);
		}
	}
	return null;
}

/**
 * Restore a loaded snapshot into the live server state.
 *
 * @param {Object} snapshot - The loaded snapshot
 * @param {Object} deps - Live server references
 * @returns {boolean} true if restored successfully
 */
function restoreWorld(snapshot, deps) {
	const { games, players, computerPlayers, persistentPlayers,
		gameManager, startComputerPlayerActions, generateComputerStrategy } = deps;
	const gid = snapshot.globalGameId;

	try {
		const savedGame = snapshot.game;
		const rawPlayers = savedGame.players || [];
		const dedupedPlayers = [...new Set(rawPlayers)];
		games.set(gid, {
			id: savedGame.id,
			players: dedupedPlayers,
			maxPlayers: savedGame.maxPlayers || 2048,
			hasComputerPlayer: savedGame.hasComputerPlayer || false,
			created: savedGame.created || Date.now(),
			state: savedGame.state || {},
		});

		if (snapshot.gameManagerGame) {
			const gmg = snapshot.gameManagerGame;
			gameManager.games[gid] = {
				id: gmg.id || gid,
				board: gmg.board || { cells: {}, width: 0, height: 0 },
				chessPieces: gmg.chessPieces || [],
				islands: gmg.islands || [],
				players: gmg.players || {},
				homeZones: gmg.homeZones || {},
				maxPlayers: gmg.maxPlayers || 2048,
				homeZoneDistance: gmg.homeZoneDistance || 100,
				status: gmg.status || 'active',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
		}

		const cpEntries = Object.entries(snapshot.computerPlayers || {});
		for (let i = 0; i < cpEntries.length; i++) {
			const [cpId, cp] = cpEntries[i];
			computerPlayers.set(cpId, {
				id: cp.id,
				name: cp.name,
				gameId: cp.gameId,
				isComputer: true,
				difficulty: cp.difficulty,
				lastMoveTime: cp.lastMoveTime || 0,
				consecutiveMoves: cp.consecutiveMoves || 0,
				minMoveInterval: cp.minMoveInterval || 10000,
				lastTetrominoPlacement: cp.lastTetrominoPlacement || null,
				strategy: generateComputerStrategy(cp.difficulty || 'medium'),
			});
		}

		const ppEntries = Object.entries(snapshot.persistentPlayers || {});
		for (let j = 0; j < ppEntries.length; j++) {
			const [ppId, pp] = ppEntries[j];
			persistentPlayers.set(ppId, {
				name: pp.name,
				gameId: pp.gameId,
				disconnectTimer: null,
			});
		}

		const game = games.get(gid);
		const humanIds = game.players.filter(function (id) { return !computerPlayers.has(id); });
		for (let k = 0; k < humanIds.length; k++) {
			const hid = humanIds[k];
			const saved = (snapshot.humanPlayers || {})[hid];
			if (!saved) continue;
			players.set(hid, {
				id: hid,
				name: saved.name || ('Player_' + hid.substring(0, 6)),
				gameId: gid,
				socket: null,
				lastTetrominoPlacement: saved.lastTetrominoPlacement || null,
				lastTetrominoPlacementAt: saved.lastTetrominoPlacementAt || 0,
				lastChessMoveAt: saved.lastChessMoveAt || 0,
			});
		}

		const cpKeys = Object.keys(snapshot.computerPlayers || {});
		for (let m = 0; m < cpKeys.length; m++) {
			if (computerPlayers.has(cpKeys[m])) {
				startComputerPlayerActions(cpKeys[m], gid);
			}
		}

		const cpCount = Object.keys(snapshot.computerPlayers || {}).length;
		const cells = (snapshot.game.state.board && snapshot.game.state.board.cells) || {};
		const cellCount = Object.keys(cells).length;
		console.log('[Persistence] World restored: ' + cellCount + ' cells, ' +
			humanIds.length + ' human player(s), ' + cpCount + ' AI player(s).');
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
};
