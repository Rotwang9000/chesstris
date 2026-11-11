/**
 * A cube with softly rounded edges and corners, for board cells.
 *
 * Hard-edged boxes look like untextured placeholders; a small bevel
 * catches the light along every edge, which is most of what makes a
 * block read as a finished game piece. Built from a subdivided
 * `BoxGeometry` whose vertices are pulled onto an inner box inflated
 * by `radius` — core THREE only, no addons. Normals point along the
 * rounding direction, so the bevels shade smoothly.
 *
 * @param {object} THREE
 * @param {number} size    edge length
 * @param {number} radius  corner radius (less than size / 2)
 * @param {number} [bevelSteps=2] grid rows per side spent on the bevel
 */
export function createRoundedCellGeometry(THREE, size, radius, bevelSteps = 2) {
	// One flat middle row plus `bevelSteps` rows on each side.
	const segments = bevelSteps * 2 + 1;
	const geometry = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
	const half = size / 2;
	const inner = half - radius;
	const band = (size / segments) * bevelSteps;
	const position = geometry.attributes.position;
	const normal = geometry.attributes.normal;
	const v = new THREE.Vector3();
	const core = new THREE.Vector3();
	const n = new THREE.Vector3();

	for (let i = 0; i < position.count; i++) {
		v.fromBufferAttribute(position, i);
		// Remap each coordinate so the middle row spans the flat face
		// [-inner, inner] and the outer rows spread across the bevel.
		for (const axis of ['x', 'y', 'z']) {
			const a = Math.abs(v[axis]);
			const mapped = a >= half - band - 1e-9
				? inner + ((a - (half - band)) / band) * radius
				: (a / (half - band)) * inner;
			v[axis] = Math.sign(v[axis]) * mapped;
		}
		core.set(
			Math.max(-inner, Math.min(inner, v.x)),
			Math.max(-inner, Math.min(inner, v.y)),
			Math.max(-inner, Math.min(inner, v.z)),
		);
		n.subVectors(v, core);
		if (n.lengthSq() < 1e-12) continue;
		n.normalize();
		position.setXYZ(i, core.x + n.x * radius, core.y + n.y * radius, core.z + n.z * radius);
		normal.setXYZ(i, n.x, n.y, n.z);
	}
	position.needsUpdate = true;
	normal.needsUpdate = true;
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return geometry;
}
