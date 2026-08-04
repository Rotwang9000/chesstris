/**
 * Dormant-kingdom stow / restore.
 *
 * Home-zone degradation only strips home *markers* after a few minutes of
 * idle; it deliberately leaves pieces and terrain in place so a returning
 * player isn't wiped. That means abandoned kingdoms can linger for weeks
 * unless something stronger runs.
 *
 * After `DORMANT_IDLE_MS` with no gameplay actions (placements or chess
 * moves — *not* mere socket connects), an offline human's entire footprint
 * is lifted off the board into `player.stowedKingdom`. On the next
 * `join_game` they choose:
 *
 *   • **relocate** — paste cells + pieces near a fresh home zone slot
 *   • **fresh**   — discard the stash and spawn a brand-new kingdom
 *
 * AI seats, paused players and anyone in a battle are exempt.
 */

const World = require('./World');
const Sessions = require('./Sessions');
const { getLatestPlayerActionAt } = require('../utils/cooldowns');
const { findHomeZonePosition } = require('../game/GameUtilities');
const pieces = require('../game/pieces');

/** One day without a placement or chess move → stow. */
const DORMANT_IDLE_MS = 24 * 60 * 60 * 1000;

function deepClone(value) {
	return JSON.parse(JSON.stringify(value));
}

function homeZoneCentre(zone) {
	if (!zone) return null;
	const w = zone.width || 8;
	const h = zone.height || 2;
	return { x: zone.x + w / 2, z: zone.z + h / 2 };
}

function collectTerritory(world, playerId) {
	const pid = String(playerId);
	const cells = {};
	for (const [key, contents] of Object.entries(world.board?.cells || {})) {
		if (!Array.isArray(contents) || contents.length === 0) continue;
		const owned = contents.filter(item => item && String(item.player) === pid);
		if (owned.length > 0) cells[key] = deepClone(owned);
	}
	const chessPieces = (world.chessPieces || [])
		.filter(p => p && String(p.player) === pid)
		.map(deepClone);
	const homeZone = world.homeZones?.[playerId]
		? deepClone(world.homeZones[playerId])
		: null;
	return { cells, chessPieces, homeZone, stowedAt: Date.now() };
}

function stripTerritory(world, playerId) {
	const pid = String(playerId);
	delete world.homeZones[playerId];
	delete world.currentTurns[playerId];
	world.chessPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) !== pid
	);
	for (const key of Object.keys(world.board?.cells || {})) {
		const cell = world.board.cells[key];
		if (!Array.isArray(cell)) {
			delete world.board.cells[key];
			continue;
		}
		const filtered = cell.filter(item => !item || String(item.player) !== pid);
		if (filtered.length === 0) delete world.board.cells[key];
		else world.board.cells[key] = filtered;
	}
}

function cellIsEmptyOrOwned(world, x, z, playerId) {
	const key = `${x},${z}`;
	const cell = world.board?.cells?.[key];
	if (!Array.isArray(cell) || cell.length === 0) return true;
	return cell.every(item => !item || String(item.player) === String(playerId));
}

/**
 * Shift every stowed cell + piece from the old home centre to `newHome`.
 * Cells that would collide with foreign terrain are skipped.
 *
 * @returns {{ placedCells: number, placedPieces: number, skippedCells: number }}
 */
function transplantStowed(world, playerId, stowed, newHome) {
	const pid = String(playerId);
	const oldCentre = homeZoneCentre(stowed.homeZone) || { x: 0, z: 0 };
	const newCentre = homeZoneCentre(newHome);
	const dx = Math.round(newCentre.x - oldCentre.x);
	const dz = Math.round(newCentre.z - oldCentre.z);

	let placedCells = 0;
	let skippedCells = 0;
	for (const [key, items] of Object.entries(stowed.cells || {})) {
		const [xs, zs] = key.split(',');
		const x = Number(xs) + dx;
		const z = Number(zs) + dz;
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		if (!cellIsEmptyOrOwned(world, x, z, pid)) {
			skippedCells++;
			continue;
		}
		const destKey = `${x},${z}`;
		const terrainOnly = deepClone(items).filter(item => item && item.type !== 'chess');
		if (terrainOnly.length === 0) continue;
		const existing = world.board.cells[destKey] || [];
		world.board.cells[destKey] = existing.concat(terrainOnly);
		placedCells++;
	}

	let placedPieces = 0;
	for (const piece of stowed.chessPieces || []) {
		const pos = piece.position || { x: piece.x, z: piece.z };
		if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
		const nx = pos.x + dx;
		const nz = pos.z + dz;
		const destKey = `${nx},${nz}`;
		const destCell = world.board.cells[destKey];
		if (!Array.isArray(destCell) || destCell.length === 0) continue;
		const added = pieces.addPiece(world, {
			id: piece.id,
			type: piece.type,
			player: playerId,
			x: nx,
			z: nz,
			color: piece.color,
			orientation: piece.orientation,
		});
		if (added) placedPieces++;
	}

	world.homeZones[playerId] = deepClone(newHome);
	return { placedCells, placedPieces, skippedCells };
}

function createDormantKingdomService({ gameManager, broadcaster, persistence, integrityService }) {
	if (!gameManager) throw new Error('createDormantKingdomService: gameManager required');
	if (!broadcaster) throw new Error('createDormantKingdomService: broadcaster required');
	if (!persistence) throw new Error('createDormantKingdomService: persistence required');

	function shouldStowPlayer(player, playerId, now) {
		if (!player || player.isComputer || player.eliminated) return false;
		if (player.paused === true) return false;
		if (player.battleId || player.activeBattleId) return false;
		if (player.stowedKingdom) return false;
		if (Sessions.isOnline(playerId)) return false;

		const world = World.getWorld();
		const hasHome = !!(world?.homeZones?.[playerId]);
		const hasPieces = (world?.chessPieces || []).some(
			p => p && String(p.player) === String(playerId)
		);
		if (!hasHome && !hasPieces) return false;

		const lastAction = getLatestPlayerActionAt(player);
		const idleAnchor = Math.max(
			lastAction || 0,
			Number(player.lastDisconnectAt) || 0,
			Number(player.lastActiveAt) || 0,
			Number(player.joinedAt) || 0,
		);
		if (!idleAnchor) return false;
		return now - idleAnchor >= DORMANT_IDLE_MS;
	}

	function stowPlayer(playerId) {
		const world = World.getWorld();
		const player = world?.players?.[playerId];
		if (!player || player.stowedKingdom) return false;

		const snapshot = collectTerritory(world, playerId);
		if (!snapshot.homeZone && snapshot.chessPieces.length === 0) return false;

		player.stowedKingdom = snapshot;
		player.dormantSince = snapshot.stowedAt;
		stripTerritory(world, playerId);
		gameManager.boardManager.recalculateBoardBoundaries(world.board);
		World.markDirty();
		persistence.markDirty();
		console.log(
			`[Dormant] Stowed ${playerId}'s kingdom `
			+ `(${Object.keys(snapshot.cells).length} cells, ${snapshot.chessPieces.length} pieces).`
		);
		return true;
	}

	/**
	 * @param {'relocate'|'fresh'} mode
	 */
	function restorePlayer(playerId, mode, playerName) {
		const world = World.getWorld();
		const player = world?.players?.[playerId];
		if (!player?.stowedKingdom) {
			return { success: false, error: 'no_stowed_kingdom' };
		}

		const stowed = player.stowedKingdom;
		delete player.stowedKingdom;
		delete player.dormantSince;

		if (mode === 'fresh') {
			const registration = gameManager.registerPlayer(
				World.getWorldId(), playerId, playerName || player.name, false
			);
			World.markDirty();
			persistence.markDirty();
			return registration;
		}

		if (mode !== 'relocate') {
			return { success: false, error: 'invalid_mode' };
		}

		const newHome = findHomeZonePosition(world);
		if (!newHome) {
			player.stowedKingdom = stowed;
			return { success: false, error: 'no_home_slot' };
		}

		const stats = transplantStowed(world, playerId, stowed, newHome);
		if (stats.placedPieces === 0) {
			// Couldn't land anything — fall back to a fresh kingdom rather
			// than strand the player with an empty stash.
			const registration = gameManager.registerPlayer(
				World.getWorldId(), playerId, playerName || player.name, false
			);
			World.markDirty();
			persistence.markDirty();
			return {
				...registration,
				relocateFallback: true,
				skippedCells: stats.skippedCells,
			};
		}

		if (integrityService) {
			try { integrityService.runIslandIntegrityPass({ emitAnimation: false }); }
			catch (_e) { /* best-effort */ }
		}
		gameManager.boardManager.recalculateBoardBoundaries(world.board);
		World.markDirty();
		persistence.markDirty();
		return {
			success: true,
			homeZone: newHome,
			relocated: stats,
		};
	}

	function tick({ now = Date.now() } = {}) {
		const world = World.getWorld();
		if (!world?.players) return { stowed: [] };

		const stowed = [];
		for (const playerId of Object.keys(world.players)) {
			const player = world.players[playerId];
			if (!shouldStowPlayer(player, playerId, now)) continue;
			if (stowPlayer(playerId)) stowed.push(String(playerId));
		}

		if (stowed.length > 0) {
			try {
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
			} catch (err) {
				console.warn('[Dormant] broadcast failed:', err.message);
			}
		}
		return { stowed };
	}

	/** Boot-time pass: stow anyone who should already be dormant. */
	function stowImmediately() {
		return tick({ now: Date.now() });
	}

	function stowedSummary(player) {
		const stash = player?.stowedKingdom;
		if (!stash) return null;
		return {
			stowedAt: stash.stowedAt || player.dormantSince || null,
			cellCount: Object.keys(stash.cells || {}).length,
			pieceCount: (stash.chessPieces || []).length,
			hadHomeZone: !!stash.homeZone,
		};
	}

	return {
		tick,
		stowImmediately,
		stowPlayer,
		restorePlayer,
		shouldStowPlayer,
		stowedSummary,
		DORMANT_IDLE_MS,
		collectTerritory,
		transplantStowed,
	};
}

module.exports = {
	createDormantKingdomService,
	DORMANT_IDLE_MS,
	homeZoneCentre,
	collectTerritory,
	transplantStowed,
};
