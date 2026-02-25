/**
 * Sparse cloud bed beneath the game board.
 * Creates soft, low-profile cloud puffs for a floating-island aesthetic.
 */

import * as THREE from './utils/three.module.js';

const CLOUD_Y = -4.5;
const CLOUD_SPREAD = 42;
const CLOUD_COUNT = 28;

/**
 * Create a sparse cloud layer beneath the board
 * @param {THREE.Scene} scene
 * @returns {THREE.Group}
 */
export function createFewClouds(scene) {
	if (!scene) return null;

	const group = new THREE.Group();
	group.name = 'cloudBed';

	const material = new THREE.MeshStandardMaterial({
		color: 0xFFFFFF,
		transparent: true,
		opacity: 0.28,
		roughness: 1.0,
		metalness: 0.0,
		depthWrite: false
	});

	for (let i = 0; i < CLOUD_COUNT; i++) {
		const puffCount = 2 + Math.floor(Math.random() * 3);
		const cx = (Math.random() - 0.5) * CLOUD_SPREAD;
		const cz = (Math.random() - 0.5) * CLOUD_SPREAD;

		for (let j = 0; j < puffCount; j++) {
			const radius = 0.45 + Math.random() * 0.9;
			const geom = new THREE.SphereGeometry(radius, 6, 4);
			const puff = new THREE.Mesh(geom, material);
			puff.position.set(
				cx + (Math.random() - 0.5) * 2,
				CLOUD_Y - Math.random() * 1.2,
				cz + (Math.random() - 0.5) * 2
			);
			puff.scale.set(1, 0.2, 1);
			group.add(puff);
		}
	}

	scene.add(group);
	return group;
}
