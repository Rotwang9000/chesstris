import { createFewClouds } from './createFewClouds.js';
import { onWindowResize, getTHREE } from './enhanced-gameCore.js';
import { boardFunctions } from './boardFunctions.js';
import chessPieceCreator from './chessPieceCreator.js';
import { findBoardCentreMarker, createCentreMarker, toRelativePosition, translatePosition } from './centreBoardMarker.js';

export function setupScene(containerElement, scene, camera, renderer, controls, boardGroup, tetrominoGroup, chessPiecesGroup, clouds, gameState) {
	console.log('Setting up enhanced 3D scene with beautiful sky...');
	const THREE = getTHREE();
	// // Create scene
	scene = new THREE.Scene();
	
	// Create a beautiful light blue sky background - lighter color
	scene.background = new THREE.Color(0xAFE9FF); // Lighter sky blue
	scene.fog = new THREE.Fog(0xC5F0FF, 60, 150); // Lighter blue fog, pushed further back
	
	// Create camera
	const width = containerElement?.clientWidth || window.innerWidth;
	const height = containerElement?.clientHeight || window.innerHeight;
	
	camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
	camera.position.set(20, 25, 20);
	
	// Create renderer with improved settings
	renderer = new THREE.WebGLRenderer({ 
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance'
	});
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.3; // Brighter exposure for more vibrant scene
	
	// Ensure canvas will be visible
	renderer.domElement.style.width = '100%';
	renderer.domElement.style.height = '100vh';
	renderer.domElement.style.display = 'block';
	
	containerElement.appendChild(renderer.domElement);
	
	// Create orbit controls with better defaults
	if (typeof THREE.OrbitControls !== 'undefined') {
		controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.15;
		controls.screenSpacePanning = true;
		controls.minDistance = 10;
		controls.maxDistance = 80;
		controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below horizon
		controls.target.set(8, 0, 8);
		controls.update();
	} else {
		console.warn('OrbitControls not available. Using static camera.');
	}
	
	// Add lights for a beautiful sunny day
	// Main sunlight - golden warm directional light
	const sunLight = new THREE.DirectionalLight(0xFFFBE8, 1.35); // Warm sunlight
	sunLight.position.set(25, 80, 30);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 10;
	sunLight.shadow.camera.far = 200;
	sunLight.shadow.camera.left = -50;
	sunLight.shadow.camera.right = 50;
	sunLight.shadow.camera.top = 50;
	sunLight.shadow.camera.bottom = -50;
	sunLight.shadow.bias = -0.0001; // Reduce shadow acne
	sunLight.shadow.normalBias = 0.02; // Improve shadow appearance on curved surfaces
	scene.add(sunLight);
	
	// Ambient light for general illumination - sky colored
	const ambientLight = new THREE.AmbientLight(0xB0E2FF, 0.65); // Sky-colored ambient light
	scene.add(ambientLight);
	
	// Add a soft golden backlight for rim lighting effect
	const backLight = new THREE.DirectionalLight(0xFFF0E0, 0.4); // Soft golden backlight
	backLight.position.set(-15, 20, -25);
	scene.add(backLight);
	
	// Add a soft blue-ish fill light from below for floating cells
	const fillLight = new THREE.DirectionalLight(0xC8E0FF, 0.25); // Light blue
	fillLight.position.set(-20, -5, -20);
	scene.add(fillLight);
	
	// Add a subtle hemisphere light for better outdoor lighting
	const hemisphereLight = new THREE.HemisphereLight(0xFFFBE8, 0x080820, 0.5);
	scene.add(hemisphereLight);
	
	// Create board group
	boardGroup = new THREE.Group();
	boardGroup.name = 'boardGroup';
	// Initialize the board with initial visualization
	console.log("Creating initial board visualization...");
	try {
		createBoard(boardGroup, gameState);
		console.log("Board created successfully", boardGroup);
		// boardFunctions.createBoardCells(gameState, boardGroup, createFloatingIsland, THREE);
	} catch (err) {
		console.error("Error creating initial board:", err);
		// Continue with setup, we'll try again when we get data
	}
	scene.add(boardGroup);
	
	// Create tetromino group
	tetrominoGroup = new THREE.Group();
	tetrominoGroup.name = 'tetrominos';
	scene.add(tetrominoGroup);
	gameState.tetrominoGroup = tetrominoGroup;
	gameState.scene = scene;
	
	// Create chess pieces group
	chessPiecesGroup = new THREE.Group();
	chessPiecesGroup.name = 'chessPieces';
	scene.add(chessPiecesGroup);
	
	// Add beautiful fluffy clouds to scene
	clouds = createFewClouds(scene);
	
	// Add resize listener
	window.addEventListener('resize', () => onWindowResize(camera, renderer, containerElement));

	return { _scene: scene, _camera: camera, _renderer: renderer, _controls: controls, _boardGroup: boardGroup, _tetrominoGroup: tetrominoGroup, _chessPiecesGroup: chessPiecesGroup, _clouds: clouds };
}

export function rebuildScene(containerElement, options = {}) {
	const THREE = getTHREE();
	// Extract options
	const { 
		lowQuality = false, 
		pixelRatio = window.devicePixelRatio, 
		shadows = true, 
		antialiasing = true,
		groups = {}
	} = options;
	
	// Extract groups if provided
	const { 
		boardGroup: existingBoardGroup, 
		tetrominoGroup: existingTetrominoGroup, 
		chessPiecesGroup: existingChessPiecesGroup 
	} = groups;
	
	// Initialize scene from scratch
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87CEEB); // Sky blue
	
	// Create camera
	const camera = new THREE.PerspectiveCamera(
		75, // FOV
		containerElement.clientWidth / containerElement.clientHeight, // Aspect ratio
		0.1, // Near
		1000 // Far
	);
	
	// Position camera
	camera.position.set(5, 20, 25);
	
	// Create renderer with quality options
	const renderer = new THREE.WebGLRenderer({ 
		antialias: !lowQuality && antialiasing,
		powerPreference: 'high-performance',
		precision: lowQuality ? 'lowp' : 'mediump'
	});
	renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
	renderer.setPixelRatio(lowQuality ? Math.min(1, pixelRatio) : pixelRatio);
	
	// Add or replace renderer in container
	while (containerElement.firstChild) {
		containerElement.removeChild(containerElement.firstChild);
	}
	containerElement.appendChild(renderer.domElement);
	
	// Configure shadows based on quality settings
	renderer.shadowMap.enabled = shadows && !lowQuality;
	if (renderer.shadowMap.enabled) {
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	}
	
	// Create controls
	const controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.25;
	controls.screenSpacePanning = false;
	controls.enableKeys = false; // Disable arrow key controls to prevent page scrolling
	controls.maxPolarAngle = Math.PI / 2;
	controls.target.set(0, 0, 0);
	controls.update();
	
	// Create light
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);
	
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(50, 75, 50);
	directionalLight.castShadow = shadows && !lowQuality;
	scene.add(directionalLight);
	
	if (directionalLight.castShadow) {
		directionalLight.shadow.mapSize.width = lowQuality ? 512 : 2048;
		directionalLight.shadow.mapSize.height = lowQuality ? 512 : 2048;
		directionalLight.shadow.camera.near = 0.5;
		directionalLight.shadow.camera.far = 500;
	}
	
	// Create groups for board elements
	let boardGroup, tetrominoGroup, chessPiecesGroup;
	
	// Create or reuse board group
	if (existingBoardGroup) {
		boardGroup = existingBoardGroup;
		// Clear children
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}
		scene.add(boardGroup);
					} else {
		boardGroup = new THREE.Group();
		boardGroup.name = 'board';
		scene.add(boardGroup);
	}
	
	// Create or reuse tetromino group
	if (existingTetrominoGroup) {
		tetrominoGroup = existingTetrominoGroup;
		// Clear children
		while (tetrominoGroup.children.length > 0) {
			tetrominoGroup.remove(tetrominoGroup.children[0]);
		}
		scene.add(tetrominoGroup);
					} else {
		tetrominoGroup = new THREE.Group();
		tetrominoGroup.name = 'tetrominos';
		scene.add(tetrominoGroup);
	}
	
	// Create or reuse chess pieces group
	if (existingChessPiecesGroup) {
		chessPiecesGroup = existingChessPiecesGroup;
		// Clear children
		while (chessPiecesGroup.children.length > 0) {
			chessPiecesGroup.remove(chessPiecesGroup.children[0]);
		}
		scene.add(chessPiecesGroup);
	} else {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chessPieces';
		scene.add(chessPiecesGroup);
	}
	
	// Add beautiful fluffy clouds to scene if not in low quality mode
	if (!lowQuality) {
		createFewClouds(scene);
	}
	
	// Add resize listener
	window.addEventListener('resize', () => onWindowResize(camera, renderer, containerElement));
	
	return { 
		_scene: scene, 
		_camera: camera, 
		_renderer: renderer, 
		_controls: controls, 
		_boardGroup: boardGroup, 
		_tetrominoGroup: tetrominoGroup, 
		_chessPiecesGroup: chessPiecesGroup 
	};
}

/**
 * Create a single floating island at the given position
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {THREE.Material} material - Material to use for the island
 * @param {number} [heightVariation=0.7] - Height variation for the island
 */
export function createFloatingIsland(x, z, material, heightVariation = 0.7, hasContent = false) {
	// Calculate a position hash for consistent randomness
	const posHash = Math.sin(x * 412.531 + z * 123.32) * 1000000;

	// Random factors based on position
	const actualHeight = typeof heightVariation === 'number' ? heightVariation : 0.7;
	const xOffset = (Math.sin(posHash * 1.1) * 0.25); // More offset
	const zOffset = (Math.sin(posHash * 2.3) * 0.25);
	const yOffset = -1 + Math.sin(x * 0.3 + z * 0.5) * actualHeight; // Vertical variation

	// Create island base
	const islandGroup = new THREE.Group();

	// Create top surface with rounded corners only if this is a content-bearing island
	if (hasContent) {
		const topGeometry = createRoundedBoxGeometry(0.9, 0.9, 0.9, 0.1, 4);
		const topSurface = new THREE.Mesh(topGeometry, material);
		topSurface.position.y = 0.5;
		topSurface.castShadow = true;
		topSurface.receiveShadow = true;
		islandGroup.add(topSurface);
	}

	// Create island bottom - slightly smaller and darker
	const bottomMaterial = material.clone();
	bottomMaterial.color.multiplyScalar(0.8); // Darker
	bottomMaterial.metalness = 0.1;
	bottomMaterial.roughness = 0.9;

	// Create a stalactite-like bottom using a cone shape
	const bottomGeometry = new THREE.ConeGeometry(0.4, actualHeight, 6);
	const bottomSurface = new THREE.Mesh(bottomGeometry, bottomMaterial);
	bottomSurface.position.y = -actualHeight * 0.5;
	bottomSurface.rotation.x = Math.PI; // Flip it
	bottomSurface.castShadow = true;
	
	// Add the bottom to the island group if not a content-bearing island
	if (!hasContent) {
		islandGroup.add(bottomSurface);
	}

	// Add small rocks and details to make each island unique - more of them for decoration
	const rockCount = Math.floor(Math.abs(Math.sin(posHash * 3.7) * 5) + 3); // More rocks

	for (let i = 0; i < rockCount; i++) {
		const rockGeometry = new THREE.SphereGeometry(
			0.15 + Math.abs(Math.sin(posHash * (i + 1) * 5.3)) * 0.2, // Larger size
			5, 4
		);
		
		const rockMaterial = bottomMaterial.clone();
		rockMaterial.color.multiplyScalar(0.9 + Math.sin(i) * 0.2);
		rockMaterial.opacity = 0.5 + Math.random() * 0.3;
		rockMaterial.transparent = true;
		
		// Make wireframe for decorative islands
		if (!hasContent) {
			rockMaterial.wireframe = Math.random() > 0.5; // 50% chance of wireframe
		}
		
		const rock = new THREE.Mesh(rockGeometry, rockMaterial);
		
		// Position the rocks to create a more natural cluster
		const angle = Math.sin(posHash * (i + 7.1)) * Math.PI * 2;
		const radius = 0.3 + Math.abs(Math.sin(posHash * (i + 3.3))) * 0.2;
		
		rock.position.x = Math.cos(angle) * radius;
		rock.position.z = Math.sin(angle) * radius;
		rock.position.y = -0.1 - Math.random() * 0.2;
		
		// Random rotation for interest
		rock.rotation.x = Math.random() * Math.PI;
		rock.rotation.y = Math.random() * Math.PI;
		rock.rotation.z = Math.random() * Math.PI;
		
		islandGroup.add(rock);
	}

	// Add very small bits of grass/greenery on some of the islands
	if (Math.abs(Math.sin(posHash * 7.3)) > 0.6) {
		const grassColor = new THREE.Color(
			0.2 + Math.abs(Math.sin(posHash * 8.7)) * 0.1,
			0.7 + Math.abs(Math.sin(posHash * 9.3)) * 0.2,
			0.2 + Math.abs(Math.sin(posHash * 10.1)) * 0.1
		);

		const grassMaterial = new THREE.MeshStandardMaterial({
			color: grassColor,
			roughness: 1.0,
			metalness: 0.0,
			transparent: true,
			opacity: 0.8
		});

		// Fewer bits of grass, just for accents
		const grassCount = 2 + Math.floor(Math.abs(Math.sin(posHash * 11.3) * 3));

		for (let i = 0; i < grassCount; i++) {
			// Smaller, more subtle grass bits
			const grassGeometry = new THREE.ConeGeometry(
				0.02 + Math.random() * 0.02,
				0.1 + Math.random() * 0.1,
				3
			);

			const grass = new THREE.Mesh(grassGeometry, grassMaterial);

			// Random positions on the island
			const angle = Math.sin(posHash * (i + 17.9)) * Math.PI * 2;
			const radius = 0.2 + Math.random() * 0.3;

			grass.position.x = Math.cos(angle) * radius;
			grass.position.z = Math.sin(angle) * radius;
			grass.position.y = -0.1 - Math.random() * 0.3;

			// Random tilt
			grass.rotation.x = Math.random() * 0.5;
			grass.rotation.z = Math.random() * 0.5;

			islandGroup.add(grass);
		}
	}

	// Position with offsets for natural floating appearance
	islandGroup.position.set(
		x + xOffset,
		yOffset + (Math.sin(Date.now() * 0.0005 + posHash) * 0.1), // Slight bobbing animation
		z + zOffset
	);

	// Add slight random rotation for more natural look
	islandGroup.rotation.x = (Math.sin(posHash * 27.1)) * 0.05;
	islandGroup.rotation.y = (Math.sin(posHash * 28.3)) * 0.05;
	islandGroup.rotation.z = (Math.sin(posHash * 29.7)) * 0.05;

	// Store cell info for raycasting
	islandGroup.userData = {
		type: 'decorative',  // Change type to mark these as decorative only
		position: { x, z },
		isWhite: (x + z) % 2 === 0
	};

	// Return a reference for animation
	return islandGroup;
}


/**
 * Create a rounded box geometry for prettier islands
 */
function createRoundedBoxGeometry(width, height, depth, radius, segments) {
	// Start with a BoxGeometry
	const geometry = new THREE.BoxGeometry(
		width - radius * 2,
		height - radius * 2,
		depth - radius * 2,
		segments, segments, segments
	);

	// Get the existing vertices
	const positionAttribute = geometry.attributes.position;

	// Run through the vertices and add radius to each corner
	for (let i = 0; i < positionAttribute.count; i++) {
		const x = positionAttribute.getX(i);
		const y = positionAttribute.getY(i);
		const z = positionAttribute.getZ(i);

		// Calculate the radius vector
		const rx = x < 0 ? -radius : radius;
		const ry = y < 0 ? -radius : radius;
		const rz = z < 0 ? -radius : radius;

		// Set the new position
		positionAttribute.setXYZ(i, x + rx, y + ry, z + rz);
	}

	// Update the geometry
	geometry.computeVertexNormals();

	return geometry;
}
/**
 * Create a floating cube cell for the board
 * @param {number} x - X-coordinate in the board
 * @param {number} z - Z-coordinate in the board
 * @param {THREE.Material} material - Material for the cell
 * @param {THREE.Group} boardGroup - Group to add the cell to
 * @param {number} centerX - X-coordinate of the board centre
 * @param {number} centerZ - Z-coordinate of the board centre
 * @returns {THREE.Mesh} The created cell
 */
export function createFloatingCube(x, z, material, boardGroup) {
	try {
		// Create a cube for the cell
		const cellGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
		const cellMesh = new THREE.Mesh(cellGeometry, material);


		// Position the cell using relative coordinates
		cellMesh.position.set(x, 0, z);

		// Ensure no rotation at all - critical to prevent board from becoming tilted
		cellMesh.rotation.set(0, 0, 0);

		// Mark it as a board cell to prevent it from being animated
		cellMesh.userData = {
			type: 'cell',
			position: { x, z },
			isWhite: (x + z) % 2 === 0,
			isStatic: true // Indicates this should not be rotated or bobbed
		};

		// Add shadows
		cellMesh.castShadow = true;
		cellMesh.receiveShadow = true;

		// Add to board group
		boardGroup.add(cellMesh);

		return cellMesh;
	} catch (error) {
		console.error(`Error creating floating cube at (${x}, ${z}):`, error);
		return null;
	}
}
/**
 * Set up lights for the scene
 */
export function setupLights(scene) {
	// Clear any existing lights first
	scene.children = scene.children.filter(child => !(child instanceof THREE.Light));

	// Create a beautiful light blue sky background
	scene.background = new THREE.Color(0xAFE9FF); // Light sky blue
	scene.fog = new THREE.Fog(0xC5F0FF, 60, 150); // Light blue fog, pushed back


	// Main sunlight - golden warm directional light
	const sunLight = new THREE.DirectionalLight(0xFFFBE8, 1.35); // Warm sunlight
	sunLight.position.set(25, 80, 30);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 10;
	sunLight.shadow.camera.far = 200;
	sunLight.shadow.camera.left = -50;
	sunLight.shadow.camera.right = 50;
	sunLight.shadow.camera.top = 50;
	sunLight.shadow.camera.bottom = -50;
	sunLight.shadow.bias = -0.0001; // Reduce shadow acne
	scene.add(sunLight);

	// Ambient light for general illumination - sky colored
	const ambientLight = new THREE.AmbientLight(0xB0E2FF, 0.65); // Sky-colored
	scene.add(ambientLight);

	// Add a soft golden backlight for rim lighting effect
	const backLight = new THREE.DirectionalLight(0xFFF0E0, 0.4);
	backLight.position.set(-15, 20, -25);
	scene.add(backLight);

	// Add a soft blue-ish fill light from below for floating cells
	const fillLight = new THREE.DirectionalLight(0xC8E0FF, 0.25);
	fillLight.position.set(-20, -5, -20);
	scene.add(fillLight);

	// Add a subtle hemisphere light for better outdoor lighting
	const hemisphereLight = new THREE.HemisphereLight(0xFFFBE8, 0x080820, 0.5);
	scene.add(hemisphereLight);

	// Add beautiful fluffy clouds to scene
	addCloudsToScene(scene);
}
/**
 * Add decorative clouds to the scene
 */
function addCloudsToScene(scene) {
	// Create cloud material
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.85,
		roughness: 1.0,
		metalness: 0.0
	});

	// Create cloud group
	const cloudGroup = new THREE.Group();
	cloudGroup.name = 'clouds';

	// Create several clouds at different positions
	for (let i = 0; i < 15; i++) {
		const cloudCluster = new THREE.Group();

		// Random position in the sky
		const x = (Math.random() - 0.5) * 100;
		const y = 20 + Math.random() * 20;
		const z = (Math.random() - 0.5) * 100;

		// Create 3-5 puffs for each cloud
		const puffCount = 3 + Math.floor(Math.random() * 3);

		for (let j = 0; j < puffCount; j++) {
			// Create a puff (a simple sphere)
			const size = 2 + Math.random() * 3;
			const puffGeometry = new THREE.SphereGeometry(size, 7, 7);
			const puff = new THREE.Mesh(puffGeometry, cloudMaterial);

			// Position within cluster
			const puffX = (Math.random() - 0.5) * 5;
			const puffY = (Math.random() - 0.5) * 2;
			const puffZ = (Math.random() - 0.5) * 5;

			puff.position.set(puffX, puffY, puffZ);
			cloudCluster.add(puff);
		}

		// Position the whole cluster
		cloudCluster.position.set(x, y, z);
		cloudGroup.add(cloudCluster);
	}

	// Add clouds to scene
	scene.add(cloudGroup);
}


/**
 * Creates a board with floating islands in the sky
 * @param {THREE.Group} boardGroup - Group to add board cells to
 */
export function createBoard(boardGroup, gameState) {
	console.log('Creating floating islands based on received game state...');
	
	// Safety check for null boardGroup
	if (!boardGroup) {
		console.error('Cannot create board: boardGroup is undefined');
		return;
	}

	try {
		// Clear any existing board content
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}


		// Create materials for cells - use more natural colors
		const whiteMaterial = new THREE.MeshStandardMaterial({
			color: 0xf5f5f5,
			roughness: 0.8,
			metalness: 0.1
		});

		const darkMaterial = new THREE.MeshStandardMaterial({
			color: 0x3a3a3a,
			roughness: 0.7,
			metalness: 0.2
		});

		// Find the board centre marker to position cells properly
		const centreMark = findBoardCentreMarker(gameState);
		const centerX = centreMark.x;
		const centerZ = centreMark.z;
		console.log(`Using centre marker at (${centerX}, ${centerZ}) for board creation`);
		
		// Ensure the marker is properly stored in the game state
		if (gameState.board) {
			gameState.board.centreMarker = { x: centerX, z: centerZ };
		}

		// Check if there's board data
		const hasBoardData = gameState?.board &&
			typeof gameState.board === 'object' &&
			gameState.board.cells &&
			Object.keys(gameState.board.cells).length > 0;

		console.log(`Creating board. Has board data: ${hasBoardData} (${hasBoardData ? Object.keys(gameState.board.cells).length : 0} cells)`);

		// ONLY create cells where there's data
		if (hasBoardData) {
			// Track count for logging
			let createdCellCount = 0;

			// Create cells based on actual board data
			for (const key in gameState.board.cells) {
				const [x, z] = key.split(',').map(Number);
				const cell = gameState.board.cells[key];

				// Skip empty cells
				if (cell === null || cell === undefined) continue;

				// Determine if white or dark cell for checkerboard pattern
				const isWhite = (x + z) % 2 === 0;
				const material = isWhite ? whiteMaterial : darkMaterial;

				// Get relative position using the translation function
				const relativePos = translatePosition({x, z}, gameState, false);

				// Create the floating cube for the actual game board
				//const cellMesh = createFloatingCube(relativePos.x, relativePos.z, material, boardGroup);

				// Create the floating island below the cube for decoration only
				// Use varied white/very light green materials for the islands
				const cloudColor = new THREE.Color(
					0.95 + Math.abs(Math.sin(x * 0.3 + z * 0.7) * 0.05),  // Almost white
					0.97 + Math.abs(Math.sin(x * 0.5 + z * 0.3) * 0.03),  // Very slight green tint
					0.95 + Math.abs(Math.sin(x * 0.7 + z * 0.5) * 0.05)   // Almost white
				);
				
				const islandMaterial = new THREE.MeshStandardMaterial({
					color: cloudColor,
					roughness: 1.0,
					metalness: 0.0,
					transparent: true,
					opacity: 0.6  // More transparent
				});

				// // Only create clouds for some cells to reduce visual clutter
				// if (Math.random() > 0.4) {  // 60% chance to create a cloud
				// 	// Create decorative island with larger offsets for more spacing
				// 	const island = createFloatingIsland(
				// 		relativePos.x + (Math.random() * 0.5 - 0.25),  // Larger random X offset
				// 		relativePos.z + (Math.random() * 0.5 - 0.25),  // Larger random Z offset
				// 		islandMaterial,
				// 		0.4 + (Math.random() * 0.2),  // Lower height variation
				// 		false  // No content on island
				// 	);

				// 	// Position island further below the cube
				// 	island.position.y -= 2.0 + (Math.random() * 1.0);  // More distance below

				// 	// Randomize the scale to add variety
				// 	const scale = 0.7 + Math.random() * 0.4;  // Smaller scale
				// 	island.scale.set(scale, scale, scale);

				// 	// Add the island to the board group
				// 	boardGroup.add(island);
				// }

				// Save the absolute position in the userData (now on cellMesh instead of island)
				if (cellMesh) {
					cellMesh.userData.data = cell;
					createdCellCount++;
				}
			}

			console.log(`Created ${createdCellCount} cells for the board`);
		} else {
			console.log('No board data available, skipping board creation');
		}

		// Position the board group at the origin
		boardGroup.position.set(0, 0, 0);

		return boardGroup;
	} catch (error) {
		console.error('Error creating board:', error);
		return null;
	}
}