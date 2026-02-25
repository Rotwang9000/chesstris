import { createFewClouds } from './createFewClouds.js';
import { getTHREE, getGameState } from './gameContext.js';
import { onWindowResize } from './enhanced-gameCore.js';
import { translatePosition } from './centreBoardMarker.js';

// Cache of existing islands for reuse
const floatingIslandCache = {};

/**
 * Create a starfield for cute/space mode with extra whimsical elements
 * @param {THREE.Scene} scene - The scene to add stars to
 * @param {Object} THREE - Three.js instance
 */
function createStarfield(scene, THREE) {
	// Create starfield with varied star sizes and colors
	const starCount = 800; // More stars for cuter effect
	const starPositions = [];
	const starColors = [];
	const starSizes = [];
	
	// Cute 8-bit style star colors: pastels and brights
	const starColorPalette = [
		new THREE.Color(0xffffff), // white
		new THREE.Color(0x00ffff), // cyan  
		new THREE.Color(0xff00ff), // magenta
		new THREE.Color(0xffff00), // yellow
		new THREE.Color(0xff80ff), // pink
		new THREE.Color(0x80ffff), // light cyan
		new THREE.Color(0xffaacc), // pastel pink
		new THREE.Color(0xaaffcc), // mint
		new THREE.Color(0xffccaa), // peach
		new THREE.Color(0xccaaff), // lavender
	];
	
	for (let i = 0; i < starCount; i++) {
		// Distribute stars in a large sphere around the scene
		const theta = Math.random() * Math.PI * 2;
		const phi = Math.acos(2 * Math.random() - 1);
		const radius = 80 + Math.random() * 120;
		
		const x = radius * Math.sin(phi) * Math.cos(theta);
		const y = radius * Math.sin(phi) * Math.sin(theta);
		const z = radius * Math.cos(phi);
		
		starPositions.push(x, y, z);
		
		// Random color from palette
		const color = starColorPalette[Math.floor(Math.random() * starColorPalette.length)];
		starColors.push(color.r, color.g, color.b);
		
		// Varied star sizes with some large "bright" stars for sparkle effect
		const size = Math.random() < 0.15 ? 2.5 + Math.random() * 2.5 : 0.5 + Math.random() * 1.5;
		starSizes.push(size);
	}
	
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
	geometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));
	
	// Custom shader material for pixelated square stars (8-bit style)
	const starMaterial = new THREE.PointsMaterial({
		size: 2.0, // Slightly larger for cuter look
		vertexColors: true,
		transparent: true,
		opacity: 1.0,
		sizeAttenuation: true
	});
	
	const starfield = new THREE.Points(geometry, starMaterial);
	starfield.name = 'starfield';
	scene.add(starfield);
	
	// Add animated "twinkling" by storing reference for later updates
	starfield.userData.twinklePhases = new Float32Array(starCount);
	starfield.userData.baseSizes = new Float32Array(starSizes);
	for (let i = 0; i < starCount; i++) {
		starfield.userData.twinklePhases[i] = Math.random() * Math.PI * 2;
	}
	
	// Add cute floating shapes (hearts, stars) around the scene
	addCuteFloatingShapes(scene, THREE);
	
	return starfield;
}

/**
 * Add cute floating heart and star shapes for whimsical effect
 * @param {THREE.Scene} scene - The scene to add shapes to
 * @param {Object} THREE - Three.js instance
 */
function addCuteFloatingShapes(scene, THREE) {
	const shapeGroup = new THREE.Group();
	shapeGroup.name = 'cuteShapes';
	
	const cuteColors = [0xff69b4, 0x87ceeb, 0x98fb98, 0xffa07a, 0xdda0dd, 0xfffacd];
	
	// Create small floating geometric shapes
	for (let i = 0; i < 30; i++) {
		let geometry;
		const shapeType = Math.random();
		
		if (shapeType < 0.5) {
			// Star shape (octahedron as approximation)
			geometry = new THREE.OctahedronGeometry(1 + Math.random() * 0.5, 0);
		} else {
			// Diamond/gem shape
			geometry = new THREE.TetrahedronGeometry(0.8 + Math.random() * 0.4, 0);
		}
		
		const material = new THREE.MeshBasicMaterial({
			color: cuteColors[Math.floor(Math.random() * cuteColors.length)],
			transparent: true,
			opacity: 0.6 + Math.random() * 0.3
		});
		
		const shape = new THREE.Mesh(geometry, material);
		
		// Random position in a wide area
		const angle = Math.random() * Math.PI * 2;
		const distance = 40 + Math.random() * 60;
		shape.position.set(
			Math.cos(angle) * distance,
			-10 + Math.random() * 50,
			Math.sin(angle) * distance
		);
		
		// Random rotation
		shape.rotation.set(
			Math.random() * Math.PI,
			Math.random() * Math.PI,
			Math.random() * Math.PI
		);
		
		// Store animation data
		shape.userData = {
			type: 'cuteShape',
			baseY: shape.position.y,
			floatSpeed: 0.5 + Math.random() * 1.0,
			floatPhase: Math.random() * Math.PI * 2,
			rotateSpeed: 0.2 + Math.random() * 0.5
		};
		
		shapeGroup.add(shape);
	}
	
	scene.add(shapeGroup);
}

/**
 * Animate cute mode elements (stars twinkling, shapes floating)
 * Call this in the render loop when in cute mode
 * @param {THREE.Scene} scene - The scene
 * @param {number} deltaTime - Time since last frame
 */
export function animateCuteElements(scene, deltaTime) {
	if (!scene) return;
	
	const time = performance.now() * 0.001;
	
	// Animate starfield twinkling
	const starfield = scene.getObjectByName('starfield');
	if (starfield && starfield.userData.twinklePhases && starfield.userData.baseSizes) {
		const sizes = starfield.geometry.attributes.size;
		if (sizes) {
			for (let i = 0; i < sizes.count; i++) {
				const phase = starfield.userData.twinklePhases[i];
				const baseSize = starfield.userData.baseSizes[i];
				// Twinkle effect: size oscillates
				sizes.array[i] = baseSize * (0.5 + 0.5 * Math.sin(time * 2 + phase));
			}
			sizes.needsUpdate = true;
		}
	}
	
	// Animate cute floating shapes
	const cuteShapes = scene.getObjectByName('cuteShapes');
	if (cuteShapes) {
		cuteShapes.children.forEach(shape => {
			if (shape.userData.type === 'cuteShape') {
				// Gentle floating motion
				shape.position.y = shape.userData.baseY + 
					Math.sin(time * shape.userData.floatSpeed + shape.userData.floatPhase) * 2;
				// Slow rotation
				shape.rotation.y += shape.userData.rotateSpeed * deltaTime;
			}
		});
	}
}

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
 * @param {boolean} [hasContent=false] - Whether the island has content
 * @returns {THREE.Group} The island group object
 */
export function createFloatingIsland(x, z, material, heightVariation = 0.7, hasContent = false) {
	// Calculate a position hash for consistent randomness
	const posHash = Math.sin(x * 412.531 + z * 123.32) * 1000000;
	
	// Create a unique key for this island
	const islandKey = `${x.toFixed(2)},${z.toFixed(2)}`;
	
	// Check if we already have this island in the cache
	if (floatingIslandCache[islandKey]) {
		// Island exists, update its animation parameters
		const existingIsland = floatingIslandCache[islandKey];
		
		// Update the bobbing animation by changing the phase
		const newPhase = Date.now() * 0.0005;
		existingIsland.userData.lastAnimationTime = Date.now();
		existingIsland.userData.bobPhase = newPhase;
		
		// Return the existing island
		return existingIsland;
	}

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
		
		// DISABLED: Wireframe was rendering over other elements
		// if (!hasContent) { rockMaterial.wireframe = Math.random() > 0.5; }
		
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

	// Get the gameState object from the enhanced-gameCore module
	const gameState = getGameState();
	
	const absPos = translatePosition({x, z}, gameState, true);

	// Position with offsets for natural floating appearance
	islandGroup.position.set(
		absPos.x + xOffset,
		yOffset, // Base Y position without animation
		absPos.z + zOffset
	);

	// Add slight random rotation for more natural look
	islandGroup.rotation.x = (Math.sin(posHash * 27.1)) * 0.05;
	islandGroup.rotation.y = (Math.sin(posHash * 28.3)) * 0.05;
	islandGroup.rotation.z = (Math.sin(posHash * 29.7)) * 0.05;

	// Store animation parameters in userData
	islandGroup.userData = {
		type: 'decorative',  // Mark these as decorative only
		position: { x, z },
		isWhite: (x + z) % 2 === 0,
		baseY: islandGroup.position.y, // Store the base Y position
		bobAmplitude: 0.1, // Amplitude of bobbing motion
		bobFrequency: 0.0005 + Math.random() * 0.0001, // Slightly different for each island
		bobPhase: Math.random() * Math.PI * 2, // Random starting phase
		lastAnimationTime: Date.now() // Track when we last animated
	};

	// Store in cache for future reuse
	floatingIslandCache[islandKey] = islandGroup;

	// Return a reference for animation
	return islandGroup;
}

// Add this new function after createFloatingIsland
/**
 * Animate all floating islands in the scene
 * @param {THREE.Scene} scene - The scene containing islands
 */
export function animateFloatingIslands(scene) {
	if (!scene || !scene.children) return;
	
	const now = Date.now();
	
	// Find the board group
	const boardGroup = scene.children.find(child => child.name === 'boardGroup');
	if (!boardGroup) return;
	
	// Animate all islands in the board group
	boardGroup.children.forEach(child => {
		if (child.userData && child.userData.type === 'decorative') {
			// Get animation parameters
			const { baseY, bobAmplitude, bobFrequency, bobPhase } = child.userData;
			
			// Calculate new Y position with bobbing motion
			if (baseY !== undefined) {
				child.position.y = baseY + Math.sin(now * bobFrequency + bobPhase) * bobAmplitude;
				
				// Apply very subtle rotation changes
				child.rotation.x += Math.sin(now * 0.0001) * 0.0001;
				child.rotation.y += Math.sin(now * 0.00015) * 0.0001;
				
				// Update last animation time
				child.userData.lastAnimationTime = now;
			}
		}
	});
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
		const cellGeometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
		const cellMesh = new THREE.Mesh(cellGeometry, material);

		const gameState = getGameState();
		const absPos = translatePosition({x, z}, gameState, true);

		cellMesh.position.set(absPos.x, 0, absPos.z);
		cellMesh.rotation.set(0, 0, 0);

		cellMesh.userData = {
			type: 'cell',
			position: { x, z },
			isWhite: (x + z) % 2 === 0,
			isStatic: true
		};

		cellMesh.castShadow = true;
		cellMesh.receiveShadow = true;

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
export function setupLights(scene, options = {}) {
	const THREE = getTHREE();
	const lowQuality = !!options.lowQuality;

	// Clear existing lights, starfield, and floating shapes from previous mode
	if (scene && Array.isArray(scene.children)) {
		[...scene.children].forEach(child => {
			if (child && (child.isLight || child instanceof THREE.Light)) {
				scene.remove(child);
			}
			if (child && (child.name === 'starfield' || child.name === 'cuteShapes' || child.name === 'cloudBed' || child.name === 'clouds')) {
				scene.remove(child);
				if (child.geometry) child.geometry.dispose();
				if (child.material) child.material.dispose();
			}
		});
	}

	// Low-spec / cute mode: 8-bit space theme with distinct aesthetic
	if (lowQuality) {
		// Deep space background - dark with purple/blue gradient feel
		scene.background = new THREE.Color(0x0a0a1a); // Deep space dark blue
		scene.fog = new THREE.Fog(0x0a0a2a, 80, 200); // Very subtle space fog
		
		// Create starfield
		createStarfield(scene, THREE);
		
		// Bright arcade-style lighting
		const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
		mainLight.position.set(20, 40, 20);
		mainLight.castShadow = false;
		scene.add(mainLight);
		
		// Purple/magenta accent light for retro feel
		const accentLight = new THREE.DirectionalLight(0xff00ff, 0.3);
		accentLight.position.set(-20, 20, -10);
		scene.add(accentLight);
		
		// Cyan accent light from opposite side
		const accentLight2 = new THREE.DirectionalLight(0x00ffff, 0.25);
		accentLight2.position.set(20, 15, -30);
		scene.add(accentLight2);
		
		// Strong ambient for that flat 8-bit look
		const ambientLight = new THREE.AmbientLight(0x4040a0, 0.8);
		scene.add(ambientLight);
		
		return;
	}
	
	// Retro mode: CRT terminal aesthetic
	if (options.renderProfile === 'retro') {
		scene.background = new THREE.Color(0x000000);
		scene.fog = new THREE.Fog(0x001a00, 60, 180);

		// Dim green ambient — everything bathed in phosphor glow
		const ambientLight = new THREE.AmbientLight(0x003300, 0.6);
		scene.add(ambientLight);

		// Green directional from above
		const mainLight = new THREE.DirectionalLight(0x00ff41, 0.8);
		mainLight.position.set(15, 50, 15);
		mainLight.castShadow = false;
		scene.add(mainLight);

		// Subtle amber accent from the side (for opponent contrast)
		const amberAccent = new THREE.DirectionalLight(0xff8800, 0.15);
		amberAccent.position.set(-20, 20, -15);
		scene.add(amberAccent);

		return;
	}

	// Normal mode: Rich blue gradient sky
	scene.background = new THREE.Color(0x87CEFA);
	scene.fog = new THREE.FogExp2(0xC5E8FF, 0.006);

	// Key light — warm sun from upper-right
	const sunLight = new THREE.DirectionalLight(0xFFF5E0, 1.1);
	sunLight.position.set(30, 60, 25);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 5;
	sunLight.shadow.camera.far = 150;
	sunLight.shadow.camera.left = -40;
	sunLight.shadow.camera.right = 40;
	sunLight.shadow.camera.top = 40;
	sunLight.shadow.camera.bottom = -40;
	sunLight.shadow.bias = -0.0002;
	sunLight.shadow.normalBias = 0.02;
	scene.add(sunLight);

	// Hemisphere light — sky/ground colour fill
	const hemiLight = new THREE.HemisphereLight(0x88BBEE, 0x446633, 0.6);
	scene.add(hemiLight);

	// Ambient fill
	const ambientLight = new THREE.AmbientLight(0xE8F0FF, 0.35);
	scene.add(ambientLight);

	// Rim light from behind for depth
	const rimLight = new THREE.DirectionalLight(0xFFE8D0, 0.3);
	rimLight.position.set(-20, 15, -30);
	scene.add(rimLight);

	addCloudsToScene(scene);
	addAmbientParticles(scene, THREE);
}

/**
 * Add subtle floating ambient particles for full-res mode
 * Creates a dreamy, magical atmosphere
 * @param {THREE.Scene} scene - The scene to add particles to
 * @param {Object} THREE - Three.js instance
 */
function addAmbientParticles(scene, THREE) {
	const particleCount = 200;
	const particlePositions = [];
	const particleSizes = [];
	
	// Create particles in a wide area around the playing field
	for (let i = 0; i < particleCount; i++) {
		const x = (Math.random() - 0.5) * 120;
		const y = Math.random() * 40 - 5;
		const z = (Math.random() - 0.5) * 120;
		
		particlePositions.push(x, y, z);
		particleSizes.push(0.1 + Math.random() * 0.3);
	}
	
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
	geometry.setAttribute('size', new THREE.Float32BufferAttribute(particleSizes, 1));
	
	const material = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 0.3,
		transparent: true,
		opacity: 0.4,
		sizeAttenuation: true
	});
	
	const particles = new THREE.Points(geometry, material);
	particles.name = 'ambientParticles';
	
	// Store base positions for animation
	particles.userData.basePositions = [...particlePositions];
	particles.userData.phases = new Float32Array(particleCount);
	for (let i = 0; i < particleCount; i++) {
		particles.userData.phases[i] = Math.random() * Math.PI * 2;
	}
	
	scene.add(particles);
}

/**
 * Animate ambient particles for full-res mode
 * Call this in render loop for non-cute mode
 * @param {THREE.Scene} scene - The scene
 * @param {number} deltaTime - Time since last frame
 */
export function animateAmbientParticles(scene, deltaTime) {
	if (!scene) return;
	
	const particles = scene.getObjectByName('ambientParticles');
	if (!particles || !particles.userData.basePositions) return;
	
	const time = performance.now() * 0.0005;
	const positions = particles.geometry.attributes.position;
	const basePositions = particles.userData.basePositions;
	const phases = particles.userData.phases;
	
	for (let i = 0; i < positions.count; i++) {
		const i3 = i * 3;
		const phase = phases[i];
		
		// Gentle floating motion
		positions.array[i3] = basePositions[i3] + Math.sin(time + phase) * 0.5;
		positions.array[i3 + 1] = basePositions[i3 + 1] + Math.sin(time * 0.7 + phase) * 0.3;
		positions.array[i3 + 2] = basePositions[i3 + 2] + Math.cos(time * 0.8 + phase) * 0.5;
	}
	
	positions.needsUpdate = true;
}

/**
 * Add decorative clouds to the scene
 */
function addCloudsToScene(scene) {
	// Sky clouds replaced by createFewClouds (sparse bed beneath the board)
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
		// Clear the board group fully. Keeping old decorative meshes caused persistent
		// white "tube" artefacts after profile/theme updates.
		const childrenToRemove = [...boardGroup.children];
		for (const child of childrenToRemove) {
			boardGroup.remove(child);
			if (child && typeof child.traverse === 'function') {
				child.traverse(node => {
					if (node.geometry && typeof node.geometry.dispose === 'function') {
						node.geometry.dispose();
					}
					if (node.material) {
						if (Array.isArray(node.material)) {
							node.material.forEach(mat => mat && typeof mat.dispose === 'function' && mat.dispose());
						} else if (typeof node.material.dispose === 'function') {
							node.material.dispose();
						}
					}
				});
			}
		}

		// Polished chess-board style tiles
		const whiteMaterial = new THREE.MeshStandardMaterial({
			color: 0xEDE8D5,
			roughness: 0.45,
			metalness: 0.05,
			envMapIntensity: 0.3
		});

		const darkMaterial = new THREE.MeshStandardMaterial({
			color: 0x5A7D5A,
			roughness: 0.5,
			metalness: 0.08,
			envMapIntensity: 0.3
		});

		// Check if there's board data
		const hasBoardData = gameState?.board &&
			typeof gameState.board === 'object' &&
			gameState.board.cells &&
			Object.keys(gameState.board.cells).length > 0;

		console.log(`Creating board. Has board data: ${hasBoardData} (${hasBoardData ? Object.keys(gameState.board.cells).length : 0} cells)`);

		// Track count for logging
		let createdCellCount = 0;

		// ONLY create cells where there's data
		if (hasBoardData) {
			// Create cells based on actual board data
			for (const key in gameState.board.cells) {
				const [x, z] = key.split(',').map(Number);
				const cell = gameState.board.cells[key];

				// Skip empty cells
				if (cell === null || cell === undefined) continue;

				// Determine if white or dark cell for checkerboard pattern
				const isWhite = (x + z) % 2 === 0;
				const material = isWhite ? whiteMaterial : darkMaterial;
			
				// Create the floating cube for the actual game board
				const cellMesh = createFloatingCube(x, z, material, boardGroup);

				// Decorative per-cell island pillars removed; they were visually noisy and
				// looked like white tubes. Atmosphere now comes from the sparse cloud bed.

				// Save the absolute position in the userData
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