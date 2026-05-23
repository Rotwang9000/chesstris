/**
 * Wings animation for chess pieces on cleared rows (bible §15.2).
 *
 * Visual story:
 *
 *   1. The server fires `cells_clearing` with `airbornePieceIds` 700ms
 *      before deletion. We attach a pair of flapping wing meshes to
 *      each named piece and lift it ~0.6 units into the air.
 *   2. The server then strips the cells, runs gravity, and emits
 *      `row_cleared` with `settleOutcomes` describing which pieces
 *      landed safely, which were knocked off, and which fell into the
 *      water.
 *   3. We tween each piece down (or drop it into the sea) based on
 *      its outcome, then strip the wings.
 *
 * The actual board / piece teleports are handled by
 * `updateChessPieces.js` as usual — we just decorate the mesh with
 * the wing visuals and timing so the gravity move feels deliberate
 * instead of instantaneous.
 */

import { getTHREE } from './gameContext.js';

const HOVER_HEIGHT = 1.4;
const HOVER_DURATION_MS = 700;
const LAND_DURATION_MS = 520;
const FALL_DURATION_MS = 1100;
const FALL_DEPTH = -4.5;
const WING_COLOUR = 0xffffff;

const airbornePieces = new Map();
let chessGroupRef = null;
let activeFlap = null;

/**
 * Set the live chess pieces THREE.Group so the module can look up
 * meshes by id. `enhanced-gameCore.js` calls this once at startup.
 */
export function setChessPiecesGroup(group) {
	chessGroupRef = group || null;
}

function findPieceMesh(pieceId) {
	if (!chessGroupRef || !chessGroupRef.children) return null;
	const id = String(pieceId);
	for (const child of chessGroupRef.children) {
		if (!child || !child.userData) continue;
		if (String(child.userData.id) === id) return child;
		const pieceInUserData = child.userData.piece;
		if (pieceInUserData && String(pieceInUserData.id) === id) return child;
	}
	return null;
}

function buildWing(THREE, side) {
	const wingGeo = new THREE.PlaneGeometry(1.0, 0.55);
	const wingMat = new THREE.MeshBasicMaterial({
		color: WING_COLOUR,
		side: THREE.DoubleSide,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
	});
	const mesh = new THREE.Mesh(wingGeo, wingMat);
	mesh.position.set(side === 'left' ? -0.55 : 0.55, 0.6, 0);
	// Slight pivot offset so the wing rotates around the shoulder rather
	// than its centre.  Achieved by nesting in a Group.
	const pivot = new THREE.Group();
	pivot.position.set(side === 'left' ? -0.05 : 0.05, 0, 0);
	pivot.add(mesh);
	pivot.userData = { side, baseRotation: 0, mesh };
	mesh.position.x = side === 'left' ? -0.45 : 0.45;
	return pivot;
}

function attachWings(mesh) {
	if (!mesh || mesh.userData?.wings) return;
	const THREE = getTHREE();
	if (!THREE) return;
	// Isolate this piece's materials from the global cache so any fade
	// we apply during the fall animation can't bleed across every other
	// piece using the same shared `ENHANCED_MATERIALS` instance.
	isolateMeshMaterials(mesh);
	const wings = {
		left: buildWing(THREE, 'left'),
		right: buildWing(THREE, 'right'),
	};
	mesh.add(wings.left);
	mesh.add(wings.right);
	mesh.userData = mesh.userData || {};
	mesh.userData.wings = wings;
}

/**
 * Replace every material on `mesh` with a per-instance clone so opacity /
 * colour mutations on the airborne piece don't affect any other piece
 * that happens to share the cached material objects. Tracks the swap on
 * `mesh.userData.materialsIsolated` so we don't double-clone if a piece
 * survives one wing cycle and grows wings a second time.
 */
function isolateMeshMaterials(mesh) {
	if (!mesh || mesh.userData?.materialsIsolated) return;
	mesh.traverse((node) => {
		if (!node || !node.isMesh || !node.material) return;
		if (Array.isArray(node.material)) {
			node.material = node.material.map(m => (m && typeof m.clone === 'function') ? m.clone() : m);
		} else if (typeof node.material.clone === 'function') {
			node.material = node.material.clone();
		}
	});
	mesh.userData = mesh.userData || {};
	mesh.userData.materialsIsolated = true;
}

function detachWings(mesh) {
	const wings = mesh && mesh.userData && mesh.userData.wings;
	if (!wings) return;
	for (const key of ['left', 'right']) {
		const pivot = wings[key];
		if (!pivot) continue;
		mesh.remove(pivot);
		const wingMesh = pivot.userData && pivot.userData.mesh;
		if (wingMesh) {
			if (wingMesh.geometry) wingMesh.geometry.dispose();
			if (wingMesh.material) wingMesh.material.dispose();
		}
	}
	delete mesh.userData.wings;
}

function flapWings(mesh, t) {
	const wings = mesh && mesh.userData && mesh.userData.wings;
	if (!wings) return;
	const flap = Math.sin(t * 0.018) * 0.9;
	if (wings.left) wings.left.rotation.z = -flap;
	if (wings.right) wings.right.rotation.z = flap;
}

function ensureFlapTicker() {
	if (activeFlap) return;
	const tick = () => {
		if (airbornePieces.size === 0) {
			activeFlap = null;
			return;
		}
		const now = performance.now();
		for (const [pieceId, entry] of airbornePieces) {
			const mesh = entry.mesh;
			if (!mesh) continue;
			flapWings(mesh, now);
			// Sustain the hover height with a tiny bob; only used during
			// the hover phase (between lift and settle).
			if (entry.phase === 'hovering') {
				const bob = Math.sin(now * 0.005) * 0.07;
				mesh.position.y = entry.targetY + bob;
			}
		}
		activeFlap = requestAnimationFrame(tick);
	};
	activeFlap = requestAnimationFrame(tick);
}

function tween(mesh, { fromY, toY, duration, onComplete }) {
	const startTime = performance.now();
	const step = () => {
		if (!mesh.parent) {
			if (onComplete) onComplete();
			return;
		}
		const t = Math.min(1, (performance.now() - startTime) / duration);
		const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
		mesh.position.y = fromY + (toY - fromY) * eased;
		if (t < 1) {
			requestAnimationFrame(step);
		} else if (onComplete) {
			onComplete();
		}
	};
	requestAnimationFrame(step);
}

/**
 * Begin the wing animation for pieces that are about to be cleared.
 * Called when the client receives `cells_clearing` with airborne ids.
 */
export function liftAirbornePieces(pieceIds) {
	if (!Array.isArray(pieceIds) || pieceIds.length === 0) return;
	for (const rawId of pieceIds) {
		const id = String(rawId);
		if (airbornePieces.has(id)) continue;
		const mesh = findPieceMesh(id);
		if (!mesh) continue;

		// Cancel any in-flight chess move tween that might fight us.
		mesh.userData = mesh.userData || {};
		mesh.userData.airborne = true;
		// Prevent the reconciler from yanking the mesh while it
		// hovers; `updateChessPieces.js` checks this flag before
		// resetting positions.
		mesh.userData.inFlight = true;
		attachWings(mesh);

		const baseY = mesh.position.y || 0;
		const targetY = baseY + HOVER_HEIGHT;
		airbornePieces.set(id, {
			mesh,
			baseY,
			targetY,
			phase: 'lifting',
		});
		tween(mesh, {
			fromY: baseY,
			toY: targetY,
			duration: HOVER_DURATION_MS,
			onComplete: () => {
				const entry = airbornePieces.get(id);
				if (entry) entry.phase = 'hovering';
			},
		});
	}
	ensureFlapTicker();
}

/**
 * Apply the server-authoritative outcomes from a `row_cleared` event:
 * landed pieces ease down, fallen pieces drop into the sea, bumped
 * pieces fall sideways.
 */
export function settleAirbornePieces(outcomes) {
	if (!Array.isArray(outcomes) || outcomes.length === 0) return;
	for (const outcome of outcomes) {
		if (!outcome || !outcome.pieceId) continue;
		const id = String(outcome.pieceId);
		const entry = airbornePieces.get(id);
		if (!entry) continue;

		const mesh = entry.mesh;
		const finalY = entry.baseY;

		switch (outcome.outcome) {
			case 'landed': {
				entry.phase = 'landing';
				tween(mesh, {
					fromY: mesh.position.y,
					toY: finalY,
					duration: LAND_DURATION_MS,
					onComplete: () => {
						detachWings(mesh);
						if (mesh.userData) {
							mesh.userData.airborne = false;
							mesh.userData.inFlight = false;
						}
						airbornePieces.delete(id);
					},
				});
				break;
			}
			case 'fell':
			case 'bumped':
			case 'gone':
			default: {
				entry.phase = 'falling';
				// Drop into the water — past the floor — then let the
				// reconciler remove the now-stale mesh on the next
				// `game_update`.  Fade out via material opacity if
				// available.
				const fadeMaterials = collectMaterials(mesh);
				const startFadeTime = performance.now();
				const fadeStep = () => {
					if (!mesh.parent) return;
					const t = Math.min(1, (performance.now() - startFadeTime) / FALL_DURATION_MS);
					for (const mat of fadeMaterials) {
						if (mat && typeof mat.opacity === 'number') {
							mat.transparent = true;
							mat.opacity = Math.max(0, 1 - t);
						}
					}
					if (t < 1) requestAnimationFrame(fadeStep);
				};
				requestAnimationFrame(fadeStep);
				tween(mesh, {
					fromY: mesh.position.y,
					toY: FALL_DEPTH,
					duration: FALL_DURATION_MS,
					onComplete: () => {
						detachWings(mesh);
						if (mesh.parent) mesh.parent.remove(mesh);
						airbornePieces.delete(id);
					},
				});
				break;
			}
		}
	}
}

function collectMaterials(mesh) {
	const out = [];
	mesh.traverse((node) => {
		if (!node || !node.material) return;
		if (Array.isArray(node.material)) {
			for (const m of node.material) if (m) out.push(m);
		} else {
			out.push(node.material);
		}
	});
	return out;
}

/**
 * Returns the set of currently airborne piece ids, used by the
 * `updateChessPieces` reconciler so it doesn't yank a flying piece
 * out from under us mid-animation.
 */
export function getAirbornePieceIds() {
	return new Set(airbornePieces.keys());
}

/**
 * Cancel everything (used on world reset / sudden state replace).
 */
export function clearAirbornePieces() {
	for (const [, entry] of airbornePieces) {
		if (entry && entry.mesh) {
			detachWings(entry.mesh);
			if (entry.mesh.userData) {
				entry.mesh.userData.airborne = false;
				entry.mesh.userData.inFlight = false;
			}
		}
	}
	airbornePieces.clear();
}
