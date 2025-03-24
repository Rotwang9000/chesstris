import * as THREE from './utils/three.module.js';
import { createFewClouds } from './createFewClouds.js';
import { onWindowResize } from './enhanced-gameCore.js';
import { boardFunctions } from './boardFunctions.js';

export function setupScene(containerElement, scene, camera, renderer, controls, boardGroup, tetrominoGroup, chessPiecesGroup) {
	console.log('Setting up enhanced 3D scene with beautiful sky...');
	
	// Create scene
	scene = new THREE.Scene();
	
	// Create a beautiful light blue sky background - lighter color
	scene.background = new THREE.Color(0xAFE9FF); // Lighter sky blue
	scene.fog = new THREE.Fog(0xC5F0FF, 60, 150); // Lighter blue fog, pushed further back
	
	// Create camera
	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	
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
	scene.add(boardGroup);
	
	// Create tetromino group
	tetrominoGroup = new THREE.Group();
	tetrominoGroup.name = 'tetrominos';
	scene.add(tetrominoGroup);
	
	// Create chess pieces group
	chessPiecesGroup = new THREE.Group();
	chessPiecesGroup.name = 'chessPieces';
	scene.add(chessPiecesGroup);
	
	// Add beautiful fluffy clouds to scene
	createFewClouds(scene);
	
	// Add resize listener
	window.addEventListener('resize', () => onWindowResize(camera, renderer, containerElement));

	return { _scene: scene, _camera: camera, _renderer: renderer, _controls: controls, _boardGroup: boardGroup, _tetrominoGroup: tetrominoGroup, _chessPiecesGroup: chessPiecesGroup };
}

export function rebuildScene() {
	// Clear existing tetrominos and chess pieces
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// Create base board cells first
	if (typeof boardFunctions !== 'undefined' && boardFunctions.createBoardCells) {
		// Use the imported module function
		boardFunctions.createBoardCells(gameState, boardGroup, createFloatingIsland, THREE);
	} else {
		// Fall back to old function if available
		if (typeof createBoardCells === 'function') {
			createBoardCells();
		} else {
			console.warn('createBoardCells function not available');
		}
	}
	
	// Check if we have valid board data
	if (!gameState.board || !Array.isArray(gameState.board) || gameState.board.length === 0) {
		console.warn('No board data to visualize');
		return;
	}
	
	// Get board size
	const boardSize = gameState.board.length;
	
	// Debug output of the actual board structure
	console.log('Board structure first row sample:', 
		gameState.board.length > 0 ? JSON.stringify(gameState.board[0]) : 'Empty');
	
	// Create visuals for each cell
	for (let z = 0; z < boardSize; z++) {
		const row = gameState.board[z];
		if (!row) continue;
		
		for (let x = 0; x < row.length; x++) {
			const cellType = row[x];
			
			// Skip empty cells
			if (cellType === 0 || cellType === null || cellType === undefined) continue;
			
			// Process based on cell type
			if (typeof cellType === 'object' && cellType !== null) {
				// Handle object-based cell data
				if (cellType.type === 'chess') {
					// Chess piece
					if (typeof boardFunctions !== 'undefined' && boardFunctions.createChessPiece) {
						const chessPiece = boardFunctions.createChessPiece(
							gameState, 
							x, 
							z, 
							cellType.chessPiece.type || "PAWN",
							cellType.chessPiece.player || 1,
							gameState.currentPlayer,
							THREE
						);
						chessPiecesGroup.add(chessPiece);
					} else {
						console.warn('createChessPiece function not available');
					}
				} else if (cellType.type === 'tetromino') {
					// Tetromino block
					createTetrominoBlock(x, z, cellType.player || 1);
				} else if (cellType.type === 'homeZone') {
					// Home zone
					const zoneType = (cellType.player + 5);
					updateHomeZoneVisual(x, z, zoneType);
				}
			} else if (typeof cellType === 'number') {
				// Handle legacy numeric cell types
				if (cellType >= 1 && cellType <= 5) {
					// Player tetromino placements - create block
					createTetrominoBlock(x, z, cellType);
				} else if (cellType >= 6 && cellType <= 10) {
					// Home zones - add visual indicator
					updateHomeZoneVisual(x, z, cellType);
				} else if (cellType >= 11) {
					// Chess pieces - create piece
					if (typeof boardFunctions !== 'undefined' && boardFunctions.createChessPiece) {
						const chessPiece = boardFunctions.createChessPiece(
							gameState, 
							x, 
							z, 
							cellType, 
							Math.floor(cellType / 10), // Extract player ID from cellType
							gameState.currentPlayer,
							THREE
						);
						chessPiecesGroup.add(chessPiece);
					} else {
						console.warn('createChessPiece function not available');
					}
				}
			}
		}
	}
	
	// Now that we've processed the board, also update chess pieces from separate array if available
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		updateChessPieces();
	}
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

	// Create top surface with rounded corners
	const topGeometry = createRoundedBoxGeometry(0.9, 0.9, 0.9, 0.1, 4);
	const topSurface = new THREE.Mesh(topGeometry, material);
	topSurface.position.y = 0.5;
	topSurface.castShadow = true;
	topSurface.receiveShadow = true;

	if (hasContent) {
		// Add to island group
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

	// islandGroup.add(bottomSurface);

	// Add small rocks and details to make each island unique
	const rockCount = Math.floor(Math.abs(Math.sin(posHash * 3.7) * 3) + 1);

	for (let i = 0; i < rockCount; i++) {
		const rockGeometry = new THREE.SphereGeometry(
			0.1 + Math.abs(Math.sin(posHash * (i + 1) * 5.3)) * 0.15, // Size
			5, 4
		);

		const rockMaterial = bottomMaterial.clone();
		rockMaterial.color.multiplyScalar(0.9 + Math.sin(i) * 0.2);
		//make them fluffier like little clouds
		rockMaterial.wireframe = true;
		rockMaterial.opacity = 0.3;
		rockMaterial.transparent = true;
		rockMaterial.side = THREE.DoubleSide;
	

		const rock = new THREE.Mesh(rockGeometry, rockMaterial);

		// Position on the surface
		const angle = Math.sin(posHash * (i + 7.1)) * Math.PI * 2;
		const radius = 0.25 + Math.abs(Math.sin(posHash * (i + 3.3))) * 0.2;

		rock.position.x = Math.cos(angle) * radius;
		rock.position.z = Math.sin(angle) * radius;
		rock.position.y = 0.1 + Math.sin(posHash * i) * 0.05;

		// Random rotation
		rock.rotation.x = Math.sin(posHash * (i + 1.5)) * 0.5;
		rock.rotation.y = Math.sin(posHash * (i + 2.5)) * Math.PI;
		rock.rotation.z = Math.sin(posHash * (i + 3.5)) * 0.5;

		rock.castShadow = true;
		islandGroup.add(rock);
	}

	// Add grass or flowers on some islands
	if (Math.abs(Math.sin(posHash * 7.3)) > 0.7) {
		const grassColor = new THREE.Color(
			0.1 + Math.abs(Math.sin(posHash * 8.7)) * 0.2,
			0.6 + Math.abs(Math.sin(posHash * 9.3)) * 0.3,
			0.1 + Math.abs(Math.sin(posHash * 10.1)) * 0.1
		);

		const grassMaterial = new THREE.MeshStandardMaterial({
			color: grassColor,
			roughness: 1.0,
			metalness: 0.0
		});

		const grassCount = Math.floor(Math.abs(Math.sin(posHash * 11.3) * 5) + 3);

		for (let i = 0; i < grassCount; i++) {
			const grassGeometry = new THREE.ConeGeometry(
				0.03 + Math.abs(Math.sin(posHash * (i + 13.1))) * 0.02,
				0.2 + Math.abs(Math.sin(posHash * (i + 14.7))) * 0.1,
				3
			);

			const grass = new THREE.Mesh(grassGeometry, grassMaterial);

			// Position randomly on the surface
			const angle = Math.sin(posHash * (i + 17.9)) * Math.PI * 2;
			const radius = 0.3 + Math.abs(Math.sin(posHash * (i + 18.3))) * 0.1;

			grass.position.x = Math.cos(angle) * radius;
			grass.position.z = Math.sin(angle) * radius;
			grass.position.y = 0.1;

			// Random tilt
			grass.rotation.x = Math.sin(posHash * (i + 19.5)) * 0.3;
			grass.rotation.z = Math.sin(posHash * (i + 20.5)) * 0.3;

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
		type: 'cell',
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

