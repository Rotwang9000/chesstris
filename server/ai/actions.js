/**
 * Strategic action selection for AI players.  Both
 * `performStrategicTetrominoPlacement` and `performStrategicChessMove`
 * mutate the world directly and broadcast the resulting state — they
 * are stateless from the AI's perspective other than reading the player's
 * `lastTetrominoPlacement` marker.
 */

const World = require('../world/World');
const cells = require('../game/cells');
const pieces = require('../game/pieces');
const { GAME_RULES } = require('../game/Constants');
// Shared with the human chess handler so AI pawns freeze identically.
const { markPawnAwaitingPromotion } = require('../game/promotion');

const TETROMINO_TYPES = Object.freeze(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);

function createAiActions({
	io, gameManager, broadcaster, integrityService, spectatorRegistry, lineClearService,
	powerUpManager = null,
}) {
	if (!io) throw new Error('createAiActions: io required');
	if (!gameManager) throw new Error('createAiActions: gameManager required');
	if (!broadcaster) throw new Error('createAiActions: broadcaster required');
	if (!integrityService) throw new Error('createAiActions: integrityService required');
	if (!lineClearService) throw new Error('createAiActions: lineClearService required');

	function performStrategicTetrominoPlacement(computerId) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer) return false;

		const board = world.board;
		const pieceType = TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)];
		const rotation = Math.floor(Math.random() * 4);
		const shape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, rotation);
		if (!shape) return false;

		const anchors = collectPlacementAnchors(world, computerId);
		if (anchors.length === 0) return false;

		const maxAttempts = 60;
		const offsetRange = 4;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const anchor = anchors[Math.floor(Math.random() * anchors.length)];
			const x = anchor.x + (Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange);
			const z = anchor.z + (Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange);

			const tetromino = {
				pieceType,
				type: pieceType,
				rotation,
				shape,
				position: { x, z },
			};

			const canPlace = gameManager.tetrominoManager.canPlaceTetromino(
				world, tetromino, x, z, 0, computerId
			);
			if (!canPlace) continue;

			const placedCells = gameManager.tetrominoManager.placeTetromino(world, tetromino, x, z, computerId);
			computerPlayer.lastTetrominoPlacement = { x, z };
			computerPlayer.lastTetrominoPlacementAt = Date.now();
			computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;

			if (powerUpManager && typeof powerUpManager.claimAcrossPlacement === 'function') {
				try {
					powerUpManager.claimAcrossPlacement(world, computerId, placedCells);
				} catch (claimErr) {
					console.warn('[AI] power-up claim failed:', claimErr.message);
				}
			}

			// IMPORTANT: do NOT run island integrity here. The human
			// placement path deliberately defers it to the tail of the
			// line-clear cascade (see server/sockets/tetromino.js and
			// LineClearService.runCascade) so gravity can reconnect
			// stranded cells before anything is decayed. Running it
			// pre-cascade here was stripping OTHER players' pieces/cells
			// when an AI cleared a row — the "AI Expert cleared my far
			// cells / my Queen's wings failed" report. The cascade's
			// final integrity pass handles orphans correctly.
			world.lastAction = {
				type: 'tetromino_placed',
				playerId: computerId,
				data: { pieceType, rotation, x, z },
			};
			World.markDirty();

			broadcaster.broadcastGameUpdate();

			// Animated cascade; players see the same pre-clear flash that
			// human placements produce. We don't await — the AI tick
			// continues on its own schedule.
			lineClearService.runCascade({ world, playerId: computerId }).catch((error) => {
				console.error(`[AI] line-clear cascade failed for ${computerId}:`, error);
			});

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			return true;
		}
		return false;
	}

	function collectPlacementAnchors(world, computerId) {
		const anchors = [];
		const cells = world.board?.cells;

		if (cells) {
			for (const [key, cellContents] of Object.entries(cells)) {
				if (!Array.isArray(cellContents) || cellContents.length === 0) continue;
				const ownsNonHome = cellContents.some(
					item => item && item.player === computerId && item.type !== 'home'
				);
				if (!ownsNonHome) continue;
				const [x, z] = key.split(',').map(Number);
				if (Number.isFinite(x) && Number.isFinite(z)) anchors.push({ x, z });
			}
		}

		if (anchors.length === 0) {
			const king = (world.chessPieces || []).find(
				p => p && p.player === computerId && p.type === 'KING' && p.position
			);
			if (king) anchors.push({ x: king.position.x, z: king.position.z });
		}

		return anchors;
	}

	/**
	 * AI escape under Check. Called from the runner when
	 * `world.pendingCheck.defenderId === computerId`. We walk the AI's
	 * pieces and every existing board cell looking for the first move
	 * that `checkService.validateEscape` accepts (king out of danger
	 * or attacker captured). If none exists, return false — the AI
	 * will eat the deadline.
	 *
	 * We prefer king-moves first (most likely to escape) and then
	 * captures-of-the-attacker, before falling back to the generic
	 * "any-legal-move-that-resolves-the-threat" search. The first
	 * accepted candidate is played; we don't pretend to evaluate
	 * positions beyond that — the AI just survives a single tick.
	 */
	function performCheckEscape(computerId, checkService, kingCaptureService) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer || !checkService) return false;
		if (!world.pendingCheck || String(world.pendingCheck.defenderId) !== String(computerId)) return false;

		const attackerPieceId = world.pendingCheck.attackerPieceId;
		const ownedPieces = (world.chessPieces || []).filter(piece =>
			piece && piece.player === computerId && piece.position
			&& Number.isFinite(piece.position.x) && Number.isFinite(piece.position.z)
		);
		if (ownedPieces.length === 0) return false;

		const cellKeys = Object.keys(world.board?.cells || {});
		const existingCells = [];
		for (const key of cellKeys) {
			const [x, z] = key.split(',').map(Number);
			if (Number.isFinite(x) && Number.isFinite(z)) existingCells.push({ x, z });
		}
		if (existingCells.length === 0) return false;

		// Build a ranked list of move candidates: king-moves first,
		// then "capture-the-attacker" moves, then everything else.
		const kingPieces = ownedPieces.filter(p => String(p.type || '').toUpperCase() === 'KING');
		const attackerPiece = (world.chessPieces || []).find(p => p && String(p.id) === String(attackerPieceId));
		const captureMoves = [];
		const fallback = [];
		const kingMoves = [];

		for (const piece of ownedPieces) {
			for (const target of existingCells) {
				if (piece.position.x === target.x && piece.position.z === target.z) continue;
				if (!gameManager.chessManager.isValidChessMove(world, piece, target.x, target.z)) continue;
				const candidate = { piece, target };
				if (kingPieces.includes(piece)) kingMoves.push(candidate);
				else if (attackerPiece && target.x === attackerPiece.position.x && target.z === attackerPiece.position.z) {
					captureMoves.push(candidate);
				}
				else fallback.push(candidate);
			}
		}
		const ordered = kingMoves.concat(captureMoves, fallback);

		for (const { piece, target } of ordered) {
			const escape = checkService.validateEscape({
				world, piece, toX: target.x, toZ: target.z,
			});
			if (!escape.ok) continue;

			const moveResult = applyChessMove(world, piece, target.x, target.z, computerId);
			if (!moveResult.success) continue;

			computerPlayer.lastChessMoveAt = Date.now();
			computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;

			integrityService.runIslandIntegrityPass({ emitAnimation: true });

			world.lastAction = {
				type: 'chess_move',
				playerId: computerId,
				data: {
					pieceId: piece.id,
					targetPosition: { x: target.x, z: target.z },
					captured: moveResult.capturedPiece || null,
					checkEscape: true,
				},
			};
			World.markDirty();

			broadcaster.broadcastGameUpdate();
			io.to(world.id).emit('chess_move', {
				playerId: computerId,
				movedPiece: moveResult.movedPiece,
				movedFrom: moveResult.from,
				movedTo: moveResult.to,
				capturedPiece: moveResult.capturedPieceSnapshot,
			});

			// Defender successfully escaped — clear the pending check.
			try { checkService.cancelCheck(world, 'ai_escaped'); }
			catch (e) { console.warn('[AI] check cancel failed:', e.message); }

			if (moveResult.capturedPiece && moveResult.capturedPiece.type === 'KING' && kingCaptureService) {
				// Escape-by-king-capture (defender takes the attacker
				// king). Vanishingly rare but handle it cleanly — route
				// through the shared resolver so it's duel-eligible and
				// idempotent, exactly like the human path.
				kingCaptureService.resolveKingCapture({
					captorId: computerId, defeatedId: moveResult.capturedPiece.player,
				});
			}

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			console.log(
				`[AI] ${computerId} escaped check via ${piece.type} → (${target.x}, ${target.z}).`
			);
			return true;
		}

		console.log(`[AI] ${computerId} found no legal escape — will be captured on deadline.`);
		return false;
	}

	function performStrategicChessMove(computerId, kingCaptureService, checkService = null) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer) return false;

		const chessPieces = world.chessPieces || [];
		// Mirror the human chess handler: the ATTACKER PIECE in a
		// pending check is locked, but the attacker's OTHER pieces
		// can still move freely. Drop the locked piece from
		// `ownedPieces` so the random-pick loop below never even
		// tries it (avoids burning the 80 attempts on a piece that
		// will always be rejected).
		const lockedPieceId = (world.pendingCheck
			&& String(world.pendingCheck.attackerId) === String(computerId))
			? String(world.pendingCheck.attackerPieceId)
			: null;
		const ownedPieces = chessPieces.filter(piece =>
			piece && piece.player === computerId && piece.position
			&& Number.isFinite(piece.position.x) && Number.isFinite(piece.position.z)
			&& (lockedPieceId === null || String(piece.id) !== lockedPieceId)
			// Frozen pawns awaiting promotion can't move (mirrors the
			// human handler) — skip them so the AI doesn't burn its
			// attempts trying to march a locked pawn.
			&& !piece.awaitingPromotion
		);
		if (ownedPieces.length === 0) return false;

		const existingCells = [];
		for (const key of Object.keys(world.board?.cells || {})) {
			const [x, z] = key.split(',').map(Number);
			if (Number.isFinite(x) && Number.isFinite(z)) existingCells.push({ x, z });
		}
		if (existingCells.length === 0) return false;

		const maxAttempts = 80;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const piece = ownedPieces[Math.floor(Math.random() * ownedPieces.length)];
			const target = existingCells[Math.floor(Math.random() * existingCells.length)];

			if (piece.position.x === target.x && piece.position.z === target.z) continue;
			if (!gameManager.chessManager.isValidChessMove(world, piece, target.x, target.z)) continue;

			const moveResult = applyChessMove(world, piece, target.x, target.z, computerId, { checkService });
			// Deferred-check responses count as "acted" — the check
			// service has emitted the warning, and we don't want the
			// AI's stuck-counter ticking up for this case. Stamp the move
			// time too so starting a check consumes the AI's turn (H7
			// parity with the human handler) and the player reads as
			// active for island-decay purposes.
			if (moveResult.deferredCheck) {
				computerPlayer.lastChessMoveAt = Date.now();
				computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;
				World.markDirty();
				return true;
			}
			if (!moveResult.success) continue;

			computerPlayer.lastChessMoveAt = Date.now();
			computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;

			// Run integrity so any defender pieces stranded by this AI's
			// ownership transfer get queued for decay with proper
			// grace-period tracking — exactly like the human chess move
			// flow does (see `server/sockets/chess.js`).
			integrityService.runIslandIntegrityPass({ emitAnimation: true });

			world.lastAction = {
				type: 'chess_move',
				playerId: computerId,
				data: {
					pieceId: piece.id,
					targetPosition: { x: target.x, z: target.z },
					captured: moveResult.capturedPiece || null,
				},
			};
			World.markDirty();

			broadcaster.broadcastGameUpdate();
			io.to(world.id).emit('chess_move', {
				playerId: computerId,
				movedPiece: moveResult.movedPiece,
				movedFrom: moveResult.from,
				movedTo: moveResult.to,
				capturedPiece: moveResult.capturedPieceSnapshot,
			});

			if (moveResult.capturedPieceSnapshot) {
				io.to(world.id).emit('chess_capture', {
					at: { x: target.x, z: target.z },
					capturedPiece: moveResult.capturedPieceSnapshot,
					capturedBy: {
						playerId: computerId,
						pieceId: piece.id,
						pieceType: pieces.pieceLabel(piece),
					},
					t: Date.now(),
				});
			}

			if (moveResult.capturedPiece && moveResult.capturedPiece.type === 'KING' && kingCaptureService) {
				// Shared with the human path — records the capture in the
				// simultaneous-capture window and hands off to a King's
				// Duel if the defender had just taken this AI's king too.
				kingCaptureService.resolveKingCapture({
					captorId: computerId, defeatedId: moveResult.capturedPiece.player,
				});
			}

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			return true;
		}
		return false;
	}

	function applyChessMove(world, piece, targetX, targetZ, computerId, { checkService = null } = {}) {
		const computerPlayer = world.players?.[computerId];
		const sourceCell = gameManager.boardManager.getCell(world.board, piece.position.x, piece.position.z);
		if (!sourceCell) return { success: false };

		const chessPieceObj = sourceCell.find(
			item => item && item.type === 'chess' && item.pieceId === piece.id
		);
		if (!chessPieceObj) return { success: false };

		const targetCell = gameManager.boardManager.getCell(world.board, targetX, targetZ);
		let capturedPiece = null;

		let capturedPieceSnapshot = null;
		if (Array.isArray(targetCell) && targetCell.length > 0) {
			const capturedPieceObj = targetCell.find(
				item => item && item.type === 'chess' && item.player !== computerId
			);
			if (capturedPieceObj) {
				const target = world.chessPieces.find(
					p => p && String(p.id) === String(capturedPieceObj.pieceId)
				);
				// Deferred king-capture — same flow as the human chess
				// handler. The AI's move is held back, the king isn't
				// removed, the defender gets `CHECK_DEADLINE_MS` to
				// escape. Resolution is handled by `checkService.expireCheck`
				// (timeout) or `checkService.cancelCheck` (defender moved
				// out of danger).
				//
				// A check window is already open on this king — don't let
				// the AI skip the queue and instant-capture during the
				// defender's grace window (Chess-C2 parity with the human
				// handler). The AI will simply pick another move.
				if (target && String(target.type || '').toUpperCase() === 'KING'
					&& checkService && world.pendingCheck
					&& String(world.pendingCheck.defenderId) === String(target.player)) {
					return { success: false };
				}

				// Anti-spam: if this AI piece has used up its grace
				// deferrals on this king, `startCheck` returns null and
				// the AI's attack falls through to a normal capture.
				if (target && String(target.type || '').toUpperCase() === 'KING'
					&& checkService && !world.pendingCheck) {
					const started = checkService.startCheck({
						world,
						attackerPiece: piece,
						kingPiece: target,
						queuedMove: {
							captorId: computerId,
							defeatedId: target.player,
							toX: targetX,
							toZ: targetZ,
							attackerPieceId: piece.id,
						},
					});
					if (started) {
						return { success: false, deferredCheck: true };
					}
					// Else: defer denied — proceed with the normal
					// capture below.
				}
				if (target) {
					capturedPiece = target;
					capturedPieceSnapshot = {
						id: target.id,
						type: target.type,
						player: target.player,
						position: { x: targetX, z: targetZ },
					};
					// Route capture through the central helper. Emit a
					// per-piece `chess_piece_captured` activity event so
					// the user always sees *where* their piece was
					// captured — previously the AI flow only carried the
					// `captured` field on the move event, which left the
					// activity log silent and the user with no way to
					// reconcile a vanished piece with the world.
					pieces.removePiece(world, target, {
						reason: pieces.REMOVAL_REASONS.CAPTURED,
						activityLog: gameManager.activityLog || null,
						capturedBy: {
							playerId: computerId,
							playerName: computerPlayer?.name || computerPlayer?.username || computerId,
							pieceId: piece.id,
							pieceType: pieces.pieceLabel(piece),
						},
					});
					console.log(
						`[AI] ${computerId} (${piece.type} ${piece.id}) captured ` +
						`${capturedPiece.player}'s ${capturedPiece.type} ` +
						`(${capturedPiece.id}) at (${targetX}, ${targetZ})`
					);
				}
			}
		}

		const remainingAtSource = sourceCell.filter(
			item => !(item && item.type === 'chess' && String(item.pieceId) === String(piece.id))
		);
		if (remainingAtSource.length > 0) {
			gameManager.boardManager.setCell(world.board, piece.position.x, piece.position.z, remainingAtSource);
		} else {
			gameManager.boardManager.setCell(world.board, piece.position.x, piece.position.z, null);
		}

		// Strip enemy chess markers from the destination (capture handled
		// above), then transfer non-home content ownership to the mover —
		// same rule as the player chess_move handler. Without this the AI
		// can leave orphaned enemy terrain under itself, which then decays
		// the AI's own piece a few passes later via island integrity.
		const aiPlayer = world.players?.[computerId];
		const aiColor = aiPlayer?.color;
		const targetCellContents = Array.isArray(targetCell)
			? cells.stripAllChessMarkers(targetCell)
			: [];
		const aiPreviousOwners = new Set();
		for (const item of targetCellContents) {
			if (item && item.type !== 'home' && item.player != null
				&& String(item.player) !== String(computerId)) {
				aiPreviousOwners.add(String(item.player));
			}
		}
		cells.transferOwnership(targetCellContents, computerId, aiColor);
		targetCellContents.push({
			...chessPieceObj,
			position: { x: targetX, z: targetZ },
			player: computerId,
		});
		gameManager.boardManager.setCell(world.board, targetX, targetZ, targetCellContents);

		if (gameManager.activityLog && aiPreviousOwners.size > 0) {
			try {
				for (const prevOwnerId of aiPreviousOwners) {
					const prevOwner = world.players ? world.players[prevOwnerId] : null;
					gameManager.activityLog.recordTerritoryCaptured({
						fromPlayerId: prevOwnerId,
						fromPlayerName: prevOwner?.username || prevOwner?.name || prevOwnerId,
						toPlayerId: computerId,
						toPlayerName: aiPlayer?.username || aiPlayer?.name || computerId,
						cellCount: 1,
						sampleCells: [{ x: targetX, z: targetZ }],
						reason: 'ai_chess_move',
					});
				}
			} catch (err) {
				console.warn('[AI] activity log failed (territory):', err.message);
			}
		}

		const pieceIndex = world.chessPieces.findIndex(p => p && p.id === piece.id);
		const originalPosition = { x: piece.position.x, z: piece.position.z };
		let movedPiece = piece;
		if (pieceIndex !== -1) {
			movedPiece = world.chessPieces[pieceIndex];
			// Track net forward progress for the AI's pawns too —
			// otherwise AI pawns never trigger the promotion freeze.
			if (movedPiece.type === 'PAWN' && gameManager.chessManager) {
				gameManager.chessManager.updatePawnForwardDistance(
					movedPiece,
					originalPosition.x, originalPosition.z,
					targetX, targetZ,
				);
			}
			movedPiece.position = { x: targetX, z: targetZ };
			movedPiece.hasMoved = true;
			world.chessPieces[pieceIndex] = movedPiece;

			// Freeze at the promotion threshold exactly like a human pawn
			// (H5). Without this an AI pawn that completes the promotion
			// walk just keeps marching as an unkillable super-pawn that
			// never promotes. The marker is already stamped at the target
			// cell above, so the freeze flag mirrors onto it correctly.
			if (movedPiece.type === 'PAWN'
				&& !movedPiece.awaitingPromotion
				&& (movedPiece.forwardDistance || 0) >= GAME_RULES.PAWN_PROMOTION_DISTANCE) {
				markPawnAwaitingPromotion(world, computerId, movedPiece, {
					broadcaster,
					activityLog: gameManager.activityLog || null,
					io,
				});
			}
		}

		// AI moves were previously invisible in the activity log; only
		// human moves were recorded. Record this one with the same
		// shape (`chess_move`) so the replay panel is consistent.
		if (gameManager.activityLog) {
			try {
				gameManager.activityLog.recordChessMove({
					playerId: computerId,
					playerName: (world.players?.[computerId]?.username)
						|| (world.players?.[computerId]?.name)
						|| computerId,
					pieceType: pieces.pieceLabel(movedPiece),
					from: originalPosition,
					to: { x: targetX, z: targetZ },
					captured: capturedPiece ? {
						playerId: capturedPiece.player,
						pieceType: pieces.pieceLabel(capturedPiece),
					} : null,
				});
			} catch (err) {
				console.warn('[AI] activity log failed:', err.message);
			}
		}

		return {
			success: true,
			movedPiece,
			capturedPiece,
			capturedPieceSnapshot,
			from: originalPosition,
			to: { x: targetX, z: targetZ },
		};
	}

	return {
		performStrategicTetrominoPlacement,
		performStrategicChessMove,
		performCheckEscape,
	};
}

module.exports = { createAiActions };
