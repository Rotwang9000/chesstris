import { getTHREE } from './gameContext.js';
import { findBoardCentreMarker, translatePosition } from './centreBoardMarker.js';
import { boardFunctions } from './boardFunctions.js';

/**
 * Pull the camera back to a high-level overview of the entire board.
 *
 * Computes the bounding box of all populated cells and frames it so
 * the whole island is visible. Falls back to a sensible default extent
 * when the board is empty.
 */
export function setCameraToOverview(camera, controls, gameState) {
	if (!camera || !controls) return;

	const board = gameState?.board;
	let centerX = 0, centerZ = 0, maxExtent = 50;

	if (board && board.cells) {
		const cellKeys = Object.keys(board.cells);
		if (cellKeys.length > 0) {
			let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
			for (const key of cellKeys) {
				const [x, z] = key.split(',').map(Number);
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (z < minZ) minZ = z;
				if (z > maxZ) maxZ = z;
			}
			centerX = (minX + maxX) / 2;
			centerZ = (minZ + maxZ) / 2;
			maxExtent = Math.max(maxX - minX, maxZ - minZ, 50);
		}
	}

	const viewDistance = Math.max(60, maxExtent * 0.8);
	camera.position.set(
		centerX + viewDistance * 0.5,
		viewDistance * 0.7,
		centerZ + viewDistance * 0.5,
	);
	if (controls.target) controls.target.set(centerX, 0, centerZ);
	camera.lookAt(centerX, 0, centerZ);
	if (controls.update) controls.update();
}

const CAMERA_DEFAULTS = {
	FOV: 50,
	NEAR: 0.1,
	FAR: 1000,
	MIN_DISTANCE: 8,
	MAX_DISTANCE: 80,
	DAMPING_FACTOR: 0.12,
	FLY_DURATION_MS: 1800,
	KING_VIEW_DISTANCE: 16,
	FALLBACK_POSITION: { x: 10, y: 25, z: 10 },
	FALLBACK_TARGET: { x: 0, y: 0, z: 0 }
};

let activeFlyAnimation = null;

/**
 * Set up camera with proper position and controls
 */
export function setupCamera(camera, controls, renderer) {
	const THREE = getTHREE();
	if (!camera) {
		console.error('Cannot setup camera: camera is undefined');
		return null;
	}

	camera.position.set(
		CAMERA_DEFAULTS.FALLBACK_POSITION.x,
		CAMERA_DEFAULTS.FALLBACK_POSITION.y,
		CAMERA_DEFAULTS.FALLBACK_POSITION.z
	);
	camera.lookAt(
		CAMERA_DEFAULTS.FALLBACK_TARGET.x,
		CAMERA_DEFAULTS.FALLBACK_TARGET.y,
		CAMERA_DEFAULTS.FALLBACK_TARGET.z
	);

	if (typeof THREE.OrbitControls !== 'undefined' && renderer) {
		if (!controls) {
			controls = new THREE.OrbitControls(camera, renderer.domElement);
		}

		controls.enableDamping = true;
		controls.dampingFactor = CAMERA_DEFAULTS.DAMPING_FACTOR;
		controls.screenSpacePanning = true;
		controls.minDistance = CAMERA_DEFAULTS.MIN_DISTANCE;
		controls.maxDistance = CAMERA_DEFAULTS.MAX_DISTANCE;
		controls.maxPolarAngle = Math.PI / 2 - 0.05;
		controls.target.set(
			CAMERA_DEFAULTS.FALLBACK_TARGET.x,
			CAMERA_DEFAULTS.FALLBACK_TARGET.y,
			CAMERA_DEFAULTS.FALLBACK_TARGET.z
		);

		controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN
		};

		controls.rotateSpeed = 0.7;
		controls.panSpeed = 0.8;
		controls.zoomSpeed = 1.0;
		controls.update();

		return controls;
	}

	console.warn('THREE.OrbitControls not available, camera will be static');
	return null;
}

/**
 * Reset camera for gameplay — finds the player's king and flies to it.
 * Retries automatically if chess pieces haven't loaded yet.
 */
export function resetCameraForGameplay(renderer, camera, controls, gameState, scene, animate = true, forceImmediate = false, onComplete) {
	const THREE = getTHREE();
	if (!camera) {
		console.error('Cannot reset camera: camera is undefined');
		return;
	}

	if (!controls && typeof THREE.OrbitControls !== 'undefined' && renderer) {
		controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = CAMERA_DEFAULTS.DAMPING_FACTOR;
		controls.minDistance = CAMERA_DEFAULTS.MIN_DISTANCE;
		controls.maxDistance = CAMERA_DEFAULTS.MAX_DISTANCE;
	}

	if (!controls) {
		camera.position.set(
			CAMERA_DEFAULTS.FALLBACK_POSITION.x,
			CAMERA_DEFAULTS.FALLBACK_POSITION.y,
			CAMERA_DEFAULTS.FALLBACK_POSITION.z
		);
		camera.lookAt(
			CAMERA_DEFAULTS.FALLBACK_TARGET.x,
			CAMERA_DEFAULTS.FALLBACK_TARGET.y,
			CAMERA_DEFAULTS.FALLBACK_TARGET.z
		);
		if (typeof onComplete === 'function') onComplete();
		return;
	}

	const attemptFly = (retriesLeft) => {
		const success = moveToPlayerZone(camera, controls, gameState, renderer, scene, animate, forceImmediate, onComplete);
		if (!success && retriesLeft > 0) {
			setTimeout(() => attemptFly(retriesLeft - 1), 500);
		} else if (!success && typeof onComplete === 'function') {
			onComplete();
		}
	};

	attemptFly(6);
}

/**
 * Move the camera to view a player's home zone.
 *
 * Falls back to the centre of the player's home zone if their king
 * is missing from `gameState.chessPieces` (e.g. just captured) so the
 * caller still gets a useful camera move instead of a silent no-op.
 *
 * @returns {boolean} True if a camera move was issued.
 */
export function moveToPlayerZone(camera, controls, gameState, renderer, scene, animate = true, forceImmediate = false, onComplete, targetPlayerId) {
	const playerId = targetPlayerId || gameState.localPlayerId;
	if (!playerId) return false;
	if (!camera || !controls) return false;

	let boardPosition = null;
	let orientation = 0;

	const kingPiece = boardFunctions.getPlayersKing(gameState, playerId, false);
	if (kingPiece) {
		boardPosition = kingPiece.position;
		orientation = Number.isFinite(kingPiece.orientation) ? kingPiece.orientation : 0;
	} else {
		const zone = gameState.homeZones && gameState.homeZones[playerId];
		if (zone && Number.isFinite(zone.x) && Number.isFinite(zone.z)) {
			boardPosition = {
				x: zone.x + (zone.width || 8) / 2,
				z: zone.z + (zone.height || 2) / 2,
			};
			orientation = Number.isFinite(zone.orientation) ? zone.orientation : 0;
		}
	}

	if (!boardPosition) {
		console.warn('moveToPlayerZone: no king or home zone for player', playerId);
		return false;
	}

	const position = translatePosition(boardPosition, gameState, true);
	if (!position) return false;

	const dist = CAMERA_DEFAULTS.KING_VIEW_DISTANCE;
	const height = dist * Math.sin(Math.PI / 4);

	let offsetX = 0;
	let offsetZ = 0;
	switch (orientation) {
		case 0: offsetZ = -dist; break;
		case 1: offsetX = -dist; break;
		case 2: offsetZ = dist; break;
		case 3: offsetX = dist; break;
		default: offsetZ = -dist;
	}

	const targetPosition = {
		x: position.x + offsetX,
		y: height,
		z: position.z + offsetZ
	};
	const targetLookAt = { x: position.x, y: 0, z: position.z };

	if (animate && !forceImmediate) {
		flyToPosition(camera, controls, targetPosition, targetLookAt, renderer, scene, onComplete);
	} else {
		cancelFlyAnimation();
		controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
		controls.update();
		if (renderer && scene) renderer.render(scene, camera);
		if (typeof onComplete === 'function') onComplete();
	}
	return true;
}

/**
 * Cancel any running fly animation
 */
let activeFlyControlsRestore = null;
function cancelFlyAnimation() {
	if (activeFlyAnimation !== null) {
		cancelAnimationFrame(activeFlyAnimation);
		activeFlyAnimation = null;
	}
	if (typeof activeFlyControlsRestore === 'function') {
		activeFlyControlsRestore();
		activeFlyControlsRestore = null;
	}
}

/**
 * Smooth cubic ease-out
 */
function easeOutCubic(t) {
	return 1 - Math.pow(1 - t, 3);
}

/**
 * Animate camera with a smooth flying arc to target position.
 *
 * OrbitControls damping is disabled for the duration of the fly so the
 * controls don't fight our per-frame position writes. The previous
 * damping state is restored when the fly finishes (or is cancelled).
 */
export function flyToPosition(camera, controls, targetPosition, targetLookAt, renderer, scene, onComplete) {
	cancelFlyAnimation();

	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};
	const startLookAt = controls.target.clone();

	// Snapshot and disable damping/auto-rotate while we drive the camera
	// directly; otherwise OrbitControls smooths our writes a second time
	// and the camera "stutters" or drifts past the target.
	const dampingWas = controls.enableDamping === true;
	const autoRotateWas = controls.autoRotate === true;
	controls.enableDamping = false;
	controls.autoRotate = false;

	const restoreControls = () => {
		controls.enableDamping = dampingWas;
		controls.autoRotate = autoRotateWas;
	};
	activeFlyControlsRestore = restoreControls;

	const duration = CAMERA_DEFAULTS.FLY_DURATION_MS;
	const startTime = performance.now();

	// Arc height based on distance
	const dx = targetPosition.x - startPosition.x;
	const dz = targetPosition.z - startPosition.z;
	const horizontalDist = Math.sqrt(dx * dx + dz * dz);
	const arcHeight = Math.min(horizontalDist * 0.4, 20);

	const midY = Math.max(startPosition.y, targetPosition.y) + arcHeight;

	function tick(now) {
		const elapsed = now - startTime;
		const rawProgress = Math.min(elapsed / duration, 1);
		const t = easeOutCubic(rawProgress);

		// Quadratic Bezier for Y (creates smooth arc), linear lerp for X/Z
		const oneMinusT = 1 - t;
		const arcY = oneMinusT * oneMinusT * startPosition.y +
			2 * oneMinusT * t * midY +
			t * t * targetPosition.y;

		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * t;
		camera.position.y = arcY;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * t;

		controls.target.x = startLookAt.x + (targetLookAt.x - startLookAt.x) * t;
		controls.target.y = startLookAt.y + (targetLookAt.y - startLookAt.y) * t;
		controls.target.z = startLookAt.z + (targetLookAt.z - startLookAt.z) * t;

		controls.update();

		if (renderer && scene) {
			try { renderer.render(scene, camera); } catch (_) { /* main loop will pick it up */ }
		}

		if (rawProgress < 1) {
			activeFlyAnimation = requestAnimationFrame(tick);
		} else {
			activeFlyAnimation = null;
			activeFlyControlsRestore = null;
			camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
			controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
			restoreControls();
			controls.update();
			if (typeof onComplete === 'function') onComplete();
		}
	}

	activeFlyAnimation = requestAnimationFrame(tick);
}

/**
 * Generic camera animation (linear lerp with ease-out)
 */
export function animateCamera(camera, controls, targetPosition, lookAt, renderer, scene) {
	flyToPosition(camera, controls, targetPosition, lookAt, renderer, scene);
}
