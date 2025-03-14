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

// Cache piece geometries for better performance
const pieceGeometryCache = {};

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
		
		// Check if piecesGroup is initialized
		if (!piecesGroup) {
			console.error('piecesGroup is not initialized');
			return;
		}
		
		// Store previous count to avoid unnecessary logging
		const prevAddedPieces = piecesGroup.userData.addedPieces || 0;
		
		// Clear existing pieces
		while (piecesGroup.children.length > 0) {
			const child = piecesGroup.children[0];
			piecesGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// Track added pieces for debugging
		let addedPieces = 0;
		
		// Iterate through the board
		for (let z = 0; z < gameState.board.length; z++) {
			if (!gameState.board[z]) continue;
			
			for (let x = 0; x < gameState.board[z].length; x++) {
				const cell = gameState.board[z][x];
				
				// Skip if cell doesn't exist or doesn't have a chess piece
				if (!cell || !cell.chessPiece) continue;
				
				try {
					// Get player ID or use cell's player ID if available
					let playerId = cell.chessPiece.owner || cell.chessPiece.player || cell.playerId;
					
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
		
		// Store current count for next update
		piecesGroup.userData.addedPieces = addedPieces;
		
		// Only log when the count changes to avoid console spam
		if (addedPieces !== prevAddedPieces) {
			console.log(`Added ${addedPieces} chess pieces to the scene`);
		}
	} catch (error) {
		console.error('Error updating chess pieces:', error);
	}
}

/**
 * Adds a chess piece to the scene
 * @param {Object} chessPiece - The chess piece object
 * @param {string} playerId - ID of the player who owns the piece
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {THREE.Object3D} The created piece
 */
export function addChessPiece(chessPiece, playerId, x, z) {
	try {
		if (!piecesGroup) {
			console.error('Pieces group not initialized');
			return null;
		}
		
		if (!chessPiece || !chessPiece.type) {
			console.error('Invalid chess piece data');
			return null;
		}
		
		// Get player info if available
		let playerName = 'Player';
		let pieceColor = 0xFF00FF; // Default magenta
		
		if (window.GameState && window.GameState.getGameState) {
			const gameState = window.GameState.getGameState();
			if (gameState && gameState.players && gameState.players[playerId]) {
				playerName = gameState.players[playerId].username || 'Player';
				pieceColor = gameState.players[playerId].color || pieceColor;
			}
		}
		
		// Check if player is the current user
		let isCurrentPlayer = false;
		if (window.SessionManager && window.SessionManager.getSessionData) {
			const sessionData = window.SessionManager.getSessionData();
			isCurrentPlayer = sessionData && sessionData.playerId === playerId;
		}
		
		// Create the chess piece
		const piece = createChessPiece(chessPiece.type, {
			position: { x, y: 0.2, z }, // Slightly elevated from the cell
			color: pieceColor,
			scale: 0.5,
			ownerName: playerName
		});
		
		if (!piece) {
			console.error('Failed to create chess piece');
			return null;
		}
		
		// Add a glow effect if this is the current player's piece
		if (isCurrentPlayer) {
			try {
				// Add a semi-transparent glow sphere around the piece
				const glowGeometry = new THREE.SphereGeometry(0.6, 16, 16);
				const glowMaterial = new THREE.MeshBasicMaterial({
					color: 0xFFFFFF,
					transparent: true,
					opacity: 0.2,
					side: THREE.BackSide
				});
				const glow = new THREE.Mesh(glowGeometry, glowMaterial);
				glow.position.y = 0.5; // Position at middle of piece
				piece.add(glow);
			} catch (e) {
				console.warn('Could not add glow effect:', e);
			}
		}
		
		// Add player name label above the piece
		const label = createPlayerNameLabel(playerId, playerName, x, 1.5, z);
		if (label) {
			piece.add(label);
		}
		
		// Store piece data for later reference
		piece.userData = {
			type: 'chessPiece',
			pieceType: chessPiece.type,
			playerId: playerId,
			boardX: x,
			boardZ: z
		};
		
		// Add to scene
		piecesGroup.add(piece);
		
		return piece;
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

/**
 * Creates a chess piece with the specified type and options
 * @param {string} type - The type of chess piece
 * @param {Object} options - Options for the chess piece
 * @returns {THREE.Group} The chess piece group
 */
export function createChessPiece(type, options = {}) {
	try {
		// Default options
		const pieceOptions = {
			color: 0xFFFFFF,
			scale: 1,
			position: { x: 0, y: 0, z: 0 },
			ownerName: 'Player',
			...options
		};
		
		// Create a group for the piece
		const pieceGroup = new THREE.Group();
		
		// Determine piece geometry and height based on type
		let geometry, pieceHeight;
		
			switch (type.toLowerCase()) {
				case 'pawn':
				pieceHeight = 0.5;
				geometry = new THREE.CylinderGeometry(0.2, 0.3, pieceHeight, 8);
					break;
				case 'rook':
				pieceHeight = 0.7;
				geometry = new THREE.BoxGeometry(0.4, pieceHeight, 0.4);
					break;
				case 'knight':
				pieceHeight = 0.7;
				// Create a simple knight shape (L-shaped)
				const knightGroup = new THREE.Group();
				
				// Base
				const baseGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.4, 8);
				const baseMaterial = new THREE.MeshStandardMaterial({ color: pieceOptions.color });
				const base = new THREE.Mesh(baseGeometry, baseMaterial);
				base.position.y = 0.2;
				
				// Head
				const headGeometry = new THREE.BoxGeometry(0.25, 0.3, 0.4);
				const headMaterial = new THREE.MeshStandardMaterial({ color: pieceOptions.color });
				const head = new THREE.Mesh(headGeometry, headMaterial);
				head.position.set(0, 0.5, 0.05);
				
				knightGroup.add(base);
				knightGroup.add(head);
				
				// Position and scale
				knightGroup.scale.set(pieceOptions.scale, pieceOptions.scale, pieceOptions.scale);
				knightGroup.position.set(
					pieceOptions.position.x,
					pieceOptions.position.y,
					pieceOptions.position.z
				);
				
				// Store piece data
				knightGroup.userData = {
					type: 'chessPiece',
					pieceType: type,
					owner: pieceOptions.ownerName
				};
				
				return knightGroup;
				case 'bishop':
				pieceHeight = 0.8;
				geometry = new THREE.ConeGeometry(0.2, pieceHeight, 8);
					break;
				case 'queen':
				pieceHeight = 0.9;
				geometry = new THREE.CylinderGeometry(0.2, 0.3, pieceHeight, 8);
				break;
				case 'king':
				pieceHeight = 1.0;
				
				// Create a king with a cross on top
				const kingGroup = new THREE.Group();
				
				// Base
				const kingBaseGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.7, 8);
				const kingBaseMaterial = new THREE.MeshStandardMaterial({ color: pieceOptions.color });
				const kingBase = new THREE.Mesh(kingBaseGeometry, kingBaseMaterial);
				kingBase.position.y = 0.35;
				
				// Cross (vertical)
				const crossVerticalGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
				const crossMaterial = new THREE.MeshStandardMaterial({ color: pieceOptions.color });
				const crossVertical = new THREE.Mesh(crossVerticalGeometry, crossMaterial);
				crossVertical.position.y = 0.85;
				
				// Cross (horizontal)
				const crossHorizontalGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.1);
				const crossHorizontal = new THREE.Mesh(crossHorizontalGeometry, crossMaterial);
				crossHorizontal.position.y = 0.75;
				
				kingGroup.add(kingBase);
				kingGroup.add(crossVertical);
				kingGroup.add(crossHorizontal);
				
				// Position and scale
				kingGroup.scale.set(pieceOptions.scale, pieceOptions.scale, pieceOptions.scale);
				kingGroup.position.set(
					pieceOptions.position.x,
					pieceOptions.position.y,
					pieceOptions.position.z
				);
				
				// Store piece data
				kingGroup.userData = {
					type: 'chessPiece',
					pieceType: type,
					owner: pieceOptions.ownerName
				};
				
				return kingGroup;
			default:
				pieceHeight = 0.5;
				geometry = new THREE.SphereGeometry(0.3, 8, 8);
		}
		
		// Create the piece
		const material = new THREE.MeshStandardMaterial({ color: pieceOptions.color });
		const piece = new THREE.Mesh(geometry, material);
		
		// Position the piece at the center of its cell
		piece.position.set(
			pieceOptions.position.x,
			pieceHeight * pieceOptions.scale / 2 + pieceOptions.position.y,
			pieceOptions.position.z
		);
		
		// Store piece data
		piece.userData = {
			type: 'chessPiece',
			pieceType: type,
			owner: pieceOptions.ownerName
		};
		
		return piece;
	} catch (error) {
		console.error('Error creating chess piece:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

// Export default object with all functions
export default {
	init,
	updateChessPieces,
	addChessPiece,
	createPlayerNameLabel,
	updatePlayerLabels,
	createChessPiece
};
