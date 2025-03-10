/**
 * Renderer Tetromino Module
 * Contains functions for rendering Tetris pieces
 */

import * as THREE from '../../utils/three.js';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight } from './utils.js';

// Shared variables
let tetrominoGroup;
let ghostGroup;

/**
 * Initialize the tetromino module
 * @param {THREE.Group} tetroGroup - The group to add tetromino pieces to
 * @param {THREE.Group} ghostGrp - The group to add ghost pieces to
 */
export function init(tetroGroup, ghostGrp) {
	tetrominoGroup = tetroGroup;
	ghostGroup = ghostGrp;
}

/**
 * Updates the falling tetromino based on the current game state
 * @param {Object} gameState - The current game state
 */
export function updateFallingTetromino(gameState) {
	try {
		// Check if tetrominoGroup is initialized
		if (!tetrominoGroup) {
			console.error('tetrominoGroup is not initialized');
			return;
		}
		
		if (!gameState || !gameState.fallingPiece) {
			// Clear tetromino group if no falling piece
			while (tetrominoGroup.children.length > 0) {
				const child = tetrominoGroup.children[0];
				tetrominoGroup.remove(child);
				if (child.geometry) child.geometry.dispose();
				if (child.material) child.material.dispose();
			}
			return;
		}
		
		// Clear existing tetromino
		while (tetrominoGroup.children.length > 0) {
			const child = tetrominoGroup.children[0];
			tetrominoGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// Get the falling piece data
		const { shape, position, rotation, playerId } = gameState.fallingPiece;
		
		// Create a new 3D group for the tetromino
		const tetrominoGroup3D = new THREE.Group();
		
		// Get player color
		let playerColor = 0xFFFFFF; // Default white
		if (playerId && gameState.players && gameState.players[playerId]) {
			playerColor = gameState.players[playerId].color || 0xFFFFFF;
		}
		
		// Render each block in the tetromino
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					// Calculate world position
					const worldX = position.x + x;
					const worldZ = position.z + y;
					const worldY = position.y;
					
					// Create block geometry
					const blockGeometry = new THREE.BoxGeometry(
						Constants.CELL_SIZE * 0.9,
						Constants.CELL_SIZE * 0.9,
						Constants.CELL_SIZE * 0.9
					);
					
					// Create block material
					const blockMaterial = new THREE.MeshStandardMaterial({
						color: playerColor,
						transparent: true,
						opacity: 0.8,
						roughness: 0.3,
						metalness: 0.7
					});
					
					const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
					
					// Position the block
					blockMesh.position.set(worldX, worldY, worldZ);
					
					// Add to the tetromino group
					tetrominoGroup3D.add(blockMesh);
				}
			}
		}
		
		// Add the tetromino group to the scene
		tetrominoGroup.add(tetrominoGroup3D);
	} catch (error) {
		console.error('Error updating falling tetromino:', error);
	}
}

/**
 * Updates the ghost piece (preview of where the tetromino will land)
 * @param {Object} gameState - The current game state
 */
export function updateGhostPiece(gameState) {
	try {
		// Check if ghostGroup is initialized
		if (!ghostGroup) {
			console.error('ghostGroup is not initialized');
			return;
		}
		
		if (!gameState || !gameState.fallingPiece || !gameState.ghostPiece) {
			// Clear ghost group if no ghost piece
			while (ghostGroup.children.length > 0) {
				const child = ghostGroup.children[0];
				ghostGroup.remove(child);
				if (child.geometry) child.geometry.dispose();
				if (child.material) child.material.dispose();
			}
			return;
		}
		
		// Clear existing ghost piece
		while (ghostGroup.children.length > 0) {
			const child = ghostGroup.children[0];
			ghostGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// Get the ghost piece data
		const { shape, position, playerId } = gameState.ghostPiece;
		
		// Create a new group for the ghost
		const ghostGroup3D = new THREE.Group();
		
		// Get player color
		let playerColor = 0xFFFFFF; // Default white
		if (playerId && gameState.players && gameState.players[playerId]) {
			playerColor = gameState.players[playerId].color || 0xFFFFFF;
		}
		
		// Render each block in the ghost piece
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					// Calculate world position
					const worldX = position.x + x;
					const worldZ = position.z + y;
					const worldY = position.y;
					
					// Create block geometry
					const blockGeometry = new THREE.BoxGeometry(
						Constants.CELL_SIZE * 0.9,
						Constants.CELL_SIZE * 0.2,
						Constants.CELL_SIZE * 0.9
					);
					
					// Create block material - semi-transparent version of player color
					const blockMaterial = new THREE.MeshStandardMaterial({
						color: playerColor,
						transparent: true,
						opacity: 0.3,
						wireframe: true,
						roughness: 0.5,
						metalness: 0.2
					});
					
					const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
					
					// Position the block
					blockMesh.position.set(worldX, worldY, worldZ);
					
					// Add to the ghost group
					ghostGroup3D.add(blockMesh);
				}
			}
		}
		
		// Add the ghost group to the scene
		ghostGroup.add(ghostGroup3D);
	} catch (error) {
		console.error('Error updating ghost piece:', error);
	}
}

// Export default object with all functions
export default {
	init,
	updateFallingTetromino,
	updateGhostPiece
};
