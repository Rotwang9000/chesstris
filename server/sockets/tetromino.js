/**
 * `tetromino_placed` and `request_tetromino` socket handlers.
 */

const World = require('../world/World');
const { checkForDefender } = require('../king/pendingChecks');
const { PLAYER_SETTINGS } = require('../game/Constants');
const { getCooldownRemainingMs } = require('../utils/cooldowns');
const funnel = require('../observability/funnel');

function registerTetrominoHandlers(socket, ctx) {
	const {
		playerId: boundPlayerId,
		io,
		gameManager,
		broadcaster,
		integrityService,
		spectatorRegistry,
		lineClearService,
		powerUpManager,
		activityLog,
	} = ctx;
	// While in an active battle the socket acts as its SEAT id.
	const actingPlayerId = typeof ctx.resolveActingPlayerId === 'function'
		? ctx.resolveActingPlayerId
		: () => boundPlayerId;

	socket.on('tetromino_placed', (data, callback) => {
		const playerId = actingPlayerId();
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}

			// Eliminated players are out for good — no more building once
			// the king has fallen (mirrors the chess-move gate).
			if (player.eliminated) {
				const msg = 'You have been eliminated — your king is gone.';
				socket.emit('tetrominoFailed', { message: msg, reason: 'eliminated' });
				if (callback) callback({ success: false, error: msg, reason: 'eliminated' });
				return;
			}

			// Paused players are "away" and protected (see `pauseService`),
			// so they may not build until they resume — mirrors the same
			// gate on chess moves so pausing can't be used as an
			// invulnerability shield while still playing.
			if (player.paused) {
				const msg = 'You are paused — press Resume to play.';
				socket.emit('tetrominoFailed', { message: msg, reason: 'paused' });
				if (callback) callback({ success: false, error: msg, reason: 'paused' });
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

			// Cell keys are built as `${x + j},${z + i}`, so a string "0"
			// made "00,0": a second key for square (0,0) that slipped past
			// the occupied and safe-zone checks and overlaid enemy cells.
			const position = tetromino.position;
			if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.z)) {
				socket.emit('tetrominoFailed', { message: 'Invalid tetromino position' });
				if (callback) callback({ success: false, error: 'Invalid tetromino position' });
				return;
			}

			const world = World.getWorld();

			// No building while your king is in check. The defender's
			// only legal action during the grace window is a king-saving
			// chess move; placing tetrominoes would let them stall the
			// clock and ignore the threat. The client already pauses the
			// fall on `pendingCheck`, but enforce it server-side so an
			// old/modified client can't bypass it. (Chess-H3)
			if (world && checkForDefender(world, playerId)) {
				socket.emit('tetrominoFailed', {
					message: 'Your king is in check — resolve it before building.',
					reason: 'in_check',
				});
				if (callback) callback({ success: false, error: 'in_check' });
				return;
			}

			if (!gameManager.tetrominoManager.isValidTetrisPiece(pieceType)) {
				socket.emit('tetrominoFailed', { message: `Invalid tetromino type: ${pieceType}` });
				if (callback) callback({ success: false, error: 'Invalid tetromino type' });
				return;
			}

			// The server deals every piece (TetrominoManager.dealtPieces).
			// A client may place only the piece it was dealt, and only once;
			// it used to be free to send any shape, every time.
			const dealt = gameManager.tetrominoManager.dealtPieces(world, playerId);
			if (dealt && (dealt.placed || String(pieceType).toUpperCase() !== dealt.current)) {
				const pieces = gameManager.tetrominoManager.piecesView(world, playerId);
				const message = dealt.placed
					? 'That piece is already placed. Draw your next one.'
					: `Your current piece is ${dealt.current}.`;
				socket.emit('tetrominoFailed', { message, reason: 'wrong_piece', pieces });
				if (callback) callback({ success: false, error: 'wrong_piece', reason: 'wrong_piece', message, pieces });
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
				if (callback) {
					callback({
						success: false, error: 'invalid_placement', reason, message: validation.message,
						pieces: gameManager.tetrominoManager.piecesView(world, playerId),
					});
				}
				return;
			}

			const placedCells = gameManager.tetrominoManager.placeTetromino(
				world, tetromino, tetromino.position.x, tetromino.position.z, playerId
			);
			if (dealt) dealt.placed = true;

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

			// Only the validated fields — this rides along in every
			// game_update, so the raw client payload (which could carry
			// arbitrary padding) must never be stored.
			world.lastAction = {
				type: 'tetromino_placed',
				playerId,
				data: {
					pieceType,
					rotation: Number(tetromino.rotation) || 0,
					position: { x: tetromino.position.x, z: tetromino.position.z },
				},
				powerUpClaims: powerUpClaims.map(c => ({
					orbId: c.orb.id,
					pieceId: c.piece.id,
					pieceType: c.orb.pieceType,
					x: c.orb.x,
					z: c.orb.z,
				})),
			};
			// Funnel: first-ever successful placement for this player —
			// the strongest "actually played the game" signal we track.
			if (!player.lastTetrominoPlacementAt && !player.isComputer) {
				funnel.recordFirstPlacement();
			}
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
					pieces: gameManager.tetrominoManager.piecesView(world, playerId),
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

					const newTetromino = gameManager.tetrominoManager.freshTetromino(world, playerId);
					socket.emit('new_tetromino', {
						tetromino: newTetromino,
						pieces: gameManager.tetrominoManager.piecesView(world, playerId),
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
		const playerId = actingPlayerId();
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
			// The dealt piece, moving on only if the current one is placed.
			const newTetromino = gameManager.tetrominoManager.freshTetromino(world, playerId);
			if (!newTetromino) {
				console.error(`Failed to deal a tetromino for player ${playerId}`);
				if (callback) callback({ success: false, error: 'Failed to generate tetrominos' });
				return;
			}

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
			if (callback) {
				callback({
					success: true,
					tetromino: newTetromino,
					pieces: gameManager.tetrominoManager.piecesView(world, playerId),
				});
			}
		} catch (error) {
			console.error(`Error generating tetromino for player ${playerId}:`, error);
			if (callback) callback({ success: false, error: `Server error: ${error.message}` });
		}
	});

	// The client's current piece is gone (placed, dissolved or dropped in
	// the water) and it wants the next. `pieces` is always the server's
	// truth; a draw that comes too fast leaves the deal unchanged.
	socket.on('draw_piece', (...args) => {
		const playerId = actingPlayerId();
		const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
		try {
			const world = World.getWorld();
			if (!World.getPlayer(playerId)) {
				if (callback) callback({ success: false, error: 'Not registered' });
				return;
			}
			gameManager.tetrominoManager.drawPiece(world, playerId);
			if (callback) callback({ success: true, pieces: gameManager.tetrominoManager.piecesView(world, playerId) });
		} catch (error) {
			console.error(`Error drawing a piece for player ${playerId}:`, error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});

	// Read the deal without changing it (join, reconnect, battle seat).
	socket.on('get_pieces', (...args) => {
		const playerId = actingPlayerId();
		const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
		if (!callback) return;
		try {
			const pieces = gameManager.tetrominoManager.piecesView(World.getWorld(), playerId);
			callback(pieces ? { success: true, pieces } : { success: false, error: 'Not registered' });
		} catch (error) {
			console.error(`Error reading pieces for player ${playerId}:`, error);
			callback({ success: false, error: 'Server error' });
		}
	});
}

module.exports = { registerTetrominoHandlers };
