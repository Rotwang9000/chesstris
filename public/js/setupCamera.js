import { THREE } from './enhanced-gameCore';
import * as NetworkManager from './utils/networkManager';

/**
 * Set up camera with proper position and controls
 * @param {THREE.Camera} camera - The camera to set up
 * @param {THREE.OrbitControls} controls - The orbit controls to set up
 * @param {THREE.WebGLRenderer} renderer - The renderer being used
 */
export function setupCamera(camera, controls, renderer) {
	if (!camera) {
		console.error('Cannot setup camera: camera is undefined');
		return;
	}
	
	console.log('Setting up camera with enhanced position and controls');
	
	// Set initial camera position for a good view of the board
	camera.position.set(20, 25, 20);
	camera.lookAt(8, 0, 8);
	
	// Check if THREE.OrbitControls is available
	if (typeof THREE !== 'undefined' && typeof THREE.OrbitControls !== 'undefined') {
		// Create new controls if not provided
		if (!controls) {
			console.log('Creating new OrbitControls');
			controls = new THREE.OrbitControls(camera, renderer.domElement);
		}
		
		// Configure controls for smooth movement
		controls.enableDamping = true;
		controls.dampingFactor = 0.15;
		controls.screenSpacePanning = true;
		controls.minDistance = 10;
		controls.maxDistance = 80;
		controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below horizon
		controls.target.set(8, 0, 8); // Look at center of board
		
		// Set up controls to handle touch events properly
		controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN
		};
		
		// Enable smooth rotating/panning
		controls.rotateSpeed = 0.7;
		controls.panSpeed = 0.8;
		controls.zoomSpeed = 1.0;
		
		// Ensure controls are updated
		controls.update();
		
		console.log('Camera controls initialized successfully');
		return controls;
	} else {
		console.warn('THREE.OrbitControls not available, camera will be static');
		return null;
	}
}

/**
 * Reset camera with specific gameplay settings
 * @param {THREE.WebGLRenderer} renderer - The renderer
 * @param {THREE.Camera} camera - The camera to reset
 * @param {THREE.OrbitControls} controls - The orbit controls
 * @param {Object} gameState - The current game state
 * @param {THREE.Scene} scene - The scene
 * @param {boolean} animate - Whether to animate the camera movement
 * @param {boolean} forceImmediate - Whether to force immediate repositioning
 */
export function resetCameraForGameplay(renderer, camera, controls, gameState, scene, animate = true, forceImmediate = false) {
	console.log('Resetting camera for gameplay view');

	// Validate required parameters
	if (!camera) {
		console.error('Cannot reset camera: camera is undefined');
		return;
	}
	
	if (!controls) {
		console.warn('Controls not available - creating new controls if possible');
		// Try to create controls if THREE is available
		if (typeof THREE !== 'undefined' && typeof THREE.OrbitControls !== 'undefined' && renderer) {
			controls = new THREE.OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;
			controls.dampingFactor = 0.15;
			controls.minDistance = 10;
			controls.maxDistance = 80;
			console.log('Created new controls during camera reset');
		} else {
			console.error('Cannot create controls - THREE.OrbitControls not available');
			// Set camera position directly
			camera.position.set(20, 25, 20); 
			camera.lookAt(8, 0, 8);
			return;
		}
	}

	// Default camera position - looking at the center of the board
	// Position further back for better board visibility
	let targetPosition = {
		x: 20, 
		y: 25, 
		z: 20
	};

	let lookAt = {
		x: 8, // Center of the board
		y: 0, 
		z: 8  // Center of the board
	};

	// Get player ID
	const playerId = typeof NetworkManager !== 'undefined' && NetworkManager.getPlayerId ? 
		NetworkManager.getPlayerId() : null;

	// If we have home zones data and playerId, position based on player's home zone
	if (playerId && gameState && gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
		// Find the player's home zone
		let homeZone = null;
		for (const [id, zone] of Object.entries(gameState.homeZones)) {
			if (id === playerId || id.includes(playerId)) {
				homeZone = zone;
				break;
			}
		}

		// If no home zone found, use the first one as fallback
		if (!homeZone && Object.values(gameState.homeZones).length > 0) {
			homeZone = Object.values(gameState.homeZones)[0];
		}

		// If home zone found, position camera based on it
		if (homeZone) {
			console.log('Positioning camera based on home zone:', homeZone);

			// Use cell coordinates directly as they match the board grid
			const homeX = homeZone.x !== undefined ? homeZone.x : 0;
			const homeZ = homeZone.z !== undefined ? homeZone.z : 0;
			const homeWidth = homeZone.width || 2;
			const homeHeight = homeZone.height || 2;

			// Calculate center of home zone
			const centerX = homeX + homeWidth / 2;
			const centerZ = homeZ + homeHeight / 2;

			// Position camera diagonally from home zone for better view
			targetPosition = {
				x: centerX - 12, 
				y: 20, 
				z: centerZ + 12
			};

			// Look at center of home zone
			lookAt = {
				x: centerX,
				y: 0,
				z: centerZ
			};

			console.log('Camera will move to:', targetPosition, 'looking at:', lookAt);
		}
	}

	// Set camera position immediately or animate
	if (!animate || forceImmediate) {
		// Directly set camera position and look at target
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
		controls.target.set(lookAt.x, lookAt.y, lookAt.z);
		
		// Update controls
		controls.update();
		
		console.log('Camera position set immediately to:', targetPosition);
		
		// Force a render
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		return;
	}

	// Get current position for animation
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};

	// Get current look-at
	const startLookAt = {
		x: controls.target.x,
		y: controls.target.y,
		z: controls.target.z
	};

	// Animation duration
	const duration = 2000; // 2 seconds
	const startTime = Date.now();

	// Animate camera movement
	function animateCamera() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);

		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;

		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;

		// Update controls
		controls.update();

		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}

		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animateCamera);
		} else {
			console.log('Camera animation completed');
		}
	}

	// Start animation
	animateCamera();
}

/**
 * Position camera based on home zone data
 */
export function resetCameraBasedOnHomeZone(camera, controls, gameState) {
	if (!camera || !controls) return;

	// Default position in case we can't find home zone
	let targetPosition = { x: 5, y: 15, z: 25 };
	let lookAt = { x: 5, y: 0, z: 12 };

	// Try to find the player's home zone
	if (gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
		// Get player ID if possible
		const playerId = NetworkManager.getPlayerId ? NetworkManager.getPlayerId() : null;
		let homeZone = null;

		if (playerId) {
			// Look for player's home zone
			for (const [id, zone] of Object.entries(gameState.homeZones)) {
				if (id === playerId || id.includes(playerId)) {
					homeZone = zone;
					break;
				}
			}
		}

		// If no matching zone found, use first one
		if (!homeZone) {
			homeZone = Object.values(gameState.homeZones)[0];
		}

		if (homeZone) {
			// Position camera at angle to home zone
			targetPosition = {
				x: homeZone.x - 5,
				y: 15,
				z: homeZone.z + 10
			};

			lookAt = {
				x: homeZone.x + (homeZone.width ? homeZone.width / 2 : 2),
				y: 0,
				z: homeZone.z + (homeZone.height ? homeZone.height / 2 : 2)
			};

			console.log('Positioning camera based on home zone:', homeZone);
		}
	}

	// Animate camera movement
	animateCamera(camera, controls, targetPosition, lookAt);
}

/**
 * Position camera at default position
 */
export function positionCameraDefault() {
	if (!camera || !controls) return;

	const targetPosition = { x: 8, y: 20, z: 25 };
	const lookAt = { x: 0, y: 0, z: 0 };

	// Animate camera movement
	animateCamera(camera, controls, targetPosition, lookAt);
}

/**
 * Animate camera to target position
 * @param {Object} targetPosition - Target camera position
 * @param {Object} lookAt - Target look-at point
 */
export function animateCamera(camera, controls, targetPosition, lookAt) {
	// Get current position
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};

	// Get current look-at
	const startLookAt = controls.target.clone();

	// Animation duration
	const duration = 2000; // 2 seconds
	const startTime = Date.now();

	// Animate camera movement
	function animate() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);

		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;

		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;

		// Update controls
		controls.update();

		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}

		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animate);
		}
	}

	// Start animation
	animate();
}

/**
 * Move the camera to view a player's home zone
 */
export function moveToPlayerZone(camera, controls, gameState, renderer, scene) {
	// If no local player ID, do nothing
	if (!gameState.localPlayerId) return;

	// Find the player's king
	const playerPieces = gameState.chessPieces.filter(
		piece => String(piece.player) === String(gameState.localPlayerId)
	);

	// If no pieces, use center of board
	if (!playerPieces.length) {
		resetCameraForGameplay(renderer, camera, controls, gameState, scene);
		return;
	}

	// Find the king, or any piece if king not found
	const kingPiece = playerPieces.find(piece => piece.type === 'KING' || piece.type === 'king'
	) || playerPieces[0];

	// Get the position
	const position = kingPiece.position;

	// Move camera to focus on that position
	if (camera && controls && position) {
		// Calculate target position
		const targetX = position.x - gameState.board.centreMarker.x;
		const targetZ = position.z - gameState.board.centreMarker.z;

		// Set camera position
		controls.target.set(targetX, 0, targetZ);
		camera.position.set(targetX, 15, targetZ + 15);

		// Update controls
		controls.update();
	}
}

