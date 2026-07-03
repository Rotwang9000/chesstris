/**
 * Chess-piece lifecycle helpers — the single place that knows how a chess
 * piece is removed, relocated, or transferred between owners.
 *
 * Why this exists:
 *   `world.chessPieces` was being mutated from a dozen places (chess
 *   socket capture, AI capture, integrity drops, island decay, line-clear
 *   gravity, king detonation, pawn detonation, player teardown…) and
 *   only a handful of them recorded an `activity_event`. The user
 *   reported pieces "just disappearing" with nothing in the recent-
 *   activity log to explain why. This module unifies every mutation
 *   path so the activity log always sees it, regardless of which
 *   subsystem triggered the change.
 *
 * Mirrors the `cells.js` refactor done previously — same shape, same
 * "single source of truth" philosophy.
 *
 * Each removal must specify a `reason` (mandatory). The set of well-
 * known reasons is enumerated in `REMOVAL_REASONS`. If you find
 * yourself reaching for `world.chessPieces.splice(…)` directly, you
 * almost certainly want `removePiece(world, …)` instead.
 */

const PIECE_TYPE_NAMES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

const REMOVAL_REASONS = Object.freeze({
	// A piece was captured by another piece (normal chess capture).
	CAPTURED: 'captured',
	// A piece chose to detonate itself (pawn detonation), or was
	// detonated alongside a king capture (suicidal pawn).
	DETONATED: 'detonated',
	SUICIDAL_PAWN: 'suicidal_pawn',
	// Killed by king detonation collateral (its own player's king
	// blew up around it, removing all cells underneath).
	KING_DETONATION_COLLATERAL: 'king_detonation_collateral',
	// Killed by island-decay — the piece was standing on a
	// disconnected island that timed out.
	ISLAND_DECAY: 'island_decay',
	// Killed by the integrity sweep because the supporting cell is
	// gone (line-clear gravity stripped it, or the cell was deleted
	// during a different mutation that didn't clean up the piece).
	NO_SUPPORTING_CELL: 'no_supporting_cell',
	// Integrity drop: piece had an invalid position field.
	INVALID_POSITION: 'invalid_position',
	// Integrity drop: piece's owner is no longer in `world.players`.
	OWNER_GONE: 'owner_gone',
	// Bulk teardown — player left the game.
	PLAYER_LEFT: 'player_left',
	// Bulk teardown — world snapshot restore wiped the player.
	WORLD_RESET: 'world_reset',
	// A row-clear-airborne piece had no cell to land on after gravity
	// settled — it falls "into the water" per bible §15.2 (new rule).
	FELL_TO_WATER: 'fell_to_water',
	// A landing airborne piece collided with an existing piece on the
	// target cell — the existing piece is knocked off.
	KNOCKED_OFF: 'knocked_off',
	// Integrity repair: a player somehow owned more than one king
	// (historically the king-capture transfer bug). The extra kings are
	// retired to restore the one-king-per-player invariant.
	DUPLICATE_KING: 'duplicate_king',
});

const KING_TYPE = 'KING';

function isKing(piece) {
	return piece && String(piece.type || '').toUpperCase() === KING_TYPE;
}

function pieceLabel(piece) {
	if (!piece) return 'piece';
	const t = String(piece.type || '').toLowerCase();
	return PIECE_TYPE_NAMES.includes(t) ? t : 'piece';
}

function piecePosition(piece) {
	if (!piece) return null;
	const pos = piece.position || piece;
	if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
	return { x: pos.x, z: pos.z };
}

function playerName(world, playerId) {
	if (!world || !world.players || !playerId) return playerId || 'unknown';
	const p = world.players[playerId];
	if (!p) return playerId;
	return p.username || p.name || playerId;
}

function findPieceIndexById(world, pieceId) {
	if (!world || !Array.isArray(world.chessPieces) || pieceId == null) return -1;
	return world.chessPieces.findIndex(p => p && String(p.id) === String(pieceId));
}

function findPieceAtCell(world, x, z) {
	if (!world || !Array.isArray(world.chessPieces)) return null;
	return world.chessPieces.find(p => {
		const pos = piecePosition(p);
		return pos && pos.x === x && pos.z === z;
	}) || null;
}

function findPiecesByPlayer(world, playerId) {
	if (!world || !Array.isArray(world.chessPieces)) return [];
	const pid = String(playerId);
	return world.chessPieces.filter(p => p && String(p.player) === pid);
}

/**
 * Strip the chess marker for `piece` from its current cell. Leaves the
 * rest of the cell's contents (home / tetromino / centre / special) in
 * place. Deletes the cell entirely if nothing is left.
 *
 * Mutates `world.board.cells` in place and returns true if a marker
 * was actually removed (callers can use this to know whether the
 * cell was already inconsistent).
 */
function stripChessMarker(world, piece) {
	if (!world || !world.board || !world.board.cells || !piece) return false;
	const pos = piecePosition(piece);
	if (!pos) return false;
	const key = `${pos.x},${pos.z}`;
	const cellContents = world.board.cells[key];
	if (!Array.isArray(cellContents) || cellContents.length === 0) return false;

	const remaining = cellContents.filter(item => {
		if (!item || item.type !== 'chess') return true;
		const markerId = item.pieceId != null
			? String(item.pieceId)
			: (item.chessPiece && item.chessPiece.id != null
				? String(item.chessPiece.id)
				: null);
		return !(markerId && String(piece.id) === markerId);
	});

	if (remaining.length === cellContents.length) return false;
	if (remaining.length > 0) {
		world.board.cells[key] = remaining;
	} else {
		delete world.board.cells[key];
	}
	return true;
}

/**
 * Remove a piece from `world.chessPieces` and tidy up its supporting
 * cell marker. Records a `chess_piece_lost` activity-log event (or
 * `chess_piece_captured` if `reason === 'captured'`) when an
 * `activityLog` is provided.
 *
 * @param {Object} world
 * @param {Object|string} pieceOrId  Either the piece object or its id.
 * @param {Object} ctx
 * @param {string} ctx.reason          One of `REMOVAL_REASONS.*`
 * @param {Object} [ctx.activityLog]
 * @param {Object} [ctx.capturedBy]    `{ playerId, pieceType, pieceId }`
 *                                     when reason === 'captured'.
 * @param {boolean} [ctx.silent]       Skip activity-log emission (for
 *                                     fast-path bulk operations that
 *                                     emit a summary event instead).
 * @param {string} [ctx.note]          Extra metadata to attach to the
 *                                     event payload.
 * @returns {Object|null}              The removed piece, or null if it
 *                                     wasn't found.
 */
function removePiece(world, pieceOrId, ctx = {}) {
	if (!world) return null;
	const reason = ctx.reason || REMOVAL_REASONS.NO_SUPPORTING_CELL;

	const id = (pieceOrId && typeof pieceOrId === 'object')
		? pieceOrId.id
		: pieceOrId;
	const idx = findPieceIndexById(world, id);
	if (idx === -1) return null;

	const piece = world.chessPieces[idx];
	const pos = piecePosition(piece);

	// Give kings a chance to spend a life instead of dying.  The hook
	// is opt-in (callers pass `ctx.kingLifeService`) so unit tests and
	// non-king flows are unaffected.  If the king is respawned, the
	// piece object has been re-positioned and re-anchored in place —
	// we must NOT splice it out of `world.chessPieces`.
	if (ctx.kingLifeService && typeof ctx.kingLifeService.handleKingDeath === 'function') {
		const outcome = ctx.kingLifeService.handleKingDeath(piece, { reason });
		// `respawned` — king spent a life and is re-anchored in place.
		// `detonating` — final death: the detonation service now owns this
		// king and removes it at the end of the lemming animation. Either
		// way we must NOT splice it out here.
		if (outcome && (outcome.respawned || outcome.detonating)) {
			return null;
		}
	}

	stripChessMarker(world, piece);
	world.chessPieces.splice(idx, 1);

	if (!ctx.silent && ctx.activityLog) {
		try {
			emitRemovalEvent(world, ctx.activityLog, piece, { ...ctx, reason });
		} catch (err) {
			console.warn('[pieces] activity log failed:', err.message);
		}
	}

	// Useful trace for production debugging — historically these
	// went out with no log at all, which is why the user couldn't
	// see why their rook vanished.
	if (!ctx.silent) {
		const at = pos ? `(${pos.x}, ${pos.z})` : '(unknown)';
		console.log(
			`[pieces] ${piece.player || '?'}'s ${pieceLabel(piece)} ${piece.id} ` +
			`removed at ${at} — reason: ${reason}` +
			(ctx.note ? ` (${ctx.note})` : '')
		);
	}

	return piece;
}

function emitRemovalEvent(world, activityLog, piece, ctx) {
	if (!activityLog || !piece) return;
	const pos = piecePosition(piece) || { x: null, z: null };
	const base = {
		playerId: piece.player,
		playerName: playerName(world, piece.player),
		pieceType: pieceLabel(piece),
		pieceId: piece.id,
		x: pos.x,
		z: pos.z,
		reason: ctx.reason,
	};

	if (ctx.reason === REMOVAL_REASONS.CAPTURED && typeof activityLog.recordPieceCaptured === 'function') {
		activityLog.recordPieceCaptured({
			...base,
			capturedBy: ctx.capturedBy || null,
		});
		return;
	}

	if (typeof activityLog.recordPieceLost === 'function') {
		activityLog.recordPieceLost(base);
		return;
	}

	// Fall back to the generic record helper if the typed helpers
	// haven't been wired up yet (older activityLog services).
	if (typeof activityLog.record === 'function') {
		activityLog.record(
			ctx.reason === REMOVAL_REASONS.CAPTURED ? 'chess_piece_captured' : 'chess_piece_lost',
			base,
		);
	}
}

/**
 * Bulk-remove every piece for `playerId` (used on player teardown /
 * world reset). Strips the chess markers and emits ONE summary event
 * — per-piece events would flood the activity log when a player with
 * 16 pieces leaves.
 *
 * @returns {Array} The pieces that were removed.
 */
function removeAllPlayerPieces(world, playerId, ctx = {}) {
	if (!world || !Array.isArray(world.chessPieces)) return [];
	const pid = String(playerId);
	const reason = ctx.reason || REMOVAL_REASONS.PLAYER_LEFT;
	const removed = [];

	for (let i = world.chessPieces.length - 1; i >= 0; i--) {
		const piece = world.chessPieces[i];
		if (!piece || String(piece.player) !== pid) continue;
		stripChessMarker(world, piece);
		world.chessPieces.splice(i, 1);
		removed.push(piece);
	}

	if (removed.length > 0 && !ctx.silent && ctx.activityLog) {
		try {
			emitBulkRemovalEvent(world, ctx.activityLog, playerId, removed, reason);
		} catch (err) {
			console.warn('[pieces] activity log failed:', err.message);
		}
	}

	return removed;
}

function emitBulkRemovalEvent(world, activityLog, playerId, removed, reason) {
	if (typeof activityLog.recordPiecesLost === 'function') {
		activityLog.recordPiecesLost({
			playerId,
			playerName: playerName(world, playerId),
			pieceCount: removed.length,
			pieces: removed.slice(0, 8).map(p => ({
				pieceType: pieceLabel(p),
				pieceId: p.id,
				...(piecePosition(p) || {}),
			})),
			reason,
		});
		return;
	}
	if (typeof activityLog.record === 'function') {
		activityLog.record('chess_pieces_lost', {
			playerId,
			playerName: playerName(world, playerId),
			pieceCount: removed.length,
			reason,
		});
	}
}

/**
 * Remove every piece that's currently standing on one of the given
 * cell coordinates owned by `playerId`. Used by island-decay so it
 * can clean up its own pieces consistently and emit a single
 * accurate `island_decayed` event afterwards.
 *
 * @returns {Array} The pieces that were removed.
 */
function removePiecesAtCells(world, playerId, cells, ctx = {}) {
	if (!world || !Array.isArray(world.chessPieces) || !Array.isArray(cells)) return [];
	const pid = String(playerId);
	const reason = ctx.reason || REMOVAL_REASONS.ISLAND_DECAY;
	const cellSet = new Set(cells.map(c => `${c.x},${c.z}`));
	const removed = [];

	for (let i = world.chessPieces.length - 1; i >= 0; i--) {
		const piece = world.chessPieces[i];
		if (!piece || String(piece.player) !== pid) continue;
		const pos = piecePosition(piece);
		if (!pos) continue;
		if (!cellSet.has(`${pos.x},${pos.z}`)) continue;
		if (typeof ctx.protect === 'function' && ctx.protect(piece, pos)) continue;

		// Give kings a chance to spend a life and respawn at home
		// instead of being deleted with the island.  When the king
		// survives, leave it in `chessPieces` (the service already
		// re-anchored it) and skip the splice.
		if (ctx.kingLifeService
			&& isKing(piece)
			&& typeof ctx.kingLifeService.handleKingDeath === 'function') {
			const outcome = ctx.kingLifeService.handleKingDeath(piece, { reason });
			// respawned → re-anchored in place; detonating → final death,
			// the detonation service owns the king now. Skip the splice
			// in both cases (see removePiece for the full note).
			if (outcome && (outcome.respawned || outcome.detonating)) continue;
		}

		stripChessMarker(world, piece);
		world.chessPieces.splice(i, 1);
		removed.push(piece);
	}

	if (removed.length > 0 && !ctx.silent && ctx.activityLog) {
		try {
			for (const piece of removed) {
				emitRemovalEvent(world, ctx.activityLog, piece, { reason });
			}
		} catch (err) {
			console.warn('[pieces] activity log failed:', err.message);
		}
	}

	return removed;
}

/**
 * Add a freshly-spawned chess piece to the world.
 *
 * Used by power-up orb claims and any future "appear out of thin
 * air" mechanic. Pushes onto `world.chessPieces`, stamps the
 * supporting cell with a chess marker that respects existing
 * tetromino / home overlays already in the cell, and (optionally)
 * records a `chess_piece_spawned` activity event.
 *
 * Returns the new piece object (with a generated `id` if none was
 * supplied) or null if the inputs were invalid.
 *
 * @param {Object} world
 * @param {Object} spec
 * @param {string} spec.type        e.g. "PAWN" / "ROOK" / "QUEEN"
 * @param {string} spec.player      Owner player id
 * @param {number} spec.x
 * @param {number} spec.z
 * @param {number} [spec.orientation]
 * @param {string} [spec.color]
 * @param {string} [spec.id]
 * @param {string} [spec.reason]    Logged in `chess_piece_spawned`
 * @param {Object} [spec.activityLog]
 */
function addPiece(world, spec = {}) {
	if (!world || !world.board) return null;
	if (!Array.isArray(world.chessPieces)) world.chessPieces = [];
	if (!world.board.cells || typeof world.board.cells !== 'object') {
		world.board.cells = {};
	}

	const type = String(spec.type || '').toUpperCase();
	if (!type) return null;
	const x = Number(spec.x);
	const z = Number(spec.z);
	if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
	if (!spec.player) return null;

	const pieceId = spec.id
		|| `piece-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const ownerColor = spec.color
		|| (world.players && world.players[spec.player] && world.players[spec.player].color)
		|| null;
	const orientation = Number.isFinite(spec.orientation)
		? spec.orientation
		: ((world.homeZones && world.homeZones[spec.player] && world.homeZones[spec.player].orientation) || 0);

	const piece = {
		id: pieceId,
		type,
		player: spec.player,
		position: { x, z },
		orientation,
		hasMoved: false,
		moveCount: 0,
		forwardDistance: 0,
	};
	if (ownerColor !== null) piece.color = ownerColor;

	// Orphan-prevention: if any OTHER piece in `chessPieces` thinks
	// it lives at (x, z), it must be a stale entry left behind by an
	// earlier move that updated the cell marker but didn't update
	// the piece record (or vice-versa). Drop those entries before
	// pushing the new one so we don't accumulate "two pawns on the
	// same cell" state corruption — exactly the pattern that caused
	// the recent airborne-bump report.
	const collidingIdx = [];
	for (let i = 0; i < world.chessPieces.length; i++) {
		const other = world.chessPieces[i];
		if (!other || !other.position) continue;
		if (other.position.x !== x || other.position.z !== z) continue;
		if (String(other.player) !== String(spec.player)) continue;
		collidingIdx.push(i);
	}
	if (collidingIdx.length > 0) {
		console.warn(
			`[pieces] addPiece at (${x},${z}) for ${spec.player}: dropping `
			+ `${collidingIdx.length} stale piece record(s) on the same cell.`
		);
		// Remove in reverse so indices stay valid.
		for (let i = collidingIdx.length - 1; i >= 0; i--) {
			world.chessPieces.splice(collidingIdx[i], 1);
		}
	}

	world.chessPieces.push(piece);

	const key = `${x},${z}`;
	const existing = Array.isArray(world.board.cells[key]) ? world.board.cells[key].slice() : [];
	const marker = {
		type: 'chess',
		pieceType: type.toLowerCase(),
		player: spec.player,
		color: ownerColor,
		pieceId,
		orientation,
	};
	const withoutOldChess = existing.filter(item => !item || item.type !== 'chess');
	withoutOldChess.push(marker);
	world.board.cells[key] = withoutOldChess;

	if (spec.activityLog) {
		try {
			if (typeof spec.activityLog.recordPieceSpawned === 'function') {
				spec.activityLog.recordPieceSpawned({
					playerId: spec.player,
					playerName: playerName(world, spec.player),
					pieceType: pieceLabel(piece),
					pieceId,
					x, z,
					reason: spec.reason || 'spawned',
				});
			} else if (typeof spec.activityLog.record === 'function') {
				spec.activityLog.record('chess_piece_spawned', {
					playerId: spec.player,
					playerName: playerName(world, spec.player),
					pieceType: pieceLabel(piece),
					pieceId,
					x, z,
					reason: spec.reason || 'spawned',
				});
			}
		} catch (err) {
			console.warn('[pieces] addPiece activity log failed:', err.message);
		}
	}

	return piece;
}

/**
 * Find an empty pawn-row slot inside a player's home zone, suitable
 * for spawning a fresh pawn into (basket-deploy redeployment etc.).
 *
 * The pawn row depends on home-zone orientation — pawns sit in front
 * of the back-rank pieces. We deliberately only scan the pawn row,
 * because dropping a pawn into the back rank would clobber a king
 * or rook slot once an existing piece moves out. The function
 * returns `null` when every pawn slot is occupied (by another
 * piece or any non-home cell content).
 *
 * @param {Object} world
 * @param {string} playerId
 * @returns {{x:number, z:number} | null}
 */
function findEmptyPawnSlot(world, playerId) {
	if (!world || !world.homeZones || !playerId) return null;
	const homeZone = world.homeZones[playerId];
	if (!homeZone) return null;

	const orientation = Number.isFinite(homeZone.orientation) ? homeZone.orientation : 0;
	const width = Number.isFinite(homeZone.width) ? homeZone.width : 8;
	const height = Number.isFinite(homeZone.height) ? homeZone.height : 2;

	const isHorizontal = orientation === 0 || orientation === 2;
	const slots = [];
	if (isHorizontal) {
		// Pawn row depends on orientation:
		//   0 (facing up)   → pawns sit at z + 1 (in front of back rank at z)
		//   2 (facing down) → pawns sit at z       (in front of back rank at z + 1)
		const pawnZ = orientation === 0 ? homeZone.z + 1 : homeZone.z;
		for (let i = 0; i < width; i++) {
			slots.push({ x: homeZone.x + i, z: pawnZ });
		}
	} else {
		// Vertical: pawns to one side of the back rank column.
		//   1 (facing right) → pawns at x + 1
		//   3 (facing left)  → pawns at x
		const pawnX = orientation === 1 ? homeZone.x + 1 : homeZone.x;
		for (let i = 0; i < height; i++) {
			slots.push({ x: pawnX, z: homeZone.z + i });
		}
	}

	for (const slot of slots) {
		const key = `${slot.x},${slot.z}`;
		const cell = world.board.cells ? world.board.cells[key] : null;
		const occupiedByChess = Array.isArray(cell)
			? cell.some(item => item && item.type === 'chess')
			: false;
		if (occupiedByChess) continue;
		// Don't drop into a cell currently hosting another player's
		// tetromino — that'd be a free territory grab.
		const foreignContent = Array.isArray(cell)
			? cell.some(item => item
				&& item.type !== 'home'
				&& String(item.player || '') !== String(playerId))
			: false;
		if (foreignContent) continue;
		return slot;
	}
	return null;
}

/**
 * Update a piece's `position` field and move its chess marker on the
 * board accordingly. Used by line-clear gravity and centroid gravity.
 *
 * Does NOT record an activity-log event — gravity moves can affect
 * dozens of pieces at once and would flood the log. The caller can
 * emit a single summary event if it wants to.
 */
function relocatePiece(world, piece, newPosition) {
	if (!world || !world.board || !piece || !newPosition) return false;
	if (!Number.isFinite(newPosition.x) || !Number.isFinite(newPosition.z)) return false;

	stripChessMarker(world, piece);

	piece.position = { x: newPosition.x, z: newPosition.z };

	const key = `${newPosition.x},${newPosition.z}`;
	const cellContents = Array.isArray(world.board.cells[key]) ? world.board.cells[key] : [];
	const hasMarker = cellContents.some(item =>
		item && item.type === 'chess'
		&& String(item.pieceId || item?.chessPiece?.id || '') === String(piece.id)
	);
	if (!hasMarker) {
		cellContents.push({
			type: 'chess',
			player: piece.player,
			pieceId: piece.id,
			pieceType: pieceLabel(piece),
			chessPiece: piece,
		});
		world.board.cells[key] = cellContents;
	}
	return true;
}

module.exports = {
	REMOVAL_REASONS,
	KING_TYPE,
	PIECE_TYPE_NAMES,

	isKing,
	pieceLabel,
	piecePosition,

	findPieceAtCell,
	findPieceIndexById,
	findPiecesByPlayer,

	addPiece,
	removePiece,
	removeAllPlayerPieces,
	removePiecesAtCells,
	relocatePiece,
	stripChessMarker,
	findEmptyPawnSlot,
};
