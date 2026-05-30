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

/**
 * Position-collision sweep. After bug reports of "two pawns on the
 * same cell" (player snapshot showed pawn-9 and pawn-11 both at
 * (29, 39)), we sweep for chess pieces of the same player whose
 * `position` matches another's. Root causes seen so far:
 *
 *   • `pieces.addPiece` orphans a previous occupant (it strips the
 *     OLD marker but leaves the old piece in `world.chessPieces`
 *     with its stale position). Common during power-up claims that
 *     land on a cell that briefly held a piece.
 *   • Stale `chess_move` paths re-stamp a missing source marker
 *     and then push another marker onto an already-occupied target.
 *   • Airborne settle bumping interleaved with relocate.
 *
 * Resolution: per `(playerId, x, z)` keep the piece whose chess
 * marker is actually on the cell (the canonical occupant). If the
 * cell has none of the candidates' markers, keep the most-recently
 * moved piece (highest `moveCount`, ties broken by `id` asc). All
 * losers are removed from `world.chessPieces`. Any stale markers
 * for losers are stripped from the cell so the visual matches.
 *
 * @returns {number} number of pieces removed by position collision
 */
function dedupePiecePositions(world) {
	if (!world || !Array.isArray(world.chessPieces)) return 0;
	if (!world.board || !world.board.cells) return 0;

	const groups = new Map();
	for (const piece of world.chessPieces) {
		if (!piece || !piece.position) continue;
		const x = piece.position.x;
		const z = piece.position.z;
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		const key = `${piece.player}|${x},${z}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(piece);
	}

	let removedCount = 0;
	const survivors = new Set();
	const losers = [];

	for (const [key, list] of groups) {
		if (list.length <= 1) continue;
		const [playerPart, cellPart] = key.split('|');
		const [x, z] = cellPart.split(',').map(Number);
		const cell = Array.isArray(world.board.cells[`${x},${z}`])
			? world.board.cells[`${x},${z}`]
			: [];

		// First preference: the candidate whose ID matches the cell
		// marker — that's the piece the board is actually showing.
		let winner = null;
		for (const piece of list) {
			const matchesCell = cell.some(item =>
				item
				&& item.type === 'chess'
				&& String(item.pieceId || item?.chessPiece?.id || '') === String(piece.id)
			);
			if (matchesCell) { winner = piece; break; }
		}
		// Fallback: most-moved piece (most recent activity), with
		// id-asc tiebreak for determinism. Pieces that have moved
		// at all beat pristine ones because they're the ones that
		// most likely *belong* here — the duplicates tend to be
		// stale spawn-time entries.
		if (!winner) {
			winner = list.slice().sort((a, b) => {
				const am = Number(a.moveCount) || 0;
				const bm = Number(b.moveCount) || 0;
				if (am !== bm) return bm - am;
				return String(a.id).localeCompare(String(b.id));
			})[0];
		}

		survivors.add(String(winner.id));
		for (const piece of list) {
			if (piece === winner) continue;
			losers.push({ piece, x, z, playerId: playerPart });
		}
	}

	if (losers.length === 0) return 0;

	const loserIds = new Set(losers.map(l => String(l.piece.id)));
	world.chessPieces = world.chessPieces.filter(piece => {
		if (!piece || !piece.id) return true;
		return !loserIds.has(String(piece.id));
	});
	removedCount = losers.length;

	for (const { x, z, piece } of losers) {
		const key = `${x},${z}`;
		const cell = world.board.cells[key];
		if (!Array.isArray(cell)) continue;
		const filtered = cell.filter(item =>
			!(item
				&& item.type === 'chess'
				&& String(item.pieceId || item?.chessPiece?.id || '') === String(piece.id))
		);
		if (filtered.length === 0) delete world.board.cells[key];
		else world.board.cells[key] = filtered;
	}

	console.log(
		`[MissingKing] Resolved ${removedCount} position-collision piece(s): `
		+ losers.map(l => `${l.piece.type}@${l.x},${l.z}`).join(', ')
	);
	return removedCount;
}

/**
 * One-king-rule repair. A player must own at most one king. The
 * king-capture transfer historically handed a defeated player's live
 * king to the captor (the "I captured a king and ended up with two
 * kings" bug); a stale persisted snapshot can carry that corruption
 * forward even after the code is fixed. This sweep retires the extras.
 *
 * Which king survives: the one nearest the player's home-zone centre
 * (their *original* king spawns at home, so this keeps the legitimate
 * one and drops an inherited/duplicate). Ties and missing home zones
 * fall back to the lowest id for determinism.
 *
 * @returns {number} number of surplus kings removed
 */
function dedupeKings(world) {
	if (!world || !Array.isArray(world.chessPieces)) return 0;

	const kingsByPlayer = new Map();
	for (const piece of world.chessPieces) {
		if (!piece || !piece.player) continue;
		if (String(piece.type || '').toUpperCase() !== 'KING') continue;
		const pid = String(piece.player);
		if (!kingsByPlayer.has(pid)) kingsByPlayer.set(pid, []);
		kingsByPlayer.get(pid).push(piece);
	}

	let removed = 0;
	for (const [pid, kings] of kingsByPlayer) {
		if (kings.length <= 1) continue;

		const homeZone = world.homeZones && world.homeZones[pid];
		const centre = homeZoneCentre(homeZone);
		const distToHome = (k) => {
			const pos = k.position || {};
			if (!centre || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return Infinity;
			return Math.abs(pos.x - centre.x) + Math.abs(pos.z - centre.z);
		};

		const survivor = kings.slice().sort((a, b) => {
			const da = distToHome(a);
			const db = distToHome(b);
			if (da !== db) return da - db;
			return String(a.id).localeCompare(String(b.id));
		})[0];

		for (const king of kings) {
			if (king === survivor) continue;
			console.warn(
				`[MissingKing] ${pid} owned ${kings.length} kings — retiring surplus king ${king.id} ` +
				`(keeping ${survivor.id} nearest home).`
			);
			pieces.removePiece(world, king, {
				reason: pieces.REMOVAL_REASONS.DUPLICATE_KING,
				silent: true,
			});
			removed++;
		}
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
		if (!world || !world.players) return { rescued: [], deduped: 0, positionCollisions: 0 };

		const deduped = dedupeChessPieces(world);
		const positionCollisions = dedupePiecePositions(world);
		// Restore the one-king rule BEFORE the no-king rescue below, so a
		// player whose only "second" king is removed still ends the pass
		// with a valid single king (rescued if the survivor logic somehow
		// retired their last one — it never should, but belt-and-braces).
		const surplusKings = dedupeKings(world);
		const rescued = [];

		for (const [pid, player] of Object.entries(world.players)) {
			if (!player) continue;
			if (player.eliminated) continue;
			if (player.pendingRespawn) continue;

			if (!playerHasAnyPiece(world, pid)) continue;
			if (playerHasKing(world, pid)) continue;

			// AI players USED to be excluded here on the assumption
			// the AI runner would self-recover. It doesn't — the
			// runner's `onlyKingLeft` and `marooned` paths both
			// require a king to detonate, so an AI that's lost its
			// king but still has pawns is stuck forever (player
			// reported: "AI Novice has 2 pieces, no king, doing
			// nothing"). The runner ALSO checks `pendingRespawn`
			// above, so a rescue here can't race with its respawn.
			try {
				const king = rescueOnePlayer(world, pid, player);
				if (king) rescued.push(pid);
			} catch (err) {
				console.warn(`[MissingKing] Rescue failed for ${pid}:`, err.message);
			}
		}

		if (deduped > 0 || positionCollisions > 0 || surplusKings > 0 || rescued.length > 0) {
			persistence.markDirty();
			try { broadcaster.broadcastGameUpdate({ forceFullUpdate: true }); }
			catch (broadcastErr) {
				console.warn('[MissingKing] broadcast failed:', broadcastErr.message);
			}
		}

		return { rescued, deduped, positionCollisions, surplusKings };
	}

	return { tick };
}

module.exports = {
	createMissingKingSweepService,
	dedupeChessPieces,
	dedupePiecePositions,
	dedupeKings,
};
