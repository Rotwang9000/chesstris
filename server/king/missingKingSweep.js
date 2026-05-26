/**
 * Missing-king rescue sweep.
 *
 * Resolves a stuck state the user can fall into when their king is removed
 * by a code path that doesn't go through `kingLifeService.handleKingDeath`:
 *
 *   - duplicate piece entries in `world.chessPieces` (one of which is the
 *     king) get spliced together and the king vanishes silently;
 *   - persistence is restored from a snapshot taken before a king-removal
 *     flow finished writing its replacement;
 *   - some other bug squishes the king without firing a respawn.
 *
 * Symptoms: the player has chess pieces, a home zone, is NOT eliminated,
 * and the client's tetromino-spawn pipeline returns `null` because
 * `getPlayersKing()` finds nothing. The player is utterly stuck — even
 * reloading the page can't help because the broken state lives on the
 * server.
 *
 * This sweep:
 *   1. Dedupes `world.chessPieces` by id (keeps first occurrence) — the
 *      most common source of "duplicate piece then king splice removes
 *      the wrong one" corruption.
 *   2. For every non-eliminated, non-AI-pendingRespawn player with no
 *      king but with other pieces, spawns a fresh king at the home-zone
 *      centre (creating a `king_anchor` cell if no terrain exists there).
 *   3. Broadcasts a forced full update so the client immediately sees
 *      the new king and the tetromino pipeline can resume.
 */

'use strict';

const World = require('../world/World');
const pieces = require('../game/pieces');

function homeZoneCentre(zone) {
	if (!zone) return null;
	const cx = Math.round((zone.x || 0) + ((zone.width || 8) / 2));
	const cz = Math.round((zone.z || 0) + ((zone.height || 2) / 2));
	return { x: cx, z: cz };
}

function dedupeChessPieces(world) {
	if (!world || !Array.isArray(world.chessPieces)) return 0;
	const seen = new Set();
	const out = [];
	let removed = 0;
	for (const piece of world.chessPieces) {
		if (!piece || !piece.id) {
			out.push(piece);
			continue;
		}
		const id = String(piece.id);
		if (seen.has(id)) { removed++; continue; }
		seen.add(id);
		out.push(piece);
	}
	if (removed > 0) {
		world.chessPieces = out;
		console.log(`[MissingKing] Deduped ${removed} duplicate chess piece entries.`);
	}
	return removed;
}

function playerHasAnyPiece(world, playerId) {
	if (!world || !Array.isArray(world.chessPieces)) return false;
	for (const piece of world.chessPieces) {
		if (piece && String(piece.player) === String(playerId)) return true;
	}
	return false;
}

function playerHasKing(world, playerId) {
	if (!world || !Array.isArray(world.chessPieces)) return false;
	for (const piece of world.chessPieces) {
		if (!piece) continue;
		if (String(piece.player) !== String(playerId)) continue;
		if (String(piece.type || '').toUpperCase() === 'KING') return true;
	}
	return false;
}

function rescueOnePlayer(world, playerId, player) {
	const homeZone = world.homeZones && world.homeZones[playerId];
	const target = homeZoneCentre(homeZone) || { x: 0, z: 0 };

	// Make sure the target cell exists and is owned. If the home zone
	// has been degraded we may have no cell under the king; create a
	// king-anchor tetromino so the spawn has terrain under its feet.
	const cellKey = `${target.x},${target.z}`;
	const cells = world.board && world.board.cells ? world.board.cells : {};
	const existing = Array.isArray(cells[cellKey]) ? cells[cellKey].slice() : [];
	const hasOwnedSupport = existing.some(item =>
		item && item.player != null && String(item.player) === String(playerId) && item.type !== 'home'
	);
	if (!hasOwnedSupport) {
		existing.push({
			type: 'tetromino',
			pieceType: 'king_anchor',
			player: playerId,
			placedAt: Date.now(),
			isKingAnchor: true,
		});
		if (world.board && world.board.cells) world.board.cells[cellKey] = existing;
	}

	const orientation = (homeZone && Number.isFinite(homeZone.orientation))
		? homeZone.orientation
		: 0;
	const king = pieces.addPiece(world, {
		type: 'KING',
		player: playerId,
		x: target.x,
		z: target.z,
		orientation,
		reason: 'missing_king_rescue',
	});

	// Reset the king life counter so the player gets a fresh start.
	player.kingLives = Number.isFinite(player.kingLives) ? player.kingLives : 3;
	player.eliminated = false;
	delete player.pendingRespawn;

	console.log(
		`[MissingKing] Rescued ${player.name || playerId} — fresh king at (${target.x}, ${target.z}).`
	);
	return king;
}

function createMissingKingSweepService({ broadcaster, persistence }) {
	if (!broadcaster) throw new Error('createMissingKingSweepService: broadcaster required');
	if (!persistence) throw new Error('createMissingKingSweepService: persistence required');

	function tick() {
		const world = World.getWorld();
		if (!world || !world.players) return { rescued: [], deduped: 0 };

		const deduped = dedupeChessPieces(world);
		const rescued = [];

		for (const [pid, player] of Object.entries(world.players)) {
			if (!player) continue;
			if (player.eliminated) continue;
			if (player.pendingRespawn) continue;

			// AI players are handled by the AI runner's own recovery
			// logic — don't double-rescue and risk spawning two kings.
			if (player.isComputer) continue;

			if (!playerHasAnyPiece(world, pid)) continue;
			if (playerHasKing(world, pid)) continue;

			try {
				const king = rescueOnePlayer(world, pid, player);
				if (king) rescued.push(pid);
			} catch (err) {
				console.warn(`[MissingKing] Rescue failed for ${pid}:`, err.message);
			}
		}

		if (deduped > 0 || rescued.length > 0) {
			persistence.markDirty();
			try { broadcaster.broadcastGameUpdate({ forceFullUpdate: true }); }
			catch (broadcastErr) {
				console.warn('[MissingKing] broadcast failed:', broadcastErr.message);
			}
		}

		return { rescued, deduped };
	}

	return { tick };
}

module.exports = {
	createMissingKingSweepService,
	dedupeChessPieces,
};
