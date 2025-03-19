/**
 * Renderer Effects Module
 * Contains functions for visual effects, decorations, and animations
 */

import * as THREE from 'three';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight } from './utils.js';

// Define createPseudoRandomGenerator if it's not available
const createPseudoRandomGenerator = window.createPseudoRandomGenerator || function(initialSeed = 1) {
	let seed = initialSeed || Math.random() * 10000;
	return function(multiplier = 1, offset = 0) {
		seed = (seed * 9301 + 49297) % 233280;
		return (seed / 233280) * multiplier + offset;
	};
};

// Shared variables
let decorationsGroup; // Group for all decorations
let potions = []; // Array to track all potions
let particles = []; // Array to track all particles

/**
 * Initialize the effects module
 * @param {THREE.Group} decorGroup - The group to add decorations to
 */
export function init(decorGroup) {
	if (!decorGroup) {
		console.error('decorationsGroup is not initialized');
		return;
	}
	
	decorationsGroup = decorGroup;
	potions = [];
	particles = [];
}

/**
 * Adds a grass tuft decoration at the specified position
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} radius - Radius of the grass tuft
 * @param {number} seed - Random seed for consistent generation
 */
export function addGrassTuft(x, z, radius, seed = 0) {
	try {
		// Create a pseudorandom function based on the seed
		const pseudoRandom = createPseudoRandomGenerator(seed);
		
		// Create a group for the grass blades
		const grassGroup = new THREE.Group();
		
		// Number of grass blades
		const numBlades = Math.floor(pseudoRandom(5, 10) + 5);
		
		// Create multiple blades of grass
		for (let i = 0; i < numBlades; i++) {
			// Randomize height and position within the radius
			const bladeHeight = radius * (pseudoRandom(0.5, i) + 0.5);
			const angle = pseudoRandom(Math.PI * 2, i * 100);
			const distance = pseudoRandom(radius, i * 200);
			
			// Position the blade within the tuft
			const posX = x + Math.cos(angle) * distance;
			const posZ = z + Math.sin(angle) * distance;
			
			// Create the blade geometry
			const bladeGeometry = new THREE.BoxGeometry(0.02, bladeHeight, 0.02);
			
			// Randomize the color slightly
			const greenHue = 0.3 + pseudoRandom(0.1, i * 300) - 0.05;
			const greenSaturation = 0.7 + pseudoRandom(0.3, i * 400) - 0.15;
			const greenLightness = 0.35 + pseudoRandom(0.15, i * 500) - 0.075;
			
			const grassColor = new THREE.Color().setHSL(greenHue, greenSaturation, greenLightness);
			const grassMaterial = new THREE.MeshStandardMaterial({
				color: grassColor,
				roughness: 0.8,
				metalness: 0.1
			});
			
			const blade = new THREE.Mesh(bladeGeometry, grassMaterial);
			
			// Position and rotate the blade
			blade.position.set(posX, getFloatingHeight(posX, posZ) + bladeHeight * 0.5, posZ);
			
			// Random rotation for natural look
			blade.rotation.x = pseudoRandom(0.2, i * 600) - 0.1;
			blade.rotation.y = pseudoRandom(Math.PI * 2, i * 700);
			blade.rotation.z = pseudoRandom(0.3, i * 800) - 0.15;
			
			grassGroup.add(blade);
		}
		
		// Add to the scene
		if (decorationsGroup) {
			decorationsGroup.add(grassGroup);
		}
		
		return grassGroup;
	} catch (error) {
		console.error('Error adding grass tuft:', error);
		return null;
	}
}

/**
 * Adds a potion effect to a cell
 * @param {Object} cell - Cell data
 * @returns {Object} Potion mesh
 */
export function addPotionToCell(cell) {
	try {
		// Get the game state to determine position
		const gameState = window.GameState.getGameState();
		
		// Find cell position in the board
		let cellX, cellZ;
		const boardSize = gameState.board.length;
		
		// Search the board for the cell to get its coordinates
		for (let x = 0; x < boardSize; x++) {
			for (let z = 0; z < boardSize; z++) {
				if (gameState.board[z] && gameState.board[z][x] === cell) {
					cellX = x;
					cellZ = z;
					break;
				}
			}
		}
		
		if (cellX === undefined || cellZ === undefined) {
			console.warn('Could not find cell position for potion');
			return null;
		}
		
		// Create potion
		const potionGeometry = new THREE.SphereGeometry(Constants.CELL_SIZE * 0.3, 16, 16);
		
		// Use a glowing material for the potion
		const potionColor = cell.potionColor || 0x00ff00; // Default to green
		const potionMaterial = new THREE.MeshStandardMaterial({
			color: potionColor,
			emissive: potionColor,
			emissiveIntensity: 0.5,
			transparent: true,
			opacity: 0.8
		});
		
		const potionMesh = new THREE.Mesh(potionGeometry, potionMaterial);
		
		// Position the potion above the cell
		const yPos = getFloatingHeight(cellX, cellZ) + 0.5;
		potionMesh.position.set(cellX, yPos, cellZ);
		
		// Add to the scene
		if (decorationsGroup) {
			decorationsGroup.add(potionMesh);
		}
		
		// Add particles around the potion
		addPotionParticles(cellX, cellZ, potionColor);
		
		// Add to tracking array
		const potionData = {
			mesh: potionMesh,
			baseY: yPos,
			phase: Math.random() * Math.PI * 2, // Random starting phase
			cell: cell
		};
		
		potions.push(potionData);
		
		return potionMesh;
	} catch (error) {
		console.error('Error adding potion to cell:', error);
		return null;
	}
}

/**
 * Adds particle effects around a potion
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} color - Particle color
 */
export function addPotionParticles(x, z, color) {
	try {
		const numParticles = 5 + Math.floor(Math.random() * 3);
		
		for (let i = 0; i < numParticles; i++) {
			// Random position around the potion
			const angle = Math.random() * Math.PI * 2;
			const distance = 0.2 + Math.random() * 0.3;
			const particleX = x + Math.cos(angle) * distance;
			const particleZ = z + Math.sin(angle) * distance;
			const particleY = getFloatingHeight(particleX, particleZ) + 0.5 + Math.random() * 0.5;
			
			// Random size for variety
			const particleSize = 0.05 + Math.random() * 0.08;
			
			// Create particle
			const particleGeometry = new THREE.SphereGeometry(particleSize, 4, 4);
			
			// Slightly lighter color than the potion
			const particleMaterial = new THREE.MeshBasicMaterial({
				color: color,
				transparent: true,
				opacity: 0.6 + Math.random() * 0.4
			});
			
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			particle.position.set(particleX, particleY, particleZ);
			
			// Add to the scene
			if (decorationsGroup) {
				decorationsGroup.add(particle);
			}
			
			// Add to tracking array
			particles.push({
				mesh: particle,
				basePosition: new THREE.Vector3(particleX, particleY, particleZ),
				phase: Math.random() * Math.PI * 2,
				orbitRadius: Math.random() * 0.2,
				orbitSpeed: (Math.random() * 0.5 + 0.5) * (Math.random() > 0.5 ? 1 : -1),
				pulseSpeed: Math.random() * 2 + 1
			});
		}
	} catch (error) {
		console.error('Error adding potion particles:', error);
	}
}

/**
 * Animates potions and their particle effects
 * @param {number} deltaTime - Time elapsed since last frame in seconds
 */
export function animatePotionsAndParticles(deltaTime) {
	try {
		// Animate potions
		potions.forEach(potion => {
			if (potion.mesh) {
				// Bob up and down
				potion.phase += deltaTime * 2;
				const yOffset = Math.sin(potion.phase) * 0.1;
				potion.mesh.position.y = potion.baseY + yOffset;
				
				// Slow rotation
				potion.mesh.rotation.y += deltaTime * 0.5;
			}
		});
		
		// Animate particles
		particles.forEach(particle => {
			if (particle.mesh) {
				// Update phase
				particle.phase += deltaTime * particle.orbitSpeed;
				
				// Orbit around base position
				const orbitX = Math.cos(particle.phase) * particle.orbitRadius;
				const orbitZ = Math.sin(particle.phase) * particle.orbitRadius;
				
				// Vertical bobbing
				const yOffset = Math.sin(particle.phase * particle.pulseSpeed) * 0.05;
				
				// Apply new position
				particle.mesh.position.set(
					particle.basePosition.x + orbitX,
					particle.basePosition.y + yOffset,
					particle.basePosition.z + orbitZ
				);
				
				// Pulsate opacity
				if (particle.mesh.material) {
					particle.mesh.material.opacity = 0.6 + Math.sin(particle.phase * 2) * 0.4;
				}
			}
		});
	} catch (error) {
		console.error('Error animating potions and particles:', error);
	}
}

/**
 * Adds a stone decoration at the specified position
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} y - Y coordinate (height)
 * @param {number} cellSize - Size of the cell
 * @param {number} seed - Random seed for consistent generation
 */
export function addStoneDecoration(x, z, y, cellSize, seed = 0) {
	try {
		// Create a pseudorandom function based on the seed
		const pseudoRandom = createPseudoRandomGenerator(seed);
		
		// Create a group for the stones
		const stoneGroup = new THREE.Group();
		
		// Number of stones
		const numStones = Math.floor(pseudoRandom(3, 1) + 1);
		
		for (let i = 0; i < numStones; i++) {
			// Random position within the cell
			const offsetX = (pseudoRandom(cellSize * 0.8, i * 10) - cellSize * 0.4);
			const offsetZ = (pseudoRandom(cellSize * 0.8, i * 20) - cellSize * 0.4);
			const posX = x + offsetX;
			const posZ = z + offsetZ;
			
			// Random size and appearance
			const stoneSize = cellSize * (0.05 + pseudoRandom(0.15, i * 30));
			const stoneBrightness = 0.6 + pseudoRandom(0.3, i * 40);
			
			// Create stone geometry
			const stoneGeometry = new THREE.SphereGeometry(stoneSize, 4, 4);
			
			// Create stone material
			const stoneMaterial = new THREE.MeshStandardMaterial({
				color: new THREE.Color(stoneBrightness, stoneBrightness, stoneBrightness),
				roughness: 0.9,
				metalness: 0.1
			});
			
			const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
			
			// Position the stone
			stone.position.set(posX, y + stoneSize * 0.8, posZ);
			
			// Random rotation
			stone.rotation.x = pseudoRandom(Math.PI, i * 50);
			stone.rotation.y = pseudoRandom(Math.PI, i * 60);
			stone.rotation.z = pseudoRandom(Math.PI, i * 70);
			
			// Random scale to make stones look less perfectly spherical
			stone.scale.y = 0.7 + pseudoRandom(0.6, i * 80);
			
			stoneGroup.add(stone);
		}
		
		// Add to the scene
		if (decorationsGroup) {
			decorationsGroup.add(stoneGroup);
		}
		
		return stoneGroup;
	} catch (error) {
		console.error('Error adding stone decoration:', error);
		return null;
	}
}

/**
 * Adds a mushroom decoration at the specified position
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} y - Y coordinate (height)
 * @param {number} cellSize - Size of the cell
 * @param {number} seed - Random seed for consistent generation
 */
export function addMushroomDecoration(x, z, y, cellSize, seed = 0) {
	try {
		// Create a pseudorandom function based on the seed
		const pseudoRandom = createPseudoRandomGenerator(seed);
		
		// Create a group for the mushrooms
		const mushroomGroup = new THREE.Group();
		
		// Number of mushrooms
		const numMushrooms = Math.floor(pseudoRandom(2, 1) + 1);
		
		for (let i = 0; i < numMushrooms; i++) {
			// Random position within the cell
			const offsetX = (pseudoRandom(cellSize * 0.8, i * 10) - cellSize * 0.4);
			const offsetZ = (pseudoRandom(cellSize * 0.8, i * 20) - cellSize * 0.4);
			const posX = x + offsetX;
			const posZ = z + offsetZ;
			
			// Group for this mushroom
			const mushroom = new THREE.Group();
			
			// Stem
			const stemHeight = cellSize * (0.1 + pseudoRandom(0.2, i * 30));
			const stemRadius = cellSize * (0.02 + pseudoRandom(0.03, i * 40));
			
			const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius * 1.2, stemHeight, 8);
			
			const stemMaterial = new THREE.MeshStandardMaterial({
				color: new THREE.Color(0.9, 0.9, 0.8),
				roughness: 0.6,
				metalness: 0.1
			});
			
			const stem = new THREE.Mesh(stemGeometry, stemMaterial);
			stem.position.y = stemHeight / 2;
			mushroom.add(stem);
			
			// Cap
			const capRadius = stemRadius * (2 + pseudoRandom(2, i * 50));
			const capGeometry = new THREE.SphereGeometry(capRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
			
			// Random color based on the seed
			let capColor;
			if (pseudoRandom(1, i * 60) > 0.7) {
				// Red mushroom
				capColor = new THREE.Color(0.8, 0.1, 0.1);
			} else {
				// Brown mushroom
				capColor = new THREE.Color(0.6, 0.3, 0.1);
			}
			
			const capMaterial = new THREE.MeshStandardMaterial({
				color: capColor,
				roughness: 0.7,
				metalness: 0.1
			});
			
			const cap = new THREE.Mesh(capGeometry, capMaterial);
			cap.position.y = stemHeight;
			mushroom.add(cap);
			
			// Position the mushroom
			mushroom.position.set(posX, y, posZ);
			
			// Random tilt
			mushroom.rotation.x = pseudoRandom(0.3, i * 70) - 0.15;
			mushroom.rotation.z = pseudoRandom(0.3, i * 80) - 0.15;
			
			mushroomGroup.add(mushroom);
		}
		
		// Add to the scene
		if (decorationsGroup) {
			decorationsGroup.add(mushroomGroup);
		}
		
		return mushroomGroup;
	} catch (error) {
		console.error('Error adding mushroom decoration:', error);
		return null;
	}
}

/**
 * Adds appropriate decorations to a cell
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} cellSize - Size of the cell
 */
export function addCellDecoration(x, z, cellSize) {
	try {
		// Create a decoration based on pseudorandom position
		const seed = Math.abs(x * 1000 + z);
		const pseudoRandom = createPseudoRandomGenerator(seed);
		
		const decorationType = Math.floor(pseudoRandom(4));
		
		// Apply the appropriate decoration
		switch (decorationType) {
			case 0:
				// Grass tufts
				addGrassTuft(x, z, cellSize * 0.1, seed);
				break;
			case 1:
				// Stones
				addStoneDecoration(x, z, getFloatingHeight(x, z), cellSize, seed);
				break;
			case 2:
				// Mushrooms
				addMushroomDecoration(x, z, getFloatingHeight(x, z), cellSize, seed);
				break;
			case 3:
				// Stalactites handled by cell bottom
				break;
		}
		
		// Track that we've added a decoration at this position
		if (window.gameState && window.gameState.cellDecorations) {
			window.gameState.cellDecorations.set(`${x},${z}`, decorationType);
		}
		
		return decorationType;
	} catch (error) {
		console.error('Error adding cell decoration:', error);
		return -1;
	}
}

/**
 * Creates a skybox for the scene
 * @returns {THREE.Mesh} The skybox mesh
 */
export function createSkybox() {
	try {
		// Create a large sphere for the sky
		const geometry = new THREE.BoxGeometry(2000, 2000, 2000);
		
		// Create gradient materials for each side of the box
		const materials = [];
		
		// Top - lighter blue with a hint of cyan
		materials.push(new THREE.MeshBasicMaterial({
			color: 0x87CEFA, // Light sky blue
			side: THREE.BackSide
		}));
		
		// Bottom - deeper blue
		materials.push(new THREE.MeshBasicMaterial({
			color: 0x1E3F66, // Deep blue
			side: THREE.BackSide
		}));
		
		// Four sides - gradient from light to darker blue
		for (let i = 0; i < 4; i++) {
			const canvas = document.createElement('canvas');
			canvas.width = 512;
			canvas.height = 512;
			const context = canvas.getContext('2d');
			
			// Create gradient
			const gradient = context.createLinearGradient(0, 0, 0, 512);
			gradient.addColorStop(0, '#87CEFA'); // Light sky blue at top
			gradient.addColorStop(0.5, '#6CA6CD'); // Medium blue in middle
			gradient.addColorStop(1, '#1E3F66'); // Deep blue at bottom
			
			context.fillStyle = gradient;
			context.fillRect(0, 0, 512, 512);
			
			const texture = new THREE.CanvasTexture(canvas);
			materials.push(new THREE.MeshBasicMaterial({
				map: texture,
				side: THREE.BackSide
			}));
		}
		
		// Create skybox with materials
		const skybox = new THREE.Mesh(geometry, materials);
		
		return skybox;
	} catch (error) {
		console.error('Error creating skybox:', error);
		return null;
	}
}

/**
 * Adds clouds to the scene
 * @param {THREE.Scene} scene - The scene to add clouds to
 */
export function addClouds(scene) {
	try {
		if (!scene) {
			console.error('Scene is not initialized');
			return;
		}
		
		// Create a group for clouds
		const cloudsGroup = new THREE.Group();
		cloudsGroup.name = 'clouds';
		
		// Add multiple clouds
		for (let i = 0; i < 20; i++) {
			const cloud = createCloud();
			
			// Position cloud randomly in the sky
			cloud.position.set(
				(Math.random() - 0.5) * 1000,
				100 + Math.random() * 200,
				(Math.random() - 0.5) * 1000
			);
			
			// Random rotation
			cloud.rotation.y = Math.random() * Math.PI * 2;
			
			// Random scale
			const scale = 10 + Math.random() * 20;
			cloud.scale.set(scale, scale, scale);
			
			cloudsGroup.add(cloud);
		}
		
		scene.add(cloudsGroup);
		
		// Animate clouds
		animateClouds(cloudsGroup);
		
		return cloudsGroup;
	} catch (error) {
		console.error('Error adding clouds:', error);
		return null;
	}
}

/**
 * Creates a single cloud made of multiple rectangular puffs
 * @returns {THREE.Group} The cloud group
 */
function createCloud() {
	try {
		// Create a group for the cloud
		const cloudGroup = new THREE.Group();
		
		// Cloud material - soft white with high transparency for subtlety
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
				transparent: true,
			opacity: 0.4 // More transparent for subtlety
		});
		
		// Number of puffs in this cloud
		const puffCount = 3 + Math.floor(Math.random() * 3); // Fewer puffs for simpler clouds
		
		// Create multiple puffs to form a cloud
		for (let i = 0; i < puffCount; i++) {
			// Create a rounded rectangle for each puff
			const width = 3 + Math.random() * 4; // Wider rectangles
			const height = 0.5 + Math.random() * 1; // Flatter rectangles
			const depth = 2 + Math.random() * 3;
			
			const geometry = new THREE.BoxGeometry(width, height, depth);
			const puff = new THREE.Mesh(geometry, material);
			
			// Position puffs to form a cloud shape
			puff.position.set(
				(Math.random() - 0.5) * 4, // Spread out more horizontally
				(Math.random() - 0.5) * 0.5, // Less vertical variation
				(Math.random() - 0.5) * 3
			);
			
			// Random rotation for variety
			puff.rotation.z = Math.random() * Math.PI * 0.05; // Less rotation for more rectangular look
			
			cloudGroup.add(puff);
		}
		
		return cloudGroup;
	} catch (error) {
		console.error('Error creating cloud:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Animates the clouds with gentle movement
 * @param {THREE.Group} cloudsGroup - The group containing all clouds
 */
function animateClouds(cloudsGroup) {
	if (!cloudsGroup) return;
	
	// Animation function
	function animate() {
		requestAnimationFrame(animate);
		
		// Move each cloud slightly
		cloudsGroup.children.forEach((cloud, index) => {
			// Different speeds for different clouds
			const speed = 0.05 + (index % 3) * 0.02;
			
			// Move cloud along x-axis
			cloud.position.x += speed;
			
			// If cloud moves too far, reset position
			if (cloud.position.x > 500) {
				cloud.position.x = -500;
			}
		});
	}
	
	// Start animation
	animate();
}

/**
 * Adds bottom decoration to a cell (stalactites, etc.)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} cellSize - Size of the cell
 * @param {THREE.Color} color - Color of the cell
 * @returns {THREE.Group} Group containing bottom decorations
 */
export function addCellBottom(x, z, cellSize, color) {
	try {
		// Create a group to hold all bottom elements
		const bottomGroup = new THREE.Group();
		
		// Add code to validate parameters
		if (isNaN(x) || isNaN(z) || isNaN(cellSize)) {
			console.warn(`Invalid parameters in addCellBottom: x=${x}, z=${z}, cellSize=${cellSize}`);
			return bottomGroup; // Return empty group to avoid errors
		}
		
		// Determine if this cell should have stalactites based on position
		const seed = Math.abs(Math.floor(x * 1000 + z));
		const pseudoRandom = createPseudoRandomGenerator(seed);
		
		const hasStalactites = pseudoRandom() < 0.3; // 30% chance
		
		if (hasStalactites) {
			const count = Math.floor(pseudoRandom(3, 100)) + 1;
			
			for (let i = 0; i < count; i++) {
				// Calculate stalactite parameters
				let radius = cellSize * 0.07 * (pseudoRandom(1, i * 10) + 0.5);
				let height = cellSize * (0.2 + pseudoRandom(0.2, i * 20));
				
				// Validate to prevent NaN values
				radius = isNaN(radius) ? cellSize * 0.05 : radius;
				height = isNaN(height) ? cellSize * 0.2 : height;
				
				// Create stalactite
				const stalactiteGeometry = new THREE.ConeGeometry(
					radius,
					height,
					8
				);
				
				const darkerColor = new THREE.Color(color).multiplyScalar(0.7);
				const stalactiteMaterial = new THREE.MeshStandardMaterial({
					color: darkerColor,
					roughness: 0.9,
					metalness: 0.1
				});
				
				const stalactite = new THREE.Mesh(stalactiteGeometry, stalactiteMaterial);
				
				// Position stalactite
				let offsetX = (pseudoRandom(cellSize * 0.8, i * 30) - cellSize * 0.4);
				let offsetZ = (pseudoRandom(cellSize * 0.8, i * 40) - cellSize * 0.4);
				
				// Validate to prevent NaN values
				offsetX = isNaN(offsetX) ? 0 : offsetX;
				offsetZ = isNaN(offsetZ) ? 0 : offsetZ;
				
				stalactite.position.set(
					x + offsetX,
					getFloatingHeight(x, z) - (cellSize * 0.5) - (height * 0.5),
					z + offsetZ
				);
				
				// Point stalactite downward
				stalactite.rotation.x = Math.PI;
				
				bottomGroup.add(stalactite);
			}
		}
		
		return bottomGroup;
	} catch (error) {
		console.error('Error creating cell bottom:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Adds Russian theme elements to the scene
 * @param {THREE.Scene} scene - The scene to add elements to
 */
export function addRussianThemeElements(scene) {
	try {
		console.log('Adding Russian theme elements to the scene');
		
		if (!scene) {
			console.error('Scene is not initialized');
			return;
		}
		
		// Create a group for all Russian theme elements
		const russianThemeGroup = new THREE.Group();
		russianThemeGroup.name = 'russianThemeElements';
		
		// We'll add decorative elements that will appear on cells
		// These will be added to the scene when cells are created
		
		// Add skybox
		const skybox = createSkybox();
		if (skybox) {
			scene.add(skybox);
		}
		
		// Add clouds
		addClouds(scene);
		
		scene.add(russianThemeGroup);
		
		console.log('Russian theme elements added successfully');
		return russianThemeGroup;
	} catch (error) {
		console.error('Error adding Russian theme elements:', error);
		return null;
	}
}

/**
 * Creates a tree decoration for a cell
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @returns {THREE.Group} The tree group
 */
export function createTreeForCell(x, z, cellSize) {
	try {
		// Create a group for the tree
		const treeGroup = new THREE.Group();
		
		// Create trunk
		const trunkGeometry = new THREE.CylinderGeometry(
			cellSize * 0.05, // top radius
			cellSize * 0.08, // bottom radius
			cellSize * 0.4, // height
			8 // radial segments
		);
		
		const trunkMaterial = new THREE.MeshLambertMaterial({
			color: 0x8B4513 // Brown
		});
		
		const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
		trunk.position.y = cellSize * 0.2; // Half of trunk height
		treeGroup.add(trunk);
		
		// Create foliage (multiple cones for a pine tree look)
		const foliageMaterial = new THREE.MeshLambertMaterial({
			color: 0x228B22 // Forest green
		});
		
		// Add 3 cones of decreasing size
		for (let i = 0; i < 3; i++) {
			const coneHeight = cellSize * (0.3 - i * 0.05);
			const coneRadius = cellSize * (0.15 - i * 0.03);
			
			const coneGeometry = new THREE.ConeGeometry(
				coneRadius,
				coneHeight,
				8 // radial segments
			);
			
			const cone = new THREE.Mesh(coneGeometry, foliageMaterial);
			cone.position.y = cellSize * 0.4 + i * coneHeight * 0.8;
			treeGroup.add(cone);
		}
		
		// Position the tree on the cell
		treeGroup.position.set(
			x + (Math.random() - 0.5) * cellSize * 0.5,
			0,
			z + (Math.random() - 0.5) * cellSize * 0.5
		);
		
		// Add slight random rotation
		treeGroup.rotation.y = Math.random() * Math.PI * 2;
		
		return treeGroup;
	} catch (error) {
		console.error('Error creating tree for cell:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Creates a mushroom decoration for a cell
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @returns {THREE.Group} The mushroom group
 */
export function createMushroomForCell(x, z, cellSize) {
	try {
		// Create a group for the mushroom
		const mushroomGroup = new THREE.Group();
		
		// Create stem
		const stemGeometry = new THREE.CylinderGeometry(
			cellSize * 0.02, // top radius
			cellSize * 0.03, // bottom radius
			cellSize * 0.1, // height
			8 // radial segments
		);
		
		const stemMaterial = new THREE.MeshLambertMaterial({
			color: 0xF5F5DC // Beige
		});
		
		const stem = new THREE.Mesh(stemGeometry, stemMaterial);
		stem.position.y = cellSize * 0.05; // Half of stem height
		mushroomGroup.add(stem);
		
		// Create cap
		const capGeometry = new THREE.SphereGeometry(
			cellSize * 0.06, // radius
			8, // width segments
			6, // height segments
			0, // phi start
			Math.PI * 2, // phi length
			0, // theta start
			Math.PI / 2 // theta length (half sphere)
		);
		
		// Red cap with white spots for fly agaric mushroom
		const capMaterial = new THREE.MeshLambertMaterial({
			color: 0xCC0000 // Red
		});
		
		const cap = new THREE.Mesh(capGeometry, capMaterial);
		cap.position.y = cellSize * 0.1; // Place on top of stem
		mushroomGroup.add(cap);
		
		// Add white spots
		const spotMaterial = new THREE.MeshLambertMaterial({
			color: 0xFFFFFF // White
		});
		
		// Add 5 random spots
		for (let i = 0; i < 5; i++) {
			const spotGeometry = new THREE.CircleGeometry(
				cellSize * 0.01, // radius
				6 // segments
			);
			
			const spot = new THREE.Mesh(spotGeometry, spotMaterial);
			
			// Position on cap with random rotation
			const theta = Math.random() * Math.PI / 2; // Angle from top
			const phi = Math.random() * Math.PI * 2; // Angle around
			
			spot.position.x = Math.sin(theta) * Math.cos(phi) * cellSize * 0.06;
			spot.position.y = cellSize * 0.1 + Math.cos(theta) * cellSize * 0.06;
			spot.position.z = Math.sin(theta) * Math.sin(phi) * cellSize * 0.06;
			
			// Rotate to face outward
			spot.lookAt(spot.position.x * 2, spot.position.y * 2, spot.position.z * 2);
			
			mushroomGroup.add(spot);
		}
		
		// Position the mushroom on the cell
		mushroomGroup.position.set(
			x + (Math.random() - 0.5) * cellSize * 0.7,
			0,
			z + (Math.random() - 0.5) * cellSize * 0.7
		);
		
		// Add slight random rotation
		mushroomGroup.rotation.y = Math.random() * Math.PI * 2;
		
		return mushroomGroup;
	} catch (error) {
		console.error('Error creating mushroom for cell:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

// Export default object with all functions
export default {
	init,
	addGrassTuft,
	addPotionToCell,
	addPotionParticles,
	animatePotionsAndParticles,
	addStoneDecoration,
	addMushroomDecoration,
	addCellDecoration,
	createSkybox,
	addClouds,
	addCellBottom,
	addRussianThemeElements,
	createTreeForCell,
	createMushroomForCell
};
