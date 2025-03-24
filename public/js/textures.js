
/**
 * Load textures for the game
 */
export function loadTextures() {
	console.log('Loading textures...');

	return new Promise((resolve, reject) => {
		try {
			// Create fallback textures
			createFallbackTextures();
			console.log('Textures loaded successfully');
			resolve();
		} catch (error) {
			console.error('Error setting up texture loading:', error);
			reject(error);
		}
	});
}


let skybox, clouds;

/**
 * Create fallback textures using canvas
 */
 function createFallbackTextures(textures) {
	// Create cell textures for each cell type

	// Player 1 (Blue) cell
	textures.cells[1] = createColorTexture(0x3377ff);

	// Player 2 (Orange) cell
	textures.cells[2] = createColorTexture(0xff7700);

	// Player 3 (Green) cell - for future use
	textures.cells[3] = createColorTexture(0x33cc33);

	// Player 4 (Purple) cell - for future use
	textures.cells[4] = createColorTexture(0xaa33cc);

	// Home zone textures
	textures.cells[6] = createColorTexture(0x1155aa, 0x3377ff);
	textures.cells[7] = createColorTexture(0xbb5500, 0xff7700);
	textures.cells[8] = createColorTexture(0x118811, 0x33cc33);
	textures.cells[9] = createColorTexture(0x771199, 0xaa33cc);

	// Create board texture
	textures.board = createCheckerboardTexture(0xdddddd, 0x222222);

	// Create skybox texture
	createSkyboxTexture(textures);
}

/**
 * Create a basic color texture
 */
function createColorTexture(color, borderColor = null) {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;

	const context = canvas.getContext('2d');

	// Fill with main color
	context.fillStyle = '#' + color.toString(16).padStart(6, '0');
	context.fillRect(0, 0, 128, 128);

	// Add border if specified
	if (borderColor !== null) {
		context.strokeStyle = '#' + borderColor.toString(16).padStart(6, '0');
		context.lineWidth = 8;
		context.strokeRect(0, 0, 128, 128);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;

	return texture;
}

/**
 * Create a checkerboard texture
 */
function createCheckerboardTexture(color1, color2) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;

	const context = canvas.getContext('2d');

	// Fill with checkerboard pattern
	const cellSize = 32;
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			if ((x + y) % 2 === 0) {
				context.fillStyle = '#' + color1.toString(16).padStart(6, '0');
			} else {
				context.fillStyle = '#' + color2.toString(16).padStart(6, '0');
			}
			context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
		}
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;

	return texture;
}

/**
 * Create skybox texture
 */
function createSkyboxTexture(textures) {
	// Create a simple gradient for the skybox
	const topColor = new THREE.Color(0x77AAFF); // Light blue
	const bottomColor = new THREE.Color(0xFFFFFF); // White

	// Use existing function to create gradient
	const gradientTexture = createGradientTexture(topColor, bottomColor);
	textures.skybox = gradientTexture;
}


// Add additional functions for enhanced visualizations, particle effects, etc.
// We'll include the core functionality from minimal-gameCore.js with visual enhancements.

/**
 * Create a gradient texture for background
 */
function createGradientTexture(topColor, bottomColor) {
	const canvas = document.createElement('canvas');
	canvas.width = 2;
	canvas.height = 512;

	const context = canvas.getContext('2d');
	const gradient = context.createLinearGradient(0, 0, 0, 512);
	gradient.addColorStop(0, topColor.getStyle());
	gradient.addColorStop(1, bottomColor.getStyle());

	context.fillStyle = gradient;
	context.fillRect(0, 0, 2, 512);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;

	return texture;
}

/**
 * Create animated clouds for sky
 */
function createClouds() {
	try {
		// Create clouds container
		clouds = new THREE.Group();
		clouds.name = 'clouds';

		// Create cloud particles
		const cloudCount = 20;
		const cloudGeometry = new THREE.PlaneGeometry(30, 15);

		// Create a fallback cloud texture if loading fails
		let cloudTexture;
		try {
			// Attempt to load cloud texture
			cloudTexture = textureLoader.load('textures/environment/cloud.png',
				// Success callback
				undefined,
				// Progress callback
				undefined,
				// Error callback 
				() => {
					console.warn('Cloud texture loading failed, using fallback');
					cloudTexture = createCloudFallbackTexture();
				}
			);
		} catch (error) {
			console.warn('Cloud texture creation failed, using fallback:', error);
			cloudTexture = createCloudFallbackTexture();
		}

		const cloudMaterial = new THREE.MeshBasicMaterial({
			map: cloudTexture,
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
			side: THREE.DoubleSide
		});

		for (let i = 0; i < cloudCount; i++) {
			const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);

			// Random position
			cloud.position.set(
				Math.random() * 200 - 100,
				60 + Math.random() * 30,
				Math.random() * 200 - 100
			);

			// Random rotation
			cloud.rotation.z = Math.random() * Math.PI;

			// Random scale
			const scale = 0.5 + Math.random() * 2;
			cloud.scale.set(scale, scale, scale);

			// Store movement data
			cloud.userData.speed = 0.05 + Math.random() * 0.1;
			cloud.userData.direction = new THREE.Vector3(
				Math.random() * 0.1 - 0.05,
				0,
				Math.random() * 0.1 - 0.05
			);

			clouds.add(cloud);
		}

		// Add clouds to scene
		scene.add(clouds);
	} catch (error) {
		console.warn('Failed to create clouds:', error);
		// Continue without clouds
	}
}

/**
 * Create a fallback cloud texture
 * @returns {THREE.Texture} A simple cloud texture
 */
function createCloudFallbackTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 64;

	const context = canvas.getContext('2d');

	// Fill with gradient
	const gradient = context.createRadialGradient(
		canvas.width / 2, canvas.height / 2, 0,
		canvas.width / 2, canvas.height / 2, canvas.width / 2
	);
	gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
	gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
	gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

	context.fillStyle = gradient;
	context.fillRect(0, 0, canvas.width, canvas.height);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;

	return texture;
}

// Modify the animateClouds function to not affect the board
function animateClouds(scene) {
	// Cloud animation
	const cloudsGroup = scene.children.find(child => child.name === 'clouds');

	if (cloudsGroup && cloudsGroup.children && cloudsGroup.children.length > 0) {
		cloudsGroup.children.forEach(cloud => {
			// Move cloud very slowly
			if (cloud.userData.direction) {
				// Handle background clouds slightly differently
				if (cloud.userData.isBackgroundCloud) {
					// Move horizontally around the board, slower
					cloud.position.x += cloud.userData.direction.x;
					cloud.position.z += cloud.userData.direction.y;

					// Rotate very slightly for gentle movement
					cloud.rotation.z += 0.00005;

					// Very large wrap-around for distant clouds
					if (cloud.position.x > 500) cloud.position.x = -500;
					if (cloud.position.x < -500) cloud.position.x = 500;
					if (cloud.position.z > 500) cloud.position.z = -500;
					if (cloud.position.z < -500) cloud.position.z = 500;
				} else {
					// Regular clouds
					cloud.position.x += cloud.userData.direction.x;
					cloud.position.z += cloud.userData.direction.y;

					// Extremely subtle vertical bobbing
					cloud.position.y += Math.sin(Date.now() * 0.0003 + cloud.position.x * 0.01) * 0.002;

					// Very slight rotation
					cloud.rotation.y += 0.0001;

					// Wrap around when out of bounds
					if (cloud.position.x > 200) cloud.position.x = -200;
					if (cloud.position.x < -200) cloud.position.x = 200;
					if (cloud.position.z > 200) cloud.position.z = -200;
					if (cloud.position.z < -200) cloud.position.z = 200;
				}
			}
		});
	}
}

export { createFallbackTextures, createColorTexture, createCheckerboardTexture, createSkyboxTexture, createClouds, animateClouds, createCloudFallbackTexture, createGradientTexture };