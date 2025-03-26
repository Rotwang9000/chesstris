import { THREE } from './enhanced-gameCore';
import * as NetworkManager from './utils/networkManager';

/**
 * Set up the camera position and controls
 */
export function setupCamera(camera, controls, renderer) {
	// Position camera at an isometric view
	camera.position.set(15, 20, 15);
	camera.lookAt(0, 0, 0);

	// Initialize orbit controls for camera manipulation
	if (typeof THREE.OrbitControls !== 'undefined') {
		// Use THREE's built-in OrbitControls if available
		controls = new THREE.OrbitControls(camera, renderer.domElement);
	} else if (window.OrbitControls) {
		// Or use globally available OrbitControls
		controls = new window.OrbitControls(camera, renderer.domElement);
	} else {
		console.warn("OrbitControls not available, camera controls will be limited");
		// Create minimal controls to avoid errors
		controls = {
			update: function () { },
			enabled: false,
			enableDamping: false,
			dampingFactor: 0.05,
			minDistance: 5,
			maxDistance: 100,
			maxPolarAngle: Math.PI / 2
		};
	}

	// Configure controls if they exist
	if (controls.enableDamping !== undefined) {
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.rotateSpeed = 0.7;
		controls.minDistance = 5;
		controls.maxDistance = 50;
		controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent camera from going below the ground
	}
}/**
 * Reset camera with specific gameplay settings
 * @param {boolean} animate - Whether to animate the camera movement
 * @param {boolean} forceImmediate - Whether to position immediately without waiting for home zone
 */
export function resetCameraForGameplay(renderer, camera, controls, gameState, scene, animate = true, forceImmediate = false) {
	console.log('Resetting camera for gameplay view');

	if (!camera || !controls) {
		console.warn('Camera or controls not initialized');
		return;
	}

	// If we want to wait for game data but don't have it yet, defer the repositioning
	if (!forceImmediate && (!gameState.board || !gameState.board.length || !gameState.homeZones)) {
		console.log('Waiting for game data before repositioning camera...');

		// Store the request for later execution
		gameState.pendingCameraReset = {
			animate: animate,
			requestTime: Date.now()
		};

		// Set a default position for now
		camera.position.set(20, 25, 20);
		controls.target.set(8, 0, 8);
		controls.update();

		return;
	}

	// Default camera position - looking at the center of the board
	let targetPosition = {
		x: 8, // Default x
		y: 20, // Default height 
		z: 25 // Default z
	};

	let lookAt = {
		x: 8, // Default focus x - center of the board
		y: 0, // Default focus y
		z: 8 // Default focus z - center of the board
	};

	// Get player ID
	const playerId = NetworkManager.getPlayerId ? NetworkManager.getPlayerId() : null;

	// If we have home zones data and playerId, position based on player's home zone
	if (playerId && gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
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

			// Calculate position behind the home zone
			// Use cell coordinates directly as they match the board grid
			const homeX = homeZone.x;
			const homeZ = homeZone.z;
			const homeWidth = homeZone.width || 2;
			const homeHeight = homeZone.height || 2;

			// Position camera behind and slightly to the side of home zone
			targetPosition = {
				x: homeX - 5, // Position to left of home zone
				y: 15, // Height
				z: homeZ + homeHeight + 10 // Position behind home zone
			};

			// Look at center of home zone
			lookAt = {
				x: homeX + homeWidth / 2, // Center X of home zone
				y: 0, // Board level
				z: homeZ + homeHeight / 2 // Center Z of home zone
			};

			console.log('Camera will move to:', targetPosition, 'looking at:', lookAt);
		}
	}

	// Set camera position immediately or animate
	if (!animate) {
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);

		// Force a render
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		return;
	}

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
		}
	}

	// Start animation
	animateCamera();
}
/**
 * Position camera based on home zone data
 */
function resetCameraBasedOnHomeZone() {
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
	animateCamera(targetPosition, lookAt);
}
/**
 * Position camera at default position
 */
function positionCameraDefault() {
	if (!camera || !controls) return;

	const targetPosition = { x: 8, y: 20, z: 25 };
	const lookAt = { x: 0, y: 0, z: 0 };

	// Animate camera movement
	animateCamera(targetPosition, lookAt);
}
/**
 * Animate camera to target position
 * @param {Object} targetPosition - Target camera position
 * @param {Object} lookAt - Target look-at point
 */
function animateCamera(targetPosition, lookAt) {
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

