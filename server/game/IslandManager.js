/**
 * IslandManager.js - Handles island detection and connectivity
 * An island is a group of connected cells belonging to a single player
 */

const { log } = require('./GameUtilities');

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
			const isOwnedCell = (x, z) => {
				const cellContents = game.board.cells[`${x},${z}`];
				if (!cellContents) return false;

				if (Array.isArray(cellContents)) {
					return cellContents.some(item => item && String(item.player) === pid);
				}

				return !!(cellContents.player && String(cellContents.player) === pid);
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
		// Detect islands after tetromino placement
		const islands = this.detectIslands(game);
		
		// Store islands in the game state
		game.islands = islands;
		
		// Check for disconnected islands (islands without a king)
		const playerIslands = islands.filter(island => island.playerId === playerId);
		const disconnectedIslands = playerIslands.filter(island => !island.hasKing);
		
		if (disconnectedIslands.length > 0) {
			log(`Player ${playerId} has ${disconnectedIslands.length} disconnected islands`);
			
			// Handle disconnected islands
			this._processDisconnectedIslands(game, disconnectedIslands);
		}
		
		// Guarantee each live king remains on a valid board cell.
		this._ensureKingSupportCells(game);
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
		
		for (const island of disconnectedIslands) {
			const { playerId, cells } = island;
			
			// Remove chess pieces from disconnected islands
			if (Array.isArray(game.chessPieces)) {
				for (let i = game.chessPieces.length - 1; i >= 0; i--) {
					const piece = game.chessPieces[i];
					if (!piece || String(piece.player) !== String(playerId)) continue;
					const pos = piece.position || piece;
					const isOnIsland = cells.some(cell => cell.x === pos.x && cell.z === pos.z);
					if (isOnIsland && !isProtectedHomeCell(playerId, pos.x, pos.z)) {
						game.chessPieces.splice(i, 1);
						log(`Removed chess piece ${piece.type} at (${pos.x}, ${pos.z}) due to disconnected island`);
					}
				}
			}
			
			// Clear cells on disconnected islands using sparse board
			for (const cell of cells) {
				if (isProtectedHomeCell(playerId, cell.x, cell.z)) continue;
				
				const key = `${cell.x},${cell.z}`;
				const cellContents = game.board.cells[key];
				if (!cellContents) continue;
				
				// Remove only this player's content, keep others
				const remaining = cellContents.filter(
					item => item && String(item.player) !== String(playerId)
				);
				
				if (remaining.length > 0) {
					game.board.cells[key] = remaining;
				} else {
					delete game.board.cells[key];
				}
				log(`Cleared player ${playerId} content at (${cell.x}, ${cell.z}) due to disconnected island`);
			}
		}
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
				item => item && item.type === 'chess' && String(item.pieceId) === String(piece.id)
			);
			const hasOwnedSupport = cellContents.some(
				item => item && String(item.player) === String(playerId) && item.type !== 'chess'
			);
			
			let changed = false;
			
			if (!hasOwnedSupport) {
				cellContents.push({
					type: 'tetromino',
					pieceType: 'king_anchor',
					player: playerId,
					placedAt: Date.now(),
					isKingAnchor: true,
				});
				changed = true;
			}
			
			if (!hasKingMarker) {
				cellContents.push({
					type: 'chess',
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
		// Detect islands after row clear
		const islands = this.detectIslands(game);
		
		// Store islands in the game state
		game.islands = islands;
		
		// Check for disconnected islands (islands without a king) for each player
		const playerIds = Object.keys(game.players);
		
		for (const playerId of playerIds) {
			const playerIslands = islands.filter(island => island.playerId === playerId);
			const disconnectedIslands = playerIslands.filter(island => !island.hasKing);
			
			if (disconnectedIslands.length > 0) {
				log(`Player ${playerId} has ${disconnectedIslands.length} disconnected islands after row clear`);
				
				// Handle disconnected islands
				this._processDisconnectedIslands(game, disconnectedIslands);
			}
		}
		
		this._ensureKingSupportCells(game);
	}
}

module.exports = IslandManager; 