/**
 * The cute render profile's longship: a chunky, rounded toy boat to sail
 * beside the cute chess characters (chessPieceCreator/specialModes.js).
 * A honey-wood tub with a cream bumper rail and a band in the owner's
 * colour, a big friendly dragon head with googly eyes on a curly neck, a
 * curly tail astern, round shields, a puffy striped sail and three fat
 * oars a side.
 *
 *   buildCuteLongship(THREE, { sailColour, stripeColour }) -> THREE.Group
 *
 * Same frame and contract as longship.js buildLongship (origin at the
 * waterline amidships, +Y up, bow toward +Z, ~7.8 units long, the yard
 * at y 3.8 / z 0.13) and the same named parts the renderer animates:
 *   'hull'  one vertex-coloured mesh (everything that never moves)
 *   'sail'  the sail and its yard, one mesh; a `paint` attribute marks
 *           the dye (1) and stripe (2) vertices for the seized-sail fade
 *   'oars'  InstancedMesh, local +X outboard from the oar port
 * userData: { oars, oarData, sail, shipStyle: 'cute', yardY, yardZ }.
 * Three draw calls, ~3k triangles, no textures. The colours are kept
 * mid-toned: the cute profile's lights are strong (a flat deck in a
 * pale wood came out white).
 */

import { createBake, shadeHex, oarRestPose, poseOars } from './longshipKit.js';

const YARD_Y = 3.8;
const YARD_Z = 0.13;
const HALF_LEN = 3.0;      // the tub, bow to stern (the neck and tail curl past it)
const BEAM = 0.92;         // half-beam amidships
export const CUTE_DECK_Y = 0.42;   // shipLayout SHIP_FIT.cute.deckY

const WOOD = 0xC2773A;
const WOOD_DEEP = 0x8F4A22;
const DECK_A = 0x9E6236;
const DECK_B = 0x8A532C;
const RIM = 0xF1DDB5;
const GOLD = 0xF5B52E;
const INK = 0x23161F;
const WHITE = 0xFFFFFF;
const BLUSH = 0xFF8FA3;

/** Half-beam of the tub at keel position z (blunt, rounded ends). */
export function cuteHalfBeam(z) {
	const t = Math.min(1, Math.abs(z) / HALF_LEN);
	return BEAM * Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 1 / 2.4);
}

/** Height of the bumper rail at z: low amidships, swept up at both ends. */
export function cuteSheer(z) {
	const t = Math.min(1, Math.abs(z) / HALF_LEN);
	return 0.6 + 0.5 * Math.pow(t, 3);
}

function keelDepth(z) {
	const t = Math.min(1, Math.abs(z) / HALF_LEN);
	return 0.06 + 0.4 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 3)));
}

const M4 = (THREE) => new THREE.Matrix4();

/**
 * Lambert, vertex-coloured, lit a little from within (`glow` of its own
 * colour), like a painted toy: the cute scene's lights are strong from
 * above and blue-violet all round, which left the sides and the sail's
 * shaded face a muddy purple whatever their paint.
 */
function glowMaterial(THREE, glow) {
	const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
	m.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <emissivemap_fragment>',
			`#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(2)};`,
		);
	};
	m.customProgramCacheKey = () => `cute-longship-glow-${glow.toFixed(2)}`;
	return m;
}

export function buildCuteLongship(THREE, opts = {}) {
	const main = Number.isFinite(opts.sailColour) ? opts.sailColour : 0xff5a6e;
	const stripe = Number.isFinite(opts.stripeColour) ? opts.stripeColour : 0xfff3dc;
	// The owner's colour on the hull band, the dragon and the shields:
	// a dark army's would sink into the night, so it is lifted.
	const lum = 0.3 * ((main >> 16) & 255) + 0.59 * ((main >> 8) & 255) + 0.11 * (main & 255);
	const owner = lum < 90 ? shadeHex(main, 0.3) : main;
	const pale = shadeHex(owner, 0.5);
	const V = THREE.Vector3;
	const at = (x, y, z) => M4(THREE).makeTranslation(x, y, z);
	const hull = createBake(THREE);

	// ---- the tub: a smooth grid, coloured a row at a time ----------------
	// Section rows from the port rail, round the keel, to the starboard
	// rail (angle a: ±π/2 at the rails, 0 on the keel).
	const A = [Math.PI / 2, 1.3, 0.98, 0.62, 0.28, 0];
	const ROWS = A.concat(A.slice(0, -1).reverse().map(a => -a));
	const ROW_COL = (r) => {
		const k = Math.min(r, ROWS.length - 2 - r);   // 0 at the rails (quad rows)
		if (k === 1) return owner;                    // the owner's band
		if (k >= 3) return WOOD_DEEP;
		return WOOD;
	};
	const NU = 14;
	const verts = [];
	for (let i = 0; i <= NU; i++) {
		// ends bunched a little: they curve the most
		const s = -1 + 2 * i / NU;
		const z = HALF_LEN * Math.sign(s) * Math.pow(Math.abs(s), 0.85);
		const hb = Math.max(0.02, cuteHalfBeam(z));
		const sh = cuteSheer(z), d = keelDepth(z);
		for (let r = 0; r < ROWS.length; r++) {
			const a = ROWS[r];
			verts.push(hb * Math.sin(a), sh - (sh + d) * Math.cos(a), z);
		}
	}
	const R = ROWS.length;
	const idx = [];
	const quadRow = [];
	for (let i = 0; i < NU; i++) {
		for (let r = 0; r < R - 1; r++) {
			const a = i * R + r, b = a + 1, c = a + R, d = c + 1;
			idx.push(a, c, b, b, c, d);
			quadRow.push(r, r);
		}
	}
	const tub = new THREE.BufferGeometry();
	tub.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
	tub.setIndex(idx);
	tub.computeVertexNormals();
	hull.add(tub, (t) => ROW_COL(quadRow[t]));

	// ---- deck: planks across a flat lid inside the rail ---------------------
	const DN = 12;
	const deckZ0 = -HALF_LEN * 0.9, deckZ1 = HALF_LEN * 0.9;
	for (let i = 0; i < DN; i++) {
		const za = deckZ0 + (deckZ1 - deckZ0) * i / DN;
		const zb = deckZ0 + (deckZ1 - deckZ0) * (i + 1) / DN;
		const xa = cuteHalfBeam(za) * 0.97, xb = cuteHalfBeam(zb) * 0.97;
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute([
			-xa, CUTE_DECK_Y, za, xb, CUTE_DECK_Y, zb, xa, CUTE_DECK_Y, za,
			-xa, CUTE_DECK_Y, za, -xb, CUTE_DECK_Y, zb, xb, CUTE_DECK_Y, zb,
		], 3));
		g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
		hull.add(g, i % 2 ? DECK_A : DECK_B);
	}

	// ---- the cream bumper rail round the gunwale ----------------------------
	class RailCurve extends THREE.Curve {
		getPoint(t, target = new V()) {
			const ang = t * Math.PI * 2;
			const z = HALF_LEN * 0.995 * Math.cos(ang);
			const x = cuteHalfBeam(z) * Math.sign(Math.sin(ang)) * Math.min(1, Math.abs(Math.sin(ang)) * 6);
			return target.set(x, cuteSheer(z) + 0.02, z);
		}
	}
	hull.add(new THREE.TubeGeometry(new RailCurve(), 36, 0.1, 5, true), RIM);

	// ---- dragon: a curly neck and a big friendly head at the bow ------------
	const neck = new THREE.CatmullRomCurve3([
		new V(0, 0.9, 2.78), new V(0, 1.4, 3.15), new V(0, 1.9, 3.26), new V(0, 2.25, 3.14), new V(0, 2.45, 3.18),
	]);
	hull.add(new THREE.TubeGeometry(neck, 10, 0.22, 6, false), owner);
	// back frill: soft gold spikes down the neck
	[[1.5, 3.02, 0.7], [1.95, 3.04, 0.35], [2.35, 2.94, 0.05]].forEach(([y, z, tilt]) => {
		hull.add(new THREE.ConeGeometry(0.11, 0.3, 5), GOLD, { matrix: M4(THREE).makeRotationX(-1.2 - tilt).setPosition(0, y, z - 0.14) });
	});
	const HY = 2.72, HZ = 3.34;
	hull.add(new THREE.SphereGeometry(0.5, 12, 8), owner, { matrix: M4(THREE).makeScale(0.92, 0.84, 1.0).setPosition(0, HY, HZ) });
	// snout, lighter, poking forward, with two nostrils
	hull.add(new THREE.SphereGeometry(0.32, 10, 6), pale, { matrix: M4(THREE).makeScale(0.88, 0.64, 1.0).setPosition(0, HY - 0.16, HZ + 0.4) });
	for (const s of [-1, 1]) {
		hull.add(new THREE.SphereGeometry(0.04, 5, 3), INK, { matrix: at(s * 0.1, HY - 0.08, HZ + 0.7) });
		// big googly eyes: white, dark pupil, a sparkle
		hull.add(new THREE.SphereGeometry(0.2, 10, 7), WHITE, { matrix: at(s * 0.21, HY + 0.2, HZ + 0.3) });
		hull.add(new THREE.SphereGeometry(0.11, 8, 5), INK, { matrix: at(s * 0.23, HY + 0.19, HZ + 0.45) });
		hull.add(new THREE.SphereGeometry(0.04, 5, 3), WHITE, { matrix: at(s * 0.26, HY + 0.25, HZ + 0.54) });
		// rosy cheeks
		hull.add(new THREE.SphereGeometry(0.1, 6, 4), BLUSH, { matrix: M4(THREE).makeScale(1, 0.6, 0.5).setPosition(s * 0.36, HY - 0.14, HZ + 0.3) });
		// little gold horns, swept back
		hull.add(new THREE.ConeGeometry(0.09, 0.36, 6), GOLD, {
			matrix: M4(THREE).makeRotationZ(-s * 0.35).premultiply(M4(THREE).makeRotationX(-0.75)).setPosition(s * 0.2, HY + 0.44, HZ - 0.18),
		});
		// round ears
		hull.add(new THREE.SphereGeometry(0.12, 6, 4), pale, { matrix: M4(THREE).makeScale(0.4, 1, 0.8).setPosition(s * 0.42, HY + 0.12, HZ - 0.12) });
	}
	// a smile under the snout
	hull.add(new THREE.TorusGeometry(0.13, 0.026, 4, 8, Math.PI), INK, {
		matrix: M4(THREE).makeRotationZ(Math.PI).setPosition(0, HY - 0.2, HZ + 0.66),
	});

	// ---- the curly tail astern -----------------------------------------------
	const tail = new THREE.CatmullRomCurve3([
		new V(0, 0.9, -2.82), new V(0, 1.4, -3.2), new V(0, 1.9, -3.22), new V(0, 2.15, -2.98), new V(0, 2.02, -2.7), new V(0, 1.8, -2.76),
	]);
	hull.add(new THREE.TubeGeometry(tail, 10, 0.17, 5, false), owner);
	hull.add(new THREE.SphereGeometry(0.16, 7, 5), GOLD, { matrix: at(0, 1.76, -2.8) });

	// ---- round shields along the rail ------------------------------------------
	[-0.9, 0.25, 1.4].forEach((z, k) => {
		for (const s of [-1, 1]) {
			const x = (cuteHalfBeam(z) + 0.05) * s;
			const y = cuteSheer(z) - 0.16;
			const m = M4(THREE).makeRotationZ(Math.PI / 2).setPosition(x, y, z);
			hull.add(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 10), (k + (s > 0 ? 0 : 1)) % 2 ? GOLD : owner, { matrix: m });
			hull.add(new THREE.SphereGeometry(0.09, 6, 3), WHITE, { matrix: at(x + s * 0.05, y, z) });
		}
	});

	// ---- mast, with a gold ball and a little flag on top ----------------------
	hull.add(new THREE.CylinderGeometry(0.09, 0.12, 3.95, 7), WOOD_DEEP, { matrix: at(0, CUTE_DECK_Y + 1.97, 0) });
	hull.add(new THREE.SphereGeometry(0.15, 8, 5), GOLD, { matrix: at(0, 4.36, 0) });
	const flag = new THREE.BufferGeometry();
	flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 4.28, -0.05, 0, 4.02, -0.05, 0, 4.15, -0.66], 3));
	flag.computeVertexNormals();
	hull.add(flag, owner);

	// ---- the sail: puffy, striped, hanging from its yard ------------------
	const sail = createBake(THREE);
	sail.add(new THREE.CylinderGeometry(0.08, 0.08, 3.7, 7), WOOD_DEEP, {
		matrix: M4(THREE).makeRotationZ(Math.PI / 2).setPosition(0, YARD_Y, YARD_Z),
	});
	for (const s of [-1, 1]) sail.add(new THREE.SphereGeometry(0.12, 6, 4), GOLD, { matrix: at(s * 1.9, YARD_Y, YARD_Z) });
	const STRIPES = 6, SC = 3, SR = 7;
	const TOP = YARD_Y - 0.06, BOT = 1.35;
	const sailPoint = (xn, yn) => {
		// a pillow: wider at the foot, the foot's corners rounded up, and
		// bellied forward in the middle
		const w = 1.6 + 0.18 * yn;
		const x = (xn * 2 - 1) * w;
		const edge = Math.abs(xn * 2 - 1);
		const y = TOP - (TOP - BOT) * yn + 0.3 * Math.pow(edge, 4) * yn * yn;
		const belly = 0.95 * Math.sin(Math.PI * xn) * (0.22 + 0.78 * Math.sin(Math.PI * Math.min(1, yn * 0.88 + 0.1)));
		return [x, y, YARD_Z + 0.03 + belly];
	};
	for (let sIdx = 0; sIdx < STRIPES; sIdx++) {
		const pv = [];
		for (let r = 0; r <= SR; r++) {
			for (let cIdx = 0; cIdx <= SC; cIdx++) {
				const xn = (sIdx + cIdx / SC) / STRIPES;
				pv.push(...sailPoint(xn, r / SR));
			}
		}
		const ii = [];
		for (let r = 0; r < SR; r++) {
			for (let cIdx = 0; cIdx < SC; cIdx++) {
				const a = r * (SC + 1) + cIdx, b = a + 1, c = a + SC + 1, d = c + 1;
				ii.push(a, c, b, b, c, d);
			}
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
		g.setIndex(ii);
		g.computeVertexNormals();
		const dye = sIdx % 2 === 0;
		sail.add(g, dye ? main : stripe, { paint: dye ? 1 : 2 });
	}

	// ---- three fat oars a side ------------------------------------------------
	const OAR_OUT = 1.3;
	const oarBake = createBake(THREE);
	oarBake.add(new THREE.CylinderGeometry(0.05, 0.055, OAR_OUT + 0.35, 5), RIM, {
		matrix: M4(THREE).makeRotationZ(-Math.PI / 2).setPosition((OAR_OUT - 0.35) / 2 - 0.1, 0, 0),
	});
	oarBake.add(new THREE.SphereGeometry(0.22, 7, 4), owner, { matrix: M4(THREE).makeScale(1.25, 0.9, 0.32).setPosition(OAR_OUT - 0.12, 0, 0) });
	const oarData = oarRestPose([-0.75, 0.3, 1.35], (z) => cuteHalfBeam(z) * 0.98, (z) => cuteSheer(z) - 0.02, OAR_OUT);

	// ---- meshes ---------------------------------------------------------------
	const mat = glowMaterial(THREE, 0.22);
	const sailMat = glowMaterial(THREE, 0.42);
	const group = new THREE.Group();
	group.name = 'longship';
	const hullMesh = new THREE.Mesh(hull.build(), mat);
	hullMesh.name = 'hull';
	group.add(hullMesh);
	const sailMesh = new THREE.Mesh(sail.build({ paint: true }), sailMat);
	sailMesh.name = 'sail';
	group.add(sailMesh);
	const oars = new THREE.InstancedMesh(oarBake.build(), mat, oarData.length);
	oars.name = 'oars';
	oars.frustumCulled = false;
	poseOars(THREE, oars, oarData);
	group.add(oars);

	group.userData.oars = oars;
	group.userData.oarData = oarData;
	group.userData.sail = sailMesh;
	group.userData.shipStyle = 'cute';
	group.userData.yardY = YARD_Y;
	group.userData.yardZ = YARD_Z;
	group.userData.triangles = hull.triangles() + sail.triangles() + oarBake.triangles() * oarData.length;
	return group;
}
