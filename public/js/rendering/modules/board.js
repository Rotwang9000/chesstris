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
 * Updates the board based on the current game state
 * @param {Object} gameState - The current game state
 * @param {Object} topGeometry - The geometry to use for cell tops
 */
export function updateBoard(gameState, topGeometry) {
	try {
		if (!gameState || !gameState.board) {
			console.warn('No game state or board available for rendering');
			return;
		}
		
		// Clear existing board elements
		while (boardGroup.children.length > 0) {
			const child = boardGroup.children[0];
			boardGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// Track active cells for debugging
		let activeCellCount = 0;
		
		// Render each cell in the board
		const boardSize = gameState.board.length;
		const cellSize = gameState.cellSize || Constants.CELL_SIZE || 1;
		
		for (let z = 0; z < boardSize; z++) {
			for (let x = 0; x < boardSize; x++) {
				const cell = gameState.board[z] && gameState.board[z][x];
				
				// Only render cells that exist and have content
				if (cell && (cell.playerId || cell.isHomeZone || cell.chessPiece || cell.hasPotion)) {
					createFloatingCell(cell, x, z, cellSize, topGeometry, decorationPositions);
					activeCellCount++;
				}
			}
		}
		
		console.log(`Rendered ${activeCellCount} active cells`);
	} catch (error) {
		console.error('Error updating board:', error);
	}
}

/**
 * Creates a floating cell at the specified position
 * @param {Object} cell - Cell data
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} cellSize - Size of the cell
 * @param {THREE.Geometry} topGeometry - Geometry for the top of the cell
 * @param {Map} decorationData - Map of existing decorations
 * @returns {THREE.Group} Cell group
 */
export function createFloatingCell(cell, x, z, cellSize = 1, topGeometry, decorationData) {
	try {
		// Create a group to hold all parts of this cell
		const cellGroup = new THREE.Group();
		
		// Validate parameters
		if (isNaN(x) || isNaN(z)) {
			console.warn(`Invalid coordinates for cell: x=${x}, z=${z}`);
			return cellGroup; // Return empty group
		}
		
		// Use provided cellSize or default to 1 if not provided
		cellSize = cellSize || Constants.CELL_SIZE || 1;
		
		// Determine cell material based on type
		let material;
		if (cell.isHomeZone) {
			material = new THREE.MeshPhongMaterial({
				color: cell.color || 0x3366CC,
				shininess: 80
			});
		} else {
			material = new THREE.MeshPhongMaterial({
				color: cell.color || 0xAAAAAA,
				shininess: 50
			});
		}
		
		// Create the top part of the cell
		const topMesh = new THREE.Mesh(topGeometry, material);
		topMesh.position.y = getFloatingHeight(x, z);
		cellGroup.add(topMesh);
		
		// Add a bottom part to give depth
		const bottomPart = addCellBottom(x, z, cellSize, material.color);
		if (bottomPart) {
			cellGroup.add(bottomPart);
		}
		
		// Position the cell
		cellGroup.position.set(0, 0, 0);
		
		// Add decorations if they don't already exist
		const posKey = `${x},${z}`;
		if (decorationData) {
			// Check if decorationData is a Map
			if (decorationData instanceof Map) {
				if (!decorationData.has(posKey)) {
					addCellDecoration(x, z, cellSize);
				}
			} else if (decorationData.positions) {
				// Assume it's an object with a positions property
				if (!decorationData.positions[posKey]) {
					addCellDecoration(x, z, cellSize);
				}
			} else {
				// Default behavior: always add decoration
				addCellDecoration(x, z, cellSize);
			}
		}
		
		// Add to the board group
		boardGroup.add(cellGroup);
		
		return cellGroup;
	} catch (error) {
		console.error('Error creating floating cell:', error);
		return new THREE.Group(); // Return empty group on error
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

// Export default object with all functions
export default {
	init,
	updateBoard,
	createFloatingCell,
	addPersistentDecoration,
	createFloatingIsland,
	createIslandBottom,
	addIslandDecorations
};
