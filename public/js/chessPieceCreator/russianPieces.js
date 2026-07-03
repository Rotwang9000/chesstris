/**
 * Russian-themed chess pieces.
 *
 * Each builder assembles a handful of CORE-THREE primitives into a
 * transient `THREE.Group`, then bakes them down into a SINGLE merged
 * `THREE.Mesh` (one scene-graph node) via `mergeMeshesByMaterial`. The
 * old design was ~12 sub-meshes per piece; a graphics stress test showed
 * that per-piece NODE COUNT (not draw calls) was the dominant CPU cost,
 * so every piece is now both simpler AND collapsed to one node.
 *
 * Differentiation is by SILHOUETTE so a flat-colour piece is identifiable
 * at a glance: pawn = ball-on-stub, rook = flat crenellated tower, knight
 * = forward-leaning asymmetric horse head, bishop = tall smooth point,
 * queen = spiky coronet, king = cross. Per-type SIZE (see
 * `PIECE_SIZE_BY_TYPE`) reinforces chess rank (pawn smallest → king
 * largest). One shape per type serves both sides; local-player pieces only
 * get higher cylinder/sphere segment counts for smoothness — never a
 * different shape.
 *
 * The material trio is `primary` (body), `secondary` (a mid/cap feature)
 * and `accent` (topper/details). The merged mesh keeps a material array in
 * `[primary, secondary, accent]` order (unused entries dropped) so colours
 * and shadows render identically to the per-mesh version.
 */

import { getTHREE } from '../gameContext.js';
import { createSafeMaterials } from './materials.js';
import { mergeMeshesByMaterial } from './mergePiece.js';
import { pieceSizeFor } from './pieceSizes.js';
import { setPieceMatrixStatic } from '../pieceMatrixState.js';

function resolveMaterials(materialKey, customMaterials) {
	return customMaterials || createSafeMaterials(materialKey);
}

/**
 * Add a single-material mesh to `group` and return it so the caller can
 * tweak rotation/scale. Reused by every builder to keep them terse — the
 * merge step sets castShadow/receiveShadow on the final mesh, so source
 * meshes only need geometry, material and a transform.
 *
 * @param {object} THREE
 * @param {THREE.Group} group
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {number} [x]
 * @param {number} [y]
 * @param {number} [z]
 * @returns {THREE.Mesh}
 */
function part(THREE, group, geometry, material, x = 0, y = 0, z = 0) {
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(x, y, z);
	group.add(mesh);
	return mesh;
}

/**
 * Collapse a builder's transient group into one merged mesh using the
 * canonical material order. Shared by every builder.
 */
function finalise(THREE, group, materials) {
	return mergeMeshesByMaterial(
		THREE,
		group.children.filter(child => child.isMesh),
		[materials.primary, materials.secondary, materials.accent],
	);
}

// ── PAWN — a tiny ball-on-stub (3 source meshes) ─────────────────────────────
export function createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;
	const sphereSeg = isLocalPlayer ? 12 : 8;

	part(THREE, group, new THREE.CylinderGeometry(0.20, 0.26, 0.10, seg), materials.primary, 0, 0.05, 0);
	part(THREE, group, new THREE.CylinderGeometry(0.12, 0.18, 0.26, seg), materials.primary, 0, 0.23, 0);
	part(THREE, group, new THREE.SphereGeometry(0.13, sphereSeg, sphereSeg), materials.secondary, 0, 0.46, 0);

	return finalise(THREE, group, materials);
}

// ── ROOK — a flat crenellated castle tower (6 source meshes) ─────────────────
export function createRussianRookPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;

	part(THREE, group, new THREE.CylinderGeometry(0.22, 0.26, 0.12, seg), materials.primary, 0, 0.06, 0);
	// Straight wide tower — no taper — so the rook reads as blocky.
	part(THREE, group, new THREE.CylinderGeometry(0.20, 0.20, 0.40, seg), materials.primary, 0, 0.32, 0);

	const MERLON_COUNT = 4;
	for (let i = 0; i < MERLON_COUNT; i++) {
		const angle = (i / MERLON_COUNT) * Math.PI * 2;
		const merlon = part(
			THREE, group, new THREE.BoxGeometry(0.06, 0.12, 0.06), materials.accent,
			Math.cos(angle) * 0.17, 0.56, Math.sin(angle) * 0.17,
		);
		merlon.rotation.y = angle;
	}

	return finalise(THREE, group, materials);
}

// ── KNIGHT — an arched horse's head & neck (the classic chess knight) ────────
// Built as a side profile facing +x: a forward-leaning neck, a head that
// juts forward and tilts nose-down (the "poll" bend that says horse), a
// muzzle + jaw, pointed ears, and a mane ridge flowing down the back (-x).
export function createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;
	const coneSeg = isLocalPlayer ? 8 : 6;

	// Footed base, consistent with the rest of the set.
	part(THREE, group, new THREE.CylinderGeometry(0.20, 0.26, 0.10, seg), materials.primary, 0, 0.05, 0);

	// Chest + neck — a slim near-vertical column with a slight forward lean.
	const neck = part(THREE, group, new THREE.BoxGeometry(0.14, 0.44, 0.19), materials.primary, -0.02, 0.34, 0);
	neck.rotation.z = -0.12;

	// Head — a flatter horizontal bar jutting FORWARD (+x) off the top of
	// the neck, so the profile bends into a "7"/hook. The empty wedge below
	// it (in front of the neck) is the throat that says "horse", not "lump".
	const head = part(THREE, group, new THREE.BoxGeometry(0.32, 0.13, 0.15), materials.primary, 0.14, 0.61, 0);
	head.rotation.z = -0.14;

	// Muzzle — nose block dipping down at the very front (secondary tone).
	const muzzle = part(THREE, group, new THREE.BoxGeometry(0.12, 0.13, 0.13), materials.secondary, 0.31, 0.55, 0);
	muzzle.rotation.z = -0.30;

	// Jaw/cheek — a small wedge under the front of the head for a chin.
	const jaw = part(THREE, group, new THREE.BoxGeometry(0.10, 0.08, 0.13), materials.primary, 0.22, 0.53, 0);
	jaw.rotation.z = -0.22;

	// Ears — two pointed cones at the poll, leaning back and splayed.
	for (let side = -1; side <= 1; side += 2) {
		const ear = part(THREE, group, new THREE.ConeGeometry(0.035, 0.14, coneSeg), materials.accent, -0.02, 0.74, side * 0.05);
		ear.rotation.z = 0.2;
		ear.rotation.x = side * 0.2;
	}

	// Mane — a ridge of plates flowing down the back of the neck (-x); a
	// distinct secondary colour so it reads even where it hugs the neck,
	// with the upper crest protruding furthest behind the poll.
	const MANE_PLATES = 4;
	for (let i = 0; i < MANE_PLATES; i++) {
		const t = i / (MANE_PLATES - 1);
		const plate = part(
			THREE, group, new THREE.BoxGeometry(0.08, 0.16, 0.18), materials.secondary,
			-0.13 - (1 - t) * 0.04, 0.62 - t * 0.36, 0,
		);
		plate.rotation.z = -0.12;
	}

	return finalise(THREE, group, materials);
}

// ── BISHOP — a tall smooth point (4 source meshes) ───────────────────────────
export function createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;
	const sphereSeg = isLocalPlayer ? 12 : 8;

	part(THREE, group, new THREE.CylinderGeometry(0.20, 0.26, 0.12, seg), materials.primary, 0, 0.06, 0);
	// Tall smooth cone body — the bishop's defining silhouette.
	part(THREE, group, new THREE.ConeGeometry(0.18, 0.55, seg), materials.primary, 0, 0.45, 0);

	// Thin secondary slit — the classic mitre cut on the front face.
	const slit = part(THREE, group, new THREE.BoxGeometry(0.03, 0.16, 0.04), materials.secondary, 0.06, 0.52, 0);
	slit.rotation.z = -0.30;

	// Accent finial on the very top.
	part(THREE, group, new THREE.SphereGeometry(0.05, sphereSeg, sphereSeg), materials.accent, 0, 0.78, 0);

	return finalise(THREE, group, materials);
}

// ── QUEEN — a tall spiky coronet, no cross (10 source meshes) ────────────────
export function createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;
	const coneSeg = isLocalPlayer ? 8 : 6;
	const sphereSeg = isLocalPlayer ? 12 : 8;

	part(THREE, group, new THREE.CylinderGeometry(0.21, 0.26, 0.12, seg), materials.primary, 0, 0.06, 0);
	part(THREE, group, new THREE.CylinderGeometry(0.14, 0.18, 0.40, seg), materials.primary, 0, 0.30, 0);
	// Secondary coronet band.
	part(THREE, group, new THREE.CylinderGeometry(0.20, 0.20, 0.08, seg), materials.secondary, 0, 0.55, 0);

	// Ring of accent points — the spiky coronet.
	const POINT_COUNT = 6;
	for (let i = 0; i < POINT_COUNT; i++) {
		const angle = (i / POINT_COUNT) * Math.PI * 2;
		part(
			THREE, group, new THREE.ConeGeometry(0.035, 0.14, coneSeg), materials.accent,
			Math.cos(angle) * 0.15, 0.66, Math.sin(angle) * 0.15,
		);
	}

	// Accent centre jewel.
	part(THREE, group, new THREE.SphereGeometry(0.045, sphereSeg, sphereSeg), materials.accent, 0, 0.74, 0);

	return finalise(THREE, group, materials);
}

// ── KING — the tallest column topped with an unmistakable cross (5 meshes) ───
export function createRussianKingPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;

	part(THREE, group, new THREE.CylinderGeometry(0.23, 0.28, 0.12, seg), materials.primary, 0, 0.06, 0);
	// Tallest column of the set.
	part(THREE, group, new THREE.CylinderGeometry(0.15, 0.19, 0.44, seg), materials.primary, 0, 0.33, 0);
	// Secondary crown band.
	part(THREE, group, new THREE.CylinderGeometry(0.21, 0.19, 0.10, seg), materials.secondary, 0, 0.58, 0);

	// Accent cross — vertical bar + horizontal bar.
	part(THREE, group, new THREE.BoxGeometry(0.04, 0.26, 0.04), materials.accent, 0, 0.76, 0);
	part(THREE, group, new THREE.BoxGeometry(0.16, 0.04, 0.04), materials.accent, 0, 0.82, 0);

	return finalise(THREE, group, materials);
}

/**
 * Map a numeric piece type to the matching Russian builder, then apply
 * the per-type size cue (shared `pieceSizeFor`). Defaults to pawn for
 * unknown types. Returns a single merged `THREE.Mesh` (not a group) —
 * the renderer wraps it in an outer pieceGroup, scales it, and clones
 * it; a Mesh supports all of that.
 */
export function buildRussianPiece(pieceTypeNum, materialKey, isLocalPlayer, customMaterials = null) {
	let piece;
	switch (pieceTypeNum) {
		case 6: piece = createRussianKingPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 5: piece = createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 4: piece = createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 3: piece = createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 2: piece = createRussianRookPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 1:
		default: piece = createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials); break;
	}
	piece.scale.setScalar(pieceSizeFor(pieceTypeNum));
	// The merged body mesh never moves relative to its outer piece group,
	// so freeze its local matrix for life (static-pieces optimisation).
	setPieceMatrixStatic(piece, true);
	return piece;
}
