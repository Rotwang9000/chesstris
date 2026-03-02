/**
 * Shaktris Game Server
 * 
 * This server handles serving the game files and managing multiplayer functionality.
 */

// Import required modules
const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const { BOARD_SETTINGS, GAME_RULES, PLAYER_SETTINGS } = require('./server/game/Constants');
const fs = require('fs');
// Import API routes
const apiRoutes = require('./routes/api');
const advertiserRoutes = require('./routes/advertisers');

// Import game managers
const { GameManager } = require('./server/game');
const persistence = require('./server/persistence');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Define constants
const PORT = process.env.PORT || 3022; // Default port (override with PORT=xxxx)

// Create a single GameManager instance to use for all connections
const gameManager = new GameManager();

// Game state storage
const games = new Map();
const players = new Map();
const spectators = new Map(); // Map of spectator socket IDs to player IDs they're spectating
const computerPlayers = new Map(); // Map of computer player IDs to their game data

// --- Efficient state updates (sparse board deltas) ---
const boardDeltaCache = new Map(); // gameId -> Map("x,z" -> JSON string hash)
const MAX_BOARD_DELTA_CELLS = 800; // If too many cells change, fall back to full board update

function parseBoardKey(key) {
	const [xStr, zStr] = String(key).split(',');
	return { x: Number(xStr), z: Number(zStr) };
}

function computeSparseBoardDelta(gameId, board) {
	if (!board || !board.cells || typeof board.cells !== 'object') {
		return {
			fullUpdate: true,
			board,
			boardChanges: [],
			removedCells: [],
			boardBounds: null
		};
	}
	
	const prev = boardDeltaCache.get(gameId);
	const next = new Map();
	const boardChanges = [];
	const removedCells = [];
	
	// First ever update for this game: treat as full update, but seed cache
	if (!prev) {
		for (const [key, value] of Object.entries(board.cells)) {
			next.set(key, JSON.stringify(value));
		}
		boardDeltaCache.set(gameId, next);
		
		return {
			fullUpdate: true,
			board,
			boardChanges: [],
			removedCells: [],
			boardBounds: {
				minX: board.minX,
				maxX: board.maxX,
				minZ: board.minZ,
				maxZ: board.maxZ
			}
		};
	}
	
	for (const [key, value] of Object.entries(board.cells)) {
		const serialised = JSON.stringify(value);
		next.set(key, serialised);
		
		const prevSerialised = prev.get(key);
		if (prevSerialised !== serialised) {
			const { x, z } = parseBoardKey(key);
			boardChanges.push({ x, z, value });
		}
	}
	
	for (const key of prev.keys()) {
		if (!next.has(key)) {
			const { x, z } = parseBoardKey(key);
			removedCells.push({ x, z });
		}
	}
	
	// Update cache to the new state
	boardDeltaCache.set(gameId, next);
	
	const totalDelta = boardChanges.length + removedCells.length;
	const fullUpdate = totalDelta > MAX_BOARD_DELTA_CELLS;
	
	return {
		fullUpdate,
		board: fullUpdate ? board : null,
		boardChanges: fullUpdate ? [] : boardChanges,
		removedCells: fullUpdate ? [] : removedCells,
		boardBounds: {
			minX: board.minX,
			maxX: board.maxX,
			minZ: board.minZ,
			maxZ: board.maxZ
		}
	};
}

function buildPlayersList(game) {
	if (!game || !Array.isArray(game.players)) return [];
	return game.players.map(id => {
		const entry = players.get(id) || computerPlayers.get(id);
		return {
			id,
			name: entry ? entry.name : `Player_${String(id).substring(0, 5)}`,
			isComputer: computerPlayers.has(id),
		};
	});
}

function broadcastGameUpdate(gameId, game, forceFullUpdate = false) {
	if (!game) return;
	
	if (gameId === GLOBAL_GAME_ID) persistence.markDirty();
	
	const timestamp = Date.now();
	const state = game.state || {};
	const playersList = buildPlayersList(game);
	
	if (forceFullUpdate) {
		computeSparseBoardDelta(gameId, state.board);
		
		io.to(gameId).emit('game_update', {
			...state,
			players: playersList,
			boardBounds: state.board ? {
				minX: state.board.minX,
				maxX: state.board.maxX,
				minZ: state.board.minZ,
				maxZ: state.board.maxZ
			} : undefined,
			timestamp,
			fullUpdate: true
		});
		return;
	}
	
	const boardDelta = computeSparseBoardDelta(gameId, state.board);
	
	if (boardDelta.fullUpdate) {
		io.to(gameId).emit('game_update', {
			...state,
			players: playersList,
			boardBounds: state.board ? {
				minX: state.board.minX,
				maxX: state.board.maxX,
				minZ: state.board.minZ,
				maxZ: state.board.maxZ
			} : undefined,
			timestamp,
			fullUpdate: true
		});
		return;
	}
	
	io.to(gameId).emit('game_update', {
		timestamp,
		fullUpdate: false,
		boardChanges: boardDelta.boardChanges,
		removedCells: boardDelta.removedCells,
		boardBounds: boardDelta.boardBounds,
		chessPieces: state.chessPieces,
		lastAction: state.lastAction,
		players: playersList,
	});
}

// Default global game ID
const GLOBAL_GAME_ID = 'global_game';

// Computer player difficulty levels
const COMPUTER_DIFFICULTY = {
	EASY: 'easy',
	MEDIUM: 'medium',
	HARD: 'hard'
};

// Minimum time between computer player moves (in milliseconds)
const MIN_COMPUTER_MOVE_TIME = 10000; // 10 seconds minimum as per requirements
const HOME_ZONE_DEGRADATION_CHECK_MS = 30000;
const WORLD_INTEGRITY_CHECK_MS = 10000;
const ISLAND_DECAY_ANIMATION_MAX_CELLS = 160;
const homeZoneIdleSince = new Map();

/**
 * Get remaining cooldown time for an action.
 * @param {Object} player - Player object from the `players` map
 * @param {string} lastActionKey - Property name on player storing the last action timestamp
 * @param {number} cooldownMs - Cooldown in milliseconds
 * @returns {number} Remaining milliseconds (0 means not rate limited)
 */
function getCooldownRemainingMs(player, lastActionKey, cooldownMs) {
	if (!player) return 0;
	
	const now = Date.now();
	const last = Number(player[lastActionKey] || 0);
	if (!Number.isFinite(last) || last <= 0) return 0;
	
	const elapsed = now - last;
	const remaining = cooldownMs - elapsed;
	return remaining > 0 ? remaining : 0;
}

function getLatestPlayerActionAt(playerData) {
	if (!playerData || typeof playerData !== 'object') return 0;
	
	const candidates = [
		playerData.lastTetrominoPlacementAt,
		playerData.lastChessMoveAt,
		playerData.lastMoveTime,
		playerData.lastActionAt,
		playerData.lastMoveAt,
	];
	
	let latest = 0;
	for (const value of candidates) {
		const num = Number(value);
		if (Number.isFinite(num) && num > latest) {
			latest = num;
		}
	}
	
	return latest;
}

function convertHomeZoneToNormalCells(gameState, playerId, homeZone) {
	if (!gameState || !gameState.board || !gameState.board.cells || !homeZone) return 0;
	
	const width = homeZone.width || 8;
	const height = homeZone.height || 2;
	let convertedCount = 0;
	
	for (let z = homeZone.z; z < homeZone.z + height; z++) {
		for (let x = homeZone.x; x < homeZone.x + width; x++) {
			const key = `${x},${z}`;
			const cellContents = gameState.board.cells[key];
			if (!Array.isArray(cellContents) || cellContents.length === 0) continue;
			
			const hasPlayerHomeMarker = cellContents.some(
				item => item && item.type === 'home' && String(item.player) === String(playerId)
			);
			if (!hasPlayerHomeMarker) continue;
			
			const remaining = cellContents.filter(
				item => !(item && item.type === 'home' && String(item.player) === String(playerId))
			);
			
			const hasOwnedTerrain = remaining.some(item =>
				item &&
				String(item.player) === String(playerId) &&
				item.type !== 'home' &&
				item.type !== 'chess'
			);
			
			if (!hasOwnedTerrain) {
				remaining.push({
					type: 'tetromino',
					pieceType: 'home_converted',
					player: playerId,
					placedAt: Date.now(),
					fromHomeZone: true,
				});
			}
			
			gameState.board.cells[key] = remaining;
			convertedCount++;
		}
	}
	
	if (convertedCount > 0) {
		gameManager.boardManager.recalculateBoardBoundaries(gameState.board);
	}
	
	return convertedCount;
}

function processHomeZoneDegradation() {
	try {
		const now = Date.now();
		const degradationInterval = Number(BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL) > 0
			? Number(BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL)
			: 150000;
		
		for (const [gameId, game] of games.entries()) {
			if (!game || !game.state || !game.state.homeZones || !game.state.board) continue;
			
			let gameChanged = false;
			
			for (const [playerId, homeZone] of Object.entries(game.state.homeZones)) {
				if (!homeZone || homeZone.isDegraded) continue;
				
				const playerData = players.get(playerId) || computerPlayers.get(playerId) || null;
				const latestActionAt = getLatestPlayerActionAt(playerData);
				const idleKey = `${gameId}:${playerId}`;
				
				if (latestActionAt > 0) {
					homeZoneIdleSince.set(idleKey, latestActionAt);
				} else if (!homeZoneIdleSince.has(idleKey)) {
					homeZoneIdleSince.set(idleKey, now);
				}
				
				const idleSince = homeZoneIdleSince.get(idleKey) || now;
				if (now - idleSince < degradationInterval) continue;
				
				const convertedCount = convertHomeZoneToNormalCells(game.state, playerId, homeZone);
				homeZone.isDegraded = true;
				homeZone.degradedAt = now;
				homeZoneIdleSince.delete(idleKey);
				gameChanged = true;
				
				console.log(
					`[HomeZone] Degraded ${playerId} in ${gameId}; converted ${convertedCount} cells to normal terrain.`
				);
			}
			
			if (gameChanged) {
				persistence.markDirty();
				broadcastGameUpdate(gameId, game, true);
			}
		}
	} catch (error) {
		console.error('[HomeZone] Error during degradation tick:', error);
	}
}

function buildManagerGameObject(gameId, game) {
	return {
		id: gameId,
		board: game.state.board || { cells: {}, minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
		chessPieces: game.state.chessPieces || [],
		homeZones: game.state.homeZones || {},
		players: (Array.isArray(game.players) ? game.players : []).reduce((obj, id) => {
			const playerObj = players.get(id) || computerPlayers.get(id) || {};
			const homeZoneFromState = (game.state && game.state.homeZones && game.state.homeZones[id])
				? game.state.homeZones[id]
				: null;
			obj[id] = {
				id,
				name: playerObj.name || `Player_${String(id).substring(0, 5)}`,
				homeZone: homeZoneFromState || playerObj.homeZone || null,
				lastTetrominoPlacement: playerObj.lastTetrominoPlacement || null,
			};
			return obj;
		}, {})
	};
}

function buildValidPlayerIdSet(gameObject) {
	const validPlayerIds = new Set();
	const playerMap = gameObject && gameObject.players && typeof gameObject.players === 'object'
		? gameObject.players
		: {};
	
	for (const id of Object.keys(playerMap)) {
		if (!id) continue;
		validPlayerIds.add(String(id));
	}
	
	return validPlayerIds;
}

function stripUnknownOwnerContent(gameObject, validPlayerIds = null) {
	if (!gameObject || !gameObject.board || !gameObject.board.cells || !Array.isArray(gameObject.chessPieces)) {
		return { changed: false, removedPieces: 0, cleanedCellItems: 0 };
	}
	
	const allowedPlayerIds = validPlayerIds || buildValidPlayerIdSet(gameObject);
	if (allowedPlayerIds.size === 0) {
		return { changed: false, removedPieces: 0, cleanedCellItems: 0 };
	}
	
	let changed = false;
	let removedPieces = 0;
	let cleanedCellItems = 0;
	
	for (let i = gameObject.chessPieces.length - 1; i >= 0; i--) {
		const piece = gameObject.chessPieces[i];
		const ownerId = piece && piece.player != null ? String(piece.player) : null;
		if (ownerId && !allowedPlayerIds.has(ownerId)) {
			gameObject.chessPieces.splice(i, 1);
			removedPieces++;
			changed = true;
		}
	}
	
	const validPieceIds = new Set();
	for (const piece of gameObject.chessPieces) {
		if (!piece || piece.id == null) continue;
		validPieceIds.add(String(piece.id));
	}
	
	const boardCells = gameObject.board.cells;
	for (const [key, cellContents] of Object.entries(boardCells)) {
		if (!Array.isArray(cellContents) || cellContents.length === 0) continue;
		
		const filtered = cellContents.filter(item => {
			if (!item) return false;
			
			const ownerId = item.player != null
				? String(item.player)
				: (item.chessPiece && item.chessPiece.player != null ? String(item.chessPiece.player) : null);
			if (ownerId && !allowedPlayerIds.has(ownerId)) {
				return false;
			}
			
			if (item.type === 'chess') {
				const markerPieceId = item.pieceId != null
					? String(item.pieceId)
					: (item.chessPiece && item.chessPiece.id != null ? String(item.chessPiece.id) : null);
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

function hasPlayerBoardPresence(game, playerId) {
	if (!game || !game.state) return false;
	const pid = String(playerId);
	const homeZones = game.state.homeZones || {};
	const boardCells = game.state.board && game.state.board.cells ? game.state.board.cells : {};
	const chessPieces = Array.isArray(game.state.chessPieces) ? game.state.chessPieces : [];
	
	const hasHomeZone = !!homeZones[playerId];
	const hasPiece = chessPieces.some(piece => piece && String(piece.player) === pid);
	const hasOwnedCell = Object.values(boardCells).some(cell =>
		Array.isArray(cell) && cell.some(item => item && String(item.player) === pid)
	);
	
	return hasHomeZone && hasPiece && hasOwnedCell;
}

function rehydratePlayerState(gameId, game, playerId, playerName) {
	const authoritativeGame = gameManager.getGame(gameId);
	if (!authoritativeGame) {
		return { success: false, error: 'Authoritative game not found' };
	}
	
	const pid = String(playerId);
	if (!authoritativeGame.players || typeof authoritativeGame.players !== 'object') {
		authoritativeGame.players = {};
	}
	if (!authoritativeGame.homeZones || typeof authoritativeGame.homeZones !== 'object') {
		authoritativeGame.homeZones = {};
	}
	if (!Array.isArray(authoritativeGame.chessPieces)) {
		authoritativeGame.chessPieces = [];
	}
	if (!authoritativeGame.board || !authoritativeGame.board.cells) {
		authoritativeGame.board = {
			cells: {},
			minX: 0,
			maxX: 0,
			minZ: 0,
			maxZ: 0
		};
	}
	
	delete authoritativeGame.players[playerId];
	delete authoritativeGame.homeZones[playerId];
	
	authoritativeGame.chessPieces = authoritativeGame.chessPieces.filter(
		piece => piece && String(piece.player) !== pid
	);
	
	for (const [key, cellContents] of Object.entries(authoritativeGame.board.cells)) {
		if (!Array.isArray(cellContents)) {
			delete authoritativeGame.board.cells[key];
			continue;
		}
		
		const remaining = cellContents.filter(item => {
			if (!item) return false;
			const ownerId = item.player != null
				? String(item.player)
				: (item.chessPiece && item.chessPiece.player != null ? String(item.chessPiece.player) : null);
			return ownerId !== pid;
		});
		
		if (remaining.length > 0) {
			authoritativeGame.board.cells[key] = remaining;
		} else {
			delete authoritativeGame.board.cells[key];
		}
	}
	
	const registrationResult = gameManager.registerPlayer(gameId, playerId, playerName, false);
	if (!registrationResult || !registrationResult.success) {
		return registrationResult || { success: false, error: 'Failed to re-register player' };
	}
	
	if (!Array.isArray(game.players)) {
		game.players = [];
	}
	game.players = game.players.filter(id => String(id) !== pid);
	game.players.push(playerId);
	
	game.state.board = authoritativeGame.board;
	game.state.homeZones = authoritativeGame.homeZones;
	game.state.chessPieces = Array.isArray(authoritativeGame.chessPieces)
		? authoritativeGame.chessPieces
		: [];
	
	return {
		success: true,
		homeZone: registrationResult.homeZone || game.state.homeZones[playerId] || null
	};
}

function repairChessPieceCellConsistency(gameObject) {
	if (!gameObject || !gameObject.board || !gameObject.board.cells || !Array.isArray(gameObject.chessPieces)) {
		return { changed: false, removedPieces: 0, cleanedCellItems: 0 };
	}

	const boardCells = gameObject.board.cells;
	let changed = false;
	let removedPieces = 0;
	let cleanedCellItems = 0;
	
	const validPlayerIds = buildValidPlayerIdSet(gameObject);
	const staleOwnerCleanup = stripUnknownOwnerContent(gameObject, validPlayerIds);
	if (staleOwnerCleanup.changed) {
		changed = true;
		removedPieces += staleOwnerCleanup.removedPieces;
		cleanedCellItems += staleOwnerCleanup.cleanedCellItems;
	}

	for (let i = gameObject.chessPieces.length - 1; i >= 0; i--) {
		const piece = gameObject.chessPieces[i];
		if (!piece) {
			gameObject.chessPieces.splice(i, 1);
			removedPieces++;
			changed = true;
			continue;
		}

		const pos = piece.position || piece;
		const isKing = String(piece.type || '').toUpperCase() === 'KING';
		if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
			if (!isKing) {
				gameObject.chessPieces.splice(i, 1);
				removedPieces++;
				changed = true;
			}
			continue;
		}
		
		const key = `${pos.x},${pos.z}`;
		const cellContents = boardCells[key];
		if (!Array.isArray(cellContents) || cellContents.length === 0) {
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
				gameObject.chessPieces.splice(i, 1);
				removedPieces++;
				changed = true;
			}
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
		const length = Array.isArray(value) ? value.length : 0;
		snapshot.set(key, length);
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
		const beforeLen = beforeSnapshot.has(key) ? beforeSnapshot.get(key) : null;
		const afterLen = Array.isArray(afterCells[key]) ? afterCells[key].length : 0;
		if (beforeLen === null || beforeLen !== afterLen) return true;
	}
	return false;
}

function getReducedCellsFromSnapshot(beforeSnapshot, boardAfter) {
	const cells = [];
	const afterCells = (boardAfter && boardAfter.cells && typeof boardAfter.cells === 'object')
		? boardAfter.cells
		: {};
	
	for (const [key, beforeLen] of beforeSnapshot.entries()) {
		const afterLen = Array.isArray(afterCells[key]) ? afterCells[key].length : 0;
		if (beforeLen > afterLen) {
			const { x, z } = parseBoardKey(key);
			if (Number.isFinite(x) && Number.isFinite(z)) {
				cells.push({ x, z });
			}
		}
	}
	
	return cells;
}

function emitIslandDecayAnimation(gameId, cells) {
	if (!Array.isArray(cells) || cells.length === 0) return;
	
	let payloadCells = cells;
	if (cells.length > ISLAND_DECAY_ANIMATION_MAX_CELLS) {
		const step = Math.ceil(cells.length / ISLAND_DECAY_ANIMATION_MAX_CELLS);
		payloadCells = cells.filter((_, idx) => idx % step === 0).slice(0, ISLAND_DECAY_ANIMATION_MAX_CELLS);
	}
	
	io.to(gameId).emit('island_decay', {
		cells: payloadCells,
		totalCells: cells.length,
	});
}

function runIslandIntegrityPass(gameId, game, options = {}) {
	const emitAnimation = options.emitAnimation !== false;
	if (!game || !game.state || !game.state.board || !Array.isArray(game.state.chessPieces)) {
		return { changed: false, decayCells: [] };
	}
	
	const gameObject = buildManagerGameObject(gameId, game);
	const pieceRepair = repairChessPieceCellConsistency(gameObject);
	const beforeBoardSnapshot = snapshotBoardCellLengths(gameObject.board);
	const beforeChessCount = gameObject.chessPieces.length;
	
	gameManager.islandManager.checkForIslandsAfterRowClear(gameObject);
	gameManager.boardManager.recalculateBoardBoundaries(gameObject.board);
	
	const boardChanged = hasBoardLengthChanges(beforeBoardSnapshot, gameObject.board);
	const chessChanged = beforeChessCount !== gameObject.chessPieces.length;
	const changed = pieceRepair.changed || boardChanged || chessChanged;
	const decayCells = boardChanged
		? getReducedCellsFromSnapshot(beforeBoardSnapshot, gameObject.board)
		: [];
	
	if (changed) {
		game.state.board = gameObject.board;
		game.state.chessPieces = gameObject.chessPieces;
	}
	
	if (emitAnimation && decayCells.length > 0) {
		emitIslandDecayAnimation(gameId, decayCells);
	}
	
	if (pieceRepair.removedPieces > 0 || pieceRepair.cleanedCellItems > 0) {
		console.log(
			`[Integrity] Removed ${pieceRepair.removedPieces} orphaned chess piece(s) and ${pieceRepair.cleanedCellItems || 0} stale cell item(s) in ${gameId}.`
		);
	}
	
	return { changed, decayCells };
}

function processWorldIntegrityMaintenance(options = {}) {
	const emitAnimation = options.emitAnimation !== false;
	const broadcast = options.broadcast !== false;
	
	try {
		for (const [gameId, game] of games.entries()) {
			const result = runIslandIntegrityPass(gameId, game, { emitAnimation });
			if (!result.changed) continue;
			
			persistence.markDirty();
			
			if (broadcast) {
				broadcastGameUpdate(gameId, game);
			}
			
			if (result.decayCells.length > 0) {
				console.log(
					`[Integrity] Repaired disconnected territory in ${gameId}; ${result.decayCells.length} cell(s) decayed.`
				);
			}
		}
	} catch (error) {
		console.error('[Integrity] Error during world integrity maintenance:', error);
	}
}

// World restore happens after all declarations — see bottom of file

/**
 * Validates a player name to ensure it's a string with maximum length of 32 characters
 * @param {any} playerName - Name to validate
 * @returns {string} - A valid player name
 */
function validatePlayerName(playerName) {
	// If name is not provided, null, or undefined
	if (!playerName) {
		return null;
	}
	
	// If name is not a string, try to convert it
	if (typeof playerName !== 'string') {
		try {
			playerName = String(playerName);
		} catch (e) {
			return null;
		}
	}
	
	// Trim whitespace
	playerName = playerName.trim();
	
	// Truncate to max length
	if (playerName.length > 32) {
		playerName = playerName.substring(0, 32);
	}
	
	return playerName;
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Environment detection
const isDevelopment = process.env.NODE_ENV !== 'production';

// Serve socket.io-client from node_modules
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// In development mode (localhost), serve files from the public directory directly
app.use(express.static(path.join(__dirname, 'public')));

// In production, serve the React app from build directory
if (!isDevelopment) {
	app.use(express.static(path.join(__dirname, 'client/build')));
} 


// JS file fallback route - must be before catch-all
app.get('/js/*', (req, res, next) => {
	//if no file exists with the filename bit of the url but there is one ending with .js, then load it
	const url = req.url;
	const file = (path.join(__dirname, 'public', url));
	if (!fs.existsSync(file) && fs.existsSync(file + '.js')) {
		//redirect to the .js file
		res.redirect(url + '.js');
	} else {
		next();
	}
});

// API routes - must be before catch-all
app.use('/api', apiRoutes);

// Advertiser routes for ad bidding system
app.use('/api/advertisers', advertiserRoutes);

// Route for 2D mode
app.get('/2d', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for advertiser registration page
app.get('/advertise', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'advertise.html'));
});

// Route for admin advertiser dashboard
app.get('/admin/advertisers', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'admin', 'advertisers.html'));
});

// Magic Link Authentication Routes
const magicLinkModule = (() => {
	try {
		// Use dynamic import for ES module
		return require('./server/auth/magicLink.js');
	} catch (e) {
		console.warn('Magic link module not available:', e.message);
		return null;
	}
})();

const emailServiceModule = (() => {
	try {
		return require('./server/auth/emailService.js');
	} catch (e) {
		console.warn('Email service module not available:', e.message);
		return null;
	}
})();

// Request a magic link
app.post('/api/auth/magic-link', async (req, res) => {
	try {
		const { email, gameKey } = req.body;
		
		if (!email || typeof email !== 'string') {
			return res.status(400).json({ success: false, error: 'Email is required' });
		}
		
		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return res.status(400).json({ success: false, error: 'Invalid email format' });
		}
		
		if (!magicLinkModule || !emailServiceModule) {
			return res.status(503).json({ 
				success: false, 
				error: 'Authentication service not available' 
			});
		}
		
		// Create the magic link
		const linkData = magicLinkModule.createMagicLink(email, gameKey || null);
		
		// Determine base URL
		const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
		const baseUrl = `${protocol}://${req.headers.host}`;
		
		// Send the email
		const result = await emailServiceModule.sendMagicLinkEmail(email, linkData.token, baseUrl);
		
		if (result.success) {
			res.json({
				success: true,
				message: result.message || 'Magic link sent! Check your email.',
				method: result.method,
				expiresIn: linkData.expiresIn
			});
		} else {
			res.status(500).json({
				success: false,
				error: result.error || 'Failed to send magic link'
			});
		}
	} catch (error) {
		console.error('Error in magic-link endpoint:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

// Verify a magic link (handles redirect)
app.get('/auth/verify', (req, res) => {
	try {
		const { token } = req.query;
		
		if (!token || !magicLinkModule) {
			return res.redirect('/?auth=failed&reason=invalid');
		}
		
		const linkData = magicLinkModule.verifyMagicLink(token);
		
		if (!linkData) {
			return res.redirect('/?auth=failed&reason=expired');
		}
		
		// Generate a player key for consistent identification
		const playerKey = magicLinkModule.generatePlayerKey(linkData.email);
		
		// Redirect to game with authentication data
		const redirectUrl = new URL('/', `${req.protocol}://${req.headers.host}`);
		redirectUrl.searchParams.set('auth', 'success');
		redirectUrl.searchParams.set('playerKey', playerKey);
		if (linkData.gameKey) {
			redirectUrl.searchParams.set('gameKey', linkData.gameKey);
		}
		
		res.redirect(redirectUrl.toString());
	} catch (error) {
		console.error('Error verifying magic link:', error);
		res.redirect('/?auth=failed&reason=error');
	}
});

// Generate a shareable game key
app.post('/api/auth/generate-game-key', (req, res) => {
	try {
		if (!magicLinkModule) {
			return res.status(503).json({ 
				success: false, 
				error: 'Service not available' 
			});
		}
		
		const gameKey = magicLinkModule.generateGameKey();
		res.json({ success: true, gameKey });
	} catch (error) {
		console.error('Error generating game key:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

// Catch-all route that will serve the React app in production, but public/index.html in development
// This MUST be last to avoid catching API routes
app.get('*', (req, res) => {
		if (isDevelopment) {
			res.sendFile(path.join(__dirname, 'public', 'index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
		}
	
});



// Map persistent player IDs to their data (survives socket reconnects)
const persistentPlayers = new Map();
const RECONNECT_GRACE_MS = 5 * 60 * 1000; // 5 minutes to reconnect

function parseCookies(cookieHeader) {
	const cookies = {};
	if (!cookieHeader) return cookies;
	cookieHeader.split(';').forEach(pair => {
		const idx = pair.indexOf('=');
		if (idx > 0) {
			const key = pair.substring(0, idx).trim();
			cookies[key] = pair.substring(idx + 1).trim();
		}
	});
	return cookies;
}

// Pending "King's Duel" mini-games (simultaneous capture resolution)
const pendingDuels = new Map(); // keyed by duelId

/**
 * Execute king capture consequences: transfer, suicidal pawns, island decay.
 * Extracted so it can be called from both the normal flow and the duel resolution.
 */
function executeKingCapture(gameId, captorId, defeatedId) {
	const game = games.get(gameId);
	if (!game) return;
	const gameObject = game.state;
	const captorPlayer = players.get(captorId) || {};
	const defeatedPlayer = players.get(defeatedId) || computerPlayers.get(defeatedId) || {};
	console.log(`King captured: ${captorId} takes ${defeatedId}'s forces`);

	if (!game.state.kingPrison) game.state.kingPrison = [];
	game.state.kingPrison.push({
		originalOwner: defeatedId,
		originalName: defeatedPlayer.name || defeatedId,
		originalColor: defeatedPlayer.color,
		capturedBy: captorId,
		capturedAt: Date.now()
	});

	const inheritedPawnIds = [];
	for (const p of gameObject.chessPieces) {
		if (p && p.player === defeatedId && p.type === 'PAWN') {
			inheritedPawnIds.push(p.id);
		}
	}

	for (const p of gameObject.chessPieces) {
		if (p && p.player === defeatedId) {
			if (p.type === 'PAWN') {
				p.player = captorId;
				p.suicidal = true;
			} else {
				p.player = captorId;
			}
			p.color = captorPlayer.color || p.color;
		}
	}

	for (const [key, cell] of Object.entries(gameObject.board.cells)) {
		if (Array.isArray(cell)) {
			for (const item of cell) {
				if (item && String(item.player) === String(defeatedId)) {
					item.player = captorId;
				}
			}
		}
	}

	if (!captorPlayer.capturedStyles) captorPlayer.capturedStyles = [];
	captorPlayer.capturedStyles.push({
		color: defeatedPlayer.color,
		name: defeatedPlayer.name
	});

	game.state.board = gameObject.board;
	game.state.chessPieces = gameObject.chessPieces;

	io.to(gameId).emit('king_captured', {
		captorId: captorId,
		captorName: captorPlayer.name || captorId,
		defeatedId: defeatedId,
		defeatedName: defeatedPlayer.name || defeatedId,
		defeatedColor: defeatedPlayer.color,
		kingPrison: game.state.kingPrison,
		inheritedPawnCount: inheritedPawnIds.length
	});

	if (inheritedPawnIds.length > 0) {
		const pawnDelay = GAME_RULES.SUICIDAL_PAWN_DELAY_MS || 3000;
		let pawnIndex = 0;

		const detonatePawn = () => {
			if (pawnIndex >= inheritedPawnIds.length) {
				gameManager.islandManager.checkForIslandsAfterRowClear(gameObject);
				game.state.board = gameObject.board;
				game.state.chessPieces = gameObject.chessPieces;
				broadcastGameUpdate(gameId, game);
				return;
			}

			const pawnId = inheritedPawnIds[pawnIndex];
			const pawn = gameObject.chessPieces.find(p => p && p.id === pawnId);

			if (pawn) {
				const px = pawn.position.x;
				const pz = pawn.position.z;
				const idx = gameObject.chessPieces.indexOf(pawn);
				if (idx !== -1) gameObject.chessPieces.splice(idx, 1);
				delete gameObject.board.cells[`${px},${pz}`];

				io.to(gameId).emit('suicidal_pawn', {
					pieceId: pawnId,
					x: px,
					z: pz,
					remaining: inheritedPawnIds.length - pawnIndex - 1
				});

				game.state.board = gameObject.board;
				game.state.chessPieces = gameObject.chessPieces;
				broadcastGameUpdate(gameId, game);
			}

			pawnIndex++;
			setTimeout(detonatePawn, 500);
		};

		setTimeout(detonatePawn, pawnDelay);
	} else {
		gameManager.islandManager.checkForIslandsAfterRowClear(gameObject);
		game.state.board = gameObject.board;
		game.state.chessPieces = gameObject.chessPieces;
	}

	broadcastGameUpdate(gameId, game);
}

/**
 * Resolve a King's Duel round. If exactly one player guessed correctly they
 * win. If both or neither guessed, reveal and start a new round. After
 * KING_DUEL_MAX_ROUNDS draws, pick a random winner.
 */
function resolveKingDuel(duelId) {
	const duel = pendingDuels.get(duelId);
	if (!duel || duel.resolved) return;
	clearTimeout(duel.timeout);

	const { player1, player2, gameId } = duel;
	const r1 = duel.responses[player1.id];
	const r2 = duel.responses[player2.id];

	const p1Guessed = r1 && r2 && r1.guess === r2.placement;
	const p2Guessed = r2 && r1 && r2.guess === r1.placement;

	const roundPayload = {
		duelId,
		round: duel.round,
		player1Placement: r1?.placement ?? -1,
		player1Guess: r1?.guess ?? -1,
		player2Placement: r2?.placement ?? -1,
		player2Guess: r2?.guess ?? -1,
		player1Guessed: p1Guessed,
		player2Guessed: p2Guessed,
		player1Id: player1.id,
		player2Id: player2.id
	};

	if (p1Guessed && !p2Guessed) {
		finaliseDuel(duel, duelId, player1.id, player2.id, roundPayload);
	} else if (p2Guessed && !p1Guessed) {
		finaliseDuel(duel, duelId, player2.id, player1.id, roundPayload);
	} else {
		const maxRounds = GAME_RULES.KING_DUEL_MAX_ROUNDS || 5;
		if (duel.round >= maxRounds) {
			// Safety valve: too many draws, pick randomly
			const victorId = Math.random() < 0.5 ? player1.id : player2.id;
			const loserId = victorId === player1.id ? player2.id : player1.id;
			console.log(`King's Duel max rounds reached, random winner: ${victorId}`);
			finaliseDuel(duel, duelId, victorId, loserId, { ...roundPayload, maxRoundsReached: true });
		} else {
			// Draw — reveal placements then start a new round after a brief pause
			console.log(`King's Duel round ${duel.round} draw (both=${p1Guessed && p2Guessed}, neither=${!p1Guessed && !p2Guessed})`);
			io.to(gameId).emit('king_duel_round_result', roundPayload);
			setTimeout(() => startNewDuelRound(duel, duelId), 2500);
		}
	}
}

function finaliseDuel(duel, duelId, victorId, loserId, roundPayload) {
	duel.resolved = true;
	pendingDuels.delete(duelId);
	console.log(`King's Duel resolved: ${victorId} wins on round ${duel.round}`);

	io.to(duel.gameId).emit('king_duel_result', {
		...roundPayload,
		victorId,
		loserId
	});

	executeKingCapture(duel.gameId, victorId, loserId);
}

function startNewDuelRound(duel, duelId) {
	duel.round++;
	duel.responses = {};

	const totalCells = duel.gridCols * duel.gridRows;
	duel.timeout = setTimeout(() => {
		if (!duel.responses[duel.player1.id]) {
			duel.responses[duel.player1.id] = {
				placement: Math.floor(Math.random() * totalCells),
				guess: Math.floor(Math.random() * totalCells)
			};
		}
		if (!duel.responses[duel.player2.id]) {
			duel.responses[duel.player2.id] = {
				placement: Math.floor(Math.random() * totalCells),
				guess: Math.floor(Math.random() * totalCells)
			};
		}
		resolveKingDuel(duelId);
	}, GAME_RULES.KING_DUEL_TIMEOUT_MS || 10000);

	const p1Socket = players.get(duel.player1.id)?.socket;
	const p2Socket = players.get(duel.player2.id)?.socket;
	const newRoundPayload = { duelId, round: duel.round, gridCols: duel.gridCols, gridRows: duel.gridRows };
	if (p1Socket) p1Socket.emit('king_duel_new_round', newRoundPayload);
	if (p2Socket) p2Socket.emit('king_duel_new_round', newRoundPayload);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
	const cookies = parseCookies(socket.handshake.headers.cookie);
	let playerId = cookies.shaktris_player_id;
	let isRejoining = false;

	// Check if this is a reconnecting player
	if (playerId && persistentPlayers.has(playerId)) {
		const existing = persistentPlayers.get(playerId);
		const existingPlayer = players.get(playerId);
		const wasEliminated = !!(existing?.eliminated || existingPlayer?.eliminated);
		
		if (wasEliminated) {
			console.log(`Eliminated player ${playerId} refreshed; issuing a fresh player identity.`);
			
			if (existing.disconnectTimer) {
				clearTimeout(existing.disconnectTimer);
				existing.disconnectTimer = null;
			}
			
			removePlayerCompletely(playerId);
			persistentPlayers.delete(playerId);
			
			playerId = uuidv4();
			players.set(playerId, {
				id: playerId,
				name: `Player_${playerId.substring(0, 6)}`,
				gameId: null,
				socket: socket
			});
		} else {
			isRejoining = true;
			console.log(`Player reconnecting: ${playerId} (socket ${socket.id})`);
			
			// Clear any pending disconnect timeout
			if (existing.disconnectTimer) {
				clearTimeout(existing.disconnectTimer);
				existing.disconnectTimer = null;
			}
			
			// Update the socket reference
			if (players.has(playerId)) {
				const playerData = players.get(playerId);
				playerData.socket = socket;
			} else {
				players.set(playerId, {
					id: playerId,
					name: existing.name || `Player_${playerId.substring(0, 6)}`,
					gameId: existing.gameId || null,
					socket: socket
				});
			}
			
			// Rejoin socket.io room if in a game
			const player = players.get(playerId);
			if (player && player.gameId) {
				socket.join(player.gameId);
			}
		}
	} else {
		// New player - generate a persistent ID
		playerId = uuidv4();
		console.log(`New player connected: ${playerId} (socket ${socket.id})`);
		players.set(playerId, {
			id: playerId,
			name: `Player_${playerId.substring(0, 6)}`,
			gameId: null,
			socket: socket
		});
	}

	// Track persistent state
	persistentPlayers.set(playerId, {
		name: players.get(playerId)?.name,
		gameId: players.get(playerId)?.gameId,
		eliminated: !!players.get(playerId)?.eliminated,
		disconnectTimer: null
	});

	// Tell the client their persistent ID so it can set a cookie
	socket.emit('player_id', playerId);
	socket.emit('set_session', { playerId });
	
	// Handle player joining a game
	socket.on('join_game', (data, callback) => {
		try {
			const player = players.get(playerId);
			
			// Extract gameId and playerName from the data object
			let gameId = data?.gameId;
			const playerName = data?.playerName;
			
			// Validate the player name
			const validPlayerName = validatePlayerName(playerName);
			
			// Update player name if provided and valid
			if (validPlayerName) {
				player.name = validPlayerName;
			}
			
			// If no game ID provided or null, use the global game
			if (!gameId) {
				gameId = GLOBAL_GAME_ID;
				console.log(`Player ${playerId} joining global game`);
			}
			
			// Check if game exists
			if (!games.has(gameId)) {
				console.log(`Game ${gameId} not found, redirecting to global game`);
				gameId = GLOBAL_GAME_ID;
				
				// If global game doesn't exist for some reason, create it
				if (!games.has(GLOBAL_GAME_ID)) {
					initializeGlobalGame();
				}
			}
			
			const game = games.get(gameId);
			
			const alreadyInGame = game.players.includes(playerId);
			
			// Check if game is full (only blocks brand-new joins, not reconnects)
			if (!alreadyInGame && game.players.length >= game.maxPlayers) {
				if (callback) callback({ success: false, error: 'Game is full' });
				return;
			}
			
			let registrationResult = null;
			
			if (alreadyInGame && !hasPlayerBoardPresence(game, playerId)) {
				console.warn(
					`[Join Repair] Player ${playerId} missing board presence in ${gameId}; rehydrating state.`
				);
				const rehydrateResult = rehydratePlayerState(gameId, game, playerId, player.name);
				if (!rehydrateResult || !rehydrateResult.success) {
					const errorMessage = rehydrateResult && rehydrateResult.error
						? rehydrateResult.error
						: 'Failed to repair player state';
					console.error(`[Join Repair] Failed for ${playerId}: ${errorMessage}`);
					if (callback) callback({ success: false, error: errorMessage });
					return;
				}
				registrationResult = {
					homeZone: rehydrateResult.homeZone || null
				};
				persistence.markDirty();
			}

			if (!alreadyInGame) {
				// Register player using GameManager
				registrationResult = gameManager.registerPlayer(
					gameId,
					playerId,
					player.name,
					false // Not an observer
				);

				if (!registrationResult.success) {
					console.error(`Failed to register player ${playerId} with GameManager:`, registrationResult.error);
					if (callback) callback({ success: false, error: registrationResult.error });
					return;
				}

				game.players.push(playerId);
				persistence.markDirty();
			}
			
			// Sync the socket-server game state from the authoritative GameManager game object.
			const authoritativeGame = gameManager.getGame(gameId);
			if (authoritativeGame) {
				game.state.board = authoritativeGame.board;
				game.state.homeZones = authoritativeGame.homeZones;
				game.state.chessPieces = Array.isArray(authoritativeGame.chessPieces)
					? authoritativeGame.chessPieces
					: [];
			}

			player.gameId = gameId;
			
			// Join socket room for this game
			socket.join(gameId);
			
			// If home zone data was returned, add it to the game state (kept for compatibility),
			// but the authoritative sync above is what ensures consistent state.
			if (registrationResult && registrationResult.homeZone) {
				if (!game.state.homeZones) {
					game.state.homeZones = {};
				}
				game.state.homeZones[playerId] = registrationResult.homeZone;
			}
			
			// Repair stale world state immediately on join so a reload cannot leave
			// players looking at unsupported kings or lingering disconnected islands.
			const integrityResult = runIslandIntegrityPass(gameId, game, { emitAnimation: false });
			if (integrityResult.changed) {
				persistence.markDirty();
				broadcastGameUpdate(gameId, game);
			}
			
			const playersList = buildPlayersList(game);

			// Notify all players in the game
			io.to(gameId).emit('player_joined', {
				playerId: playerId,
				playerName: player.name,
				gameId: gameId,
				players: playersList,
			});
			
			// Send game state to the new player
			socket.emit('game_update', {
				...game.state,
				players: playersList,
				boardBounds: game.state.board ? {
					minX: game.state.board.minX,
					maxX: game.state.board.maxX,
					minZ: game.state.board.minZ,
					maxZ: game.state.board.maxZ
				} : undefined,
				timestamp: Date.now(),
				fullUpdate: true
			});
			
			// Send success response with game data
			if (callback) callback({ 
				success: true, 
				gameId: gameId,
				playerId: playerId,
				playerName: player.name,
				gameState: game.state,
				players: playersList,
				timestamp: Date.now()
			});
			
			console.log(`Player ${playerId} joined game ${gameId}`);
		} catch (error) {
			console.error('Error joining game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle player creating a game
	socket.on('create_game', (settings, callback) => {
		try {
			const gameId = createNewGame(settings);
			if (callback) callback({ success: true, gameId: gameId });
		} catch (error) {
			console.error('Error creating game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle tetromino placement
	socket.on('tetromino_placed', (data, callback) => {
		try {
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			// Cooldown enforcement (real-time anti-spam)
			const tetrominoCooldownRemainingMs = getCooldownRemainingMs(
				player,
				'lastTetrominoPlacementAt',
				PLAYER_SETTINGS.TETROMINO_PLACEMENT_COOLDOWN_MS
			);
			
			if (tetrominoCooldownRemainingMs > 0) {
				if (callback) callback({
					success: false,
					error: 'rate_limited',
					retryAfterMs: tetrominoCooldownRemainingMs
				});
				return;
			}
			
			console.log(`Processing tetromino placement from player ${playerId} in game ${gameId}:`, JSON.stringify(data));
			
			// Validate the required data format - allow either type or pieceType
			if (!data || (!data.tetromino && !data.type && !data.pieceType)) {
				console.error(`Invalid tetromino data format: missing tetromino data`);
				socket.emit('tetrominoFailed', { message: 'Invalid tetromino data format: missing tetromino data' });
				if (callback) callback({ success: false, error: 'Invalid tetromino data format' });
				return;
			}
			
			// Extract the tetromino data - handle different possible formats
			let tetromino = data.tetromino || data;
			
			// Support both type and pieceType properties
			const pieceType = tetromino.pieceType || tetromino.type;
			if (!pieceType) {
				console.error(`Invalid tetromino data format: missing type/pieceType`);
				socket.emit('tetrominoFailed', { message: 'Invalid tetromino data format: missing type/pieceType' });
				if (callback) callback({ success: false, error: 'Invalid tetromino data format' });
				return;
			}
			
			// Build a manager-compatible view of the game state.
			const gameObject = buildManagerGameObject(gameId, game);
			
			// Validate the tetromino placement
			if (!gameManager.tetrominoManager.isValidTetrisPiece(pieceType)) {
				console.log(`Invalid tetromino type: ${pieceType}`);
				socket.emit('tetrominoFailed', { message: `Invalid tetromino type: ${pieceType}` });
				if (callback) callback({ success: false, error: 'Invalid tetromino type' });
				return;
			}
			
			// Get the tetromino shape
			const tetrominoShape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, tetromino.rotation);
			
			console.log(`Tetromino shape:`, JSON.stringify(tetrominoShape));
			
			// Ensure the server uses its own authoritative shape (do not trust client shape)
			tetromino.shape = tetrominoShape;
			
			// Check if placement is valid
			console.log(`Checking placement at x=${tetromino.position.x}, z=${tetromino.position.z}, y=0, playerId=${playerId}`);
			const placementValidation = gameManager.tetrominoManager.validateTetrominoPlacement(
				gameObject,
				tetromino,
				tetromino.position.x,
				tetromino.position.z,
				0, // Y level
				playerId
			);
			
			if (!placementValidation.valid) {
				const reason = placementValidation.reason || 'invalid_placement';
				const message = placementValidation.message || 'Invalid placement position';
				
				console.log(`Invalid placement position for player ${playerId}: ${reason} (${message})`);
				socket.emit('tetrominoFailed', { message, reason });
				if (callback) callback({ success: false, error: 'invalid_placement', reason, message });
				return;
			}
			
			console.log(`Placement is valid, placing tetromino`);
			
			// Place the tetromino
			gameManager.tetrominoManager.placeTetromino(
				gameObject,
				tetromino,
				tetromino.position.x,
				tetromino.position.z,
				playerId
			);
			
			// Update the game state with our modified gameObject
			game.state.board = gameObject.board;
			game.state.chessPieces = gameObject.chessPieces;
			runIslandIntegrityPass(gameId, game, { emitAnimation: false });
			
			// Check for completed rows and clear them
			const clearedRows = gameManager.boardManager.checkAndClearRows(gameObject);
			
			// Update game state again after row clearing
			game.state.board = gameObject.board;
			game.state.chessPieces = gameObject.chessPieces;
			
			// Always run island decay + king-support repair so disconnected
			// territory dissolves promptly, even in long-running persisted worlds.
			runIslandIntegrityPass(gameId, game, { emitAnimation: true });
			
			// Update game state
			game.state.lastAction = {
				type: 'tetromino_placed',
				playerId: playerId,
				data: {
					...data,
					clearedRows
				}
			};
			
			console.log(`Tetromino placed successfully, cleared rows: ${clearedRows.length > 0 ? clearedRows.join(', ') : 'none'}`);
			
			// Mark cooldown timestamp only after a successful placement
			player.lastTetrominoPlacementAt = Date.now();
			
			// Persist placement marker so subsequent placements are NOT treated as "first placement".
			// Keep the same shape as TetrominoManager uses internally ({x,z}).
			player.lastTetrominoPlacement = gameObject.players?.[playerId]?.lastTetrominoPlacement
				? gameObject.players[playerId].lastTetrominoPlacement
				: { x: tetromino.position.x, z: tetromino.position.z };
			
			// Check if player has any valid chess moves
			let hasValidMoves = gameManager.chessManager.hasValidChessMoves(gameObject, playerId);
			if (!hasValidMoves) {
				const repairResult = repairChessPieceCellConsistency(gameObject);
				if (repairResult.changed) {
					game.state.board = gameObject.board;
					game.state.chessPieces = gameObject.chessPieces;
					hasValidMoves = gameManager.chessManager.hasValidChessMoves(gameObject, playerId);
				}
				if (!hasValidMoves) {
					const ownChessOnBoard = Object.values(gameObject.board?.cells || {}).some(cell =>
						Array.isArray(cell) && cell.some(item =>
							item && item.type === 'chess' && String(item.player) === String(playerId)
						)
					);
					if (ownChessOnBoard) {
						console.warn(`Suppressing auto-skip for ${playerId}: board still has chess markers.`);
						hasValidMoves = true;
					}
				}
			}
			
			// Send success response to the client with hasValidMoves flag
			if (callback) callback({ 
				success: true, 
				boardState: game.state.board, 
				clearedRows,
				hasValidMoves // Include whether player has valid chess moves
			});
			
			// Broadcast updated state to all players in the game
			broadcastGameUpdate(gameId, game);
			
			// If rows were cleared, send a separate notification
			if (clearedRows.length > 0) {
				console.log(`Broadcasting row_cleared event for rows: ${clearedRows.join(', ')}`);
				io.to(gameId).emit('row_cleared', {
					rows: clearedRows,
					playerId: playerId
				});
			}
			
			// If player has no valid chess moves, send a notification to skip chess phase
			if (!hasValidMoves) {
				console.log(`Player ${playerId} has no valid chess moves, skipping chess phase`);
				io.to(gameId).emit('no_valid_chess_moves', {
					playerId: playerId,
					message: 'No valid chess moves available'
				});
				
				// Generate a new tetromino for the player
				const newTetromino = gameManager.tetrominoManager.generateTetrominos(gameObject, playerId)[0];
				
				// Send the new tetromino to the player
				socket.emit('new_tetromino', {
					tetromino: newTetromino,
					message: 'Skipping chess phase - no valid moves'
				});
			}
			
			// Update spectators
			updateSpectators(playerId, game.state);
		} catch (error) {
			console.error('Error processing tetromino placement:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle request for a new tetromino
	socket.on('request_tetromino', (callback) => {
		try {
			console.log(`Player ${playerId} requested a new tetromino`);
			
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			// Generate a new tetromino for the player
			const tetrominos = gameManager.tetrominoManager.generateTetrominos(game, playerId);
			
			if (!tetrominos || tetrominos.length === 0) {
				console.error(`Failed to generate tetrominos for player ${playerId}`);
				if (callback) callback({ success: false, error: 'Failed to generate tetrominos' });
				return;
			}
			
			// Get the first tetromino from the generated set
			const newTetromino = tetrominos[0];
			
			// Update player's active tetromino in the game state
			if (!game.state.currentTurns) {
				game.state.currentTurns = {};
			}
			
			if (!game.state.currentTurns[playerId]) {
				game.state.currentTurns[playerId] = {
					playerId: playerId,
					phase: 'tetris',
					startTime: Date.now(),
					minTime: 10000 // 10 seconds minimum turn time
				};
			}
			
			game.state.currentTurns[playerId].activeTetromino = newTetromino;
			
			console.log(`Generated new tetromino for player ${playerId}:`, newTetromino);
			
			// Send the tetromino to the requesting player
			socket.emit('turn_update', game.state.currentTurns[playerId]);
			
			// Send success response
			if (callback) callback({ 
				success: true, 
				tetromino: newTetromino
			});
			
		} catch (error) {
			console.error(`Error generating tetromino for player ${playerId}:`, error);
			if (callback) callback({ success: false, error: 'Server error: ' + error.message });
		}
	});
	
	// Handle chess piece movement
	socket.on('chess_move', (data, callback) => {
		try {
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			// Cooldown enforcement (real-time anti-spam)
			const chessCooldownRemainingMs = getCooldownRemainingMs(
				player,
				'lastChessMoveAt',
				PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS
			);
			
			if (chessCooldownRemainingMs > 0) {
				if (callback) callback({
					success: false,
					error: 'rate_limited',
					retryAfterMs: chessCooldownRemainingMs
				});
				return;
			}
			
			console.log(`Processing chess move from player ${playerId} in game ${gameId}:`, JSON.stringify(data));
			
			// Normalise client payloads (support legacy wrappers)
			const movePayload = (data && typeof data === 'object' && data.move && typeof data.move === 'object') ? data.move : data;
			const pieceId = movePayload?.pieceId;
			const targetPosition = movePayload?.targetPosition || (
				(movePayload?.toX !== undefined && movePayload?.toZ !== undefined)
					? { x: movePayload.toX, z: movePayload.toZ }
					: null
			);
			
			// Validate data format
			if (!pieceId || !targetPosition || targetPosition.x === undefined || targetPosition.z === undefined) {
				console.error(`Invalid chess move data format from player ${playerId}`);
				socket.emit('chessFailed', { message: 'Invalid chess move data format' });
				if (callback) callback({ success: false, error: 'Invalid chess move data format' });
				return;
			}
			
			// Create a proper game object format for our managers
			const gameObject = {
				id: gameId,
				board: game.state.board || { cells: {}, width: 0, height: 0 },
				chessPieces: game.state.chessPieces || [],
				homeZones: game.state.homeZones || {}, // Include homeZones at top level for BoardManager
				players: game.players.reduce((obj, id) => {
					const playerObj = players.get(id) || computerPlayers.get(id) || {};
					const homeZoneFromState = (game.state && game.state.homeZones && game.state.homeZones[id])
						? game.state.homeZones[id]
						: null;
					obj[id] = {
						id,
						name: playerObj.name || `Player_${id.substring(0, 5)}`,
						homeZone: homeZoneFromState || playerObj.homeZone || null,
						// Add any other player properties needed
					};
					return obj;
				}, {})
			};
			
			// Find the piece in the game state
			const pieceIndex = gameObject.chessPieces.findIndex(piece => 
				piece && piece.id === pieceId
			);
			
			if (pieceIndex === -1) {
				console.log(`Chess piece not found: ${pieceId}`);
				socket.emit('chessFailed', { message: 'Chess piece not found' });
				if (callback) callback({ success: false, error: 'Chess piece not found' });
				return;
			}
			
			const piece = gameObject.chessPieces[pieceIndex];
			console.log(`Found chess piece: ${piece.type} at (${piece.position.x}, ${piece.position.z})`);
			
			// Check if it's the player's piece
			if (piece.player !== playerId) {
				console.log(`Not player's chess piece. Piece belongs to ${piece.player}, not ${playerId}`);
				socket.emit('chessFailed', { message: 'Not your chess piece' });
				if (callback) callback({ success: false, error: 'Not your chess piece' });
				return;
			}
			
			// Alternatively, find the piece in the board cells
			const sourceCell = gameManager.boardManager.getCell(gameObject.board, piece.position.x, piece.position.z);
			if (!sourceCell) {
				console.log(`Cannot find the source cell for piece at (${piece.position.x}, ${piece.position.z})`);
				socket.emit('chessFailed', { message: 'Source cell not found' });
				if (callback) callback({ success: false, error: 'Source cell not found' });
				return;
			}
			
			// Check if the move is valid
			console.log(`Checking if move to (${targetPosition.x}, ${targetPosition.z}) is valid`);
			const isValidMove = gameManager.chessManager.isValidChessMove(
				gameObject,
				piece,
				targetPosition.x,
				targetPosition.z
			);
			
			if (!isValidMove) {
				console.log(`Invalid chess move for ${piece.type} to (${targetPosition.x}, ${targetPosition.z})`);
				socket.emit('chessFailed', { message: 'Invalid chess move' });
				if (callback) callback({ success: false, error: 'Invalid chess move' });
				return;
			}
			
			console.log(`Move is valid, executing chess move`);
			
			// Get the source cell's chess piece object
			const chessPieceObj = sourceCell.find(item => 
				item && item.type === 'chess' && item.pieceId === pieceId
			);
			
			if (!chessPieceObj) {
				console.log(`Cannot find the chess piece object in the source cell`);
				socket.emit('chessFailed', { message: 'Chess piece data not found in cell' });
				if (callback) callback({ success: false, error: 'Chess piece data not found in cell' });
				return;
			}
			
			// Store original position before the move (needed for castling detection)
			const originalPosition = { x: piece.position.x, z: piece.position.z };

			// Get the target cell
			const targetCell = gameManager.boardManager.getCell(gameObject.board, targetPosition.x, targetPosition.z);
			
			// Check for captured piece at the target position
			let capturedPiece = null;
			if (targetCell && targetCell.length > 0) {
				const capturedPieceObj = targetCell.find(item => 
					item && item.type === 'chess' && item.player !== playerId
				);
				
				if (capturedPieceObj) {
					// Find the actual piece in the chess pieces array
					const capturedPieceIndex = gameObject.chessPieces.findIndex(p => 
						p && p.id === capturedPieceObj.pieceId
					);
					
					if (capturedPieceIndex !== -1) {
						capturedPiece = gameObject.chessPieces[capturedPieceIndex];
						console.log(`Capturing piece: ${capturedPiece.type} belonging to ${capturedPiece.player}`);
						// Remove the captured piece
						gameObject.chessPieces.splice(capturedPieceIndex, 1);
					}
				}
			}
			
			// Remove only the moving chess piece from the source cell, preserving terrain
			const remainingAtSource = sourceCell.filter(
				item => !(item && item.type === 'chess' && String(item.pieceId) === String(piece.id))
			);
			if (remainingAtSource.length > 0) {
				gameManager.boardManager.setCell(gameObject.board, piece.position.x, piece.position.z, remainingAtSource);
			} else {
				gameManager.boardManager.setCell(gameObject.board, piece.position.x, piece.position.z, null);
			}
			
			// Prepare the target cell
			const targetCellContents = targetCell ? 
				targetCell.filter(item => item && item.type !== 'chess') : 
				[];
			
			// Add the chess piece to the target cell
			targetCellContents.push({
				...chessPieceObj,
				position: targetPosition // Update position in the cell object
			});
			
			// Set the target cell
			gameManager.boardManager.setCell(gameObject.board, targetPosition.x, targetPosition.z, targetCellContents);
			
			// Move the piece in the chessPieces array
			piece.position = targetPosition;
			piece.hasMoved = true;
			piece.moveCount = (piece.moveCount || 0) + 1;
			gameObject.chessPieces[pieceIndex] = piece;

			// Handle castling rook movement
			if (piece.type === 'KING' && !capturedPiece) {
				const dx = targetPosition.x - originalPosition.x;
				const dz = targetPosition.z - originalPosition.z;
				const isCastle = (Math.abs(dx) === 2 && dz === 0) || (dx === 0 && Math.abs(dz) === 2);
				if (isCastle) {
					// Temporarily restore king position for castle validation
					const savedPos = { x: piece.position.x, z: piece.position.z };
					piece.position = { ...originalPosition };
					piece.hasMoved = false;
					const castleResult = gameManager.chessManager._validateCastle(
						gameObject, piece, targetPosition.x, targetPosition.z
					);
					piece.position = savedPos;
					piece.hasMoved = true;
					if (castleResult.valid && castleResult.rookId) {
						const rook = gameObject.chessPieces.find(p => p && p.id === castleResult.rookId);
						if (rook) {
							// Remove rook from old position
							const rookOldKey = `${castleResult.rookFromX},${castleResult.rookFromZ}`;
							const rookOldCell = gameObject.board.cells[rookOldKey];
							if (Array.isArray(rookOldCell)) {
								const remaining = rookOldCell.filter(
									item => !(item && item.type === 'chess' && item.pieceId === rook.id)
								);
								if (remaining.length > 0) {
									gameObject.board.cells[rookOldKey] = remaining;
								} else {
									delete gameObject.board.cells[rookOldKey];
								}
							}

							rook.position = { x: castleResult.rookToX, z: castleResult.rookToZ };
							rook.hasMoved = true;

							// Place rook at new position
							const rookNewCell = gameManager.boardManager.getCell(
								gameObject.board, castleResult.rookToX, castleResult.rookToZ
							) || [];
							rookNewCell.push({
								type: 'chess',
								pieceId: rook.id,
								pieceType: 'rook',
								player: playerId,
								color: rook.color
							});
							gameManager.boardManager.setCell(
								gameObject.board, castleResult.rookToX, castleResult.rookToZ, rookNewCell
							);
							console.log(`Castling: rook ${rook.id} moved to (${castleResult.rookToX}, ${castleResult.rookToZ})`);
						}
					}
				}
			}

			// Update the game state with our modified gameObject
			game.state.board = gameObject.board;
			game.state.chessPieces = gameObject.chessPieces;
			
			// Update game state
			game.state.lastAction = {
				type: 'chess_move',
				playerId: playerId,
				data: {
					...data,
					captured: capturedPiece
				}
			};
			
			console.log(`Chess move completed successfully`);
			
			// Mark cooldown timestamp only after a successful move
			player.lastChessMoveAt = Date.now();
			
			// Send success response to the client
			if (callback) callback({ 
				success: true, 
				updatedPiece: piece,
				capturedPiece
			});
			
			// Broadcast updated state to all players in the game
			broadcastGameUpdate(gameId, game);
			
			// Send specific chess move event
			io.to(gameId).emit('chess_move', {
				playerId: playerId,
				movedPiece: piece,
				capturedPiece
			});
			
			// King captured: check for simultaneous capture, then resolve
			if (capturedPiece && capturedPiece.type === 'KING') {
				const defeatedId = capturedPiece.player;
				const now = Date.now();
				const captureWindow = GAME_RULES.SIMULTANEOUS_CAPTURE_WINDOW_MS || 1000;

				// Check for simultaneous capture (opponent captured our king recently)
				if (game.state.pendingKingCaptures) {
					const reverseCapture = game.state.pendingKingCaptures.find(
						c => c.captorId === defeatedId && c.defeatedId === playerId
							&& (now - c.timestamp) < captureWindow
					);
					if (reverseCapture) {
						// Both captured within 1s — initiate King's Duel mini-game
						game.state.pendingKingCaptures = game.state.pendingKingCaptures.filter(
							c => c !== reverseCapture
						);

						const duelId = `duel_${playerId}_${defeatedId}_${now}`;
						const cols = GAME_RULES.KING_DUEL_GRID_COLS || 4;
						const rows = GAME_RULES.KING_DUEL_GRID_ROWS || 2;
						const totalCells = cols * rows;

						const duel = {
							player1: { id: defeatedId },
							player2: { id: playerId },
							gameId,
							gridCols: cols,
							gridRows: rows,
							round: 1,
							responses: {},
							resolved: false,
							timeout: setTimeout(() => {
								// Auto-fill missing responses with random values
								if (!duel.responses[defeatedId]) {
									duel.responses[defeatedId] = {
										placement: Math.floor(Math.random() * totalCells),
										guess: Math.floor(Math.random() * totalCells)
									};
								}
								if (!duel.responses[playerId]) {
									duel.responses[playerId] = {
										placement: Math.floor(Math.random() * totalCells),
										guess: Math.floor(Math.random() * totalCells)
									};
								}
								resolveKingDuel(duelId);
							}, GAME_RULES.KING_DUEL_TIMEOUT_MS || 10000)
						};

						pendingDuels.set(duelId, duel);

						const duelPayload = { duelId, gridCols: cols, gridRows: rows };

						const p1Socket = players.get(defeatedId)?.socket;
						const p2Socket = players.get(playerId)?.socket;
						if (p1Socket) p1Socket.emit('king_duel_start', { ...duelPayload, opponentName: players.get(playerId)?.name || playerId });
						if (p2Socket) p2Socket.emit('king_duel_start', { ...duelPayload, opponentName: players.get(defeatedId)?.name || defeatedId });

						io.to(gameId).emit('king_duel_announced', {
							player1: defeatedId,
							player2: playerId,
							player1Name: players.get(defeatedId)?.name || defeatedId,
							player2Name: players.get(playerId)?.name || playerId
						});

						console.log(`King's Duel initiated: ${defeatedId} vs ${playerId} (duel ${duelId})`);

						if (callback) callback({
							success: true,
							updatedPiece: piece,
							capturedPiece,
							duelStarted: true,
							duelId
						});
						broadcastGameUpdate(gameId, game);
						updateSpectators(playerId, game.state);
						return;
					}
				}

				// Record this capture for simultaneous detection
				if (!game.state.pendingKingCaptures) game.state.pendingKingCaptures = [];
				game.state.pendingKingCaptures.push({
					captorId: playerId,
					defeatedId: defeatedId,
					timestamp: now
				});
				game.state.pendingKingCaptures = game.state.pendingKingCaptures.filter(
					c => (now - c.timestamp) < captureWindow * 2
				);

				// Normal (non-simultaneous) king capture
				executeKingCapture(gameId, playerId, defeatedId);
			}

			// Check for pawn promotion eligibility
			if (piece.type === 'PAWN' && (piece.moveCount || 0) >= GAME_RULES.PAWN_PROMOTION_DISTANCE) {
				socket.emit('pawn_promotion_available', {
					pieceId: piece.id,
					position: piece.position
				});
			}
			
			// Update spectators
			updateSpectators(playerId, game.state);
			
		} catch (error) {
			console.error('Error processing chess move:', error);
			socket.emit('chessFailed', { message: error.message || 'Server error processing chess move' });
			if (callback) callback({ success: false, error: 'Server error: ' + error.message });
		}
	});
	
	// Handle pawn promotion choice
	socket.on('promote_pawn', (data, callback) => {
		try {
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			const game = games.get(player.gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}

			const { pieceId, chosenType } = data || {};
			const piece = (game.state.chessPieces || []).find(
				p => p && p.id === pieceId && p.player === playerId && p.type === 'PAWN'
			);
			if (!piece) {
				if (callback) callback({ success: false, error: 'Pawn not found' });
				return;
			}

			const validTypes = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
			const promotionType = validTypes.includes(String(chosenType).toUpperCase())
				? String(chosenType).toUpperCase()
				: 'QUEEN';

			piece.type = promotionType;

			// Update cell contents
			const cellContents = gameManager.boardManager.getCell(
				game.state.board, piece.position.x, piece.position.z
			);
			if (Array.isArray(cellContents)) {
				const chessItem = cellContents.find(
					item => item && item.type === 'chess' && item.pieceId === pieceId
				);
				if (chessItem) {
					chessItem.pieceType = promotionType.toLowerCase();
				}
			}

			console.log(`Pawn ${pieceId} promoted to ${promotionType}`);
			broadcastGameUpdate(player.gameId, game);
			if (callback) callback({ success: true, pieceType: promotionType });
		} catch (error) {
			console.error('Error promoting pawn:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});

	// Handle voluntary piece detonation (pawn, or final king self-destruct)
	socket.on('detonate_pawn', (data, callback) => {
		try {
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			const game = games.get(player.gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}

			const { pieceId } = data || {};

			const gameObject = buildManagerGameObject(player.gameId, game);

			const result = gameManager.chessManager.detonatePawn(
				gameObject, playerId, pieceId
			);

			if (result.success) {
				// Sync modified state back
				game.state.board = gameObject.board;
				game.state.chessPieces = gameObject.chessPieces;
				runIslandIntegrityPass(player.gameId, game, { emitAnimation: true });
				
				const pieceType = result.pieceType || 'PAWN';
				console.log(`Player ${playerId} detonated ${pieceType} ${pieceId}`);
				
				socket.to(player.gameId).emit('pawn_detonation', {
					playerId,
					pieceId,
					pieceType,
					detonatedAt: result.detonatedAt,
					endedGame: !!result.endedGame,
				});
				
				if (result.endedGame) {
					player.eliminated = true;
					const persistent = persistentPlayers.get(playerId);
					if (persistent) persistent.eliminated = true;
					io.to(player.gameId).emit('king_detonation', {
						playerId,
						pieceId,
						detonatedAt: result.detonatedAt,
						explosionSequence: Array.isArray(result.explosionSequence)
							? result.explosionSequence
							: [],
						layerIntervalMs: Number(result.layerIntervalMs) > 0
							? Number(result.layerIntervalMs)
							: 500,
					});
				}
				
				broadcastGameUpdate(player.gameId, game);
			}

			if (callback) callback(result);
		} catch (error) {
			console.error('Error detonating piece:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});

	// Handle King's Duel mini-game response
	socket.on('king_duel_response', (data, callback) => {
		try {
			const { duelId, placement, guess } = data || {};
			const duel = pendingDuels.get(duelId);
			if (!duel || duel.resolved) {
				if (callback) callback({ success: false, error: 'No active duel' });
				return;
			}

			if (duel.responses[playerId]) {
				if (callback) callback({ success: false, error: 'Already responded' });
				return;
			}

			const totalCells = duel.gridCols * duel.gridRows;
			const clamp = (v) => Math.max(0, Math.min(totalCells - 1, Math.floor(Number(v) || 0)));

			duel.responses[playerId] = {
				placement: clamp(placement),
				guess: clamp(guess)
			};

			console.log(`King's Duel response from ${playerId}: place=${clamp(placement)}, guess=${clamp(guess)}`);
			if (callback) callback({ success: true });

			// If both have responded, resolve immediately
			if (duel.responses[duel.player1.id] && duel.responses[duel.player2.id]) {
				resolveKingDuel(duelId);
			}
		} catch (error) {
			console.error('Error handling king_duel_response:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});

	// NOTE: Server is authoritative. We intentionally do not accept client-pushed `game_update` state.
	
	// Handle get_game_state request
	socket.on('get_game_state', (data, callback) => {
		try {
			// Ensure data is an object and convert gameId to string if necessary
			let requestedGameId = GLOBAL_GAME_ID;
			
			if (data) {
				// Handle different possible formats of the gameId
				if (typeof data === 'string') {
					requestedGameId = data;
				} else if (typeof data === 'object') {
					if (data.gameId) {
						// Convert to string if it's an object or other non-string value
						requestedGameId = String(data.gameId) === 'null' ? GLOBAL_GAME_ID : String(data.gameId);
					}
				}
			}
			
			// console.log(`Player ${playerId} requested game state for game: ${requestedGameId}`);
			
			const player = players.get(playerId);
			if (!player) {
				socket.emit('error', { message: 'Player not found' });
				return;
			}
			
			// If player is not in a game, try to join the global game first
			if (!player.gameId) {
				console.log(`Player ${playerId} not in a game, joining global game first`);
				
				// Ensure global game exists
				if (!games.has(GLOBAL_GAME_ID)) {
					initializeGlobalGame();
				}
				
				// Add player to global game
				const globalGame = games.get(GLOBAL_GAME_ID);
				globalGame.players.push(playerId);
				player.gameId = GLOBAL_GAME_ID;
				
				// Join socket room for global game
				socket.join(GLOBAL_GAME_ID);
				
				console.log(`Player ${playerId} automatically joined global game`);
			}
			
			// Use player's current gameId or the requested one
			const gameId = player.gameId || requestedGameId;
			const game = games.get(gameId);
			
			if (!game) {
				console.error(`Game ${gameId} not found for player ${playerId}`);
				
				// Try to recover by joining global game
				if (gameId !== GLOBAL_GAME_ID) {
					// Ensure global game exists
					if (!games.has(GLOBAL_GAME_ID)) {
						initializeGlobalGame();
					}
					
					const globalGame = games.get(GLOBAL_GAME_ID);
					player.gameId = GLOBAL_GAME_ID;
					socket.join(GLOBAL_GAME_ID);
					
					// Send global game state
					const response = {
						success: true,
						gameId: GLOBAL_GAME_ID,
						state: globalGame.state,
						players: globalGame.players.map(id => ({
							id: id,
							name: (players.get(id) || computerPlayers.get(id)) ? (players.get(id) || computerPlayers.get(id)).name : `Player_${id.substring(0, 5)}`,
							isComputer: computerPlayers.has(id)
						})),
						timestamp: Date.now()
					};
					
					socket.emit('game_state', response);
					if (callback) callback(response);
					
					console.log(`Redirected player ${playerId} to global game after error`);
					return;
				}
				
				const errorResponse = { success: false, error: 'Game not found and unable to recover' };
				socket.emit('error', { message: errorResponse.error });
				if (callback) callback(errorResponse);
				return;
			}
			
			// Optional AOI (area-of-interest) support for global-world scalability
			// Client can request a window via data.options.aoi:
			// - { centerX, centerZ, radius }
			// - { minX, maxX, minZ, maxZ }
			let stateForClient = game.state;
			try {
				const options = (data && typeof data === 'object') ? data.options : null;
				const aoi = options && typeof options === 'object' ? options.aoi : null;
				
				if (aoi && stateForClient && stateForClient.board && stateForClient.board.cells) {
					let minX, maxX, minZ, maxZ;
					
					if (Number.isFinite(aoi.centerX) && Number.isFinite(aoi.centerZ) && Number.isFinite(aoi.radius)) {
						minX = aoi.centerX - aoi.radius;
						maxX = aoi.centerX + aoi.radius;
						minZ = aoi.centerZ - aoi.radius;
						maxZ = aoi.centerZ + aoi.radius;
					} else if (
						Number.isFinite(aoi.minX) && Number.isFinite(aoi.maxX) &&
						Number.isFinite(aoi.minZ) && Number.isFinite(aoi.maxZ)
					) {
						minX = aoi.minX;
						maxX = aoi.maxX;
						minZ = aoi.minZ;
						maxZ = aoi.maxZ;
					}
					
					if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
						const board = stateForClient.board;
						const boardView = {
							...board,
							cells: {},
							minX,
							maxX,
							minZ,
							maxZ
						};
						
						for (const [key, value] of Object.entries(board.cells)) {
							const { x, z } = parseBoardKey(key);
							if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
								boardView.cells[key] = value;
							}
						}
						
						stateForClient = { ...stateForClient, board: boardView };
					}
				}
			} catch (e) {
				// AOI is best-effort; fall back to full state
			}
			
			// Send full game state to the requesting client
			const response = {
				success: true,
				gameId: gameId,
				state: stateForClient,
				players: game.players.map(id => ({
					id: id,
					name: (players.get(id) || computerPlayers.get(id)) ? (players.get(id) || computerPlayers.get(id)).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				})),
				timestamp: Date.now()
			};
			
			socket.emit('game_state', response);
			if (callback) callback(response);
			
			// console.log(`Sent game state to player ${playerId}`);
		} catch (error) {
			console.error('Error handling get_game_state request:', error);
			socket.emit('error', { message: 'Error getting game state' });
			if (callback) callback({ success: false, error: 'Error getting game state' });
		}
	});
	
	// Handle explicit game leave request from client
	socket.on('disconnect_game', (data, callback) => {
		try {
			const player = players.get(playerId);
			
			// If player is already gone or not in a game, treat as success
			if (!player || !player.gameId) {
				if (callback) callback({ success: true });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			
			// Leave socket room regardless
			try {
				socket.leave(gameId);
			} catch (e) {
				// Ignore - leaving a room is best-effort
			}
			
			// Remove player from game list if present
			if (game) {
				game.players = game.players.filter(id => id !== playerId);
				
				// Notify remaining players
				io.to(gameId).emit('player_left', {
					playerId: playerId,
					gameId: gameId,
					players: game.players.map(id => ({
						id: id,
						name: (players.get(id) || computerPlayers.get(id)) ? (players.get(id) || computerPlayers.get(id)).name : `Player_${id.substring(0, 5)}`,
						isComputer: computerPlayers.has(id)
					}))
				});
				
				// Clean up non-global empty games
				if (game.players.length === 0 && gameId !== GLOBAL_GAME_ID) {
					games.delete(gameId);
					console.log(`Game ${gameId} removed (no players left after disconnect_game)`);
				}
			}
			
			// Clear player gameId
			player.gameId = null;
			
			// Stop spectating if they were spectating
			if (spectators.has(playerId)) {
				spectators.delete(playerId);
			}
			
			if (callback) callback({ success: true });
		} catch (error) {
			console.error('Error handling disconnect_game:', error);
			if (callback) callback({ success: false, error: 'Error leaving game' });
		}
	});
	
	// Handle spectator requests
	socket.on('request_spectate', (data) => {
		if (!data || !data.playerId) return;
		
		const targetPlayerId = data.playerId;
		const targetPlayer = players.get(targetPlayerId) || computerPlayers.get(targetPlayerId);
		
		if (!targetPlayer) {
			socket.emit('error', { message: 'Player not found' });
			return;
		}
		
		// Register as spectator
		spectators.set(playerId, targetPlayerId);
		
		// Get game state
		const gameId = targetPlayer.gameId;
		if (gameId && games.has(gameId)) {
			const game = games.get(gameId);
			
			// Send current game state to spectator
			socket.emit('spectator_update', {
				playerId: targetPlayerId,
				gameState: game.state
			});
			
			console.log(`Player ${playerId} is now spectating ${targetPlayerId}`);
		}
	});
	
	// Handle restart game request
	socket.on('restart_game', (data) => {
		try {
			console.log(`Player ${playerId} requested game restart`, data);
			
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				socket.emit('error', { message: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			
			if (!game) {
				socket.emit('error', { message: 'Game not found' });
				return;
			}
			
			// Create a new game using the GameManager
			const newGame = gameManager.createGame({
				maxPlayers: game.players.length,
				homeZoneDistance: BOARD_SETTINGS.HOME_ZONE_DISTANCE
			});
			
			// Register all the existing players in the new game
			const chessPieces = [];
			game.players.forEach((playerId, index) => {
				const playerObject = players.get(playerId);
				const registrationResult = gameManager.registerPlayer(
					newGame.gameId, 
					playerId, 
					playerObject ? playerObject.name : `Player_${playerId.substring(0, 5)}`,
					false // Not an observer
				);
				
				if (registrationResult.success) {
					// Add player's chess pieces to the combined array
					if (registrationResult.chessPieces) {
						chessPieces.push(...registrationResult.chessPieces);
					}
				}
			});
			
			// Get the actual game object with all data
			const freshGame = gameManager.getGame(newGame.gameId);
			
			// Update the current game with the new board and home zones
			game.state = {
				...game.state,
				board: freshGame.board,
				homeZones: freshGame.homeZones,
				// Prefer the authoritative list from the GameManager (registrationResult may not return pieces)
				chessPieces: Array.isArray(freshGame.chessPieces) ? freshGame.chessPieces : chessPieces,
				turnPhase: 'tetris',
				status: 'playing',
				startTime: Date.now()
			};
			
			// Broadcast the new game state to all players in the game
			io.to(gameId).emit('game_state', {
				gameId: gameId,
				state: game.state,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				}))
			});
			
			console.log(`Game ${gameId} restarted by player ${playerId} with proper home zones`);
		} catch (error) {
			console.error('Error handling restart_game request:', error);
			socket.emit('error', { message: 'Error restarting game' });
		}
	});
	
	// Handle startGame event
	socket.on('startGame', (options = {}, callback) => {
		try {
			const player = players.get(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Player not found' });
				return;
			}
			
			let gameId = player.gameId;
			
			// Create a new game if player is not in one
			if (!gameId) {
				gameId = createNewGame();
				player.gameId = gameId;
				socket.join(gameId);
			}
			
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			// Start the game
			game.state.status = 'playing';
			game.state.startTime = Date.now();
			
			// Add a computer player if there's only one human player
			if (game.players.length === 1 && !options.noComputer) {
				addComputerPlayer(gameId);
			}
			
			// Send initial game state to all players
			io.to(gameId).emit('game_started', {
				gameId: gameId,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				})),
				state: game.state
			});
			
			if (callback) callback({ success: true, gameId: gameId });
			console.log(`Game ${gameId} started by player ${playerId}`);
		} catch (error) {
			console.error('Error starting game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle stop spectating
	socket.on('stop_spectating', () => {
		if (spectators.has(playerId)) {
			spectators.delete(playerId);
			console.log(`Player ${playerId} stopped spectating`);
		}
	});
	
	// Handle request for game state
	socket.on('request_game_state', (data) => {
		if (!data || !data.playerId) return;
		
		const targetPlayerId = data.playerId;
		const targetPlayer = players.get(targetPlayerId) || computerPlayers.get(targetPlayerId);
		
		if (!targetPlayer) {
			socket.emit('error', { message: 'Player not found' });
			return;
		}
		
		// Get game state
		const gameId = targetPlayer.gameId;
		if (gameId && games.has(gameId)) {
			const game = games.get(gameId);
			
			// Send current game state
			socket.emit('game_update', {
				...game.state,
				boardBounds: game.state.board ? {
					minX: game.state.board.minX,
					maxX: game.state.board.maxX,
					minZ: game.state.board.minZ,
					maxZ: game.state.board.maxZ
				} : undefined,
				timestamp: Date.now(),
				fullUpdate: true
			});
		}
	});
	
	// Handle explicit exit (player wants to leave permanently)
	socket.on('exit_game', (data, callback) => {
		console.log(`Player ${playerId} explicitly exiting game`);
		removePlayerCompletely(playerId);
		persistentPlayers.delete(playerId);
		if (callback) callback({ success: true });
	});

	// Handle socket disconnect (grace period for reconnection)
	socket.on('disconnect', () => {
		console.log(`Player disconnected: ${playerId} (grace period ${RECONNECT_GRACE_MS / 1000}s)`);

		// Remove from spectators if spectating
		if (spectators.has(playerId)) {
			spectators.delete(playerId);
		}

		const persistent = persistentPlayers.get(playerId);
		if (persistent) {
			// Keep the player alive for a grace period
			persistent.name = players.get(playerId)?.name;
			persistent.gameId = players.get(playerId)?.gameId;
			persistent.eliminated = !!players.get(playerId)?.eliminated;
			persistent.disconnectTimer = setTimeout(() => {
				console.log(`Grace period expired for ${playerId}, removing from game`);
				removePlayerCompletely(playerId);
				persistentPlayers.delete(playerId);
			}, RECONNECT_GRACE_MS);
		} else {
			removePlayerCompletely(playerId);
		}
	});
});




function removePlayerCompletely(playerId) {
	const player = players.get(playerId);
	if (player && player.gameId) {
		const gameId = player.gameId;
		homeZoneIdleSince.delete(`${gameId}:${playerId}`);
		const game = games.get(gameId);

		if (game) {
			game.players = game.players.filter(id => id !== playerId);
			
			// Keep the authoritative GameManager model in sync so re-joins can re-register cleanly.
			const authoritativeGame = gameManager.getGame(gameId);
			if (authoritativeGame && authoritativeGame.players && authoritativeGame.players[playerId]) {
				delete authoritativeGame.players[playerId];
			}
			
			if (game.state && game.state.homeZones && game.state.homeZones[playerId]) {
				delete game.state.homeZones[playerId];
			}
			if (authoritativeGame && authoritativeGame.homeZones && authoritativeGame.homeZones[playerId]) {
				delete authoritativeGame.homeZones[playerId];
			}
			
			// Removing the player from game.players means integrity can now strip their terrain/chess content.
			const integrityResult = runIslandIntegrityPass(gameId, game, { emitAnimation: false });
			if (integrityResult.changed) {
				broadcastGameUpdate(gameId, game, true);
			}

			io.to(gameId).emit('player_left', {
				playerId: playerId,
				gameId: gameId,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 6)}`,
					isComputer: computerPlayers.has(id)
				}))
			});

			if (game.players.length === 0 && gameId !== GLOBAL_GAME_ID) {
				for (const idleKey of homeZoneIdleSince.keys()) {
					if (idleKey.startsWith(`${gameId}:`)) {
						homeZoneIdleSince.delete(idleKey);
					}
				}
				games.delete(gameId);
				console.log(`Game ${gameId} removed (no players left)`);
			}
		}
	}
	players.delete(playerId);
	persistence.markDirty();
}

// Create a new game
function createNewGame(gameId = null, settings = {}) {
	// Use provided gameId or generate a new UUID
	const id = gameId || uuidv4();
	
	// Use the GameManager to create the game with proper board and home zones
	const newGameResult = gameManager.createGame({
		maxPlayers: settings.maxPlayers || 2048,
		homeZoneDistance: BOARD_SETTINGS.HOME_ZONE_DISTANCE,
		gameId: id  // Ensure we pass the exact gameId to the GameManager
	});
	
	// Check if the game was created successfully
	if (!newGameResult || !newGameResult.gameId) {
		console.error('Failed to create game using GameManager');
		return null;
	}
	
	// Get the game object - using the exact same ID we provided
	const gameObj = gameManager.getGame(id);
	
	if (!gameObj) {
		console.error(`Game with ID ${id} not found in GameManager after creation`);
		return null;
	}
	
	// Create a lightweight game object for the socket server
	const game = {
		id: id,
		players: [],
		maxPlayers: settings.maxPlayers || 2048,
		hasComputerPlayer: false,
		state: {
			board: gameObj.board,
			homeZones: gameObj.homeZones,
			chessPieces: [],  // Will be populated as players join
			gameMode: settings.gameMode || 'standard',
			difficulty: settings.difficulty || 'normal',
			startLevel: settings.startLevel || 1,
			renderMode: settings.renderMode || '3d',
			turnPhase: 'tetris',
			status: 'waiting'
		},
		created: Date.now()
	};
	
	// Store the game
	games.set(id, game);
	
	console.log(`New game created: ${id}`);
	
	// For global game, add 3 AI opponents at different difficulty levels
	if (id === GLOBAL_GAME_ID) {
		const AI_ROSTER = [
			{ label: 'Novice',   difficulty: COMPUTER_DIFFICULTY.EASY,   interval: 15000 },
			{ label: 'Standard', difficulty: COMPUTER_DIFFICULTY.MEDIUM, interval: 10000 },
			{ label: 'Expert',   difficulty: COMPUTER_DIFFICULTY.HARD,   interval: 5000  },
		];

		for (const ai of AI_ROSTER) {
			const computerId = `ai-${ai.label.toLowerCase()}-${uuidv4().substring(0, 8)}`;
			const aiName = validatePlayerName(`AI ${ai.label}`);

			computerPlayers.set(computerId, {
				id: computerId,
				name: aiName,
				gameId: id,
				isComputer: true,
				difficulty: ai.difficulty,
				lastMoveTime: 0,
				consecutiveMoves: 0,
				minMoveInterval: ai.interval,
				strategy: generateComputerStrategy(ai.difficulty),
			});

			gameManager.registerPlayer(id, computerId, aiName, false);
			game.players.push(computerId);

			console.log(`AI opponent ${aiName} (${ai.difficulty}, ${computerId}) added to global game`);
			startComputerPlayerActions(computerId, id);
		}
		game.hasComputerPlayer = true;
	} 
	// For other games, add a computer player if specified
	else if (settings.addComputerPlayer !== false) {
		addComputerPlayer(id);
	}
	
	return id;
}

// End a game
function endGame(gameId, result) {
	const game = games.get(gameId);
	if (!game) return;
	
	// Update game state
	game.state.status = 'game_over';
	game.state.result = result;
	
	// Clear delta cache for this game (prevents memory growth across finished games)
	boardDeltaCache.delete(gameId);
	
	// Notify all players
	io.to(gameId).emit('game_over', result);
	
	console.log(`Game ${gameId} ended. Winner: ${result.winner}`);
}

/**
 * Add a computer player to the game
 * @param {string} gameId - The game ID
 * @param {string} difficulty - Computer difficulty (easy, medium, hard)
 * @returns {string} Computer player ID
 */
function addComputerPlayer(gameId, difficulty = COMPUTER_DIFFICULTY.MEDIUM) {
	const game = games.get(gameId);
	if (!game) return null;
	
	// Create computer player ID
	const computerId = `computer-${uuidv4().substring(0, 8)}`;
	
	// Validate difficulty
	const validDifficulty = Object.values(COMPUTER_DIFFICULTY).includes(difficulty)
		? difficulty
		: COMPUTER_DIFFICULTY.MEDIUM;
	
	// Determine move interval based on difficulty
	let minMoveInterval;
	switch (validDifficulty) {
		case COMPUTER_DIFFICULTY.EASY:
			minMoveInterval = 15000; // 15 seconds for easy opponents
			break;
		case COMPUTER_DIFFICULTY.MEDIUM:
			minMoveInterval = 10000; // 10 seconds for medium opponents
			break;
		case COMPUTER_DIFFICULTY.HARD:
			minMoveInterval = 5000;  // 5 seconds for hard opponents
			break;
		default:
			minMoveInterval = 10000;
	}
	
	// Generate a proper computer name and validate it
	const computerName = validatePlayerName(`Computer_${computerId.substring(9, 13)}`);
	
	// Add computer player to the game
	computerPlayers.set(computerId, {
		id: computerId,
		name: computerName,
		gameId: gameId,
		isComputer: true,
		difficulty: validDifficulty,
		lastMoveTime: 0,
		consecutiveMoves: 0,
		minMoveInterval: minMoveInterval,
		strategy: generateComputerStrategy(validDifficulty)
	});
	
	game.players.push(computerId);
	game.hasComputerPlayer = true;
	
	// Notify all players in the game
	io.to(gameId).emit('player_joined', {
		playerId: computerId,
		playerName: computerName,
		gameId: gameId,
		isComputer: true,
		difficulty: validDifficulty,
		players: game.players.map(id => ({
			id: id,
			name: players.get(id) ? players.get(id).name : (
				computerPlayers.get(id) ? computerPlayers.get(id).name : `Player_${id.substring(0, 5)}`
			),
			isComputer: computerPlayers.has(id),
			difficulty: computerPlayers.get(id)?.difficulty
		}))
	});
	
	console.log(`Computer player ${computerId} (${validDifficulty}) added to game ${gameId}`);
	
	// Start computer player actions
	startComputerPlayerActions(computerId, gameId);
	
	return computerId;
}

/**
 * Generate a strategy for the computer player based on difficulty
 * @param {string} difficulty - The difficulty level
 * @returns {Object} Strategy object
 */
function generateComputerStrategy(difficulty) {
	switch(difficulty) {
		case COMPUTER_DIFFICULTY.EASY:
			return {
				aggressiveness: 0.2, // Low chance to attack
				defensiveness: 0.7, // High chance to defend
				buildSpeed: 0.3,    // Slow build rate
				kingProtection: 0.8, // High king protection
				explorationRate: 0.4 // Medium exploration rate
			};
		case COMPUTER_DIFFICULTY.HARD:
			return {
				aggressiveness: 0.8, // High chance to attack
				defensiveness: 0.4, // Medium chance to defend
				buildSpeed: 0.8,    // Fast build rate
				kingProtection: 0.6, // Medium king protection
				explorationRate: 0.7 // High exploration rate
			};
		case COMPUTER_DIFFICULTY.MEDIUM:
		default:
			return {
				aggressiveness: 0.5, // Medium chance to attack
				defensiveness: 0.5, // Medium chance to defend
				buildSpeed: 0.5,    // Medium build rate
				kingProtection: 0.7, // Medium-high king protection
				explorationRate: 0.5 // Medium exploration rate
			};
	}
}

// Start computer player actions
function startComputerPlayerActions(computerId, gameId) {
	const game = games.get(gameId);
	if (!game) return;
	
	const computerPlayer = computerPlayers.get(computerId);
	if (!computerPlayer) return;
	
	// Set up interval for computer player actions
	const actionInterval = setInterval(() => {
		// Check if game still exists and computer player is still in the game
		if (!games.has(gameId) || !game.players.includes(computerId)) {
			clearInterval(actionInterval);
			return;
		}
		
		const now = Date.now();
		
		// Enforce minimum time between moves
		if (now - computerPlayer.lastMoveTime < computerPlayer.minMoveInterval) {
			return;
		}
		
		// Perform strategic actions based on difficulty and game state
		performComputerAction(computerId, gameId);
		
		// Update last move time
		computerPlayer.lastMoveTime = now;
		computerPlayer.consecutiveMoves++;
	}, 1000); // Check every second, but enforce minimum time between actual moves
}

// Perform a strategic computer action
function performComputerAction(computerId, gameId) {
	const game = games.get(gameId);
	if (!game) return;
	
	const computerPlayer = computerPlayers.get(computerId);
	if (!computerPlayer) return;
	
	const strategy = computerPlayer.strategy;
	const gameState = game.state || {};

	const aiPieces = (gameState.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	const onlyKingLeft = aiPieces.length === 1
		&& String(aiPieces[0].type).toUpperCase() === 'KING';

	if (onlyKingLeft) {
		handleAiKingOnlyDetonation(computerId, gameId, game, aiPieces[0]);
		return;
	}

	let actionType;

	const hasThreatenedPieces = checkForThreatenedPieces(gameState, computerId);
	
	if (hasThreatenedPieces && Math.random() < strategy.defensiveness) {
		actionType = 'chess'; // Defend with chess move
	} 
	// If king is exposed, prioritize protection based on king protection value
	else if (isKingExposed(gameState, computerId) && Math.random() < strategy.kingProtection) {
		actionType = 'tetromino'; // Build protection with tetromino
	}
	// If there's an opportunity to attack based on aggressiveness
	else if (hasAttackOpportunity(gameState, computerId) && Math.random() < strategy.aggressiveness) {
		actionType = 'chess'; // Attack with chess move
	}
	// Otherwise, decide based on build speed and exploration
	else {
		actionType = Math.random() < strategy.buildSpeed ? 'tetromino' : 'chess';
	}
	
	if (actionType === 'tetromino') {
		performStrategicTetrominoPlacement(gameState, computerId, strategy);
	} else {
		performStrategicChessMove(gameState, computerId, strategy);
	}
}

/**
 * Check if any of the computer's pieces are under threat
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @returns {boolean} True if any pieces are threatened
 */
function handleAiKingOnlyDetonation(computerId, gameId, game, kingPiece) {
	console.log(`[AI] ${computerId} has only a king remaining – detonating and respawning.`);
	const cp = computerPlayers.get(computerId);
	if (!cp) return;
	if (cp.pendingRespawn) return;
	cp.pendingRespawn = true;

	const gameObject = buildManagerGameObject(gameId, game);
	const result = gameManager.chessManager.detonatePawn(gameObject, computerId, kingPiece.id);

	if (!result.success) {
		console.warn(`[AI] Failed king self-detonation for ${computerId}: ${result.error || 'unknown error'}`);
		cp.pendingRespawn = false;
		return;
	}

	game.state.board = gameObject.board;
	game.state.chessPieces = gameObject.chessPieces;
	runIslandIntegrityPass(gameId, game, { emitAnimation: true });
	persistence.markDirty();

	if (result.explosionSequence) {
		io.to(gameId).emit('king_detonation', {
			playerId: computerId,
			explosionSequence: result.explosionSequence,
			layerIntervalMs: result.layerIntervalMs || 500,
		});
	}
	broadcastGameUpdate(gameId, game, true);

	const difficulty = cp?.difficulty || COMPUTER_DIFFICULTY.MEDIUM;
	const diffLabel = difficulty === COMPUTER_DIFFICULTY.EASY ? 'Novice'
		: difficulty === COMPUTER_DIFFICULTY.HARD ? 'Expert' : 'Standard';

	setTimeout(() => {
		const currentGame = games.get(gameId);
		if (!currentGame) {
			const stale = computerPlayers.get(computerId);
			if (stale) stale.pendingRespawn = false;
			return;
		}

		const newId = `ai-${diffLabel.toLowerCase()}-${uuidv4().substring(0, 8)}`;
		const aiName = validatePlayerName(`AI ${diffLabel}`);

		currentGame.players = currentGame.players.filter(id => id !== computerId);
		computerPlayers.delete(computerId);

		computerPlayers.set(newId, {
			id: newId, name: aiName, gameId,
			isComputer: true, difficulty,
			lastMoveTime: 0, consecutiveMoves: 0,
			minMoveInterval: cp?.minMoveInterval || 10000,
			strategy: generateComputerStrategy(difficulty),
		});
		gameManager.registerPlayer(gameId, newId, aiName, false);
		currentGame.players.push(newId);
		currentGame.hasComputerPlayer = true;
		persistence.markDirty();

		startComputerPlayerActions(newId, gameId);
		broadcastGameUpdate(gameId, currentGame, true);
		console.log(`[AI] Respawned ${aiName} (${newId}) replacing ${computerId}`);
	}, 5000);
}

function checkForThreatenedPieces(gameState, computerId) {
	const pieces = (gameState.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	if (pieces.length === 0) return false;
	const opponentPieces = (gameState.chessPieces || []).filter(
		p => p && String(p.player) !== String(computerId)
	);
	for (const op of opponentPieces) {
		const opPos = op.position || op;
		for (const myP of pieces) {
			const myPos = myP.position || myP;
			const dx = Math.abs(opPos.x - myPos.x);
			const dz = Math.abs(opPos.z - myPos.z);
			if (dx <= 2 && dz <= 2) return true;
		}
	}
	return false;
}

/**
 * Check if the computer's king is exposed
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @returns {boolean} True if king is exposed
 */
function isKingExposed(gameState, computerId) {
	const king = (gameState.chessPieces || []).find(
		p => p && String(p.player) === String(computerId)
			&& String(p.type).toUpperCase() === 'KING'
	);
	if (!king) return false;
	const kp = king.position || king;
	const cells = gameState.board?.cells || {};
	let neighbours = 0;
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			if (dx === 0 && dz === 0) continue;
			const k = `${kp.x + dx},${kp.z + dz}`;
			if (cells[k] && Array.isArray(cells[k]) && cells[k].length > 0) neighbours++;
		}
	}
	return neighbours < 3;
}

/**
 * Check if there's an opportunity to attack opponent pieces
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @returns {boolean} True if attack opportunity exists
 */
function hasAttackOpportunity(gameState, computerId) {
	const myPieces = (gameState.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	const opponentPieces = (gameState.chessPieces || []).filter(
		p => p && String(p.player) !== String(computerId)
	);
	if (myPieces.length === 0 || opponentPieces.length === 0) return false;
	for (const mine of myPieces) {
		const mp = mine.position || mine;
		for (const opp of opponentPieces) {
			const op = opp.position || opp;
			const dx = Math.abs(mp.x - op.x);
			const dz = Math.abs(mp.z - op.z);
			if (dx <= 1 && dz <= 1) return true;
		}
	}
	return false;
}

/**
 * Perform a strategic tetromino placement based on game state and strategy
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @param {Object} strategy - Computer player strategy
 */
function performStrategicTetrominoPlacement(gameState, computerId, strategy) {
	const computerPlayer = computerPlayers.get(computerId);
	if (!computerPlayer) return;
	
	const gameId = computerPlayer.gameId;
	const game = games.get(gameId);
	if (!game) return;
	
	// Build a game object compatible with our server-side managers
	const gameObject = buildManagerGameObject(gameId, game);
	
	const board = gameObject.board;
	
	// Pick a tetromino (validity enforced server-side via canPlaceTetromino)
	const tetrominoTypes = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	const pieceType = tetrominoTypes[Math.floor(Math.random() * tetrominoTypes.length)];
	const rotation = Math.floor(Math.random() * 4);
	const shape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, rotation);
	
	if (!shape) return;
	
	// Prefer placements near existing AI-owned cells
	const anchors = [];
	if (board && board.cells) {
		for (const [key, cellContents] of Object.entries(board.cells)) {
			if (!cellContents || !Array.isArray(cellContents) || cellContents.length === 0) continue;
			
			const hasOwnedNonHome = cellContents.some(item =>
				item && item.player === computerId && item.type !== 'home'
			);
			
			if (!hasOwnedNonHome) continue;
			
			const [x, z] = key.split(',').map(Number);
			if (Number.isFinite(x) && Number.isFinite(z)) {
				anchors.push({ x, z });
			}
		}
	}
	
	// Fallback: use king position as anchor
	if (anchors.length === 0 && Array.isArray(gameObject.chessPieces)) {
		const king = gameObject.chessPieces.find(p =>
			p && p.player === computerId && p.type === 'KING' && p.position
		);
		if (king) {
			anchors.push({ x: king.position.x, z: king.position.z });
		}
	}
	
	if (anchors.length === 0) return;
	
	const maxAttempts = 60;
	const offsetRange = 4;
	
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const anchor = anchors[Math.floor(Math.random() * anchors.length)];
		const x = anchor.x + (Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange);
		const z = anchor.z + (Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange);
		
		const tetromino = {
			pieceType,
			type: pieceType,
			rotation,
			shape,
			position: { x, z }
		};
		
		const canPlace = gameManager.tetrominoManager.canPlaceTetromino(
			gameObject,
			tetromino,
			x,
			z,
			0,
			computerId
		);
		
		if (!canPlace) continue;
		
		// Apply placement using the same managers as human players
		gameManager.tetrominoManager.placeTetromino(gameObject, tetromino, x, z, computerId);

		// Mark placement so future placements require king-path validation
		const compObj = computerPlayers.get(computerId);
		if (compObj) compObj.lastTetrominoPlacement = { x, z };

		// Clear completed rows (and any pieces on them)
		const clearedRows = gameManager.boardManager.checkAndClearRows(gameObject);
		
		// Update socket-layer game state and broadcast full state
		game.state.board = gameObject.board;
		game.state.chessPieces = gameObject.chessPieces;
		runIslandIntegrityPass(gameId, game, { emitAnimation: true });
		game.state.lastAction = {
			type: 'tetromino_placed',
			playerId: computerId,
			data: { pieceType, rotation, x, z, clearedRows }
		};
		
		broadcastGameUpdate(gameId, game);
		
		if (clearedRows.length > 0) {
			io.to(gameId).emit('row_cleared', { rows: clearedRows, playerId: computerId });
		}
		
		updateSpectators(computerId, game.state);
		return;
	}
}

/**
 * Perform a strategic chess move based on game state and strategy
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @param {Object} strategy - Computer player strategy
 */
function performStrategicChessMove(gameState, computerId, strategy) {
	const computerPlayer = computerPlayers.get(computerId);
	if (!computerPlayer) return;
	
	const gameId = computerPlayer.gameId;
	const game = games.get(gameId);
	if (!game) return;
	
	// Build a game object compatible with our server-side managers
	const gameObject = {
		id: gameId,
		board: game.state.board || { cells: {}, minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
		chessPieces: game.state.chessPieces || [],
		homeZones: game.state.homeZones || {}, // Include homeZones at top level for BoardManager
		players: game.players.reduce((obj, id) => {
			const playerObj = players.get(id) || computerPlayers.get(id) || {};
			const homeZoneFromState = (game.state && game.state.homeZones && game.state.homeZones[id])
				? game.state.homeZones[id]
				: null;
			obj[id] = {
				id,
				name: playerObj.name || `Player_${id.substring(0, 5)}`,
				homeZone: homeZoneFromState || playerObj.homeZone || null
			};
			return obj;
		}, {})
	};
	
	const board = gameObject.board;
	const chessPieces = gameObject.chessPieces;
	
	const computerPieces = chessPieces.filter(piece =>
		piece && piece.player === computerId && piece.position &&
		Number.isFinite(piece.position.x) && Number.isFinite(piece.position.z)
	);
	
	if (computerPieces.length === 0) return;
	
	// Only consider destinations that exist on the board
	const existingCells = [];
	if (board && board.cells) {
		for (const key of Object.keys(board.cells)) {
			const [x, z] = key.split(',').map(Number);
			if (Number.isFinite(x) && Number.isFinite(z)) {
				existingCells.push({ x, z });
			}
		}
	}
	
	if (existingCells.length === 0) return;
	
	const maxAttempts = 80;
	
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const piece = computerPieces[Math.floor(Math.random() * computerPieces.length)];
		const target = existingCells[Math.floor(Math.random() * existingCells.length)];
		
		if (piece.position.x === target.x && piece.position.z === target.z) continue;
		
		const isValidMove = gameManager.chessManager.isValidChessMove(
			gameObject,
			piece,
			target.x,
			target.z
		);
		
		if (!isValidMove) continue;
		
		const pieceId = piece.id;
		const targetPosition = { x: target.x, z: target.z };
		
		// Find the source cell in the board cells
		const sourceCell = gameManager.boardManager.getCell(gameObject.board, piece.position.x, piece.position.z);
		if (!sourceCell) continue;
		
		// Get the source cell's chess piece object
		const chessPieceObj = sourceCell.find(item =>
			item && item.type === 'chess' && item.pieceId === pieceId
		);
		if (!chessPieceObj) continue;
		
		// Get the target cell
		const targetCell = gameManager.boardManager.getCell(gameObject.board, targetPosition.x, targetPosition.z);
		
		// Check for captured piece at the target position
		let capturedPiece = null;
		if (targetCell && targetCell.length > 0) {
			const capturedPieceObj = targetCell.find(item =>
				item && item.type === 'chess' && item.player !== computerId
			);
			
			if (capturedPieceObj) {
				const capturedPieceIndex = gameObject.chessPieces.findIndex(p =>
					p && p.id === capturedPieceObj.pieceId
				);
				
				if (capturedPieceIndex !== -1) {
					capturedPiece = gameObject.chessPieces[capturedPieceIndex];
					gameObject.chessPieces.splice(capturedPieceIndex, 1);
				}
			}
		}
		
		// Remove only the moving chess piece from the source cell, preserving terrain
		const remainingAtAISource = sourceCell.filter(
			item => !(item && item.type === 'chess' && String(item.pieceId) === String(pieceId))
		);
		if (remainingAtAISource.length > 0) {
			gameManager.boardManager.setCell(gameObject.board, piece.position.x, piece.position.z, remainingAtAISource);
		} else {
			gameManager.boardManager.setCell(gameObject.board, piece.position.x, piece.position.z, null);
		}
		
		// Prepare the target cell (remove any existing chess piece objects)
		const targetCellContents = targetCell ?
			targetCell.filter(item => item && item.type !== 'chess') :
			[];
		
		// Add the chess piece to the target cell
		targetCellContents.push({
			...chessPieceObj,
			position: targetPosition
		});
		
		// Set the target cell
		gameManager.boardManager.setCell(gameObject.board, targetPosition.x, targetPosition.z, targetCellContents);
		
		// Move the piece in the chessPieces array
		const pieceIndex = gameObject.chessPieces.findIndex(p => p && p.id === pieceId);
		let movedPiece = piece;
		
		if (pieceIndex !== -1) {
			movedPiece = gameObject.chessPieces[pieceIndex];
			movedPiece.position = targetPosition;
			movedPiece.hasMoved = true;
			gameObject.chessPieces[pieceIndex] = movedPiece;
		}
		
		// Update the socket-layer game state
		game.state.board = gameObject.board;
		game.state.chessPieces = gameObject.chessPieces;
		game.state.lastAction = {
			type: 'chess_move',
			playerId: computerId,
			data: { pieceId, targetPosition, captured: capturedPiece }
		};
		
		broadcastGameUpdate(gameId, game);
		io.to(gameId).emit('chess_move', { playerId: computerId, movedPiece, capturedPiece });
		
		if (capturedPiece && capturedPiece.type === 'KING') {
			executeKingCapture(gameId, computerId, capturedPiece.player);
		}
		
		updateSpectators(computerId, game.state);
		return;
	}
}

// Update spectators with new game state
function updateSpectators(playerId, gameState) {
	// Find all spectators watching this player
	for (const [spectatorId, targetId] of spectators.entries()) {
		if (targetId === playerId) {
			const spectatorSocket = players.get(spectatorId)?.socket;
			if (spectatorSocket) {
				spectatorSocket.emit('spectator_update', {
					playerId: playerId,
					gameState: gameState
				});
			}
		}
	}
}

/**
 * Initialize the global game that all players join by default
 */
function initializeGlobalGame() {
	console.log('Initializing global game...');
	
	// Check if global game already exists
	if (games.has(GLOBAL_GAME_ID)) {
		console.log('Global game already exists, using existing game');
		return;
	}
	
	// Create the global game
	createNewGame(GLOBAL_GAME_ID, {
		maxPlayers: 2048, // Allow up to 2048 players as per requirements
		gameMode: 'standard',
		difficulty: 'normal',
	});
	
	console.log(`Global game created with ID: ${GLOBAL_GAME_ID}`);
}


// --- Restore persistent world (or create fresh) ---
const _worldSnapshot = persistence.loadWorld();
if (_worldSnapshot) {
	const restored = persistence.restoreWorld(_worldSnapshot, {
		games, players, computerPlayers, persistentPlayers,
		gameManager, startComputerPlayerActions, generateComputerStrategy,
	});
	if (!restored) {
		console.warn('[Startup] World restore failed, creating fresh global game.');
		initializeGlobalGame();
	}
} else {
	initializeGlobalGame();
}

// Ensure the global game has the expected AI roster after restore
(function ensureAiRoster() {
	const game = games.get(GLOBAL_GAME_ID);
	if (!game) return;

	const AI_TARGET_COUNT = 3;
	const AI_ROSTER_TEMPLATE = [
		{ label: 'Novice',   difficulty: COMPUTER_DIFFICULTY.EASY,   interval: 15000 },
		{ label: 'Standard', difficulty: COMPUTER_DIFFICULTY.MEDIUM, interval: 10000 },
		{ label: 'Expert',   difficulty: COMPUTER_DIFFICULTY.HARD,   interval: 5000  },
	];

	const existingAiIds = game.players.filter(id => computerPlayers.has(id));
	const needed = AI_TARGET_COUNT - existingAiIds.length;

	if (needed > 0) {
		const usedDifficulties = new Set(existingAiIds.map(id => computerPlayers.get(id)?.difficulty));
		let added = 0;
		for (const tmpl of AI_ROSTER_TEMPLATE) {
			if (added >= needed) break;
			if (usedDifficulties.has(tmpl.difficulty)) continue;

			const computerId = `ai-${tmpl.label.toLowerCase()}-${uuidv4().substring(0, 8)}`;
			const aiName = validatePlayerName(`AI ${tmpl.label}`);
			computerPlayers.set(computerId, {
				id: computerId, name: aiName, gameId: GLOBAL_GAME_ID,
				isComputer: true, difficulty: tmpl.difficulty,
				lastMoveTime: 0, consecutiveMoves: 0,
				minMoveInterval: tmpl.interval,
				strategy: generateComputerStrategy(tmpl.difficulty),
			});
			gameManager.registerPlayer(GLOBAL_GAME_ID, computerId, aiName, false);
			game.players.push(computerId);
			startComputerPlayerActions(computerId, GLOBAL_GAME_ID);
			console.log(`[Startup] Topped-up AI: ${aiName} (${tmpl.difficulty})`);
			added++;
		}
		if (added > 0) game.hasComputerPlayer = true;
	}
})();

// Repair stale persisted-world issues immediately on startup, without forcing
// players to reset the world.
processWorldIntegrityMaintenance({ emitAnimation: false, broadcast: false });

// --- Persistence: auto-save + graceful shutdown ---
const _persistenceDeps = {
	games, players, computerPlayers, persistentPlayers,
	globalGameId: GLOBAL_GAME_ID, gameManager,
};
persistence.startAutoSave(_persistenceDeps);
setInterval(processHomeZoneDegradation, HOME_ZONE_DEGRADATION_CHECK_MS);
setInterval(() => processWorldIntegrityMaintenance({
	emitAnimation: true,
	broadcast: true,
}), WORLD_INTEGRITY_CHECK_MS);

function gracefulShutdown(signal) {
	console.log(`\n[Shutdown] Received ${signal}, saving world...`);
	persistence.stopAutoSave();
	persistence.saveWorldSync(_persistenceDeps);
	process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the server
server.listen(PORT, () => {
	const actualPort = server.address() && server.address().port ? server.address().port : PORT;
	console.log(`Shaktris server running on port ${actualPort}`);
	console.log(`- Game: http://localhost:${actualPort}/`);
	console.log(`- 2D Mode: http://localhost:${actualPort}/2d`);
	console.log(`- API: http://localhost:${actualPort}/api`);
});
