'use strict';

/**
 * King-life service.
 *
 * Kings get `KING_INITIAL_LIVES` lives. A king that's removed for a
 * non-intentional reason (fell into the water after a row clear,
 * lost a supporting cell, decayed with an island) is automatically
 * respawned at the home-zone centre with a fresh `king_anchor` cell
 * under it. When the player exhausts their lives, the service marks
 * them eliminated and lets the caller fall through to the normal
 * `pieces.removePiece` path so the existing king-death animation
 * (detonation, suicidal pawns, etc.) still fires.
 *
 * Reasons that ARE counted as deaths:
 *   • `fell_to_water`
 *   • `no_supporting_cell` (defensive — integrity normally rescues)
 *   • `island_decay`
 *
 * Reasons that bypass lives (already intentional / terminal):
 *   • `captured` — kings can't be captured; this would be a code bug.
 *   • `detonated` / `king_detonation_collateral` / `suicidal_pawn` —
 *     someone (or the lone-king sweep) chose to detonate the king.
 *   • `player_left` / `world_reset` / `owner_gone` — teardown.
 *
 * The service is intentionally stateless beyond `world.players[*]` —
 * `kingLives` is a per-player field on the world snapshot, so it
 * survives persistence reboots.
 */

const World = require('./../world/World');
const pieces = require('./../game/pieces');

const KING_INITIAL_LIVES = 3;

const LIFE_CONSUMING_REASONS = new Set([
	pieces.REMOVAL_REASONS.FELL_TO_WATER,
	pieces.REMOVAL_REASONS.NO_SUPPORTING_CELL,
	pieces.REMOVAL_REASONS.ISLAND_DECAY,
	pieces.REMOVAL_REASONS.INVALID_POSITION,
	pieces.REMOVAL_REASONS.KNOCKED_OFF,
]);

function isKingPiece(piece) {
	return piece && String(piece.type || '').toUpperCase() === 'KING';
}

function ensureLives(player) {
	if (!player) return 0;
	if (!Number.isFinite(player.kingLives)) {
		player.kingLives = KING_INITIAL_LIVES;
	}
	return player.kingLives;
}

function homeZoneCentre(zone) {
	if (!zone) return null;
	const cx = Math.round((zone.x || 0) + ((zone.width || 8) / 2));
	const cz = Math.round((zone.z || 0) + ((zone.height || 2) / 2));
	return { x: cx, z: cz };
}

/**
 * Find a free landing cell as close to `(targetX, targetZ)` as
 * possible. Prefers the exact cell if empty of other chess markers;
 * otherwise spirals outward up to `maxRadius` looking for any cell
 * with no chess marker. Falls back to `(targetX, targetZ)` so the
 * king always gets *some* cell to land on (we'll overwrite whatever
 * is there with a king-anchor — better than letting the king vanish).
 */
/**
 * Pick a sensible cell for a king respawn.
 *
 * Order of preference:
 *   1. An EXISTING cell owned by the player and free of other chess
 *      pieces — anywhere in their territory. Avoids respawning the
 *      king onto a stranded island that island-decay is about to wipe.
 *   2. The home centre — even if there's no cell there, we create a
 *      fresh home anchor in `respawnKing` so the king has somewhere
 *      to sit.
 *   3. Anywhere within `maxRadius` of the home centre that's
 *      clear of other chess markers (legacy fallback).
 *
 * Returns `{ x, z, needsAnchor: boolean }` where `needsAnchor=true`
 * means the caller should also stamp a fresh tetromino/home anchor
 * on the destination so the king isn't floating in the void.
 */
function findRespawnCell(world, playerId, targetX, targetZ, maxRadius = 6) {
	if (!world || !world.board || !world.board.cells) {
		return { x: targetX, z: targetZ, needsAnchor: true };
	}
	const cells = world.board.cells;
	const hasOtherChess = (key) => {
		const items = cells[key];
		if (!Array.isArray(items)) return false;
		return items.some(item => item && item.type === 'chess');
	};
	const isOwnedExistingCell = (key) => {
		const items = cells[key];
		if (!Array.isArray(items) || items.length === 0) return false;
		// Single-owner cell test — anything the player owns counts,
		// including home and tetromino markers.
		for (const item of items) {
			if (!item) continue;
			if (item.player == null) continue;
			if (String(item.player) === String(playerId)) return true;
		}
		return false;
	};

	// 1. Walk all owned cells, pick one closest to the home centre.
	let best = null;
	let bestDist = Infinity;
	for (const key of Object.keys(cells)) {
		if (hasOtherChess(key)) continue;
		if (!isOwnedExistingCell(key)) continue;
		const [cx, cz] = key.split(',').map(Number);
		if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
		const d = Math.abs(cx - targetX) + Math.abs(cz - targetZ);
		if (d < bestDist) {
			bestDist = d;
			best = { x: cx, z: cz, needsAnchor: false };
		}
	}
	if (best) return best;

	// 2. Home centre — always a safe fallback even if the cell is empty.
	//    `respawnKing` will lay down a fresh anchor below.
	if (!hasOtherChess(`${targetX},${targetZ}`)) {
		return { x: targetX, z: targetZ, needsAnchor: true };
	}

	// 3. Spiral out from the home centre looking for an empty square.
	for (let radius = 1; radius <= maxRadius; radius++) {
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dz = -radius; dz <= radius; dz++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
				const x = targetX + dx;
				const z = targetZ + dz;
				if (!hasOtherChess(`${x},${z}`)) {
					return { x, z, needsAnchor: !isOwnedExistingCell(`${x},${z}`) };
				}
			}
		}
	}
	return { x: targetX, z: targetZ, needsAnchor: true };
}

function createKingLifeService({ io, broadcaster, persistence, activityLog = null } = {}) {
	if (!io) throw new Error('createKingLifeService: io required');
	if (!broadcaster) throw new Error('createKingLifeService: broadcaster required');
	if (!persistence) throw new Error('createKingLifeService: persistence required');

	/**
	 * Decide what should happen to a king that's about to be removed.
	 *
	 * Caller pattern:
	 *
	 *   const outcome = kingLifeService.handleKingDeath(piece, { reason });
	 *   if (outcome.respawned) {
	 *     // King has been moved + re-anchored. Skip removePiece.
	 *     return;
	 *   }
	 *   // Final death — remove as normal, then mark player eliminated.
	 *
	 * Returns `null` if `piece` isn't a king or the reason isn't a
	 * counted death (caller should proceed with their normal path).
	 */
	function handleKingDeath(piece, { reason } = {}) {
		if (!isKingPiece(piece)) return null;
		if (!LIFE_CONSUMING_REASONS.has(reason)) return null;
		const world = World.getWorld();
		if (!world || !world.board || !Array.isArray(world.chessPieces)) return null;
		const playerId = piece.player;
		const player = world.players ? world.players[playerId] : null;
		if (!player) return null;
		// Already eliminated (e.g. king-capture cascade) — let the
		// normal removal path proceed so suicidal-pawn and other
		// downstream events fire correctly.
		if (player.eliminated) return null;

		const before = ensureLives(player);
		const remaining = Math.max(0, before - 1);
		player.kingLives = remaining;

		const playerName = player.username || player.name || playerId;

		if (remaining <= 0) {
			emitFinalDeath({ world, playerId, playerName, piece, reason });
			persistence.markDirty();
			return { respawned: false, remainingLives: 0, final: true };
		}

		const result = respawnKing({ world, player, playerId, piece, reason });
		emitRespawn({
			world, playerId, playerName, piece,
			from: result.from, to: result.to,
			remainingLives: remaining,
			reason,
		});
		persistence.markDirty();
		try { broadcaster.broadcastGameUpdate(); } catch (_e) { /* best-effort */ }
		return { respawned: true, remainingLives: remaining, ...result };
	}

	function respawnKing({ world, player, playerId, piece }) {
		const oldPos = piece.position || piece;
		const fromX = Number.isFinite(oldPos?.x) ? oldPos.x : null;
		const fromZ = Number.isFinite(oldPos?.z) ? oldPos.z : null;
		const zone = world.homeZones ? world.homeZones[playerId] : null;
		const centre = homeZoneCentre(zone) || { x: 0, z: 0 };
		const target = findRespawnCell(world, playerId, centre.x, centre.z);

		// Strip the king's current chess marker before we move it so
		// the destination cell isn't left with a stale "king is also
		// here" item.
		pieces.stripChessMarker(world, piece);

		piece.position = { x: target.x, z: target.z };
		piece.lastRespawnAt = Date.now();
		piece.lastRespawnReason = piece.lastRespawnReason || null;

		const key = `${target.x},${target.z}`;
		const existing = Array.isArray(world.board.cells[key])
			? world.board.cells[key].slice()
			: [];
		// Remove any other chess marker that lingered on the cell
		// (`findRespawnCell` skips those, but the fallback may have
		// landed on one). The bumped piece doesn't get re-homed — it
		// just falls out of play; rare enough we accept it.
		const withoutChess = existing.filter(item => !(item && item.type === 'chess'));
		// Only stamp a fresh king anchor when the destination doesn't
		// already have player-owned content. `findRespawnCell` prefers
		// existing owned cells precisely so the king lands on supported
		// ground instead of floating on a newly minted island.
		if (target.needsAnchor) {
			withoutChess.push({
				type: 'tetromino',
				pieceType: 'king_anchor',
				player: playerId,
				placedAt: Date.now(),
				isKingAnchor: true,
			});
		}
		withoutChess.push({
			type: 'chess',
			player: playerId,
			pieceId: piece.id,
			pieceType: 'king',
			chessPiece: piece,
		});
		world.board.cells[key] = withoutChess;

		// Reset any "ghost-player about to be reaped" / lone-king
		// flags so the player isn't immediately removed again after
		// respawning into an empty island.
		if (player) {
			player.pendingRespawn = false;
			player.lastActiveAt = Date.now();
		}

		return {
			from: (fromX != null && fromZ != null) ? { x: fromX, z: fromZ } : null,
			to: { x: target.x, z: target.z },
		};
	}

	function emitRespawn({
		world, playerId, playerName, piece,
		from, to, remainingLives, reason,
	}) {
		const payload = {
			playerId,
			playerName,
			pieceId: piece.id,
			from,
			to,
			remainingLives,
			totalLives: KING_INITIAL_LIVES,
			reason,
		};
		try {
			const room = world && world.id ? io.to(world.id) : io;
			room.emit('king_respawned', payload);
		} catch (err) {
			console.warn('[KingLives] emit king_respawned failed:', err.message);
		}
		if (activityLog && typeof activityLog.record === 'function') {
			try {
				activityLog.record('king_respawned', payload);
			} catch (logErr) {
				console.warn('[KingLives] activityLog failed:', logErr.message);
			}
		}
		console.log(
			`[KingLives] ${playerName}'s king respawned ` +
			`(${remainingLives} ${remainingLives === 1 ? 'life' : 'lives'} left, reason: ${reason})`
		);
	}

	function emitFinalDeath({ world, playerId, playerName, reason }) {
		const player = world.players ? world.players[playerId] : null;
		if (player) {
			player.eliminated = true;
			player.eliminatedAt = Date.now();
			player.kingLives = 0;
		}
		try {
			const room = world && world.id ? io.to(world.id) : io;
			room.emit('king_eliminated', {
				playerId, playerName,
				totalLives: KING_INITIAL_LIVES,
				reason,
			});
		} catch (err) {
			console.warn('[KingLives] emit king_eliminated failed:', err.message);
		}
		if (activityLog && typeof activityLog.record === 'function') {
			try {
				activityLog.record('king_eliminated', {
					playerId, playerName,
					totalLives: KING_INITIAL_LIVES,
					reason,
				});
			} catch (logErr) {
				console.warn('[KingLives] activityLog failed:', logErr.message);
			}
		}
		console.log(`[KingLives] ${playerName}'s king is gone for good (reason: ${reason})`);
	}

	function getLivesRemaining(playerId) {
		const world = World.getWorld();
		const player = world && world.players ? world.players[playerId] : null;
		return ensureLives(player);
	}

	function resetLives(playerId) {
		const world = World.getWorld();
		const player = world && world.players ? world.players[playerId] : null;
		if (player) {
			player.kingLives = KING_INITIAL_LIVES;
			persistence.markDirty();
		}
	}

	return {
		handleKingDeath,
		getLivesRemaining,
		resetLives,
		KING_INITIAL_LIVES,
		LIFE_CONSUMING_REASONS,
	};
}

module.exports = {
	createKingLifeService,
	KING_INITIAL_LIVES,
};
