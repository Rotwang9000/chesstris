/**
 * Game State Module
 * 
 * Manages the core game state, including board state, piece positions,
 * player information, and gameplay status.
 */

import { v4 as uuidv4 } from 'uuid';
import * as Constants from './constants.js';

// Game state singleton
let gameState = {
	board: {},
	fallingPiece: null,
	players: {},
	currentPlayerId: null,
	selectedPiece: null,
	validMoves: [],
	gameStatus: 'waiting', // 'waiting', 'playing', 'paused', 'gameOver'
	difficulty: 'normal',
	cooldowns: new Map(),
	lastUpdate: Date.now()
};

/**
 * Get the current game state
 * @returns {Object} The current game state
 */
export function getGameState() {
	return gameState;
}

/**
 * Reset the game state to initial values
 */
export function resetGameState() {
	gameState = {
		board: {},
		fallingPiece: null,
		players: {},
		currentPlayerId: null,
		selectedPiece: null,
		validMoves: [],
		gameStatus: 'waiting',
		difficulty: 'normal',
		cooldowns: new Map(),
		lastUpdate: Date.now()
	};
}

/**
 * Update the game state with new values
 * @param {Object} newState - The new state to merge with the current state
 */
export function updateGameState(newState) {
	gameState = {
		...gameState,
		...newState,
		lastUpdate: Date.now()
	};
}

/**
 * Generate a unique ID
 * @returns {string} A unique identifier
 */
export function generateId() {
	return uuidv4();
}

/**
 * Initialize the game state
 * @returns {Object} The initialized game state
 */
export function initGameState() {
	// Reset the game state
	gameState.board = {};
	gameState.players = {};
	gameState.homeZones = {};
	gameState.fallingPiece = null;
	gameState.potions = {};
	gameState.lastDegradation = null;
	gameState.lastSnapshot = null;
	
	return gameState;
}

/**
 * Set the current game ID
 * @param {string} gameId - The game ID
 */
export function setCurrentGameId(gameId) {
	gameState.currentGameId = gameId;
}

/**
 * Get the current game ID
 * @returns {string} The current game ID
 */
export function getCurrentGameId() {
	return gameState.currentGameId;
}

/**
 * Check if a position has a valid cell (something to stand on)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if the position has a valid cell
 */
export function hasValidCell(x, y) {
	const key = `${x},${y}`;
	return gameState.board[key] && gameState.board[key].type !== 'empty';
}

/**
 * Check if a position is within board bounds
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if the position is within bounds
 */
export function isInBounds(x, y) {
	return x >= 0 && x < Constants.INITIAL_BOARD_WIDTH && y >= 0 && y < Constants.INITIAL_BOARD_HEIGHT;
}

/**
 * Find adjacent cells to a position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Array} Array of adjacent cell positions
 */
export function getAdjacentCells(x, y) {
	const adjacentCells = [];
	const directions = [
		{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
		{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }
	];

	for (const dir of directions) {
		const nx = x + dir.dx;
		const ny = y + dir.dy;
		if (isInBounds(nx, ny) && hasValidCell(nx, ny)) {
			adjacentCells.push({ x: nx, y: ny });
		}
	}

	return adjacentCells;
}

/**
 * Check if a cell belongs to a safe home zone
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if the cell is in a safe home zone
 */
export function isCellInSafeHomeZone(x, y) {
	for (const playerId in gameState.homeZones) {
		const zone = gameState.homeZones[playerId];

		// Check if the cell is within this zone
		if (x >= zone.x && x < zone.x + zone.width &&
			y >= zone.y && y < zone.y + zone.height) {

			// Check if this zone has at least one piece in it
			let hasOccupiedCell = false;
			for (let zx = zone.x; zx < zone.x + zone.width; zx++) {
				for (let zy = zone.y; zy < zone.y + zone.height; zy++) {
					const key = `${zx},${zy}`;
					if (gameState.board[key] && gameState.board[key].piece) {
						hasOccupiedCell = true;
						break;
					}
				}
				if (hasOccupiedCell) break;
			}

			if (hasOccupiedCell) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Generate a random color for a player
 * @returns {number} A random color
 */
export function generatePlayerColor() {
	return Math.floor(Math.random() * 0xFFFFFF);
}

/**
 * Find a suitable position for a new home zone
 * @returns {Object} The position for the new home zone
 */
export function findHomeZonePosition() {
	if (Object.keys(gameState.homeZones).length === 0) {
		// First player - place in a random corner
		const corners = [
			{ x: 0, y: 0 },
			{ x: Constants.INITIAL_BOARD_WIDTH - Constants.HOME_ZONE_WIDTH, y: 0 },
			{ x: 0, y: Constants.INITIAL_BOARD_HEIGHT - Constants.HOME_ZONE_HEIGHT },
			{ x: Constants.INITIAL_BOARD_WIDTH - Constants.HOME_ZONE_WIDTH, y: Constants.INITIAL_BOARD_HEIGHT - Constants.HOME_ZONE_HEIGHT }
		];
		return corners[Math.floor(Math.random() * corners.length)];
	}

	// Find an existing zone to place near
	const existingZones = Object.values(gameState.homeZones);
	const targetZone = existingZones[Math.floor(Math.random() * existingZones.length)];

	// Determine distance to place the new zone
	const distance = Constants.MIN_DISTANCE_BETWEEN_ZONES +
		Math.floor(Math.random() * (Constants.MAX_DISTANCE_BETWEEN_ZONES - Constants.MIN_DISTANCE_BETWEEN_ZONES + 1));

	// Possible directions from the target zone
	const directions = [
		{ dx: 1, dy: 0 }, { dx: -1, dy: 0 },
		{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }
	];

	// Try each direction
	for (let i = 0; i < 10; i++) { // Limit attempts
		const dir = directions[Math.floor(Math.random() * directions.length)];
		const x = targetZone.x + (dir.dx * distance);
		const y = targetZone.y + (dir.dy * distance);

		// Ensure the zone fits within the board
		if (x >= 0 && x + Constants.HOME_ZONE_WIDTH <= Constants.INITIAL_BOARD_WIDTH &&
			y >= 0 && y + Constants.HOME_ZONE_HEIGHT <= Constants.INITIAL_BOARD_HEIGHT) {

			// Check that this position doesn't overlap with existing zones
			let overlaps = false;
			for (const zone of existingZones) {
				if (x < zone.x + zone.width && x + Constants.HOME_ZONE_WIDTH > zone.x &&
					y < zone.y + zone.height && y + Constants.HOME_ZONE_HEIGHT > zone.y) {
					overlaps = true;
					break;
				}
			}

			if (!overlaps) {
				return { x, y };
			}
		}
	}

	// If all attempts fail, expand the board and try again
	// Note: In a real implementation, we would need to handle board expansion properly
	return findHomeZonePosition();
}

/**
 * Create a chess piece
 * @param {string} type - The piece type
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} playerId - The player ID
 * @returns {Object} The created piece
 */
export function createChessPiece(type, x, y, playerId) {
	const piece = {
		id: uuidv4(),
		type: type,
		x: x,
		y: y,
		playerId: playerId,
		color: gameState.players[playerId].color
	};

	const key = `${x},${y}`;
	if (gameState.board[key]) {
		gameState.board[key].piece = piece;
	}

	return piece;
}

/**
 * Add chess pieces to a player's home zone
 * @param {Object} player - The player object
 */
export function addChessPiecesToHomeZone(player) {
	const zone = player.homeZone;
	
	// Create cells for the home zone
	for (let x = zone.x; x < zone.x + zone.width; x++) {
		for (let y = zone.y; y < zone.y + zone.height; y++) {
			const key = `${x},${y}`;
			gameState.board[key] = {
				type: 'cell',
				color: player.color,
				createdAt: Date.now()
			};
		}
	}
	
	// Add the home zone to the game state
	gameState.homeZones[player.id] = {
		x: zone.x,
		y: zone.y,
		width: zone.width,
		height: zone.height,
		playerId: player.id
	};
	
	// Add chess pieces
	// Pawns in the front row
	for (let x = zone.x; x < zone.x + zone.width; x++) {
		const piece = createChessPiece(Constants.PIECE_TYPES.PAWN, x, zone.y, player.id);
		player.pieces.push(piece);
	}
	
	// Other pieces in the back row
	const backRow = zone.y + 1;
	const pieces = [
		Constants.PIECE_TYPES.ROOK,
		Constants.PIECE_TYPES.KNIGHT,
		Constants.PIECE_TYPES.BISHOP,
		Constants.PIECE_TYPES.QUEEN,
		Constants.PIECE_TYPES.KING,
		Constants.PIECE_TYPES.BISHOP,
		Constants.PIECE_TYPES.KNIGHT,
		Constants.PIECE_TYPES.ROOK
	];
	
	for (let i = 0; i < pieces.length; i++) {
		const piece = createChessPiece(pieces[i], zone.x + i, backRow, player.id);
		player.pieces.push(piece);
	}
}

/**
 * Check valid moves for a chess piece
 * @param {Object} piece - The chess piece
 * @param {string} playerId - The player ID
 * @returns {Array} Array of valid moves
 */
export function getValidMoves(piece, playerId) {
	if (!piece) return [];

	const validMoves = [];
	const pattern = Constants.MOVEMENT_PATTERNS[piece.type];
	const player = gameState.players[playerId];

	for (const dir of pattern.moveDirections) {
		const maxDist = pattern.maxDistance;

		for (let dist = 1; dist <= maxDist; dist++) {
			const targetX = piece.x + (dir.dx * dist);
			const targetY = piece.y + (dir.dy * dist);

			// Check if target is in bounds and has a valid cell to move to
			if (!isInBounds(targetX, targetY) || !hasValidCell(targetX, targetY)) {
				break;
			}

			const targetKey = `${targetX},${targetY}`;
			const targetCell = gameState.board[targetKey];

			// If there's a piece in the way
			if (targetCell.piece) {
				// If the piece belongs to the opponent, it's a valid attack move
				if (targetCell.piece.playerId !== playerId) {
					validMoves.push({ x: targetX, y: targetY, type: 'attack' });
				}

				// If not a knight, we can't jump over pieces
				if (!pattern.canJump) {
					break;
				}
			} else {
				// Empty cell, valid move
				validMoves.push({ x: targetX, y: targetY, type: 'move' });

				// Check for potions
				if (targetCell.potion) {
					validMoves[validMoves.length - 1].hasPotion = true;
				}
			}
		}
	}

	return validMoves;
}

/**
 * Apply potion effect to a player
 * @param {Object} potion - The potion object
 * @param {string} playerId - The player ID
 */
export function applyPotionEffect(potion, playerId) {
	if (!potion) return;

	const player = gameState.players[playerId];
	if (!player) return;

	switch (potion.type) {
		case Constants.POTION_TYPES.SPEED:
			// Implementation would depend on how we track piece movement speed
			break;
		case Constants.POTION_TYPES.JUMP:
			// Allow all pieces to jump for a limited time
			player.specialAbilities = player.specialAbilities || {};
			player.specialAbilities.jumpUntil = Date.now() + (60 * 1000); // 1 minute
			break;
		case Constants.POTION_TYPES.SHIELD:
			// Select a random piece to shield
			if (player.pieces.length > 0) {
				const randomPiece = player.pieces[Math.floor(Math.random() * player.pieces.length)];
				randomPiece.shielded = true;
			}
			break;
		case Constants.POTION_TYPES.GROW:
			// Expand home zone if possible
			const zone = gameState.homeZones[playerId];
			if (zone) {
				zone.width = Math.min(zone.width + 1, Constants.HOME_ZONE_WIDTH + 2);
			}
			break;
	}
}

/**
 * Spawn a new falling tetromino piece
 */
export function spawnFallingPiece() {
	const keys = Object.keys(Constants.TETROMINOES);
	const type = keys[Math.floor(Math.random() * keys.length)];
	const tetro = Constants.TETROMINOES[type];

	// Random spawn position within board boundaries
	let maxBlockX = Math.max(...tetro.blocks.map(b => b.x));
	let maxBlockY = Math.max(...tetro.blocks.map(b => b.y));

	let spawnX = Math.floor(Math.random() * (Constants.INITIAL_BOARD_WIDTH - maxBlockX));
	let spawnY = Math.floor(Math.random() * (Constants.INITIAL_BOARD_HEIGHT - maxBlockY));

	// Decide if this piece should be sponsored (20% chance)
	const isSponsored = Math.random() < 0.2;
	let sponsor = null;

	if (isSponsored) {
		sponsor = Constants.SPONSORS[Math.floor(Math.random() * Constants.SPONSORS.length)];
	}

	// Decide if any block should have a potion (10% chance)
	const hasPotion = Math.random() < 0.1;
	let potionBlock = null;
	let potion = null;

	if (hasPotion) {
		const potionTypes = Object.values(Constants.POTION_TYPES);
		const potionType = potionTypes[Math.floor(Math.random() * potionTypes.length)];

		potion = {
			id: uuidv4(),
			type: potionType
		};

		// Choose a random block to place the potion on
		potionBlock = Math.floor(Math.random() * tetro.blocks.length);
	}

	gameState.fallingPiece = {
		type: type,
		blocks: tetro.blocks,
		color: tetro.color,
		x: spawnX,
		y: spawnY,
		z: Constants.START_Z,
		sponsor: sponsor,
		potion: potion ? { blockIndex: potionBlock, data: potion } : null
	};
	
	return gameState.fallingPiece;
}

/**
 * Check if a falling piece should stick to the board
 * @param {Object} piece - The falling piece
 * @returns {boolean} True if the piece should stick
 */
export function shouldStickPiece(piece) {
	// Check if the piece is close to the board
	if (piece.z > 0.5) return false;
	
	// Check if any block of the piece has an adjacent cell
	for (const block of piece.blocks) {
		const cellX = piece.x + block.x;
		const cellY = piece.y + block.y;
		
		if (isInBounds(cellX, cellY)) {
			const hasNeighbor = getAdjacentCells(cellX, cellY).length > 0;
			if (hasNeighbor) return true;
		}
	}
	
	return false;
}

/**
 * Lock a falling piece to the board
 * @returns {boolean} True if the piece was locked
 */
export function lockFallingPiece() {
	if (!gameState.fallingPiece) return false;
	
	let stuckAny = false;

	for (let i = 0; i < gameState.fallingPiece.blocks.length; i++) {
		const block = gameState.fallingPiece.blocks[i];
		const cellX = gameState.fallingPiece.x + block.x;
		const cellY = gameState.fallingPiece.y + block.y;

		if (isInBounds(cellX, cellY)) {
			// Check if this block has neighboring cells
			const hasNeighbor = getAdjacentCells(cellX, cellY).length > 0;

			if (hasNeighbor) {
				stuckAny = true;
				const key = `${cellX},${cellY}`;

				// Create the cell
				gameState.board[key] = {
					type: 'cell',
					color: gameState.fallingPiece.color,
					createdAt: Date.now()
				};

				// If this block has a sponsor
				if (gameState.fallingPiece.sponsor) {
					gameState.board[key].sponsor = gameState.fallingPiece.sponsor;
				}

				// If this block has a potion
				if (gameState.fallingPiece.potion && gameState.fallingPiece.potion.blockIndex === i) {
					gameState.board[key].potion = gameState.fallingPiece.potion.data;
					gameState.potions[gameState.fallingPiece.potion.data.id] = {
						x: cellX,
						y: cellY,
						data: gameState.fallingPiece.potion.data
					};
				}
			}
		}
	}

	// Only lock the piece if at least one block stuck
	if (stuckAny) {
		gameState.fallingPiece = null;
		return true;
	}

	return false;
}

/**
 * Clear full rows on the board
 * @returns {Array} Array of cleared row indices
 */
export function clearFullRows() {
	// Collect all row indices
	const filledRows = new Set();
	const filledCols = new Set();

	// Map to track cell counts in each row and column
	const rowCounts = {};
	const colCounts = {};

	// Count occupied cells in each row and column
	for (const key in gameState.board) {
		const [x, y] = key.split(',').map(Number);

		if (isInBounds(x, y) && gameState.board[key].type === 'cell') {
			rowCounts[y] = (rowCounts[y] || 0) + 1;
			colCounts[x] = (colCounts[x] || 0) + 1;

			// Check if this row or column is now full
			if (rowCounts[y] >= 8) {
				filledRows.add(y);
			}
			if (colCounts[x] >= 8) {
				filledCols.add(x);
			}
		}
	}

	// Clear filled rows
	for (const y of filledRows) {
		for (let x = 0; x < Constants.INITIAL_BOARD_WIDTH; x++) {
			const key = `${x},${y}`;

			// Only clear cells not in safe home zones
			if (gameState.board[key] && !isCellInSafeHomeZone(x, y)) {
				// If there's a piece, remove it from the player's collection
				if (gameState.board[key].piece) {
					const piece = gameState.board[key].piece;
					gameState.players[piece.playerId].pieces = gameState.players[piece.playerId].pieces.filter(p => p.id !== piece.id);
				}

				// Remove the cell
				delete gameState.board[key];
			}
		}
	}

	// Clear filled columns
	for (const x of filledCols) {
		for (let y = 0; y < Constants.INITIAL_BOARD_HEIGHT; y++) {
			const key = `${x},${y}`;

			// Only clear cells not in safe home zones
			if (gameState.board[key] && !isCellInSafeHomeZone(x, y)) {
				// If there's a piece, remove it from the player's collection
				if (gameState.board[key].piece) {
					const piece = gameState.board[key].piece;
					gameState.players[piece.playerId].pieces = gameState.players[piece.playerId].pieces.filter(p => p.id !== piece.id);
				}

				// Remove the cell
				delete gameState.board[key];
			}
		}
	}
	
	return [...filledRows, ...filledCols];
}

/**
 * Degrade empty home zones over time
 * @returns {Array} Array of degraded zone player IDs
 */
export function degradeHomeZones() {
	const degradedZones = [];
	
	for (const playerId in gameState.homeZones) {
		const zone = gameState.homeZones[playerId];

		// Check if zone is empty
		let hasOccupiedCell = false;
		for (let x = zone.x; x < zone.x + zone.width; x++) {
			for (let y = zone.y; y < zone.y + zone.height; y++) {
				const key = `${x},${y}`;
				if (gameState.board[key] && gameState.board[key].piece) {
					hasOccupiedCell = true;
					break;
				}
			}
			if (hasOccupiedCell) break;
		}

		// If empty, degrade the zone
		if (!hasOccupiedCell && zone.width > 0) {
			// First remove empty cells
			let emptyCellsRemoved = false;

			for (let x = zone.x + zone.width - 1; x >= zone.x; x--) {
				for (let y = zone.y; y < zone.y + zone.height; y++) {
					const key = `${x},${y}`;
					if (gameState.board[key] && !gameState.board[key].piece) {
						delete gameState.board[key];
						emptyCellsRemoved = true;
						break;
					}
				}
				if (emptyCellsRemoved) break;
			}

			// If no empty cells to remove, then shrink the zone
			if (!emptyCellsRemoved) {
				zone.width -= 1;
				degradedZones.push(playerId);
			}

			// If width becomes 0, remove the home zone
			if (zone.width <= 0) {
				delete gameState.homeZones[playerId];
			}
		}
	}
	
	gameState.lastDegradation = Date.now();
	return degradedZones;
}

export default {
	initGameState,
	getGameState,
	setCurrentGameId,
	getCurrentGameId,
	hasValidCell,
	isInBounds,
	getAdjacentCells,
	isCellInSafeHomeZone,
	generatePlayerColor,
	findHomeZonePosition,
	createChessPiece,
	addChessPiecesToHomeZone,
	getValidMoves,
	applyPotionEffect,
	spawnFallingPiece,
	shouldStickPiece,
	lockFallingPiece,
	clearFullRows,
	degradeHomeZones
}; 