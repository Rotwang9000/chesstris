/**
 * TetrominoRenderer Class
 * 
 * A class-based wrapper around the tetromino.js module functionality
 * for use with the TetrominoPhysics engine
 */

// Import THREE directly since it should be loaded globally by the HTML page
// This avoids module import issues
const THREE = window.THREE;

// Import the tetromino module functions
import * as tetrominoModule from '../rendering/modules/tetromino.js';

export class TetrominoRenderer {
	constructor(renderer) {
		this.renderer = renderer;
		this.tetrominoGroup = new THREE.Group();
		this.ghostGroup = new THREE.Group();
		this.tetrominos = [];
		
		// Add groups to scene
		this.renderer.scene.add(this.tetrominoGroup);
		this.renderer.scene.add(this.ghostGroup);
		
		// Initialize the tetromino module
		tetrominoModule.init(this.tetrominoGroup, this.ghostGroup);
	}
	
	/**
	 * Create a new tetromino and add it to the scene
	 * @param {Array} shape - The shape definition matrix
	 * @param {Number} color - The color as a hex value
	 * @param {Object} userData - Additional data to store with the tetromino
	 * @returns {THREE.Group} - The created tetromino object
	 */
	createTetromino(shape, color, userData = {}) {
		// Create tetromino using adapted module function or direct implementation
		if (tetrominoModule.createTetromino) {
			// If the module has a compatible function, use it
			const tetromino = tetrominoModule.createTetromino(shape, color);
			
			// Add user data
			if (userData) {
				tetromino.userData = {...tetromino.userData, ...userData};
			}
			
			// Add to tracking array
			this.tetrominos.push(tetromino);
			
			return tetromino;
		} else {
			// Otherwise, implement it directly here
			const tetromino = this._createTetrominoDirectly(shape, color, userData);
			this.tetrominos.push(tetromino);
			return tetromino;
		}
	}
	
	/**
	 * Direct implementation of tetromino creation if module doesn't provide it
	 * @private
	 */
	_createTetrominoDirectly(shape, color, userData = {}) {
		const tetrominoGroup = new THREE.Group();
		
		// Get dimensions
		const height = shape.length;
		const width = shape[0].length;
		
		// Create blocks for each cell in the shape
		for (let z = 0; z < height; z++) {
			for (let x = 0; x < width; x++) {
				if (shape[z][x]) {
					// Adjust position to center the tetromino
					const posX = x - Math.floor(width / 2) + 0.5;
					const posZ = z - Math.floor(height / 2) + 0.5;
					
					// Create block geometry and material
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					const material = new THREE.MeshPhongMaterial({
						color: color,
						shininess: 50,
						transparent: true,
						opacity: 0.9
					});
					
					// Create block mesh
					const blockMesh = new THREE.Mesh(geometry, material);
					blockMesh.position.set(posX, 0, posZ);
					
					// Add wireframe using WireframeGeometry
					const wireframe = new THREE.LineSegments(
						new THREE.WireframeGeometry(geometry),
						new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
					);
					blockMesh.add(wireframe);
					
					tetrominoGroup.add(blockMesh);
				}
			}
		}
		
		// Store shape data
		tetrominoGroup.userData = {
			shape: shape,
			width: width,
			height: height,
			...userData
		};
		
		// Add to the main group
		this.tetrominoGroup.add(tetrominoGroup);
		
		return tetrominoGroup;
	}
	
	/**
	 * Remove a tetromino from the scene
	 * @param {THREE.Group} tetromino - The tetromino to remove
	 */
	removeTetromino(tetromino) {
		if (!tetromino) return;
		
		// Remove from tracking array
		const index = this.tetrominos.indexOf(tetromino);
		if (index !== -1) {
			this.tetrominos.splice(index, 1);
		}
		
		// Remove from scene
		this.tetrominoGroup.remove(tetromino);
		
		// Dispose resources
		tetromino.traverse((child) => {
			if (child.geometry) child.geometry.dispose();
			if (child.material) {
				if (Array.isArray(child.material)) {
					child.material.forEach(material => material.dispose());
				} else {
					child.material.dispose();
				}
			}
		});
	}
	
	/**
	 * Clear all tetrominos from the scene
	 */
	clearAllTetrominos() {
		// Make a copy of the array to avoid modification during iteration
		const tetrominos = [...this.tetrominos];
		
		// Remove each tetromino
		tetrominos.forEach(tetromino => {
			this.removeTetromino(tetromino);
		});
		
		// Clear tracking array
		this.tetrominos = [];
	}
	
	/**
	 * Update the ghost piece to show landing position
	 * @param {THREE.Group} tetromino - The active tetromino
	 * @param {Number} groundY - The y-position of the ground
	 * @param {Array} board - The board state for collision detection
	 */
	updateGhostPiece(tetromino, groundY, board) {
		// Clear existing ghost pieces
		while (this.ghostGroup.children.length > 0) {
			const child = this.ghostGroup.children[0];
			this.ghostGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// If no active tetromino, nothing to do
		if (!tetromino) return;
		
		// Get shape from tetromino user data
		const shape = tetromino.userData.shape;
		if (!shape) return;
		
		// Create ghost mesh
		const ghost = this._createGhostMesh(shape, tetromino.userData.color || 0xff00ff);
		
		// Position ghost at landing spot
		ghost.position.set(
			tetromino.position.x,
			groundY,
			tetromino.position.z
		);
		
		// Add to scene
		this.ghostGroup.add(ghost);
	}
	
	/**
	 * Create a semi-transparent ghost mesh for landing preview
	 * @private
	 */
	_createGhostMesh(shape, color) {
		const ghostGroup = new THREE.Group();
		
		// Get dimensions
		const height = shape.length;
		const width = shape[0].length;
		
		// Create blocks for each cell in the shape
		for (let z = 0; z < height; z++) {
			for (let x = 0; x < width; x++) {
				if (shape[z][x]) {
					// Adjust position to center the ghost
					const posX = x - Math.floor(width / 2) + 0.5;
					const posZ = z - Math.floor(height / 2) + 0.5;
					
					// Create block geometry and material
					const geometry = new THREE.BoxGeometry(0.9, 0.1, 0.9);
					const material = new THREE.MeshPhongMaterial({
						color: color,
						shininess: 50,
						transparent: true,
						opacity: 0.2,
						wireframe: true
					});
					
					// Create block mesh
					const blockMesh = new THREE.Mesh(geometry, material);
					blockMesh.position.set(posX, 0, posZ);
					
					ghostGroup.add(blockMesh);
				}
			}
		}
		
		return ghostGroup;
	}
} 