// legacy-server.js - Express server for older API endpoints
// This file uses CommonJS module syntax (require) rather than ES modules (import/export)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Get port from environment variable or use default
const PORT = process.env.PORT || 3020;

// Serve static files from the public folder.
app.use(express.static('public'));

// Export server for tests
module.exports = { app, server, io };

/**
 * Shutdown server and close all connections
 * @returns {Promise<void>}
 */
function shutdownServer() {
	return new Promise((resolve, reject) => {
		console.log('Shutting down server...');
		
		// Close Socket.IO connections first
		if (io) {
			try {
				io.close();
				console.log('Socket.IO connections closed');
			} catch (error) {
				console.error('Error closing Socket.IO:', error);
			}
		}
		
		// Close HTTP server if it exists and is running
		if (server) {
			try {
				// Check if the server is actually running before trying to close it
				const address = server.address();
				if (address) {
					server.close((err) => {
						if (err) {
							console.error('Error closing server:', err);
							// Resolve anyway to continue shutdown process
							resolve();
						} else {
							console.log('Server shutdown complete');
							resolve();
						}
					});
				} else {
					console.log('Server not running, skipping server.close()');
					resolve();
				}
			} catch (error) {
				console.error('Error during server shutdown:', error);
				// Resolve anyway to continue the shutdown process
				resolve();
			}
		} else {
			console.log('No server instance found to shutdown');
			resolve();
		}
	});
}

// Export shutdown function
module.exports.shutdownServer = shutdownServer;

// Only start the server if this file is run directly
if (require.main === module) {
	server.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`);
	});
}

// ----- Board Setup -----
// We start with a board that can expand horizontally as new players join.
let BOARD_WIDTH = 48;
const BOARD_HEIGHT = 20;

// Board is a 2D array (row 0 is the bottom). Each cell holds 0 (empty) or a colour (number).
let board = [];
for (let y = 0; y < BOARD_HEIGHT; y++) {
	board[y] = new Array(BOARD_WIDTH).fill(0);
}

// ----- Home Zones -----
// Each player gets a home zone – an 8x2 area along the bottom (rows 0 and 1).
// We store them in a map: playerId -> { x, y, width, height }.
// For simplicity, zones are assigned sequentially along the X-axis.
let homeZones = {};
let nextHomeZoneX = 0; // The next available x-coordinate for a new home zone.

function expandBoardIfNeeded(requiredWidth) {
	if (requiredWidth > BOARD_WIDTH) {
		// Expand each row to the new width.
		for (let y = 0; y < BOARD_HEIGHT; y++) {
			while (board[y].length < requiredWidth) {
				board[y].push(0);
			}
		}
		BOARD_WIDTH = requiredWidth;
	}
}

function addPlayerHomeZone(playerId) {
	// Assign a zone at the next available x.
	const zoneWidth = 8;
	const zoneHeight = 2;
	const zone = { x: nextHomeZoneX, y: 0, width: zoneWidth, height: zoneHeight };
	homeZones[playerId] = zone;
	expandBoardIfNeeded(nextHomeZoneX + zoneWidth);
	// Pre-fill the zone with a colour to indicate the player's starting chess pieces.
	// For variety, use blue for player 1, red for player 2, etc.
	// Here we simply generate a colour from the player's id hash.
	const col = parseInt(playerId.slice(-4), 16) || 0x00ff00;
	for (let y = zone.y; y < zone.y + zone.height; y++) {
		for (let x = zone.x; x < zone.x + zone.width; x++) {
			board[y][x] = col;
		}
	}
	nextHomeZoneX += zoneWidth + 2; // leave a gap between zones.
	return zone;
}

// A helper to check whether a cell (x,y) belongs to any home zone that is "safe".
// A home zone is safe if at least one cell in its area is nonzero.
function isCellInSafeHomeZone(x, y) {
	for (let pid in homeZones) {
		const zone = homeZones[pid];
		if (x >= zone.x && x < zone.x + zone.width &&
			y >= zone.y && y < zone.y + zone.height) {
			// Check if at least one cell in this zone is nonzero.
			for (let j = zone.y; j < zone.y + zone.height; j++) {
				for (let i = zone.x; i < zone.x + zone.width; i++) {
					if (board[j][i] !== 0) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

// Periodically degrade home zones that are empty.
// Every 2 minutes, for each home zone that is completely empty, remove one column from its right side.
function degradeHomeZones() {
	for (let pid in homeZones) {
		const zone = homeZones[pid];
		let empty = true;
		for (let y = zone.y; y < zone.y + zone.height; y++) {
			for (let x = zone.x; x < zone.x + zone.width; x++) {
				if (board[y][x] !== 0) {
					empty = false;
					break;
				}
			}
			if (!empty) break;
		}
		if (empty && zone.width > 0) {
			zone.width -= 1;
			console.log(`Home zone for player ${pid} degraded to width ${zone.width}`);
		}
		// If width becomes 0, remove the home zone.
		if (zone.width <= 0) {
			delete homeZones[pid];
			console.log(`Home zone for player ${pid} removed due to degradation.`);
		}
	}
}

setInterval(degradeHomeZones, 2 * 60 * 1000); // every 2 minutes

// ----- Tetromino (Falling Piece) Setup -----
// Tetromino definitions – each defined by an array of block offsets in board cell units.
const tetrominoes = {
	I: {
		blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
		color: 0x00ffff
	},
	O: {
		blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
		color: 0xffff00
	},
	T: {
		blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
		color: 0x800080
	},
	S: {
		blocks: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
		color: 0x00ff00
	},
	Z: {
		blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
		color: 0xff0000
	},
	J: {
		blocks: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
		color: 0x0000ff
	},
	L: {
		blocks: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
		color: 0xffa500
	}
};

let fallingPiece = null;
const START_Z = 10;
const FALL_SPEED = 0.1; // units per tick

function spawnFallingPiece() {
	const keys = Object.keys(tetrominoes);
	const type = keys[Math.floor(Math.random() * keys.length)];
	const tetro = tetrominoes[type];
	// Determine horizontal bounds.
	let maxBlockX = Math.max(...tetro.blocks.map(b => b.x));
	// Ensure the piece fits in the current board.
	let spawnX = Math.floor(Math.random() * Math.max(BOARD_WIDTH - maxBlockX, 1));
	// For simplicity, spawn near the vertical middle.
	let spawnY = Math.floor(BOARD_HEIGHT / 2);
	fallingPiece = {
		type: type,
		blocks: tetro.blocks,
		color: tetro.color,
		x: spawnX,
		y: spawnY,
		z: START_Z
	};
}

// A helper: check if a board cell (x,y) has any adjacent (4-neighbour) filled cell.
function hasAdjacent(x, y) {
	const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
	for (let d of dirs) {
		let nx = x + d.dx;
		let ny = y + d.dy;
		if (nx >= 0 && nx < BOARD_WIDTH && ny >= 0 && ny < BOARD_HEIGHT) {
			if (board[ny][nx] !== 0) return true;
		}
	}
	return false;
}

// When a falling piece reaches the board (z <= 0), decide whether it sticks.
function lockFallingPiece() {
	for (let block of fallingPiece.blocks) {
		let cellX = fallingPiece.x + block.x;
		let cellY = fallingPiece.y + block.y;
		if (cellX >= 0 && cellX < BOARD_WIDTH && cellY >= 0 && cellY < BOARD_HEIGHT) {
			board[cellY][cellX] = fallingPiece.color;
		}
	}
	clearFullRows();
	fallingPiece = null;
}

// Clear full rows – but skip clearing cells that belong to a safe home zone.
function clearFullRows() {
	for (let y = 0; y < BOARD_HEIGHT; y++) {
		// A row is considered full if every cell is nonzero or in a safe home zone.
		let full = true;
		for (let x = 0; x < BOARD_WIDTH; x++) {
			if (board[y][x] === 0 && !isCellInSafeHomeZone(x, y)) {
				full = false;
				break;
			}
		}
		if (full) {
			// Clear only non-safe cells in the row.
			for (let x = 0; x < BOARD_WIDTH; x++) {
				if (!isCellInSafeHomeZone(x, y)) {
					board[y][x] = 0;
				}
			}
			// Shift down rows above y.
			for (let yy = y; yy < BOARD_HEIGHT - 1; yy++) {
				board[yy] = board[yy + 1].slice();
			}
			// Add a new empty row at the top.
			board[BOARD_HEIGHT - 1] = new Array(BOARD_WIDTH).fill(0);
			y--; // recheck this row
		}
	}
}

// ----- Game Loop -----
function gameLoop() {
	// Spawn a new falling piece if needed.
	if (fallingPiece === null) {
		spawnFallingPiece();
	} else {
		// Make the piece fall.
		fallingPiece.z -= FALL_SPEED;
		if (fallingPiece.z <= 0) {
			// Check if any block, at its board position, is adjacent to an existing cell.
			let shouldStick = false;
			for (let block of fallingPiece.blocks) {
				let cellX = fallingPiece.x + block.x;
				let cellY = fallingPiece.y + block.y;
				if (cellX >= 0 && cellX < BOARD_WIDTH && cellY >= 0 && cellY < BOARD_HEIGHT) {
					if (hasAdjacent(cellX, cellY)) {
						shouldStick = true;
						break;
					}
				}
			}
			if (shouldStick) {
				lockFallingPiece();
			} else if (fallingPiece.z < -1) {
				// Discard piece if it falls too far without sticking.
				fallingPiece = null;
			}
		}
	}
	// Broadcast the updated board state.
	io.emit('boardUpdate', { board, fallingPiece, BOARD_WIDTH, BOARD_HEIGHT, homeZones });
}

setInterval(gameLoop, 50);

// ----- Socket.IO: Player Connections -----
io.on('connection', (socket) => {
	console.log(`Client connected: ${socket.id}`);
	// Assign a home zone for this player.
	addPlayerHomeZone(socket.id);
	// Send the current board state.
	socket.emit('boardUpdate', { board, fallingPiece, BOARD_WIDTH, BOARD_HEIGHT, homeZones });
	// (For a real game you'd want additional events for player moves etc.)
});

// Player pause related functions
export const getPlayer = (playerId) => {
	// Implementation based on existing code
	return gameState?.players?.find(player => player.id === playerId);
};

export const getPauseCooldownRemaining = (playerId) => {
	// Implementation based on game logic
	const player = getPlayer(playerId);
	if (!player || !player.pauseCooldown) {
		return 0;
	}
	const now = Date.now();
	const remaining = Math.max(0, player.pauseCooldown - now);
	return remaining;
};

export const isPlayerOnPauseCooldown = (playerId) => {
	return getPauseCooldownRemaining(playerId) > 0;
};

export const setPauseCooldown = (playerId, duration) => {
	const player = getPlayer(playerId);
	if (player) {
		player.pauseCooldown = Date.now() + duration;
	}
};

export const handlePlayerPause = (playerId) => {
	const player = getPlayer(playerId);
	if (player && !isPlayerOnPauseCooldown(playerId)) {
		player.isPaused = true;
		// Set a cooldown period (e.g., 5 minutes = 300000 ms)
		setPauseCooldown(playerId, 300000);
		return true;
	}
	return false;
};

export const handlePlayerResume = (playerId) => {
	const player = getPlayer(playerId);
	if (player && player.isPaused) {
		player.isPaused = false;
		return true;
	}
	return false;
};

export const isPlayerPaused = (playerId) => {
	const player = getPlayer(playerId);
	return player ? !!player.isPaused : false;
};
