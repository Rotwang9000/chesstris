/**
 * Home squares are striped: they don't count toward a line.
 *
 * A line clears with 8 tetromino squares in a row; home squares (and
 * ex-home terrain) break the run (server BoardManager._findClearableLines).
 * In the standard, cute and retro looks every such square gets a flat
 * hatched decal on its top face, the road-marking sign for "not part of
 * the lane", so a row with a home square in it visibly has a gap. (The
 * Viking land look lays hall flagstones instead, see viking/landDress.js.)
 *
 * One InstancedMesh for the whole board, rebuilt with the cells. Clicks
 * pass through to the cells underneath.
 */

const NAME = 'homeMarks';
const DEFAULT_CAPACITY = 256;
const TOP_Y = 0.474;          // just above a cell's top face (0.47)

/** Stripe and border colours for each look. */
export const MARK_STYLE = Object.freeze({
	normal: { stripe: 'rgba(60, 40, 20, 0.30)', edge: 'rgba(60, 40, 20, 0.5)' },
	cute: { stripe: 'rgba(255, 255, 255, 0.55)', edge: 'rgba(255, 255, 255, 0.75)' },
	retro: { stripe: 'rgba(0, 255, 65, 0.42)', edge: 'rgba(0, 255, 65, 0.7)' },
});

export function markStyleFor(profile) {
	return MARK_STYLE[profile] || MARK_STYLE.normal;
}

function hatchTexture(THREE, style) {
	const S = 64;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d');
	if (!g) return null;
	g.clearRect(0, 0, S, S);
	// diagonal stripes, tiling cleanly (period S/4 along both axes)
	g.strokeStyle = style.stripe;
	g.lineWidth = 5;
	for (let k = -S; k <= 2 * S; k += S / 4) {
		g.beginPath();
		g.moveTo(k, 0);
		g.lineTo(k - S, S);
		g.stroke();
	}
	// an inset frame: the square is fenced off from the row
	g.strokeStyle = style.edge;
	g.lineWidth = 3;
	g.strokeRect(5, 5, S - 10, S - 10);
	const tex = new THREE.CanvasTexture(c);
	tex.anisotropy = 4;
	return tex;
}

/**
 * @param {object} THREE
 * @param {object} boardGroup
 * @param {string} profile  'normal' | 'cute' | 'retro'
 */
export function createHomeMarks(THREE, boardGroup, profile = 'normal') {
	const geometry = new THREE.PlaneGeometry(0.9, 0.9);
	geometry.rotateX(-Math.PI / 2);
	const map = hatchTexture(THREE, markStyleFor(profile));
	const material = new THREE.MeshBasicMaterial({
		map,
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -2,
	});
	let mesh = null;
	let capacity = 0;
	const _m = new THREE.Matrix4();

	function ensureCapacity(n) {
		if (mesh && n <= capacity) return;
		const cap = Math.max(DEFAULT_CAPACITY, capacity * 2, n);
		if (mesh) { boardGroup.remove(mesh); mesh.dispose(); }
		mesh = new THREE.InstancedMesh(geometry, material, cap);
		mesh.name = NAME;
		// (boardWide: its instances span the board, so distance culling skips it)
		mesh.userData = { type: NAME, isStatic: true, noRaycast: true, boardWide: true };
		mesh.frustumCulled = false;
		mesh.renderOrder = 2;
		mesh.raycast = () => {};
		boardGroup.add(mesh);
		capacity = cap;
	}

	/** @param {Array<{absX:number, absZ:number}>} cells */
	function rebuild(cells) {
		const list = Array.isArray(cells) ? cells : [];
		ensureCapacity(Math.max(1, list.length));
		for (let i = 0; i < list.length; i++) {
			_m.makeTranslation(list[i].absX, TOP_Y, list[i].absZ);
			mesh.setMatrixAt(i, _m);
		}
		mesh.count = list.length;
		mesh.instanceMatrix.needsUpdate = true;
	}

	function dispose() {
		if (mesh) { boardGroup.remove(mesh); mesh.dispose(); mesh = null; }
		geometry.dispose();
		if (map) map.dispose();
		material.dispose();
	}

	return { rebuild, dispose, getMesh: () => mesh, profile };
}
