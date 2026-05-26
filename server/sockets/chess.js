/**
 * Chess-flow socket handlers:
 *   • chess_move
 *   • promote_pawn
 *   • detonate_pawn
 *
 * King capture, simultaneous-capture detection and the King's Duel
 * mini-game are handled by the king/* services this module composes.
 */

const World = require('../world/World');
const { PLAYER_SETTINGS, GAME_RULES } = require('../game/Constants');
const { getCooldownRemainingMs } = require('../utils/cooldowns');
const cells = require('../game/cells');
const pieces = require('../game/pieces');
const territory = require('../game/territory');

/**
 * Remove a pawn from the board and add a promotion credit to the
 * owner's bank. Idempotent: if a credit for this pawn already exists
 * (because the chess_move auto-bank fired first), the explicit
 * `promote_pawn` socket call returns the existing one instead of
 * double-counting.
 */
function bankPromotionCredit(world, playerId, pawn, { broadcaster, activityLog, io }) {
	const player = world.players?.[playerId];
	if (!player) throw new Error('Player not found while banking promotion');
	if (!Array.isArray(player.promotionCredits)) player.promotionCredits = [];

	// Idempotency: only one credit per pawn — if the chess_move
	// handler already banked it, the legacy promote_pawn socket
	// should be a no-op.
	const existing = player.promotionCredits.find(c => c && c.fromPieceId === pawn.id);
	if (existing) return existing;

	const originalX = pawn.position?.x ?? null;
	const originalZ = pawn.position?.z ?? null;
	const creditId = `credit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

	pieces.removePiece(world, pawn.id, {
		reason: 'promoted_to_credit',
		activityLog,
		silent: true,
	});

	const credit = {
		id: creditId,
		fromPieceId: pawn.id,
		originalX,
		originalZ,
		createdAt: Date.now(),
	};
	player.promotionCredits.push(credit);
	World.markDirty();

	if (activityLog && typeof activityLog.recordPawnPromotedToCredit === 'function') {
		try {
			activityLog.recordPawnPromotedToCredit({
				playerId,
				playerName: player.username || player.name || playerId,
				creditId,
				x: originalX,
				z: originalZ,
			});
		} catch (logErr) {
			console.warn('[Chess] promotion-credit log failed:', logErr.message);
		}
	}

	if (io && world?.id) {
		try {
			io.to(world.id).emit('promotion_credit_added', {
				playerId,
				creditId,
				originalX,
				originalZ,
				createdAt: credit.createdAt,
			});
		} catch (emitErr) {
			console.warn('[Chess] promotion_credit_added emit failed:', emitErr.message);
		}
	}

	try { broadcaster && broadcaster.broadcastGameUpdate(); }
	catch (broadcastErr) { console.warn('[Chess] broadcast failed:', broadcastErr.message); }
	if (broadcaster && typeof broadcaster.emitPromotionCredits === 'function') {
		try { broadcaster.emitPromotionCredits(playerId); }
		catch (emitErr) { console.warn('[Chess] credits emit failed:', emitErr.message); }
	}

	console.log(
		`Player ${playerId} banked promotion credit ${creditId} ` +
		`(pawn ${pawn.id} at ${originalX},${originalZ})`
	);
	return credit;
}

/**
 * Where should a redeemed captured piece land?
 *
 *   1. If the credit's original cell still belongs to the player AND
 *      has no chess piece on it → spawn there. This is the "natural"
 *      promotion location.
 *   2. Otherwise → nearest owned cell to the king (preferring empty
 *      ones). The user's rule: "If the cell the pawn got promoted on
 *      has gone then it goes on the one nearest to the king".
 *
 * Returns `null` if the player has no owned cells at all.
 */
function resolveRedeemSpawnCell(world, playerId, credit) {
	const { originalX, originalZ } = credit || {};
	const hasOriginal = Number.isFinite(originalX) && Number.isFinite(originalZ);
	if (hasOriginal
		&& territory.isOwnedTerritory(world, originalX, originalZ, playerId)
		&& !territory.cellHasChessPiece(world, originalX, originalZ)
	) {
		return { x: originalX, z: originalZ, fallback: false };
	}
	const fallback = territory.findNearestOwnedCell(world, playerId, {
		skip: (x, z) => territory.cellHasChessPiece(world, x, z),
	});
	if (!fallback) return null;
	return { ...fallback, fallback: true };
}

function registerChessHandlers(socket, ctx) {
	const {
		playerId,
		io,
		gameManager,
		broadcaster,
		integrityService,
		kingCaptureService,
		kingDuelService,
		kingDetonationService,
		spectatorRegistry,
		activityLog,
	} = ctx;

	socket.on('chess_move', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}

			const cooldown = getCooldownRemainingMs(
				player, 'lastChessMoveAt', PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS
			);
			if (cooldown > 0) {
				if (callback) callback({ success: false, error: 'rate_limited', retryAfterMs: cooldown });
				return;
			}

			const movePayload = (data && typeof data === 'object' && data.move && typeof data.move === 'object')
				? data.move : data;
			const pieceId = movePayload?.pieceId;
			const targetPosition = movePayload?.targetPosition || (
				(movePayload?.toX !== undefined && movePayload?.toZ !== undefined)
					? { x: movePayload.toX, z: movePayload.toZ }
					: null
			);

			if (!pieceId || !targetPosition || targetPosition.x === undefined || targetPosition.z === undefined) {
				socket.emit('chessFailed', { message: 'Invalid chess move data format' });
				if (callback) callback({ success: false, error: 'Invalid chess move data format' });
				return;
			}

			const world = World.getWorld();
			const pieceIndex = world.chessPieces.findIndex(p => p && p.id === pieceId);
			if (pieceIndex === -1) {
				// The piece is gone from chessPieces but the client UI may
				// still think it exists (last sync was stale). Re-broadcast
				// so the user's board updates immediately, and tell them
				// the piece is no longer available rather than the cryptic
				// 'not found'.
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
				const msg = 'Piece no longer on the board (board was out of sync — refreshed)';
				socket.emit('chessFailed', { message: msg, reason: 'piece_gone', pieceId });
				logRejection(activityLog, world, player, null, targetPosition, 'piece_gone', msg);
				if (callback) callback({ success: false, error: msg, reason: 'piece_gone' });
				return;
			}

			const piece = world.chessPieces[pieceIndex];
			if (piece.player !== playerId) {
				const msg = 'Not your chess piece';
				socket.emit('chessFailed', { message: msg });
				logRejection(activityLog, world, player, piece, targetPosition, 'not_your_piece', msg);
				if (callback) callback({ success: false, error: msg });
				return;
			}

			// Self-heal: if the piece's recorded position has no cell, we
			// know there's been a desync between `chessPieces` and the
			// board. Don't leave the user staring at a "Source cell not
			// found" error — auto-reanchor a king or quietly drop a
			// non-king piece (it would have decayed within the next 30s
			// anyway), refresh the client, and tell the user the piece
			// could not be moved.
			let sourceCell = gameManager.boardManager.getCell(world.board, piece.position.x, piece.position.z);
			if (!sourceCell || !Array.isArray(sourceCell) || sourceCell.length === 0) {
				console.warn(
					`[Chess] ${playerId}'s ${piece.type} (${piece.id}) at ` +
					`(${piece.position?.x}, ${piece.position?.z}) had no supporting cell. ` +
					`Self-healing before failing the move.`
				);
				integrityService.runIslandIntegrityPass({ emitAnimation: false });
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
				const stillThere = world.chessPieces.find(p => p && p.id === pieceId);
				const msg = stillThere
					? 'Your piece had drifted off the board — its square has been restored. Please try again.'
					: 'That piece had already been lost when you clicked. The board has been refreshed.';
				socket.emit('chessFailed', { message: msg, reason: 'desync_repaired' });
				logRejection(activityLog, world, player, piece, targetPosition, 'desync_repaired', msg);
				if (callback) callback({ success: false, error: msg, reason: 'desync_repaired' });
				return;
			}

			if (!gameManager.chessManager.isValidChessMove(world, piece, targetPosition.x, targetPosition.z)) {
				// Distinguish "destination doesn't exist on the board"
				// (race against decay/line-clear that the client hasn't
				// caught up to yet) from a true geometry rejection. The
				// former should trigger a forced refresh client-side so
				// the user isn't stuck staring at a stale highlight.
				const destCell = gameManager.boardManager.getCell(
					world.board, targetPosition.x, targetPosition.z
				);
				const destExists = !!(destCell && Array.isArray(destCell) && destCell.length > 0);
				const detail = classifyMoveRejection(
					gameManager, world, piece, targetPosition, destExists
				);
				const reason = detail.reason;
				const msg = detail.message;
				socket.emit('chessFailed', {
					message: msg,
					reason,
					attempted: { x: targetPosition.x, z: targetPosition.z },
				});
				logRejection(activityLog, world, player, piece, targetPosition, reason, msg);
				// Stale-snapshot rescue: when the destination is gone we
				// proactively push the latest board so the user's next
				// click is against the real state, not the cached one.
				if (!destExists) {
					broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
				}
				if (callback) callback({ success: false, error: msg, reason });
				return;
			}

			// Make sure the source cell has a matching chess marker. If it
			// doesn't, the source cell is out of sync with `chessPieces` —
			// re-stamp the marker so the move can proceed normally.
			let chessPieceObj = sourceCell.find(
				item => item && item.type === 'chess' && String(item.pieceId) === String(pieceId)
			);
			if (!chessPieceObj) {
				console.warn(
					`[Chess] Re-stamping missing source marker for ${piece.type} (${piece.id}) ` +
					`at (${piece.position.x}, ${piece.position.z}) before move.`
				);
				chessPieceObj = {
					type: 'chess',
					player: playerId,
					pieceId: piece.id,
					pieceType: String(piece.type || '').toLowerCase(),
					color: world.players?.[playerId]?.color,
				};
				sourceCell.push(chessPieceObj);
				gameManager.boardManager.setCell(world.board, piece.position.x, piece.position.z, sourceCell);
			}

			const originalPosition = { x: piece.position.x, z: piece.position.z };
			const targetCell = gameManager.boardManager.getCell(world.board, targetPosition.x, targetPosition.z);

			// The captured piece's *last server-authoritative position* is
			// the capture cell. We snapshot the live record before removal
			// so the broadcast / capture animation event can show clients
			// the exact (x, z) where the capture happened — the user's
			// stale-mesh problem was that the client could only guess from
			// its own outdated cache, and the dissolve ended up at the
			// wrong place.
			let capturedPiece = null;
			let capturedPieceSnapshot = null;
			if (Array.isArray(targetCell) && targetCell.length > 0) {
				const captureObj = targetCell.find(
					item => item && item.type === 'chess' && item.player !== playerId
				);
				if (captureObj) {
					const target = world.chessPieces.find(
						p => p && String(p.id) === String(captureObj.pieceId)
					);
					if (target) {
						capturedPiece = target;
						capturedPieceSnapshot = {
							id: target.id,
							type: target.type,
							player: target.player,
							position: {
								x: targetPosition.x,
								z: targetPosition.z,
							},
						};

						// Drop the captured piece into the captor's
						// "basket". Pawns are too common to be
						// strategically valuable here, and kings
						// trigger the standalone king-capture flow,
						// so we limit the basket to the four
						// promotable types. The basket is later
						// surfaced in the UI and offered as an
						// alternative on pawn promotion.
						const promotableTypes = new Set(['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN']);
						const capturedType = String(target.type || '').toUpperCase();
						if (promotableTypes.has(capturedType)) {
							const captorRecord = world.players?.[playerId];
							if (captorRecord) {
								if (!Array.isArray(captorRecord.capturedBasket)) {
									captorRecord.capturedBasket = [];
								}
								captorRecord.capturedBasket.push({
									type: capturedType,
									originalOwner: capturedPieceSnapshot.player,
									originalOwnerName: world.players?.[capturedPieceSnapshot.player]?.name
										|| capturedPieceSnapshot.player,
									originalColor: world.players?.[capturedPieceSnapshot.player]?.color,
									capturedAt: Date.now(),
								});
							}
						}

						const captorPlayer = world.players?.[playerId];
						pieces.removePiece(world, target, {
							reason: pieces.REMOVAL_REASONS.CAPTURED,
							activityLog,
							capturedBy: {
								playerId,
								playerName: captorPlayer?.name || captorPlayer?.username || playerId,
								pieceType: String(piece.type || '').toLowerCase(),
								pieceId: piece.id,
							},
						});
						console.log(
							`[Chess] ${playerId} (${piece.type} ${piece.id}) captured ` +
							`${capturedPieceSnapshot.player}'s ${capturedPieceSnapshot.type} ` +
							`(${capturedPieceSnapshot.id}) at (${targetPosition.x}, ${targetPosition.z})`
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

			// Strip enemy chess markers from the destination (capture already
			// happened above), then transfer non-home content ownership to
			// the mover. Home markers stay with the original owner — they're
			// intrinsic to that player's home zone, per the bible.
			const playerColor = world.players?.[playerId]?.color;
			const targetCellContents = Array.isArray(targetCell)
				? cells.stripAllChessMarkers(targetCell)
				: [];
			// Note the previous owner of the destination's non-home,
			// non-chess content so we can log the territory grab — the
			// user has reported "cells disappeared from me" with no
			// activity trace, and this transfer is one of the silent
			// paths that strips a defender's island connectivity.
			const previousOwners = new Set();
			for (const item of targetCellContents) {
				if (item && item.type !== 'home' && item.player != null
					&& String(item.player) !== String(playerId)) {
					previousOwners.add(String(item.player));
				}
			}
			cells.transferOwnership(targetCellContents, playerId, playerColor);
			targetCellContents.push({ ...chessPieceObj, position: targetPosition, player: playerId });
			gameManager.boardManager.setCell(world.board, targetPosition.x, targetPosition.z, targetCellContents);

			if (activityLog && previousOwners.size > 0) {
				try {
					for (const prevOwnerId of previousOwners) {
						const prevOwner = world.players ? world.players[prevOwnerId] : null;
						activityLog.recordTerritoryCaptured({
							fromPlayerId: prevOwnerId,
							fromPlayerName: prevOwner?.username || prevOwner?.name || prevOwnerId,
							toPlayerId: playerId,
							toPlayerName: player.username || player.name || playerId,
							cellCount: 1,
							sampleCells: [{ x: targetPosition.x, z: targetPosition.z }],
							reason: 'chess_move',
						});
					}
				} catch (logError) {
					console.warn('[Chess] activity log failed (territory):', logError.message);
				}
			}

			piece.position = targetPosition;
			piece.hasMoved = true;
			piece.moveCount = (piece.moveCount || 0) + 1;
			world.chessPieces[pieceIndex] = piece;

			// A capture or territory transfer may strand the previous owner's
			// territory; let the integrity service decide whether anything
			// has decayed.
			integrityService.runIslandIntegrityPass({ emitAnimation: true });

			if (piece.type === 'KING' && !capturedPiece) {
				handleCastling(world, piece, originalPosition, targetPosition, gameManager, playerId);
			}

			world.lastAction = {
				type: 'chess_move',
				playerId,
				data: { ...data, captured: capturedPiece },
			};
			player.lastChessMoveAt = Date.now();
			player.moveCount = (player.moveCount || 0) + 1;
			World.markDirty();

			if (callback) callback({ success: true, updatedPiece: piece, capturedPiece });

			if (activityLog) {
				try {
					activityLog.recordChessMove({
						playerId,
						playerName: player.username || player.name || playerId,
						pieceType: String(piece.type || '').toLowerCase(),
						from: originalPosition,
						to: targetPosition,
						captured: capturedPiece ? {
							playerId: capturedPiece.player,
							pieceType: String(capturedPiece.type || '').toLowerCase(),
						} : null,
					});
				} catch (logError) {
					console.warn('[Chess] activity log failed:', logError.message);
				}
			}

			broadcaster.broadcastGameUpdate();
			io.to(world.id).emit('chess_move', {
				playerId,
				movedPiece: piece,
				movedFrom: originalPosition,
				movedTo: { x: targetPosition.x, z: targetPosition.z },
				capturedPiece: capturedPieceSnapshot,
			});

			// Dedicated capture event so the client can play an
			// authoritative dissolve / flash at the precise server cell
			// without having to peer into its own stale chessPieces cache.
			// Previously the only signal was the broadcast `chess_move`
			// (toast only) and `chess_piece_captured` activity event
			// (no VFX), so the user saw their knight "vanish" with the
			// dissolve playing wherever the *server* later decayed
			// stranded cells — entirely the wrong place.
			if (capturedPieceSnapshot) {
				io.to(world.id).emit('chess_capture', {
					at: { x: targetPosition.x, z: targetPosition.z },
					capturedPiece: capturedPieceSnapshot,
					capturedBy: {
						playerId,
						pieceId: piece.id,
						pieceType: String(piece.type || '').toLowerCase(),
					},
					t: Date.now(),
				});

				// Tell the captor about their updated basket so the
				// UI can render the new total and (eventually) offer
				// the new piece for redeployment on promotion.
				if (typeof broadcaster.emitCapturedBasket === 'function') {
					try { broadcaster.emitCapturedBasket(playerId); }
					catch (basketErr) { console.warn('[Chess] basket emit failed:', basketErr.message); }
				}
			}

			if (capturedPiece && capturedPiece.type === 'KING') {
				handleKingCaptured({
					world, playerId, capturedPiece, callback,
					piece, kingCaptureService, kingDuelService, broadcaster, spectatorRegistry,
				});
				return;
			}

			// Auto-bank a promotion credit if this pawn has walked the
			// full promotion distance. The pawn is consumed; the
			// player redeems the credit later via `redeem_promotion`
			// against a captured-piece basket entry. We use
			// `forwardDistance` (net forward progress) rather than
			// `moveCount` so capture-shuffling and lateral moves don't
			// trigger a fake promotion.
			if (piece.type === 'PAWN'
				&& (piece.forwardDistance || 0) >= GAME_RULES.PAWN_PROMOTION_DISTANCE
			) {
				try {
					bankPromotionCredit(world, playerId, piece, {
						broadcaster, activityLog, io,
					});
				} catch (bankErr) {
					console.warn('[Chess] auto-bank promotion failed:', bankErr.message);
				}
			}

			spectatorRegistry.broadcastUpdate(playerId, world);
		} catch (error) {
			console.error('Error processing chess move:', error);
			socket.emit('chessFailed', { message: error.message || 'Server error processing chess move' });
			if (callback) callback({ success: false, error: `Server error: ${error.message}` });
		}
	});

	// promote_pawn is now a *banking* operation only. When a pawn
	// completes the promotion walk (forwardDistance >= PAWN_PROMOTION_DISTANCE)
	// the chess_move handler auto-banks a credit; this handler exists
	// for legacy clients (or manual triggers) that send the request
	// explicitly. The pawn is removed and a credit is added to
	// `player.promotionCredits` at the pawn's current cell. Players
	// later spend credits via `redeem_promotion`.
	socket.on('promote_pawn', (data, callback) => {
		try {
			const world = World.getWorld();
			const { pieceId } = data || {};
			const piece = (world.chessPieces || []).find(
				p => p && p.id === pieceId && p.player === playerId && p.type === 'PAWN'
			);
			if (!piece) {
				if (callback) callback({ success: false, error: 'Pawn not found' });
				return;
			}
			const distance = piece.forwardDistance || 0;
			if (distance < GAME_RULES.PAWN_PROMOTION_DISTANCE) {
				if (callback) callback({
					success: false,
					error: `Pawn has not advanced far enough (need ${GAME_RULES.PAWN_PROMOTION_DISTANCE}, has ${distance})`,
				});
				return;
			}
			const credit = bankPromotionCredit(world, playerId, piece, {
				broadcaster, activityLog, io,
			});
			if (callback) callback({ success: true, creditId: credit.id });
		} catch (error) {
			console.error('Error banking promotion credit:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});

	// redeem_promotion: spend one banked credit + one matching basket
	// entry to deploy that captured piece on the board. The deploy
	// cell is the credit's `originalX/Z` if it still belongs to the
	// player and has no chess piece on it; otherwise it's the nearest
	// owned cell to the player's king (the user's "if the cell got
	// cleared, fall back to nearest-to-king" rule).
	socket.on('redeem_promotion', (data, callback) => {
		try {
			const world = World.getWorld();
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}
			if (player.eliminated) {
				if (callback) callback({ success: false, error: 'Player is eliminated' });
				return;
			}

			const validTypes = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
			const requestedType = String((data && data.capturedType) || '').toUpperCase();
			if (!validTypes.includes(requestedType)) {
				if (callback) callback({ success: false, error: 'Invalid captured type for redeem' });
				return;
			}

			const credits = Array.isArray(player.promotionCredits) ? player.promotionCredits : null;
			if (!credits || credits.length === 0) {
				if (callback) callback({ success: false, error: 'No promotion credits to redeem' });
				return;
			}
			// If the client supplied a specific creditId honour it;
			// otherwise consume the oldest (FIFO so credits don't
			// stack indefinitely without UX feedback).
			const creditId = data && data.creditId;
			const creditIdx = creditId
				? credits.findIndex(c => c && c.id === creditId)
				: 0;
			if (creditIdx < 0) {
				if (callback) callback({ success: false, error: 'Promotion credit not found' });
				return;
			}
			const credit = credits[creditIdx];

			const basket = Array.isArray(player.capturedBasket) ? player.capturedBasket : null;
			const basketIdx = basket
				? basket.findIndex(item => String(item?.type || '').toUpperCase() === requestedType)
				: -1;
			if (basketIdx < 0) {
				if (callback) callback({
					success: false,
					error: `No captured ${requestedType} in basket`,
				});
				return;
			}

			const spawnCell = resolveRedeemSpawnCell(world, playerId, credit);
			if (!spawnCell) {
				if (callback) callback({
					success: false,
					error: 'No owned cell available to deploy the piece',
				});
				return;
			}

			const piece = pieces.addPiece(world, {
				type: requestedType,
				player: playerId,
				x: spawnCell.x,
				z: spawnCell.z,
				orientation: world.homeZones?.[playerId]?.orientation || 0,
				reason: 'promotion_redeem',
				activityLog,
			});
			if (!piece) {
				if (callback) callback({ success: false, error: 'Failed to spawn piece' });
				return;
			}

			basket.splice(basketIdx, 1);
			credits.splice(creditIdx, 1);
			World.markDirty();

			if (activityLog && typeof activityLog.recordPromotionRedeemed === 'function') {
				try {
					activityLog.recordPromotionRedeemed({
						playerId,
						playerName: player.username || player.name || playerId,
						creditId: credit.id,
						capturedType: requestedType.toLowerCase(),
						pieceId: piece.id,
						x: spawnCell.x,
						z: spawnCell.z,
						originalX: credit.originalX,
						originalZ: credit.originalZ,
						fallback: spawnCell.fallback,
					});
				} catch (logErr) {
					console.warn('[Chess] redeem log failed:', logErr.message);
				}
			}

			try {
				io.to(world.id).emit('promotion_credit_redeemed', {
					playerId,
					creditId: credit.id,
					pieceId: piece.id,
					pieceType: requestedType,
					x: spawnCell.x,
					z: spawnCell.z,
					originalX: credit.originalX,
					originalZ: credit.originalZ,
					fallback: spawnCell.fallback,
				});
			} catch (emitErr) {
				console.warn('[Chess] promotion_credit_redeemed emit failed:', emitErr.message);
			}

			broadcaster.broadcastGameUpdate();
			if (typeof broadcaster.emitCapturedBasket === 'function') {
				try { broadcaster.emitCapturedBasket(playerId); }
				catch (basketErr) { console.warn('[Chess] basket emit failed:', basketErr.message); }
			}
			if (typeof broadcaster.emitPromotionCredits === 'function') {
				try { broadcaster.emitPromotionCredits(playerId); }
				catch (emitErr) { console.warn('[Chess] credits emit failed:', emitErr.message); }
			}

			console.log(
				`Player ${playerId} redeemed promotion credit ${credit.id} → ${requestedType} at ` +
				`(${spawnCell.x}, ${spawnCell.z})${spawnCell.fallback ? ' (fallback near king)' : ''}`
			);

			if (callback) callback({
				success: true,
				pieceId: piece.id,
				pieceType: requestedType,
				position: { x: spawnCell.x, z: spawnCell.z },
				fallback: spawnCell.fallback,
			});
		} catch (error) {
			console.error('Error processing redeem_promotion:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});

	socket.on('skip_chess_move', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}

			const world = World.getWorld();
			// Issue a fresh tetromino so the player can keep playing.
			const tetrominos = gameManager.tetrominoManager.generateTetrominos(world, playerId);
			if (!tetrominos || tetrominos.length === 0) {
				if (callback) callback({ success: false, error: 'Failed to generate tetromino' });
				return;
			}

			const next = tetrominos[0];
			if (!world.currentTurns) world.currentTurns = {};
			world.currentTurns[playerId] = {
				playerId,
				phase: 'tetris',
				startTime: Date.now(),
				minTime: 10000,
				activeTetromino: next,
			};

			// Mark the player as having performed an action so cooldowns + skip
			// detection are honest. Treat a skip as a move for decay
			// purposes too — the player is actively interacting.
			player.lastChessMoveAt = Date.now();
			player.moveCount = (player.moveCount || 0) + 1;
			World.markDirty();

			socket.emit('new_tetromino', {
				tetromino: next,
				message: 'Chess move skipped',
			});
			socket.emit('chess_move_skipped', { playerId });

			if (callback) callback({ success: true, tetromino: next });
			broadcaster.broadcastGameUpdate();
		} catch (error) {
			console.error('Error skipping chess move:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});

	socket.on('detonate_pawn', (data, callback) => {
		try {
			const world = World.getWorld();
			const { pieceId } = data || {};

			const piece = (world.chessPieces || []).find(p =>
				p && String(p.id) === String(pieceId) && String(p.player) === String(playerId)
			);
			const pieceType = String(piece?.type || '').toUpperCase();

			if (pieceType === 'KING') {
				// Voluntary king self-destruct: only allowed when it's the
				// player's *last* piece. Delegate the full lemming-style
				// teardown to the dedicated service so the visual matches
				// the AI-driven path.
				const ownPieces = (world.chessPieces || []).filter(
					p => p && String(p.player) === String(playerId)
				);
				if (ownPieces.length > 1) {
					const err = 'King can only be detonated when it is your last piece';
					if (callback) callback({ success: false, error: err });
					return;
				}

				const player = World.getPlayer(playerId);
				if (player) player.eliminated = true;

				const result = kingDetonationService.detonateKing({
					playerId,
					kingPieceId: pieceId,
					reason: 'voluntary_self_destruct',
				});
				if (callback) callback(result);
				return;
			}

			const result = gameManager.chessManager.detonatePawn(world, playerId, pieceId);

			if (result.success) {
				integrityService.runIslandIntegrityPass({ emitAnimation: true });
				console.log(`Player ${playerId} detonated ${result.pieceType || 'PAWN'} ${pieceId}`);

				socket.to(world.id).emit('pawn_detonation', {
					playerId,
					pieceId,
					pieceType: result.pieceType || 'PAWN',
					detonatedAt: result.detonatedAt,
					endedGame: false,
				});

				if (activityLog) {
					try {
						const player = World.getPlayer(playerId);
						activityLog.recordPieceDetonated({
							playerId,
							playerName: player?.username || player?.name || playerId,
							pieceType: String(result.pieceType || 'pawn').toLowerCase(),
							pieceId,
							x: result.detonatedAt?.x,
							z: result.detonatedAt?.z,
							reason: 'self_detonation',
						});
					} catch (logError) {
						console.warn('[Chess] activity log failed (detonate):', logError.message);
					}
				}

				World.markDirty();
				broadcaster.broadcastGameUpdate();
			}

			if (callback) callback(result);
		} catch (error) {
			console.error('Error detonating piece:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});
}

function handleCastling(world, piece, originalPosition, targetPosition, gameManager, playerId) {
	const dx = targetPosition.x - originalPosition.x;
	const dz = targetPosition.z - originalPosition.z;
	const isCastle = (Math.abs(dx) === 2 && dz === 0) || (dx === 0 && Math.abs(dz) === 2);
	if (!isCastle) return;

	// Re-validate from the original position so we can detect which rook to move.
	const savedPos = { x: piece.position.x, z: piece.position.z };
	piece.position = { ...originalPosition };
	piece.hasMoved = false;
	const castleResult = gameManager.chessManager._validateCastle(world, piece, targetPosition.x, targetPosition.z);
	piece.position = savedPos;
	piece.hasMoved = true;

	if (!castleResult.valid || !castleResult.rookId) return;

	const rook = world.chessPieces.find(p => p && p.id === castleResult.rookId);
	if (!rook) return;

	const rookOldKey = `${castleResult.rookFromX},${castleResult.rookFromZ}`;
	const rookOldCell = world.board.cells[rookOldKey];
	if (Array.isArray(rookOldCell)) {
		const remaining = rookOldCell.filter(item => !(item && item.type === 'chess' && item.pieceId === rook.id));
		if (remaining.length > 0) world.board.cells[rookOldKey] = remaining;
		else delete world.board.cells[rookOldKey];
	}

	rook.position = { x: castleResult.rookToX, z: castleResult.rookToZ };
	rook.hasMoved = true;

	const rookNewCell = gameManager.boardManager.getCell(world.board, castleResult.rookToX, castleResult.rookToZ) || [];
	rookNewCell.push({
		type: 'chess',
		pieceId: rook.id,
		pieceType: 'rook',
		player: playerId,
		color: rook.color,
	});
	gameManager.boardManager.setCell(world.board, castleResult.rookToX, castleResult.rookToZ, rookNewCell);
	console.log(`Castling: rook ${rook.id} moved to (${castleResult.rookToX}, ${castleResult.rookToZ})`);
}

function handleKingCaptured({
	world, playerId, capturedPiece, callback, piece,
	kingCaptureService, kingDuelService, broadcaster, spectatorRegistry,
}) {
	const defeatedId = capturedPiece.player;
	const now = Date.now();
	const captureWindow = GAME_RULES.SIMULTANEOUS_CAPTURE_WINDOW_MS || 1000;

	if (!Array.isArray(world.pendingKingCaptures)) world.pendingKingCaptures = [];

	const reverseCapture = world.pendingKingCaptures.find(
		c => c.captorId === defeatedId
			&& c.defeatedId === playerId
			&& (now - c.timestamp) < captureWindow
	);

	if (reverseCapture) {
		world.pendingKingCaptures = world.pendingKingCaptures.filter(c => c !== reverseCapture);
		const duelId = kingDuelService.startDuel(defeatedId, playerId);

		if (callback) {
			callback({
				success: true,
				updatedPiece: piece,
				capturedPiece,
				duelStarted: true,
				duelId,
			});
		}
		broadcaster.broadcastGameUpdate();
		spectatorRegistry.broadcastUpdate(playerId, world);
		return;
	}

	world.pendingKingCaptures.push({
		captorId: playerId,
		defeatedId,
		timestamp: now,
	});
	world.pendingKingCaptures = world.pendingKingCaptures.filter(
		c => (now - c.timestamp) < captureWindow * 2
	);
	World.markDirty();

	kingCaptureService.executeKingCapture(playerId, defeatedId);
	spectatorRegistry.broadcastUpdate(playerId, world);
}

/**
 * Build a more useful rejection reason than the original binary
 * "invalid_geometry vs destination_missing". The user reported that
 * "Invalid chess move" gave no clue what was wrong, so we now break
 * the failure into more specific cases:
 *
 *   - destination_missing  — cell at (x,z) doesn't exist
 *   - same_square         — pieceId targeted its own square
 *   - friendly_blocker    — destination contains the player's own piece
 *   - path_blocked        — geometry OK, but a piece sits on the path
 *   - path_off_board      — geometry OK, but the slide crosses a void
 *   - bad_geometry        — destination is not reachable for this piece
 *
 * These are stable identifiers a UI can render. The human-readable
 * `message` is for the toast / activity-log copy.
 */
function classifyMoveRejection(gameManager, world, piece, targetPosition, destExists) {
	if (!destExists) {
		return {
			reason: 'destination_missing',
			message: 'That square has gone — the board has been refreshed.',
		};
	}
	const { x: toX, z: toZ } = targetPosition;
	const fromX = piece.position?.x;
	const fromZ = piece.position?.z;

	if (fromX === toX && fromZ === toZ) {
		return { reason: 'same_square', message: 'Cannot move to the same square.' };
	}

	const targetCell = gameManager.boardManager.getCell(world.board, toX, toZ);
	if (Array.isArray(targetCell)) {
		const friendly = targetCell.find(
			it => it && it.type === 'chess' && String(it.player) === String(piece.player)
		);
		if (friendly) {
			return {
				reason: 'friendly_blocker',
				message: `That square is occupied by your own ${(friendly.pieceType || 'piece')}.`,
			};
		}
	}

	const pieceType = String(piece.type || '').toUpperCase();
	const dx = toX - fromX;
	const dz = toZ - fromZ;
	const absX = Math.abs(dx);
	const absZ = Math.abs(dz);

	const isSlider = pieceType === 'ROOK' || pieceType === 'BISHOP' || pieceType === 'QUEEN';

	if (isSlider) {
		const onRay = (pieceType === 'ROOK' && (dx === 0 || dz === 0))
			|| (pieceType === 'BISHOP' && absX === absZ && absX > 0)
			|| (pieceType === 'QUEEN' && (dx === 0 || dz === 0 || absX === absZ));
		if (onRay) {
			const stepX = Math.sign(dx);
			const stepZ = Math.sign(dz);
			let x = fromX + stepX;
			let z = fromZ + stepZ;
			while (x !== toX || z !== toZ) {
				const cell = gameManager.boardManager.getCell(world.board, x, z);
				const hasCell = !!(cell && Array.isArray(cell) && cell.length > 0);
				if (!hasCell) {
					return {
						reason: 'path_off_board',
						message: `Path passes through empty space at (${x}, ${z}).`,
					};
				}
				const blocker = cell.find(it => it && it.type === 'chess');
				if (blocker) {
					return {
						reason: 'path_blocked',
						message: `Path is blocked by a ${blocker.pieceType || 'piece'} at (${x}, ${z}).`,
					};
				}
				x += stepX;
				z += stepZ;
			}
		}
	}

	return {
		reason: 'bad_geometry',
		message: `That square isn't reachable by your ${pieceType.toLowerCase()}.`,
	};
}

// Per-player throttle on rejected-chess-move log entries. Without
// this an over-eager bot (or a human spam-clicking) could fill the
// rolling 200-event activity log with their own bad attempts in a
// few seconds, drowning out everything interesting for spectators
// and fly-through tools.
const REJECTION_LOG_COOLDOWN_MS = 1500;
const _rejectionLogLastAt = new Map();

function logRejection(activityLog, world, player, piece, targetPosition, reason, message) {
	if (!activityLog || typeof activityLog.recordChessMoveRejected !== 'function') return;
	const playerId = player?.id || (piece && piece.player) || null;
	if (playerId) {
		const last = _rejectionLogLastAt.get(playerId) || 0;
		const now = Date.now();
		if (now - last < REJECTION_LOG_COOLDOWN_MS) return;
		_rejectionLogLastAt.set(playerId, now);
	}
	try {
		const playerName = player?.username || player?.name || playerId;
		activityLog.recordChessMoveRejected({
			playerId,
			playerName,
			pieceType: piece ? String(piece.type || '').toLowerCase() : null,
			from: piece && piece.position
				? { x: piece.position.x, z: piece.position.z }
				: null,
			to: targetPosition
				? { x: targetPosition.x, z: targetPosition.z }
				: null,
			reason,
			message,
		});
	} catch (logError) {
		console.warn('[Chess] activity log failed (reject):', logError.message);
	}
}

module.exports = { registerChessHandlers };
