/**
 * Line-clear orchestration.
 *
 * The bible's row-clear rules are now multi-stage and animated:
 *
 *   1.  After a tetromino placement, scan for clearable lines.
 *   2.  If any are found, **flash** the affected cells for
 *       `FLASH_DURATION_MS` so the player can see *what* is about
 *       to disappear before it disappears.
 *   3.  Apply the clear + gravity, broadcast the new world state,
 *       emit `row_cleared` for the toast.
 *   4.  Gravity may have created **new** clearable lines (a cascade).
 *       Loop back to step 2, capped by `MAX_CASCADE_ITERATIONS`.
 *
 * The cascade runs asynchronously after the tetromino socket handler
 * has already sent its placement-callback so the player isn't kept
 * waiting on the network round-trip. Other socket handlers continue
 * to run normally during the flash window (JavaScript is
 * single-threaded; only the `await sleep` yields).
 */

const World = require('../world/World');

const FLASH_DURATION_MS = 700;
const MAX_CASCADE_ITERATIONS = 16;

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function createLineClearService({ io, gameManager, broadcaster, integrityService, persistence, activityLog = null }) {
	if (!io) throw new Error('createLineClearService: io required');
	if (!gameManager) throw new Error('createLineClearService: gameManager required');
	if (!broadcaster) throw new Error('createLineClearService: broadcaster required');
	if (!integrityService) throw new Error('createLineClearService: integrityService required');
	if (!persistence) throw new Error('createLineClearService: persistence required');

	const boardManager = gameManager.boardManager;

	function recordRowsCleared(world, playerId, applied) {
		if (!activityLog) return;
		try {
			const player = world && world.players ? world.players[playerId] : null;
			activityLog.recordRowsCleared({
				playerId,
				playerName: (player && (player.username || player.name)) || playerId,
				rows: applied.rows || [],
				cols: applied.cols || [],
				cellCount: applied.totalCellsCleared || 0,
			});
		} catch (err) {
			console.warn('[LineClear] activity log failed:', err.message);
		}
	}

	/**
	 * Run a single, *synchronous* check-clear-cascade. Used by paths that
	 * cannot await (legacy tests, server-restore replay). Skips the flash
	 * animation entirely.
	 *
	 * @returns {{ rows: number[], cols: number[], iterations: number, settleOutcomes: Array }}
	 */
	function runImmediate(world, options = {}) {
		const triggeredBy = options.triggeredBy || null;
		const allRows = [];
		const allCols = [];
		const allSettleOutcomes = [];
		let iterations = 0;
		while (iterations < MAX_CASCADE_ITERATIONS) {
			const { rows, cols, rowRuns, colRuns } = boardManager.findClearableLines(world);
			if (rows.length === 0 && cols.length === 0) break;
			const applied = boardManager.applyClearedLines(world, rows, cols, { rowRuns, colRuns });
			if (applied.rows.length === 0 && applied.cols.length === 0) break;
			const settleOutcomes = boardManager.settleAirbornePieces(
				world,
				applied.airbornePieces || [],
				{ activityLog }
			);
			allRows.push(...applied.rows);
			allCols.push(...applied.cols);
			allSettleOutcomes.push(...settleOutcomes);
			if (triggeredBy) recordRowsCleared(world, triggeredBy, applied);
			iterations++;
		}
		return { rows: allRows, cols: allCols, iterations, settleOutcomes: allSettleOutcomes };
	}

	/**
	 * Async cascade with flash. The caller MUST be in a context that can
	 * `.catch` rejections (we don't block the calling socket on the cascade
	 * completing). Returns a Promise that resolves to the totals when the
	 * whole cascade is done.
	 *
	 * @param {{ world: Object, playerId: string, animate?: boolean }} opts
	 * @returns {Promise<{ rows: number[], cols: number[], iterations: number }>}
	 */
	async function runCascade({ world, playerId, animate = true }) {
		const allRows = [];
		const allCols = [];
		const allSettleOutcomes = [];
		const worldId = world && world.id ? world.id : World.getWorldId();
		let iterations = 0;

		while (iterations < MAX_CASCADE_ITERATIONS) {
			const { rows, cols, cells, rowRuns, colRuns } = boardManager.findClearableLines(world);
			if (rows.length === 0 && cols.length === 0) break;
			if (cells.length === 0) break;

			// Identify the chess pieces that are about to grow wings so
			// the client can flap them in sync with the flash.  This
			// uses the same cell list the server is about to strip and
			// only includes pieces actually on those squares.
			const airbornePieceIds = [];
			if (Array.isArray(world.chessPieces)) {
				const cellKeys = new Set(cells.map(c => `${c.x},${c.z}`));
				for (const piece of world.chessPieces) {
					if (!piece || !piece.position) continue;
					if (cellKeys.has(`${piece.position.x},${piece.position.z}`)) {
						airbornePieceIds.push(String(piece.id));
					}
				}
			}

			if (animate) {
				io.to(worldId).emit('cells_clearing', {
					playerId,
					rows,
					cols,
					cells,
					airbornePieceIds,
					durationMs: FLASH_DURATION_MS,
					iteration: iterations,
				});
				await sleep(FLASH_DURATION_MS);
			}

			const applied = boardManager.applyClearedLines(world, rows, cols, { rowRuns, colRuns });

			// Bail if the apply step (somehow) did nothing — this can
			// happen if another action modified the board during the
			// flash window, leaving no work for us. Prevents a tight
			// loop and bogus toast.
			if (applied.rows.length === 0 && applied.cols.length === 0) break;

			// Resolve airborne pieces: land safely, get knocked off, or
			// fall into the water depending on what's under them after
			// gravity moved cells back.
			const settleOutcomes = boardManager.settleAirbornePieces(
				world,
				applied.airbornePieces || [],
				{ activityLog }
			);
			allSettleOutcomes.push(...settleOutcomes);

			allRows.push(...applied.rows);
			allCols.push(...applied.cols);

			World.markDirty();
			persistence.markDirty();

			integrityService.runIslandIntegrityPass({ emitAnimation: true });

			broadcaster.broadcastGameUpdate();
			io.to(worldId).emit('row_cleared', {
				rows: applied.rows,
				cols: applied.cols,
				cellsCleared: applied.totalCellsCleared,
				airbornePieceIds,
				settleOutcomes,
				playerId,
				iteration: iterations,
			});

			// Record each cascade iteration as its own activity-log
			// row so the user can replay multi-step clears. Previously
			// this was completely silent — pieces would vanish through
			// gravity / orphaning during a cascade with no entry in the
			// activity panel, which is the user's chief complaint.
			recordRowsCleared(world, playerId, applied);

			iterations++;
		}

		if (iterations >= MAX_CASCADE_ITERATIONS) {
			console.warn(
				`[LineClear] Cascade hit hard cap (${MAX_CASCADE_ITERATIONS}) for ${playerId}; ` +
				`stopping to avoid infinite loop.`
			);
		}

		return { rows: allRows, cols: allCols, iterations, settleOutcomes: allSettleOutcomes };
	}

	return {
		runCascade,
		runImmediate,
		FLASH_DURATION_MS,
		MAX_CASCADE_ITERATIONS,
	};
}

module.exports = {
	createLineClearService,
	FLASH_DURATION_MS,
	MAX_CASCADE_ITERATIONS,
};
