/**
 * IslandManager.js - Handles island detection and connectivity
 * An island is a group of connected cells belonging to a single player
 */

const { log } = require('./GameUtilities');
const cells = require('./cells');
const pieces = require('./pieces');

// ── Disconnected-island grace policy (bible §15.2) ──────────────────────────
//
// A disconnected island decays when **either** of two thresholds is hit:
//
//   1. **Move-based** — the owning player has taken this many tetromino
//      placements + chess moves *since the island became disconnected*
//      without bridging back. This is the primary trigger; an actively
//      playing opponent shouldn't be able to hoard stranded territory
//      indefinitely just by not running the clock out.
//
//   2. **Time-based backstop** — wall-clock seconds since the island
//      went disconnected. Catches AFK players whose move counter never
//      advances. Set well above the move threshold so an active player
//      practically never trips it before the move-based path fires.
//
// Piece-bearing islands (islands carrying a chess piece) use the higher
// `_PIECE_` thresholds because losing a piece is much more painful than
// losing terrain, and players have repeatedly reported feeling cheated
// when pieces evaporate while they're composing a chat message.
const DISCONNECTED_MOVE_LIMIT = 6;
const DISCONNECTED_PIECE_MOVE_LIMIT = 12;
const DISCONNECTED_TIME_LIMIT_MS   = 10 * 60 * 1000; // 10 minutes
const DISCONNECTED_PIECE_TIME_LIMIT_MS = 20 * 60 * 1000; // 20 minutes

class IslandManager {
	constructor() {
		// No properties needed for initialization
	}
	
	/**
	 * Check if there is a path from a cell to the player's king
	 * @param {Object} game - The game object
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startZ - Starting Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if there is a path
	 */
	hasPathToKing(game, startX, startZ, playerId) {
		try {
			// Validate sparse board
			if (!game || !game.board || !game.board.cells) {
				return false;
			}
			
			// Find the king for this player (supports both {position:{x,z}} and legacy {x,z})
			let kingX = null;
			let kingZ = null;
			
			if (Array.isArray(game.chessPieces)) {
				for (const piece of game.chessPieces) {
					if (!piece || piece.player !== playerId) continue;
					if (String(piece.type).toUpperCase() !== 'KING') continue;
					
					const pos = piece.position || piece;
					if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
						kingX = pos.x;
						kingZ = pos.z;
						break;
					}
				}
			}
			
			if (kingX === null || kingZ === null) {
				// King might not exist yet or might have been captured
				return false;
			}
			
			const pid = String(playerId);
			// Pre-compute the live chess-piece ID set so the BFS doesn't
			// trip over stale chess markers (which can lie around for a
			// pass or two before the integrity sweep collects them).
			const livePieceIds = new Set();
			if (Array.isArray(game.chessPieces)) {
				for (const p of game.chessPieces) {
					if (p && p.id != null) livePieceIds.add(String(p.id));
				}
			}
			const itemIsLiveOwned = (item) => {
				if (!item || String(item.player) !== pid) return false;
				if (item.type !== 'chess') return true;
				if (item.pieceId == null) return true;
				return livePieceIds.has(String(item.pieceId));
			};
			const isOwnedCell = (x, z) => {
				const cellContents = game.board.cells[`${x},${z}`];
				if (!cellContents) return false;
				if (Array.isArray(cellContents)) return cellContents.some(itemIsLiveOwned);
				return itemIsLiveOwned(cellContents);
			};
			
			// Starting cell must exist and be owned
			if (!isOwnedCell(startX, startZ)) {
				return false;
			}
			
			// Breadth-first search (BFS) to find a path to the king through owned cells
			const queue = [{ x: startX, z: startZ }];
			const visited = new Set([`${startX},${startZ}`]);
			
			while (queue.length > 0) {
				const { x, z } = queue.shift();
				
				if (x === kingX && z === kingZ) {
					return true;
				}
				
				// Orthogonal adjacency only (no diagonals) — diagonal links
			// are too easy to maintain and make island disconnection trivial.
			const adjacentCells = [
				{ x: x - 1, z },
				{ x: x + 1, z },
				{ x, z: z - 1 },
				{ x, z: z + 1 },
			];
				
				for (const cell of adjacentCells) {
					const key = `${cell.x},${cell.z}`;
					if (visited.has(key)) continue;
					
					if (isOwnedCell(cell.x, cell.z)) {
						visited.add(key);
						queue.push(cell);
					}
				}
			}
			
			return false;
		} catch (error) {
			log(`Error checking path to king: ${error.message}`);
			return false;
		}
	}
	
	/**
	 * Detect islands in the game board after a tetromino is placed
	 * @param {Object} game - The game object
	 * @returns {Array} Array of islands
	 */
	detectIslands(game) {
		if (!game || !game.board || !game.board.cells) return [];
		
		const visited = new Set();
		const islands = [];
		
		for (const key in game.board.cells) {
			const cellContents = game.board.cells[key];
			if (!cellContents || !Array.isArray(cellContents) || cellContents.length === 0) continue;
			
			// Find all player IDs that own content in this cell
			const playerIds = new Set();
			for (const item of cellContents) {
				if (item && item.player) playerIds.add(item.player);
			}
			
			for (const playerId of playerIds) {
				if (visited.has(`${key}:${playerId}`)) continue;
				
				const island = this._findConnectedCells(game, key, playerId, visited);
				
				if (island.cells.length > 0) {
					islands.push({
						playerId,
						cells: island.cells,
						hasKing: island.hasKing
					});
				}
			}
		}
		
		return islands;
	}
	
	/**
	 * Find all connected cells forming an island
	 * @param {Object} game - The game object
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startZ - Starting Z coordinate
	 * @param {string} playerId - The player's ID
	 * @param {Array} visited - 2D array tracking visited cells
	 * @returns {Object} Object containing cells in the island and whether it has a king
	 * @private
	 */
	_findConnectedCells(game, startKey, playerId, visited) {
		const [startX, startZ] = startKey.split(',').map(Number);
		const queue = [{ x: startX, z: startZ }];
		const cells = [];
		let hasKing = false;
		
		const visitKey = (x, z) => `${x},${z}:${playerId}`;
		visited.add(visitKey(startX, startZ));
		
		const isOwnedCell = (x, z) => {
			const cellContents = game.board.cells[`${x},${z}`];
			if (!cellContents || !Array.isArray(cellContents)) return false;
			return cellContents.some(item => item && String(item.player) === String(playerId));
		};
		
		const hasKingAt = (x, z) => {
			if (!Array.isArray(game.chessPieces)) return false;
			return game.chessPieces.some(piece => {
				if (!piece || String(piece.player) !== String(playerId)) return false;
				if (String(piece.type).toLowerCase() !== 'king') return false;
				const pos = piece.position || piece;
				return pos.x === x && pos.z === z;
			});
		};
		
		cells.push({ x: startX, z: startZ });
		if (hasKingAt(startX, startZ)) hasKing = true;
		
		while (queue.length > 0) {
			const { x, z } = queue.shift();
			
			const adjacentCells = [
				{ x: x - 1, z }, { x: x + 1, z },
				{ x, z: z - 1 }, { x, z: z + 1 },
			];
			
			for (const cell of adjacentCells) {
				const vk = visitKey(cell.x, cell.z);
				if (visited.has(vk)) continue;
				
				if (isOwnedCell(cell.x, cell.z)) {
					visited.add(vk);
					cells.push({ x: cell.x, z: cell.z });
					queue.push(cell);
					
					if (hasKingAt(cell.x, cell.z)) hasKing = true;
				}
			}
		}
		
		return { cells, hasKing };
	}
	
	/**
	 * Update islands after a tetromino is placed
	 * @param {Object} game - The game object
	 * @param {Array} placedCells - Array of placed cell coordinates
	 * @param {string} playerId - The player's ID
	 */
	updateIslandsAfterTetrominoPlacement(game, placedCells, playerId) {
		// Make sure every live king sits on a cell the BFS will visit
		// BEFORE detecting islands — otherwise a momentarily-empty king
		// cell makes the king look "off-island" and the player's whole
		// territory gets flagged as disconnected.
		this._ensureKingSupportCells(game);

		const islands = this.detectIslands(game);
		game.islands = islands;

		const playerIslands = islands.filter(island => island.playerId === playerId);
		const disconnectedIslands = playerIslands.filter(island => !island.hasKing);

		this._refreshDisconnectedTimestamps(game, islands);

		if (disconnectedIslands.length > 0) {
			log(`Player ${playerId} has ${disconnectedIslands.length} disconnected islands`);
			this._processDisconnectedIslands(game, disconnectedIslands);
		}
	}
	
	/**
	 * Return the per-island remaining grace info (without mutating anything).
	 * Used by the integrity service to broadcast at-risk warnings so the
	 * client UI can pulse / toast cells before they actually disappear.
	 *
	 * @param {Object} game
	 * @returns {Array<{playerId:string,cells:Array<{x:number,z:number}>,remainingMs:number,hasPiece:boolean,graceMs:number}>}
	 */
	getDisconnectedIslandRiskReport(game) {
		const islands = (game.islands || []).filter(i => !i.hasKing);
		if (islands.length === 0) return [];

		const now = Date.now();
		const report = [];
		for (const island of islands) {
			const { playerId, cells } = island;
			const pid = String(playerId);
			const meta = this._oldestIslandMeta(game.disconnectedSince || {}, pid, cells, now);
			const hasPiece = Array.isArray(game.chessPieces) && game.chessPieces.some(piece => {
				if (!piece || String(piece.player) !== pid) return false;
				const pos = piece.position || piece;
				if (!pos) return false;
				return cells.some(cell => cell.x === pos.x && cell.z === pos.z);
			});
			const timeLimitMs = hasPiece ? DISCONNECTED_PIECE_TIME_LIMIT_MS : DISCONNECTED_TIME_LIMIT_MS;
			const moveLimit = hasPiece ? DISCONNECTED_PIECE_MOVE_LIMIT : DISCONNECTED_MOVE_LIMIT;
			const player = game.players && game.players[pid];
			const currentMoves = (player && Number.isFinite(player.moveCount)) ? player.moveCount : 0;
			const movesSince = Math.max(0, currentMoves - meta.moveSnapshot);
			const remainingMs = Math.max(0, timeLimitMs - (now - meta.since));
			const remainingMoves = Math.max(0, moveLimit - movesSince);
			report.push({
				playerId,
				cells,
				remainingMs,
				remainingMoves,
				hasPiece,
				timeLimitMs,
				moveLimit,
			});
		}
		return report;
	}

	/**
	 * Process disconnected islands (islands without a king)
	 * @param {Object} game - The game object
	 * @param {Array} disconnectedIslands - Array of disconnected islands
	 * @private
	 */
	_processDisconnectedIslands(game, disconnectedIslands) {
		const isWithinHomeZone = (playerId, x, z) => {
			if (!game || !game.homeZones || !game.homeZones[playerId]) return false;
			const zone = game.homeZones[playerId];
			const width = zone.width || 8;
			const height = zone.height || 2;
			return (
				x >= zone.x &&
				x < zone.x + width &&
				z >= zone.z &&
				z < zone.z + height
			);
		};

		// A "safe" home zone is one that still has at least one owned chess piece.
		const safeHomeZonePlayers = new Set();
		if (game && game.homeZones && Array.isArray(game.chessPieces)) {
			for (const playerId of Object.keys(game.homeZones)) {
				const hasPieceInZone = game.chessPieces.some(piece => {
					if (!piece || String(piece.player) !== String(playerId)) return false;
					const pos = piece.position || piece;
					if (!pos) return false;
					return isWithinHomeZone(playerId, pos.x, pos.z);
				});

				if (hasPieceInZone) {
					safeHomeZonePlayers.add(String(playerId));
				}
			}
		}

		const isProtectedHomeCell = (playerId, x, z) => {
			const pid = String(playerId);
			if (!safeHomeZonePlayers.has(pid)) return false;
			return isWithinHomeZone(pid, x, z);
		};

		if (!game.disconnectedSince || typeof game.disconnectedSince !== 'object') {
			game.disconnectedSince = {};
		}
		const now = Date.now();

		const islandContainsPiece = (playerId, cells) => {
			if (!Array.isArray(game.chessPieces)) return false;
			return game.chessPieces.some(piece => {
				if (!piece || String(piece.player) !== String(playerId)) return false;
				const pos = piece.position || piece;
				if (!pos) return false;
				return cells.some(cell => cell.x === pos.x && cell.z === pos.z);
			});
		};

		for (const island of disconnectedIslands) {
			const { playerId, cells } = island;
			const pid = String(playerId);
			const hasPiece = islandContainsPiece(playerId, cells);

			const meta = this._oldestIslandMeta(game.disconnectedSince, pid, cells, now);
			const islandAge = now - meta.since;
			const player = game.players && game.players[pid];
			const currentMoves = (player && Number.isFinite(player.moveCount)) ? player.moveCount : 0;
			const movesSince = Math.max(0, currentMoves - meta.moveSnapshot);

			const moveLimit = hasPiece ? DISCONNECTED_PIECE_MOVE_LIMIT : DISCONNECTED_MOVE_LIMIT;
			const timeLimit = hasPiece ? DISCONNECTED_PIECE_TIME_LIMIT_MS : DISCONNECTED_TIME_LIMIT_MS;
			const decayReason =
				movesSince >= moveLimit ? 'moves'
					: islandAge >= timeLimit ? 'time'
						: null;

			if (!decayReason) {
				// Still in the grace window — leave the cells visible
				// (with a decay marker stamped by
				// `_refreshDisconnectedTimestamps`) so the player has a
				// chance to bridge.
				continue;
			}

			// Route every piece removal through the central helper so
			// the activity log always sees them — the user has
			// reported pieces "just vanishing" because this path
			// used to silently `splice` and only `console.log`.
			const removedPieces = pieces.removePiecesAtCells(
				game,
				playerId,
				cells,
				{
					reason: pieces.REMOVAL_REASONS.ISLAND_DECAY,
					activityLog: this.activityLog || null,
					kingLifeService: this.kingLifeService || null,
					protect: (_piece, pos) => isProtectedHomeCell(playerId, pos.x, pos.z),
				}
			);
			for (const piece of removedPieces) {
				const pos = piece.position || {};
				log(`Removed chess piece ${piece.type} at (${pos.x}, ${pos.z}) due to disconnected island`);
			}

			for (const cell of cells) {
				if (isProtectedHomeCell(playerId, cell.x, cell.z)) continue;

				const key = `${cell.x},${cell.z}`;
				const cellContents = game.board.cells[key];
				if (!cellContents) continue;

				const remaining = cellContents.filter(
					item => item && String(item.player) !== String(playerId)
				);

				if (remaining.length > 0) {
					game.board.cells[key] = remaining;
				} else {
					delete game.board.cells[key];
				}
				delete game.disconnectedSince[`${pid}:${cell.x},${cell.z}`];
				log(
					`Cleared player ${playerId} content at (${cell.x}, ${cell.z}) due to ` +
					`${decayReason}-based decay (moves=${movesSince}/${moveLimit}, ` +
					`age=${Math.round(islandAge / 1000)}s/${Math.round(timeLimit / 1000)}s, ` +
					`hasPiece=${hasPiece})`
				);
			}
		}
	}

	/**
	 * Find the earliest disconnect-meta among an island's cells. Returns
	 * `{ since, moveSnapshot }`. Each cell's entry in
	 * `game.disconnectedSince` is `{ since: epochMs, moveSnapshot: number }`
	 * (with legacy entries — a bare number — interpreted as `{ since,
	 * moveSnapshot: 0 }` so old saves continue to function).
	 *
	 * @param {Object} disconnectedSince
	 * @param {string} pid
	 * @param {Array<{x:number, z:number}>} cells
	 * @param {number} fallbackNow Used when the island has no record yet.
	 * @returns {{ since: number, moveSnapshot: number }}
	 * @private
	 */
	_oldestIslandMeta(disconnectedSince, pid, cells, fallbackNow) {
		let oldestSince = Infinity;
		let pairedSnapshot = 0;
		for (const cell of cells) {
			const entry = disconnectedSince[`${pid}:${cell.x},${cell.z}`];
			let since;
			let snapshot;
			if (entry && typeof entry === 'object') {
				since = entry.since;
				snapshot = Number.isFinite(entry.moveSnapshot) ? entry.moveSnapshot : 0;
			} else if (Number.isFinite(entry)) {
				since = entry;
				snapshot = 0;
			}
			if (Number.isFinite(since) && since < oldestSince) {
				oldestSince = since;
				pairedSnapshot = snapshot;
			}
		}
		if (!Number.isFinite(oldestSince)) {
			oldestSince = fallbackNow;
			pairedSnapshot = 0;
		}
		return { since: oldestSince, moveSnapshot: pairedSnapshot };
	}
	
	/**
	 * Ensure kings always sit on a valid board square.
	 * If a king's cell is missing or has no owned terrain support, create a
	 * minimal owned support cell under it.
	 * @param {Object} game - The game object
	 * @private
	 */
	_ensureKingSupportCells(game) {
		if (!game || !game.board || !game.board.cells || !Array.isArray(game.chessPieces)) return;

		for (const piece of game.chessPieces) {
			if (!piece || String(piece.type).toUpperCase() !== 'KING') continue;
			const playerId = piece.player;
			const pos = piece.position || piece;
			if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;

			const key = `${pos.x},${pos.z}`;
			const cellContents = Array.isArray(game.board.cells[key]) ? [...game.board.cells[key]] : [];

			const hasKingMarker = cellContents.some(
				item => item && item.type === cells.CHESS_TYPE && String(item.pieceId) === String(piece.id)
			);
			const hasOwnedSupport = cellContents.some(
				item => item && String(item.player) === String(playerId) && item.type !== cells.CHESS_TYPE
			);

			let changed = false;

			if (!hasOwnedSupport) {
				cellContents.push({
					type: cells.TETROMINO_TYPE,
					pieceType: 'king_anchor',
					player: playerId,
					placedAt: Date.now(),
					isKingAnchor: true,
				});
				changed = true;
			}

			if (!hasKingMarker) {
				cellContents.push({
					type: cells.CHESS_TYPE,
					player: playerId,
					pieceType: 'king',
					pieceId: piece.id,
				});
				changed = true;
			}

			if (changed) {
				game.board.cells[key] = cellContents;
				log(`Reinforced king support cell for ${playerId} at (${pos.x}, ${pos.z})`);
			}
		}
	}
	
	/**
	 * Check for islands after a row is cleared
	 * @param {Object} game - The game object
	 */
	checkForIslandsAfterRowClear(game) {
		// Refresh king support cells FIRST: a king sitting on a freshly
		// cleared / inherited cell with only its chess marker still
		// counts as "owned" via the chess marker's `player` field, but
		// callers (and snapshots loaded from disk) can leave the king's
		// row in an inconsistent state. Doing this up-front means the
		// BFS always treats the king's cell as reachable.
		this._ensureKingSupportCells(game);

		const islands = this.detectIslands(game);
		game.islands = islands;

		const playerIds = Object.keys(game.players);
		const allDisconnected = [];
		for (const playerId of playerIds) {
			const playerIslands = islands.filter(island => island.playerId === playerId);
			const disconnectedIslands = playerIslands.filter(island => !island.hasKing);
			if (disconnectedIslands.length === 0) continue;
			log(`Player ${playerId} has ${disconnectedIslands.length} disconnected islands after row clear`);
			allDisconnected.push(...disconnectedIslands);
		}

		this._refreshDisconnectedTimestamps(game, islands);

		if (allDisconnected.length > 0) {
			this._processDisconnectedIslands(game, allDisconnected);
		}
	}

	/**
	 * Keep `game.disconnectedSince` honest:
	 *  - Stamp new disconnected cells.
	 *  - Forget the stamp on cells that just rejoined a king-island
	 *    (or vanished from the board altogether).
	 *
	 * This must run on every detection pass, not just when there are
	 * still-disconnected islands; otherwise stale "decaying" indicators
	 * linger on cells the player has already bridged back to.
	 *
	 * @param {Object} game
	 * @param {Array} islands All islands detected this pass.
	 * @private
	 */
	_refreshDisconnectedTimestamps(game, islands) {
		if (!game.disconnectedSince || typeof game.disconnectedSince !== 'object') {
			game.disconnectedSince = {};
		}
		const now = Date.now();
		const stillDisconnected = new Map(); // key → playerId
		for (const island of islands) {
			if (island.hasKing) continue;
			const pid = String(island.playerId);
			for (const cell of island.cells) {
				stillDisconnected.set(`${pid}:${cell.x},${cell.z}`, pid);
			}
		}
		for (const key of Object.keys(game.disconnectedSince)) {
			if (!stillDisconnected.has(key)) {
				delete game.disconnectedSince[key];
			}
		}
		for (const [key, pid] of stillDisconnected) {
			const existing = game.disconnectedSince[key];
			if (existing && typeof existing === 'object' && Number.isFinite(existing.since)) {
				continue;
			}
			if (Number.isFinite(existing)) {
				const player = game.players && game.players[pid];
				const moveCount = (player && Number.isFinite(player.moveCount)) ? player.moveCount : 0;
				game.disconnectedSince[key] = { since: existing, moveSnapshot: moveCount };
				continue;
			}
			const player = game.players && game.players[pid];
			const moveCount = (player && Number.isFinite(player.moveCount)) ? player.moveCount : 0;
			game.disconnectedSince[key] = { since: now, moveSnapshot: moveCount };
		}
	}
}

IslandManager.DISCONNECTED_MOVE_LIMIT = DISCONNECTED_MOVE_LIMIT;
IslandManager.DISCONNECTED_PIECE_MOVE_LIMIT = DISCONNECTED_PIECE_MOVE_LIMIT;
IslandManager.DISCONNECTED_TIME_LIMIT_MS = DISCONNECTED_TIME_LIMIT_MS;
IslandManager.DISCONNECTED_PIECE_TIME_LIMIT_MS = DISCONNECTED_PIECE_TIME_LIMIT_MS;

module.exports = IslandManager;
