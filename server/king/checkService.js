'use strict';

/**
 * Check service — gives a player whose king is about to be captured
 * a window of grace to either move the king to safety or capture the
 * attacker. Per player spec (May 2026):
 *
 *   "If a king is attempted to be captured (so one step later than
 *    normal check), they get 1 move with a time limit so they have
 *    a chance to escape. They get a big message on screen, the
 *    camera auto-zooms to their king, and a countdown timer runs.
 *    If they don't move out of the way in time then they are
 *    automatically captured. This takes place BEFORE the attacking
 *    piece has moved, so the king can always just take the piece if
 *    it is next to it… but the king cannot move onto a piece where
 *    it is threatened by another piece, just like with real check."
 *
 * Lifecycle:
 *   1. `startCheck(...)` is called from the chess move handler when
 *      a chess move WOULD capture another player's king. The
 *      attacker's move is deferred: the attacker piece stays put,
 *      the king stays put, and the defender has `CHECK_DEADLINE_MS`
 *      to act.
 *   2. While `world.pendingCheck` is set:
 *        • the defender's tetris auto-fall is paused (client reads
 *          the flag from `game_update` payloads);
 *        • the defender's NEXT chess move must be a legal escape
 *          (king-out-of-danger or capture-the-attacker) — the chess
 *          handler delegates to `validateEscape` which rejects
 *          anything else;
 *        • the attacker piece is frozen so they can't sneak it
 *          elsewhere during the window.
 *   3. If the defender escapes, `cancelCheck(...)` clears the
 *      pending capture and the attacker has to re-issue any move on
 *      their own time.
 *   4. If the deadline expires, `expireCheck(...)` executes the
 *      original capture via the existing king-capture service. The
 *      original attacking piece is teleported to the king's square
 *      so the visual capture lines up with what the defender saw.
 *
 * The service is stateless beyond `world.pendingCheck` and an
 * in-memory deadline timer keyed by world id, so persistence
 * snapshots survive process restarts (the deadline is rescheduled
 * from `deadlineAt` on next boot — see `rehydrate`).
 */

const World = require('../world/World');
const pieces = require('../game/pieces');

// Time the defender has to escape before the king is auto-captured.
// Originally 30s but the user found that long enough for a single
// attacker piece to repeatedly shuffle into checking range and stall
// the game indefinitely. 20s still leaves ample time for the camera
// fly-over + a thoughtful move, but punishes lazy defenders.
const CHECK_DEADLINE_MS = 20000;

// How many times the SAME attacker piece may grant the defender a
// grace move before subsequent attacks bypass the defer and capture
// the king directly. The first two attacks from a given attacker
// give the defender a 20s escape window; the third (or later) simply
// takes the king. Resets implicitly when the attacker piece is
// captured / removed (the property lives on the piece itself, so it
// dies with it).
const MAX_CHECK_DEFERS_PER_PIECE = 2;

function createCheckService({
	io,
	gameManager,
	broadcaster,
	kingCaptureService,
	activityLog = null,
} = {}) {
	if (!io) throw new Error('createCheckService: io required');
	if (!gameManager) throw new Error('createCheckService: gameManager required');
	if (!broadcaster) throw new Error('createCheckService: broadcaster required');
	if (!kingCaptureService) throw new Error('createCheckService: kingCaptureService required');

	const timers = new Map();

	function startCheck({ world, attackerPiece, kingPiece, queuedMove }) {
		if (!world || !attackerPiece || !kingPiece) return null;
		// Only one outstanding check per world. If somebody already
		// has one against this defender, we leave it alone (the
		// first attacker is the one who gets the prize).
		if (world.pendingCheck) return world.pendingCheck;

		// Anti-spam: a piece that has already burned through its
		// grace attempts on the defender's king doesn't get to defer
		// again. The caller should capture the king directly when
		// `startCheck` returns null with this reason.
		const priorAttempts = Number(attackerPiece.checkAttempts) || 0;
		if (priorAttempts >= MAX_CHECK_DEFERS_PER_PIECE) {
			console.log(
				`[Check] ${attackerPiece.player} (${attackerPiece.type} ${attackerPiece.id}) `
				+ `exhausted check grace (${priorAttempts}/${MAX_CHECK_DEFERS_PER_PIECE}) — direct capture.`
			);
			return null;
		}

		const defenderId = kingPiece.player;
		const attackerId = attackerPiece.player;
		const deadlineAt = Date.now() + CHECK_DEADLINE_MS;

		// Bump the attempt count on the piece itself so it survives
		// persistence snapshots without needing a parallel structure
		// on the world. The count dies with the piece (capture /
		// removal) — exactly the lifecycle we want.
		attackerPiece.checkAttempts = priorAttempts + 1;

		world.pendingCheck = {
			defenderId,
			attackerId,
			attackerPieceId: attackerPiece.id,
			attackerFrom: { x: attackerPiece.position.x, z: attackerPiece.position.z },
			attackerTo: { x: queuedMove.toX, z: queuedMove.toZ },
			kingPieceId: kingPiece.id,
			kingPos: { x: kingPiece.position.x, z: kingPiece.position.z },
			deadlineAt,
			startedAt: Date.now(),
			attempt: attackerPiece.checkAttempts,
			maxAttempts: MAX_CHECK_DEFERS_PER_PIECE,
		};

		const timer = setTimeout(() => expireCheck(world.id), CHECK_DEADLINE_MS);
		timers.set(world.id, timer);

		try {
			io.to(world.id).emit('chess_check', { ...world.pendingCheck });
		} catch (emitErr) {
			console.warn('[Check] emit chess_check failed:', emitErr.message);
		}

		if (activityLog && typeof activityLog.recordCheckStarted === 'function') {
			try {
				activityLog.recordCheckStarted({
					attackerId,
					defenderId,
					attackerPieceType: String(attackerPiece.type || '').toLowerCase(),
					deadlineMs: CHECK_DEADLINE_MS,
				});
			} catch (logErr) {
				console.warn('[Check] activity log failed:', logErr.message);
			}
		}

		try { broadcaster.broadcastGameUpdate(); }
		catch (broadcastErr) { console.warn('[Check] broadcast failed:', broadcastErr.message); }

		console.log(`[Check] ${attackerId} threatens ${defenderId}'s king — ${CHECK_DEADLINE_MS}ms to escape.`);
		return world.pendingCheck;
	}

	function cancelCheck(worldOrId, reason = 'escaped') {
		const world = typeof worldOrId === 'string'
			? World.getWorld()
			: worldOrId;
		if (!world || !world.pendingCheck) return false;
		const snapshot = world.pendingCheck;
		world.pendingCheck = null;
		const timer = timers.get(world.id);
		if (timer) {
			clearTimeout(timer);
			timers.delete(world.id);
		}
		try {
			io.to(world.id).emit('chess_check_cleared', {
				defenderId: snapshot.defenderId,
				attackerId: snapshot.attackerId,
				reason,
			});
		} catch (emitErr) {
			console.warn('[Check] emit chess_check_cleared failed:', emitErr.message);
		}
		try { broadcaster.broadcastGameUpdate(); }
		catch (broadcastErr) { console.warn('[Check] broadcast failed:', broadcastErr.message); }
		console.log(`[Check] cleared (${reason}) — ${snapshot.attackerId} → ${snapshot.defenderId}.`);
		return true;
	}

	function expireCheck(worldId) {
		const world = World.getWorld();
		if (!world || world.id !== worldId) return;
		if (!world.pendingCheck) return;
		const snapshot = world.pendingCheck;

		// Re-validate the threat before auto-capturing. External events
		// during the window — the attacker being captured / decayed /
		// line-cleared, or the king being removed and respawned
		// elsewhere by the king-life service — can dissolve the threat.
		// Auto-capturing on a stale snapshot would unfairly eliminate a
		// defender whose attacker is already gone. (Chess-H2)
		const attacker = (world.chessPieces || []).find(
			p => p && String(p.id) === String(snapshot.attackerPieceId)
		);
		const king = (world.chessPieces || []).find(
			p => p && String(p.id) === String(snapshot.kingPieceId)
		);
		let stillThreatens = false;
		if (attacker && attacker.position && king && king.position
			&& String(king.player) === String(snapshot.defenderId)) {
			try {
				stillThreatens = gameManager.chessManager.isValidChessMove(
					world, attacker, king.position.x, king.position.z
				);
			} catch (_e) { stillThreatens = false; }
		}

		world.pendingCheck = null;
		timers.delete(world.id);

		if (!stillThreatens) {
			try {
				io.to(world.id).emit('chess_check_cleared', {
					defenderId: snapshot.defenderId,
					attackerId: snapshot.attackerId,
					reason: 'threat_gone',
				});
			} catch (emitErr) {
				console.warn('[Check] emit chess_check_cleared failed:', emitErr.message);
			}
			try { broadcaster.broadcastGameUpdate(); }
			catch (broadcastErr) { console.warn('[Check] broadcast failed:', broadcastErr.message); }
			console.log(`[Check] expired but threat dissolved (attacker/king changed) — no capture for ${snapshot.defenderId}.`);
			return;
		}

		try {
			io.to(world.id).emit('chess_check_expired', {
				defenderId: snapshot.defenderId,
				attackerId: snapshot.attackerId,
			});
		} catch (emitErr) {
			console.warn('[Check] emit chess_check_expired failed:', emitErr.message);
		}

		// Remove the defending king from the board + piece list BEFORE
		// the capture service inherits the rest of the loser's forces.
		// The direct-capture path (chess.js) does this via
		// `pieces.removePiece` and only THEN runs executeKingCapture;
		// the deferred path used to skip it, so executeKingCapture's
		// "transfer every piece of the defeated player" loop handed the
		// LIVE king to the captor — captors ended up with two kings and
		// the king never reached the prison. (Chess-C1)
		try {
			const kingPiece = (world.chessPieces || []).find(
				p => p && String(p.id) === String(snapshot.kingPieceId)
			);
			if (kingPiece) {
				pieces.removePiece(world, kingPiece, {
					reason: pieces.REMOVAL_REASONS.CAPTURED,
					silent: true,
				});
			}
		} catch (removeErr) {
			console.warn('[Check] expire: king removal failed:', removeErr.message);
		}

		try {
			kingCaptureService.executeKingCapture(snapshot.attackerId, snapshot.defenderId);
		} catch (captureErr) {
			console.error('[Check] expire capture failed:', captureErr);
		}
		console.log(`[Check] expired — auto-capturing ${snapshot.defenderId} for ${snapshot.attackerId}.`);
	}

	function isPlayerInCheck(world, playerId) {
		return !!(world && world.pendingCheck && String(world.pendingCheck.defenderId) === String(playerId));
	}

	function isAttackerInCheck(world, attackerPieceId) {
		return !!(world && world.pendingCheck
			&& String(world.pendingCheck.attackerPieceId) === String(attackerPieceId));
	}

	/**
	 * Decide whether a move proposed by the defender clears the
	 * check. Hypothetically apply the move on the live world (mutate
	 * + revert) and ask: can ANY opposing piece still legally reach
	 * the king's new position?
	 *
	 * @returns {{ ok: boolean, reason?: string, threatenedBy?: Object }}
	 */
	function validateEscape({ world, piece, toX, toZ }) {
		if (!world || !world.pendingCheck) return { ok: true };
		const check = world.pendingCheck;
		if (String(piece.player) !== String(check.defenderId)) return { ok: true };

		const pos = piece.position || {};
		const fromX = pos.x;
		const fromZ = pos.z;

		// We snapshot only what we mutate so the revert is cheap.
		const fromKey = `${fromX},${fromZ}`;
		const toKey = `${toX},${toZ}`;
		const originalFromCell = world.board.cells[fromKey]
			? world.board.cells[fromKey].slice()
			: null;
		const originalToCell = world.board.cells[toKey]
			? world.board.cells[toKey].slice()
			: null;
		const movedFromMarker = (originalFromCell || []).find(
			item => item && item.type === 'chess'
				&& String(item.pieceId) === String(piece.id)
		);
		const removedFromTarget = (originalToCell || []).filter(
			item => item && item.type === 'chess'
		);

		// Apply hypothetical move.
		piece.position = { x: toX, z: toZ };
		if (originalFromCell) {
			world.board.cells[fromKey] = originalFromCell.filter(item => item !== movedFromMarker);
		}
		if (originalToCell && movedFromMarker) {
			const stripped = originalToCell.filter(item => !(item && item.type === 'chess'));
			stripped.push(movedFromMarker);
			world.board.cells[toKey] = stripped;
		}
		// Remove the captured pieces (if any) from chessPieces list.
		const removedPieces = [];
		for (const marker of removedFromTarget) {
			const captured = world.chessPieces.find(
				p => p && String(p.id) === String(marker.pieceId)
			);
			if (captured) {
				removedPieces.push(captured);
				const idx = world.chessPieces.indexOf(captured);
				if (idx >= 0) world.chessPieces.splice(idx, 1);
			}
		}

		// Look up the king's CURRENT position (might be the king itself
		// that just moved).
		const kingPiece = world.chessPieces.find(
			p => p && String(p.id) === String(check.kingPieceId)
		);
		const kingX = kingPiece ? kingPiece.position.x : check.kingPos.x;
		const kingZ = kingPiece ? kingPiece.position.z : check.kingPos.z;

		let stillThreatenedBy = null;
		for (const opp of world.chessPieces) {
			if (!opp || String(opp.player) === String(check.defenderId)) continue;
			try {
				if (gameManager.chessManager.isValidChessMove(world, opp, kingX, kingZ)) {
					stillThreatenedBy = opp;
					break;
				}
			} catch (_e) { /* defensive */ }
		}

		// Revert hypothetical move.
		piece.position = { x: fromX, z: fromZ };
		if (originalFromCell !== null) world.board.cells[fromKey] = originalFromCell;
		else delete world.board.cells[fromKey];
		if (originalToCell !== null) world.board.cells[toKey] = originalToCell;
		else delete world.board.cells[toKey];
		for (const p of removedPieces) world.chessPieces.push(p);

		if (stillThreatenedBy) {
			return {
				ok: false,
				reason: 'king still threatened after this move',
				threatenedBy: stillThreatenedBy,
			};
		}
		return { ok: true };
	}

	/**
	 * Called every time the defender makes a chess move during a
	 * check. Returns `false` if the move should be REJECTED.
	 */
	function shouldAllowDefenderMove({ world, piece, toX, toZ }) {
		if (!world || !world.pendingCheck) return true;
		if (String(piece.player) !== String(world.pendingCheck.defenderId)) return true;
		const result = validateEscape({ world, piece, toX, toZ });
		return result;
	}

	function rehydrate() {
		const world = World.getWorld();
		if (!world || !world.pendingCheck) return;
		const remaining = world.pendingCheck.deadlineAt - Date.now();
		if (remaining <= 0) {
			expireCheck(world.id);
			return;
		}
		const timer = setTimeout(() => expireCheck(world.id), remaining);
		timers.set(world.id, timer);
		console.log(`[Check] rehydrated — ${remaining}ms remaining on ${world.pendingCheck.attackerId} → ${world.pendingCheck.defenderId}.`);
	}

	/**
	 * Cheap predicate the chess handlers call BEFORE deferring a king
	 * capture. Returns false if the attacker piece has already used
	 * up its grace deferrals on this defender — in that case the
	 * caller should capture the king directly instead of starting a
	 * new pending check.
	 */
	function canDeferCapture(world, attackerPiece) {
		if (!world || !attackerPiece) return false;
		if (world.pendingCheck) return false;
		const priorAttempts = Number(attackerPiece.checkAttempts) || 0;
		return priorAttempts < MAX_CHECK_DEFERS_PER_PIECE;
	}

	return {
		startCheck,
		cancelCheck,
		expireCheck,
		isPlayerInCheck,
		isAttackerInCheck,
		canDeferCapture,
		shouldAllowDefenderMove,
		validateEscape,
		rehydrate,
		CHECK_DEADLINE_MS,
		MAX_CHECK_DEFERS_PER_PIECE,
	};
}

module.exports = { createCheckService };
