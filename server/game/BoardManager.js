/**
 * BoardManager.js - Handles board creation, expansion, and cell operations
 * This module contains functionality related to the game board
 */

const { BOARD_SETTINGS, GAME_RULES } = require('./Constants');
const { validateCoordinates, log } = require('./GameUtilities');
const cells = require('./cells');
const pieceLifecycle = require('./pieces');

class BoardManager {
	/**
	 * Create an empty board
	 * @returns {Object} The empty board structure with a sparse cell representation
	 */
	createEmptyBoard() {
		// Use a sparse structure with occupied cells - no predefined boundaries
		return {
			cells: {},  // Map of "x,z" coordinates to cell data
			// Track the actual boundaries based on cells that exist
			minX: Infinity,
			maxX: -Infinity,
			minZ: Infinity,
			maxZ: -Infinity
		};
	}
	
	/**
	 * Get a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {Array|null} The cell array or null if empty
	 */
	getCell(board, x, z) {
		const key = `${x},${z}`;
		// Return the array of objects in the cell, or null if empty
		return board.cells[key] || null;
	}
	
	/**
	 * Set a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Object|Array} cell - Cell data to set (object or array of objects)
	 */
	setCell(board, x, z, cell) {
		const key = `${x},${z}`;
		
		// Update board boundaries if necessary
		if (cell !== null) {
			if (x < board.minX) board.minX = x;
			if (x > board.maxX) board.maxX = x;
			if (z < board.minZ) board.minZ = z;
			if (z > board.maxZ) board.maxZ = z;
		}
		
		// Ensure we're setting an array of objects
		if (Array.isArray(cell)) {
			board.cells[key] = cell;
		} else if (cell === null) {
			// If explicitly setting to null, clear the cell
			delete board.cells[key];
			
			// Recalculate board boundaries after deletion
			this.recalculateBoardBoundaries(board);
		} else {
			// Convert single object to array
			board.cells[key] = [cell];
		}
	}
	
	/**
	 * Recalculate board boundaries based on existing cells
	 * @param {Object} board - The board object
	 */
	recalculateBoardBoundaries(board) {
		// Reset boundaries
		board.minX = Infinity;
		board.maxX = -Infinity;
		board.minZ = Infinity;
		board.maxZ = -Infinity;
		
		// Iterate through all cells to find boundaries
		for (const key in board.cells) {
			if (!board.cells[key] || board.cells[key].length === 0) continue;
			
			const [x, z] = key.split(',').map(Number);
			if (x < board.minX) board.minX = x;
			if (x > board.maxX) board.maxX = x;
			if (z < board.minZ) board.minZ = z;
			if (z > board.maxZ) board.maxZ = z;
		}
		
		// If no cells, set default boundaries
		if (board.minX === Infinity) {
			board.minX = 0;
			board.maxX = 0;
			board.minZ = 0;
			board.maxZ = 0;
		}
	}
	
	/**
	 * Add an object to a cell at specific coordinates
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Object} cellObject - Cell object to add
	 */
	addToCellContents(board, x, z, cellObject) {
		const key = `${x},${z}`;

		if (x < board.minX) board.minX = x;
		if (x > board.maxX) board.maxX = x;
		if (z < board.minZ) board.minZ = z;
		if (z > board.maxZ) board.maxZ = z;

		board.width = board.maxX - board.minX + 1;
		board.height = board.maxZ - board.minZ + 1;

		// Legacy save snapshots sometimes wrote single objects (not arrays)
		// for the centre marker cell. Make sure we always end up with an
		// array so the rest of the codebase can rely on `Array.isArray`.
		const existing = board.cells[key];
		if (!existing) {
			board.cells[key] = [cellObject];
			return;
		}
		if (Array.isArray(existing)) {
			existing.push(cellObject);
			return;
		}
		board.cells[key] = [existing, cellObject];
	}
	
	/**
	 * Remove an object from a cell based on a filter function
	 * @param {Object} board - The board object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {Function} filterFn - Function that returns true for items to keep
	 * @returns {Object|null} The removed object or null if none found
	 */
	removeFromCellContents(board, x, z, filterFn) {
		const key = `${x},${z}`;
		const cell = board.cells[key];
		
		if (!cell || !Array.isArray(cell) || cell.length === 0) {
			return null;
		}
		
		// Find the index of the first item that should be removed
		const indexToRemove = cell.findIndex(item => !filterFn(item));
		
		if (indexToRemove !== -1) {
			// Remove the item
			const removedItem = cell.splice(indexToRemove, 1)[0];
			
			// If the cell is now empty, remove it
			if (cell.length === 0) {
				delete board.cells[key];
			}
			
			return removedItem;
		}
		
		return null;
	}
	
	/**
	 * Get a 2D array representation of the board for a specific region
	 * This is useful for algorithms that expect a 2D array
	 * @param {Object} board - The board object
	 * @param {number} minX - Minimum X coordinate
	 * @param {number} maxX - Maximum X coordinate
	 * @param {number} minZ - Minimum Z coordinate
	 * @param {number} maxZ - Maximum Z coordinate
	 * @returns {Array} 2D array representation of the board region
	 */
	getBoardRegion(board, minX, maxX, minZ, maxZ) {
		const width = maxX - minX + 1;
		const height = maxZ - minZ + 1;
		
		const region = new Array(height);
		for (let z = 0; z < height; z++) {
			region[z] = new Array(width).fill(null);
			for (let x = 0; x < width; x++) {
				const realX = minX + x;
				const realZ = minZ + z;
				region[z][x] = this.getCell(board, realX, realZ);
			}
		}
		
		return region;
	}
	
	/**
	 * Expand the board boundaries (for visualization purposes)
	 * Note: With the sparse approach, the board automatically expands when cells are set
	 * This function is kept for compatibility
	 * @param {Object} game - The game object
	 * @param {number} addWidth - Additional width to add
	 * @param {number} addHeight - Additional height to add
	 * @param {Object} direction - Direction to expand: {left: number, right: number, top: number, bottom: number}
	 */
	expandBoard(game, addWidth, addHeight, direction = { left: 0, right: 0, top: 0, bottom: 0 }) {
		// With the sparse approach, we don't need to physically expand the board
		// Just update the boundaries for visualization
		const oldWidth = game.board.width;
		const oldHeight = game.board.height;
		
		// Calculate expansion in each direction
		const expandLeft = direction.left || Math.floor(addWidth / 2);
		const expandRight = direction.right || (addWidth - expandLeft);
		const expandTop = direction.top || Math.floor(addHeight / 2);
		const expandBottom = direction.bottom || (addHeight - expandTop);
		
		// Update the board boundaries
		game.board.minX -= expandLeft;
		game.board.maxX += expandRight;
		game.board.minZ -= expandTop;
		game.board.maxZ += expandBottom;
		
		// Update width and height
		game.board.width = game.board.maxX - game.board.minX + 1;
		game.board.height = game.board.maxZ - game.board.minZ + 1;
		
		log(`Expanded board from ${oldWidth}x${oldHeight} to ${game.board.width}x${game.board.height} (Left: ${expandLeft}, Right: ${expandRight}, Top: ${expandTop}, Bottom: ${expandBottom})`);
	}
	
	/**
	 * Check if a cell is in a safe home zone (home zone with at least one piece)
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if the cell is in a safe home zone
	 */
	isCellInSafeHomeZone(game, x, z) {
		if (!game || !game.homeZones) return false;

		// A home zone is only "safe" when it still backs at least one *live*
		// chess piece. We cross-reference against `game.chessPieces` rather
		// than trusting cell-level chess markers in isolation, because a
		// stale marker left behind by a partial clean-up would otherwise
		// keep the zone deceptively safe.
		const livePieceIds = new Set();
		if (Array.isArray(game.chessPieces)) {
			for (const piece of game.chessPieces) {
				if (piece && piece.id != null) livePieceIds.add(String(piece.id));
			}
		}
		const isLiveOwnedChessMarker = (item, playerId) => {
			if (!item || item.type !== 'chess') return false;
			if (String(item.player) !== String(playerId)) return false;
			if (item.pieceId == null) return true;
			return livePieceIds.has(String(item.pieceId));
		};

		for (const playerId in game.homeZones) {
			const homeZone = game.homeZones[playerId];
			if (!homeZone) continue;
			if (homeZone.isDegraded) continue;

			const homeX = homeZone.x;
			const homeZ = homeZone.z;
			const homeWidth = homeZone.width || 8;
			const homeHeight = homeZone.height || 2;

			const inBounds = x >= homeX && x < homeX + homeWidth
				&& z >= homeZ && z < homeZ + homeHeight;
			if (!inBounds) continue;

			const currentCellContents = this.getCell(game.board, x, z);
			const hasActiveHomeMarkerAtCell = Array.isArray(currentCellContents)
				&& currentCellContents.some(
					item => item && item.type === 'home' && String(item.player) === String(playerId)
				);
			if (!hasActiveHomeMarkerAtCell) continue;

			for (let hz = homeZ; hz < homeZ + homeHeight; hz++) {
				for (let hx = homeX; hx < homeX + homeWidth; hx++) {
					const cellContents = this.getCell(game.board, hx, hz);
					if (!Array.isArray(cellContents)) continue;
					for (const item of cellContents) {
						if (isLiveOwnedChessMarker(item, playerId)) return true;
					}
				}
			}
		}

		return false;
	}
	
	/**
	 * Check if a cell has another cell underneath it
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if there's a cell underneath
	 */
	hasCellUnderneath(game, x, z) {
		// Check if there's a cell at this position (any content means it's occupied)
		const cellContents = this.getCell(game.board, x, z);
		return cellContents !== null && Array.isArray(cellContents) && cellContents.length > 0;
	}
	
	/**
	 * Check if a cell has a specific type of content
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} type - The type to look for (e.g., 'tetromino', 'chess', 'home')
	 * @returns {boolean} True if the cell has the specified type
	 */
	hasCellType(game, x, z, type) {
		const cellContents = this.getCell(game.board, x, z);
		if (!cellContents) return false;
		
		return cellContents.some(item => item && item.type === type);
	}
	
	/**
	 * Find all cell contents of a specific type
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} type - The type to look for
	 * @returns {Array} Array of matching cell contents
	 */
	getCellContentsByType(game, x, z, type) {
		const cellContents = this.getCell(game.board, x, z);
		if (!cellContents) return [];
		
		return cellContents.filter(item => item && item.type === type);
	}
	
	/**
	 * Does the cell at (x, z) contain a home marker? Per the bible's
	 * "home cells count as empty space" rule, any cell with a home marker
	 * acts as a gap during line-scan and is never touched by a clear,
	 * **regardless of whether the home zone is currently 'safe'**. A
	 * degraded home zone — which no longer has home markers, only
	 * `home_converted` tetromino terrain — is *not* protected by this
	 * rule; those cells clear like any other tetromino.
	 *
	 * @param {Object} board
	 * @param {number} x
	 * @param {number} z
	 * @returns {boolean}
	 */
	cellHasHomeMarker(board, x, z) {
		return cells.hasHome(this.getCell(board, x, z));
	}

	/**
	 * Does the cell at (x, z) contain a live chess piece? Chess cells are
	 * preserved through row clears so the player has a grace window to
	 * bridge back if the surrounding terrain disappears (bible §15.2).
	 */
	cellHasChessMarker(board, x, z) {
		return cells.hasChess(this.getCell(board, x, z));
	}

	/**
	 * Will a row/column clear actually take anything off this cell?
	 * Used to decide which cells should pre-flash and which would be a
	 * no-op (so we don't broadcast a "Line cleared!" toast for a run
	 * whose entire content was home / chess / specialMarkers).
	 */
	wouldClearAffectCell(board, x, z) {
		// New rule (bible §15.2): chess cells *are* affected by line
		// clears — the piece is lifted off rather than the cell being
		// shielded. The animation layer needs to know about these
		// cells so it can flash them and grow wings on the resident
		// piece, hence the switch to `isLineClearTarget`.
		return cells.isLineClearTarget(this.getCell(board, x, z));
	}

	/**
	 * The owner of this cell for gravity / decay purposes. Returns null
	 * for empty, multi-owner, or home-only cells. See {@link cells.getOwner}.
	 */
	getCellOwner(board, x, z) {
		return cells.getOwner(this.getCell(board, x, z));
	}

	/**
	 * Strip everything a line-clear would remove from this cell, keeping
	 * home / chess / centre / special markers in place.
	 */
	stripClearableFromCell(board, x, z) {
		const key = `${x},${z}`;
		const current = board.cells[key];
		if (!Array.isArray(current) || current.length === 0) return 0;
		if (!cells.isClearable(current)) return 0;
		const preserved = cells.stripClearable(current);
		if (preserved.length === current.length) return 0;
		if (preserved.length > 0) {
			board.cells[key] = preserved;
		} else {
			delete board.cells[key];
		}
		return 1;
	}

	/**
	 * Pure detector — does NOT mutate the board. Walks both axes, returns
	 * the cleared row/col indices and the de-duplicated list of cells
	 * that would actually lose content. Use this when you want to
	 * pre-flash the affected cells before the destructive
	 * `applyClearedLines` step.
	 *
	 * @param {Object} game
	 * @returns {{ rows: number[], cols: number[], cells: Array<{x:number,z:number}> }}
	 */
	findClearableLines(game) {
		const rowMatches = this._findClearableLines(game, 'z');
		const colMatches = this._findClearableLines(game, 'x');

		const cellsMap = new Map();
		const collectRuns = (axis, fixed, runs) => {
			for (const run of runs) {
				for (let scan = run.start; scan <= run.end; scan++) {
					const [x, z] = axis === 'z' ? [scan, fixed] : [fixed, scan];
					if (!this.wouldClearAffectCell(game.board, x, z)) continue;
					const key = `${x},${z}`;
					if (!cellsMap.has(key)) cellsMap.set(key, { x, z });
				}
			}
		};
		for (const { index, runs } of rowMatches) collectRuns('z', index, runs);
		for (const { index, runs } of colMatches) collectRuns('x', index, runs);

		// A run is only worth announcing / clearing if it actually
		// modifies at least one cell. A run entirely composed of
		// chess-only cells (no terrain to strip) would survive the
		// `_cellHasClearableContent` test that classed it as a run
		// but contribute nothing to `cellsMap`.
		const rowRuns = new Map();
		for (const { index, runs } of rowMatches) {
			const kept = runs.filter(r => {
				for (let scan = r.start; scan <= r.end; scan++) {
					if (cellsMap.has(`${scan},${index}`)) return true;
				}
				return false;
			});
			if (kept.length > 0) rowRuns.set(index, kept);
		}
		const colRuns = new Map();
		for (const { index, runs } of colMatches) {
			const kept = runs.filter(r => {
				for (let scan = r.start; scan <= r.end; scan++) {
					if (cellsMap.has(`${index},${scan}`)) return true;
				}
				return false;
			});
			if (kept.length > 0) colRuns.set(index, kept);
		}

		return {
			rows: [...rowRuns.keys()],
			cols: [...colRuns.keys()],
			rowRuns,
			colRuns,
			cells: [...cellsMap.values()],
		};
	}

	/**
	 * Mutating step that pairs with `findClearableLines`. Clears the
	 * given rows / cols, applies gravity, and recalculates bounds.
	 *
	 * @param {Object} game
	 * @param {number[]} rows
	 * @param {number[]} cols
	 * @returns {{ rows: number[], cols: number[], totalCellsCleared: number }}
	 */
	applyClearedLines(game, rows, cols, options = {}) {
		const clearedRows = [];
		const clearedCols = [];
		let totalCellsCleared = 0;
		const airbornePieces = [];
		const rowRuns = options.rowRuns instanceof Map ? options.rowRuns : null;
		const colRuns = options.colRuns instanceof Map ? options.colRuns : null;

		for (const z of rows || []) {
			const n = this._clearLine(game, 'z', z, airbornePieces, rowRuns?.get(z) || null);
			if (n > 0) { clearedRows.push(z); totalCellsCleared += n; }
		}
		for (const x of cols || []) {
			const n = this._clearLine(game, 'x', x, airbornePieces, colRuns?.get(x) || null);
			if (n > 0) { clearedCols.push(x); totalCellsCleared += n; }
		}

		// Both axes shift together — moving a cell once with the
		// combined delta avoids overshoot when a clear happens on a row
		// AND a column the same tick.
		if (clearedRows.length > 0 || clearedCols.length > 0) {
			this._applyGravityTowardsKing(game, clearedRows, clearedCols);
			this.recalculateBoardBoundaries(game.board);
		}

		return {
			rows: clearedRows,
			cols: clearedCols,
			totalCellsCleared,
			airbornePieces,
		};
	}

	/**
	 * Scan the board for clearable lines along **both** axes and clear any
	 * that qualify. Returns a structured report so the caller can broadcast
	 * the right thing to clients.
	 *
	 * A line clears when it contains `GAME_RULES.REQUIRED_CELLS_FOR_ROW_CLEARING`
	 * consecutive filled, non-home cells. Safe home-zone cells break the
	 * count (cells on either side count separately).
	 *
	 * After all lines are removed, cells gravitate towards each owner's king
	 * along the axis of the cleared line.
	 *
	 * @param {Object} game
	 * @returns {{ rows: number[], cols: number[] }} Cleared z-rows and x-cols
	 */
	checkAndClearLines(game) {
		const { rows, cols, rowRuns, colRuns } = this.findClearableLines(game);
		const applied = this.applyClearedLines(game, rows, cols, { rowRuns, colRuns });
		// Resolve airborne pieces synchronously so legacy / test paths
		// that bypass `LineClearService` still see settled state at the
		// end of the call. Without this the cell-stripped pieces would
		// linger in `game.chessPieces` with no board marker, which the
		// integrity sweep would then misclassify as a no-supporting-cell
		// drop instead of an honest "fell into water".
		const settleOutcomes = this.settleAirbornePieces(
			game,
			applied.airbornePieces || [],
		);
		return { rows: applied.rows, cols: applied.cols, settleOutcomes };
	}

	/**
	 * Backwards-compatible wrapper that returns the cleared z-row indices,
	 * because most existing call sites only consider z-rows. New callers
	 * should prefer `checkAndClearLines` so they can react to both axes.
	 *
	 * @param {Object} game
	 * @returns {number[]} z-row indices that were cleared
	 */
	checkAndClearRows(game) {
		return this.checkAndClearLines(game).rows;
	}

	/**
	 * Find all indices along `axis` that have at least
	 * `REQUIRED_CELLS_FOR_ROW_CLEARING` consecutive filled non-home cells.
	 *
	 * @param {Object} game
	 * @param {'x'|'z'} axis  The fixed axis (i.e. 'z' = z-rows, scan along x)
	 * @returns {number[]} indices ready to be cleared
	 * @private
	 */
	_findClearableLines(game, axis) {
		const threshold = GAME_RULES.REQUIRED_CELLS_FOR_ROW_CLEARING;
		const matches = [];

		const fixedStart = axis === 'z' ? game.board.minZ : game.board.minX;
		const fixedEnd   = axis === 'z' ? game.board.maxZ : game.board.maxX;
		const scanStart  = axis === 'z' ? game.board.minX : game.board.minZ;
		const scanEnd    = axis === 'z' ? game.board.maxX : game.board.maxZ;

		for (let fixed = fixedStart; fixed <= fixedEnd; fixed++) {
			const runs = [];
			let consecutive = 0;
			let runStart = null;

			const closeRun = (lastScan) => {
				if (consecutive >= threshold && runStart !== null) {
					runs.push({ start: runStart, end: lastScan });
				}
				consecutive = 0;
				runStart = null;
			};

			for (let scan = scanStart; scan <= scanEnd; scan++) {
				const [x, z] = axis === 'z' ? [scan, fixed] : [fixed, scan];

				// Per the bible, home cells, degraded-home remnants, and
				// any cell owned by a paused player are treated as empty
				// space for clear purposes: they break the run AND bound
				// the cells that get cleared. This is why we now track
				// run RANGES (not just indices) — without it the engine
				// would clear cells on the far side of a home marker
				// when the run on the near side hit the threshold, and
				// players reported losing pieces "across the gap".
				if (this.cellHasHomeMarker(game.board, x, z)
					|| this._cellIsDegradedHomeOnly(game.board, x, z)
					|| this._cellIsOwnedByPausedPlayer(game, x, z)) {
					closeRun(scan - 1);
					continue;
				}

				if (this._cellHasClearableContent(game.board, x, z)) {
					if (consecutive === 0) runStart = scan;
					consecutive++;
				} else {
					closeRun(scan - 1);
				}
			}
			closeRun(scanEnd);

			if (runs.length > 0) {
				matches.push({ index: fixed, runs });
				log(
					`Found clearable ${axis}-line at ${axis}=${fixed}: ` +
					runs.map(r => `${r.start}-${r.end}`).join(', ') +
					` (threshold=${threshold})`
				);
			}
		}

		return matches;
	}

	/**
	 * A cell counts as "filled" for line-clearing purposes only when it has
	 * content that the clear would actually remove. Bare home markers (in
	 * degraded / unsafe home zones), board-centre markers, and other special
	 * markers don't count, because preserving them through `_clearLine`
	 * would leave the cell visibly unchanged. Without this filter the server
	 * would emit "Line cleared!" toasts for runs that have no clearable
	 * content, which players reported as confusing phantom clears.
	 *
	 * @param {Object} board
	 * @param {number} x
	 * @param {number} z
	 * @returns {boolean}
	 * @private
	 */
	_cellHasClearableContent(board, x, z) {
		const cellContents = this.getCell(board, x, z);
		if (!Array.isArray(cellContents) || cellContents.length === 0) return false;
		// For *line scanning* a chess-occupied cell still counts as
		// "filled" — the piece itself sits on something a tetromino put
		// there. We only strip the tetromino content during the
		// destructive step (`_clearLine`), and only after the integrity
		// pass has had a chance to mark stranded chess cells for decay.
		return cellContents.some(item => {
			if (!item) return false;
			if (item.fromHomeZone === true) return false;
			return !(item.type === cells.HOME_TYPE
				|| item.type === cells.SPECIAL_TYPE
				|| item.type === cells.CENTRE_TYPE);
		});
	}

	/**
	 * Does the cell at (x, z) hold *only* a degraded-home remnant —
	 * the leftover terrain produced when an idle home zone loses its
	 * `home` marker? Used by the line-clear scan to treat such cells
	 * as gaps so returning players aren't wiped by a single placement.
	 */
	_cellIsDegradedHomeOnly(board, x, z) {
		return cells.onlyDegradedOrMarkers(this.getCell(board, x, z));
	}

	/**
	 * Cells whose owner is currently paused (see `pauseService`) are
	 * inert for the duration of the pause — the line-clear scan
	 * treats them as gaps so an opponent can't wipe a paused player
	 * out before they resume.
	 */
	_cellIsOwnedByPausedPlayer(game, x, z) {
		const owner = cells.getOwner(this.getCell(game.board, x, z));
		if (!owner || !game || !game.players) return false;
		const player = game.players[owner];
		return !!(player && player.paused === true);
	}

	/**
	 * Strip removable terrain from every cell along the given line and
	 * lift any chess pieces off cleared cells.
	 *
	 * Per the bible's revised §15.2 (the "wings" rule):
	 *   • Safe home-zone cells: untouched (home overlay still anchors
	 *     whatever sits on it).
	 *   • Cells with a chess marker but no home: chess marker stripped
	 *     so the piece becomes "airborne". The piece's lifecycle entry
	 *     stays put on `game.chessPieces`; it will be re-anchored,
	 *     bumped, or removed by `_settleAirbornePieces` after gravity.
	 *   • Otherwise: strip everything except home / specialMarker /
	 *     boardCentre items.
	 *
	 * @param {Object} game
	 * @param {'x'|'z'} axis
	 * @param {number} index
	 * @param {Array} [airbornePieces]  Out-parameter; pushes a
	 *   `{ pieceId, x, z, player }` record for each chess marker
	 *   stripped, so the caller can settle them after gravity.
	 * @returns {number} number of cells actually modified
	 * @private
	 */
	_clearLine(game, axis, index, airbornePieces, runs = null) {
		const start = axis === 'z' ? game.board.minX : game.board.minZ;
		const end   = axis === 'z' ? game.board.maxX : game.board.maxZ;

		let modified = 0;
		const inAnyRun = (scan) => {
			if (!runs) return true;
			for (const r of runs) if (scan >= r.start && scan <= r.end) return true;
			return false;
		};

		for (let scan = start; scan <= end; scan++) {
			// Bound the clear to the qualifying run(s). A home /
			// degraded-home / paused cell that broke the run during
			// the scan therefore also bounds the destruction here —
			// cells on the far side of the gap are left alone.
			if (!inAnyRun(scan)) continue;

			const [x, z] = axis === 'z' ? [scan, index] : [index, scan];
			const key = `${x},${z}`;
			const cellContents = game.board.cells[key];
			if (!Array.isArray(cellContents) || cellContents.length === 0) continue;

			// Home cells are still gaps — the home overlay protects
			// everything sat on it, including any king sitting there.
			if (cells.hasHome(cellContents)) continue;
			if (!cells.isLineClearTarget(cellContents)) continue;

			const { preserved, lifted } = cells.stripForLineClear(cellContents);
			if (preserved.length === cellContents.length && !lifted) continue;

			modified++;

			if (lifted && Array.isArray(airbornePieces)) {
				const pieceId = lifted.pieceId != null
					? lifted.pieceId
					: (lifted.chessPiece && lifted.chessPiece.id != null
						? lifted.chessPiece.id
						: null);
				if (pieceId != null) {
					airbornePieces.push({
						pieceId: String(pieceId),
						x,
						z,
						player: lifted.player != null ? String(lifted.player) : null,
					});
				}
			}

			if (preserved.length > 0) {
				game.board.cells[key] = preserved;
			} else {
				delete game.board.cells[key];
			}
		}

		if (modified > 0) {
			log(`Cleared ${axis}-line at ${axis}=${index} (${modified} cell${modified === 1 ? '' : 's'} modified)`);
		}

		return modified;
	}

	/**
	 * Resolve the fate of each airborne piece after gravity has
	 * shifted cells around. The rules (per user spec):
	 *
	 *   • If no cell exists at the piece's `(x, z)` → piece falls
	 *     into the water (removed, reason `fell_to_water`).
	 *   • If a cell exists and is empty of other chess pieces →
	 *     piece lands safely; we re-add its chess marker.
	 *   • If a cell exists with another chess piece on it → the
	 *     landing piece bumps the existing one off (existing piece
	 *     removed with reason `knocked_off`); the new piece lands.
	 *
	 * Returns an outcomes array so the caller can stream the result
	 * to the client for the wing-and-land animation, in the form:
	 *   `{ pieceId, x, z, outcome: 'landed' | 'fell' | 'bumped',
	 *      bumpedPieceId?: string }`.
	 *
	 * @param {Object} game
	 * @param {Array} airbornePieces  `{ pieceId, x, z, player }` list
	 *   produced by `_clearLine`.
	 * @param {Object} [options]
	 * @param {Object} [options.activityLog]  Optional activity log to
	 *   record fall/bump events against.
	 * @returns {Array<Object>}  Outcomes (see above).
	 */
	settleAirbornePieces(game, airbornePieces, options = {}) {
		const outcomes = [];
		if (!Array.isArray(airbornePieces) || airbornePieces.length === 0) return outcomes;
		if (!game || !Array.isArray(game.chessPieces)) return outcomes;

		const { activityLog = null } = options;

		for (const airborne of airbornePieces) {
			const piece = game.chessPieces.find(
				p => p && String(p.id) === String(airborne.pieceId)
			);
			if (!piece) {
				// Piece was already removed by some other system
				// (rare, but possible during heavy cascades).
				outcomes.push({
					pieceId: airborne.pieceId,
					x: airborne.x,
					z: airborne.z,
					outcome: 'gone',
				});
				continue;
			}

			// The piece's position is the canonical destination; gravity
			// never moves a piece on a cleared line (it's airborne) so
			// this should still be `airborne.{x,z}` — guard anyway.
			const targetX = Number.isFinite(piece.position?.x) ? piece.position.x : airborne.x;
			const targetZ = Number.isFinite(piece.position?.z) ? piece.position.z : airborne.z;
			const key = `${targetX},${targetZ}`;
			const cellContents = game.board.cells[key];

			if (!Array.isArray(cellContents) || cellContents.length === 0) {
				// No cell beneath — fall into the water.  Kings get a
				// chance to spend a life and respawn at home first.
				pieceLifecycle.removePiece(game, piece, {
					reason: pieceLifecycle.REMOVAL_REASONS.FELL_TO_WATER,
					activityLog,
					kingLifeService: this.kingLifeService || null,
				});
				outcomes.push({
					pieceId: airborne.pieceId,
					x: targetX,
					z: targetZ,
					outcome: 'fell',
				});
				continue;
			}

			// Look for an existing chess marker that ISN'T us. If
			// found, that piece is knocked off.
			const blockerMarker = cellContents.find(item =>
				item && item.type === cells.CHESS_TYPE
				&& String(item.pieceId || item?.chessPiece?.id || '') !== String(piece.id)
			);

			let bumpedPieceId = null;
			if (blockerMarker) {
				const blockerId = blockerMarker.pieceId != null
					? String(blockerMarker.pieceId)
					: (blockerMarker.chessPiece && blockerMarker.chessPiece.id != null
						? String(blockerMarker.chessPiece.id)
						: null);
				if (blockerId) {
					const blockerPiece = game.chessPieces.find(
						p => p && String(p.id) === blockerId
					);
					if (blockerPiece) {
						pieceLifecycle.removePiece(game, blockerPiece, {
							reason: pieceLifecycle.REMOVAL_REASONS.KNOCKED_OFF,
							activityLog,
							kingLifeService: this.kingLifeService || null,
							note: `knocked off by ${piece.id}`,
						});
						bumpedPieceId = blockerId;
					}
				}
			}

			// Re-add (or refresh) our chess marker on the cell. Strip
			// any stale marker for our own id first so we end up with
			// at most one chess entry.
			pieceLifecycle.relocatePiece(game, piece, { x: targetX, z: targetZ });

			outcomes.push({
				pieceId: airborne.pieceId,
				x: targetX,
				z: targetZ,
				outcome: 'landed',
				...(bumpedPieceId ? { bumpedPieceId } : {}),
			});
		}

		return outcomes;
	}

	/**
	 * Tetris-style gravity: every cell that the engine considers part of
	 * a *single* player's territory drifts one step closer to that
	 * player's king for each cleared line that sat between them.
	 *
	 * Bible rules in force here (§8):
	 *   • Only **single-owner** cells move. A cell with mixed owners
	 *     (multiple players' tetromino content) stays put — the engine
	 *     refuses to guess which way it should go.
	 *   • A cell carrying a **chess piece** only moves if it's either
	 *     directly adjacent to a cleared line OR linked to one by an
	 *     unbroken 4-connected chain of single-owner cells of the same
	 *     player. Pieces stranded by mixed-owner gaps or floating
	 *     beyond a broken chain stay where they are.
	 *   • Bare home cells don't move — the home overlay is anchored
	 *     to its spawn coordinates.
	 *   • Both axes shift simultaneously so a corner clear (one row
	 *     **and** one column at the same tick) doesn't double-process
	 *     a cell.
	 *
	 * @param {Object} game
	 * @param {number[]} clearedRows  z-row indices that were cleared.
	 * @param {number[]} clearedCols  x-col indices that were cleared.
	 * @private
	 */
	_applyGravityTowardsKing(game, clearedRows, clearedCols) {
		const rowSet = new Set(clearedRows || []);
		const colSet = new Set(clearedCols || []);
		const playerKing = this._collectPlayerKingCoords(game);

		const computeShift = (kingCoord, here, clearedIndices) => {
			if (kingCoord === undefined || kingCoord === here) return 0;
			if (kingCoord < here) {
				let shift = 0;
				for (const ci of clearedIndices) {
					if (ci > kingCoord && ci < here) shift++;
				}
				return -shift;
			}
			let shift = 0;
			for (const ci of clearedIndices) {
				if (ci < kingCoord && ci > here) shift++;
			}
			return shift;
		};

		// Build the per-player view of movable cells (single-owner) so
		// the connectivity BFS below has the right substrate. Chess
		// cells get a separate set: they need the connectivity check.
		const moveableSoleByPlayer = new Map();
		const moveableChessByPlayer = new Map();
		for (const [key, contents] of Object.entries(game.board.cells)) {
			if (!Array.isArray(contents) || contents.length === 0) continue;
			const anchor = cells.gravityAnchor(contents);
			if (!anchor.movable) continue;
			if (cells.hasChess(contents)) {
				const set = moveableChessByPlayer.get(anchor.owner) || new Set();
				set.add(key);
				moveableChessByPlayer.set(anchor.owner, set);
			} else {
				const set = moveableSoleByPlayer.get(anchor.owner) || new Set();
				set.add(key);
				moveableSoleByPlayer.set(anchor.owner, set);
			}
		}

		// Bible §8 / §15.2 — a cell carrying a chess piece only travels
		// with gravity when it is **directly adjacent** to a cleared
		// line or **linked** to one through an unbroken 4-connected
		// chain of single-owner cells of the same player. The BFS
		// expands only through the player's sole-ownership cells and
		// stops at chess cells (marking them but not propagating
		// through them — the link itself has to be made of terrain).
		const eligibleChess = new Set();
		for (const [playerId, chessSet] of moveableChessByPlayer) {
			const soleSet = moveableSoleByPlayer.get(playerId) || new Set();

			const queue = [];
			const visited = new Set();
			const seed = (key) => {
				if (visited.has(key)) return;
				visited.add(key);
				queue.push(key);
			};

			// Seed: every sole or chess cell of this player whose
			// orthogonal neighbour was on a cleared line. The cleared
			// line's coordinates themselves are virtual sources — the
			// cell at z=N+1 is "directly next to" the clear at z=N.
			for (const key of [...soleSet, ...chessSet]) {
				const [x, z] = key.split(',').map(Number);
				if (rowSet.has(z - 1) || rowSet.has(z + 1)
					|| colSet.has(x - 1) || colSet.has(x + 1)) {
					seed(key);
				}
			}

			while (queue.length > 0) {
				const key = queue.shift();
				if (chessSet.has(key)) {
					eligibleChess.add(key);
					// Chess cells are sinks — the linking chain must be
					// made of single-owner cells, so don't propagate
					// through chess.
					continue;
				}
				const [x, z] = key.split(',').map(Number);
				for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
					const nkey = `${nx},${nz}`;
					if (visited.has(nkey)) continue;
					if (soleSet.has(nkey) || chessSet.has(nkey)) {
						seed(nkey);
					}
				}
			}
		}

		const moves = [];

		for (const [key, contents] of Object.entries(game.board.cells)) {
			if (!Array.isArray(contents) || contents.length === 0) continue;
			const [xStr, zStr] = key.split(',');
			const x = Number(xStr);
			const z = Number(zStr);

			// Cells that sat *on* a cleared line have either gone away
			// or been preserved (home / chess). Either way, leave them.
			if (rowSet.has(z) || colSet.has(x)) continue;

			const anchor = cells.gravityAnchor(contents);
			if (!anchor.movable) continue;
			const king = playerKing[anchor.owner];
			if (!king) continue;

			// Chess cell stranded from the cleared line → don't move.
			if (cells.hasChess(contents) && !eligibleChess.has(key)) continue;

			const dx = computeShift(king.x, x, clearedCols);
			const dz = computeShift(king.z, z, clearedRows);
			if (dx === 0 && dz === 0) continue;

			moves.push({ x, z, dx, dz, contents, owner: anchor.owner });
		}

		// Process moves in dependency order so a cell never lands on top
		// of another not-yet-moved cell. For each axis the rule is:
		// move cells trailing the train first, so the spot in front
		// clears before they slide forward. With combined moves we sort
		// by "distance left to travel" so further-from-king cells move
		// last (they have furthest to go and shouldn't overtake closer
		// cells).
		moves.sort((a, b) => {
			const aKey = Math.abs(a.dx) + Math.abs(a.dz);
			const bKey = Math.abs(b.dx) + Math.abs(b.dz);
			return aKey - bKey;
		});

		for (const cell of moves) {
			const oldKey = `${cell.x},${cell.z}`;
			const newX = cell.x + cell.dx;
			const newZ = cell.z + cell.dz;
			const newKey = `${newX},${newZ}`;

			const occupant = game.board.cells[newKey];
			if (Array.isArray(occupant) && occupant.length > 0) {
				// Collision: leave this cell where it is rather than
				// destroy or merge. The integrity sweep will catch any
				// resulting island.
				continue;
			}

			game.board.cells[newKey] = cell.contents;
			delete game.board.cells[oldKey];

			for (const item of cell.contents) {
				if (!item) continue;
				if (item.position) {
					item.position.x = newX;
					item.position.z = newZ;
				}
				if (item.x !== undefined) item.x = newX;
				if (item.z !== undefined) item.z = newZ;
			}
		}

		// Mirror the shift on the top-level chessPieces array so
		// positions stay in lock-step with the board (the cell-array
		// chess marker is moved above, but the canonical piece record
		// lives on `game.chessPieces`). Only pieces whose cell was
		// eligible per the connectivity check above get to ride along
		// — pieces stranded by mixed-owner gaps or broken chains stay
		// where they are.
		if (Array.isArray(game.chessPieces)) {
			for (const piece of game.chessPieces) {
				if (!piece || !piece.position) continue;
				if (rowSet.has(piece.position.z) || colSet.has(piece.position.x)) continue;
				const pieceKey = `${piece.position.x},${piece.position.z}`;
				if (!eligibleChess.has(pieceKey)) continue;
				const king = playerKing[piece.player];
				if (!king) continue;
				const dx = computeShift(king.x, piece.position.x, clearedCols);
				const dz = computeShift(king.z, piece.position.z, clearedRows);
				if (dx) piece.position.x += dx;
				if (dz) piece.position.z += dz;
			}
		}

		if (moves.length > 0) {
			log(
				`Applied gravity: ${moves.length} cell${moves.length === 1 ? '' : 's'} ` +
				`moved towards kings (rows=[${clearedRows.join(',')}] cols=[${clearedCols.join(',')}])`
			);
		}
	}

	/**
	 * Map each player ID to `{ x, z }` of their king. Driven from
	 * `game.chessPieces` (the canonical record) with a board-cell
	 * fallback for engines that haven't fully populated `chessPieces`.
	 * @private
	 */
	_collectPlayerKingCoords(game) {
		const out = {};
		if (Array.isArray(game.chessPieces)) {
			for (const piece of game.chessPieces) {
				if (!piece) continue;
				if (String(piece.type || '').toUpperCase() !== 'KING') continue;
				const pos = piece.position;
				if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
				out[piece.player] = { x: pos.x, z: pos.z };
			}
		}
		if (Object.keys(out).length === 0) {
			for (const [key, contents] of Object.entries(game.board.cells)) {
				if (!Array.isArray(contents)) continue;
				for (const item of contents) {
					if (!item || item.type !== cells.CHESS_TYPE) continue;
					if (String(item.pieceType || '').toLowerCase() !== 'king') continue;
					const [xStr, zStr] = key.split(',');
					out[item.player] = { x: Number(xStr), z: Number(zStr) };
				}
			}
		}
		return out;
	}
}

module.exports = BoardManager; 