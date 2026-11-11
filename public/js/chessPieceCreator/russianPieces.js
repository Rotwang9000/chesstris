/**
 * Normal-profile chess pieces — a turned, Staunton-style set.
 *
 * Every round piece is a single `LatheGeometry` spun from a hand-tuned
 * profile (a weighted foot, a tapering stem, collars and a head), so the
 * set reads like real turned wood rather than stacked primitives. The
 * knight is an extruded, bevelled horse-head silhouette on a turned
 * plinth. Small extras (rook battlements, bishop's mitre cut, queen's
 * coronet, king's cross, knight's mane and eyes) are separate primitives.
 *
 * Each builder assembles those parts in a transient `THREE.Group`, then
 * bakes them into ONE merged `THREE.Mesh` via `mergeMeshesByMaterial` —
 * per-piece scene-graph node count was the dominant CPU cost in the
 * graphics stress test, so a piece is always a single node.
 *
 * Differentiation is by SILHOUETTE first (pawn ball, rook battlements,
 * knight head, bishop mitre, queen coronet, king cross) and SIZE second
 * (`PIECE_SIZE_BY_TYPE`). One shape per type serves both sides; local
 * pieces only get more lathe segments for smoothness.
 *
 * Materials are `primary` (body), `secondary` (collars, mitre cut, mane,
 * eyes) and `accent` (finials, coronet, cross). The merged mesh keeps the
 * `[primary, secondary, accent]` order (unused entries dropped).
 */

import { getTHREE } from '../gameContext.js';
import { createSafeMaterials } from './materials.js';
import { mergeMeshesByMaterial } from './mergePiece.js';
import { pieceSizeFor } from './pieceSizes.js';
import { setPieceMatrixStatic } from '../pieceMatrixState.js';

function resolveMaterials(materialKey, customMaterials) {
	return customMaterials || createSafeMaterials(materialKey);
}

function part(THREE, group, geometry, material, x = 0, y = 0, z = 0) {
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(x, y, z);
	group.add(mesh);
	return mesh;
}

function finalise(THREE, group, materials) {
	return mergeMeshesByMaterial(
		THREE,
		group.children.filter(child => child.isMesh),
		[materials.primary, materials.secondary, materials.accent],
	);
}

// ── Profile helpers ─────────────────────────────────────────────────────────

/** Points on a circular arc (radius, height) from angle a0 to a1 (degrees). */
function arc(cx, cy, r, a0, a1, steps) {
	const out = [];
	for (let i = 0; i <= steps; i++) {
		const a = (a0 + (a1 - a0) * (i / steps)) * Math.PI / 180;
		out.push([Math.max(0, cx + Math.cos(a) * r), cy + Math.sin(a) * r]);
	}
	return out;
}

/**
 * The weighted, moulded foot every piece stands on. Returns profile
 * points from the axis out to the rim and back in to the stem start.
 */
function foot(r) {
	return [
		[0, 0],
		[r - 0.01, 0],
		[r, 0.012],
		[r + 0.004, 0.03],
		[r - 0.008, 0.048],
		[r - 0.04, 0.06],
		[r - 0.03, 0.075],
		[r - 0.035, 0.088],
		[r - 0.065, 0.1],
	];
}

/** A raised collar ring at height y (outer radius r, stem radius s). */
function collar(y, r, s) {
	return [
		[s + 0.01, y],
		[r - 0.01, y + 0.004],
		[r, y + 0.016],
		[r - 0.01, y + 0.028],
		[s + 0.015, y + 0.034],
	];
}

function lathe(THREE, points, segments) {
	return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

function segmentsFor(isLocalPlayer) {
	return isLocalPlayer ? 28 : 18;
}

// ── PAWN — the classic ball on a collared stem ───────────────────────────────
export function createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = segmentsFor(isLocalPlayer);

	part(THREE, group, lathe(THREE, [
		...foot(0.26),
		[0.17, 0.12], [0.135, 0.17], [0.11, 0.24], [0.098, 0.31],
		[0.088, 0.33], [0.08, 0.36],
		...arc(0, 0.47, 0.125, -50, 90, 10),
	], seg), materials.primary);
	// Darker collar ring so the neck reads at a distance.
	part(THREE, group, lathe(THREE, collar(0.315, 0.155, 0.085), seg), materials.secondary);

	return finalise(THREE, group, materials);
}

// ── ROOK — a stout tower with a hollow, crenellated top ──────────────────────
export function createRussianRookPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = segmentsFor(isLocalPlayer);

	part(THREE, group, lathe(THREE, [
		...foot(0.27),
		[0.19, 0.125], [0.165, 0.17], [0.152, 0.26], [0.15, 0.40],
		[0.16, 0.44], [0.19, 0.47], [0.205, 0.49], [0.205, 0.58],
		[0.145, 0.58], [0.145, 0.54], [0, 0.54],
	], seg), materials.primary);
	// Dark band under the parapet.
	part(THREE, group, lathe(THREE, [[0.15, 0.405], [0.168, 0.41], [0.175, 0.425], [0.168, 0.44], [0.155, 0.445]], seg), materials.secondary);

	// Six merlons standing on the parapet rim.
	const MERLONS = 6;
	for (let i = 0; i < MERLONS; i++) {
		const angle = (i / MERLONS) * Math.PI * 2;
		const merlon = part(
			THREE, group, new THREE.BoxGeometry(0.06, 0.075, 0.1), materials.primary,
			Math.cos(angle) * 0.175, 0.6175, Math.sin(angle) * 0.175,
		);
		merlon.rotation.y = -angle;
	}

	return finalise(THREE, group, materials);
}

// ── KNIGHT — a bevelled horse head on a turned plinth ────────────────────────
// Side profile faces +x: chest, a curved throat, jaw, a long muzzle, the
// forehead, a pointed ear, and a crested mane running down the back.
export function createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = segmentsFor(isLocalPlayer);
	const curveSegments = isLocalPlayer ? 8 : 5;

	part(THREE, group, lathe(THREE, [
		...foot(0.27),
		[0.2, 0.12], [0.205, 0.135], [0.19, 0.15], [0, 0.15],
	], seg), materials.primary);

	const head = new THREE.Shape();
	head.moveTo(-0.16, 0.14);
	head.lineTo(0.15, 0.14);
	head.quadraticCurveTo(0.17, 0.27, 0.085, 0.36);       // chest into the throat
	head.quadraticCurveTo(0.06, 0.41, 0.13, 0.44);        // throat to jaw
	head.quadraticCurveTo(0.22, 0.455, 0.27, 0.495);      // under the jaw
	head.quadraticCurveTo(0.305, 0.545, 0.265, 0.585);    // muzzle and nose
	head.quadraticCurveTo(0.17, 0.655, 0.095, 0.725);     // face up to the brow
	head.lineTo(0.07, 0.815);                             // front of the ear
	head.lineTo(0.035, 0.86);                             // ear tip
	head.quadraticCurveTo(0.0, 0.8, -0.05, 0.765);        // back of the ear
	head.quadraticCurveTo(-0.155, 0.725, -0.185, 0.58);   // poll
	head.quadraticCurveTo(-0.215, 0.42, -0.195, 0.28);    // back of the neck
	head.quadraticCurveTo(-0.185, 0.19, -0.16, 0.14);
	const depth = 0.11;
	const headGeo = new THREE.ExtrudeGeometry(head, {
		depth,
		bevelEnabled: true,
		bevelThickness: 0.035,
		bevelSize: 0.028,
		bevelSegments: isLocalPlayer ? 3 : 2,
		curveSegments,
	});
	headGeo.translate(0, 0, -depth / 2);
	part(THREE, group, headGeo, materials.primary);

	// Mane — a darker crest proud of the neck on both sides.
	const mane = new THREE.Shape();
	mane.moveTo(-0.04, 0.79);
	mane.quadraticCurveTo(-0.18, 0.76, -0.225, 0.58);
	mane.quadraticCurveTo(-0.25, 0.41, -0.225, 0.25);
	mane.lineTo(-0.175, 0.25);
	mane.quadraticCurveTo(-0.19, 0.41, -0.16, 0.57);
	mane.quadraticCurveTo(-0.13, 0.69, -0.03, 0.74);
	mane.closePath();
	const maneDepth = 0.07;
	const maneGeo = new THREE.ExtrudeGeometry(mane, {
		depth: maneDepth,
		bevelEnabled: true,
		bevelThickness: 0.02,
		bevelSize: 0.012,
		bevelSegments: 1,
		curveSegments,
	});
	maneGeo.translate(0, 0, -maneDepth / 2);
	part(THREE, group, maneGeo, materials.secondary);

	// Eyes and a nostril on each side.
	for (let side = -1; side <= 1; side += 2) {
		part(THREE, group, new THREE.SphereGeometry(0.022, 8, 6), materials.secondary, 0.115, 0.645, side * 0.092);
		part(THREE, group, new THREE.SphereGeometry(0.014, 6, 5), materials.secondary, 0.265, 0.55, side * 0.07);
	}

	return finalise(THREE, group, materials);
}

// ── BISHOP — slender stem, double collar, mitre with a cut ──────────────────
export function createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = segmentsFor(isLocalPlayer);

	part(THREE, group, lathe(THREE, [
		...foot(0.26),
		[0.16, 0.125], [0.125, 0.18], [0.098, 0.27], [0.084, 0.39],
		...collar(0.40, 0.14, 0.08),
		[0.085, 0.44],
		...collar(0.445, 0.12, 0.08),
		[0.088, 0.49], [0.11, 0.52], [0.128, 0.57], [0.132, 0.62], [0.118, 0.68],
		[0.088, 0.73], [0.05, 0.77], [0.022, 0.787],
		...arc(0, 0.815, 0.034, -55, 90, 6),
	], seg), materials.primary);
	// Accent finial bead on the very top.
	part(THREE, group, new THREE.SphereGeometry(0.03, 10, 8), materials.accent, 0, 0.86, 0);

	// The mitre cut — a dark diagonal groove across the front (+x).
	const cut = part(THREE, group, new THREE.BoxGeometry(0.05, 0.2, 0.026), materials.secondary, 0.098, 0.64, 0);
	cut.rotation.x = 0.55;
	cut.rotation.z = -0.32;

	return finalise(THREE, group, materials);
}

// ── QUEEN — tall stem, flared crown with a coronet of beads ─────────────────
export function createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = segmentsFor(isLocalPlayer);

	part(THREE, group, lathe(THREE, [
		...foot(0.28),
		[0.175, 0.125], [0.13, 0.19], [0.1, 0.3], [0.086, 0.45],
		...collar(0.46, 0.15, 0.085),
		[0.09, 0.505],
		...collar(0.51, 0.13, 0.085),
		[0.092, 0.56], [0.1, 0.61], [0.125, 0.68], [0.16, 0.75], [0.178, 0.785],
		[0.17, 0.8], [0.12, 0.8], [0.105, 0.815], [0.09, 0.845], [0.06, 0.872],
		[0.03, 0.885],
		...arc(0, 0.91, 0.036, -45, 90, 6),
	], seg), materials.primary);

	// Coronet: a ring of accent beads around the crown rim.
	const BEADS = 9;
	for (let i = 0; i < BEADS; i++) {
		const angle = (i / BEADS) * Math.PI * 2;
		part(THREE, group, new THREE.SphereGeometry(0.03, 8, 6), materials.accent,
			Math.cos(angle) * 0.162, 0.815, Math.sin(angle) * 0.162);
	}
	part(THREE, group, new THREE.SphereGeometry(0.036, 10, 8), materials.accent, 0, 0.955, 0);

	return finalise(THREE, group, materials);
}

// ── KING — the tallest piece, crowned and topped with a cross ───────────────
export function createRussianKingPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = segmentsFor(isLocalPlayer);

	part(THREE, group, lathe(THREE, [
		...foot(0.29),
		[0.185, 0.125], [0.14, 0.19], [0.108, 0.32], [0.094, 0.48],
		...collar(0.49, 0.16, 0.09),
		[0.095, 0.535],
		...collar(0.54, 0.14, 0.09),
		[0.098, 0.59], [0.106, 0.64], [0.13, 0.72], [0.162, 0.79], [0.17, 0.815],
		[0.15, 0.83], [0.142, 0.85], [0.115, 0.88], [0.075, 0.9], [0.04, 0.91], [0, 0.912],
	], seg), materials.primary);
	// Crown band.
	part(THREE, group, lathe(THREE, [[0.15, 0.775], [0.172, 0.785], [0.176, 0.8], [0.17, 0.818], [0.152, 0.825]], seg), materials.accent);

	// The cross.
	part(THREE, group, new THREE.BoxGeometry(0.042, 0.17, 0.042), materials.accent, 0, 0.99, 0);
	part(THREE, group, new THREE.BoxGeometry(0.13, 0.042, 0.042), materials.accent, 0, 1.01, 0);

	return finalise(THREE, group, materials);
}

/**
 * Map a numeric piece type to its builder, then apply the per-type size
 * cue (shared `pieceSizeFor`). Defaults to pawn for unknown types.
 * Returns a single merged `THREE.Mesh` — the renderer wraps it in an
 * outer pieceGroup, scales it, and clones it; a Mesh supports all that.
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
