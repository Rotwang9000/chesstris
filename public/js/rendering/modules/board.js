/**
 * Renderer Board Module
 * Contains functions for rendering the game board and cells
 */

import * as THREE from 'three';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight } from './utils.js';
import { 
	addCellDecoration, 
	addCellBottom, 
	createTreeForCell, 
	createMushroomForCell 
} from './effects.js';

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
export function init(group, materialSet = null) {
	boardGroup = group;
	if (materialSet) {
		materials = materialSet;
	}
	decorationPositions = new Map();
}

/**
 * Updates the board based on the game state
 * @param {Object} gameState - The game state
 */
export function updateBoard(gameState) {
	try {
		// Check if board group is initialized
		if (!boardGroup) {
			console.error('Board group not initialized');
			return;
		}
		
		// Clear existing board
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}

		// Get board data
		let boardData = null;
		
		// Try to get board data from gameState
		if (gameState && gameState.board) {
			boardData = gameState.board;
			console.log('Using board data from gameState');
		} else {
			// Try to get board data from ChessPieceManager
			try {
				// Dynamic import to avoid circular dependencies
				import('../../../js/core/chessPieceManager.js').then(module => {
					const ChessPieceManager = module.default || module;
					if (ChessPieceManager && typeof ChessPieceManager.getBoard === 'function') {
						try {
							boardData = ChessPieceManager.getBoard();
							console.log('Using board data from ChessPieceManager');
							
							// Check if boardData is valid
							if (boardData && Array.isArray(boardData) && boardData.length > 0) {
								renderBoardFromData(boardData);
							} else {
								console.warn('Invalid board data from ChessPieceManager, rendering default board');
								renderDefaultBoard();
							}
						} catch (error) {
							console.error('Error getting board data from ChessPieceManager:', error);
							renderDefaultBoard();
						}
					} else {
						console.warn('ChessPieceManager or getBoard method not found');
						renderDefaultBoard();
					}
				}).catch(error => {
					console.error('Error importing ChessPieceManager:', error);
					renderDefaultBoard();
				});
				return; // Return early as we'll render asynchronously
			} catch (error) {
				console.error('Error getting board data from ChessPieceManager:', error);
				renderDefaultBoard();
				return;
			}
		}

		// Render board based on available data
		if (boardData) {
			renderBoardFromData(boardData);
		} else {
			renderDefaultBoard();
		}
	} catch (error) {
		console.error('Error updating board:', error);
		renderDefaultBoard();
	}
}

/**
 * Render board from provided board data
 * @param {Array} boardData - 2D array of board data
 */
function renderBoardFromData(boardData) {
	try {
		if (!boardData || !Array.isArray(boardData)) {
			console.warn('Invalid board data, rendering default board');
			renderDefaultBoard();
			return;
		}

		const boardSize = boardData.length;
		
		// Create cells based on board data
		for (let z = 0; z < boardSize; z++) {
			for (let x = 0; x < boardSize; x++) {
				const cell = boardData[z][x];
				
				if (cell) {
					const isHomeZone = cell.isHomeZone || false;
					const color = cell.color || ((x + z) % 2 === 0 ? 0x4FC3F7 : 0x29B6F6);
					
					createCell(x - boardSize/2 + 0.5, z - boardSize/2 + 0.5, {
						color: color,
						isHomeZone: isHomeZone
					});
				}
			}
		}
		
		console.log('Board rendered from data');
	} catch (error) {
		console.error('Error rendering board from data:', error);
		renderDefaultBoard();
	}
}

/**
 * Render default checkerboard pattern
 */
function renderDefaultBoard() {
	try {
		console.log('Rendering default board');
		const boardSize = 8;
		
		// Create default checkerboard pattern
		for (let z = 0; z < boardSize; z++) {
			for (let x = 0; x < boardSize; x++) {
				const color = (x + z) % 2 === 0 ? 0x4FC3F7 : 0x29B6F6;
				
				createCell(x - boardSize/2 + 0.5, z - boardSize/2 + 0.5, {
					color: color,
					isHomeZone: false
				});
			}
		}
	} catch (error) {
		console.error('Error rendering default board:', error);
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
		
		// Use cached geometry if available
		const geometryKey = `${cellWidth}_${cellDepth}_${cellHeight}`;
		if (!cellGeometryCache[geometryKey]) {
			cellGeometryCache[geometryKey] = new THREE.BoxGeometry(cellWidth, cellHeight, cellDepth);
		}
		
		// Create cell mesh
		const cellMesh = new THREE.Mesh(cellGeometryCache[geometryKey], cellMaterial);
		cellMesh.position.set(0, 0, 0);
		cellGroup.add(cellMesh);
		
		// Add bottom part to make it look like a floating island
		const bottom = addCellBottom(x, z, cellSize, cellColor);
		cellGroup.add(bottom);
		
		// Add decorations based on cell type
		if (!cell.isHomeZone) {
			// Add trees or mushrooms with a random chance
			if (Math.random() < 0.3) { // 30% chance for a tree
				const tree = createTreeForCell(x, z, cellSize);
				cellGroup.add(tree);
			} else if (Math.random() < 0.2) { // 20% chance for a mushroom
				const mushroom = createMushroomForCell(x, z, cellSize);
				cellGroup.add(mushroom);
			}
		}
		
		// Position the cell group
		cellGroup.position.set(x, floatingHeight, z);
		
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
		// Check if boardGroup exists
		if (!boardGroup) {
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
		
		// Create material
		let cellMaterial;
		if (cellOptions.material) {
			cellMaterial = cellOptions.material;
		} else if (cellOptions.texture) {
			cellMaterial = new THREE.MeshStandardMaterial({
				map: cellOptions.texture,
				color: cellOptions.isHomeZone ? 0xFFD54F : cellOptions.color,
				transparent: cellOptions.transparent,
				opacity: cellOptions.opacity
			});
		} else {
			cellMaterial = new THREE.MeshStandardMaterial({
				color: cellOptions.isHomeZone ? 0xFFD54F : cellOptions.color,
				transparent: cellOptions.transparent,
				opacity: cellOptions.opacity
			});
		}
		
		// Create mesh
		const cell = new THREE.Mesh(geometry, cellMaterial);
		cell.position.set(x, cellOptions.floating ? cellOptions.floatingHeight : 0, z);
		cell.receiveShadow = cellOptions.receiveShadow;
		cell.castShadow = true;
		
		// Add to board group
		boardGroup.add(cell);
		
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
