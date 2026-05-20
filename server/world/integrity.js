/**
 * World integrity maintenance.
 *
 * Three concerns live in here, all of which sweep the world and tidy it up
 * after destructive operations:
 *
 *   1. Removing chess pieces / cell items whose owner no longer exists.
 *   2. Reconciling the top-level `chessPieces` array against the board
 *      cells (and dropping pieces with no supporting square).
 *   3. Triggering island-decay when territory becomes disconnected from
 *      its owner's king.
 *
 * `runIslandIntegrityPass()` is the cheap per-action sweep that runs after
 * every tetromino placement / chess move.  `processWorldIntegrityMaintenance()`
 * is the periodic full sweep that runs on a timer.
 */

const World = require('../world/World');
const pieces = require('../game/pieces');

function createIntegrityService({ gameManager, broadcaster, persistence, activityLog = null }) {
	if (!gameManager) throw new Error('createIntegrityService: gameManager required');
	if (!broadcaster) throw new Error('createIntegrityService: broadcaster required');
	if (!persistence) throw new Error('createIntegrityService: persistence required');

	function buildValidPlayerIdSet(world) {
		const validPlayerIds = new Set();
		const playerMap = world && world.players && typeof world.players === 'object'
			? world.players
			: {};
		for (const id of Object.keys(playerMap)) {
			if (!id) continue;
			validPlayerIds.add(String(id));
		}
		return validPlayerIds;
	}

	function stripUnknownOwnerContent(world, validPlayerIds = null) {
		if (!world || !world.board || !world.board.cells || !Array.isArray(world.chessPieces)) {
			return { changed: false, removedPieces: 0, cleanedCellItems: 0 };
		}

		const allowedPlayerIds = validPlayerIds || buildValidPlayerIdSet(world);
		if (allowedPlayerIds.size === 0) {
			return { changed: false, removedPieces: 0, cleanedCellItems: 0 };
		}

		let changed = false;
		let removedPieces = 0;
		let cleanedCellItems = 0;

		for (let i = world.chessPieces.length - 1; i >= 0; i--) {
			const piece = world.chessPieces[i];
			const ownerId = piece && piece.player != null ? String(piece.player) : null;
			if (ownerId && !allowedPlayerIds.has(ownerId)) {
				pieces.removePiece(world, piece, {
					reason: pieces.REMOVAL_REASONS.OWNER_GONE,
					activityLog,
				});
				removedPieces++;
				changed = true;
			}
		}

		const validPieceIds = new Set();
		for (const piece of world.chessPieces) {
			if (!piece || piece.id == null) continue;
			validPieceIds.add(String(piece.id));
		}

		const boardCells = world.board.cells;
		for (const [key, cellContents] of Object.entries(boardCells)) {
			if (!Array.isArray(cellContents) || cellContents.length === 0) continue;

			const filtered = cellContents.filter(item => {
				if (!item) return false;

				const ownerId = item.player != null
					? String(item.player)
					: (item.chessPiece && item.chessPiece.player != null
						? String(item.chessPiece.player)
						: null);
				if (ownerId && !allowedPlayerIds.has(ownerId)) return false;

				if (item.type === 'chess') {
					const markerPieceId = item.pieceId != null
						? String(item.pieceId)
						: (item.chessPiece && item.chessPiece.id != null
							? String(item.chessPiece.id)
							: null);
					if (markerPieceId && !validPieceIds.has(markerPieceId)) {
						return false;
					}
				}

				return true;
			});

			if (filtered.length !== cellContents.length) {
				cleanedCellItems += cellContents.length - filtered.length;
				changed = true;
				if (filtered.length > 0) {
					boardCells[key] = filtered;
				} else {
					delete boardCells[key];
				}
			}
		}

		return { changed, removedPieces, cleanedCellItems };
	}

	function repairChessPieceCellConsistency(world) {
		if (!world || !world.board || !world.board.cells || !Array.isArray(world.chessPieces)) {
			return { changed: false, removedPieces: 0, cleanedCellItems: 0 };
		}

		const boardCells = world.board.cells;
		let changed = false;
		let removedPieces = 0;
		let cleanedCellItems = 0;

		const validPlayerIds = buildValidPlayerIdSet(world);
		const staleOwnerCleanup = stripUnknownOwnerContent(world, validPlayerIds);
		if (staleOwnerCleanup.changed) {
			changed = true;
			removedPieces += staleOwnerCleanup.removedPieces;
			cleanedCellItems += staleOwnerCleanup.cleanedCellItems;
		}

		for (let i = world.chessPieces.length - 1; i >= 0; i--) {
			const piece = world.chessPieces[i];
			if (!piece) {
				world.chessPieces.splice(i, 1);
				removedPieces++;
				changed = true;
				continue;
			}

			const pos = piece.position || piece;
			const isKing = String(piece.type || '').toUpperCase() === 'KING';
			if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
				if (!isKing) {
					pieces.removePiece(world, piece, {
						reason: pieces.REMOVAL_REASONS.INVALID_POSITION,
						activityLog,
						note: `invalid position ${JSON.stringify(pos)}`,
					});
					removedPieces++;
					changed = true;
				}
				continue;
			}

			const key = `${pos.x},${pos.z}`;
			const cellContents = boardCells[key];
			const cellExists = Array.isArray(cellContents) && cellContents.length > 0;

			const hasOwnSupportingTerrain = cellExists && cellContents.some(item =>
				item
				&& String(item.player) === String(piece.player)
				&& item.type !== 'chess'
			);

			if (!cellExists) {
				if (isKing) {
					boardCells[key] = [
						{
							type: 'tetromino',
							pieceType: 'king_anchor',
							player: piece.player,
							placedAt: Date.now(),
							isKingAnchor: true,
						},
						{
							type: 'chess',
							player: piece.player,
							pieceId: piece.id,
							pieceType: 'king',
							chessPiece: piece,
						},
					];
					changed = true;
				} else {
					pieces.removePiece(world, piece, {
						reason: pieces.REMOVAL_REASONS.NO_SUPPORTING_CELL,
						activityLog,
					});
					removedPieces++;
					changed = true;
				}
				continue;
			}

			// Kings always need their own supporting terrain — if a line
			// clear or a capture has stripped it down to (say) just an
			// enemy home marker, re-anchor the king with a fresh
			// king-anchor tetromino cell so it doesn't float on hostile
			// territory. Non-king pieces don't get this rescue; the bible
			// resolves their fate through island decay after the standard
			// 30 s grace window, so we leave them alone here. Their chess
			// marker is re-added below if it went missing.
			if (isKing && !hasOwnSupportingTerrain) {
				const filtered = cellContents.filter(item =>
					!(item && item.type === 'chess'
						&& (item.pieceId || item?.chessPiece?.id) != null
						&& String(item.pieceId || item.chessPiece.id) === String(piece.id))
				);
				filtered.push({
					type: 'tetromino',
					pieceType: 'king_anchor',
					player: piece.player,
					placedAt: Date.now(),
					isKingAnchor: true,
				});
				filtered.push({
					type: 'chess',
					player: piece.player,
					pieceId: piece.id,
					pieceType: 'king',
					chessPiece: piece,
				});
				boardCells[key] = filtered;
				changed = true;
				continue;
			}

			const hasChessMarker = cellContents.some(item => {
				if (!item || item.type !== 'chess') return false;
				const markerId = item.pieceId || item?.chessPiece?.id;
				return markerId && String(markerId) === String(piece.id);
			});

			if (!hasChessMarker) {
				cellContents.push({
					type: 'chess',
					player: piece.player,
					pieceId: piece.id,
					pieceType: String(piece.type || '').toLowerCase(),
					chessPiece: piece,
				});
				boardCells[key] = cellContents;
				changed = true;
			}
		}

		return { changed, removedPieces, cleanedCellItems };
	}

	function snapshotBoardCellLengths(board) {
		const snapshot = new Map();
		if (!board || !board.cells || typeof board.cells !== 'object') return snapshot;
		for (const [key, value] of Object.entries(board.cells)) {
			if (!Array.isArray(value)) {
				snapshot.set(key, { length: 0, owners: [] });
				continue;
			}
			const owners = new Set();
			for (const item of value) {
				if (item && item.player != null) owners.add(String(item.player));
			}
			snapshot.set(key, { length: value.length, owners: [...owners] });
		}
		return snapshot;
	}

	function hasBoardLengthChanges(beforeSnapshot, boardAfter) {
		const afterCells = (boardAfter && boardAfter.cells && typeof boardAfter.cells === 'object')
			? boardAfter.cells
			: {};
		const afterKeys = Object.keys(afterCells);
		if (beforeSnapshot.size !== afterKeys.length) return true;
		for (const key of afterKeys) {
			const beforeMeta = beforeSnapshot.has(key) ? beforeSnapshot.get(key) : null;
			const afterLen = Array.isArray(afterCells[key]) ? afterCells[key].length : 0;
			if (beforeMeta === null || beforeMeta.length !== afterLen) return true;
		}
		return false;
	}

	function getReducedCellsFromSnapshot(beforeSnapshot, boardAfter) {
		const cells = [];
		const afterCells = (boardAfter && boardAfter.cells && typeof boardAfter.cells === 'object')
			? boardAfter.cells
			: {};
		for (const [key, beforeMeta] of beforeSnapshot.entries()) {
			const afterLen = Array.isArray(afterCells[key]) ? afterCells[key].length : 0;
			if (beforeMeta.length > afterLen) {
				const [xStr, zStr] = String(key).split(',');
				const x = Number(xStr);
				const z = Number(zStr);
				if (Number.isFinite(x) && Number.isFinite(z)) {
					cells.push({ x, z, owners: beforeMeta.owners });
				}
			}
		}
		return cells;
	}

	/**
	 * Cheap per-action integrity sweep.  Returns the cells that decayed so
	 * the caller can broadcast an animation.
	 *
	 * @param {{ emitAnimation?: boolean }} [options]
	 */
	function runIslandIntegrityPass(options = {}) {
		const emitAnimation = options.emitAnimation !== false;
		const world = World.getWorld();
		if (!world || !world.board || !Array.isArray(world.chessPieces)) {
			return { changed: false, decayCells: [] };
		}

		const pieceRepair = repairChessPieceCellConsistency(world);
		const beforeBoardSnapshot = snapshotBoardCellLengths(world.board);
		const beforeChessCount = world.chessPieces.length;

		gameManager.islandManager.checkForIslandsAfterRowClear(world);
		gameManager.boardManager.recalculateBoardBoundaries(world.board);

		const boardChanged = hasBoardLengthChanges(beforeBoardSnapshot, world.board);
		const chessChanged = beforeChessCount !== world.chessPieces.length;
		const changed = pieceRepair.changed || boardChanged || chessChanged;
		const decayCells = boardChanged
			? getReducedCellsFromSnapshot(beforeBoardSnapshot, world.board)
			: [];

		if (emitAnimation && decayCells.length > 0) {
			broadcaster.emitIslandDecayAnimation(
				decayCells.map(c => ({ x: c.x, z: c.z }))
			);
		}

		broadcastDecayWarnings(world);

		if (activityLog && decayCells.length > 0) {
			const byOwner = new Map();
			for (const cell of decayCells) {
				const owners = Array.isArray(cell.owners) && cell.owners.length > 0
					? cell.owners : ['unknown'];
				for (const owner of owners) {
					const bucket = byOwner.get(owner) || { cells: [], owner };
					bucket.cells.push({ x: cell.x, z: cell.z });
					byOwner.set(owner, bucket);
				}
			}
			for (const { cells, owner } of byOwner.values()) {
				const player = world.players ? world.players[owner] : null;
				try {
					activityLog.recordIslandDecayed({
						playerId: owner,
						playerName: (player && (player.username || player.name)) || owner,
						cellCount: cells.length,
						hasPiece: false,
						sampleCells: cells.slice(0, 3),
						reason: 'disconnected',
					});
				} catch (logError) {
					console.warn('[Integrity] activity log failed:', logError.message);
				}
			}
		}

		if (pieceRepair.removedPieces > 0 || pieceRepair.cleanedCellItems > 0) {
			console.log(
				`[Integrity] Removed ${pieceRepair.removedPieces} orphaned chess piece(s) and ${pieceRepair.cleanedCellItems || 0} stale cell item(s) in ${world.id}.`
			);
		}

		return { changed, decayCells: decayCells.map(c => ({ x: c.x, z: c.z })) };
	}

	/**
	 * Tell each affected player when one of their disconnected islands has
	 * crossed a "you're about to lose this" threshold. We send the toast at
	 * most once per (player, island, threshold) so a long-decaying island
	 * doesn't spam the player every 10 s.
	 */
	function broadcastDecayWarnings(world) {
		try {
			const islandManager = gameManager.islandManager;
			if (typeof islandManager.getDisconnectedIslandRiskReport !== 'function') return;
			if (!world.atRiskWarningsSent || typeof world.atRiskWarningsSent !== 'object') {
				world.atRiskWarningsSent = {};
			}

			const report = islandManager.getDisconnectedIslandRiskReport(world);
			if (!Array.isArray(report) || report.length === 0) return;

			// Move-based decay is the *primary* trigger, so move-count
			// thresholds fire first. The wall-clock thresholds catch AFK
			// players who never advance their move count. We pulse one
			// warning per threshold crossing so the player has chance to
			// react.
			const MOVE_THRESHOLDS = [3, 2, 1];
			const MS_THRESHOLDS = [120000, 60000, 30000, 10000];

			for (const item of report) {
				const islandSignature = item.cells
					.map(c => `${c.x},${c.z}`)
					.sort()
					.join('|');
				const sentKey = `${item.playerId}::${islandSignature}`;
				const previouslySent = world.atRiskWarningsSent[sentKey] || [];

				let warning = null;

				for (const threshold of MOVE_THRESHOLDS) {
					if (item.remainingMoves > threshold) continue;
					const tag = `moves:${threshold}`;
					if (previouslySent.includes(tag)) continue;
					warning = {
						thresholdTag: tag,
						thresholdType: 'moves',
						thresholdValue: threshold,
					};
					break;
				}

				if (!warning) {
					for (const threshold of MS_THRESHOLDS) {
						if (item.remainingMs > threshold) continue;
						const tag = `ms:${threshold}`;
						if (previouslySent.includes(tag)) continue;
						warning = {
							thresholdTag: tag,
							thresholdType: 'ms',
							thresholdValue: threshold,
						};
						break;
					}
				}

				if (warning) {
					broadcaster.emitToPlayer(item.playerId, 'island_at_risk', {
						playerId: item.playerId,
						cells: item.cells,
						remainingMs: item.remainingMs,
						remainingMoves: item.remainingMoves,
						moveLimit: item.moveLimit,
						timeLimitMs: item.timeLimitMs,
						hasPiece: item.hasPiece,
						thresholdType: warning.thresholdType,
						thresholdValue: warning.thresholdValue,
					});
					previouslySent.push(warning.thresholdTag);
				}

				world.atRiskWarningsSent[sentKey] = previouslySent;
			}

			// Sweep stale entries for islands that no longer exist (player
			// bridged or the island already decayed).
			const liveKeys = new Set(report.map(item => {
				const sig = item.cells.map(c => `${c.x},${c.z}`).sort().join('|');
				return `${item.playerId}::${sig}`;
			}));
			for (const key of Object.keys(world.atRiskWarningsSent)) {
				if (!liveKeys.has(key)) delete world.atRiskWarningsSent[key];
			}
		} catch (error) {
			console.error('[Integrity] Error broadcasting decay warnings:', error);
		}
	}

	/**
	 * Periodic full integrity sweep (timer-driven).
	 */
	function processWorldIntegrityMaintenance(options = {}) {
		const emitAnimation = options.emitAnimation !== false;
		const broadcast = options.broadcast !== false;

		try {
			const result = runIslandIntegrityPass({ emitAnimation });
			if (!result.changed) return;

			persistence.markDirty();
			if (broadcast) {
				broadcaster.broadcastGameUpdate();
			}

			if (result.decayCells.length > 0) {
				console.log(
					`[Integrity] Repaired disconnected territory in ${World.getWorldId()}; ${result.decayCells.length} cell(s) decayed.`
				);
			}
		} catch (error) {
			console.error('[Integrity] Error during world integrity maintenance:', error);
		}
	}

	function hasPlayerBoardPresence(playerId) {
		const world = World.getWorld();
		if (!world) return false;
		const pid = String(playerId);
		const homeZones = world.homeZones || {};
		const cells = world.board && world.board.cells ? world.board.cells : {};
		const chessPieces = Array.isArray(world.chessPieces) ? world.chessPieces : [];

		const hasHomeZone = !!homeZones[playerId];
		const hasPiece = chessPieces.some(piece => piece && String(piece.player) === pid);
		const hasOwnedCell = Object.values(cells).some(cell =>
			Array.isArray(cell) && cell.some(item => item && String(item.player) === pid)
		);

		return hasHomeZone && hasPiece && hasOwnedCell;
	}

	return {
		runIslandIntegrityPass,
		processWorldIntegrityMaintenance,
		repairChessPieceCellConsistency,
		hasPlayerBoardPresence,
		buildValidPlayerIdSet,
		stripUnknownOwnerContent,
	};
}

module.exports = { createIntegrityService };
