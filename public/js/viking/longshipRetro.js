/**
 * The retro render profile's longship: a voxel arcade sprite to sail
 * beside the letter-on-disc pieces (chessPieceCreator/specialModes.js).
 * Chunky stepped planks, a blocky dragon head in the owner's colour with
 * one-pixel eyes and teeth, a curled pixel tail, quartered square
 * shields, a rail in the owner's colour (like the pieces' rims) and a
 * pixel-striped sail that bellies out in steps.
 *
 *   buildRetroLongship(THREE, { sailColour, stripeColour }) -> THREE.Group
 *
 * Same frame and contract as longship.js buildLongship (origin at the
 * waterline amidships, +Y up, bow toward +Z, ~7.8 units long, the yard
 * at y 3.8 / z 0.13) and the same named parts the renderer animates:
 *   'hull'  one mesh (everything that never moves)
 *   'sail'  the sail and its yard, one mesh; a `paint` attribute marks
 *           the dye (1) and stripe (2) vertices for the seized-sail fade
 *   'oars'  InstancedMesh, local +X outboard from the oar port
 * userData: { oars, oarData, sail, shipStyle: 'retro', yardY, yardZ }.
 *
 * Unlit (MeshBasicMaterial) with the light baked into each face, flat
 * per face, like a sprite: the retro scene is lit green, which turned
 * a lit hull to mud, and the letter pieces are unlit too. Three draw
 * calls, ~2k triangles (only the voxels' outer faces are drawn).
 */

import { createBake, createVoxels, voxelShade, shadeHex, oarRestPose, poseOars } from './longshipKit.js';

const YARD_Y = 3.8;
const YARD_Z = 0.13;
const U = 0.25;            // voxel width and length (model units)
const UY = 0.2;            // voxel height: the renderer stretches y by 1.3, so they read as cubes
export const RETRO_DECK_Y = 0.6;   // top of voxel row 2 (shipLayout SHIP_FIT.retro.deckY)

// The hull in the phosphor's own greens (brown planks and gold trim
// sat outside the retro palette); the owner's colour stays on the
// sail, rail and dragon head.
const PLANK_A = 0x0f5c24;
const PLANK_B = 0x16752e;
const KEEL = 0x073716;
const DECK_A = 0x2aa548;
const DECK_B = 0x1f8b3b;
const GOLD = 0x9dffb4;
const INK = 0x101010;
const WHITE = 0xf4f4f4;
const RED = 0xff3b3b;
const MAST = 0x0e4a1d;
const SAIL_SHADE = Object.freeze({ px: 0.8, nx: 0.62, py: 1, ny: 0.55, pz: 1, nz: 0.86 });

/** Half-beam in voxels of hull slice k (k = -12 … 11, z = k·U). */
export function retroHalfWidth(k) {
	const t = Math.min(1, Math.abs(k + 0.5) / 12);
	return Math.max(1, Math.round(4.2 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2)))));
}

/** Top voxel row of the gunwale at slice k: the ends rise in steps. */
function wallTop(k) {
	const a = Math.abs(k + 0.5);
	if (a > 10.5) return 5;
	if (a > 9) return 4;
	return 3;
}

export function buildRetroLongship(THREE, opts = {}) {
	const main = Number.isFinite(opts.sailColour) ? opts.sailColour : 0xff3b3b;
	const stripe = Number.isFinite(opts.stripeColour) ? opts.stripeColour : WHITE;
	const owner = main;
	const ownerDark = shadeHex(main, -0.35);

	// ---- the hull: stepped planks, a deck, the owner's rail ------------------
	const hv = createVoxels(U, { unitY: UY });
	for (let k = -12; k <= 11; k++) {
		const W = retroHalfWidth(k);
		const top = wallTop(k);
		for (let j = -2; j <= top; j++) {
			const w = j === -2 ? W - 2 : (j === -1 ? W - 1 : W);
			if (w < 1) continue;
			for (let i = -w; i <= w - 1; i++) {
				const edge = i === -w || i === w - 1 || k === -12 || k === 11;
				if (j <= 2) {
					// below the deck: solid; its top row is the deck itself
					let c = j <= -2 ? KEEL : (j % 2 ? PLANK_A : PLANK_B);
					if (j === 2 && !edge) c = k % 2 ? DECK_A : DECK_B;
					hv.set(i, j, k, c);
				} else if (edge || Math.abs(k + 0.5) > 9) {
					// the gunwale (and the raised ends): planks, the owner's rail on top
					hv.set(i, j, k, j === top ? owner : (j % 2 ? PLANK_A : PLANK_B));
				}
			}
		}
	}
	// prow: a stepped neck rising forward to a blocky dragon head
	const neck = [[12, 3, 5], [13, 5, 7], [14, 7, 9]];
	for (const [k, j0, j1] of neck) hv.fill(-1, 0, j0, j1, k, k, owner);
	hv.fill(-1, 0, 2, 3, 12, 12, ownerDark);
	hv.fill(-2, 1, 9, 11, 14, 16, owner);          // the head
	hv.fill(-1, 0, 9, 10, 17, 18, owner);          // the snout
	hv.fill(-1, 0, 8, 8, 15, 17, ownerDark);       // the jaw
	for (const i of [-2, 1]) {
		hv.set(i, 11, 16, WHITE);                  // eyes
		hv.set(i, 10, 16, INK);                    // …with a pupil below
		hv.set(i, 12, 14, GOLD);                   // horns
		hv.set(i, 13, 13, GOLD);
	}
	hv.fill(-1, 0, 11, 11, 17, 17, owner);         // brow over the snout
	hv.set(-1, 9, 18, WHITE); hv.set(0, 9, 18, WHITE);   // teeth
	hv.set(-1, 10, 18, INK); hv.set(0, 10, 18, INK);     // nostrils (the snout's tip)
	hv.fill(-1, 0, 8, 8, 18, 18, RED);             // a tongue
	// stern: a stepped tail curling over
	const tail = [[-13, 3, 5], [-14, 5, 7], [-15, 7, 10], [-14, 10, 11], [-13, 10, 10]];
	for (const [k, j0, j1] of tail) hv.fill(-1, 0, j0, j1, k, k, owner);
	hv.fill(-1, 0, 2, 3, -13, -13, ownerDark);
	hv.fill(-1, 0, 9, 9, -13, -13, GOLD);
	// quartered square shields on the rail, both sides
	for (const k0 of [-7, -3, 1, 5]) {
		for (const side of [1, -1]) {
			for (let dk = 0; dk < 2; dk++) {
				const k = k0 + dk;
				const W = retroHalfWidth(k);
				const i = side > 0 ? W : -W - 1;
				hv.set(i, 3, k, dk ? WHITE : owner);
				hv.set(i, 2, k, dk ? owner : WHITE);
			}
		}
	}
	const hull = createBake(THREE);
	hv.emit(hull);
	// the mast, a gold masthead and a pixel pennant
	hull.box(MAST, -0.12, 0.12, RETRO_DECK_Y, 4.2, -0.12, 0.12, { shade: voxelShade });
	hull.box(GOLD, -0.17, 0.17, 4.2, 4.5, -0.17, 0.17, { shade: voxelShade });
	hull.box(owner, -0.05, 0.05, 4.22, 4.46, -0.75, -0.17, { shade: voxelShade });
	hull.box(owner, -0.05, 0.05, 4.28, 4.4, -1.0, -0.75, { shade: voxelShade });

	// ---- the sail: pixel stripes, bellied forward in steps ---------------------
	const COLS = 14, ROWS = 11;
	const SZ = 0.13;
	const sv = createVoxels(U, { unitY: 0.22, unitZ: SZ, origin: [-COLS * U / 2, 1.3, YARD_Z - SZ / 2] });
	for (let r = 0; r < ROWS; r++) {            // r 0 = the foot
		const down = 1 - r / (ROWS - 1);          // 0 at the head, 1 at the foot
		for (let c = 0; c < COLS; c++) {
			const across = Math.sin(Math.PI * (c + 0.5) / COLS);
			const belly = Math.round(3.2 * across * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, down * 0.85 + 0.15))));
			const border = c === 0 || c === COLS - 1 || r === 0;
			let colour, paint;
			if (border) { colour = INK; paint = 0; }
			else if (((c - 1) >> 1) % 2 === 0) { colour = main; paint = 1; }
			else { colour = stripe; paint = 2; }
			sv.set(c, r, belly, colour, paint);
		}
	}
	const sail = createBake(THREE);
	// cloth keeps its colour face-on, whichever way the yard is braced
	sv.emit(sail, SAIL_SHADE, { pz: 'j', nz: 'j' });
	sail.box(MAST, -1.95, 1.95, YARD_Y - 0.1, YARD_Y + 0.1, YARD_Z - 0.1, YARD_Z + 0.1, { shade: voxelShade });
	for (const s of [-1, 1]) sail.box(GOLD, s * 1.95 - 0.14, s * 1.95 + 0.14, YARD_Y - 0.14, YARD_Y + 0.14, YARD_Z - 0.14, YARD_Z + 0.14, { shade: voxelShade });

	// ---- oars: a shaft and a blade in the owner's colour ---------------------------
	const OAR_OUT = 1.35;
	const oarBake = createBake(THREE);
	oarBake.box(DECK_A, -0.35, OAR_OUT - 0.25, -0.05, 0.05, -0.05, 0.05, { shade: voxelShade });
	oarBake.box(owner, OAR_OUT - 0.45, OAR_OUT + 0.05, -0.04, 0.04, -0.13, 0.13, { shade: voxelShade });
	const oarData = oarRestPose([-0.75, 0.3, 1.35], (z) => retroHalfWidth(Math.floor(z / U)) * U, () => RETRO_DECK_Y + UY * 0.6, OAR_OUT);

	// ---- meshes --------------------------------------------------------------------
	const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
	const group = new THREE.Group();
	group.name = 'longship';
	const hullMesh = new THREE.Mesh(hull.build(), mat);
	hullMesh.name = 'hull';
	group.add(hullMesh);
	const sailMesh = new THREE.Mesh(sail.build({ paint: true }), mat);
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
	group.userData.shipStyle = 'retro';
	group.userData.yardY = YARD_Y;
	group.userData.yardZ = YARD_Z;
	group.userData.triangles = hull.triangles() + sail.triangles() + oarBake.triangles() * oarData.length;
	return group;
}
