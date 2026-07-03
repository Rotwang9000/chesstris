/**
 * Execute the consequences of a king capture:
 *   • move the loser to the king-prison ledger,
 *   • transfer terrain ownership to the captor,
 *   • inherit the loser's chess pieces (marking pawns "suicidal" so they
 *     detonate after a delay), and
 *   • broadcast `king_captured` plus the staggered `suicidal_pawn` chain.
 */

const World = require('../world/World');
const { GAME_RULES } = require('../game/Constants');
const pieces = require('../game/pieces');

const SUICIDAL_PAWN_STEP_MS = 500;

function createKingCaptureService({ io, gameManager, broadcaster, activityLog = null }) {
	if (!io) throw new Error('createKingCaptureService: io required');
	if (!gameManager) throw new Error('createKingCaptureService: gameManager required');
	if (!broadcaster) throw new Error('createKingCaptureService: broadcaster required');

	// Wired post-construction (bootstrap) to avoid a circular dep — the
	// duel service is built with a reference to THIS service.
	let duelService = null;
	function setDuelService(svc) { duelService = svc; }

	/**
	 * Single entry-point for "a king was just taken" used by BOTH the
	 * human chess handler and the AI. Previously the AI called
	 * `executeKingCapture` directly, skipping the simultaneous-capture
	 * window and King's-Duel detection that the human path had — so an
	 * AI could never be drawn into a duel and its captures weren't
	 * recorded in `pendingKingCaptures`. Centralising it keeps the two
	 * paths identical.
	 *
	 * If an opposing capture is already pending within
	 * `SIMULTANEOUS_CAPTURE_WINDOW_MS` (both kings fell almost together)
	 * we hand off to a King's Duel instead of resolving immediately;
	 * otherwise we record the capture and execute it.
	 *
	 * @returns {{executed:boolean, duel?:boolean, duelId?:string,
	 *           alreadyEliminated?:boolean}}
	 */
	function resolveKingCapture({ captorId, defeatedId } = {}) {
		const world = World.getWorld();
		if (!world) return { executed: false };
		if (!Array.isArray(world.pendingKingCaptures)) world.pendingKingCaptures = [];

		const defeatedRecord = world.players && world.players[defeatedId];
		if (defeatedRecord && defeatedRecord.eliminated) {
			return { executed: false, alreadyEliminated: true };
		}

		const now = Date.now();
		const captureWindow = GAME_RULES.SIMULTANEOUS_CAPTURE_WINDOW_MS || 1000;

		const reverseCapture = world.pendingKingCaptures.find(
			c => String(c.captorId) === String(defeatedId)
				&& String(c.defeatedId) === String(captorId)
				&& (now - c.timestamp) < captureWindow
		);
		if (reverseCapture && duelService && typeof duelService.startDuel === 'function') {
			world.pendingKingCaptures = world.pendingKingCaptures.filter(c => c !== reverseCapture);
			const duelId = duelService.startDuel(defeatedId, captorId);
			World.markDirty();
			return { executed: false, duel: true, duelId };
		}

		world.pendingKingCaptures.push({ captorId, defeatedId, timestamp: now });
		world.pendingKingCaptures = world.pendingKingCaptures.filter(
			c => (now - c.timestamp) < captureWindow * 2
		);
		World.markDirty();

		executeKingCapture(captorId, defeatedId);
		return { executed: true };
	}

	function executeKingCapture(captorId, defeatedId) {
		const world = World.getWorld();
		if (!world) return;

		// Idempotency guard: a king capture transfers the loser's
		// pieces + territory and pushes a prison entry — all
		// destructive, none safe to repeat. Duplicate calls can arrive
		// from the simultaneous-capture window, a check expiry racing a
		// direct capture, or duplicate socket events. If the loser is
		// already flagged eliminated, this capture has already been
		// processed — bail. (Chess-H6)
		const defeatedRecord = world.players && world.players[defeatedId];
		if (defeatedRecord && defeatedRecord.eliminated) {
			console.warn(
				`[KingCapture] ${defeatedId} already eliminated — ignoring duplicate capture by ${captorId}.`
			);
			return;
		}

		const captorPlayer = World.getPlayer(captorId) || {};
		const defeatedPlayer = World.getPlayer(defeatedId) || {};
		console.log(`King captured: ${captorId} takes ${defeatedId}'s forces`);

		// Mark the defeated player as eliminated so the sidebar can
		// hide them and the home-zone allocator skips their coords on
		// the next join (otherwise we keep anchoring fresh players to
		// the corpse-king position forever).
		if (defeatedRecord) {
			defeatedRecord.eliminated = true;
			defeatedRecord.eliminatedAt = Date.now();
		}

		if (!Array.isArray(world.kingPrison)) world.kingPrison = [];
		world.kingPrison.push({
			originalOwner: defeatedId,
			originalName: defeatedPlayer.name || defeatedId,
			originalColor: defeatedPlayer.color,
			capturedBy: captorId,
			capturedAt: Date.now(),
		});

		const inheritedPawnIds = [];
		for (const piece of world.chessPieces) {
			if (piece && piece.player === defeatedId && piece.type === 'PAWN') {
				inheritedPawnIds.push(piece.id);
			}
		}

		// Never hand the defeated player's KING to the captor. Doing so
		// breaks the one-king rule and is the root of the user's "I
		// captured a king but BECAME it / ended up with two kings" report.
		// Every caller is supposed to remove the king before we get here
		// (chess.js, the AI path and `checkService.expireCheck` all call
		// `pieces.removePiece` first), but guard defensively: collect any
		// lingering defeated king and delete it instead of transferring it.
		// A respawn racing the capture, a stale persisted snapshot, or a
		// future caller that forgets the pre-removal would otherwise
		// re-introduce the bug.
		const strayKings = [];
		for (const piece of world.chessPieces) {
			if (!piece || piece.player !== defeatedId) continue;
			if (String(piece.type || '').toUpperCase() === 'KING') {
				strayKings.push(piece);
				continue;
			}
			piece.player = captorId;
			piece.color = captorPlayer.color || piece.color;
			if (piece.type === 'PAWN') piece.suicidal = true;
		}
		for (const king of strayKings) {
			console.warn(
				`[KingCapture] Defeated ${defeatedId} still had a live king ` +
				`(${king.id}) at capture time — removing it rather than transferring (one-king-rule).`
			);
			pieces.removePiece(world, king, {
				reason: pieces.REMOVAL_REASONS.CAPTURED,
				silent: true,
			});
		}

		for (const cell of Object.values(world.board.cells)) {
			if (!Array.isArray(cell)) continue;
			for (const item of cell) {
				if (item && String(item.player) === String(defeatedId)) {
					item.player = captorId;
				}
			}
		}

		if (!Array.isArray(captorPlayer.capturedStyles)) captorPlayer.capturedStyles = [];
		captorPlayer.capturedStyles.push({
			color: defeatedPlayer.color,
			name: defeatedPlayer.name,
		});

		World.markDirty();

		if (activityLog && typeof activityLog.recordKingCaptured === 'function') {
			try {
				activityLog.recordKingCaptured({
					captorId,
					captorName: captorPlayer.name || captorId,
					defeatedId,
					defeatedName: defeatedPlayer.name || defeatedId,
				});
			} catch (logErr) {
				console.warn('[KingCapture] activity log failed:', logErr.message);
			}
		}

		io.to(world.id).emit('king_captured', {
			captorId,
			captorName: captorPlayer.name || captorId,
			defeatedId,
			defeatedName: defeatedPlayer.name || defeatedId,
			defeatedColor: defeatedPlayer.color,
			kingPrison: world.kingPrison,
			inheritedPawnCount: inheritedPawnIds.length,
		});

		if (inheritedPawnIds.length > 0) {
			const pawnDelay = GAME_RULES.SUICIDAL_PAWN_DELAY_MS || 3000;
			setTimeout(() => detonateInheritedPawns(inheritedPawnIds), pawnDelay);
		} else {
			gameManager.islandManager.checkForIslandsAfterRowClear(World.getWorld());
		}

		broadcaster.broadcastGameUpdate();
	}

	function detonateInheritedPawns(pawnIds) {
		let index = 0;
		const step = () => {
			const world = World.getWorld();
			if (!world) return;

			if (index >= pawnIds.length) {
				gameManager.islandManager.checkForIslandsAfterRowClear(world);
				broadcaster.broadcastGameUpdate();
				return;
			}

			const pawnId = pawnIds[index++];
			const pawn = world.chessPieces.find(p => p && p.id === pawnId);
			if (pawn) {
				const px = pawn.position.x;
				const pz = pawn.position.z;
				const ownerForLog = pawn.player;

				pieces.removePiece(world, pawn, {
					reason: pieces.REMOVAL_REASONS.SUICIDAL_PAWN,
					silent: true,
				});
				delete world.board.cells[`${px},${pz}`];

				if (activityLog) {
					try {
						const owner = world.players ? world.players[ownerForLog] : null;
						activityLog.recordPieceDetonated({
							playerId: ownerForLog,
							playerName: owner?.username || owner?.name || ownerForLog,
							pieceType: 'pawn',
							pieceId: pawnId,
							x: px,
							z: pz,
							reason: 'suicidal_pawn',
						});
					} catch (logError) {
						console.warn('[KingCapture] activity log failed:', logError.message);
					}
				}

				io.to(world.id).emit('suicidal_pawn', {
					pieceId: pawnId,
					x: px,
					z: pz,
					remaining: pawnIds.length - index,
				});

				World.markDirty();
				broadcaster.broadcastGameUpdate();
			}

			setTimeout(step, SUICIDAL_PAWN_STEP_MS);
		};

		step();
	}

	return { executeKingCapture, resolveKingCapture, setDuelService };
}

module.exports = { createKingCaptureService };
