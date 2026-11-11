/**
 * Retro CRT-style letter pieces and cute character pieces.
 *
 * These are the two non-Russian renderings of chess pieces. They share
 * very little with the detailed Russian set, so they live in their own
 * file to keep the main module focused on the imperial geometry.
 *
 * Cute mode is the LOW-SPEC / fast profile, so each cute piece is baked
 * into a single vertex-coloured mesh (one outer group for userData and
 * highlights), and is told apart by its body shape and a big topper —
 * see `createCutePiece`.
 */

import { mergeMeshesByVertexColour } from './mergePiece.js';
import { pieceSizeFor } from './pieceSizes.js';
import { setPieceMatrixStatic } from '../pieceMatrixState.js';

// Cyrillic single-letter initials in the style of the Russian original
// Tetris chess set. Direct translations chosen to avoid two pieces
// sharing the same letter:
//   К (Korol')   — King
//   Ф (Ferz')    — Queen / Vizier
//   Г (Grach)    — Rook (literally "rook bird", avoids Л clash with Knight)
//   С (Slon)     — Bishop (elephant)
//   Л (Loshad')  — Knight (horse)
//   П (Peshka)   — Pawn
const RETRO_PIECE_LETTERS = {
	6: '\u041A', // К
	5: '\u0424', // Ф
	4: '\u0421', // С
	3: '\u041B', // Л
	2: '\u0413', // Г
	1: '\u041F', // П
};

// 8-bit colour palette per piece type — bright arcade colours.
const CUTE_PIECE_COLOURS = {
	6: 0xFFD700,
	5: 0xFF69B4,
	4: 0x8B5CF6,
	3: 0x22D3EE,
	2: 0xF97316,
	1: 0x4ADE80,
};

/**
 * Create a flat letter-on-disc piece for retro/CRT mode.
 * Green phosphor for the local player, amber for opponents.
 */
export function createRetroLetterPiece(THREE, pieceTypeNum, pieceTypeName, player, x, z, isLocalPlayer, customColor) {
	const group = new THREE.Group();

	const discColor = 0x0A0A0A;
	const rimColor = customColor || (isLocalPlayer ? 0x00FF00 : 0xFF8800);
	const letterFill = '#FFFFFF';
	const letterStroke = customColor
		? `#${Number(customColor).toString(16).padStart(6, '0')}`
		: (isLocalPlayer ? '#00FF00' : '#FF8800');

	const discGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.10, 16);
	const discMat = new THREE.MeshBasicMaterial({ color: discColor, transparent: false });
	const disc = new THREE.Mesh(discGeo, discMat);
	disc.position.y = 0.05;
	group.add(disc);

	const rimGeo = new THREE.TorusGeometry(0.34, 0.04, 6, 20);
	const rimMat = new THREE.MeshBasicMaterial({ color: rimColor });
	const rim = new THREE.Mesh(rimGeo, rimMat);
	rim.rotation.x = -Math.PI / 2;
	rim.position.y = 0.10;
	group.add(rim);

	const letter = RETRO_PIECE_LETTERS[pieceTypeNum] || '?';
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, 128, 128);
	ctx.font = 'bold 96px monospace';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.strokeStyle = letterStroke;
	ctx.lineWidth = 14;
	ctx.strokeText(letter, 64, 64);
	ctx.fillStyle = letterFill;
	ctx.fillText(letter, 64, 64);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const spriteMat = new THREE.SpriteMaterial({
		map: texture, transparent: true, depthTest: true, depthWrite: false,
	});
	const sprite = new THREE.Sprite(spriteMat);
	sprite.scale.set(0.75, 0.75, 1);
	sprite.position.y = 0.55;
	group.add(sprite);

	if (pieceTypeNum >= 5) {
		const ringGeo = new THREE.TorusGeometry(0.26, 0.025, 6, 16);
		const ringMat = new THREE.MeshBasicMaterial({ color: rimColor });
		const ring = new THREE.Mesh(ringGeo, ringMat);
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.10;
		group.add(ring);
	}

	group.userData = {
		type: 'chess',
		pieceType: pieceTypeName,
		pieceTypeNum,
		player,
		position: { x, z },
		originalPosition: { x, z },
		color: customColor,
		retroMode: true,
	};
	group.visible = true;
	return group;
}

/**
 * Cute-mode chess piece: a chubby little character whose BODY SHAPE and
 * big TOPPER say what it is, with a face for charm.
 *
 *   pawn   — round ball in a bobble hat
 *   rook   — a squat castle tower with battlements
 *   knight — a pony head: long snout, tall ears, a mane down the back
 *   bishop — a tall egg in a pointed mitre with a slit
 *   queen  — round, wearing a gold tiara of beaded spikes and a jewel
 *   king   — the biggest, in a gold crown topped with a cross
 *
 * Size is rank-scaled via the shared `PIECE_SIZE_BY_TYPE`, like the
 * normal set. Cute is the LOW-SPEC / fast profile, so every part is
 * baked into ONE merged mesh with ONE vertex-coloured Lambert material:
 * one node and one draw call per piece, however many colour details
 * (eye sparkles, blush, trim) it carries.
 */
export function createCutePiece(THREE, pieceTypeNum, pieceTypeName, player, x, z, isLocalPlayer, customColor) {
	const baseCol = customColor || CUTE_PIECE_COLOURS[pieceTypeNum] || 0xffffff;
	// Local pieces get smoother primitives; opponents stay coarse to keep
	// big crowds cheap.
	const seg = isLocalPlayer ? 16 : 10;

	// Colour carriers only — the merge reads `.color` and drops them.
	const paint = hex => ({ color: new THREE.Color(hex) });
	const P = {
		body: paint(baseCol),
		trim: paint(lightenColour(baseCol, 0.5)),
		dark: paint(lightenColour(baseCol, -0.35)),
		gold: paint(0xFFC83D),
		goldDeep: paint(0xE39B1B),
		face: paint(0x23161f),
		white: paint(0xffffff),
		blush: paint(0xFF8FA3),
		jewel: paint(0xE8366B),
	};

	const builder = new THREE.Group();
	const part = (geometry, p, px = 0, py = 0, pz = 0) => {
		const mesh = new THREE.Mesh(geometry, p);
		mesh.position.set(px, py, pz);
		builder.add(mesh);
		return mesh;
	};
	const sphere = (r, ws = seg, hs = Math.max(6, seg - 4)) => new THREE.SphereGeometry(r, ws, hs);
	const kit = { THREE, part, sphere, P, seg };

	// A chunky two-tone plinth common to every piece.
	part(new THREE.CylinderGeometry(0.3, 0.33, 0.09, seg), P.dark, 0, 0.045, 0);
	part(new THREE.CylinderGeometry(0.27, 0.3, 0.03, seg), P.trim, 0, 0.1, 0);

	const build = CUTE_BUILDERS[pieceTypeNum] || CUTE_BUILDERS[1];
	build(kit);

	const merged = mergeMeshesByVertexColour(
		THREE,
		builder.children.filter(child => child.isMesh),
		new THREE.MeshLambertMaterial({ color: 0xffffff }),
	);
	merged.scale.setScalar(pieceSizeFor(pieceTypeNum));
	// The merged body mesh never moves relative to its outer group, so
	// freeze its local matrix for life (static-pieces optimisation).
	setPieceMatrixStatic(merged, true);

	const group = new THREE.Group();
	group.add(merged);
	group.userData = {
		type: 'chess',
		pieceType: pieceTypeName,
		pieceTypeNum,
		player,
		position: { x, z },
		originalPosition: { x, z },
		color: customColor,
		cuteMode: true,
	};
	group.visible = true;
	return group;
}

/**
 * A face on the front (+z) of a body. `surfaceZ(x, y)` gives the body's
 * front surface depth at that point so features sit ON the curve.
 */
function addFace({ THREE, part, P }, surfaceZ, eyeY, eyeGap, { smile = true, blush = true } = {}) {
	for (let side = -1; side <= 1; side += 2) {
		const ex = side * eyeGap;
		const ez = surfaceZ(ex, eyeY);
		part(new THREE.SphereGeometry(0.046, 10, 8), P.face, ex, eyeY, ez - 0.012).scale.set(0.85, 1.1, 0.55);
		part(new THREE.SphereGeometry(0.016, 6, 5), P.white, ex + 0.012, eyeY + 0.018, ez + 0.008);
		if (blush) {
			const bx = side * (eyeGap + 0.065);
			const by = eyeY - 0.065;
			part(new THREE.SphereGeometry(0.04, 8, 6), P.blush, bx, by, surfaceZ(bx, by) - 0.008).scale.set(1, 0.6, 0.35);
		}
	}
	if (smile) {
		const my = eyeY - 0.08;
		const mouth = part(new THREE.TorusGeometry(0.04, 0.011, 5, 10, Math.PI), P.face, 0, my, surfaceZ(0, my) - 0.002);
		mouth.rotation.z = Math.PI;
	}
}

function sphereSurface(r, cy, sy = 1) {
	return (px, py) => {
		const dy = (py - cy) / sy;
		return Math.sqrt(Math.max(0.0001, r * r - px * px - dy * dy));
	};
}

/** Stubby arms on the sides of a round body. */
function addArms({ part, sphere, P }, r, y) {
	for (let side = -1; side <= 1; side += 2) {
		part(sphere(0.065, 8, 6), P.body, side * (r + 0.01), y, 0.05).scale.set(0.75, 0.95, 0.8);
	}
}

const CUTE_BUILDERS = {
	// Pawn — round ball in a bobble hat.
	1(kit) {
		const { THREE, part, sphere, P, seg } = kit;
		part(sphere(0.24), P.body, 0, 0.33, 0);
		addArms(kit, 0.22, 0.28);
		addFace(kit, sphereSurface(0.24, 0.33), 0.35, 0.085);
		// Beanie, turned-up brim and bobble.
		part(new THREE.SphereGeometry(0.2, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2), P.trim, 0, 0.47, 0)
			.scale.set(1, 0.7, 1);
		part(new THREE.TorusGeometry(0.19, 0.03, 6, seg), P.dark, 0, 0.47, 0).rotation.x = Math.PI / 2;
		part(sphere(0.06, 8, 6), P.gold, 0, 0.63, 0);
	},

	// Rook — a squat castle tower with battlements.
	2(kit) {
		const { THREE, part, P, seg } = kit;
		part(new THREE.CylinderGeometry(0.24, 0.26, 0.4, seg), P.body, 0, 0.31, 0);
		// Brick courses.
		part(new THREE.CylinderGeometry(0.262, 0.262, 0.025, seg), P.dark, 0, 0.18, 0);
		addFace(kit, (px) => Math.sqrt(Math.max(0.0001, 0.25 * 0.25 - px * px)), 0.34, 0.085);
		// Parapet and six chunky merlons.
		part(new THREE.CylinderGeometry(0.29, 0.25, 0.08, seg), P.trim, 0, 0.55, 0);
		const MERLONS = 6;
		for (let i = 0; i < MERLONS; i++) {
			const angle = (i / MERLONS) * Math.PI * 2 + Math.PI / 6;
			const merlon = part(new THREE.BoxGeometry(0.13, 0.12, 0.09), P.trim,
				Math.cos(angle) * 0.235, 0.65, Math.sin(angle) * 0.235);
			merlon.rotation.y = -angle + Math.PI / 2;
		}
		part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, seg), P.dark, 0, 0.6, 0);
	},

	// Knight — a pony head with a long snout, tall ears and a mane.
	3(kit) {
		const { THREE, part, sphere, P } = kit;
		const headR = 0.23;
		const headY = 0.38;
		part(sphere(headR), P.body, 0, headY, -0.02).scale.set(1, 1.05, 1.05);
		// Snout sticking out the front, with nostrils.
		part(sphere(0.15), P.trim, 0, 0.28, 0.17).scale.set(0.95, 0.78, 1.25);
		for (let side = -1; side <= 1; side += 2) {
			part(sphere(0.022, 6, 5), P.face, side * 0.055, 0.3, 0.355);
		}
		addFace(kit, (px, py) => sphereSurface(headR, headY, 1.05)(px, py) - 0.02, 0.45, 0.1,
			{ smile: false, blush: true });
		// Tall pointy ears with pale insides.
		for (let side = -1; side <= 1; side += 2) {
			const ear = part(new THREE.ConeGeometry(0.065, 0.2, 8), P.body, side * 0.12, 0.64, -0.04);
			ear.rotation.z = -side * 0.25;
			const inner = part(new THREE.ConeGeometry(0.035, 0.13, 6), P.trim, side * 0.118, 0.63, -0.005);
			inner.rotation.z = -side * 0.25;
		}
		// Mane — a row of dark tufts from the forehead down the back.
		const TUFTS = 5;
		for (let i = 0; i < TUFTS; i++) {
			const t = i / (TUFTS - 1);
			const a = (0.15 + t * 1.25);
			part(sphere(0.075 - t * 0.012, 8, 6), P.dark,
				0, headY + Math.cos(a) * 0.25, -0.02 - Math.sin(a) * 0.26);
		}
	},

	// Bishop — a tall egg in a pointed mitre with a slit.
	4(kit) {
		const { THREE, part, sphere, P, seg } = kit;
		part(sphere(0.22), P.body, 0, 0.33, 0).scale.set(1, 1.12, 1);
		addArms(kit, 0.2, 0.28);
		addFace(kit, sphereSurface(0.22, 0.33, 1.12), 0.34, 0.08);
		// Mitre: gold band, tall pale cone, dark slit, gold bead.
		part(new THREE.CylinderGeometry(0.19, 0.2, 0.05, seg), P.gold, 0, 0.53, 0);
		part(new THREE.ConeGeometry(0.185, 0.36, seg), P.trim, 0, 0.73, 0);
		const slit = part(new THREE.BoxGeometry(0.035, 0.2, 0.05), P.dark, 0, 0.69, 0.1);
		slit.rotation.x = -0.48;
		part(sphere(0.045, 8, 6), P.gold, 0, 0.93, 0);
	},

	// Queen — round, wearing a gold tiara of beaded spikes and a jewel.
	5(kit) {
		const { THREE, part, sphere, P, seg } = kit;
		part(sphere(0.25), P.body, 0, 0.34, 0);
		addArms(kit, 0.23, 0.29);
		addFace(kit, sphereSurface(0.25, 0.34), 0.36, 0.09);
		part(new THREE.CylinderGeometry(0.18, 0.19, 0.07, seg), P.gold, 0, 0.57, 0);
		const SPIKES = 7;
		for (let i = 0; i < SPIKES; i++) {
			const angle = (i / SPIKES) * Math.PI * 2 + Math.PI / 2;
			const r = 0.17;
			part(new THREE.ConeGeometry(0.04, 0.15, 6), P.gold, Math.cos(angle) * r, 0.67, Math.sin(angle) * r);
			part(sphere(0.032, 8, 6), P.white, Math.cos(angle) * r, 0.755, Math.sin(angle) * r);
		}
		part(new THREE.OctahedronGeometry(0.05), P.jewel, 0, 0.575, 0.19).scale.set(1, 1.3, 0.6);
	},

	// King — the biggest, in a gold crown topped with a cross.
	6(kit) {
		const { THREE, part, sphere, P, seg } = kit;
		part(sphere(0.26), P.body, 0, 0.35, 0);
		addArms(kit, 0.24, 0.3);
		addFace(kit, sphereSurface(0.26, 0.35), 0.37, 0.095);
		// Crown: band, four points, velvet cap and a cross.
		part(new THREE.CylinderGeometry(0.2, 0.19, 0.13, seg, 1, true), P.gold, 0, 0.62, 0);
		part(new THREE.TorusGeometry(0.195, 0.022, 6, seg), P.goldDeep, 0, 0.56, 0).rotation.x = Math.PI / 2;
		part(sphere(0.165), P.jewel, 0, 0.64, 0).scale.set(1, 0.75, 1);
		const POINTS = 4;
		for (let i = 0; i < POINTS; i++) {
			const angle = (i / POINTS) * Math.PI * 2 + Math.PI / 4;
			part(new THREE.ConeGeometry(0.055, 0.14, 4), P.gold, Math.cos(angle) * 0.19, 0.75, Math.sin(angle) * 0.19);
		}
		part(new THREE.OctahedronGeometry(0.045), P.jewel, 0, 0.62, 0.2).scale.set(1, 1.3, 0.6);
		part(sphere(0.035, 8, 6), P.gold, 0, 0.77, 0);
		part(new THREE.BoxGeometry(0.05, 0.18, 0.05), P.gold, 0, 0.87, 0);
		part(new THREE.BoxGeometry(0.14, 0.05, 0.05), P.gold, 0, 0.9, 0);
	},
};

function lightenColour(hex, amount) {
	const r = (hex >> 16) & 0xff;
	const g = (hex >> 8) & 0xff;
	const b = hex & 0xff;
	const blend = amount >= 0 ? 255 : 0;
	const t = Math.min(1, Math.abs(amount));
	const nr = Math.round(r + (blend - r) * t);
	const ng = Math.round(g + (blend - g) * t);
	const nb = Math.round(b + (blend - b) * t);
	return (nr << 16) | (ng << 8) | nb;
}
