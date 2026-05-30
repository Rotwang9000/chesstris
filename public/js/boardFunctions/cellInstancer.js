/**
 * Instanced renderer for "plain" terrain cells.
 *
 * Why this exists: every board cell used to be its own `THREE.Mesh`.
 * At ~900 cells (a 23-player shared world) that is ~900 draw calls AND
 * ~900 nodes the renderer's `updateMatrixWorld` walks every frame — the
 * dominant board cost the 29 May 2026 graphics stress test flagged.
 * Cells already share ONE box geometry and a small pool of cached
 * materials, differing only by colour, so they collapse perfectly into a
 * single `InstancedMesh`: one draw call, one scene node, per-instance
 * colour.
 *
 * Only "plain opaque" cells are instanced. Cells that need per-cell
 * behaviour a single instanced material cannot express stay as
 * individual meshes (decided in `renderBoard`):
 *   - decaying cells (animated red emissive + fading opacity),
 *   - ex-home / transparent cells (fixed sub-1 opacity),
 *   - retro-mode cells (per-cell emissive CRT look),
 *   - sponsored cells (an ad decal mesh is parented to the cell).
 * That keeps clicks, ads and the decay VFX working untouched while the
 * bulk of the board — typically >95% of cells — becomes one draw call.
 *
 * Raycasting: an `InstancedMesh` raycast yields an `instanceId`; we keep
 * a parallel `cellAt[]` so `chessInteraction` can map a hit back to its
 * board {x, z}.
 *
 * No module-level mutable state is exported: `createCellInstancer`
 * returns a fresh closure-backed object that the caller stashes on
 * `gameState` and passes around.
 */

// Initial instance buffer size. The board comfortably exceeds a few
// hundred cells; starting at 1024 avoids early re-allocations while
// staying tiny in memory (1024 × (16 floats matrix + 3 floats colour)).
const DEFAULT_CAPACITY = 1024;
// When we outgrow the buffer, grow by this much (or to fit, whichever is
// larger) so a steadily expanding world doesn't re-allocate every render.
const CAPACITY_STEP = 512;

/**
 * @param {object} THREE        live THREE namespace
 * @param {object} boardGroup   group the instanced mesh is parented to
 * @param {object} cellGeometry SHARED cell box geometry (never disposed here)
 * @param {object} [options]    material tuning for this bucket
 * @param {string} [options.name='instancedCells'] scene-graph name
 * @param {boolean} [options.transparent=false] transparent bucket (ex-home)
 * @param {number} [options.opacity=1.0]
 * @param {number} [options.roughness=0.5]
 * @param {number} [options.metalness=0.1]
 */
export function createCellInstancer(THREE, boardGroup, cellGeometry, options = {}) {
	const name = options.name || 'instancedCells';
	const transparent = !!options.transparent;
	const opacity = (typeof options.opacity === 'number') ? options.opacity : 1.0;
	const roughness = (typeof options.roughness === 'number') ? options.roughness : 0.5;
	const metalness = (typeof options.metalness === 'number') ? options.metalness : 0.1;

	let capacity = 0;
	let mesh = null;
	// instanceId → { x, z } board coordinate, for raycast mapping. Also
	// mirrored onto `mesh.userData.cellAt` so a raycast hit can resolve
	// its cell from the hit object alone (no instancer reference needed),
	// which keeps multi-bucket raycasting in chessInteraction trivial.
	const cellAt = [];
	const _matrix = new THREE.Matrix4();
	const _colour = new THREE.Color();

	function buildMesh(cap) {
		// One shared material; per-cell tint comes from `instanceColor`
		// (MeshStandardMaterial multiplies material.color × instanceColor,
		// so a white base yields exactly the per-instance colour). The
		// roughness/metalness are a representative middle-ground for the
		// plain cell kinds (default 0.45/0.05, home 0.7/0.3, tetromino
		// 0.55/0.1) — the visible difference is negligible next to colour.
		const material = new THREE.MeshStandardMaterial({
			color: 0xffffff,
			roughness,
			metalness,
			transparent,
			opacity,
		});
		const m = new THREE.InstancedMesh(cellGeometry, material, cap);
		m.name = name;
		m.userData = { type: 'instancedCells', isStatic: true, cellAt };
		m.castShadow = true;
		m.receiveShadow = true;
		// The mesh sits at the board origin; each instance carries its own
		// translation. Its single bounding volume would span the whole
		// board, so per-instance frustum culling is impossible — but it's
		// one draw call regardless, so we simply always submit it (and the
		// distance-cull pass explicitly skips it for the same reason).
		m.frustumCulled = false;
		if (m.instanceMatrix && m.instanceMatrix.setUsage) {
			m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		}
		return m;
	}

	function ensureCapacity(n) {
		if (mesh && n <= capacity) return;
		const cap = Math.max(DEFAULT_CAPACITY, capacity + CAPACITY_STEP, n);
		const old = mesh;
		mesh = buildMesh(cap);
		boardGroup.add(mesh);
		if (old) {
			boardGroup.remove(old);
			if (old.material) old.material.dispose();
			if (typeof old.dispose === 'function') old.dispose();
		}
		capacity = cap;
	}

	/**
	 * Replace the entire instance set. `renderBoard` runs only on board
	 * changes (not every frame), so a full rewrite of the matrix/colour
	 * buffers is cheap and far simpler than incremental slot reuse.
	 *
	 * @param {Array<{pos:{x:number,z:number}, absX:number, absZ:number, color:number}>} cells
	 */
	function rebuild(cells) {
		const n = Array.isArray(cells) ? cells.length : 0;
		ensureCapacity(Math.max(1, n));
		if (!mesh) return;
		cellAt.length = 0;
		for (let i = 0; i < n; i++) {
			const c = cells[i];
			_matrix.makeTranslation(c.absX, 0, c.absZ);
			mesh.setMatrixAt(i, _matrix);
			_colour.setHex(c.color);
			mesh.setColorAt(i, _colour);
			cellAt[i] = c.pos;
		}
		mesh.count = n;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}

	/** Map a raycast `instanceId` back to its board {x, z} (or null). */
	function lookupCell(instanceId) {
		if (instanceId == null || instanceId < 0 || instanceId >= cellAt.length) return null;
		return cellAt[instanceId] || null;
	}

	function getMesh() { return mesh; }

	function dispose() {
		if (mesh) {
			boardGroup.remove(mesh);
			if (mesh.material) mesh.material.dispose();
			if (typeof mesh.dispose === 'function') mesh.dispose();
			mesh = null;
		}
		capacity = 0;
		cellAt.length = 0;
	}

	return { rebuild, lookupCell, getMesh, dispose };
}
