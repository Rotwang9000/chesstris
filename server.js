/**
 * Chesstris Server
 * 
 * Main server file that initializes Express, Socket.IO, and database services.
 */

// Import and configure dotenv
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import database services
import { initServices, services } from './services/index.js';

// Import routes
import authRoutes from './server/routes/auth.js';
import gameRoutes from './server/routes/game.js';
import statsRoutes from './server/routes/stats.js';
import transactionRoutes from './server/routes/transaction.js';
import advertiserRoutes from './server/routes/advertiser.js';

// Import required Solana libraries
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

// Import rate limiting middleware
import { rateLimiter, socketRateLimiter } from './middleware/rateLimit.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import cookieParser from 'cookie-parser';

// Import services for shutdown
import { closeConnections } from './services/index.js';

// Initialize express and server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST']
	}
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add security headers middleware
app.use((req, res, next) => {
	// Set security headers
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-XSS-Protection', '1; mode=block');
	res.setHeader('X-Frame-Options', 'DENY');
	res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	
	// Set Content Security Policy
	res.setHeader('Content-Security-Policy', 
		"default-src 'self'; " +
		"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
		"font-src 'self' https://fonts.gstatic.com; " +
		"img-src 'self' data: https:; " +
		"connect-src 'self' wss: ws:;"
	);
	
	next();
});

// Add services to the request object
app.use((req, res, next) => {
	req.services = services;
	next();
});

// Create the game board state
let BOARD_WIDTH = 20;
let BOARD_HEIGHT = 20;
let board = {};
let homeZones = {};

// Falling piece state
let fallingPiece = null;

// Player turn timers and cooldowns
const playerTurns = {};
const TURN_COOLDOWN = 10000; // 10 seconds cooldown between turns
const DIFFICULTY_LEVELS = {
	easy: 20000,    // 20 seconds between turns
	normal: 10000,  // 10 seconds between turns
	hard: 5000      // 5 seconds between turns
};
let gameDifficulty = 'normal';

// Piece pricing in SOL
const PIECE_PRICES = {
	pawn: 0.1,
	knight: 0.5,
	bishop: 0.5,
	rook: 0.5,
	queen: 1.0
};

// Player purchase records for fee distribution
const playerPurchases = {};

// Player pause tracking
const pausedPlayers = new Map(); // Map of playerId -> { pauseTime, expiryTime }
const PAUSE_MAX_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// Add a Map to track player pause cooldowns
const playerPauseCooldowns = new Map();
const PAUSE_COOLDOWN_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

// Version information for update checking
const VERSION = {
	current: '1.0.0',
	updateAvailable: false,
	updateInfo: null,
	lastChecked: null,
	checkInterval: 1000 * 60 * 60 // Check for updates every hour
};

// Add constants for energy system
const PIECE_ENERGY_COSTS = {
	pawn: 1,
	knight: 2,
	bishop: 2,
	rook: 3,
	queen: 4,
	king: 1
};

const MAX_ENERGY = 10;
const ENERGY_REGEN_RATE = 1; // Energy points per regeneration cycle
const ENERGY_REGEN_INTERVAL = 5000; // Regenerate energy every 5 seconds

// Map to track player energy
const playerEnergy = new Map();

/**
 * Initialize energy for a player
 * @param {string} playerId - Player ID
 */
function initPlayerEnergy(playerId) {
	playerEnergy.set(playerId, {
		current: MAX_ENERGY,
		lastRegenTime: Date.now()
	});
}

/**
 * Get current energy for a player
 * @param {string} playerId - Player ID
 * @returns {Object} Energy data
 */
function getPlayerEnergy(playerId) {
	if (!playerEnergy.has(playerId)) {
		initPlayerEnergy(playerId);
	}
	
	// Regenerate energy if needed
	regenerateEnergy(playerId);
	
	return playerEnergy.get(playerId);
}

/**
 * Regenerate energy for a player based on time elapsed
 * @param {string} playerId - Player ID
 */
function regenerateEnergy(playerId) {
	if (!playerEnergy.has(playerId)) {
		initPlayerEnergy(playerId);
		return;
	}
	
	const energyData = playerEnergy.get(playerId);
	const now = Date.now();
	const elapsedTime = now - energyData.lastRegenTime;
	
	// Calculate how many regeneration cycles have passed
	const cycles = Math.floor(elapsedTime / ENERGY_REGEN_INTERVAL);
	
	if (cycles > 0) {
		// Add energy based on cycles
		energyData.current = Math.min(MAX_ENERGY, energyData.current + (cycles * ENERGY_REGEN_RATE));
		energyData.lastRegenTime = now - (elapsedTime % ENERGY_REGEN_INTERVAL);
		
		playerEnergy.set(playerId, energyData);
	}
}

/**
 * Check if player has enough energy for a move
 * @param {string} playerId - Player ID
 * @param {string} pieceType - Type of chess piece
 * @returns {boolean} Whether player has enough energy
 */
function hasEnoughEnergy(playerId, pieceType) {
	const energyData = getPlayerEnergy(playerId);
	const cost = PIECE_ENERGY_COSTS[pieceType.toLowerCase()] || 1;
	
	return energyData.current >= cost;
}

/**
 * Use energy for a piece move
 * @param {string} playerId - Player ID
 * @param {string} pieceType - Type of chess piece
 * @returns {Object} Updated energy data
 */
function useEnergy(playerId, pieceType) {
	if (!hasEnoughEnergy(playerId, pieceType)) {
		return null;
	}
	
	const energyData = getPlayerEnergy(playerId);
	const cost = PIECE_ENERGY_COSTS[pieceType.toLowerCase()] || 1;
	
	energyData.current -= cost;
	playerEnergy.set(playerId, energyData);
	
	return energyData;
}

/**
 * Initialize the board
 * @returns {Object} The initialized board
 */
function initBoard() {
	board = {};
	homeZones = {};
	return board;
}

/**
 * Expand the board if needed
 * @param {number} requiredWidth - The width to expand to
 */
function expandBoardIfNeeded(requiredWidth) {
	if (requiredWidth > BOARD_WIDTH) {
		BOARD_WIDTH = requiredWidth;
	}
}

/**
 * Add a home zone for a player
 * @param {string} playerId - The player ID
 * @returns {Object} The created home zone
 */
function addPlayerHomeZone(playerId) {
	// Generate a random starting X position for the 8x2 home zone.
	const zoneWidth = 8;
	const zoneHeight = 2;
	
	// Calculate a good position for the home zone
	let startX;
	let startY;
	
	if (Object.keys(homeZones).length === 0) {
		// First player, place at center bottom
		startX = Math.floor(BOARD_WIDTH / 2) - Math.floor(zoneWidth / 2);
		startY = BOARD_HEIGHT - zoneHeight;
	} else {
		// Find a position that's at least MIN_DISTANCE but not more than MAX_DISTANCE
		// from any existing home zone
		const MIN_DISTANCE = 8;
		const MAX_DISTANCE = 12;
		// For simplicity, we'll just add sequentially for now
		startX = Math.floor(Math.random() * (BOARD_WIDTH - zoneWidth));
		startY = Math.floor(Math.random() * (BOARD_HEIGHT - zoneHeight));
	}
	
	// Ensure we have enough room for the zone
	expandBoardIfNeeded(startX + zoneWidth + 1);
	
	// Create the home zone
	const homeZone = {
		playerId,
		startX,
		startY,
		width: zoneWidth,
		height: zoneHeight,
		color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
	};
	
	homeZones[playerId] = homeZone;
	
	// Fill cells in home zone
	for (let x = startX; x < startX + zoneWidth; x++) {
		for (let y = startY; y < startY + zoneHeight; y++) {
			const key = `${x},${y}`;
			board[key] = { 
				x, 
				y,
				homeZone: {
					playerId,
					color: homeZone.color
				},
				piece: null,
				createdAt: Date.now()
			};
		}
	}
	
	return homeZone;
}

/**
 * Check if a cell is in a safe home zone
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {boolean} Whether the cell is in a safe home zone
 */
function isCellInSafeHomeZone(x, y) {
	for (const playerId in homeZones) {
		const zone = homeZones[playerId];
		
		// Check if the cell is within this home zone
		if (x >= zone.x && x < zone.x + zone.width &&
			y >= zone.y && y < zone.y + zone.height) {
			
			// Count pieces in this home zone
			let hasPieces = false;
			for (let zoneY = zone.y; zoneY < zone.y + zone.height; zoneY++) {
				for (let zoneX = zone.x; zoneX < zone.x + zone.width; zoneX++) {
					if (board[zoneY][zoneX] && board[zoneY][zoneX].piece) {
						hasPieces = true;
						break;
					}
				}
				if (hasPieces) break;
			}
			
			// Check if the player is paused
			const isPaused = isPlayerPaused(playerId);
			
			// The zone is safe if it has pieces or the player is paused
			return hasPieces || isPaused;
		}
	}
	
	return false;
}

/**
 * Degrade empty home zones
 */
function degradeHomeZones() {
	for (const playerId in homeZones) {
		const homeZone = homeZones[playerId];
		let hasPiece = false;
		
		// Check if the home zone has any pieces
		for (let x = homeZone.startX; x < homeZone.startX + homeZone.width; x++) {
			for (let y = homeZone.startY; y < homeZone.startY + homeZone.height; y++) {
				const key = `${x},${y}`;
				if (board[key] && board[key].piece) {
					hasPiece = true;
					break;
				}
			}
			if (hasPiece) break;
		}
		
		if (!hasPiece) {
			// Degrade the home zone by removing one cell
			// First, try to remove an empty cell
			let foundEmptyCell = false;
			for (let x = homeZone.startX; x < homeZone.startX + homeZone.width; x++) {
				for (let y = homeZone.startY; y < homeZone.startY + homeZone.height; y++) {
					const key = `${x},${y}`;
					if (board[key] && !board[key].piece) {
						// Remove this cell
						delete board[key].homeZone;
						foundEmptyCell = true;
						break;
					}
				}
				if (foundEmptyCell) break;
			}
			
			// If no empty cell, remove a cell with a piece
			if (!foundEmptyCell) {
				for (let x = homeZone.startX; x < homeZone.startX + homeZone.width; x++) {
					for (let y = homeZone.startY; y < homeZone.startY + homeZone.height; y++) {
						const key = `${x},${y}`;
						if (board[key]) {
							delete board[key].homeZone;
							delete board[key].piece;
							break;
						}
					}
					if (foundEmptyCell) break;
				}
			}
			
			// Check if any cells of the home zone remain
			let homeZoneExists = false;
			for (let x = homeZone.startX; x < homeZone.startX + homeZone.width; x++) {
				for (let y = homeZone.startY; y < homeZone.startY + homeZone.height; y++) {
					const key = `${x},${y}`;
					if (board[key] && board[key].homeZone && board[key].homeZone.playerId === playerId) {
						homeZoneExists = true;
						break;
					}
				}
				if (homeZoneExists) break;
			}
			
			// If no cells remain, delete the home zone
			if (!homeZoneExists) {
				delete homeZones[playerId];
			}
		}
	}
}

// Schedule regular home zone degradation
const DEGRADATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(degradeHomeZones, DEGRADATION_INTERVAL);

/**
 * Spawn a new falling tetromino piece
 * @returns {Object} The spawned piece
 */
function spawnFallingPiece() {
	// Define a simple set of tetromino shapes: I, O, T, S, Z, J, L
	const tetrominoes = [
		{ name: 'I', blocks: [[0,0], [1,0], [2,0], [3,0]], color: '#00f0f0' },
		{ name: 'O', blocks: [[0,0], [1,0], [0,1], [1,1]], color: '#f0f000' },
		{ name: 'T', blocks: [[0,0], [1,0], [2,0], [1,1]], color: '#a000f0' },
		{ name: 'S', blocks: [[1,0], [2,0], [0,1], [1,1]], color: '#00f000' },
		{ name: 'Z', blocks: [[0,0], [1,0], [1,1], [2,1]], color: '#f00000' },
		{ name: 'J', blocks: [[0,0], [0,1], [1,1], [2,1]], color: '#0000f0' },
		{ name: 'L', blocks: [[2,0], [0,1], [1,1], [2,1]], color: '#f0a000' }
	];

	// Select a random tetromino shape
	const tetromino = tetrominoes[Math.floor(Math.random() * tetrominoes.length)];
	
	// Starting position: center top
	const startX = Math.floor(BOARD_WIDTH / 2) - 1;
	const startY = 0;
	const startZ = 10; // Starting height above the board
	
	fallingPiece = {
		type: tetromino.name,
		blocks: tetromino.blocks.map(([x, y]) => ({ x: x + startX, y: y + startY })),
		color: tetromino.color,
		z: startZ
	};
	
	return fallingPiece;
}

/**
 * Checks if a cell has any adjacent occupied cells AND can trace a path back to the player's king
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @param {string} playerId - The player's ID who owns the piece
 * @returns {boolean} - Whether the cell has adjacent cells and a path to king
 */
function hasAdjacent(x, y, playerId) {
	// First, check for any adjacent cells
	const adjacentCells = [
		{ x: x + 1, y: y },
		{ x: x - 1, y: y },
		{ x: x, y: y + 1 },
		{ x: x, y: y - 1 }
	];
	
	let hasAdjacentCell = false;
	for (const cell of adjacentCells) {
		if (board[cell.y] && board[cell.y][cell.x] && board[cell.y][cell.x].color) {
			hasAdjacentCell = true;
			break;
		}
	}
	
	// If no adjacent cells, we can return early
	if (!hasAdjacentCell) {
		return false;
	}
	
	// If this player has no king, we can't check the path (could happen if king was captured)
	const kingPosition = findKingPosition(playerId);
	if (!kingPosition) {
		return true; // Allow placement even without a king (probably game over soon anyway)
	}
	
	// Check if there's a path to the king
	return hasPathToKing(x, y, kingPosition.x, kingPosition.y, playerId);
}

/**
 * Finds the position of a player's king
 * @param {string} playerId - The player's ID
 * @returns {Object|null} - The king's position or null if not found
 */
function findKingPosition(playerId) {
	for (let y = 0; y < board.length; y++) {
		for (let x = 0; x < board[y].length; x++) {
			const cell = board[y][x];
			if (cell && cell.piece && cell.piece.type === 'king' && cell.playerId === playerId) {
				return { x, y };
			}
		}
	}
	return null;
}

/**
 * Checks if there's a path from a cell to the king using BFS
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} kingX - King's X coordinate
 * @param {number} kingY - King's Y coordinate
 * @param {string} playerId - The player's ID
 * @returns {boolean} - Whether a path exists
 */
function hasPathToKing(startX, startY, kingX, kingY, playerId) {
	// Use breadth-first search to find a path
	const queue = [{ x: startX, y: startY }];
	const visited = new Set();
	visited.add(`${startX},${startY}`);
	
	while (queue.length > 0) {
		const { x, y } = queue.shift();
		
		// If we've reached the king's position, we found a path
		if (x === kingX && y === kingY) {
			return true;
		}
		
		// Check all adjacent cells
		const adjacentCells = [
			{ x: x + 1, y: y },
			{ x: x - 1, y: y },
			{ x: x, y: y + 1 },
			{ x: x, y: y - 1 }
		];
		
		for (const cell of adjacentCells) {
			const cellKey = `${cell.x},${cell.y}`;
			
			// Skip if we've already visited this cell
			if (visited.has(cellKey)) {
				continue;
			}
			
			// Skip if the cell is out of bounds
			if (!board[cell.y] || !board[cell.y][cell.x]) {
				continue;
			}
			
			// Skip if the cell is not occupied by any piece
			if (!board[cell.y][cell.x].color) {
				continue;
			}
			
			// Skip if the cell is occupied by an opponent's piece
			if (board[cell.y][cell.x].playerId && board[cell.y][cell.x].playerId !== playerId) {
				continue;
			}
			
			// This cell is valid for the path
			visited.add(cellKey);
			queue.push(cell);
		}
	}
	
	// If we've exhausted all possibilities without finding the king, there's no path
	return false;
}

/**
 * Locks the falling piece into the board
 */
function lockFallingPiece() {
	if (!fallingPiece) return;
	
	const { blocks, color, playerId } = fallingPiece;
	let hasConnectedBlock = false;
	
	// Check if any block has adjacent cells
	for (const block of blocks) {
		if (hasAdjacent(block.x, block.y, playerId)) {
			hasConnectedBlock = true;
			break;
		}
	}
	
	// Only lock the piece if it's connected to existing cells AND has a path to the king
	if (hasConnectedBlock) {
		// Add blocks to the board
		for (const block of blocks) {
			if (board[block.y] && board[block.y][block.x]) {
				board[block.y][block.x] = {
					color,
					playerId,
					createdAt: Date.now()
				};
			}
		}
		
		// Check if any rows should be cleared
		clearFullRows();
		
		// Notify all clients that the piece has been locked
		io.emit('boardUpdate', {
			board,
			fallingPiece: null,
			homeZones
		});
	}
	
	// Reset the falling piece
	fallingPiece = null;
	
	// Spawn a new piece after a delay
	setTimeout(() => {
		spawnFallingPiece();
	}, 500);
}

/**
 * Clears any full rows and handles orphaned pieces
 * @returns {number} Number of rows cleared
 */
function clearFullRows() {
	let rowsCleared = 0;
	
	// Check each row for clearance
	for (let y = 0; y < board.length; y++) {
		let isFull = true;
		
		// A row is full if all cells are occupied
		for (let x = 0; x < board[y].length; x++) {
			if (!board[y][x] || !board[y][x].color) {
				isFull = false;
				break;
			}
		}
		
		// Clear the row if it's full (excluding safe home zones)
		if (isFull) {
			for (let x = 0; x < board[y].length; x++) {
				// Check if this cell is in a safe home zone
				if (!isCellInSafeHomeZone(x, y)) {
					// Clear the cell (but keep the structure for consistency)
					board[y][x] = { cleared: true };
				}
			}
			
			// Move all cells above this row down by one
			for (let row = y - 1; row >= 0; row--) {
				for (let x = 0; x < board[row].length; x++) {
					// Only move cells that aren't in a safe home zone
					if (board[row][x] && board[row][x].color && !isCellInSafeHomeZone(x, row)) {
						// Move the cell down
						board[row + 1][x] = { ...board[row][x] };
						board[row][x] = null;
					}
				}
			}
			
			// Find and handle orphaned pieces
			handleOrphanedPieces();
			
			rowsCleared++;
		}
	}
	
	// Return the number of rows cleared
	return rowsCleared;
}

/**
 * Find and handle any pieces that are now disconnected from their kings
 */
function handleOrphanedPieces() {
	// Get all player IDs that have pieces on the board
	const playerIds = new Set();
	for (let y = 0; y < board.length; y++) {
		for (let x = 0; x < board[y].length; x++) {
			if (board[y][x] && board[y][x].playerId) {
				playerIds.add(board[y][x].playerId);
			}
		}
	}
	
	// For each player, find pieces that are disconnected from their king
	playerIds.forEach(playerId => {
		// Find the king position
		const kingPosition = findKingPosition(playerId);
		if (!kingPosition) return; // Player has no king
		
		// Find all disconnected pieces
		const orphanedPieces = [];
		
		// First pass: identify orphaned pieces
		for (let y = 0; y < board.length; y++) {
			for (let x = 0; x < board[y].length; x++) {
				if (board[y][x] && board[y][x].playerId === playerId && board[y][x].piece) {
					// Skip the king itself
					if (board[y][x].piece.type === 'king') continue;
					
					// Check if this piece has a path to the king
					if (!hasPathToKing(x, y, kingPosition.x, kingPosition.y, playerId)) {
						orphanedPieces.push({ x, y, piece: { ...board[y][x].piece } });
						
						// Remove the piece from its current position
						board[y][x].piece = null;
					}
				}
			}
		}
		
		// Second pass: move orphaned pieces back towards the king
		orphanedPieces.forEach(orphan => {
			const { x, y, piece } = orphan;
			
			// Find a new position for the piece
			const newPosition = findNewPositionForOrphanedPiece(playerId, kingPosition, piece);
			
			if (newPosition) {
				// Place the piece at the new position
				board[newPosition.y][newPosition.x].piece = piece;
				
				// Notify clients about the piece movement
				io.emit('pieceRelocated', {
					fromX: x,
					fromY: y,
					toX: newPosition.x,
					toY: newPosition.y,
					piece,
					playerId
				});
			} else {
				// If no suitable position is found, the piece is lost
				io.emit('pieceLost', {
					x,
					y,
					piece,
					playerId
				});
			}
		});
	});
}

/**
 * Find a new position for an orphaned piece, closer to the king
 * @param {string} playerId - The player's ID
 * @param {Object} kingPosition - The king's position {x, y}
 * @param {Object} piece - The piece to relocate
 * @returns {Object|null} - The new position {x, y} or null if no position is found
 */
function findNewPositionForOrphanedPiece(playerId, kingPosition, piece) {
	// We'll search in concentric squares around the king, starting close and moving outward
	const maxDistance = Math.max(board.length, board[0].length);
	
	for (let distance = 1; distance < maxDistance; distance++) {
		// Generate positions in a square at this distance from the king
		const positions = [];
		
		// Top and bottom edges of the square
		for (let dx = -distance; dx <= distance; dx++) {
			positions.push({ x: kingPosition.x + dx, y: kingPosition.y - distance });
			positions.push({ x: kingPosition.x + dx, y: kingPosition.y + distance });
		}
		
		// Left and right edges of the square (excluding corners which are already added)
		for (let dy = -distance + 1; dy <= distance - 1; dy++) {
			positions.push({ x: kingPosition.x - distance, y: kingPosition.y + dy });
			positions.push({ x: kingPosition.x + distance, y: kingPosition.y + dy });
		}
		
		// Shuffle the positions to add some randomness
		positions.sort(() => Math.random() - 0.5);
		
		// Try each position
		for (const pos of positions) {
			// Check if position is within board bounds
			if (pos.x < 0 || pos.x >= board[0].length || pos.y < 0 || pos.y >= board.length) {
				continue;
			}
			
			// Check if the cell is occupied by the player and has no piece
			if (board[pos.y][pos.x] && 
				board[pos.y][pos.x].playerId === playerId && 
				!board[pos.y][pos.x].piece) {
				
				// Check if this position has a path to the king
				if (hasPathToKing(pos.x, pos.y, kingPosition.x, kingPosition.y, playerId)) {
					return pos;
				}
			}
		}
	}
	
	// If no suitable position is found, return null
	return null;
}

/**
 * Main game loop
 */
function gameLoop() {
	try {
		// Update the falling piece
		if (fallingPiece) {
			updateFallingPiece();
		}
		
		// Check for players whose pause has expired
		checkPausedPlayers();
		
		// Broadcast board state to all clients
		io.emit('boardUpdate', {
			board,
			fallingPiece,
			homeZones,
			pausedPlayers: Array.from(pausedPlayers.keys())
		});
	} catch (error) {
		console.error('Error in game loop:', error);
	}
	
	// Schedule the next loop
	setTimeout(gameLoop, 1000 / 30); // 30 FPS
}

// Run the game loop at 50 ms intervals
setInterval(gameLoop, 50);

// Socket.IO: Player Connections
io.on('connection', (socket) => {
	// Assign a unique ID to the player
	const playerId = socket.id;
	console.log(`Player ${playerId} connected`);
	
	// Initialize the player's turn state
	playerTurns[playerId] = {
		lastMoveTime: 0, // Allow immediate first move
		pieceDropped: false,
		chessMoved: false
	};
	
	// Add player to the game
	addPlayerHomeZone(playerId);
	
	// Send the initial game state to the player
	socket.emit('boardUpdate', {
		board,
		fallingPiece,
		homeZones,
		playerId,
		difficulty: gameDifficulty,
		pausedPlayers: Array.from(pausedPlayers.keys())
	});
	
	// Handle player disconnection
	socket.on('disconnect', () => {
		console.log(`Player ${playerId} disconnected`);
		
		// Clean up player data
		delete playerTurns[playerId];
		
		// In a real game, we might want to keep the player's pieces
		// on the board for a while before removing them
	});
	
	// Handle chess piece movement
	socket.on('moveChessPiece', (data) => {
		const playerId = socket.playerId;
		
		if (!playerId) {
			socket.emit('moveResponse', {
				success: false,
				reason: 'not_authenticated'
			});
			return;
		}
		
		// Check if player is on cooldown
		if (isPlayerOnCooldown(playerId)) {
			socket.emit('moveResponse', {
				success: false, 
				reason: 'on_cooldown',
				cooldownRemaining: getCooldownRemaining(playerId)
			});
			return;
		}
		
		// Check if player is paused
		if (isPlayerPaused(playerId)) {
			socket.emit('moveResponse', {
				success: false,
				reason: 'paused'
			});
			return;
		}
		
		const result = moveChessPiece(
			playerId, 
			data.from.x, 
			data.from.y, 
			data.to.x, 
			data.to.y
		);
		
		if (result.success) {
			// Set cooldown for the player
			setPlayerCooldown(playerId);
			
			// Broadcast the move to all players
			io.emit('chessPieceMoved', {
				playerId,
				piece: result.piece,
				from: { x: result.fromX, y: result.fromY },
				to: { x: result.toX, y: result.toY }
			});
			
			// Send energy update to the player
			socket.emit('energyUpdate', {
				current: result.energy.current,
				max: MAX_ENERGY,
				regenRate: ENERGY_REGEN_RATE,
				regenInterval: ENERGY_REGEN_INTERVAL,
				costs: PIECE_ENERGY_COSTS
			});
			
			socket.emit('moveResponse', {
				success: true
			});
		} else {
			// If failure was due to energy, include energy info
			if (result.reason === 'not_enough_energy') {
				socket.emit('energyUpdate', {
					current: result.currentEnergy,
					max: MAX_ENERGY,
					needed: result.energyNeeded,
					regenRate: ENERGY_REGEN_RATE,
					regenInterval: ENERGY_REGEN_INTERVAL,
					costs: PIECE_ENERGY_COSTS
				});
			}
			
			socket.emit('moveResponse', {
				success: false,
				reason: result.reason,
				...result // Include any additional details from the result
			});
		}
	});
	
	// Add endpoint to check energy status
	socket.on('checkEnergy', () => {
		const playerId = socket.playerId;
		
		if (!playerId) {
			socket.emit('energyUpdate', {
				success: false,
				reason: 'not_authenticated'
			});
			return;
		}
		
		const energyData = getPlayerEnergy(playerId);
		
		socket.emit('energyUpdate', {
			success: true,
			current: energyData.current,
			max: MAX_ENERGY,
			regenRate: ENERGY_REGEN_RATE,
			regenInterval: ENERGY_REGEN_INTERVAL,
			costs: PIECE_ENERGY_COSTS
		});
	});
	
	// Handle tetris piece placement
	socket.on('placePiece', (pieceData) => {
		if (handlePiecePlacement(playerId, pieceData)) {
			socket.emit('placementSuccess', pieceData);
		} else {
			socket.emit('placementFailure', {
				reason: isPlayerPaused(playerId) ? 'paused' : 
					isPlayerOnCooldown(playerId) ? 'cooldown' : 'invalid',
				cooldownRemaining: getCooldownRemaining(playerId)
			});
		}
	});
	
	// Handle difficulty change request (admin only)
	socket.on('setDifficulty', (data) => {
		// In a real game, we would check if the player has admin rights
		setGameDifficulty(data.difficulty);
	});
	
	// Handle piece purchase request
	socket.on('purchasePiece', async (data) => {
		// Paused players can't purchase pieces
		if (isPlayerPaused(playerId)) {
			socket.emit('purchaseFailure', { 
				reason: 'paused',
				error: 'You cannot purchase pieces while paused'
			});
			return;
		}
		
		const result = await handlePiecePurchase(playerId, data.pieceType, data.x, data.y);
		if (result.success) {
			socket.emit('purchaseSuccess', result);
		} else {
			socket.emit('purchaseFailure', result);
		}
	});
	
	// Handle player pause request
	socket.on('pauseGame', () => {
		if (handlePlayerPause(playerId)) {
			socket.emit('pauseSuccess', {
				expiryTime: pausedPlayers.get(playerId).expiryTime
			});
		} else {
			socket.emit('pauseFailure', {
				reason: 'invalid',
				error: 'You cannot pause at this time'
			});
		}
	});
	
	// Handle player resume request
	socket.on('resumeGame', () => {
		if (handlePlayerResume(playerId)) {
			socket.emit('resumeSuccess');
		} else {
			socket.emit('resumeFailure', {
				reason: 'invalid',
				error: 'You are not currently paused'
			});
		}
	});
	
	// Create rate limiter for this socket
	const checkRateLimit = socketRateLimiter(socket);
	
	// Add rate limit checking to game actions
	socket.on('moveChessPiece', (data) => {
		if (!checkRateLimit('moveChessPiece')) return;
		if (handlePlayerMove(playerId, data)) {
			socket.emit('moveSuccess', data);
		} else {
			socket.emit('moveFailure', {
				reason: isPlayerPaused(playerId) ? 'paused' : 
					isPlayerOnCooldown(playerId) ? 'cooldown' : 'invalid',
				cooldownRemaining: getCooldownRemaining(playerId)
			});
		}
	});
	
	socket.on('moveTetromino', (data) => {
		if (!checkRateLimit('moveTetromino')) return;
		if (handlePiecePlacement(playerId, data)) {
			socket.emit('placementSuccess', data);
		} else {
			socket.emit('placementFailure', {
				reason: isPlayerPaused(playerId) ? 'paused' : 
					isPlayerOnCooldown(playerId) ? 'cooldown' : 'invalid',
				cooldownRemaining: getCooldownRemaining(playerId)
			});
		}
	});
	
	socket.on('placePiece', (data) => {
		if (!checkRateLimit('placePiece')) return;
		if (handlePiecePlacement(playerId, data)) {
			socket.emit('placementSuccess', data);
		} else {
			socket.emit('placementFailure', {
				reason: isPlayerPaused(playerId) ? 'paused' : 
					isPlayerOnCooldown(playerId) ? 'cooldown' : 'invalid',
				cooldownRemaining: getCooldownRemaining(playerId)
			});
		}
	});
	
	socket.on('purchasePiece', (data) => {
		if (!checkRateLimit('purchasePiece')) return;
		if (handlePiecePurchase(playerId, data.pieceType, data.x, data.y)) {
			socket.emit('purchaseSuccess', data);
		} else {
			socket.emit('purchaseFailure', {
				reason: isPlayerPaused(playerId) ? 'paused' : 
					isPlayerOnCooldown(playerId) ? 'cooldown' : 'invalid',
				cooldownRemaining: getCooldownRemaining(playerId)
			});
		}
	});
	
	// Handle pause request
	socket.on('pauseGame', (data) => {
		const playerId = socket.playerId;
		
		if (!playerId) {
			socket.emit('pauseResponse', {
				success: false,
				reason: 'not_authenticated'
			});
			return;
		}
		
		const result = handlePlayerPause(playerId);
		
		if (result.success) {
			// Notify all clients of the pause
			io.emit('playerPaused', {
				playerId,
				expiryTime: result.expiryTime,
				maxDuration: result.maxDuration
			});
		}
		
		socket.emit('pauseResponse', result);
	});
	
	// Handle resume request
	socket.on('resumeGame', (data) => {
		const playerId = socket.playerId;
		
		if (!playerId) {
			socket.emit('resumeResponse', {
				success: false,
				reason: 'not_authenticated'
			});
			return;
		}
		
		const result = handlePlayerResume(playerId);
		
		if (result.success) {
			// Notify all clients of the resume
			io.emit('playerResumed', {
				playerId,
				cooldownRemaining: result.cooldownRemaining
			});
		}
		
		socket.emit('resumeResponse', result);
	});
	
	// Add endpoint to check pause cooldown status
	socket.on('checkPauseCooldown', (data) => {
		const playerId = socket.playerId;
		
		if (!playerId) {
			socket.emit('pauseCooldownStatus', {
				success: false,
				reason: 'not_authenticated'
			});
			return;
		}
		
		socket.emit('pauseCooldownStatus', {
			success: true,
			onCooldown: isPlayerOnPauseCooldown(playerId),
			remainingTime: getPauseCooldownRemaining(playerId)
		});
	});
});

// API Routes
// Auth routes
app.post('/api/auth/register', async (req, res) => {
	try {
		const { username, password, email } = req.body;
		
		const result = await services.user.registerUser({
			username,
			password,
			email
		});
		
		res.status(201).json({
			user: {
				id: result.user._id,
				username: result.user.username
			},
			token: result.token
		});
	} catch (error) {
		console.error('Registration error:', error);
		res.status(400).json({ error: error.message });
	}
});

app.post('/api/auth/login', async (req, res) => {
	try {
		const { username, password } = req.body;
		
		const result = await services.user.authenticateUser({
			username,
			password
		});
		
		res.json({
			user: {
				id: result.user._id,
				username: result.user.username,
				stats: result.user.stats
			},
			token: result.token
		});
	} catch (error) {
		console.error('Login error:', error);
		res.status(401).json({ error: error.message });
	}
});

// User routes
app.get('/api/users/me', async (req, res) => {
	try {
		// Get auth token from headers
		const authHeader = req.headers.authorization;
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		
		const token = authHeader.split(' ')[1];
		
		// Verify token
		const userData = await services.user.verifyToken(token);
		
		// Get user data
		const user = await services.user.getUserById(userData._id);
		
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		res.json({
			id: user._id,
			username: user.username,
			email: user.email,
			stats: user.stats
		});
	} catch (error) {
		console.error('Get user error:', error);
		res.status(401).json({ error: error.message });
	}
});

// Stats routes
app.get('/api/stats/:userId', async (req, res) => {
	try {
		const { userId } = req.params;
		
		let targetUserId = userId;
		
		// If 'me', get the current user's ID
		if (userId === 'me') {
			const authHeader = req.headers.authorization;
			
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return res.status(401).json({ error: 'Unauthorized' });
			}
			
			const token = authHeader.split(' ')[1];
			const userData = await services.user.verifyToken(token);
			targetUserId = userData._id;
		}
		
		// Get user stats
		const stats = await services.user.getUserStats(targetUserId);
		
		if (!stats) {
			return res.status(404).json({ error: 'Stats not found' });
		}
		
		res.json(stats);
	} catch (error) {
		console.error('Get stats error:', error);
		res.status(400).json({ error: error.message });
	}
});

app.get('/api/stats/leaderboard/:type', async (req, res) => {
	try {
		const { type } = req.params;
		const limit = parseInt(req.query.limit) || 10;
		
		// Get leaderboard
		const leaderboard = await services.user.getLeaderboard(type, limit);
		
		res.json(leaderboard);
	} catch (error) {
		console.error('Get leaderboard error:', error);
		res.status(400).json({ error: error.message });
	}
});

// Transaction routes
app.post('/api/transactions/payment-intent', async (req, res) => {
	try {
		// Get auth token from headers
		const authHeader = req.headers.authorization;
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		
		const token = authHeader.split(' ')[1];
		const userData = await services.user.verifyToken(token);
		
		const { amount, currency, metadata } = req.body;
		
		// Create payment intent
		const paymentIntent = await services.transaction.createPaymentIntent({
			userId: userData._id,
			amount,
			currency,
			metadata
		});
		
		res.json(paymentIntent);
	} catch (error) {
		console.error('Create payment intent error:', error);
		res.status(400).json({ error: error.message });
	}
});

app.get('/api/transactions/history', async (req, res) => {
	try {
		// Get auth token from headers
		const authHeader = req.headers.authorization;
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		
		const token = authHeader.split(' ')[1];
		const userData = await services.user.verifyToken(token);
		
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		
		// Get transaction history
		const transactions = await services.transaction.getUserTransactions(userData._id, page, limit);
		
		res.json(transactions);
	} catch (error) {
		console.error('Get transaction history error:', error);
		res.status(400).json({ error: error.message });
	}
});

app.post('/api/transactions/webhook', async (req, res) => {
	try {
		// Get the Stripe signature header
		const signature = req.headers['stripe-signature'];
		
		// Handle the webhook event
		const result = await services.transaction.handleWebhookEvent(req.rawBody, signature);
		
		if (result.success) {
			res.json({ received: true });
		} else {
			res.status(400).json({ error: 'Webhook processing failed' });
		}
	} catch (error) {
		console.error('Webhook error:', error);
		res.status(400).json({ error: error.message });
	}
});

// Game routes
app.get('/api/games/active', async (req, res) => {
	try {
		// Get all active games
		// This is a placeholder - in a real implementation, we would
		// need to implement this in the GameStateService
		res.json([]);
	} catch (error) {
		console.error('Get active games error:', error);
		res.status(400).json({ error: error.message });
	}
});

// Analytics API endpoints
app.post('/api/analytics/session', async (req, res) => {
	try {
		const { userId, sessionType, gameId, deviceInfo } = req.body;
		
		// Parse user agent if not provided
		let deviceData = deviceInfo;
		if (!deviceData && req.headers['user-agent']) {
			deviceData = services.analytics.parseUserAgent(req.headers['user-agent']);
		}
		
		const session = await services.analytics.createSession({
			userId,
			sessionType,
			gameId,
			deviceInfo: deviceData
		});
		
		res.status(201).json({ sessionId: session.sessionId });
	} catch (error) {
		console.error('Error creating analytics session:', error);
		res.status(500).json({ error: 'Failed to create analytics session' });
	}
});

app.put('/api/analytics/session/:sessionId', async (req, res) => {
	try {
		const { sessionId } = req.params;
		const metrics = req.body;
		
		const session = await services.analytics.updateSessionMetrics(sessionId, metrics);
		
		res.status(200).json({ success: true });
	} catch (error) {
		console.error('Error updating analytics session:', error);
		res.status(500).json({ error: 'Failed to update analytics session' });
	}
});

app.put('/api/analytics/session/:sessionId/end', async (req, res) => {
	try {
		const { sessionId } = req.params;
		const finalMetrics = req.body;
		
		const session = await services.analytics.endSession(sessionId, finalMetrics);
		
		res.status(200).json({ success: true, duration: session.duration });
	} catch (error) {
		console.error('Error ending analytics session:', error);
		res.status(500).json({ error: 'Failed to end analytics session' });
	}
});

app.post('/api/analytics/error', async (req, res) => {
	try {
		const { sessionId, errorType, message, context } = req.body;
		
		await services.analytics.logError(sessionId, errorType, message, context);
		
		res.status(200).json({ success: true });
	} catch (error) {
		console.error('Error logging analytics error:', error);
		res.status(500).json({ error: 'Failed to log analytics error' });
	}
});

// Admin-only analytics endpoints (protected by authentication)
app.get('/api/admin/analytics/metrics', authenticateAdmin, async (req, res) => {
	try {
		const { startDate, endDate, groupBy } = req.query;
		
		const metrics = await services.analytics.getAggregateMetrics(
			new Date(startDate || Date.now() - 30 * 24 * 60 * 60 * 1000),
			new Date(endDate || Date.now()),
			groupBy || 'day'
		);
		
		res.status(200).json(metrics);
	} catch (error) {
		console.error('Error getting analytics metrics:', error);
		res.status(500).json({ error: 'Failed to get analytics metrics' });
	}
});

app.get('/api/admin/analytics/top-features', authenticateAdmin, async (req, res) => {
	try {
		const { startDate, endDate, limit } = req.query;
		
		const features = await services.analytics.getTopFeatures(
			new Date(startDate || Date.now() - 30 * 24 * 60 * 60 * 1000),
			new Date(endDate || Date.now()),
			parseInt(limit) || 10
		);
		
		res.status(200).json(features);
	} catch (error) {
		console.error('Error getting top features:', error);
		res.status(500).json({ error: 'Failed to get top features' });
	}
});

app.get('/api/admin/analytics/retention', authenticateAdmin, async (req, res) => {
	try {
		const { startDate, endDate } = req.query;
		
		const retention = await services.analytics.getUserRetention(
			new Date(startDate || Date.now() - 90 * 24 * 60 * 60 * 1000),
			new Date(endDate || Date.now())
		);
		
		res.status(200).json(retention);
	} catch (error) {
		console.error('Error getting user retention:', error);
		res.status(500).json({ error: 'Failed to get user retention' });
	}
});

// Authentication middleware for admin endpoints
function authenticateAdmin(req, res, next) {
	const token = req.headers.authorization?.split(' ')[1];
	
	if (!token) {
		return res.status(401).json({ error: 'Authentication required' });
	}
	
	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET || 'chesstris-secret-key');
		
		// Check if user has admin role
		if (!decoded.roles || !decoded.roles.includes('admin')) {
			return res.status(403).json({ error: 'Admin access required' });
		}
		
		req.user = decoded;
		next();
	} catch (error) {
		return res.status(401).json({ error: 'Invalid token' });
	}
}

/**
 * Moves a chess piece on the board
 * @param {string} playerId - The ID of the player making the move
 * @param {number} fromX - The starting X coordinate
 * @param {number} fromY - The starting Y coordinate
 * @param {number} toX - The destination X coordinate
 * @param {number} toY - The destination Y coordinate
 * @returns {boolean} - Whether the move was successful
 */
function moveChessPiece(playerId, fromX, fromY, toX, toY) {
	// Check if the player is paused
	if (isPlayerPaused(playerId)) {
		return false; // Paused players can't move
	}
	
	// Check if the source cell contains a piece owned by the player
	if (!board[fromY] || !board[fromY][fromX] || !board[fromY][fromX].piece || 
		board[fromY][fromX].playerId !== playerId) {
		return false;
	}
	
	// Get the piece and check if the move is valid
	const piece = board[fromY][fromX].piece;
	if (!isValidChessMove(piece.type, fromX, fromY, toX, toY, playerId)) {
		return false;
	}
	
	// Check if destination has a piece (capture)
	let capturedPiece = null;
	let capturedPlayerId = null;
	if (board[toY][toX].piece) {
		// Cannot capture your own pieces
		if (board[toY][toX].playerId === playerId) {
			return false;
		}
		
		// Cannot capture pieces of paused players
		capturedPlayerId = board[toY][toX].playerId;
		if (isPlayerPaused(capturedPlayerId)) {
			return false;
		}
		
		capturedPiece = {
			type: board[toY][toX].piece.type,
			playerId: capturedPlayerId
		};
		
		// If a king is captured, transfer ownership of all remaining pieces
		if (capturedPiece.type === 'king') {
			transferOwnership(capturedPlayerId, playerId);
			
			// Award 50% of the fees to the victor
			awardCaptureFees(capturedPlayerId, playerId);
		}
	}
	
	// Move the piece
	board[toY][toX].piece = { ...piece };
	board[fromY][fromX].piece = null;
	
	// For pawns, track their movement distance
	if (piece.type === 'pawn') {
		// Initialize moveCount if it doesn't exist
		if (!piece.moveCount) {
			piece.moveCount = 0;
		}
		
		// Determine forward direction based on player's home zone
		const homeZone = homeZones[playerId];
		const forwardDirection = homeZone.y === 0 ? 1 : -1; // Down if starting at top, up if starting at bottom
		
		// Check if the move was forward
		if ((forwardDirection === 1 && toY > fromY) || (forwardDirection === -1 && toY < fromY)) {
			const moveDistance = Math.abs(toY - fromY);
			board[toY][toX].piece.moveCount = (piece.moveCount || 0) + moveDistance;
			
			// Promote pawn to knight after 8 spaces forward
			if (board[toY][toX].piece.moveCount >= 8) {
				board[toY][toX].piece.type = 'knight';
				board[toY][toX].piece.promoted = true;
				
				// Notify players of the promotion
				io.emit('promotion', {
					x: toX,
					y: toY,
					playerId: playerId,
					fromType: 'pawn',
					toType: 'knight'
				});
			}
		}
	}
	
	// Update the board and notify clients
	io.emit('boardUpdate', {
		board,
		homeZones
	});
	
	// If a piece was captured, notify all clients
	if (capturedPiece) {
		io.emit('pieceCaptured', {
			x: toX,
			y: toY,
			capturedType: capturedPiece.type,
			capturedPlayerId: capturedPiece.playerId,
			capturingPlayerId: playerId
		});
	}
	
	// Use energy for the move
	const updatedEnergy = useEnergy(playerId, piece.type);
	
	return {
		success: true,
		piece,
		fromX,
		fromY,
		toX,
		toY,
		energy: updatedEnergy
	};
}

/**
 * Transfers ownership of all pieces from one player to another
 * @param {string} fromPlayerId - The ID of the player losing the pieces
 * @param {string} toPlayerId - The ID of the player gaining the pieces
 */
function transferOwnership(fromPlayerId, toPlayerId) {
	// Go through the board and transfer all pieces
	for (let y = 0; y < board.length; y++) {
		for (let x = 0; x < board[y].length; x++) {
			if (board[y][x].piece && board[y][x].playerId === fromPlayerId) {
				board[y][x].playerId = toPlayerId;
				
				// Change the color to show new ownership
				board[y][x].color = getPlayerColor(toPlayerId);
			}
		}
	}
	
	// Notify all clients of the ownership transfer
	io.emit('ownershipTransferred', {
		fromPlayerId,
		toPlayerId
	});
}

/**
 * Awards 50% of the fees paid by the defeated player to the victor
 * @param {string} defeatedPlayerId - The ID of the defeated player
 * @param {string} victorPlayerId - The ID of the victorious player
 */
async function awardCaptureFees(defeatedPlayerId, victorPlayerId) {
	// Calculate the fees to award (50% of what the defeated player paid)
	const totalFeesPaid = getPlayerFeesPaid(defeatedPlayerId);
	const feesToAward = totalFeesPaid * 0.5; // 50% of fees
	
	if (feesToAward <= 0) {
		console.log(`No fees to award for defeating player ${defeatedPlayerId}`);
		return;
	}
	
	// In a real implementation, this would involve Solana transactions
	// For now, we'll just log the event and notify clients
	console.log(`Player ${victorPlayerId} has been awarded ${feesToAward} SOL (50% of the ${totalFeesPaid} SOL paid by ${defeatedPlayerId})`);
	
	// Notify all clients of the fee award
	io.emit('feesAwarded', {
		defeatedPlayerId,
		victorPlayerId,
		amount: feesToAward
	});
	
	// Record that these fees have been distributed
	// This prevents double-awarding if the same player is defeated again
	playerPurchases[defeatedPlayerId] = 0;
}

/**
 * Handles a player's request to move a chess piece
 * @param {string} playerId - The ID of the player making the move
 * @param {Object} moveData - The move data (from and to coordinates)
 * @returns {boolean} - Whether the move was successful
 */
function handlePlayerMove(playerId, moveData) {
	// Check if the player is on cooldown
	if (isPlayerOnCooldown(playerId)) {
		return false;
	}
	
	// Attempt to move the piece
	const success = moveChessPiece(
		playerId,
		moveData.fromX,
		moveData.fromY,
		moveData.toX,
		moveData.toY
	);
	
	// If the move was successful, set the player's cooldown
	if (success) {
		setPlayerCooldown(playerId);
	}
	
	return success;
}

/**
 * Checks if a player is currently on cooldown
 * @param {string} playerId - The ID of the player
 * @returns {boolean} - Whether the player is on cooldown
 */
function isPlayerOnCooldown(playerId) {
	if (!playerTurns[playerId]) {
		return false;
	}
	
	const now = Date.now();
	const cooldownTime = DIFFICULTY_LEVELS[gameDifficulty] || TURN_COOLDOWN;
	
	return (now - playerTurns[playerId].lastMoveTime) < cooldownTime;
}

/**
 * Sets a player's cooldown after a move
 * @param {string} playerId - The ID of the player
 */
function setPlayerCooldown(playerId) {
	if (!playerTurns[playerId]) {
		playerTurns[playerId] = {
			lastMoveTime: Date.now(),
			pieceDropped: false,
			chessMoved: true
		};
	} else {
		playerTurns[playerId].lastMoveTime = Date.now();
		playerTurns[playerId].chessMoved = true;
	}
}

/**
 * Handles a player's request to place a tetris piece
 * @param {string} playerId - The ID of the player
 * @param {Object} pieceData - The piece placement data
 * @returns {boolean} - Whether the placement was successful
 */
function handlePiecePlacement(playerId, pieceData) {
	// Check if the player is on cooldown
	if (isPlayerOnCooldown(playerId)) {
		return false;
	}
	
	// Set the falling piece according to player's data
	fallingPiece = {
		blocks: pieceData.blocks,
		color: getPlayerColor(playerId),
		playerId: playerId
	};
	
	// Attempt to lock the piece
	lockFallingPiece();
	
	// Set the player's cooldown and mark that they've placed a piece
	if (!playerTurns[playerId]) {
		playerTurns[playerId] = {
			lastMoveTime: Date.now(),
			pieceDropped: true,
			chessMoved: false
		};
	} else {
		playerTurns[playerId].lastMoveTime = Date.now();
		playerTurns[playerId].pieceDropped = true;
	}
	
	return true;
}

/**
 * Sets the game difficulty level
 * @param {string} difficulty - The difficulty level (easy, normal, hard)
 */
function setGameDifficulty(difficulty) {
	if (DIFFICULTY_LEVELS[difficulty]) {
		gameDifficulty = difficulty;
		io.emit('difficultyChanged', { difficulty });
	}
}

/**
 * Gets the remaining cooldown time for a player
 * @param {string} playerId - The ID of the player
 * @returns {number} - The remaining cooldown time in milliseconds
 */
function getCooldownRemaining(playerId) {
	if (!playerTurns[playerId]) {
		return 0;
	}
	
	const now = Date.now();
	const cooldownTime = DIFFICULTY_LEVELS[gameDifficulty] || TURN_COOLDOWN;
	const timeSinceLastMove = now - playerTurns[playerId].lastMoveTime;
	
	if (timeSinceLastMove >= cooldownTime) {
		return 0;
	}
	
	return cooldownTime - timeSinceLastMove;
}

/**
 * Handles a player's request to purchase a new chess piece
 * @param {string} playerId - The ID of the player making the purchase
 * @param {string} pieceType - The type of piece to purchase
 * @param {number} x - The x coordinate to place the piece
 * @param {number} y - The y coordinate to place the piece
 * @returns {Promise<Object>} - The result of the purchase attempt
 */
async function handlePiecePurchase(playerId, pieceType, x, y) {
	// Validate piece type
	if (!PIECE_PRICES[pieceType]) {
		return { 
			success: false, 
			error: 'Invalid piece type. Kings cannot be purchased.' 
		};
	}
	
	// Check if the placement coordinates are valid
	if (!board[y] || !board[y][x] || !board[y][x].color || board[y][x].piece) {
		return { 
			success: false, 
			error: 'Invalid placement location. Pieces must be placed on valid, unoccupied board cells.' 
		};
	}
	
	// Check if the cell belongs to the player (has a path to their king)
	if (!hasPathToKing(x, y, findKingPosition(playerId).x, findKingPosition(playerId).y, playerId)) {
		return { 
			success: false, 
			error: 'Pieces can only be placed on cells that have a path to your king.' 
		};
	}
	
	// In a real implementation, we would verify the Solana transaction here
	// For now, we'll simulate a successful purchase
	try {
		const price = PIECE_PRICES[pieceType];
		
		// Record the purchase for later fee distribution
		if (!playerPurchases[playerId]) {
			playerPurchases[playerId] = 0;
		}
		playerPurchases[playerId] += price;
		
		// Place the piece on the board
		board[y][x].piece = {
			type: pieceType,
			purchased: true
		};
		board[y][x].playerId = playerId;
		
		// Notify all clients of the purchase
		io.emit('piecePurchased', {
			playerId,
			pieceType,
			x,
			y,
			price
		});
		
		return {
			success: true,
			pieceType,
			x,
			y,
			price
		};
	} catch (error) {
		console.error('Purchase error:', error);
		return {
			success: false,
			error: 'Transaction failed. Please try again.'
		};
	}
}

/**
 * Gets the total fees paid by a player for purchased pieces
 * @param {string} playerId - The ID of the player
 * @returns {number} - The total fees paid in SOL
 */
function getPlayerFeesPaid(playerId) {
	return playerPurchases[playerId] || 0;
}

/**
 * Validates a Solana transaction for purchasing a chess piece
 * @param {string} signature - The transaction signature
 * @param {number} expectedAmount - The expected amount in SOL
 * @returns {Promise<boolean>} - Whether the transaction is valid
 */

/**
 * Identifies all islands (connected components) on the board
 * @returns {Array<Array<{x: number, y: number}>>} - List of islands, each containing a list of cell coordinates
 */
function identifyIslands() {
	const islands = [];
	const visited = new Set();
	
	// Perform a breadth-first search to find connected components
	for (let y = 0; y < board.length; y++) {
		for (let x = 0; x < board[y].length; x++) {
			const cellKey = `${x},${y}`;
			
			// Skip if already visited or if cell is empty
			if (visited.has(cellKey) || !board[y][x] || !board[y][x].color) {
				continue;
			}
			
			// Found a new unvisited filled cell, start a new island
			const island = [];
			const queue = [{ x, y }];
			visited.add(cellKey);
			
			// Explore the entire connected component
			while (queue.length > 0) {
				const cell = queue.shift();
				island.push(cell);
				
				// Check adjacent cells
				const adjacentCells = [
					{ x: cell.x + 1, y: cell.y },
					{ x: cell.x - 1, y: cell.y },
					{ x: cell.x, y: cell.y + 1 },
					{ x: cell.x, y: cell.y - 1 }
				];
				
				for (const adj of adjacentCells) {
					const adjKey = `${adj.x},${adj.y}`;
					
					// Skip if out of bounds, already visited, or empty
					if (adj.x < 0 || adj.x >= board[0].length || adj.y < 0 || adj.y >= board.length ||
						visited.has(adjKey) || !board[adj.y][adj.x] || !board[adj.y][adj.x].color) {
						continue;
					}
					
					queue.push(adj);
					visited.add(adjKey);
				}
			}
			
			islands.push(island);
		}
	}
	
	return islands;
}

/**
 * Finds the island that contains a player's king
 * @param {Array<Array<{x: number, y: number}>>} islands - List of islands
 * @param {Object} kingPosition - The king's position {x, y}
 * @returns {number|null} - The index of the player's island, or null if not found
 */
function findPlayerIsland(islands, kingPosition) {
	for (let i = 0; i < islands.length; i++) {
		for (const cell of islands[i]) {
			if (cell.x === kingPosition.x && cell.y === kingPosition.y) {
				return i;
			}
		}
	}
	return null;
}

/**
 * Finds pieces belonging to a player that are not on their main island
 * @param {string} playerId - The ID of the player
 * @param {Array<Array<{x: number, y: number}>>} islands - List of islands
 * @param {number} playerIslandId - The index of the player's island
 * @returns {Array<{x: number, y: number, piece: Object}>} - List of orphaned pieces
 */
function findOrphanedPieces(playerId, islands, playerIslandId) {
	const orphanedPieces = [];
	
	// Check all islands except the player's main island
	for (let i = 0; i < islands.length; i++) {
		if (i === playerIslandId) continue;
		
		for (const cell of islands[i]) {
			// Check if this cell has a piece belonging to the player
			if (board[cell.y][cell.x] && board[cell.y][cell.x].piece && 
				board[cell.y][cell.x].playerId === playerId) {
				
				orphanedPieces.push({
					x: cell.x,
					y: cell.y,
					piece: { ...board[cell.y][cell.x].piece }
				});
				
				// Remove the piece from its current position
				board[cell.y][cell.x].piece = null;
			}
		}
	}
	
	return orphanedPieces;
}

/**
 * Removes a player's island from the board
 * @param {string} playerId - The ID of the player
 * @param {Array<{x: number, y: number}>} island - The island to remove
 */
function removePlayerIsland(playerId, island) {
	// First, determine ownership of shared cells by proximity to kings
	const kingPositions = {};
	const playerIds = new Set();
	
	// Find all kings on the board
	for (let y = 0; y < board.length; y++) {
		for (let x = 0; x < board[y].length; x++) {
			if (board[y][x] && board[y][x].piece && board[y][x].piece.type === 'king') {
				const cellPlayerId = board[y][x].playerId;
				kingPositions[cellPlayerId] = { x, y };
				playerIds.add(cellPlayerId);
			}
		}
	}
	
	// For each cell in the island, determine if it should be removed or reassigned
	for (const cell of island) {
		const { x, y } = cell;
		
		// Skip if cell is already empty
		if (!board[y][x] || !board[y][x].color) {
			continue;
		}
		
		// If cell belongs to another player, determine ownership
		if (board[y][x].playerId !== playerId) {
			let minDistance = Infinity;
			let nearestPlayerId = null;
			
			// Find the nearest king
			for (const pid of playerIds) {
				if (pid === playerId) continue; // Skip the paused player
				
				const king = kingPositions[pid];
				const distance = Math.sqrt(
					Math.pow(x - king.x, 2) + Math.pow(y - king.y, 2)
				);
				
				if (distance < minDistance) {
					minDistance = distance;
					nearestPlayerId = pid;
				}
			}
			
			// Reassign the cell to the nearest player, or make it no-man's land
			if (nearestPlayerId) {
				board[y][x].playerId = nearestPlayerId;
				board[y][x].color = getPlayerColor(nearestPlayerId);
			} else {
				// No other kings, make it no-man's land (grey)
				board[y][x].playerId = null;
				board[y][x].color = 'grey';
			}
		} else {
			// Cell belongs to the paused player, remove it
			board[y][x] = null;
		}
	}
}

/**
 * Relocates orphaned pieces back to the player's home zone
 * @param {string} playerId - The ID of the player
 * @param {Array<{x: number, y: number, piece: Object}>} orphanedPieces - The pieces to relocate
 */
function relocateOrphanedPiecesToHome(playerId, orphanedPieces) {
	if (orphanedPieces.length === 0) return;
	
	// Get the player's home zone
	const homeZone = homeZones[playerId];
	if (!homeZone) return;
	
	// Find all available spots in the home zone
	const availableSpots = [];
	for (let y = homeZone.y; y < homeZone.y + homeZone.height; y++) {
		for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
			// Check if this spot is empty or doesn't have a piece
			if (!board[y][x] || !board[y][x].piece) {
				// Create a cell if it doesn't exist
				if (!board[y][x]) {
					board[y][x] = {
						color: getPlayerColor(playerId),
						playerId
					};
				}
				
				availableSpots.push({ x, y });
			}
		}
	}
	
	// If we don't have enough spots, expand the home zone
	if (availableSpots.length < orphanedPieces.length) {
		// Find the direction to expand (depend on where the home zone is)
		const expandDirection = homeZone.y === 0 ? 1 : -1; // Down if at top, up if at bottom
		
		// Number of extra spots needed
		const extraSpotsNeeded = orphanedPieces.length - availableSpots.length;
		
		// Calculate how many rows we need to expand
		const extraRowsNeeded = Math.ceil(extraSpotsNeeded / homeZone.width);
		
		// Expand the home zone
		for (let row = 1; row <= extraRowsNeeded; row++) {
			const y = expandDirection > 0 ? 
				homeZone.y + homeZone.height + row - 1 : 
				homeZone.y - row;
			
			// Make sure we're within board bounds
			if (y < 0 || y >= board.length) continue;
			
			for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
				// Create a cell for the new home zone spot
				board[y][x] = {
					color: getPlayerColor(playerId),
					playerId
				};
				
				availableSpots.push({ x, y });
				
				// Stop once we have enough spots
				if (availableSpots.length >= orphanedPieces.length) break;
			}
			
			if (availableSpots.length >= orphanedPieces.length) break;
		}
		
		// Update the home zone dimensions in homeZones object
		if (expandDirection > 0) {
			homeZone.height += extraRowsNeeded;
		} else {
			homeZone.y -= extraRowsNeeded;
			homeZone.height += extraRowsNeeded;
		}
	}
	
	// Place the orphaned pieces in the available spots
	for (let i = 0; i < Math.min(orphanedPieces.length, availableSpots.length); i++) {
		const piece = orphanedPieces[i];
		const spot = availableSpots[i];
		
		// Place the piece in its new home
		board[spot.y][spot.x].piece = piece.piece;
		
		// Notify clients about the piece relocation
		io.emit('pieceRelocated', {
			fromX: piece.x,
			fromY: piece.y,
			toX: spot.x,
			toY: spot.y,
			piece: piece.piece,
			playerId
		});
	}
	
	// If we couldn't relocate all pieces, they are lost
	for (let i = availableSpots.length; i < orphanedPieces.length; i++) {
		const piece = orphanedPieces[i];
		
		// Notify clients about the lost piece
		io.emit('pieceLost', {
			x: piece.x,
			y: piece.y,
			piece: piece.piece,
			playerId
		});
	}
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/advertisers', advertiserRoutes);

// Apply rate limiting to sensitive routes
app.use('/api/users/login', rateLimiter({ maxRequests: 10, timeWindow: 60 })); // 10 requests per minute
app.use('/api/users/register', rateLimiter({ maxRequests: 5, timeWindow: 60 })); // 5 requests per minute
app.use('/api/admin', rateLimiter({ maxRequests: 30, timeWindow: 60 })); // 30 requests per minute
app.use('/api/games', rateLimiter({ maxRequests: 50, timeWindow: 60 })); // 50 requests per minute

// Use a more permissive rate limiter for all other routes
app.use(rateLimiter({ maxRequests: 200, timeWindow: 60 })); // 200 requests per minute

// Add cookie parser middleware
app.use(cookieParser());

// Add CSRF protection
app.use(csrfProtection);

// Start the server
const PORT = process.env.PORT || 3020;

// Enhanced check for direct execution vs. import
// In production, we always want to start the server unless explicitly told not to
const shouldStartServer = process.env.NODE_ENV === 'production' || 
                         !process.env.TESTING || 
                         import.meta.url === `file://${process.argv[1]}`;

if (shouldStartServer) {
	server.listen(PORT, async () => {
		try {
			// Initialize database services
			await initServices();
			
			console.log(`Server running on port ${PORT}`);
		} catch (error) {
			console.error('Failed to start server:', error);
			process.exit(1);
		}
	});
} else {
	console.log('Server module imported, not starting automatically');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
	console.log('Shutting down server via SIGINT...');
	try {
		// Close database connections
		await closeConnections();
		// Close HTTP server
		server.close(() => {
			console.log('HTTP server closed');
			// Exit process with success code
			process.exit(0);
		});
	} catch (error) {
		console.error('Error during shutdown:', error);
		process.exit(1);
	}
});

// Handle graceful shutdown for SIGTERM (used by process managers like PM2)
process.on('SIGTERM', async () => {
	console.log('Shutting down server via SIGTERM...');
	try {
		// Close database connections
		await closeConnections();
		// Close HTTP server
		server.close(() => {
			console.log('HTTP server closed');
			// Exit process with success code
			process.exit(0);
		});
	} catch (error) {
		console.error('Error during shutdown:', error);
		process.exit(1);
	}
});

// Shutdown function for tests
export async function shutdownServer() {
	console.log('Shutting down main server...');
	
	// Close Socket.IO connections first
	if (io) {
		try {
			io.close();
			console.log('Socket.IO connections closed');
		} catch (error) {
			console.error('Error closing Socket.IO:', error);
		}
	}
	
	// Check if the server is running before attempting to close it
	if (server) {
		try {
			// Check if server is listening
			const address = server.address();
			if (address) {
				server.close((err) => {
					if (err) {
						console.error('Error closing main server:', err);
					} else {
						console.log('Main server shutdown complete');
					}
				});
			} else {
				console.log('Main server not running, skipping close');
			}
		} catch (error) {
			console.error('Error during main server shutdown:', error);
		}
	} else {
		console.log('No main server instance to close');
	}
}

// Export for testing
export { app, server, io };

/**
 * Checks for available updates
 * @returns {Promise<boolean>} True if update is available
 */
async function checkForUpdates() {
	try {
		// In a real implementation, this would call an API endpoint
		// Here we'll simulate it
		console.log('Checking for updates...');
		
		VERSION.lastChecked = new Date();
		
		// Simulate an update check - in production this would call your update server
		const mockResponse = {
			latestVersion: '1.0.1',
			updateUrl: 'https://example.com/update',
			releaseNotes: 'Bug fixes and performance improvements',
			critical: false
		};
		
		if (mockResponse.latestVersion !== VERSION.current) {
			VERSION.updateAvailable = true;
			VERSION.updateInfo = mockResponse;
			
			// Notify all connected clients
			io.emit('updateAvailable', {
				version: mockResponse.latestVersion,
				updateUrl: mockResponse.updateUrl,
				releaseNotes: mockResponse.releaseNotes,
				critical: mockResponse.critical
			});
			
			return true;
		}
		
		VERSION.updateAvailable = false;
		return false;
	} catch (error) {
		console.error('Error checking for updates:', error);
		return false;
	}
}

/**
 * Starts a periodic update check
 */
function startUpdateChecker() {
	// Initial check
	checkForUpdates();
	
	// Set up periodic checks
	setInterval(checkForUpdates, VERSION.checkInterval);
}

/**
 * Prepares the server for a graceful update
 * @returns {Promise<void>}
 */
async function prepareForUpdate() {
	try {
		console.log('Preparing for update...');
		
		// 1. Notify all clients about imminent update
		io.emit('updateImminent', {
			message: 'The server will update in 5 minutes. Please finish your current games.',
			timeRemaining: 5 * 60 // 5 minutes in seconds
		});
		
		// 2. Stop accepting new games
		global.acceptingNewGames = false;
		
		// 3. Wait for active games to complete or time out
		setTimeout(async () => {
			console.log('Applying update...');
			
			// Save all game states
			await backupActiveGames();
			
			// Disconnect all clients with a message
			io.emit('serverRestarting', {
				message: 'Server is restarting for an update. Please reconnect in a few moments.',
				estimatedDowntime: '60 seconds'
			});
			
			// Close all connections
			await closeConnections();
			
			// In a production environment, this would signal the process manager 
			// (e.g., PM2) to restart the server
			console.log('Server ready for update');
		}, 5 * 60 * 1000); // 5 minutes
		
	} catch (error) {
		console.error('Error preparing for update:', error);
	}
}

/**
 * Backs up all active games before an update
 * @returns {Promise<void>}
 */
async function backupActiveGames() {
	try {
		// Get all active games
		const activeGames = Object.keys(games);
		
		for (const gameId of activeGames) {
			// Save game state to database
			await gameStateService.updateGameState(
				gameId, 
				games[gameId], 
				{ updateReason: 'server_update' }
			);
			
			console.log(`Backed up game ${gameId}`);
		}
		
		console.log(`Backed up ${activeGames.length} active games`);
	} catch (error) {
		console.error('Error backing up games:', error);
	}
}

// Add version check endpoint
app.get('/api/version', (req, res) => {
	res.json({
		version: VERSION.current,
		updateAvailable: VERSION.updateAvailable,
		updateInfo: VERSION.updateInfo,
		lastChecked: VERSION.lastChecked
	});
});

// Add route to trigger an update (protected with admin key)
app.post('/api/triggerUpdate', authenticateAdmin, async (req, res) => {
	try {
		await prepareForUpdate();
		res.json({ success: true, message: 'Update process initiated' });
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

// When the server starts, begin checking for updates
if (process.env.NODE_ENV === 'production') {
	startUpdateChecker();
} 

// Import player control functions from the dedicated module
import {
	getPlayer,
	getPauseCooldownRemaining,
	isPlayerOnPauseCooldown,
	setPauseCooldown,
	handlePlayerPause,
	handlePlayerResume,
	isPlayerPaused,
	checkPausedPlayers
} from './src/playerControls.mjs';


