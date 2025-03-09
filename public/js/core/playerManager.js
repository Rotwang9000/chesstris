/**
 * Player Manager Module
 * 
 * Handles player-related functionality such as adding players,
 * moving pieces, and managing player state.
 */

import { v4 as uuidv4 } from '../utils/uuid.js';
import * as GameState from './gameState.js';
import * as Constants from './constants.js';

/**
 * Add a new player to the game
 * @param {string} socketId - The socket ID of the player
 * @param {string} username - The username of the player (optional)
 * @param {Object} userData - Additional user data (optional)
 * @returns {Promise<Object>} The created player object
 */
export async function addPlayer(socketId, username = null, userData = null) {
	// Generate random color for the player
	const color = GameState.generatePlayerColor();
	
	// Find a home zone position for the player
	const homeZone = GameState.findHomeZonePosition();
	
	// Create player object
	const player = {
		id: socketId,
		username: username || `Player_${socketId.substring(0, 5)}`,
		color,
		homeZone,
		userId: userData?.userId || null,
		pieces: [],
		score: 0,
		joinedAt: new Date().toISOString()
	};
	
	// Add chess pieces to the player's home zone
	GameState.addChessPiecesToHomeZone(player);
	
	// Add player to game state
	const gameState = GameState.getGameState();
	gameState.players[socketId] = player;
	
	return player;
}

/**
 * Remove a player from the game
 * @param {string} playerId - The player ID to remove
 * @returns {Object|null} The removed player or null if not found
 */
export function removePlayer(playerId) {
	const gameState = GameState.getGameState();
	const player = gameState.players[playerId];
	
	if (player) {
		delete gameState.players[playerId];
		return player;
	}
	
	return null;
}

/**
 * Get a player by ID
 * @param {string} playerId - The player ID
 * @returns {Object|null} The player object or null if not found
 */
export function getPlayer(playerId) {
	const gameState = GameState.getGameState();
	return gameState.players[playerId] || null;
}

/**
 * Get all players
 * @returns {Array} Array of player objects
 */
export function getAllPlayers() {
	const gameState = GameState.getGameState();
	return Object.values(gameState.players);
}

/**
 * Move a chess piece
 * @param {string} pieceId - The ID of the piece to move
 * @param {number} targetX - The target X coordinate
 * @param {number} targetY - The target Y coordinate
 * @param {string} playerId - The player ID
 * @returns {Promise<Object>} Result of the move operation
 */
export async function movePiece(pieceId, targetX, targetY, playerId) {
	const gameState = GameState.getGameState();
	const player = gameState.players[playerId];
	
	if (!player) {
		return { success: false, error: 'Player not found' };
	}
	
	const piece = player.pieces.find(p => p.id === pieceId);
	if (!piece) {
		return { success: false, error: 'Piece not found' };
	}
	
	// Check if the move is valid
	const validMoves = GameState.getValidMoves(piece, playerId);
	const targetMove = validMoves.find(m => m.x === targetX && m.y === targetY);
	
	if (!targetMove) {
		return { success: false, error: 'Invalid move' };
	}
	
	// Store the original position for the result
	const originalX = piece.x;
	const originalY = piece.y;
	
	// Handle attack move
	let capturedPiece = null;
	if (targetMove.type === 'attack') {
		const targetKey = `${targetX},${targetY}`;
		capturedPiece = gameState.board[targetKey].piece;
		
		if (capturedPiece) {
			// Remove the piece from the opponent's collection
			const opponentId = capturedPiece.playerId;
			gameState.players[opponentId].pieces = gameState.players[opponentId].pieces.filter(
				p => p.id !== capturedPiece.id
			);
		}
	}
	
	// Handle potion collection
	let collectedPotion = null;
	if (targetMove.hasPotion) {
		const targetKey = `${targetX},${targetY}`;
		collectedPotion = gameState.board[targetKey].potion;
		GameState.applyPotionEffect(collectedPotion, playerId);
		gameState.board[targetKey].potion = null;
	}
	
	// Update the old position
	const oldKey = `${piece.x},${piece.y}`;
	if (gameState.board[oldKey]) {
		gameState.board[oldKey].piece = null;
	}
	
	// Update the new position
	const newKey = `${targetX},${targetY}`;
	if (gameState.board[newKey]) {
		gameState.board[newKey].piece = piece;
	}
	
	// Update piece position
	piece.x = targetX;
	piece.y = targetY;
	
	return { 
		success: true, 
		piece,
		from: { x: originalX, y: originalY },
		to: { x: targetX, y: targetY },
		captured: capturedPiece !== null,
		capturedPiece,
		collectedPotion
	};
}

/**
 * Update a player's score
 * @param {string} playerId - The player ID
 * @param {number} points - The points to add
 * @returns {number} The new score
 */
export function updatePlayerScore(playerId, points) {
	const gameState = GameState.getGameState();
	const player = gameState.players[playerId];
	
	if (player) {
		player.score += points;
		return player.score;
	}
	
	return 0;
}

/**
 * Check if a player has any pieces left
 * @param {string} playerId - The player ID
 * @returns {boolean} True if the player has pieces
 */
export function hasRemainingPieces(playerId) {
	const gameState = GameState.getGameState();
	const player = gameState.players[playerId];
	
	return player && player.pieces.length > 0;
}

/**
 * Get the winner of the game (player with the highest score)
 * @returns {Object|null} The winner player or null if no players
 */
export function getWinner() {
	const players = getAllPlayers();
	
	if (players.length === 0) {
		return null;
	}
	
	return players.reduce((winner, player) => {
		return player.score > winner.score ? player : winner;
	}, players[0]);
}

export default {
	addPlayer,
	removePlayer,
	getPlayer,
	getAllPlayers,
	movePiece,
	updatePlayerScore,
	hasRemainingPieces,
	getWinner
}; 