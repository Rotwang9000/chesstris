/**
 * Sub-mesh merge helper for chess pieces.
 *
 * The cute Russian pieces were each a `THREE.Group` of ~12 sub-meshes.
 * A graphics stress test showed scene-graph NODE COUNT (the per-frame
 * `updateMatrixWorld` walk), not draw calls, was the dominant CPU cost.
 * This module bakes a piece's sub-meshes down into a SINGLE `THREE.Mesh`
 * whose geometry carries material groups, so the renderer walks one node
 * per piece while colours/shadows render exactly as before.
 *
 * Design notes:
 *   - The render-time work takes `THREE` as a parameter (no import-time
 *     coupling), mirroring `boardFunctions/cellInstancer.js`. THREE is a
 *     CDN global in the browser, so this keeps the module testable.
 *   - The PURE grouping maths lives in `planMergeGroups`, which needs no
 *     THREE at all and is unit-tested directly.
 */

/**
 * Tiny assertion helper — validates internal invariants so a malformed
 * merge fails loudly at build time rather than rendering garbage.
 *
 * @param {boolean} condition
 * @param {string} message
 */
function assert(condition, message) {
	if (!condition) {
		throw new Error('mergePiece: ' + (message || 'assertion failed'));
	}
}

/**
 * PURE grouping logic — no THREE dependency.
 *
 * Given the per-source-geometry material index and vertex count (in the
 * caller's input order), work out:
 *   - `order`: the order in which to concatenate the source geometries so
 *     that all geometries sharing a material end up contiguous (bucketed
 *     by ascending original material index);
 *   - `groups`: one `{ start, count, materialIndex }` per used material,
 *     where `start`/`count` are in VERTICES and `materialIndex` is the
 *     COMPACTED index into the returned material array;
 *   - `usedMaterialIndices`: the original material indices actually used,
 *     in ascending order (so the caller can build the compacted material
 *     array and skip empties).
 *
 * Bucketing by material means each material yields exactly one contiguous
 * run, i.e. one geometry group — the minimum the renderer needs.
 *
 * @param {Array<{materialIndex:number, vertexCount:number}>} sources
 * @returns {{order:number[], groups:Array<{start:number,count:number,materialIndex:number}>, usedMaterialIndices:number[]}}
 */
export function planMergeGroups(sources) {
	assert(Array.isArray(sources) && sources.length > 0, 'planMergeGroups needs at least one source');

	const usedSet = new Set();
	for (const source of sources) {
		assert(Number.isInteger(source.materialIndex) && source.materialIndex >= 0,
			'source.materialIndex must be a non-negative integer');
		assert(Number.isInteger(source.vertexCount) && source.vertexCount > 0,
			'source.vertexCount must be a positive integer');
		usedSet.add(source.materialIndex);
	}

	const usedMaterialIndices = Array.from(usedSet).sort((a, b) => a - b);
	const compactedByOriginal = new Map();
	usedMaterialIndices.forEach((original, compacted) => compactedByOriginal.set(original, compacted));

	const order = [];
	const groups = [];
	let cursor = 0; // running vertex offset

	for (const original of usedMaterialIndices) {
		const start = cursor;
		let count = 0;
		for (let i = 0; i < sources.length; i++) {
			if (sources[i].materialIndex !== original) continue;
			order.push(i);
			count += sources[i].vertexCount;
			cursor += sources[i].vertexCount;
		}
		groups.push({ start, count, materialIndex: compactedByOriginal.get(original) });
	}

	// ── Invariants the merged geometry relies on ──
	const totalVertices = sources.reduce((sum, s) => sum + s.vertexCount, 0);
	assert(order.length === sources.length, 'every source must be placed exactly once');
	assert(cursor === totalVertices, 'placed vertex count must equal the total');
	let expectedStart = 0;
	for (const group of groups) {
		assert(group.start === expectedStart, 'groups must be contiguous');
		expectedStart += group.count;
	}
	assert(expectedStart === totalVertices, 'groups must cover the whole draw range');

	return { order, groups, usedMaterialIndices };
}

/**
 * Merge an array of single-material `THREE.Mesh`es into ONE merged mesh.
 *
 * Each source mesh's geometry is baked into world space (relative to the
 * transient builder group), stripped down to `position` + `normal`, and
 * concatenated into a single non-indexed `BufferGeometry` with one
 * material group per distinct material. Colours/shadows are preserved
 * because the merged mesh carries a material array in the SAME order the
 * caller supplied (minus any unused entries).
 *
 * Only CORE THREE classes are used (BufferGeometry, Float32BufferAttribute,
 * Mesh) — no addons such as BufferGeometryUtils.
 *
 * @param {object} THREE live THREE namespace
 * @param {THREE.Mesh[]} meshes source meshes (each with a single material)
 * @param {THREE.Material[]} materialsInOrder canonical material order, e.g. [primary, secondary, accent]
 * @returns {THREE.Mesh} a single merged mesh (castShadow/receiveShadow set)
 */
export function mergeMeshesByMaterial(THREE, meshes, materialsInOrder) {
	assert(THREE && typeof THREE.BufferGeometry === 'function', 'a THREE namespace is required');
	assert(Array.isArray(meshes) && meshes.length > 0, 'at least one mesh is required');
	assert(Array.isArray(materialsInOrder) && materialsInOrder.length > 0, 'materialsInOrder is required');

	const baked = [];        // { position, normal, vertexCount, materialIndex }
	const temporaries = [];  // cloned geometries to dispose once concatenated

	for (const mesh of meshes) {
		if (!mesh || !mesh.isMesh || !mesh.geometry) continue;

		const materialIndex = materialsInOrder.indexOf(mesh.material);
		assert(materialIndex >= 0, 'every source mesh material must appear in materialsInOrder');

		// Bake the mesh's local transform into a throwaway geometry clone.
		// applyMatrix4 transforms BOTH position and normal correctly.
		mesh.updateMatrix();
		let geometry = mesh.geometry.clone();
		geometry.applyMatrix4(mesh.matrix);

		// Concatenation requires matching attribute sets, so de-index and
		// keep only position + normal (drop uv/uv2/colour/etc.).
		if (geometry.index) {
			const nonIndexed = geometry.toNonIndexed();
			geometry.dispose();
			geometry = nonIndexed;
		}
		for (const name of Object.keys(geometry.attributes)) {
			if (name !== 'position' && name !== 'normal') {
				geometry.deleteAttribute(name);
			}
		}
		if (!geometry.attributes.normal) {
			geometry.computeVertexNormals();
		}

		const positionAttr = geometry.attributes.position;
		const normalAttr = geometry.attributes.normal;
		assert(positionAttr && positionAttr.itemSize === 3, 'position attribute must be vec3');
		assert(normalAttr && normalAttr.itemSize === 3, 'normal attribute must be vec3');
		assert(positionAttr.count === normalAttr.count, 'position/normal vertex counts must match');

		baked.push({
			position: positionAttr.array,
			normal: normalAttr.array,
			vertexCount: positionAttr.count,
			materialIndex,
		});
		temporaries.push(geometry);
	}

	assert(baked.length > 0, 'no valid meshes to merge');

	const plan = planMergeGroups(
		baked.map(b => ({ materialIndex: b.materialIndex, vertexCount: b.vertexCount })),
	);

	const totalVertices = baked.reduce((sum, b) => sum + b.vertexCount, 0);
	const mergedPositions = new Float32Array(totalVertices * 3);
	const mergedNormals = new Float32Array(totalVertices * 3);

	let floatOffset = 0;
	for (const sourceIndex of plan.order) {
		const b = baked[sourceIndex];
		mergedPositions.set(b.position, floatOffset);
		mergedNormals.set(b.normal, floatOffset);
		floatOffset += b.vertexCount * 3;
	}

	// ── Final geometry invariants ──
	assert(mergedPositions.length > 0 && mergedPositions.length % 3 === 0,
		'merged position buffer must be non-empty and divisible by 3');
	assert(mergedNormals.length === mergedPositions.length,
		'merged normal buffer must match the position buffer length');
	assert(floatOffset === totalVertices * 3, 'every vertex must be copied exactly once');
	const coveredVertices = plan.groups.reduce((sum, g) => sum + g.count, 0);
	assert(coveredVertices === totalVertices, 'material groups must cover the whole draw range');

	const mergedGeometry = new THREE.BufferGeometry();
	mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
	mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(mergedNormals, 3));
	for (const group of plan.groups) {
		mergedGeometry.addGroup(group.start, group.count, group.materialIndex);
	}

	// Free the per-source clones; the originals belong to the transient
	// builder group the caller discards.
	for (const temporary of temporaries) {
		temporary.dispose();
	}

	// One material → single material; several → array indexed by the
	// compacted group materialIndex (ascending original order).
	const usedMaterials = plan.usedMaterialIndices.map(index => materialsInOrder[index]);
	const material = usedMaterials.length === 1 ? usedMaterials[0] : usedMaterials;

	const mergedMesh = new THREE.Mesh(mergedGeometry, material);
	mergedMesh.castShadow = true;
	mergedMesh.receiveShadow = true;
	return mergedMesh;
}
