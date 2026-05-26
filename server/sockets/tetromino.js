/**
 * `tetromino_placed` and `request_tetromino` socket handlers.
 */

const World = require('../world/World');
const { PLAYER_SETTINGS } = require('../game/Constants');
const { getCooldownRemainingMs } = require('../utils/cooldowns');

function registerTetrominoHandlers(socket, ctx) {
	const {
		playerId,
		io,
		gameManager,
		broadcaster,
		integrityService,
		spectatorRegistry,
		lineClearService,
		powerUpManager,
		activityLog,
	} = ctx;

	socket.on('tetromino_placed', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}

			const cooldown = getCooldownRemainingMs(
				player, 'lastTetrominoPlacementAt', PLAYER_SETTINGS.TETROMINO_PLACEMENT_COOLDOWN_MS
			);
			if (cooldown > 0) {
				if (callback) callback({ success: false, error: 'rate_limited', retryAfterMs: cooldown });
				return;
			}

			if (!data || (!data.tetromino && !data.type && !data.pieceType)) {
				socket.emit('tetrominoFailed', { message: 'Invalid tetromino data format' });
				if (callback) callback({ success: false, error: 'Invalid tetromino data format' });
				return;
			}

			const tetromino = data.tetromino || data;
			const pieceType = tetromino.pieceType || tetromino.type;
			if (!pieceType) {
				socket.emit('tetrominoFailed', { message: 'Missing tetromino type' });
				if (callback) callback({ success: false, error: 'Invalid tetromino data format' });
				return;
			}

			const world = World.getWorld();

			if (!gameManager.tetrominoManager.isValidTetrisPiece(pieceType)) {
				socket.emit('tetrominoFailed', { message: `Invalid tetromino type: ${pieceType}` });
				if (callback) callback({ success: false, error: 'Invalid tetromino type' });
				return;
			}

			tetromino.shape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, tetromino.rotation);

			const validation = gameManager.tetrominoManager.validateTetrominoPlacement(
				world, tetromino, tetromino.position.x, tetromino.position.z, 0, playerId
			);
			if (!validation.valid) {
				const reason = validation.reason || 'invalid_placement';
				// Log every dissolve / rejection reason — including
				// `not_adjacent`, which used to be silent. The user
				// reported "It says the rotated piece isn't connected
				// when it clearly is" and there was nothing in
				// Recent Activity to corroborate it.
				const loggableReasons = new Set([
					'no_path_to_king',
					'no_connection',
					'not_adjacent',
					'occupied',
					'invalid_placement',
				]);
				if (activityLog && loggableReasons.has(reason)) {
					try {
						activityLog.recordTetrominoDissolved({
							playerId,
							playerName: player.username || player.name || playerId,
							x: tetromino.position.x,
							z: tetromino.position.z,
							pieceType,
							reason,
						});
					} catch (logError) {
						console.warn('[Tetromino] activity log failed:', logError.message);
					}
				}
				socket.emit('tetrominoFailed', { message: validation.message || 'Invalid placement position', reason });
				if (callback) callback({ success: false, error: 'invalid_placement', reason, message: validation.message });
				return;
			}

			const placedCells = gameManager.tetrominoManager.placeTetromino(
				world, tetromino, tetromino.position.x, tetromino.position.z, playerId
			);

			// Claim any power-up orbs sitting on the cells we just
			// covered. The orb's piece spawns under the captor on the
			// same cell that the tetromino occupies, so the player
			// gets immediate value out of extending toward the orb.
			let powerUpClaims = [];
			if (powerUpManager && typeof powerUpManager.claimAcrossPlacement === 'function') {
				try {
					powerUpClaims = powerUpManager.claimAcrossPlacement(world, playerId, placedCells);
				} catch (claimErr) {
					console.warn('[Tetromino] power-up claim failed:', claimErr.message);
				}
			}

			// NOTE: We deliberately do NOT run the island integrity
			// pass here. The line-clear cascade (kicked off below)
			// can reconnect cells via gravity, so stripping
			// "disconnected" pieces now risks removing pieces that
			// would have been saved a moment later. Integrity runs
			// at the tail of the cascade instead — see
			// `LineClearService.runCascade`.

			world.lastAction = {
				type: 'tetromino_placed',
				playerId,
				data: { ...data },
				powerUpClaims: powerUpClaims.map(c => ({
					orbId: c.orb.id,
					pieceId: c.piece.id,
					pieceType: c.orb.pieceType,
					x: c.orb.x,
					z: c.orb.z,
				})),
			};
			player.lastTetrominoPlacementAt = Date.now();
			player.lastTetrominoPlacement = world.players?.[playerId]?.lastTetrominoPlacement
				|| { x: tetromino.position.x, z: tetromino.position.z };
			player.moveCount = (player.moveCount || 0) + 1;
			World.markDirty();

			// Acknowledge placement immediately so the player isn't kept
			// waiting on the cascade. The flash + actual clears stream in
			// asynchronously via the cells_clearing / row_cleared events
			// that LineClearService emits.
			if (callback) {
				callback({
					success: true,
					boardState: world.board,
					placedCells,
					powerUpClaims: powerUpClaims.map(c => ({
						orbId: c.orb.id,
						pieceId: c.piece.id,
						pieceType: c.orb.pieceType,
						x: c.orb.x,
						z: c.orb.z,
					})),
				});
			}

			if (activityLog) {
				try {
					activityLog.recordTetrominoPlaced({
						playerId,
						playerName: player.username || player.name || playerId,
						x: tetromino.position.x,
						z: tetromino.position.z,
						pieceType,
					});
				} catch (logError) {
					console.warn('[Tetromino] activity log failed:', logError.message);
				}
			}

			broadcaster.broadcastGameUpdate();

			lineClearService.runCascade({ world, playerId }).then((totals) => {
				const hasValidMoves = gameManager.chessManager.hasValidChessMoves(world, playerId);

				if (!hasValidMoves) {
					io.to(world.id).emit('no_valid_chess_moves', {
						playerId,
						message: 'No valid chess moves available',
					});

					const newTetromino = gameManager.tetrominoManager.generateTetrominos(world, playerId)[0];
					socket.emit('new_tetromino', {
						tetromino: newTetromino,
						message: 'Skipping chess phase - no valid moves',
					});
				}

				if (totals && (totals.rows.length > 0 || totals.cols.length > 0)) {
					// One last summary toast covering the whole cascade,
					// so callers that depend on the old single-shot
					// `row_cleared` semantics still see something. Per-
					// iteration toasts already fired from the service.
					socket.emit('cascade_complete', {
						rows: totals.rows,
						cols: totals.cols,
						iterations: totals.iterations,
					});
				}
			}).catch((error) => {
				console.error(`Error during line-clear cascade for ${playerId}:`, error);
			});

			spectatorRegistry.broadcastUpdate(playerId, world);
		} catch (error) {
			console.error('Error processing tetromino placement:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});

	// Accept both calling conventions: `(callback)` (no payload) and
	// `(data, callback)` (browser / bot style). The browser doesn't
	// currently use this event, but the external bot examples do.
	socket.on('request_tetromino', (...args) => {
		const callback = typeof args[args.length - 1] === 'function'
			? args[args.length - 1]
			: null;
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}

			const world = World.getWorld();
			const tetrominos = gameManager.tetrominoManager.generateTetrominos(world, playerId);
			if (!tetrominos || tetrominos.length === 0) {
				console.error(`Failed to generate tetrominos for player ${playerId}`);
				if (callback) callback({ success: false, error: 'Failed to generate tetrominos' });
				return;
			}

			const newTetromino = tetrominos[0];
			if (!world.currentTurns) world.currentTurns = {};
			if (!world.currentTurns[playerId]) {
				world.currentTurns[playerId] = {
					playerId,
					phase: 'tetris',
					startTime: Date.now(),
					minTime: 10000,
				};
			}
			world.currentTurns[playerId].activeTetromino = newTetromino;
			World.markDirty();

			socket.emit('turn_update', world.currentTurns[playerId]);
			if (callback) callback({ success: true, tetromino: newTetromino });
		} catch (error) {
			console.error(`Error generating tetromino for player ${playerId}:`, error);
			if (callback) callback({ success: false, error: `Server error: ${error.message}` });
		}
	});
}

module.exports = { registerTetrominoHandlers };
