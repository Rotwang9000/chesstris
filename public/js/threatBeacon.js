/**
 * A red beacon over the enemy piece that just took one of yours.
 *
 * Reported 2026-11-26: a raiding knight took a player's pieces one after
 * another, and at times they couldn't see where it stood among their own
 * pieces to take it back. The piece that captured yours now carries a
 * red column of light and a pulsing ring, drawn through everything
 * (no depth test), until THREAT_MS after its last capture of yours, or
 * until it is gone.
 *
 * markThreat(pieceId) on a capture of the viewer's piece;
 * updateThreatBeacons(group, now) once a frame (gameLoop).
 */

import { getTHREE } from './gameContext.js';

export const THREAT_MS = 30000;

/** pieceId → expiry (ms). */
const threats = new Map();
let parts = null;

/** The enemy piece `pieceId` just took one of the viewer's: mark it. */
export function markThreat(pieceId, now = Date.now()) {
	if (pieceId == null) return;
	threats.set(String(pieceId), now + THREAT_MS);
}

/** Pieces still marked (exported for tests). */
export function activeThreats(now = Date.now()) {
	const out = [];
	for (const [id, until] of threats) {
		if (until > now) out.push(id);
		else threats.delete(id);
	}
	return out;
}

export function clearThreats() {
	threats.clear();
}

function sharedParts(THREE) {
	if (parts) return parts;
	const beamMat = new THREE.MeshBasicMaterial({
		color: 0xff3020, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false,
	});
	const ringMat = new THREE.MeshBasicMaterial({
		color: 0xff3020, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
	});
	parts = {
		beamGeo: new THREE.CylinderGeometry(0.12, 0.22, 7, 10, 1, true),
		ringGeo: new THREE.RingGeometry(0.42, 0.56, 32),
		beamMat,
		ringMat,
	};
	return parts;
}

function buildBeacon(THREE) {
	const p = sharedParts(THREE);
	const beacon = new THREE.Group();
	beacon.name = 'threat-beacon';
	const beam = new THREE.Mesh(p.beamGeo, p.beamMat);
	beam.position.y = 3.6;
	beam.renderOrder = 1000;
	const ring = new THREE.Mesh(p.ringGeo, p.ringMat);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.05;
	ring.renderOrder = 1000;
	ring.name = 'threat-ring';
	beacon.add(beam);
	beacon.add(ring);
	// (raycasts pass through it: it must not steal a tap on the piece)
	beacon.traverse(o => { o.raycast = () => {}; });
	return beacon;
}

/**
 * Once a frame: give each marked piece in `group` its beacon, pulse the
 * rings, and take beacons off pieces no longer marked.
 */
export function updateThreatBeacons(group, now = Date.now()) {
	if (!group || !Array.isArray(group.children)) return;
	const THREE = getTHREE();
	if (!THREE) return;
	const live = new Set(activeThreats(now));
	const pulse = 1 + 0.18 * Math.sin(now / 180);
	for (const piece of group.children) {
		const id = piece?.userData?.id;
		if (id == null) continue;
		let beacon = piece.getObjectByName ? piece.getObjectByName('threat-beacon') : null;
		if (live.has(String(id))) {
			if (!beacon) {
				beacon = buildBeacon(THREE);
				piece.add(beacon);
			}
			// (undo the piece's own scale: the beacon keeps its size)
			const sc = piece.scale || { x: 1, y: 1, z: 1 };
			beacon.scale.set(1 / (sc.x || 1), 1 / (sc.y || 1), 1 / (sc.z || 1));
			const ring = beacon.getObjectByName('threat-ring');
			if (ring) ring.scale.set(pulse, pulse, 1);
		} else if (beacon) {
			piece.remove(beacon);
		}
	}
}
