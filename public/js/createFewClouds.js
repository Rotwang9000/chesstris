/**
 * Foam patches scattered across the sea surface.
 *
 * Originally this file rendered fluffy white "cloud" puffs beneath
 * the board — but the user feedback was that they read as low clouds
 * and ruined the "floating islands in the sea" aesthetic. The puffs
 * now sit right at the water surface and are styled as wave foam:
 * flat, slightly translucent ovals with a faint pulse.
 *
 * The group is still named `cloudBed` so the existing scene cleanup
 * code in {@link ./scene.js} `setupLights` continues to dispose of
 * it when the render profile changes. The exported helper name is
 * kept as `createFewClouds` for backwards compatibility with the
 * existing import in `scene.js`.
 */

import { getTHREE } from './gameContext.js';

// Sit just above the water plane so the foam doesn't z-fight with
// it but still reads as sitting on the surface.
const FOAM_Y = -2.05;
const FOAM_SPREAD = 80;
const FOAM_PATCH_COUNT = 38;

/**
 * Create a sparse field of wave-foam patches floating on the sea.
 *
 * @param {THREE.Scene} scene
 * @returns {THREE.Group|null} The foam group, or null if no scene.
 */
export function createFewClouds(scene) {
	if (!scene) return null;

	const THREE = getTHREE();
	if (!THREE || typeof THREE.Group !== 'function') return null;

	// Remove any previous foam bed so a render-profile switch doesn't
	// pile up duplicate groups.
	const existing = scene.getObjectByName('cloudBed');
	if (existing) scene.remove(existing);

	const group = new THREE.Group();
	group.name = 'cloudBed';

	const sharedMaterial = new THREE.MeshBasicMaterial({
		color: 0xF6FBFF,
		transparent: true,
		opacity: 0.42,
		depthWrite: false,
		side: THREE.DoubleSide,
	});

	for (let i = 0; i < FOAM_PATCH_COUNT; i++) {
		const radius = 1.2 + Math.random() * 2.4;
		// Use a circle geometry so the foam reads as a flat splash
		// of foam on the water rather than a puffy 3D ball.
		const geometry = new THREE.CircleGeometry(radius, 14);
		geometry.rotateX(-Math.PI / 2);
		const patch = new THREE.Mesh(geometry, sharedMaterial);
		patch.position.set(
			(Math.random() - 0.5) * FOAM_SPREAD,
			FOAM_Y + (Math.random() - 0.5) * 0.05,
			(Math.random() - 0.5) * FOAM_SPREAD
		);
		// Slight squash + rotation so the patches don't look like
		// perfect circles.
		patch.scale.set(
			0.8 + Math.random() * 0.6,
			1,
			0.5 + Math.random() * 0.5
		);
		patch.rotation.y = Math.random() * Math.PI * 2;
		patch.userData = {
			basePulse: 0.85 + Math.random() * 0.3,
			pulseSpeed: 0.15 + Math.random() * 0.2,
			pulsePhase: Math.random() * Math.PI * 2,
		};
		group.add(patch);
	}

	scene.add(group);
	return group;
}

/**
 * Animate the foam patches: gentle pulse + slow drift so the sea
 * surface doesn't look completely static. Also pulses the per-cell
 * foam splashes attached to the boardGroup (see
 * `attachCellFoam` in scene.js) so the islands look like waves are
 * washing around their base.
 *
 * Safe to call from the main game loop on every frame.
 *
 * @param {THREE.Scene} scene
 */
export function animateFoamPatches(scene) {
	if (!scene) return;
	const t = performance.now() * 0.001;

	const sea = scene.getObjectByName('cloudBed');
	if (sea && sea.children) {
		for (const patch of sea.children) {
			const ud = patch.userData;
			if (!ud) continue;
			const pulse = ud.basePulse + Math.sin(t * ud.pulseSpeed + ud.pulsePhase) * 0.12;
			// Pulse on the horizontal plane only; never touch Y so we
			// don't pop above/below the water plane.
			patch.scale.x = pulse * 1.0;
			patch.scale.z = pulse * 0.7;
		}
	}

	const board = scene.getObjectByName('boardGroup');
	if (board && Array.isArray(board.children)) {
		for (const child of board.children) {
			const ud = child && child.userData;
			if (!ud || !ud.isCellFoam) continue;
			const pulse = ud.basePulse + Math.sin(t * ud.pulseSpeed + ud.pulsePhase) * 0.18;
			// The cloudPuff group now also contains a static island
			// base that should NOT pulse. Scale the foam meshes
			// individually so the rock pillar stays put.
			const meshes = child.children;
			if (!meshes) continue;
			for (const mesh of meshes) {
				if (mesh && mesh.userData && mesh.userData.isIslandBase) continue;
				mesh.scale.x = pulse;
				mesh.scale.z = pulse * 0.85;
			}
		}
	}
}
