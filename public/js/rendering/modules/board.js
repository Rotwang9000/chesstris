/**
 * Renderer Board Module
 * Contains functions for rendering the game board and cells
 */

import * as THREE from '../../utils/three.js';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight } from './utils.js';
import { addCellDecoration, addCellBottom } from './effects.js';

// Shared variables
let boardGroup;
let materials = {};
let decorationPositions = new Map();

// Cache for cell geometries to improve performance
const cellGeometryCache = {};

/**
 * Initialize the board module
 * @param {THREE.Group} group - The group to add board elements to
 * @param {Object} materialSet - Materials to use for rendering
 */
export function init(group, materialSet) {
	boardGroup = group;
	materials = materialSet || {};
	decorationPositions = new Map();
}

/**
 * Updates the board based on the game state
 * @param {Object} gameState - The game state
 * @param {THREE.BufferGeometry} topGeometry - Geometry for the top of cells
 */
export function updateBoard(gameState, topGeometry) {
	try {
		if (!boardGroup) {
			console.error('Board group not initialized');
			return;
		}
		
		if (!gameState || !gameState.board) {
			console.warn('Game state or board not available');
			return;
		}
		
		// Store previous count to avoid unnecessary logging
		const prevActiveCellCount = boardGroup.userData.activeCellCount || 0;
		
		// Clear existing cells
		while (boardGroup.children.length > 0) {
			const child = boardGroup.children[0];
			boardGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) {
				if (Array.isArray(child.material)) {
					child.material.forEach(m => m.dispose());
				} else {
					child.material.dispose();
				}
			}
		}
		
		const board = gameState.board;
		let activeCellCount = 0;
		
		// We'll use this to keep track of cells to add decorations to
		const cellsToDecorate = [];
		
		// Process the board in a single pass
		for (let z = 0; z < board.length; z++) {
			const row = board[z];
			if (!row) continue;
			
			for (let x = 0; x < row.length; x++) {
				const cell = row[x];
				if (!cell || !cell.active) continue;
				
				activeCellCount++;
				
				// Get cell color - use player color if available
				let cellColor = 0x42a5f5; // Default blue
				let isHomeZone = false;
				
				if (cell.playerId && gameState.players && gameState.players[cell.playerId]) {
					cellColor = gameState.players[cell.playerId].color || cellColor;
					isHomeZone = cell.isHomeZone || false;
				}
				
				// Create cell - use MeshBasicMaterial for better visibility
				const cellMesh = createCell(x, z, {
					color: cellColor,
					isHomeZone: isHomeZone,
					// Use standard material for better appearance
					material: new THREE.MeshStandardMaterial({
						color: isHomeZone ? 0xFFD700 : cellColor, // Gold for home zones
						metalness: 0.3,
						roughness: 0.7
					})
				});
				
				// Random chance to add a decoration
				if (Math.random() < 0.2) {
					cellsToDecorate.push({ x, z, cellSize: 1 });
				}
				
				// If there's a chess piece on this cell, add it
				if (cell.chessPiece && cell.chessPiece.type && window.piecesModule) {
					const pieceColor = gameState.players[cell.chessPiece.owner]?.color || 0xFF00FF;
					
					// Add chess piece with height offset to sit on top of the cell
					window.piecesModule.addChessPiece(
						cell.chessPiece,
						cell.chessPiece.owner,
						x,
						z
					);
				}
				
				// If there's a potion on this cell, add it
				if (cell.potion && typeof addPotionToCell === 'function') {
					addPotionToCell({
						x,
						z,
						type: cell.potion.type,
						color: cell.potion.color || 0x00FFFF,
						createdAt: cell.potion.createdAt || Date.now()
					});
				}
			}
		}
		
		// Add decorations to random cells
		if (typeof addCellDecoration === 'function' && cellsToDecorate.length > 0) {
			cellsToDecorate.forEach(cell => {
				addCellDecoration(cell.x, cell.z, cell.cellSize);
			});
		}
		
		// Store the active cell count
		boardGroup.userData.activeCellCount = activeCellCount;
		
		// Only log if the count changed significantly
		if (Math.abs(activeCellCount - prevActiveCellCount) > 5) {
			console.log(`Board updated with ${activeCellCount} active cells`);
		}
	} catch (error) {
		console.error('Error updating board:', error);
	}
}

/**
 * Creates a floating cell at the specified position
 * @param {Object} cell - Cell data
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @param {THREE.BufferGeometry} topGeometry - Geometry for the top of cells
 * @param {Object} decorationData - Data for decorations
 * @returns {THREE.Group} The created cell group
 */
export function createFloatingCell(cell, x, z, cellSize = 1, topGeometry, decorationData) {
	try {
		if (!boardGroup) {
			console.error('Board group not initialized');
			return null;
		}
		
		// Create cell group
		const cellGroup = new THREE.Group();
		
		// Calculate floating height
		const baseHeight = 0.1;
		const floatingHeight = 0;
		
		// Create cell material based on type and owner
		let cellMaterial;
		
		// Determine cell color (either from cell data or from standard materials)
		let cellColor = cell.color || 0x4FC3F7;
		if (cell.isHomeZone) {
			cellColor = 0xFFD54F; // Yellow for home zones
		}
		
		if (materials && materials.cell) {
			cellMaterial = materials.cell.clone();
			if (cellMaterial.map) {
				// Use the existing texture but tint it with the cell color
				cellMaterial.color.setHex(cellColor);
			} else {
				// No texture, just use color
				cellMaterial.color.setHex(cellColor);
			}
		} else {
			// Fallback material
			cellMaterial = new THREE.MeshStandardMaterial({ color: cellColor });
		}
		
		// Make home zone cells more visible
		if (cell.isHomeZone && materials && materials.homeZone) {
			cellMaterial = materials.homeZone.clone();
			cellMaterial.color.setHex(cellColor);
		}
		
		// Create cell geometry
		const cellWidth = cellSize;
		const cellDepth = cellSize;
		const cellHeight = baseHeight;
		
		// Create the cell top (the visible part)
		const topMesh = new THREE.Mesh(
			topGeometry || new THREE.BoxGeometry(cellWidth, cellHeight, cellDepth),
			cellMaterial
		);
		
		// Position the top at the correct height
		topMesh.position.y = floatingHeight + (cellHeight / 2);
		
		// Add top to cell group
		cellGroup.add(topMesh);
		
		// Add a wireframe outline for better visibility
		const wireGeometry = new THREE.EdgesGeometry(topMesh.geometry);
		const wireMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
		const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
		topMesh.add(wireframe);
		
		// Add a debug text label showing coordinates
		if (window.Constants && window.Constants.DEBUG_LOGGING === true) {
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#ffffff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '24px Arial';
			ctx.fillText(`${x},${z}`, 32, 32);
			
			const labelTexture = new THREE.CanvasTexture(canvas);
			const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture });
			const label = new THREE.Sprite(labelMaterial);
			label.scale.set(0.5, 0.5, 1);
			label.position.y = floatingHeight + 0.5;
			cellGroup.add(label);
		}
		
		// Position the cell group at the correct coordinates
		cellGroup.position.set(x, 0, z);
		
		// Add metadata
		cellGroup.userData = {
			type: 'cell',
			x: x,
			z: z,
			playerId: cell.playerId,
			isHomeZone: cell.isHomeZone
		};
		
		// Add to board group
		boardGroup.add(cellGroup);
		
		return cellGroup;
	} catch (error) {
		console.error('Error creating floating cell:', error);
		return null;
	}
}

/**
 * Adds a persistent decoration at the specified position
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} cellSize - Size of the cell
 * @param {Map} decorationData - Map of existing decorations
 */
export function addPersistentDecoration(x, z, cellSize, decorationData) {
	try {
		const posKey = `${x},${z}`;
		
		// Only add if not already present
		if (decorationData && !decorationData.has(posKey)) {
			const decorationType = addCellDecoration(x, z, cellSize);
			decorationData.set(posKey, decorationType);
		}
	} catch (error) {
		console.error('Error adding persistent decoration:', error);
	}
}

/**
 * Creates a floating island of the specified size
 * @param {number} width - Width of the island
 * @param {number} height - Height of the island
 * @returns {THREE.Group} Island group
 */
export function createFloatingIsland(width, height) {
	try {
		// Create a group for the island
		const islandGroup = new THREE.Group();
		
		// Create the top part of the island
		const topGeometry = new THREE.BoxGeometry(width, 0.5, height);
		const topMaterial = new THREE.MeshStandardMaterial({
			color: 0x8B4513, // Brown
			roughness: 0.8,
			metalness: 0.2
		});
		
		const topMesh = new THREE.Mesh(topGeometry, topMaterial);
		topMesh.position.y = 0;
		islandGroup.add(topMesh);
		
		// Add a bottom part
		const bottomPart = createIslandBottom(width, height);
		islandGroup.add(bottomPart);
		
		// Add decorations
		const decorations = addIslandDecorations(width, height);
		islandGroup.add(decorations);
		
		return islandGroup;
	} catch (error) {
		console.error('Error creating floating island:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Creates the bottom part of a floating island
 * @param {number} width - Width of the island
 * @param {number} height - Height of the island
 * @returns {THREE.Group} Bottom group
 */
export function createIslandBottom(width, height) {
	try {
		// Create a group for the bottom
		const bottomGroup = new THREE.Group();
		
		// Create the bottom part with a tapered shape
		const bottomWidth = width * 0.8;
		const bottomHeight = height * 0.8;
		const bottomDepth = 2;
		
		const bottomGeometry = new THREE.BoxGeometry(bottomWidth, bottomDepth, bottomHeight);
		const bottomMaterial = new THREE.MeshStandardMaterial({
			color: 0x5D4037, // Darker brown
			roughness: 0.9,
			metalness: 0.1
		});
		
		const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial);
		bottomMesh.position.y = -bottomDepth / 2 - 0.25;
		bottomGroup.add(bottomMesh);
		
		// Add some stalactites
		const numStalactites = Math.floor(Math.random() * 5) + 3;
		
		for (let i = 0; i < numStalactites; i++) {
			const stalactiteLength = Math.random() * 1.5 + 0.5;
			const stalactiteWidth = Math.random() * 0.3 + 0.1;
			
			const stalactiteGeometry = new THREE.ConeGeometry(
				stalactiteWidth,
				stalactiteLength,
				4
			);
			
			const stalactiteMaterial = new THREE.MeshStandardMaterial({
				color: 0x4E342E, // Very dark brown
				roughness: 0.9,
				metalness: 0.1
			});
			
			const stalactite = new THREE.Mesh(stalactiteGeometry, stalactiteMaterial);
			
			// Position randomly under the island
			const posX = (Math.random() - 0.5) * bottomWidth * 0.8;
			const posZ = (Math.random() - 0.5) * bottomHeight * 0.8;
			stalactite.position.set(posX, -bottomDepth - stalactiteLength / 2, posZ);
			
			// Point downward
			stalactite.rotation.x = Math.PI;
			
			bottomGroup.add(stalactite);
		}
		
		return bottomGroup;
	} catch (error) {
		console.error('Error creating island bottom:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Adds decorations to a floating island
 * @param {number} width - Width of the island
 * @param {number} height - Height of the island
 * @returns {THREE.Group} Decorations group
 */
export function addIslandDecorations(width, height) {
	try {
		// Create a group for the decorations
		const decorationsGroup = new THREE.Group();
		
		// Add some rocks
		const numRocks = Math.floor(Math.random() * 5) + 2;
		
		for (let i = 0; i < numRocks; i++) {
			const rockWidth = Math.random() * 0.5 + 0.2;
			const rockHeight = Math.random() * 0.4 + 0.2;
			const rockDepth = Math.random() * 0.5 + 0.3;
			
			const rockGeometry = new THREE.BoxGeometry(rockWidth, rockDepth, rockHeight);
			
			const rockMaterial = new THREE.MeshStandardMaterial({
				color: new THREE.Color(0x795548).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
				roughness: 0.9,
				metalness: 0.1
			});
			
			const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);
			
			// Position randomly on the island
			const posX = (Math.random() - 0.5) * width * 0.8;
			const posZ = (Math.random() - 0.5) * height * 0.8;
			rockMesh.position.set(posX, rockDepth / 2, posZ);
			
			// Random rotation
			rockMesh.rotation.y = Math.random() * Math.PI;
			
			decorationsGroup.add(rockMesh);
		}
		
		// Add some grass tufts
		const numGrassTufts = Math.floor(Math.random() * 8) + 4;
		
		for (let i = 0; i < numGrassTufts; i++) {
			const posX = (Math.random() - 0.5) * width * 0.9;
			const posZ = (Math.random() - 0.5) * height * 0.9;
			
			// Add grass tuft
			const grassTuft = addCellDecoration(posX, posZ, 1);
			if (grassTuft) {
				decorationsGroup.add(grassTuft);
			}
		}
		
		return decorationsGroup;
	} catch (error) {
		console.error('Error adding island decorations:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Create a cell at the specified position
 * @param {number} x - X position in board coordinates
 * @param {number} z - Z position in board coordinates
 * @param {Object} options - Cell options
 * @returns {THREE.Mesh} Cell mesh
 */
export function createCell(x, z, options = {}) {
	try {
		// Log more details in debug mode
		if (Constants.DEBUG_LOGGING) {
			console.log(`Creating cell at ${x},${z} with options:`, options);
		}
		
		// Check if boardGroup exists
		if (!window.boardGroup) {
			console.error('Board group not initialized. Cannot create cell.');
			return null;
		}
		
		// Default options
		const defaults = {
			width: 1,
			height: 0.2,
			depth: 1,
			color: 0x2196F3,
			wireframe: false,
			isHomeZone: false,
			floating: false,
			floatingHeight: 0,
			oscillate: false,
			texture: null,
			material: null,
			transparent: false,
			opacity: 1.0,
			receiveShadow: true
		};
		
		// Merge options with defaults
		const cellOptions = {...defaults, ...options};
		
		// Create geometry or use cached geometry
		const geometryKey = `${cellOptions.width}-${cellOptions.height}-${cellOptions.depth}`;
		if (!cellGeometryCache[geometryKey]) {
			cellGeometryCache[geometryKey] = new THREE.BoxGeometry(
				cellOptions.width,
				cellOptions.height,
				cellOptions.depth
			);
		}
		const geometry = cellGeometryCache[geometryKey];
		
		// For testing, use MeshBasicMaterial which doesn't require lighting
		let cellMaterial;
		if (cellOptions.material) {
			// Use provided material
			cellMaterial = cellOptions.material;
		} else if (cellOptions.texture) {
			// Use texture with MeshBasicMaterial for visibility in any lighting
			cellMaterial = new THREE.MeshBasicMaterial({
				map: cellOptions.texture,
				color: cellOptions.isHomeZone ? 0xFFFF00 : cellOptions.color, // Make home zones YELLOW for better visibility
				transparent: cellOptions.transparent,
				opacity: cellOptions.opacity,
				wireframe: false
			});
		} else {
			// Use color only with better visibility for testing
			cellMaterial = new THREE.MeshBasicMaterial({
				color: cellOptions.isHomeZone ? 0xFFFF00 : cellOptions.color,
				transparent: cellOptions.transparent,
				opacity: cellOptions.opacity,
				wireframe: false
			});
		}
		
		// Create mesh
		const cell = new THREE.Mesh(geometry, cellMaterial);
		cell.position.set(x, cellOptions.floating ? cellOptions.floatingHeight : 0, z);
		cell.receiveShadow = cellOptions.receiveShadow;
		cell.castShadow = true;
		
		// Add a wireframe outline for better visibility
		try {
			const edgesGeometry = new THREE.EdgesGeometry(geometry);
			const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF, linewidth: 2 });
			const wireframe = new THREE.LineSegments(edgesGeometry, wireframeMaterial);
			cell.add(wireframe);
		} catch (e) {
			console.warn('Could not create wireframe outline:', e);
			
			// Fallback: Create a wireframe box that surrounds the cell
			const wireGeometry = new THREE.BoxGeometry(
				cellOptions.width + 0.02, 
				cellOptions.height + 0.02, 
				cellOptions.depth + 0.02
			);
			const wireMaterial = new THREE.MeshBasicMaterial({ 
				color: 0xFFFFFF, 
				wireframe: true, 
				transparent: true,
				opacity: 0.5
			});
			const wireBox = new THREE.Mesh(wireGeometry, wireMaterial);
			cell.add(wireBox);
		}
		
		// Add debug text label to show coordinates
		// Create a canvas texture with the coordinates
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		
		// Draw background
		ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		// Draw text
		ctx.fillStyle = 'white';
		ctx.font = 'bold 20px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(`${x},${z}`, canvas.width/2, canvas.height/2);
		
		// Create sprite with the canvas texture
		const texture = new THREE.CanvasTexture(canvas);
		const labelMaterial = new THREE.SpriteMaterial({ map: texture });
		const label = new THREE.Sprite(labelMaterial);
		label.position.set(0, cellOptions.height + 0.1, 0);
		label.scale.set(0.5, 0.5, 0.5);
		cell.add(label);
		
		// Add to board group
		window.boardGroup.add(cell);
		
		// Store cell data for later reference
		cell.userData = {
			type: 'cell',
			boardX: x,
			boardZ: z,
			options: cellOptions
		};
		
		return cell;
	} catch (error) {
		console.error('Error creating cell:', error);
		return null;
	}
}

// Export default object with all functions
export default {
	init,
	updateBoard,
	createFloatingCell,
	addPersistentDecoration,
	createFloatingIsland,
	createIslandBottom,
	addIslandDecorations,
	createCell
};
