/**
 * Animations Utility
 * 
 * Handles visual animations for game events
 */

// No need to import THREE as it's available globally from the HTML

// Animation state
let animations = [];
let particleSystems = [];

/**
 * Initialize animations system
 */
export function init() {
	// Reset animation state
	animations = [];
	particleSystems = [];
}

/**
 * Create row clearing animation
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Array<number>} rows - Rows to clear
 * @param {number} boardWidth - Width of the board
 */
export function createRowClearingAnimation(scene, rows, boardWidth) {
	if (!scene || !rows || !rows.length) return;
	
	// For each row to clear
	rows.forEach(rowZ => {
		// Create particles for this row
		const particles = createRowParticles(scene, rowZ, boardWidth);
		particleSystems.push(particles);
		
		// Create animation for this row
		const animation = {
			type: 'rowClearing',
			row: rowZ,
			progress: 0,
			duration: 500, // ms
			startTime: Date.now(),
			completed: false,
			update: (deltaTime) => updateRowClearingAnimation(animation, particles, deltaTime),
			onComplete: () => {
				scene.remove(particles);
				// Remove this particle system
				const index = particleSystems.indexOf(particles);
				if (index !== -1) {
					particleSystems.splice(index, 1);
				}
			}
		};
		
		// Add to active animations
		animations.push(animation);
	});
	
	return animations.filter(a => a.type === 'rowClearing');
}

/**
 * Create particles for row clearing animation
 * @param {THREE.Scene} scene - Three.js scene
 * @param {number} rowZ - Row Z coordinate
 * @param {number} boardWidth - Width of the board
 * @returns {THREE.Object3D} Particle system
 */
function createRowParticles(scene, rowZ, boardWidth) {
	// Create a container for the particles
	const particleContainer = new THREE.Object3D();
	particleContainer.name = `row_particles_${rowZ}`;
	
	// Number of particles per cell
	const particlesPerCell = 10;
	
	// Create particles for each cell in the row
	for (let x = 0; x < boardWidth; x++) {
		for (let i = 0; i < particlesPerCell; i++) {
			// Create particle geometry
			const size = 0.05 + Math.random() * 0.1;
			const geometry = new THREE.BoxGeometry(size, size, size);
			
			// Create particle material with random color
			const hue = Math.random() * 0.2 + 0.6; // Blue to purple range
			const saturation = 0.8;
			const lightness = 0.5 + Math.random() * 0.3;
			const color = new THREE.Color().setHSL(hue, saturation, lightness);
			
			const material = new THREE.MeshBasicMaterial({
				color: color,
				transparent: true,
				opacity: 0.8
			});
			
			// Create particle mesh
			const particle = new THREE.Mesh(geometry, material);
			
			// Set initial position (random within the cell)
			particle.position.x = x + 0.5 + (Math.random() - 0.5) * 0.8;
			particle.position.y = 0;
			particle.position.z = rowZ + 0.5 + (Math.random() - 0.5) * 0.8;
			
			// Set random velocity
			particle.userData.velocity = new THREE.Vector3(
				(Math.random() - 0.5) * 2,
				Math.random() * 2 + 1,
				(Math.random() - 0.5) * 2
			);
			
			// Add to container
			particleContainer.add(particle);
		}
	}
	
	// Add container to scene
	scene.add(particleContainer);
	
	return particleContainer;
}

/**
 * Update row clearing animation
 * @param {Object} animation - Animation data
 * @param {THREE.Object3D} particles - Particle system
 * @param {number} deltaTime - Time since last update in seconds
 */
function updateRowClearingAnimation(animation, particles, deltaTime) {
	// Calculate progress
	const elapsed = Date.now() - animation.startTime;
	animation.progress = Math.min(elapsed / animation.duration, 1);
	
	// Update particle positions
	particles.children.forEach(particle => {
		// Get velocity
		const velocity = particle.userData.velocity;
		
		// Apply gravity
		velocity.y -= 9.8 * deltaTime * 0.5;
		
		// Update position
		particle.position.x += velocity.x * deltaTime;
		particle.position.y += velocity.y * deltaTime;
		particle.position.z += velocity.z * deltaTime;
		
		// Update opacity based on progress
		if (particle.material) {
			particle.material.opacity = 1 - animation.progress;
		}
		
		// Add some rotation
		particle.rotation.x += deltaTime * 2;
		particle.rotation.y += deltaTime * 3;
		particle.rotation.z += deltaTime;
	});
	
	// Check if animation is complete
	if (animation.progress >= 1) {
		animation.completed = true;
		if (animation.onComplete) {
			animation.onComplete();
		}
	}
}

/**
 * Create tetromino attachment animation
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} tetromino - Tetromino data
 * @returns {Array} Animation data
 */
export function createTetrominoAttachAnimation(scene, tetromino) {
	if (!scene || !tetromino) return null;
	
	// Create animation
	const animation = {
		type: 'tetrominoAttach',
		tetromino: tetromino,
		progress: 0,
		duration: 300, // ms
		startTime: Date.now(),
		completed: false,
		particles: null,
		update: (deltaTime) => updateTetrominoAttachAnimation(animation, scene, deltaTime),
		onComplete: () => {
			// Clean up if needed
			if (animation.particles) {
				scene.remove(animation.particles);
			}
		}
	};
	
	// Create particles for attachment effect
	animation.particles = createAttachmentParticles(scene, tetromino);
	
	// Add to active animations
	animations.push(animation);
	
	return animation;
}

/**
 * Create particles for tetromino attachment animation
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} tetromino - Tetromino data
 * @returns {THREE.Object3D} Particle system
 */
function createAttachmentParticles(scene, tetromino) {
	// Create a container for the particles
	const particleContainer = new THREE.Object3D();
	particleContainer.name = 'attachment_particles';
	
	// Number of particles per cell
	const particlesPerCell = 5;
	
	// Create particles for each tetromino cell
	for (let y = 0; y < tetromino.shape.length; y++) {
		for (let x = 0; x < tetromino.shape[y].length; x++) {
			if (tetromino.shape[y][x]) {
				const worldX = tetromino.position.x + x;
				const worldZ = tetromino.position.z + y;
				const worldY = tetromino.position.y;
				
				for (let i = 0; i < particlesPerCell; i++) {
					// Create particle geometry
					const size = 0.05 + Math.random() * 0.05;
					const geometry = new THREE.BoxGeometry(size, size, size);
					
					// Use tetromino color for particles
					const material = new THREE.MeshBasicMaterial({
						color: getTetrominoColor(tetromino.type),
						transparent: true,
						opacity: 0.8
					});
					
					// Create particle mesh
					const particle = new THREE.Mesh(geometry, material);
					
					// Set initial position (at attachment point)
					particle.position.x = worldX + 0.5 + (Math.random() - 0.5) * 0.2;
					particle.position.y = worldY - 0.2 + Math.random() * 0.4;
					particle.position.z = worldZ + 0.5 + (Math.random() - 0.5) * 0.2;
					
					// Set random velocity (outward from attachment point)
					particle.userData.velocity = new THREE.Vector3(
						(Math.random() - 0.5) * 1.5,
						Math.random() * 1.5,
						(Math.random() - 0.5) * 1.5
					);
					
					// Add to container
					particleContainer.add(particle);
				}
			}
		}
	}
	
	// Add container to scene
	scene.add(particleContainer);
	
	return particleContainer;
}

/**
 * Update tetromino attachment animation
 * @param {Object} animation - Animation data
 * @param {THREE.Scene} scene - Three.js scene
 * @param {number} deltaTime - Time since last update in seconds
 */
function updateTetrominoAttachAnimation(animation, scene, deltaTime) {
	// Calculate progress
	const elapsed = Date.now() - animation.startTime;
	animation.progress = Math.min(elapsed / animation.duration, 1);
	
	// Update particles
	if (animation.particles) {
		animation.particles.children.forEach(particle => {
			// Get velocity
			const velocity = particle.userData.velocity;
			
			// Apply drag
			velocity.x *= 0.95;
			velocity.y *= 0.95;
			velocity.z *= 0.95;
			
			// Update position
			particle.position.x += velocity.x * deltaTime;
			particle.position.y += velocity.y * deltaTime;
			particle.position.z += velocity.z * deltaTime;
			
			// Update opacity based on progress
			if (particle.material) {
				particle.material.opacity = 0.8 * (1 - animation.progress);
			}
			
			// Add some rotation
			particle.rotation.x += deltaTime * 3;
			particle.rotation.y += deltaTime * 2;
			particle.rotation.z += deltaTime * 4;
		});
	}
	
	// Check if animation is complete
	if (animation.progress >= 1) {
		animation.completed = true;
		if (animation.onComplete) {
			animation.onComplete();
		}
	}
}

/**
 * Create tetromino disintegration animation
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} tetromino - Tetromino data
 * @returns {Object} Animation data
 */
export function createTetrominoDisintegrationAnimation(scene, tetromino) {
	if (!scene || !tetromino) return null;
	
	// Create animation
	const animation = {
		type: 'tetrominoDisintegration',
		tetromino: tetromino,
		progress: 0,
		duration: 500, // ms
		startTime: Date.now(),
		completed: false,
		particles: null,
		update: (deltaTime) => updateTetrominoDisintegrationAnimation(animation, scene, deltaTime),
		onComplete: () => {
			// Clean up if needed
			if (animation.particles) {
				scene.remove(animation.particles);
			}
		}
	};
	
	// Create particles for disintegration effect
	animation.particles = createDisintegrationParticles(scene, tetromino);
	
	// Add to active animations
	animations.push(animation);
	
	return animation;
}

/**
 * Create particles for tetromino disintegration animation
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} tetromino - Tetromino data
 * @returns {THREE.Object3D} Particle system
 */
function createDisintegrationParticles(scene, tetromino) {
	// Create a container for the particles
	const particleContainer = new THREE.Object3D();
	particleContainer.name = 'disintegration_particles';
	
	// Number of particles per cell
	const particlesPerCell = 15;
	
	// Create particles for each tetromino cell
	for (let y = 0; y < tetromino.shape.length; y++) {
		for (let x = 0; x < tetromino.shape[y].length; x++) {
			if (tetromino.shape[y][x]) {
				const worldX = tetromino.position.x + x;
				const worldZ = tetromino.position.z + y;
				const worldY = tetromino.position.y;
				
				for (let i = 0; i < particlesPerCell; i++) {
					// Create particle geometry
					const size = 0.05 + Math.random() * 0.1;
					const geometry = new THREE.BoxGeometry(size, size, size);
					
					// Create particle material with tetromino color
					const material = new THREE.MeshBasicMaterial({
						color: getTetrominoColor(tetromino.type),
						transparent: true,
						opacity: 0.8
					});
					
					// Create particle mesh
					const particle = new THREE.Mesh(geometry, material);
					
					// Set initial position (within the cell)
					particle.position.x = worldX + 0.5 + (Math.random() - 0.5) * 0.8;
					particle.position.y = worldY + (Math.random() - 0.5) * 0.8;
					particle.position.z = worldZ + 0.5 + (Math.random() - 0.5) * 0.8;
					
					// Set random velocity (explosion outward)
					const velocity = new THREE.Vector3(
						(Math.random() - 0.5) * 3,
						Math.random() * 3 + 1,
						(Math.random() - 0.5) * 3
					);
					
					// Normalize and scale by random amount
					velocity.normalize().multiplyScalar(1 + Math.random() * 2);
					particle.userData.velocity = velocity;
					
					// Add some random rotation velocity
					particle.userData.rotationVelocity = {
						x: (Math.random() - 0.5) * 10,
						y: (Math.random() - 0.5) * 10,
						z: (Math.random() - 0.5) * 10
					};
					
					// Add to container
					particleContainer.add(particle);
				}
			}
		}
	}
	
	// Add container to scene
	scene.add(particleContainer);
	
	return particleContainer;
}

/**
 * Update tetromino disintegration animation
 * @param {Object} animation - Animation data
 * @param {THREE.Scene} scene - Three.js scene
 * @param {number} deltaTime - Time since last update in seconds
 */
function updateTetrominoDisintegrationAnimation(animation, scene, deltaTime) {
	// Calculate progress
	const elapsed = Date.now() - animation.startTime;
	animation.progress = Math.min(elapsed / animation.duration, 1);
	
	// Update particles
	if (animation.particles) {
		animation.particles.children.forEach(particle => {
			// Get velocity
			const velocity = particle.userData.velocity;
			
			// Apply gravity
			velocity.y -= 9.8 * deltaTime;
			
			// Update position
			particle.position.x += velocity.x * deltaTime;
			particle.position.y += velocity.y * deltaTime;
			particle.position.z += velocity.z * deltaTime;
			
			// Update rotation
			if (particle.userData.rotationVelocity) {
				const rv = particle.userData.rotationVelocity;
				particle.rotation.x += rv.x * deltaTime;
				particle.rotation.y += rv.y * deltaTime;
				particle.rotation.z += rv.z * deltaTime;
			}
			
			// Update opacity based on progress
			if (particle.material) {
				particle.material.opacity = 0.8 * (1 - animation.progress);
			}
		});
	}
	
	// Check if animation is complete
	if (animation.progress >= 1) {
		animation.completed = true;
		if (animation.onComplete) {
			animation.onComplete();
		}
	}
}

/**
 * Update all animations
 * @param {number} timestamp - Current timestamp
 * @param {number} deltaTime - Time since last update in milliseconds
 */
export function update(timestamp, deltaTime) {
	// Convert deltaTime to seconds for animation calculations
	const deltaSeconds = deltaTime / 1000;
	
	// Update all animations
	for (let i = animations.length - 1; i >= 0; i--) {
		const animation = animations[i];
		if (animation.update) {
			animation.update(deltaSeconds);
		}
		
		// Remove completed animations
		if (animation.completed) {
			animations.splice(i, 1);
		}
	}
	
	// Update particle systems
	for (let i = particleSystems.length - 1; i >= 0; i--) {
		const particles = particleSystems[i];
		
		// Check if this particle system is still in the scene
		if (!particles.parent) {
			particleSystems.splice(i, 1);
		}
	}
}

/**
 * Clean up and remove all animations
 * @param {THREE.Scene} scene - Three.js scene
 */
export function cleanup(scene) {
	// Remove all particle systems from scene
	particleSystems.forEach(particles => {
		scene.remove(particles);
	});
	
	// Clear arrays
	animations = [];
	particleSystems = [];
}

/**
 * Get color for tetromino type
 * @param {string|number} type - Tetromino type
 * @returns {number} Color as hex value
 */
function getTetrominoColor(type) {
	// Default colors for tetromino types
	const colors = {
		I: 0x00FFFF, // Cyan
		J: 0x0000FF, // Blue
		L: 0xFF8000, // Orange
		O: 0xFFFF00, // Yellow
		S: 0x00FF00, // Green
		T: 0x8000FF, // Purple
		Z: 0xFF0000  // Red
	};
	
	// Return color for type, or random color if type not found
	if (typeof type === 'string' && colors[type]) {
		return colors[type];
	} else if (typeof type === 'number' && type >= 0 && type < 7) {
		const keys = Object.keys(colors);
		return colors[keys[type]];
	}
	
	// Default to a vibrant color if type not recognized
	return 0xFF00FF;
}

/**
 * Create a victory animation
 * @param {Object} scene - Three.js scene
 * @param {Object} camera - Three.js camera
 * @param {Object} player - Player data
 */
export function createVictoryAnimation(scene, camera, player) {
	// Create particle system for celebration effect
	const particleCount = 500;
	const particles = new THREE.BufferGeometry();
	const positions = new Float32Array(particleCount * 3);
	const colors = new Float32Array(particleCount * 3);
	
	// Player color or default
	const playerColor = new THREE.Color(player?.color || '#4285f4');
	const particleColorVariants = [
		playerColor,
		new THREE.Color('#ffffff'),
		new THREE.Color('#ffd700') // Gold
	];
	
	// Set initial positions - from above the board
	for (let i = 0; i < particleCount; i++) {
		// Position
		positions[i * 3] = (Math.random() - 0.5) * 30;     // x
		positions[i * 3 + 1] = Math.random() * 30 + 20;    // y (above)
		positions[i * 3 + 2] = (Math.random() - 0.5) * 30; // z
		
		// Random color from variants
		const color = particleColorVariants[Math.floor(Math.random() * particleColorVariants.length)];
		colors[i * 3] = color.r;
		colors[i * 3 + 1] = color.g;
		colors[i * 3 + 2] = color.b;
	}
	
	// Set geometry attributes
	particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	
	// Create particle material
	const particleMaterial = new THREE.PointsMaterial({
		size: 0.5,
		vertexColors: true,
		transparent: true,
		opacity: 0.8
	});
	
	// Create particle system
	const particleSystem = new THREE.Points(particles, particleMaterial);
	particleSystem.name = 'victoryParticles';
	scene.add(particleSystem);
	
	// Create animation function
	const animate = () => {
		const positions = particles.attributes.position.array;
		
		// Update particle positions (falling confetti effect)
		for (let i = 0; i < particleCount; i++) {
			// y position (falling)
			positions[i * 3 + 1] -= 0.1 + Math.random() * 0.1;
			
			// x and z drift slightly
			positions[i * 3] += (Math.random() - 0.5) * 0.1;
			positions[i * 3 + 2] += (Math.random() - 0.5) * 0.1;
			
			// Reset particles that fall too low
			if (positions[i * 3 + 1] < -10) {
				positions[i * 3 + 1] = Math.random() * 20 + 20;
				positions[i * 3] = (Math.random() - 0.5) * 30;
				positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
			}
		}
		
		particles.attributes.position.needsUpdate = true;
	};
	
	// Orbit camera around player's home zone
	const orbitCamera = () => {
		// Slow rotation of camera
		const radius = 30;
		const speed = 0.001;
		
		const targetPosition = new THREE.Vector3(0, 10, 0);
		const angle = Date.now() * speed;
		
		camera.position.x = targetPosition.x + radius * Math.sin(angle);
		camera.position.z = targetPosition.z + radius * Math.cos(angle);
		camera.lookAt(targetPosition);
	};
	
	// Return animation controllers
	return {
		animate,
		orbitCamera,
		dispose: () => {
			scene.remove(particleSystem);
			particles.dispose();
			particleMaterial.dispose();
		}
	};
}

/**
 * Create a defeat animation
 * @param {Object} scene - Three.js scene
 * @param {Object} camera - Three.js camera
 */
export function createDefeatAnimation(scene, camera) {
	// Create dark cloud particles
	const particleCount = 300;
	const particles = new THREE.BufferGeometry();
	const positions = new Float32Array(particleCount * 3);
	const colors = new Float32Array(particleCount * 3);
	
	// Dark smoke colors
	const smokeColors = [
		new THREE.Color('#333333'),
		new THREE.Color('#555555'),
		new THREE.Color('#222222'),
		new THREE.Color('#444444')
	];
	
	// Set initial positions - around the board
	for (let i = 0; i < particleCount; i++) {
		// Position in a spherical pattern around the board center
		const radius = 15 + Math.random() * 10;
		const theta = Math.random() * Math.PI * 2;
		const phi = Math.random() * Math.PI;
		
		positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);     // x
		positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta); // y
		positions[i * 3 + 2] = radius * Math.cos(phi);                   // z
		
		// Random smoke color
		const color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
		colors[i * 3] = color.r;
		colors[i * 3 + 1] = color.g;
		colors[i * 3 + 2] = color.b;
	}
	
	// Set geometry attributes
	particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	
	// Create particle material
	const particleMaterial = new THREE.PointsMaterial({
		size: 0.8,
		vertexColors: true,
		transparent: true,
		opacity: 0.5
	});
	
	// Create particle system
	const particleSystem = new THREE.Points(particles, particleMaterial);
	particleSystem.name = 'defeatParticles';
	scene.add(particleSystem);
	
	// Create animation function 
	const animate = () => {
		const positions = particles.attributes.position.array;
		
		// Update particle positions (swirling smoke effect)
		for (let i = 0; i < particleCount; i++) {
			const ix = i * 3;
			const iy = i * 3 + 1;
			const iz = i * 3 + 2;
			
			// Get current position
			const x = positions[ix];
			const y = positions[iy];
			const z = positions[iz];
			
			// Calculate distance from center
			const distance = Math.sqrt(x*x + y*y + z*z);
			
			// Create swirling motion
			const angle = 0.01 * (distance / 10);
			const cosAngle = Math.cos(angle);
			const sinAngle = Math.sin(angle);
			
			positions[ix] = x * cosAngle - z * sinAngle;
			positions[iz] = x * sinAngle + z * cosAngle;
			
			// Move slightly inward
			const inwardFactor = 0.995;
			positions[ix] *= inwardFactor;
			positions[iy] *= inwardFactor;
			positions[iz] *= inwardFactor;
			
			// Reset particles that get too close to the center
			if (distance < 5) {
				const radius = 20 + Math.random() * 5;
				const theta = Math.random() * Math.PI * 2;
				const phi = Math.random() * Math.PI;
				
				positions[ix] = radius * Math.sin(phi) * Math.cos(theta);
				positions[iy] = radius * Math.sin(phi) * Math.sin(theta);
				positions[iz] = radius * Math.cos(phi);
			}
		}
		
		particles.attributes.position.needsUpdate = true;
	};
	
	// Gradually darken the scene
	let darkenFactor = 0;
	const darkenScene = () => {
		darkenFactor = Math.min(darkenFactor + 0.002, 0.7);
		scene.background = new THREE.Color(0x000000).lerp(scene.backgroundOriginalColor || new THREE.Color(0x87CEEB), 1 - darkenFactor);
	};
	
	// Save original background color
	if (!scene.backgroundOriginalColor && scene.background) {
		scene.backgroundOriginalColor = scene.background.clone();
	}
	
	// Camera shake effect
	let shakeIntensity = 0.1;
	const originalCameraPosition = camera.position.clone();
	
	const shakeCamera = () => {
		if (shakeIntensity > 0) {
			camera.position.x = originalCameraPosition.x + (Math.random() - 0.5) * shakeIntensity;
			camera.position.y = originalCameraPosition.y + (Math.random() - 0.5) * shakeIntensity;
			camera.position.z = originalCameraPosition.z + (Math.random() - 0.5) * shakeIntensity;
			
			// Reduce shake over time
			shakeIntensity *= 0.97;
		}
	};
	
	// Return animation controllers
	return {
		animate,
		darkenScene,
		shakeCamera,
		dispose: () => {
			scene.remove(particleSystem);
			particles.dispose();
			particleMaterial.dispose();
			
			// Reset scene background
			if (scene.backgroundOriginalColor) {
				scene.background = scene.backgroundOriginalColor;
			}
			
			// Reset camera position
			camera.position.copy(originalCameraPosition);
		}
	};
} 