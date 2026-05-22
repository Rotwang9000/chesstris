/**
 * Power-up orbs.
 *
 * Implements the user's "Cells that appear randomly which have an orb
 * above them" feature request. An orb floats above an empty board cell
 * and contains a chess piece type. The first player to extend their
 * tetromino territory to cover that cell wins the orb: the cell becomes
 * theirs and the contained chess piece materialises on it.
 *
 * Spawn rules:
 *   • Every `SPAWN_TICK_MS` we may spawn one orb (probabilistic, capped
 *     at `MAX_ACTIVE_ORBS_PER_PLAYER * livingPlayerCount`).
 *   • Location is biased toward **struggling** players (fewer chess
 *     pieces → higher weight) so power-ups help the player who needs
 *     them most.
 *   • Distance from the target player's home zone is randomised between
 *     `MIN_SPAWN_DISTANCE` and `MAX_SPAWN_DISTANCE`, picking the first
 *     empty cell we find in that band.
 *
 * Piece-type distribution (weights, sum doesn't have to be 100):
 *     PAWN   65  — common, fuels the pawn-promotion → basket loop
 *     KNIGHT 12
 *     BISHOP 10
 *     ROOK    8
 *     QUEEN   5  — rare jackpot
 *
 * Lifecycle:
 *   • Orbs expire after `ORB_LIFETIME_MS` if nobody claims them, so the
 *     board doesn't fill up with stale glowing balls.
 *   • Persisted in `world.powerUps`; lost on a fresh world but will
 *     regenerate within `SPAWN_TICK_MS` of the first tick.
 *
 * Claim flow:
 *   `claimAcrossPlacement` runs after each tetromino lands. An orb is
 *   claimed when the placement **covers** the orb cell or sits on an
 *   **orthogonally adjacent** cell (players naturally bridge onto the
 *   glowing slot). The piece spawns on the orb's coordinates.
 *
 * Why this lives in `server/game/` rather than `server/world/`:
 *   It mutates `world.chessPieces` and the board, so it's logically a
 *   game-rules service sitting next to `BoardManager` and
 *   `TetrominoManager`, not a generic world bookkeeping helper.
 */

const { v4: uuidv4 } = require('uuid');

const World = require('../world/World');
const pieces = require('./pieces');

const SPAWN_TICK_MS = 45 * 1000;
const ORB_LIFETIME_MS = 4 * 60 * 1000;

const MAX_ACTIVE_ORBS_PER_PLAYER = 1;
const MIN_TOTAL_ORBS = 0;
const MAX_TOTAL_ORBS = 4;
const SPAWN_PROBABILITY_PER_TICK = 0.35;

// Keep orbs on the growing front (one step beyond existing cells),
// not 6+ cells out in empty sky.
const MIN_SPAWN_DISTANCE = 1;
const MAX_SPAWN_DISTANCE = 12;
const MAX_SPAWN_ATTEMPTS = 40;

const PIECE_TYPE_WEIGHTS = Object.freeze({
	PAWN: 65,
	KNIGHT: 12,
	BISHOP: 10,
	ROOK: 8,
	QUEEN: 5,
});

function createPowerUpManager({
	io,
	broadcaster,
	persistence,
	activityLog = null,
} = {}) {
	if (!io) throw new Error('createPowerUpManager: io required');
	if (!broadcaster) throw new Error('createPowerUpManager: broadcaster required');
	if (!persistence) throw new Error('createPowerUpManager: persistence required');

	function ensurePowerUps(world) {
		if (!world) return null;
		if (!Array.isArray(world.powerUps)) world.powerUps = [];
		return world.powerUps;
	}

	function getEligiblePlayers(world) {
		const out = [];
		const players = world && world.players ? world.players : {};
		for (const pid of Object.keys(players)) {
			const player = players[pid];
			if (!player || player.eliminated) continue;
			const zone = world.homeZones ? world.homeZones[pid] : null;
			if (!zone) continue;
			out.push({ id: pid, player, zone });
		}
		return out;
	}

	function countPiecesByPlayer(world) {
		const counts = new Map();
		for (const piece of (world.chessPieces || [])) {
			if (!piece || !piece.player) continue;
			const k = String(piece.player);
			counts.set(k, (counts.get(k) || 0) + 1);
		}
		return counts;
	}

	function pickWeighted(weightedItems) {
		const total = weightedItems.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
		if (total <= 0) return null;
		let r = Math.random() * total;
		for (const item of weightedItems) {
			r -= Math.max(0, item.weight);
			if (r <= 0) return item;
		}
		return weightedItems[weightedItems.length - 1];
	}

	function pickPieceType() {
		const items = Object.entries(PIECE_TYPE_WEIGHTS)
			.map(([type, weight]) => ({ type, weight }));
		return pickWeighted(items).type;
	}

	function homeZoneCentre(zone) {
		return {
			x: (zone.x || 0) + (zone.width || 8) / 2,
			z: (zone.z || 0) + (zone.height || 2) / 2,
		};
	}

	function pickTargetPlayer(world) {
		const eligible = getEligiblePlayers(world);
		if (eligible.length === 0) return null;
		const counts = countPiecesByPlayer(world);
		const weighted = eligible.map(entry => ({
			...entry,
			weight: 1 / (1 + (counts.get(String(entry.id)) || 0)),
		}));
		return pickWeighted(weighted);
	}

	const ORTHO_DIRS = Object.freeze([
		[0, 1], [0, -1], [1, 0], [-1, 0],
	]);

	function normalizeCoord(value) {
		const n = Number(value);
		return Number.isFinite(n) ? Math.round(n) : NaN;
	}

	function isAdjacentToExistingBoard(world, x, z) {
		for (const [dx, dz] of ORTHO_DIRS) {
			const nx = x + dx;
			const nz = z + dz;
			const key = `${nx},${nz}`;
			const cell = world.board?.cells?.[key];
			if (Array.isArray(cell) && cell.length > 0) return true;
			for (const piece of (world.chessPieces || [])) {
				if (!piece) continue;
				const pos = piece.position || piece;
				if (pos && normalizeCoord(pos.x) === nx && normalizeCoord(pos.z) === nz) {
					return true;
				}
			}
		}
		return false;
	}

	function isCellAvailableForOrb(world, x, z) {
		const key = `${x},${z}`;
		const cellContents = world.board?.cells?.[key];
		// Empty host cell — first tetromino (or adjacent bridge) wins.
		if (Array.isArray(cellContents) && cellContents.length > 0) return false;
		// Must touch existing structure so the orb is reachable in one
		// placement; void orbs in the sky were the main "nothing happens"
		// complaint.
		if (!isAdjacentToExistingBoard(world, x, z)) return false;
		const orbs = world.powerUps || [];
		for (const orb of orbs) {
			if (orb && normalizeCoord(orb.x) === x && normalizeCoord(orb.z) === z) return false;
		}
		return true;
	}

	function findSpawnLocation(world, target) {
		if (!target || !target.zone) return null;
		const centre = homeZoneCentre(target.zone);
		const candidates = [];
		for (let dx = -MAX_SPAWN_DISTANCE; dx <= MAX_SPAWN_DISTANCE; dx++) {
			for (let dz = -MAX_SPAWN_DISTANCE; dz <= MAX_SPAWN_DISTANCE; dz++) {
				const dist = Math.hypot(dx, dz);
				if (dist < MIN_SPAWN_DISTANCE || dist > MAX_SPAWN_DISTANCE) continue;
				const x = Math.round(centre.x + dx);
				const z = Math.round(centre.z + dz);
				if (isCellAvailableForOrb(world, x, z)) {
					candidates.push({ x, z });
				}
			}
		}
		if (candidates.length === 0) return null;
		return candidates[Math.floor(Math.random() * candidates.length)];
	}

	function maxActiveOrbs(world) {
		const livingCount = getEligiblePlayers(world).length;
		const computed = Math.max(MIN_TOTAL_ORBS, livingCount * MAX_ACTIVE_ORBS_PER_PLAYER);
		return Math.min(MAX_TOTAL_ORBS, computed);
	}

	function pruneExpired(world, now = Date.now()) {
		const orbs = ensurePowerUps(world);
		if (orbs.length === 0) return [];
		const expired = [];
		const kept = [];
		for (const orb of orbs) {
			if (!orb) continue;
			const spawnedAt = Number(orb.spawnedAt) || now;
			if (now - spawnedAt >= ORB_LIFETIME_MS) {
				expired.push(orb);
			} else {
				kept.push(orb);
			}
		}
		world.powerUps = kept;
		if (expired.length === 0) return [];

		for (const orb of expired) {
			try {
				io.to(World.getWorldId()).emit('powerup_expired', { orbId: orb.id });
				if (activityLog && typeof activityLog.recordPowerupExpired === 'function') {
					activityLog.recordPowerupExpired({
						orbId: orb.id, x: orb.x, z: orb.z, pieceType: orb.pieceType,
					});
				}
			} catch (err) {
				console.warn('[PowerUp] expiry emit failed:', err.message);
			}
		}
		persistence.markDirty();
		return expired;
	}

	function trySpawnOne(world, now = Date.now()) {
		const orbs = ensurePowerUps(world);
		if (orbs.length >= maxActiveOrbs(world)) return null;
		if (Math.random() > SPAWN_PROBABILITY_PER_TICK) return null;

		const target = pickTargetPlayer(world);
		if (!target) return null;

		const location = findSpawnLocation(world, target);
		if (!location) return null;

		const orb = {
			id: `orb-${uuidv4().substring(0, 8)}`,
			x: location.x,
			z: location.z,
			pieceType: pickPieceType(),
			spawnedAt: now,
			expiresAt: now + ORB_LIFETIME_MS,
			// Recorded so the client can highlight orbs that lean
			// toward the local player (UX nicety — "this one's for you").
			targetPlayerId: target.id,
		};
		orbs.push(orb);

		try {
			io.to(World.getWorldId()).emit('powerup_spawned', orb);
			if (activityLog && typeof activityLog.recordPowerupSpawned === 'function') {
				activityLog.recordPowerupSpawned({
					orbId: orb.id, x: orb.x, z: orb.z,
					pieceType: orb.pieceType,
					targetPlayerId: target.id,
					targetPlayerName: target.player.username
						|| target.player.name
						|| target.id,
				});
			}
		} catch (err) {
			console.warn('[PowerUp] spawn emit failed:', err.message);
		}

		persistence.markDirty();
		console.log(
			`[PowerUp] Spawned ${orb.pieceType} orb (${orb.id}) at (${orb.x}, ${orb.z}) `
			+ `near ${target.player.name || target.id}`
		);
		return orb;
	}

	function pruneUnreachable(world) {
		const orbs = ensurePowerUps(world);
		if (orbs.length === 0) return [];
		const removed = [];
		const kept = [];
		for (const orb of orbs) {
			if (!orb) continue;
			const x = normalizeCoord(orb.x);
			const z = normalizeCoord(orb.z);
			if (!Number.isFinite(x) || !Number.isFinite(z)
				|| !isAdjacentToExistingBoard(world, x, z)) {
				removed.push(orb);
			} else {
				kept.push(orb);
			}
		}
		if (removed.length > 0) {
			world.powerUps = kept;
			persistence.markDirty();
		}
		return removed;
	}

	function tick({ now = Date.now() } = {}) {
		const world = World.getWorld();
		if (!world) return { spawned: null, expired: [] };
		const expired = pruneExpired(world, now);
		pruneUnreachable(world);
		const spawned = trySpawnOne(world, now);
		return { spawned, expired };
	}

	/**
	 * Claim a power-up if `(x, z)` matches one. Spawns the contained
	 * chess piece for `playerId` and removes the orb. Returns the
	 * claim outcome (or null if no orb at that cell).
	 *
	 * Caller is responsible for ensuring the player has actually
	 * placed a tetromino covering the cell — we don't double-check
	 * here so AI and human flows can use a single helper.
	 */
	function tryClaimAtCell(world, playerId, x, z) {
		if (!world || !playerId) return null;
		const cellX = normalizeCoord(x);
		const cellZ = normalizeCoord(z);
		if (!Number.isFinite(cellX) || !Number.isFinite(cellZ)) return null;
		const orbs = ensurePowerUps(world);
		const idx = orbs.findIndex(o => o
			&& normalizeCoord(o.x) === cellX
			&& normalizeCoord(o.z) === cellZ);
		if (idx < 0) return null;
		const orb = orbs[idx];
		orbs.splice(idx, 1);

		const piece = pieces.addPiece(world, {
			type: orb.pieceType,
			player: playerId,
			x: cellX,
			z: cellZ,
			reason: 'powerup',
			activityLog,
		});
		if (!piece) {
			console.warn(`[PowerUp] tryClaimAtCell: pieces.addPiece failed for orb ${orb.id}`);
			orbs.splice(idx, 0, orb);
			return null;
		}

		try {
			const player = world.players ? world.players[playerId] : null;
			const playerName = (player && (player.username || player.name)) || playerId;
			io.to(World.getWorldId()).emit('powerup_claimed', {
				orbId: orb.id,
				playerId,
				playerName,
				pieceType: orb.pieceType,
				pieceId: piece.id,
				x, z,
			});
			if (activityLog && typeof activityLog.recordPowerupClaimed === 'function') {
				activityLog.recordPowerupClaimed({
					playerId,
					playerName,
					orbId: orb.id,
					pieceType: orb.pieceType,
					pieceId: piece.id,
					x, z,
				});
			}
		} catch (err) {
			console.warn('[PowerUp] claim emit failed:', err.message);
		}

		persistence.markDirty();
		return { orb, piece };
	}

	/**
	 * Claim orbs covered by the placement or orthogonally adjacent to
	 * any placed cell (one-step bridge onto the glowing host slot).
	 */
	function claimAcrossPlacement(world, playerId, placedCells) {
		if (!Array.isArray(placedCells) || placedCells.length === 0) return [];
		const touchKeys = new Set();
		for (const cell of placedCells) {
			if (!cell) continue;
			const x = normalizeCoord(cell.x);
			const z = normalizeCoord(cell.z);
			if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
			touchKeys.add(`${x},${z}`);
			for (const [dx, dz] of ORTHO_DIRS) {
				touchKeys.add(`${x + dx},${z + dz}`);
			}
		}
		if (touchKeys.size === 0) return [];

		const orbs = ensurePowerUps(world);
		const candidates = orbs.filter((orb) => {
			if (!orb || !orb.id) return false;
			const ox = normalizeCoord(orb.x);
			const oz = normalizeCoord(orb.z);
			return touchKeys.has(`${ox},${oz}`);
		});
		const claimed = [];
		for (const orb of candidates) {
			const outcome = tryClaimAtCell(world, playerId, orb.x, orb.z);
			if (outcome) claimed.push(outcome);
		}
		return claimed;
	}

	function reset() {
		const world = World.getWorld();
		if (!world) return;
		world.powerUps = [];
		persistence.markDirty();
	}

	function listOrbs() {
		const world = World.getWorld();
		return Array.isArray(world?.powerUps) ? world.powerUps.slice() : [];
	}

	function pruneStaleOrbs(now = Date.now()) {
		const world = World.getWorld();
		if (!world) return { expired: [], unreachable: [] };
		const expired = pruneExpired(world, now);
		const unreachable = pruneUnreachable(world);
		return { expired, unreachable };
	}

	return {
		tick,
		tryClaimAtCell,
		claimAcrossPlacement,
		listOrbs,
		reset,
		pruneStaleOrbs,
		// Exposed for tests / inspection.
		PIECE_TYPE_WEIGHTS,
		ORB_LIFETIME_MS,
		SPAWN_TICK_MS,
		MIN_SPAWN_DISTANCE,
		MAX_SPAWN_DISTANCE,
		MAX_TOTAL_ORBS,
		MAX_ACTIVE_ORBS_PER_PLAYER,
		// Helpers usable from tests; not part of the public lifecycle.
		_internals: {
			pickTargetPlayer,
			findSpawnLocation,
			isCellAvailableForOrb,
			isAdjacentToExistingBoard,
			normalizeCoord,
			maxActiveOrbs,
			pruneExpired,
			pruneUnreachable,
			trySpawnOne,
			countPiecesByPlayer,
		},
	};
}

module.exports = {
	createPowerUpManager,
	PIECE_TYPE_WEIGHTS,
	ORB_LIFETIME_MS,
	SPAWN_TICK_MS,
	MIN_SPAWN_DISTANCE,
	MAX_SPAWN_DISTANCE,
};
