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
		if (!world || !computerPlayer) return;

		const board = world.board;
		const pieceType = TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)];
		const rotation = Math.floor(Math.random() * 4);
		const shape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, rotation);
		if (!shape) return;

		const anchors = collectPlacementAnchors(world, computerId);
		if (anchors.length === 0) return;

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

			integrityService.runIslandIntegrityPass({ emitAnimation: true });
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
			return;
		}
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

	function performStrategicChessMove(computerId, kingCaptureService) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer) return;

		const chessPieces = world.chessPieces || [];
		const ownedPieces = chessPieces.filter(piece =>
			piece && piece.player === computerId && piece.position
			&& Number.isFinite(piece.position.x) && Number.isFinite(piece.position.z)
		);
		if (ownedPieces.length === 0) return;

		const existingCells = [];
		for (const key of Object.keys(world.board?.cells || {})) {
			const [x, z] = key.split(',').map(Number);
			if (Number.isFinite(x) && Number.isFinite(z)) existingCells.push({ x, z });
		}
		if (existingCells.length === 0) return;

		const maxAttempts = 80;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const piece = ownedPieces[Math.floor(Math.random() * ownedPieces.length)];
			const target = existingCells[Math.floor(Math.random() * existingCells.length)];

			if (piece.position.x === target.x && piece.position.z === target.z) continue;
			if (!gameManager.chessManager.isValidChessMove(world, piece, target.x, target.z)) continue;

			const moveResult = applyChessMove(world, piece, target.x, target.z, computerId);
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
				kingCaptureService.executeKingCapture(computerId, moveResult.capturedPiece.player);
			}

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			return;
		}
	}

	function applyChessMove(world, piece, targetX, targetZ, computerId) {
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
			? targetCell.filter(item => item && item.type !== 'chess')
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
			movedPiece.position = { x: targetX, z: targetZ };
			movedPiece.hasMoved = true;
			world.chessPieces[pieceIndex] = movedPiece;
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
	};
}

module.exports = { createAiActions };
