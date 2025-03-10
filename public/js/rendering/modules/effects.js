/**
 * Renderer Effects Module
 * Contains functions for visual effects, decorations, and animations
 */

import * as THREE from '../../utils/three.js';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight, createPseudoRandomGenerator } from './utils.js';

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
 * Creates a skybox with a gradient effect
 * @returns {THREE.Mesh} The skybox mesh
 */
export function createSkybox() {
	try {
		// Create a large sphere for the sky
		const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
		
		// The material will use vertex colors
		const skyMaterial = new THREE.MeshBasicMaterial({
			side: THREE.BackSide, // Draw on the inside of the sphere
			vertexColors: true
		});
		
		const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
		
		// Define sky colors for gradient
		const skyColors = [
			new THREE.Color(0x1a237e), // Deep blue at top
			new THREE.Color(0x42a5f5), // Light blue at middle
			new THREE.Color(0xbbdefb)  // Very light blue/white at horizon
		];
		
		// Apply vertex colors for gradient effect
		const positions = skyGeometry.attributes.position;
		const colors = [];
		
		for (let i = 0; i < positions.count; i++) {
			const y = positions.getY(i);
			const normalized = (y + 500) / 1000; // Normalize position between 0 and 1
			
			// Choose color based on height
			let color;
			if (normalized > 0.7) {
				// Top - deep blue
				color = skyColors[0];
			} else if (normalized > 0.4) {
				// Middle - light blue
				const t = (normalized - 0.4) / 0.3;
				color = skyColors[0].clone().lerp(skyColors[1], 1 - t);
			} else {
				// Bottom - very light blue
				const t = normalized / 0.4;
				color = skyColors[1].clone().lerp(skyColors[2], 1 - t);
			}
			
			colors.push(color.r, color.g, color.b);
		}
		
		// Add colors to the geometry
		try {
			// Different versions of THREE.js have different ways to create buffer attributes
			if (typeof THREE.Float32BufferAttribute === 'function') {
				skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
			} else if (typeof THREE.BufferAttribute === 'function') {
				// Fallback for older versions
				skyGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
			} else {
				// Ultimate fallback - no color attributes
				console.warn('Unable to add color attributes to skybox - THREE.js BufferAttribute unavailable');
			}
		} catch (error) {
			console.warn('Error setting color attributes:', error);
			// Continue without color attributes
		}
		
		return skyMesh;
	} catch (error) {
		console.error('Error creating skybox:', error);
		return null;
	}
}

/**
 * Adds cloud decorations to the scene
 * @param {THREE.Scene} scene - The scene to add clouds to
 */
export function addClouds(scene) {
	try {
		const cloudGroup = new THREE.Group();
		
		// Create several clouds
		const numClouds = 20;
		
		for (let i = 0; i < numClouds; i++) {
			// Random size and position
			const cloudWidth = 20 + Math.random() * 30;
			const cloudHeight = 10 + Math.random() * 15;
			
			const x = Math.random() * 400 - 200;
			const y = 50 + Math.random() * 100;
			const z = Math.random() * 400 - 200;
			
			// Create cloud plane
			const cloudGeometry = new THREE.PlaneGeometry(cloudWidth, cloudHeight);
			
			// Semi-transparent white material
			const cloudMaterial = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.6 + Math.random() * 0.2,
				side: THREE.DoubleSide
			});
			
			const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
			cloud.position.set(x, y, z);
			
			// Make clouds face the camera
			cloud.rotation.x = Math.PI / 2;
			
			cloudGroup.add(cloud);
		}
		
		scene.add(cloudGroup);
		return cloudGroup;
	} catch (error) {
		console.error('Error adding clouds:', error);
		return null;
	}
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
	addCellBottom
};
