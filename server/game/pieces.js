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

	removePiece,
	removeAllPlayerPieces,
	removePiecesAtCells,
	relocatePiece,
	stripChessMarker,
};
