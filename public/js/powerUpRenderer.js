/**
 * Power-up orb renderer.
 *
 * Materialises the server's `world.powerUps` array into floating, glowing
 * spheres above empty board cells. Each orb contains a hint of the
 * chess piece type sitting inside it (a smaller, semi-transparent
 * silhouette) so players can decide whether the orb is worth racing to.
 *
 * Lifecycle:
 *   • `initPowerUpGroup(scene)` creates the THREE.Group once the scene
 *     is ready.
 *   • `syncPowerUps(orbs)` runs every frame (or whenever
 *     `gameState.powerUps` changes); it reconciles the visible meshes
 *     with the canonical list, creating/removing as needed.
 *   • `animatePowerUps(timeSec)` bobs the orbs up and down and rotates
 *     them slowly. Called from the main render loop.
 *
 * Why a dedicated module:
 *   The chess-piece renderer is heavy enough already, and orb visuals
 *   need their own update loop (continuous bob + pulse) independent of
 *   piece reconciliation. Keeping them separate makes both code paths
 *   easier to reason about.
 *
 * Materials are cached by piece-type, so spawning ten orbs doesn't
 * create ten redundant shader programs.
 */

import { getTHREE, getPowerUpGroup, setPowerUpGroup, getScene, getGameState } from './gameContext.js';
import { translatePosition } from './centreBoardMarker.js';

const ORB_RADIUS = 0.45;
// Lowered so the orb hovers visibly close to its host cell — the user
// flagged that the previous height (1.5) made it ambiguous which cell
// was the orb's home. Combined with the new ground disc + tether beam
// the player can see "build a tetromino into THIS cell" at a glance.
const ORB_HEIGHT_ABOVE_CELL = 1.1;
const ORB_BOB_AMPLITUDE = 0.12;
const ORB_BOB_FREQ_HZ = 0.6;
const ORB_ROTATION_SPEED = 0.6;
const GROUND_DISC_RADIUS = 0.55;
const GROUND_DISC_HEIGHT = 0.02;
const TETHER_BEAM_RADIUS = 0.05;

// Piece-type → tint used to colour the orb's inner glow. We avoid pure
// white so the orb still reads as "magical" rather than a generic LED.
const PIECE_TYPE_COLOURS = Object.freeze({
	PAWN: 0xffe066,
	KNIGHT: 0x66c2ff,
	BISHOP: 0xb083ff,
	ROOK: 0x4bd1a0,
	QUEEN: 0xff84d8,
});

// Cached materials so we don't re-allocate on every spawn.
const materialCache = new Map();
// orb.id → { group, mesh, glow, label, spawnedAt }
const orbVisuals = new Map();

function getMaterials(THREE, pieceType) {
	const cacheKey = String(pieceType || 'PAWN').toUpperCase();
	if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
	const tint = PIECE_TYPE_COLOURS[cacheKey] || PIECE_TYPE_COLOURS.PAWN;
	const orb = new THREE.MeshStandardMaterial({
		color: tint,
		emissive: tint,
		emissiveIntensity: 0.9,
		transparent: true,
		opacity: 0.85,
		roughness: 0.25,
		metalness: 0.2,
	});
	const glow = new THREE.MeshBasicMaterial({
		color: tint,
		transparent: true,
		opacity: 0.18,
		depthWrite: false,
	});
	const entry = { orb, glow, tint };
	materialCache.set(cacheKey, entry);
	return entry;
}

function ensurePowerUpGroup() {
	let group = getPowerUpGroup();
	if (group) return group;
	const THREE = getTHREE();
	if (!THREE) return null;
	const scene = getScene();
	if (!scene) return null;
	group = new THREE.Group();
	group.name = 'powerUpGroup';
	scene.add(group);
	setPowerUpGroup(group);
	return group;
}

function buildOrbVisual(orb) {
	const THREE = getTHREE();
	if (!THREE) return null;
	const { orb: orbMaterial, glow: glowMaterial, tint } = getMaterials(THREE, orb.pieceType);

	// Outer container — pinned to the cell's ground centre. Its child
	// `orbCore` holds the bobbing sphere; the disc and tether stay
	// fixed at y=0 so they unambiguously identify the host cell.
	const group = new THREE.Group();
	group.name = `powerup-${orb.id}`;
	group.userData = {
		orbId: orb.id,
		pieceType: orb.pieceType,
		spawnedAt: orb.spawnedAt || Date.now(),
		baseY: ORB_HEIGHT_ABOVE_CELL,
		phase: Math.random() * Math.PI * 2,
	};

	// Ground disc — a pulsing circle ON the host cell. Marks "the orb
	// is for THIS cell" so the player knows which tile to build under.
	const discMaterial = new THREE.MeshBasicMaterial({
		color: tint,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		side: THREE.DoubleSide,
	});
	const disc = new THREE.Mesh(
		new THREE.CircleGeometry(GROUND_DISC_RADIUS, 24),
		discMaterial,
	);
	disc.rotation.x = -Math.PI / 2;
	disc.position.set(0, GROUND_DISC_HEIGHT, 0);
	group.add(disc);
	group.userData.disc = disc;
	group.userData.discMaterial = discMaterial;

	// Tether beam — a thin vertical cylinder from disc to orb, so the
	// eye traces the connection. We make it semi-transparent and emit
	// the orb's tint colour so it reads as "magical link" not "post".
	const tetherMaterial = new THREE.MeshBasicMaterial({
		color: tint,
		transparent: true,
		opacity: 0.25,
		depthWrite: false,
	});
	const tetherHeight = Math.max(0.1, ORB_HEIGHT_ABOVE_CELL - ORB_RADIUS);
	const tether = new THREE.Mesh(
		new THREE.CylinderGeometry(TETHER_BEAM_RADIUS, TETHER_BEAM_RADIUS, tetherHeight, 12),
		tetherMaterial,
	);
	tether.position.set(0, GROUND_DISC_HEIGHT + tetherHeight / 2, 0);
	group.add(tether);
	group.userData.tether = tether;
	group.userData.tetherMaterial = tetherMaterial;

	// Orb core — the bobbing sphere(s) + interior silhouette. We
	// animate this sub-group's Y in `animatePowerUps` so the disc /
	// tether don't bob with it.
	const orbCore = new THREE.Group();
	orbCore.name = `powerup-core-${orb.id}`;
	orbCore.position.set(0, ORB_HEIGHT_ABOVE_CELL, 0);
	group.add(orbCore);
	group.userData.orbCore = orbCore;

	const orbMesh = new THREE.Mesh(
		new THREE.SphereGeometry(ORB_RADIUS, 24, 16),
		orbMaterial,
	);
	orbMesh.castShadow = false;
	orbMesh.receiveShadow = false;
	orbCore.add(orbMesh);

	const glowMesh = new THREE.Mesh(
		new THREE.SphereGeometry(ORB_RADIUS * 1.55, 16, 12),
		glowMaterial,
	);
	glowMesh.castShadow = false;
	glowMesh.receiveShadow = false;
	orbCore.add(glowMesh);

	const silhouette = buildSilhouette(THREE, orb.pieceType);
	if (silhouette) {
		silhouette.position.set(0, 0, 0);
		orbCore.add(silhouette);
		group.userData.silhouette = silhouette;
	}

	positionOrbAtCell(group, orb);
	return group;
}

/**
 * Position the outer orb group at the host cell, using the same
 * centre-marker translation that the board cells / chess pieces use.
 * Without this the orb floats above an "uncalibrated" world point and
 * looks like it's on a neighbouring cell — exactly what the user
 * reported.
 */
function positionOrbAtCell(group, orb) {
	const gameState = getGameState();
	const absPos = translatePosition({ x: orb.x, z: orb.z }, gameState, true)
		|| { x: orb.x, z: orb.z };
	group.position.set(absPos.x, 0, absPos.z);
}

function buildSilhouette(THREE, pieceType) {
	const type = String(pieceType || 'PAWN').toUpperCase();
	const material = new THREE.MeshBasicMaterial({
		color: 0x111111,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
	});

	switch (type) {
		case 'PAWN':
			return new THREE.Mesh(new THREE.SphereGeometry(ORB_RADIUS * 0.45, 12, 8), material);
		case 'KNIGHT':
			return new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.35), material);
		case 'BISHOP':
			return new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), material);
		case 'ROOK':
			return new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), material);
		case 'QUEEN':
		default:
			return new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 16), material);
	}
}

/**
 * Reconcile the visible orb meshes with the canonical `orbs` array.
 * Missing orbs get a fresh visual; orbs that disappeared have their
 * visual removed (and any materials they uniquely held disposed).
 */
export function syncPowerUps(orbs) {
	const group = ensurePowerUpGroup();
	if (!group) return;
	const THREE = getTHREE();
	if (!THREE) return;

	const seen = new Set();
	if (Array.isArray(orbs)) {
		for (const orb of orbs) {
			if (!orb || !orb.id) continue;
			seen.add(orb.id);
			let entry = orbVisuals.get(orb.id);
			if (!entry) {
				const visual = buildOrbVisual(orb);
				if (!visual) continue;
				group.add(visual);
				orbVisuals.set(orb.id, visual);
				entry = visual;
			} else {
				// Re-translate every sync in case the centre marker
				// moved (board expansion, recentring, etc.).
				positionOrbAtCell(entry, orb);
				entry.userData.pieceType = orb.pieceType;
			}
		}
	}

	for (const [id, visual] of orbVisuals) {
		if (seen.has(id)) continue;
		group.remove(visual);
		disposeOrbVisual(visual);
		orbVisuals.delete(id);
	}
}

function disposeOrbVisual(visual) {
	if (!visual || !visual.userData) return;
	// Disc and tether materials are unique per-orb (we tint them
	// with the cached shared material's colour but each gets its
	// own MeshBasicMaterial instance for opacity pulsing). Dispose
	// them explicitly to avoid GPU leaks over a long session.
	const { discMaterial, tetherMaterial } = visual.userData;
	if (discMaterial && typeof discMaterial.dispose === 'function') discMaterial.dispose();
	if (tetherMaterial && typeof tetherMaterial.dispose === 'function') tetherMaterial.dispose();
}

/**
 * Animate the existing orbs (bob + rotate). Cheap enough to call every
 * frame even with the maximum-allowed orb count.
 *
 * @param {number} timeSec  Continuous time value (e.g. THREE clock).
 */
export function animatePowerUps(timeSec) {
	if (orbVisuals.size === 0) return;
	const now = Number.isFinite(timeSec) ? timeSec : (Date.now() / 1000);
	for (const visual of orbVisuals.values()) {
		const phase = (visual.userData.phase || 0) + now * ORB_BOB_FREQ_HZ * Math.PI * 2;
		const baseY = visual.userData.baseY || ORB_HEIGHT_ABOVE_CELL;
		const orbCore = visual.userData.orbCore;
		if (orbCore) {
			orbCore.position.y = baseY + Math.sin(phase) * ORB_BOB_AMPLITUDE;
			orbCore.rotation.y += ORB_ROTATION_SPEED * 0.016;
			if (visual.userData.silhouette) {
				visual.userData.silhouette.rotation.y -= ORB_ROTATION_SPEED * 0.032;
			}
		}
		// Pulse the ground disc opacity in sync with the bob so the
		// player's eye is repeatedly drawn back to the host cell.
		const discMat = visual.userData.discMaterial;
		if (discMat) {
			const pulse = 0.4 + 0.25 * (1 + Math.sin(phase * 0.5)) * 0.5;
			discMat.opacity = pulse;
		}
	}
}

/**
 * Forget every visual and drop materials. Used when the scene is torn
 * down (e.g. on disconnect) so we don't leak GPU resources.
 */
export function disposePowerUpVisuals() {
	const group = getPowerUpGroup();
	if (group) {
		for (const visual of orbVisuals.values()) {
			group.remove(visual);
			disposeOrbVisual(visual);
		}
	}
	orbVisuals.clear();
}

/**
 * Test-only: peek at the cached visuals. Not exported via the default
 * surface to keep production callers honest.
 */
export function _debugListOrbVisuals() {
	const ids = [];
	for (const id of orbVisuals.keys()) ids.push(id);
	return ids;
}
