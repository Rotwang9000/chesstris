/**
 * Activity log — server-side rolling buffer of "interesting" events
 * (tetromino placements, chess moves, captures, island decay, detonations,
 * player joins/leaves) plus a broadcast channel so clients can render
 * them in a recent-actions panel.
 *
 * The buffer lives on the world snapshot so persistence survives reboots.
 * Each event is a plain JSON record `{ id, t, type, payload }` where
 * `id` is monotonically increasing per world, `t` is the wall-clock
 * timestamp (so the client can render "5s ago"), `type` is a short
 * tag (e.g. `tetromino_placed`, `island_decayed`), and `payload` is the
 * type-specific extra data.
 *
 * Consumers should call the named helpers below rather than building
 * payloads inline — keeps the schema in one place.
 */

const World = require('./World');

const DEFAULT_MAX_EVENTS = 200;

function ensureBuffer(world, max) {
	if (!world) return null;
	if (!Array.isArray(world.activityLog)) world.activityLog = [];
	if (typeof world._activityLogNextId !== 'number') world._activityLogNextId = 1;
	while (world.activityLog.length > max) world.activityLog.shift();
	return world.activityLog;
}

function createActivityLogService({ io, persistence, maxEvents = DEFAULT_MAX_EVENTS } = {}) {
	if (!io) throw new Error('createActivityLogService: io required');

	function record(type, payload) {
		const world = World.getWorld();
		if (!world) return null;
		const buffer = ensureBuffer(world, maxEvents);
		if (!buffer) return null;

		const event = {
			id: world._activityLogNextId++,
			t: Date.now(),
			type: String(type || 'unknown'),
			payload: payload || {},
		};
		buffer.push(event);
		if (buffer.length > maxEvents) buffer.shift();
		try {
			io.to(world.id).emit('activity_event', event);
		} catch (error) {
			console.warn('[ActivityLog] Failed to emit activity_event:', error.message);
		}
		if (persistence && typeof persistence.markDirty === 'function') persistence.markDirty();
		return event;
	}

	function snapshot() {
		const world = World.getWorld();
		if (!world) return [];
		const buffer = ensureBuffer(world, maxEvents);
		return buffer ? buffer.slice() : [];
	}

	function clear() {
		const world = World.getWorld();
		if (!world) return;
		world.activityLog = [];
		world._activityLogNextId = 1;
	}

	// ── Convenience constructors ──────────────────────────────────────
	//
	// Strictly typed so the client doesn't have to guess what shape
	// each event arrives in. New event types should be added here and
	// in `public/js/activityLog.js`.

	function recordTetrominoPlaced({ playerId, playerName, x, z, pieceType, cells }) {
		return record('tetromino_placed', {
			playerId, playerName, x, z, pieceType, cells: cells || null,
		});
	}

	function recordTetrominoDissolved({ playerId, playerName, x, z, pieceType, reason }) {
		return record('tetromino_dissolved', {
			playerId, playerName, x, z, pieceType, reason: reason || 'no_path_to_king',
		});
	}

	function recordChessMove({ playerId, playerName, pieceType, from, to, captured }) {
		return record('chess_move', {
			playerId, playerName, pieceType, from, to,
			captured: captured || null,
		});
	}

	// A rejected move is just as interesting as a successful one when
	// debugging "Why won't this piece move?" — the user explicitly
	// asked for the reason to land in Recent Activity so they don't
	// have to dig through console logs. The schema mirrors `chess_move`
	// plus a `reason` + human-readable `message`.
	function recordChessMoveRejected({
		playerId, playerName, pieceType,
		from, to, reason, message,
	}) {
		return record('chess_move_rejected', {
			playerId, playerName, pieceType,
			from: from || null,
			to: to || null,
			reason: reason || 'invalid_move',
			message: message || null,
		});
	}

	function recordRowsCleared({ playerId, playerName, rows, cols, cellCount }) {
		return record('rows_cleared', {
			playerId, playerName, rows: rows || [], cols: cols || [], cellCount: cellCount || 0,
		});
	}

	function recordIslandDecayed({ playerId, playerName, cellCount, hasPiece, sampleCells, reason }) {
		return record('island_decayed', {
			playerId, playerName, cellCount, hasPiece: !!hasPiece,
			sampleCells: sampleCells || null,
			reason: reason || 'disconnected',
		});
	}

	function recordTerritoryCaptured({
		fromPlayerId, fromPlayerName, toPlayerId, toPlayerName,
		cellCount, sampleCells, reason,
	}) {
		return record('territory_captured', {
			fromPlayerId, fromPlayerName, toPlayerId, toPlayerName,
			cellCount: cellCount || 0,
			sampleCells: sampleCells || null,
			reason: reason || 'chess_move',
		});
	}

	function recordKingDetonation({ playerId, playerName, reason, x, z }) {
		return record('king_detonation', {
			playerId, playerName, reason: reason || 'self_destruct', x, z,
		});
	}

	// ── Per-piece events ──────────────────────────────────────────────
	//
	// Emitted from `server/game/pieces.removePiece` (and friends). The
	// helper picks the right one based on the removal `reason`, so most
	// call-sites just supply a reason and let the helper do the
	// dispatch.

	function recordPieceLost({ playerId, playerName, pieceType, pieceId, x, z, reason }) {
		return record('chess_piece_lost', {
			playerId, playerName, pieceType, pieceId, x, z,
			reason: reason || 'no_supporting_cell',
		});
	}

	function recordPiecesLost({ playerId, playerName, pieceCount, pieces, reason }) {
		return record('chess_pieces_lost', {
			playerId, playerName, pieceCount: pieceCount || 0,
			pieces: pieces || [],
			reason: reason || 'bulk_removal',
		});
	}

	function recordPieceCaptured({ playerId, playerName, pieceType, pieceId, x, z, capturedBy }) {
		return record('chess_piece_captured', {
			playerId, playerName, pieceType, pieceId, x, z,
			capturedBy: capturedBy || null,
		});
	}

	function recordPieceDetonated({ playerId, playerName, pieceType, pieceId, x, z, reason }) {
		return record('chess_piece_detonated', {
			playerId, playerName, pieceType, pieceId, x, z,
			reason: reason || 'self_detonation',
		});
	}

	function recordPiecePromoted({ playerId, playerName, pieceId, fromType, toType, x, z }) {
		return record('chess_piece_promoted', {
			playerId, playerName, pieceId, fromType, toType, x, z,
		});
	}

	function recordPlayerJoined({ playerId, playerName, isComputer }) {
		return record('player_joined', { playerId, playerName, isComputer: !!isComputer });
	}

	function recordPlayerLeft({ playerId, playerName, reason }) {
		return record('player_left', { playerId, playerName, reason: reason || 'disconnect' });
	}

	function recordChat({ playerId, playerName, message }) {
		return record('chat', { playerId, playerName, message: String(message || '').slice(0, 240) });
	}

	return {
		record,
		snapshot,
		clear,
		recordTetrominoPlaced,
		recordTetrominoDissolved,
		recordChessMove,
		recordChessMoveRejected,
		recordRowsCleared,
		recordIslandDecayed,
		recordTerritoryCaptured,
		recordKingDetonation,
		recordPieceLost,
		recordPiecesLost,
		recordPieceCaptured,
		recordPieceDetonated,
		recordPiecePromoted,
		recordPlayerJoined,
		recordPlayerLeft,
		recordChat,
		maxEvents,
	};
}

module.exports = {
	createActivityLogService,
	DEFAULT_MAX_EVENTS,
};
