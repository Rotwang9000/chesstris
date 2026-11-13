/**
 * A tiny geometry "bake" for the profile longships (longshipCute.js,
 * longshipRetro.js): any number of core geometries, transformed and
 * coloured, flattened into ONE non-indexed BufferGeometry with a
 * `color` attribute (and optionally a `paint` attribute that tells the
 * renderer's sail-dye fade which vertices are the main dye (1), the
 * stripe (2) or neither (0)). One bake = one mesh = one draw call.
 *
 * Three.js r132 core only; no DOM (so the models build under jest).
 */

const _v = { x: 0, y: 0, z: 0 };

/**
 * @param {Object} THREE
 * @returns {{
 *   add: (geo: THREE.BufferGeometry, colour: number|function, opts?: Object) => void,
 *   box: (colour: number|function, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, opts?: Object) => void,
 *   quad: (a: number[], b: number[], c: number[], d: number[], colour: number, normal: number[], paint?: number) => void,
 *   build: (opts?: {paint?: boolean}) => THREE.BufferGeometry,
 *   triangles: () => number,
 * }}
 */
export function createBake(THREE) {
	const pos = [];
	const nor = [];
	const col = [];
	const paint = [];
	const v = new THREE.Vector3();
	const n = new THREE.Vector3();
	const nm = new THREE.Matrix3();
	const c = new THREE.Color();
	const cen = new THREE.Vector3();
	const fn = new THREE.Vector3();
	const c3 = new THREE.Color();

	/**
	 * Append a geometry. `colour` is a hex, or `(tri, centroid, normal) =>
	 * hex` for a colour per triangle (crisp bands, faces). opts:
	 *   matrix  Matrix4 applied to the geometry
	 *   paint   0 | 1 | 2 (see above), or (tri, centroid) => 0|1|2
	 *   shade   (normal) => multiplier baked into the colour (flat-shaded look)
	 *   flat    true: face normals (faceted)
	 */
	function add(geo, colour, opts = {}) {
		let g = geo;
		if (g.index) g = g.toNonIndexed();
		if (!g.attributes.normal) g.computeVertexNormals();
		const P = g.attributes.position;
		const N = g.attributes.normal;
		const m = opts.matrix || null;
		if (m) nm.getNormalMatrix(m);
		const flip = !!(m && m.determinant() < 0);
		const colFn = typeof colour === 'function' ? colour : null;
		const paintFn = typeof opts.paint === 'function' ? opts.paint : null;
		const paintVal = paintFn ? 0 : (opts.paint || 0);
		const shade = typeof opts.shade === 'function' ? opts.shade : null;
		const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
		const trn = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
		for (let i = 0; i + 2 < P.count; i += 3) {
			for (let k = 0; k < 3; k++) {
				v.fromBufferAttribute(P, i + k);
				n.fromBufferAttribute(N, i + k);
				if (m) { v.applyMatrix4(m); n.applyMatrix3(nm).normalize(); }
				tri[k][0] = v.x; tri[k][1] = v.y; tri[k][2] = v.z;
				trn[k][0] = n.x; trn[k][1] = n.y; trn[k][2] = n.z;
			}
			cen.set((tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3, (tri[0][2] + tri[1][2] + tri[2][2]) / 3);
			// face normal (winding as the source had it, before any flip)
			const ax = tri[1][0] - tri[0][0], ay = tri[1][1] - tri[0][1], az = tri[1][2] - tri[0][2];
			const bx = tri[2][0] - tri[0][0], by = tri[2][1] - tri[0][1], bz = tri[2][2] - tri[0][2];
			fn.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
			if (flip) fn.negate();
			if (fn.lengthSq() > 1e-20) fn.normalize(); else fn.set(0, 1, 0);
			const t = i / 3;
			c.set(colFn ? colFn(t, cen, fn) : colour);
			const p = paintFn ? paintFn(t, cen) : paintVal;
			const order = flip ? [0, 2, 1] : [0, 1, 2];
			for (const k of order) {
				const nn = opts.flat ? [fn.x, fn.y, fn.z] : trn[k];
				const s = shade ? shade(opts.flat ? fn : (_v.x = nn[0], _v.y = nn[1], _v.z = nn[2], _v)) : 1;
				pos.push(tri[k][0], tri[k][1], tri[k][2]);
				nor.push(nn[0], nn[1], nn[2]);
				col.push(c.r * s, c.g * s, c.b * s);
				paint.push(p);
			}
		}
		if (g !== geo) g.dispose();
		geo.dispose();
	}

	/** An axis-aligned box from corner to corner. */
	function box(colour, x0, x1, y0, y1, z0, z1, opts = {}) {
		const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
		g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
		add(g, colour, { flat: true, ...opts });
	}

	/**
	 * One flat quad (corners counter-clockwise seen from its front), for
	 * the voxel builder: `colour` already shaded, `normal` [x, y, z].
	 */
	function quad(a, b, c, d, colour, normal, paintVal = 0) {
		c3.set(colour);
		for (const p of [a, b, c, a, c, d]) {
			pos.push(p[0], p[1], p[2]);
			nor.push(normal[0], normal[1], normal[2]);
			col.push(c3.r, c3.g, c3.b);
			paint.push(paintVal);
		}
	}

	function build({ paint: withPaint = false } = {}) {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
		if (withPaint) geo.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 1));
		geo.computeBoundingSphere();
		geo.computeBoundingBox();
		return geo;
	}

	return { add, box, quad, build, triangles: () => pos.length / 9 };
}

/** Lighten (amount > 0, toward white) or darken (< 0, toward black) a hex colour. */
export function shadeHex(hex, amount) {
	const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
	const to = amount >= 0 ? 255 : 0;
	const k = Math.min(1, Math.abs(amount));
	const ch = (x) => Math.round(x + (to - x) * k);
	return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/**
 * The rest pose of an oar set, in the shape shipRenderer's stepOars
 * expects (`{pivot:[x,y,z], side, yaw, dip}`): one oar per `z` per side,
 * pivoting at the gunwale `halfBeam(z)`, `gunwale(z)` high, blades held
 * just clear of the water.
 */
export function oarRestPose(zs, halfBeam, gunwale, outboard) {
	const out = [];
	for (const side of [1, -1]) {
		zs.forEach((z, k) => {
			const px = halfBeam(z) * side;
			const py = gunwale(z);
			const dip = Math.asin(Math.max(-1, Math.min(1, (py - 0.07) / outboard)));
			out.push({ pivot: [px, py, z], side, yaw: 0.2 + 0.05 * Math.sin(k * 1.7), dip });
		});
	}
	return out;
}

/**
 * Put every oar instance at its rest pose (run out), as the renderer
 * would before its first frame.
 */
export function poseOars(THREE, oars, oarData) {
	const mT = new THREE.Matrix4(), mY = new THREE.Matrix4(), mZ = new THREE.Matrix4();
	oarData.forEach((o, k) => {
		mT.makeTranslation(o.pivot[0], o.pivot[1], o.pivot[2]);
		mY.makeRotationY(o.side > 0 ? o.yaw : Math.PI - o.yaw);
		mZ.makeRotationZ(-o.dip);
		oars.setMatrixAt(k, mT.multiply(mY).multiply(mZ));
	});
	oars.instanceMatrix.needsUpdate = true;
}

/*
 * Voxels: cells on a grid of `unit`-sized cubes, cell (i, j, k) spanning
 * x [i, i+1)·unit (+ origin), and so on. Only the faces between a filled
 * cell and an empty one are drawn, each with its colour shaded by which
 * way it faces (a baked, flat "sprite" light that needs no scene light),
 * so a solid hull costs its skin, not its volume.
 */

/** Face shading of a voxel model: lit from above and to starboard. */
export const VOXEL_SHADE = Object.freeze({ px: 0.84, nx: 0.6, py: 1, ny: 0.42, pz: 0.74, nz: 0.66 });

const FACES = [
	// [di, dj, dk, shadeKey, normal, corners (unit cube, CCW from outside)]
	[1, 0, 0, 'px', [1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
	[-1, 0, 0, 'nx', [-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
	[0, 1, 0, 'py', [0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
	[0, -1, 0, 'ny', [0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
	[0, 0, 1, 'pz', [0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
	[0, 0, -1, 'nz', [0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

/**
 * @param {number} unit   cube size (x and z)
 * @param {Object} [opts] { unitY, unitZ: the cell's height and depth (default unit), origin: [x, y, z] }
 */
export function createVoxels(unit, { unitY = unit, unitZ = unit, origin = [0, 0, 0] } = {}) {
	const cells = new Map();
	const key = (i, j, k) => `${i},${j},${k}`;
	return {
		/** Fill (or recolour) a cell. `paint` as createBake's. */
		set(i, j, k, colour, paint = 0) { cells.set(key(i, j, k), { i, j, k, colour, paint }); },
		/** Fill i0..i1 × j0..j1 × k0..k1 (inclusive). */
		fill(i0, i1, j0, j1, k0, k1, colour, paint = 0) {
			for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
				cells.set(key(i, j, k), { i, j, k, colour, paint });
			}
		},
		has(i, j, k) { return cells.has(key(i, j, k)); },
		get(i, j, k) { return cells.get(key(i, j, k)) || null; },
		count() { return cells.size; },
		/**
		 * Draw the exposed faces into a bake. Faces in a row along one
		 * axis with the same plane, colour and paint are merged into one
		 * quad (`run`: the axis per face direction, default k for the x
		 * and y faces, i for the z faces), so a long plank is two
		 * triangles, not two per cell.
		 */
		emit(bake, shade = VOXEL_SHADE, run = {}) {
			const sz3 = [unit, unitY, unitZ];
			const runs = new Map();
			for (const c of cells.values()) {
				for (const [di, dj, dk, sk, n, corners] of FACES) {
					if (cells.has(key(c.i + di, c.j + dj, c.k + dk))) continue;
					const ax = run[sk] || (sk === 'pz' || sk === 'nz' ? 'i' : 'k');
					const a = ax === 'i' ? 0 : (ax === 'j' ? 1 : 2);
					const ijk = [c.i, c.j, c.k];
					const along = ijk[a];
					ijk[a] = 0;
					const rk = `${sk}|${ijk.join(',')}|${c.colour}|${c.paint}`;
					let r = runs.get(rk);
					if (!r) { r = { sk, n, corners, a, base: [c.i, c.j, c.k], colour: c.colour, paint: c.paint, at: [] }; runs.set(rk, r); }
					r.at.push(along);
				}
			}
			for (const r of runs.values()) {
				r.at.sort((x, y) => x - y);
				const col = shadeHex(r.colour, (shade[r.sk] ?? 1) - 1);
				let s0 = r.at[0];
				for (let q = 1; q <= r.at.length; q++) {
					if (q < r.at.length && r.at[q] === r.at[q - 1] + 1) continue;
					const s1 = r.at[q - 1];
					const lo = r.base.slice(); lo[r.a] = s0;
					const pts = r.corners.map((cn) => {
						const out = [0, 0, 0];
						for (let d = 0; d < 3; d++) {
							// along the run the cube's far side is the run's last cell
							const v = d === r.a ? (cn[d] ? s1 + 1 : s0) : lo[d] + cn[d];
							out[d] = origin[d] + v * sz3[d];
						}
						return out;
					});
					bake.quad(pts[0], pts[1], pts[2], pts[3], col, r.n, r.paint);
					if (q < r.at.length) s0 = r.at[q];
				}
			}
		},
	};
}

/** A bake `shade` option giving a box the voxel model's baked light. */
export function voxelShade(normal) {
	const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
	if (ay >= ax && ay >= az) return normal.y > 0 ? VOXEL_SHADE.py : VOXEL_SHADE.ny;
	if (ax >= az) return normal.x > 0 ? VOXEL_SHADE.px : VOXEL_SHADE.nx;
	return normal.z > 0 ? VOXEL_SHADE.pz : VOXEL_SHADE.nz;
}
