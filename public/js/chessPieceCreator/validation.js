/**
 * Material validation and fallback piece helpers.
 *
 * Walks a freshly-built piece group and makes sure every mesh has a real
 * material instance attached, and synthesises a simple coloured cube
 * when a builder fails outright.
 */

import { getTHREE } from '../gameContext.js';

/**
 * Ensure every mesh in a piece tree has a valid material. Strips any
 * material accidentally attached to Group nodes (which Three.js does not
 * accept), and synthesises a default material when one is missing.
 */
export function ensureValidMaterials(model) {
	if (!model) return;
	const THREE = getTHREE();
	if (!THREE) return;

	try {
		model.visible = true;
		if (model.type === 'Group' && model.material) {
			console.warn('Removing invalid material from Group object');
			delete model.material;
		}

		model.traverse(child => {
			if (!child) return;
			child.visible = true;

			if (child.type === 'Group' && child.material) {
				console.warn('Removing invalid material from Group child');
				delete child.material;
			}

			if (child.isMesh) {
				if (!child.material) {
					const color = child.userData?.player === 'self' ? 0xDD0000 : 0x0088AA;
					child.material = new THREE.MeshStandardMaterial({
						color, roughness: 0.7, metalness: 0.3,
					});
				}

				if (Array.isArray(child.material)) {
					for (let i = 0; i < child.material.length; i++) {
						if (!child.material[i]) {
							const color = child.userData?.player === 'self' ? 0xDD0000 : 0x0088AA;
							child.material[i] = new THREE.MeshStandardMaterial({
								color, roughness: 0.7, metalness: 0.3,
							});
						}
					}
				}

				if (child.material) child.material.needsUpdate = true;
			}
		});
	} catch (error) {
		console.error('Error ensuring valid materials:', error);
	}
}

/**
 * Build a generic coloured cube to stand in when the normal builder
 * pipeline fails. Always returns a valid Group or `null` if `THREE`
 * itself is unavailable.
 */
export function createFallbackPiece(materialKey) {
	const THREE = getTHREE();
	if (!THREE) return null;

	try {
		const group = new THREE.Group();
		group.visible = true;

		const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
		const color = materialKey === 'self' ? 0xDD0000 : 0x0088AA;
		const material = new THREE.MeshStandardMaterial({
			color, roughness: 0.7, metalness: 0.3,
		});

		const mesh = new THREE.Mesh(geometry, material);
		mesh.visible = true;
		mesh.position.y = 0.6;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add(mesh);

		if (group.material) delete group.material;
		return group;
	} catch (error) {
		console.error('Error creating fallback piece:', error);
		return null;
	}
}
