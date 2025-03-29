import { getTHREE } from './enhanced-gameCore.js';
import NetworkManager from './utils/networkManager.js';
import { findBoardCentreMarker } from './centreBoardMarker.js';
import { boardFunctions } from './boardFunctions.js';

/**
 * Set up camera with proper position and controls
 * @param {THREE.Camera} camera - The camera to set up
 * @param {THREE.OrbitControls} controls - The orbit controls to set up
 * @param {THREE.WebGLRenderer} renderer - The renderer being used
 */
export function setupCamera(camera, controls, renderer) {
	const THREE = getTHREE();
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
	const THREE = getTHREE();
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

	moveToPlayerZone(camera, controls, gameState, renderer, scene, animate, forceImmediate);
}

/**
 * Position camera at default position
 */
export function positionCameraDefault() {
	if (!camera || !controls) return;

	const targetPosition = { x: 8, y: 40, z: 25 };
	const lookAt = { x: 0, y: 0, z: 0 };

	// Animate camera movement
	animateCamera(camera, controls, targetPosition, lookAt, renderer, scene);
}

/**
 * Animate camera to target position
 * @param {Object} targetPosition - Target camera position
 * @param {Object} lookAt - Target look-at point
 */
export function animateCamera(camera, controls, targetPosition, lookAt, renderer, scene) {
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
export function moveToPlayerZone(camera, controls, gameState, renderer, scene, animate = true, forceImmediate = false) {
	// If no local player ID, do nothing
	if (!gameState.localPlayerId) return;

	// Find the player's king
	const playerPieces = gameState.chessPieces.filter(
		piece => String(piece.player) === String(gameState.localPlayerId)
	);

	// // If no pieces, use center of board
	// if (!playerPieces.length) {
	// 	resetCameraForGameplay(renderer, camera, controls, gameState, scene);
	// 	return;
	// }

	// Find the king, or any piece if king not found
	const kingPiece = boardFunctions.getPlayersKing(gameState, gameState.localPlayerId, true);
	if(!kingPiece){
		console.warn('No king found for player ' + gameState.localPlayerId);
		return;
	}
	// Get the position
	const position = kingPiece.position;

	// Move camera to focus on that position
	if (camera && controls && position) {
		// Get king orientation to determine camera offset direction
		const orientation = kingPiece.orientation || 0;
		
		// Calculate proper 45-degree angle offsets
		const distance = 16; // Distance from king
		const horizontalOffset = distance; // 45-degree angle
		const verticalOffset = distance * Math.sin(Math.PI/4); // 45-degree angle
		
		// Position camera behind the king based on orientation
		let offsetX = 0;
		let offsetZ = 0;
		
		// This creates a desk-view angle looking at a chessboard
		switch(orientation) {
			case 0: // Facing positive Z (up) - camera should be below looking up
				offsetX = 0;
				offsetZ = -horizontalOffset;
				break;
			case 1: // Facing negative X (right) - camera should be to left looking right
				offsetX = -horizontalOffset;
				offsetZ = 0;
				break;
			case 2: // Facing negative Z (down) - camera should be above looking down
				offsetX = 0;
				offsetZ = horizontalOffset;
				break;
			case 3: // Facing positive X (left) - camera should be to right looking left
				offsetX = horizontalOffset;
				offsetZ = 0;
				break;
			default:
				offsetX = 0;
				offsetZ = -horizontalOffset;
		}
		
		console.log('Moving camera to view king at position:', position, 
			'orientation:', orientation, 
			'with offsets:', { x: offsetX, z: offsetZ, y: verticalOffset });
		
		// Target position for the camera
		const targetPosition = {
			x: position.x + offsetX,
			y: verticalOffset,
			z: position.z + offsetZ
		};
		
		// Target look position (king's position)
		const targetLookAt = {
			x: position.x,
			y: 0,
			z: position.z
		};
		
		if (animate && !forceImmediate) {
			// Perform flying animation to target position
			flyToPosition(camera, controls, targetPosition, targetLookAt, renderer, scene);
		} else {
			// Set look target to the king's position
			controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
			
			// Position camera directly
			camera.position.set(
				targetPosition.x,
				targetPosition.y,
				targetPosition.z
			);

			// Update controls
			controls.update();
			
			// Force a render
			if (renderer && scene) {
				renderer.render(scene, camera);
			}
		}
	}
}

/**
 * Animate camera with a flying effect to target position
 * @param {THREE.Camera} camera - The camera to animate
 * @param {THREE.OrbitControls} controls - The orbit controls
 * @param {Object} targetPosition - Target camera position {x, y, z}
 * @param {Object} targetLookAt - Target look-at position {x, y, z}
 * @param {THREE.WebGLRenderer} renderer - The renderer
 * @param {THREE.Scene} scene - The scene
 */
export function flyToPosition(camera, controls, targetPosition, targetLookAt, renderer, scene) {
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
	
	// Calculate midpoint for arc (higher altitude for flying effect)
	const midPosition = {
		x: (startPosition.x + targetPosition.x) / 2,
		y: Math.max(startPosition.y, targetPosition.y) + 15, // Extra height for arc
		z: (startPosition.z + targetPosition.z) / 2
	};

	// Animate camera movement
	function animate() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);
		
		// For smooth arc movement, we'll use quadratic Bezier curve
		// First half of animation - go up and towards target
		if (progress < 0.5) {
			const subProgress = progress * 2; // Scale to 0-1 for first half
			const subEase = 1 - Math.pow(1 - subProgress, 3);
			
			// Move from start towards midpoint (going up)
			camera.position.x = startPosition.x + (midPosition.x - startPosition.x) * subEase;
			camera.position.y = startPosition.y + (midPosition.y - startPosition.y) * subEase;
			camera.position.z = startPosition.z + (midPosition.z - startPosition.z) * subEase;
		} 
		// Second half - come down to target
		else {
			const subProgress = (progress - 0.5) * 2; // Scale to 0-1 for second half
			const subEase = 1 - Math.pow(1 - subProgress, 3);
			
			// Move from midpoint to target (coming down)
			camera.position.x = midPosition.x + (targetPosition.x - midPosition.x) * subEase;
			camera.position.y = midPosition.y + (targetPosition.y - midPosition.y) * subEase;
			camera.position.z = midPosition.z + (targetPosition.z - midPosition.z) * subEase;
		}

		// Update controls target (smoother transition for look-at point)
		controls.target.x = startLookAt.x + (targetLookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (targetLookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (targetLookAt.z - startLookAt.z) * ease;

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
 * Calculate camera position adjusted for board center
 * @param {Object} gameState - The current game state
 * @param {Object} position - The raw position object (usually king position)
 * @param {Object} offset - The offset to apply {x, z}
 * @returns {Object} The adjusted position
 */
export function calculateCameraPositionWithBoardCenter(gameState, position, offset) {
	// Get board center
	let boardCenter = findBoardCentreMarker(gameState);
	
	// Calculate the position's offset from board center
	const relativePosition = {
		x: position.x - boardCenter.x,
		z: position.z - boardCenter.z
	};
	
	// Apply camera offset in the local coordinate system
	const result = {
		x: position.x + offset.x,
		y: position.y || 0,
		z: position.z + offset.z
	};
	
	console.log('Camera position calculation:', {
		originalPosition: position,
		boardCenter: boardCenter,
		relativePosition: relativePosition,
		offset: offset,
		result: result
	});
	
	return result;
}

/**
 * Calculate adjusted camera position without centering issues
 * @param {Object} gameState - The current game state
 * @param {Object} position - The raw position object (usually king position)
 * @param {Object} offset - The offset to apply {x, z}
 * @returns {Object} The adjusted position
 */
export function calculateCameraPositionNoCenter(gameState, position, offset) {
	if (!position) return { x: 0, y: 0, z: 0 };
	
	// Just apply the offset directly - simplest approach
	const result = {
		x: position.x + offset.x,
		y: position.y || 0,
		z: position.z + offset.z
	};
	
	console.log('Simple camera position calculation:', {
		originalPosition: position,
		offset: offset,
		result: result
	});
	
	return result;
}
