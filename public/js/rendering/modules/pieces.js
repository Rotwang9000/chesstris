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
 * Create a chess piece with the specified type
 * @param {string} type - Piece type (pawn, rook, knight, bishop, queen, king)
 * @param {Object} options - Additional options
 * @returns {THREE.Mesh} The mesh representing the chess piece
 */
export function createChessPiece(type, options = {}) {
	try {
		const defaults = {
			color: 0x2196F3,
			scale: 0.5,
			position: { x: 0, y: 0, z: 0 },
			ownerName: 'Player',
			showLabel: true
		};
		
		const pieceOptions = { ...defaults, ...options };
		
		// Set a standard height for all pieces for better visibility
		const pieceHeight = 1.5;
		
		// Create different geometries based on piece type
		let geometry;
		const cacheKey = `${type}-${pieceOptions.scale}`;
		
		if (pieceGeometryCache[cacheKey]) {
			geometry = pieceGeometryCache[cacheKey];
		} else {
			switch (type.toLowerCase()) {
				case 'pawn':
					geometry = new THREE.CylinderGeometry(
						0.2 * pieceOptions.scale, 
						0.3 * pieceOptions.scale, 
						pieceHeight * pieceOptions.scale,
						12
					);
					break;
				case 'rook':
					geometry = new THREE.BoxGeometry(
						0.4 * pieceOptions.scale, 
						pieceHeight * pieceOptions.scale, 
						0.4 * pieceOptions.scale
					);
					break;
				case 'knight':
					// For knight, return a group object instead
					return createKnightPiece(pieceOptions, pieceHeight);
				case 'bishop':
					geometry = new THREE.ConeGeometry(
						0.25 * pieceOptions.scale, 
						pieceHeight * pieceOptions.scale,
						16
					);
					break;
				case 'queen':
					// For queen, return a group object instead
					return createQueenPiece(pieceOptions, pieceHeight);
				case 'king':
					// For king, return a group object instead
					return createKingPiece(pieceOptions, pieceHeight);
				default:
					// Default to a simple box for unknown pieces
					geometry = new THREE.BoxGeometry(
						0.3 * pieceOptions.scale, 
						pieceHeight * pieceOptions.scale, 
						0.3 * pieceOptions.scale
					);
			}
			
			pieceGeometryCache[cacheKey] = geometry;
		}
		
		// Create piece material - use MeshBasicMaterial for visibility in any lighting
		const material = new THREE.MeshBasicMaterial({ 
			color: pieceOptions.color,
			wireframe: false
		});
		
		// Create mesh
		const piece = new THREE.Mesh(geometry, material);
		piece.castShadow = true;
		piece.receiveShadow = true;
		
		// Add wireframe for better visibility
		try {
			const edgesGeometry = new THREE.EdgesGeometry(geometry);
			const wireframeMaterial = new THREE.LineBasicMaterial({ 
				color: 0xFFFFFF, 
				linewidth: 1 
			});
			const wireframe = new THREE.LineSegments(edgesGeometry, wireframeMaterial);
			piece.add(wireframe);
		} catch (e) {
			console.warn('Could not create piece wireframe:', e);
			// Use a simple wireframe mesh as fallback
			const wireGeometry = new THREE.BoxGeometry(
				0.4 * pieceOptions.scale,
				pieceHeight * pieceOptions.scale,
				0.4 * pieceOptions.scale
			);
			const wireMaterial = new THREE.MeshBasicMaterial({
				color: 0xFFFFFF,
				wireframe: true,
				transparent: true,
				opacity: 0.5
			});
			const wireBox = new THREE.Mesh(wireGeometry, wireMaterial);
			piece.add(wireBox);
		}
		
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
		
		// Add player name label if requested
		if (pieceOptions.showLabel) {
			const canvas = document.createElement('canvas');
			canvas.width = 256;
			canvas.height = 64;
			const ctx = canvas.getContext('2d');
			
			// Draw text background
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			
			// Draw text
			ctx.fillStyle = 'white';
			ctx.font = 'bold 24px Arial';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(`${type.toUpperCase()}`, canvas.width / 2, canvas.height / 2);
			
			const texture = new THREE.CanvasTexture(canvas);
			const labelMaterial = new THREE.SpriteMaterial({ map: texture });
			const label = new THREE.Sprite(labelMaterial);
			
			// Position label above the piece
			label.position.set(0, pieceHeight * pieceOptions.scale + 0.2, 0);
			label.scale.set(1, 0.25, 1);
			piece.add(label);
		}
		
		// Add to pieces group if available
		if (window.piecesGroup) {
			window.piecesGroup.add(piece);
		}
		
		return piece;
	} catch (error) {
		console.error('Error creating chess piece:', error);
		return null;
	}
}

/**
 * Create a knight piece using basic geometries
 */
function createKnightPiece(pieceOptions, pieceHeight) {
	const knightGroup = new THREE.Group();
	
	// Create base cylinder
	const baseGeometry = new THREE.CylinderGeometry(
		0.25 * pieceOptions.scale, 
		0.3 * pieceOptions.scale, 
		pieceHeight * 0.7 * pieceOptions.scale,
		8
	);
	const baseMaterial = new THREE.MeshBasicMaterial({ color: pieceOptions.color });
	const base = new THREE.Mesh(baseGeometry, baseMaterial);
	
	// Create head sphere
	const headGeometry = new THREE.SphereGeometry(
		0.25 * pieceOptions.scale, 
		8, 
		8
	);
	const headMaterial = new THREE.MeshBasicMaterial({ color: pieceOptions.color });
	const head = new THREE.Mesh(headGeometry, headMaterial);
	head.position.y = pieceHeight * 0.45 * pieceOptions.scale;
	
	// Add parts to group
	knightGroup.add(base);
	knightGroup.add(head);
	
	// Add wireframes for better visibility
	try {
		const baseWireframe = new THREE.LineSegments(
			new THREE.EdgesGeometry(baseGeometry),
			new THREE.LineBasicMaterial({ color: 0xFFFFFF })
		);
		const headWireframe = new THREE.LineSegments(
			new THREE.EdgesGeometry(headGeometry),
			new THREE.LineBasicMaterial({ color: 0xFFFFFF })
		);
		base.add(baseWireframe);
		head.add(headWireframe);
	} catch (e) {
		console.warn('Could not create knight wireframes:', e);
	}
	
	// Position the piece
	knightGroup.position.set(
		pieceOptions.position.x,
		pieceHeight * pieceOptions.scale / 2 + pieceOptions.position.y,
		pieceOptions.position.z
	);
	
	// Store piece data
	knightGroup.userData = {
		type: 'chessPiece',
		pieceType: 'knight',
		owner: pieceOptions.ownerName
	};
	
	// Add label
	if (pieceOptions.showLabel) {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		
		ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		ctx.fillStyle = 'white';
		ctx.font = 'bold 24px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('KNIGHT', canvas.width / 2, canvas.height / 2);
		
		const texture = new THREE.CanvasTexture(canvas);
		const labelMaterial = new THREE.SpriteMaterial({ map: texture });
		const label = new THREE.Sprite(labelMaterial);
		
		label.position.set(0, pieceHeight * pieceOptions.scale + 0.2, 0);
		label.scale.set(1, 0.25, 1);
		knightGroup.add(label);
	}
	
	// Add to pieces group if available
	if (window.piecesGroup) {
		window.piecesGroup.add(knightGroup);
	}
	
	return knightGroup;
}

/**
 * Create a queen piece using basic geometries
 */
function createQueenPiece(pieceOptions, pieceHeight) {
	const queenGroup = new THREE.Group();
	
	// Create base cylinder
	const baseGeometry = new THREE.CylinderGeometry(
		0.25 * pieceOptions.scale, 
		0.4 * pieceOptions.scale, 
		pieceHeight * 0.8 * pieceOptions.scale,
		8
	);
	const baseMaterial = new THREE.MeshBasicMaterial({ color: pieceOptions.color });
	const base = new THREE.Mesh(baseGeometry, baseMaterial);
	
	// Create crown sphere
	const crownGeometry = new THREE.SphereGeometry(
		0.3 * pieceOptions.scale, 
		8, 
		8
	);
	const crownMaterial = new THREE.MeshBasicMaterial({ color: pieceOptions.color });
	const crown = new THREE.Mesh(crownGeometry, crownMaterial);
	crown.position.y = pieceHeight * 0.5 * pieceOptions.scale;
	
	// Add parts to group
	queenGroup.add(base);
	queenGroup.add(crown);
	
	// Position the piece
	queenGroup.position.set(
		pieceOptions.position.x,
		pieceHeight * pieceOptions.scale / 2 + pieceOptions.position.y,
		pieceOptions.position.z
	);
	
	// Store piece data
	queenGroup.userData = {
		type: 'chessPiece',
		pieceType: 'queen',
		owner: pieceOptions.ownerName
	};
	
	// Add label
	if (pieceOptions.showLabel) {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		
		ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		ctx.fillStyle = 'white';
		ctx.font = 'bold 24px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('QUEEN', canvas.width / 2, canvas.height / 2);
		
		const texture = new THREE.CanvasTexture(canvas);
		const labelMaterial = new THREE.SpriteMaterial({ map: texture });
		const label = new THREE.Sprite(labelMaterial);
		
		label.position.set(0, pieceHeight * pieceOptions.scale + 0.2, 0);
		label.scale.set(1, 0.25, 1);
		queenGroup.add(label);
	}
	
	// Add to pieces group if available
	if (window.piecesGroup) {
		window.piecesGroup.add(queenGroup);
	}
	
	return queenGroup;
}

/**
 * Create a king piece using basic geometries
 */
function createKingPiece(pieceOptions, pieceHeight) {
	const kingGroup = new THREE.Group();
	
	// Create base cylinder
	const baseGeometry = new THREE.CylinderGeometry(
		0.3 * pieceOptions.scale, 
		0.4 * pieceOptions.scale, 
		pieceHeight * 0.7 * pieceOptions.scale,
		8
	);
	const baseMaterial = new THREE.MeshBasicMaterial({ color: pieceOptions.color });
	const base = new THREE.Mesh(baseGeometry, baseMaterial);
	
	// Create top cube
	const topGeometry = new THREE.BoxGeometry(
		0.2 * pieceOptions.scale, 
		0.3 * pieceOptions.scale, 
		0.2 * pieceOptions.scale
	);
	const topMaterial = new THREE.MeshBasicMaterial({ color: pieceOptions.color });
	const top = new THREE.Mesh(topGeometry, topMaterial);
	top.position.y = pieceHeight * 0.4 * pieceOptions.scale;
	
	// Add parts to group
	kingGroup.add(base);
	kingGroup.add(top);
	
	// Position the piece
	kingGroup.position.set(
		pieceOptions.position.x,
		pieceHeight * pieceOptions.scale / 2 + pieceOptions.position.y,
		pieceOptions.position.z
	);
	
	// Store piece data
	kingGroup.userData = {
		type: 'chessPiece',
		pieceType: 'king',
		owner: pieceOptions.ownerName
	};
	
	// Add label
	if (pieceOptions.showLabel) {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		
		ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		ctx.fillStyle = 'white';
		ctx.font = 'bold 24px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('KING', canvas.width / 2, canvas.height / 2);
		
		const texture = new THREE.CanvasTexture(canvas);
		const labelMaterial = new THREE.SpriteMaterial({ map: texture });
		const label = new THREE.Sprite(labelMaterial);
		
		label.position.set(0, pieceHeight * pieceOptions.scale + 0.2, 0);
		label.scale.set(1, 0.25, 1);
		kingGroup.add(label);
	}
	
	// Add to pieces group if available
	if (window.piecesGroup) {
		window.piecesGroup.add(kingGroup);
	}
	
	return kingGroup;
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
