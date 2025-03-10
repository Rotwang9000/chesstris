/**
 * Renderer Pieces Module
 * Contains functions for rendering chess pieces and player labels
 */

import * as THREE from '../../utils/three.js';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight } from './utils.js';

// Shared variables
let piecesGroup;
let playerLabels = [];

/**
 * Initialize the pieces module
 * @param {THREE.Group} group - The group to add pieces to
 */
export function init(group) {
	piecesGroup = group;
	playerLabels = [];
}

/**
 * Updates chess pieces based on the current game state
 * @param {Object} gameState - The current game state
 */
export function updateChessPieces(gameState) {
	try {
		if (!gameState || !gameState.board) {
			console.warn('No game state or board available for rendering chess pieces');
			return;
		}
		
		// Clear existing pieces
		while (piecesGroup.children.length > 0) {
			const child = piecesGroup.children[0];
			piecesGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// Track added pieces for debugging
		let addedPieces = 0;
		
		// Render each chess piece in the board
		const boardSize = gameState.board.length;
		
		for (let z = 0; z < boardSize; z++) {
			for (let x = 0; x < boardSize; x++) {
				const cell = gameState.board[z] && gameState.board[z][x];
				
				// Only render cells with chess pieces
				if (cell && cell.chessPiece) {
					try {
						// Determine the player ID for this piece
						let playerId = cell.playerId;
						
						// If cell doesn't have playerId, try to get it from the chess piece
						if (!playerId && cell.chessPiece.player) {
							playerId = cell.chessPiece.player;
						}
						
						// If still no playerId, use a default
						if (!playerId) {
							playerId = 'unknown';
						}
						
						// Add the chess piece
						addChessPiece(cell.chessPiece, playerId, x, z);
						addedPieces++;
					} catch (error) {
						console.error(`Error adding chess piece at ${x},${z}:`, error);
					}
				}
			}
		}
		
		// Only log when the count changes to avoid console spam
		if (addedPieces > 0) {
			console.log(`Added ${addedPieces} chess pieces to the scene`);
		}
	} catch (error) {
		console.error('Error updating chess pieces:', error);
	}
}

/**
 * Adds a chess piece to the scene
 * @param {Object} piece - Chess piece data
 * @param {string} playerId - ID of the player who owns the piece
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {THREE.Group} Piece group
 */
export function addChessPiece(piece, playerId, x, z) {
	try {
		// Find player data
		const gameState = window.GameState.getGameState();
		const player = gameState.players ? gameState.players[playerId] : null;
		
		// If player not found, use a default color and log warning
		let pieceColor;
		if (!player) {
			console.warn(`Player ${playerId} not found for chess piece. Using default color.`);
			pieceColor = 0xCCCCCC; // Default gray color
		} else {
			pieceColor = player.color;
		}
		
		// Validate coordinates
		if (isNaN(x) || isNaN(z)) {
			console.warn(`Invalid coordinates for chess piece: x=${x}, z=${z}`);
			x = 0;
			z = 0;
		}
		
		// Create piece group
		const pieceGroup = new THREE.Group();
		
		// Get piece world position
		const yPos = getFloatingHeight(x, z) + 0.2; // Place slightly above the cell
		
		// Material based on player color
		const playerColor = new THREE.Color(pieceColor || 0xffffff);
		const colorHex = playerColor.getHex();
		
		// Create piece based on type
		let pieceGeometry;
		let pieceMaterial;
		
		// Create standard material for pieces
		pieceMaterial = new THREE.MeshStandardMaterial({
			color: playerColor,
			roughness: 0.5,
			metalness: 0.6
		});
		
		// Create appropriate geometry based on piece type
		switch (piece.type) {
			case 'pawn':
				pieceGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 8);
				break;
			case 'rook':
				pieceGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.4);
				break;
			case 'knight':
				// Validate parameters for cone geometry
				const knightRadius = 0.25;
				const knightHeight = 0.6;
				pieceGeometry = new THREE.ConeGeometry(knightRadius, knightHeight, 5);
				break;
			case 'bishop':
				// Validate parameters for cone geometry
				const bishopRadius = 0.3;
				const bishopHeight = 0.7;
				pieceGeometry = new THREE.ConeGeometry(bishopRadius, bishopHeight, 8);
				break;
			case 'queen':
				pieceGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.7, 8);
				break;
			case 'king':
				pieceGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8);
				
				// Add a cross on top for the king
				const crossGeometry = new THREE.BoxGeometry(0.15, 0.3, 0.15);
				const crossMaterial = new THREE.MeshStandardMaterial({ color: playerColor });
				const cross = new THREE.Mesh(crossGeometry, crossMaterial);
				cross.position.y = 0.5;
				pieceGroup.add(cross);
				
				// Create a label for the king with player name
				const sessionData = window.SessionManager.getSessionData();
				if (player && gameState.players) {
					const playerName = player.username || `Player ${playerId.slice(0, 5)}`;
					createPlayerNameLabel(playerId, playerName, x, yPos + 1.5, z);
				}
				break;
			default:
				// Use a sphere for unknown pieces
				pieceGeometry = new THREE.SphereGeometry(0.3, 8, 8);
		}
		
		// Create the piece mesh
		const pieceMesh = new THREE.Mesh(pieceGeometry, pieceMaterial);
		pieceMesh.position.set(0, 0, 0);
		pieceGroup.add(pieceMesh);
		
		// Add glow effect to own pieces
		const sessionData = window.SessionManager.getSessionData();
		if (sessionData && playerId === sessionData.playerId) {
			const glowGeometry = new THREE.SphereGeometry(0.4, 16, 16);
			const glowMaterial = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.3,
				blending: THREE.AdditiveBlending
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			pieceGroup.add(glow);
		}
		
		// Set position and add to the scene
		pieceGroup.position.set(x, yPos, z);
		piecesGroup.add(pieceGroup);
		
		return pieceGroup;
	} catch (error) {
		console.error('Error adding chess piece:', error);
		return null;
	}
}

/**
 * Creates a floating label for a player
 * @param {string} playerId - ID of the player
 * @param {string} playerName - Name of the player
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {THREE.Group} Label group
 */
export function createPlayerNameLabel(playerId, playerName, x, y, z) {
	try {
		// Create a canvas for the text
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		canvas.width = 256;
		canvas.height = 64;
		
		// Set background to transparent
		context.fillStyle = 'rgba(0, 0, 0, 0)';
		context.fillRect(0, 0, canvas.width, canvas.height);
		
		// Draw text
		context.font = 'bold 32px Arial';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		
		// Add a shadow for better visibility
		context.shadowColor = 'rgba(0, 0, 0, 0.5)';
		context.shadowBlur = 5;
		context.shadowOffsetX = 2;
		context.shadowOffsetY = 2;
		
		// Get player color or use default
		const gameState = window.GameState.getGameState();
		let playerColor = '#FFFFFF';
		
		if (gameState && gameState.players && gameState.players[playerId]) {
			const colorHex = gameState.players[playerId].color;
			if (colorHex) {
				playerColor = `#${colorHex.toString(16).padStart(6, '0')}`;
			}
		}
		
		// Draw text with player color
		context.fillStyle = playerColor;
		context.fillText(playerName, canvas.width / 2, canvas.height / 2);
		
		// Create texture from canvas
		const texture = new THREE.CanvasTexture(canvas);
		
		// Create sprite material
		const material = new THREE.SpriteMaterial({
			map: texture,
			transparent: true
		});
		
		// Create sprite
		const sprite = new THREE.Sprite(material);
		sprite.scale.set(2, 0.5, 1);
		sprite.position.set(x, y, z);
		
		// Add to scene
		piecesGroup.add(sprite);
		
		// Add to tracking array
		playerLabels.push({
			sprite: sprite,
			playerId: playerId,
			basePosition: new THREE.Vector3(x, y, z)
		});
		
		return sprite;
	} catch (error) {
		console.error('Error creating player name label:', error);
		return null;
	}
}

/**
 * Updates the positions of player labels
 * @param {THREE.Camera} camera - The camera to face labels towards
 */
export function updatePlayerLabels(camera) {
	try {
		if (!camera) return;
		
		playerLabels.forEach(label => {
			if (label.sprite) {
				// Make label face the camera
				const position = label.sprite.position.clone();
				position.project(camera);
				
				// Adjust label height based on camera position
				// This keeps labels visible from different angles
				const cameraDistance = camera.position.distanceTo(label.basePosition);
				const heightAdjustment = Math.min(0.5, cameraDistance * 0.05);
				
				label.sprite.position.y = label.basePosition.y + heightAdjustment;
			}
		});
	} catch (error) {
		console.error('Error updating player labels:', error);
	}
}

// Export default object with all functions
export default {
	init,
	updateChessPieces,
	addChessPiece,
	createPlayerNameLabel,
	updatePlayerLabels
};
