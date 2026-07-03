/**
 * Retro CRT-style letter pieces and cute rounded "matryoshka" pieces.
 *
 * These are the two non-Russian renderings of chess pieces. They share
 * very little with the detailed Russian set, so they live in their own
 * file to keep the main module focused on the imperial geometry.
 *
 * Cute mode is the LOW-SPEC / fast profile, so each cute piece is baked
 * into a single merged mesh (one outer group for userData/highlights)
 * exactly like the Russian set, and is differentiated by rank-scaled
 * SIZE + a distinct topper — see `createCutePiece`.
 */

import { mergeMeshesByMaterial } from './mergePiece.js';
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
 * Cute-mode chess piece: a friendly rounded "matryoshka" body with a
 * face and a per-type topper.
 *
 * Differentiation uses the two strongest read-at-a-glance cues, the same
 * ones the normal Russian set relies on:
 *   - SIZE   — rank-scaled via the shared `PIECE_SIZE_BY_TYPE` (pawn
 *              smallest … king largest), the cue the cute set was
 *              missing (every piece previously shared one footprint);
 *   - TOPPER — crown / tiara / mitre / pony-ears / battlements / bobble.
 * The face keeps the cute character without affecting recognition.
 *
 * Cute is the LOW-SPEC / fast profile, so the piece is built from a few
 * primitives in a transient group and then BAKED into a single merged
 * mesh (wrapped in one outer group for userData + highlights) — the same
 * one-node-per-piece shape as `buildRussianPiece`. Previously each cute
 * piece was ~12 live scene-graph nodes, i.e. heavier than the "high
 * quality" mode it is meant to undercut.
 *
 * Exactly FIVE materials are used so the merge stays cheap: body (player
 * colour), trim (lighter), dark (shade), accent (gold topper) and face
 * (flat black). They are passed to the merge in a fixed order; unused
 * entries (e.g. `dark` on non-knights) are dropped automatically.
 */
export function createCutePiece(THREE, pieceTypeNum, pieceTypeName, player, x, z, isLocalPlayer, customColor) {
	const builder = new THREE.Group();
	const baseCol = customColor || CUTE_PIECE_COLOURS[pieceTypeNum] || 0xffffff;
	// Local pieces get smoother primitives; opponents stay coarse to keep
	// big crowds cheap. Lower than the old 16/10 — cute is the fast mode.
	const seg = isLocalPlayer ? 14 : 9;

	const bodyMat = new THREE.MeshLambertMaterial({ color: baseCol });
	const trimMat = new THREE.MeshLambertMaterial({ color: lightenColour(baseCol, 0.4) });
	const darkMat = new THREE.MeshLambertMaterial({ color: lightenColour(baseCol, -0.25) });
	const accentMat = new THREE.MeshLambertMaterial({ color: 0xFFE07A });
	const faceMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
	const materials = [bodyMat, trimMat, darkMat, accentMat, faceMat];

	const part = (geometry, material, px = 0, py = 0, pz = 0) => {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(px, py, pz);
		builder.add(mesh);
		return mesh;
	};

	// Disc base + rounded body — common to every piece.
	part(new THREE.CylinderGeometry(0.30, 0.34, 0.10, seg), trimMat, 0, 0.05, 0);
	part(new THREE.SphereGeometry(0.30, seg, Math.max(8, seg - 2)), bodyMat, 0, 0.38, 0)
		.scale.setScalar(1.05);

	// Face — two oval eyes + a smile.
	for (let side = -1; side <= 1; side += 2) {
		part(new THREE.SphereGeometry(0.040, 8, 6), faceMat, side * 0.10, 0.45, 0.27)
			.scale.set(0.85, 1.0, 0.6);
	}
	part(new THREE.TorusGeometry(0.06, 0.013, 6, 12, Math.PI), faceMat, 0, 0.37, 0.275)
		.rotation.z = Math.PI;

	// Tiny stubby arms so the body doesn't feel inert.
	for (let side = -1; side <= 1; side += 2) {
		part(new THREE.SphereGeometry(0.06, 6, 5), bodyMat, side * 0.30, 0.34, 0.04)
			.scale.set(0.7, 0.9, 0.7);
	}

	addCuteTopper(THREE, part, pieceTypeNum, { bodyMat, trimMat, darkMat, accentMat }, seg);

	const merged = mergeMeshesByMaterial(
		THREE,
		builder.children.filter(child => child.isMesh),
		materials,
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
 * Append the per-type topper meshes to a cute piece's transient builder
 * group via the supplied `part(geometry, material, x, y, z)` helper.
 * Only the four lit materials are used here (the face material is for
 * eyes/mouth); every mesh must use one of them so the later merge can
 * map it to a material group.
 */
function addCuteTopper(THREE, part, pieceTypeNum, mats, seg) {
	const { bodyMat, trimMat, darkMat, accentMat } = mats;
	switch (pieceTypeNum) {
		case 6: { // King — five-point crown topped with a cross.
			part(new THREE.CylinderGeometry(0.16, 0.20, 0.08, 5), accentMat, 0, 0.66, 0);
			for (let i = 0; i < 5; i++) {
				const angle = (i / 5) * Math.PI * 2;
				part(new THREE.ConeGeometry(0.04, 0.10, 4), accentMat, Math.cos(angle) * 0.16, 0.74, Math.sin(angle) * 0.16);
			}
			part(new THREE.BoxGeometry(0.04, 0.10, 0.04), accentMat, 0, 0.85, 0);
			part(new THREE.BoxGeometry(0.08, 0.03, 0.04), accentMat, 0, 0.86, 0);
			break;
		}
		case 5: { // Queen — half-torus tiara with a single jewel.
			part(new THREE.TorusGeometry(0.14, 0.025, 6, 16, Math.PI), accentMat, 0, 0.66, 0)
				.rotation.x = -Math.PI / 2;
			part(new THREE.OctahedronGeometry(0.05), accentMat, 0, 0.70, 0.10);
			break;
		}
		case 4: { // Bishop — tall pointed mitre with a slit.
			part(new THREE.ConeGeometry(0.16, 0.30, seg), bodyMat, 0, 0.74, 0);
			part(new THREE.BoxGeometry(0.04, 0.16, 0.045), trimMat, 0, 0.74, 0.15);
			break;
		}
		case 3: { // Knight — snout, pony ears and a backward mane.
			part(new THREE.SphereGeometry(0.10, seg, 8), trimMat, 0, 0.40, 0.34)
				.scale.set(1.0, 0.7, 1.2);
			for (let side = -1; side <= 1; side += 2) {
				part(new THREE.ConeGeometry(0.05, 0.12, 8), bodyMat, side * 0.10, 0.66, 0.05)
					.rotation.z = side * 0.25;
				part(new THREE.ConeGeometry(0.025, 0.07, 6), trimMat, side * 0.10, 0.67, 0.07)
					.rotation.z = side * 0.25;
			}
			for (let i = -1; i <= 1; i += 2) {
				const mane = part(new THREE.ConeGeometry(0.04, 0.18, 6), darkMat, i * 0.06, 0.58, -0.16);
				mane.rotation.x = 0.6;
				mane.rotation.z = i * 0.3;
			}
			break;
		}
		case 2: { // Rook — crenellated battlement ring.
			part(new THREE.CylinderGeometry(0.18, 0.18, 0.10, seg), bodyMat, 0, 0.66, 0);
			for (let i = 0; i < 4; i++) {
				const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
				part(new THREE.BoxGeometry(0.06, 0.08, 0.06), bodyMat, Math.cos(angle) * 0.13, 0.74, Math.sin(angle) * 0.13);
			}
			break;
		}
		default: { // Pawn — tiny bobble cap.
			part(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 6), accentMat, 0, 0.66, 0);
			part(new THREE.SphereGeometry(0.06, 8, 6), accentMat, 0, 0.74, 0);
			break;
		}
	}
}

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
