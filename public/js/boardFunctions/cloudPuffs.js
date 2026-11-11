/**
 * Cloud puffs under the board (normal render profile).
 *
 * Every cell rides on three soft, squashed puffs that bulge out below and
 * around it, so neighbouring cells' puffs run together into a cloud bank
 * under each island, with the sea far below (see `seaLevel.js`).
 *
 * All puffs for the whole board live in ONE `InstancedMesh` (one draw
 * call, one scene node), rebuilt alongside the cell instancer whenever
 * the board changes. Offsets are seeded from the cell's board coordinate,
 * so a cell's puffs never jump about between rebuilds. The mesh bobs as a
 * whole (see `animateCloudPuffs`) — a per-frame cost of one matrix.
 */

const PUFF_NAME = 'cloudPuffs';
const PUFFS_PER_CELL = 3;
const DEFAULT_CAPACITY = 1024 * PUFFS_PER_CELL;

// Puff layout relative to the cell centre (the cell's bottom face is at
// y=-0.47): [x, y, z, horizontal scale, vertical scale]. The tops hide
// inside the cube; the rest spills past its sides and hangs below.
const LAYOUT = [
	[-0.3, -0.5, 0.08, 1.05, 0.6],
	[0.3, -0.46, -0.1, 1.1, 0.66],
	[0.02, -0.62, -0.04, 1.25, 0.55],
];

function seededJitter(x, z) {
	const seed = ((x * 73856093) ^ (z * 19349663)) >>> 0;
	return [
		((seed & 0xff) / 255 - 0.5) * 0.25,
		(((seed >> 8) & 0xff) / 255 - 0.5) * 0.25,
		(((seed >> 16) & 0xff) / 255 - 0.5) * 0.25,
	];
}

/**
 * @param {object} THREE      live THREE namespace
 * @param {object} boardGroup group the puffs are parented to
 */
export function createCloudPuffs(THREE, boardGroup) {
	const geometry = new THREE.SphereGeometry(0.5, 12, 8);
	// Bright white with a cool emissive lift, so the shaded undersides
	// read as soft cloud rather than grey rock.
	const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x6d7f99 });
	let capacity = 0;
	let mesh = null;
	const _matrix = new THREE.Matrix4();
	const _position = new THREE.Vector3();
	const _scale = new THREE.Vector3();
	const _rotation = new THREE.Quaternion();

	function ensureCapacity(n) {
		if (mesh && n <= capacity) return;
		const cap = Math.max(DEFAULT_CAPACITY, capacity * 2, n);
		if (mesh) {
			boardGroup.remove(mesh);
			mesh.dispose();
		}
		mesh = new THREE.InstancedMesh(geometry, material, cap);
		mesh.name = PUFF_NAME;
		mesh.userData = { type: 'cloudPuffs', isStatic: true, noRaycast: true };
		// One bounding volume for the whole board — see cellInstancer.
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		// Clicks must go through to the cells above.
		mesh.raycast = () => {};
		boardGroup.add(mesh);
		capacity = cap;
	}

	/**
	 * @param {Array<{pos:{x:number,z:number}, absX:number, absZ:number}>} cells
	 */
	function rebuild(cells) {
		const n = Array.isArray(cells) ? cells.length * PUFFS_PER_CELL : 0;
		ensureCapacity(Math.max(1, n));
		let i = 0;
		for (const cell of cells || []) {
			const jitter = seededJitter(cell.pos.x, cell.pos.z);
			for (let p = 0; p < PUFFS_PER_CELL; p++) {
				const [px, py, pz, sh, sv] = LAYOUT[p];
				const j = jitter[p];
				const k = jitter[(p + 1) % PUFFS_PER_CELL];
				_position.set(cell.absX + px + j, py + k * 0.25, cell.absZ + pz + k);
				_scale.set(sh * (1 + j * 0.6), sv, sh * (1 - k * 0.6));
				_matrix.compose(_position, _rotation, _scale);
				mesh.setMatrixAt(i++, _matrix);
			}
		}
		mesh.count = i;
		mesh.instanceMatrix.needsUpdate = true;
	}

	function getMesh() { return mesh; }

	function dispose() {
		if (mesh) {
			boardGroup.remove(mesh);
			mesh.dispose();
			mesh = null;
		}
		capacity = 0;
	}

	return { rebuild, getMesh, dispose };
}

/**
 * Gentle bob of the whole cloud bed. Safe to call every frame.
 *
 * @param {object} scene
 * @param {number} timeSec
 */
export function animateCloudPuffs(scene, timeSec) {
	const board = scene && scene.getObjectByName('boardGroup');
	const puffs = board && board.getObjectByName(PUFF_NAME);
	if (!puffs) return;
	puffs.position.y = Math.sin(timeSec * 0.7) * 0.03;
}
