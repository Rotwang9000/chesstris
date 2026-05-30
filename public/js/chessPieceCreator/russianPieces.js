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

// ── KNIGHT — forward-leaning asymmetric horse head (6 source meshes) ─────────
export function createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 10;
	const coneSeg = isLocalPlayer ? 8 : 6;
	const HEAD_TILT = -0.5; // lean the muzzle forward + down

	part(THREE, group, new THREE.CylinderGeometry(0.20, 0.26, 0.10, seg), materials.primary, 0, 0.05, 0);
	part(THREE, group, new THREE.CylinderGeometry(0.16, 0.20, 0.26, seg), materials.primary, 0, 0.24, 0);

	// Head block — long front-to-back (x), narrower side-to-side (z),
	// tilted forward. The asymmetry (offset on +x) is the knight's identity.
	const head = part(THREE, group, new THREE.BoxGeometry(0.30, 0.20, 0.17), materials.primary, 0.08, 0.55, 0);
	head.rotation.z = HEAD_TILT;

	// Secondary muzzle cap at the front of the snout.
	const muzzle = part(THREE, group, new THREE.BoxGeometry(0.12, 0.10, 0.13), materials.secondary, 0.26, 0.50, 0);
	muzzle.rotation.z = HEAD_TILT;

	// Two accent ears on the top-back of the head.
	for (let side = -1; side <= 1; side += 2) {
		const ear = part(THREE, group, new THREE.ConeGeometry(0.03, 0.09, coneSeg), materials.accent, -0.02, 0.70, side * 0.06);
		ear.rotation.z = -0.15;
		ear.rotation.x = side * 0.18;
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
 * Per-type uniform size, encoding chess rank as scale — the oldest,
 * most legible "tell them apart at a glance" cue there is, and the one
 * the cute set was missing (every piece shared the same ~0.5-unit
 * footprint, so a field of one player's pieces read as identical green
 * blobs). Pawns shrink, royalty grows; the base stays seated on the
 * cell because every builder grows upward from y=0. Footprints stay
 * well inside a cell (max radius ≈ 0.28 × 1.24 ≈ 0.35 < 0.5).
 */
const PIECE_SIZE_BY_TYPE = Object.freeze({
	1: 0.82, // pawn   — clearly the smallest
	2: 0.96, // rook   — short and stout
	3: 1.02, // knight
	4: 1.08, // bishop — taller
	5: 1.16, // queen
	6: 1.24, // king   — towers over the rest
});

/**
 * Map a numeric piece type to the matching Russian builder, then apply
 * the per-type size cue. Defaults to pawn for unknown types. Returns a
 * single merged `THREE.Mesh` (not a group) — the renderer wraps it in an
 * outer pieceGroup, scales it, and clones it; a Mesh supports all of that.
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
	const size = PIECE_SIZE_BY_TYPE[pieceTypeNum] || PIECE_SIZE_BY_TYPE[1];
	piece.scale.setScalar(size);
	return piece;
}
