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

	function executeKingCapture(captorId, defeatedId) {
		const world = World.getWorld();
		if (!world) return;

		const captorPlayer = World.getPlayer(captorId) || {};
		const defeatedPlayer = World.getPlayer(defeatedId) || {};
		console.log(`King captured: ${captorId} takes ${defeatedId}'s forces`);

		// Mark the defeated player as eliminated so the sidebar can
		// hide them and the home-zone allocator skips their coords on
		// the next join (otherwise we keep anchoring fresh players to
		// the corpse-king position forever).
		const defeatedRecord = world.players && world.players[defeatedId];
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

		for (const piece of world.chessPieces) {
			if (!piece || piece.player !== defeatedId) continue;
			piece.player = captorId;
			piece.color = captorPlayer.color || piece.color;
			if (piece.type === 'PAWN') piece.suicidal = true;
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

	return { executeKingCapture };
}

module.exports = { createKingCaptureService };
