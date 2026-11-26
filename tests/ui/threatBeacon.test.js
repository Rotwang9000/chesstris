/**
 * @jest-environment jsdom
 *
 * The red beacon over the enemy piece that just took one of yours
 * (2026-11-26: a raiding knight couldn't be found among the player's
 * own pieces to take it back).
 */

import * as THREE from 'three';
import { setTHREE } from '../../public/js/gameContext.js';
import { markThreat, updateThreatBeacons, activeThreats, clearThreats, THREAT_MS } from '../../public/js/threatBeacon.js';

beforeAll(() => setTHREE(THREE));
afterEach(() => clearThreats());

function groupWith(...ids) {
	const group = new THREE.Group();
	for (const id of ids) {
		const piece = new THREE.Group();
		piece.userData = { id, type: 'chessPiece' };
		piece.scale.set(0.5, 0.5, 0.5);
		group.add(piece);
	}
	return group;
}

test('the marked piece gets a beacon, drawn through everything, at its own size', () => {
	const group = groupWith('k1', 'p2');
	markThreat('k1', 0);
	updateThreatBeacons(group, 10);
	const beacon = group.children[0].getObjectByName('threat-beacon');
	expect(beacon).toBeTruthy();
	expect(beacon.scale.x).toBeCloseTo(2);
	beacon.traverse(o => { if (o.material) expect(o.material.depthTest).toBe(false); });
	expect(group.children[1].getObjectByName('threat-beacon')).toBeUndefined();
});

test('it never takes a tap meant for the piece', () => {
	const group = groupWith('k1');
	markThreat('k1', 0);
	updateThreatBeacons(group, 10);
	const hits = [];
	group.children[0].getObjectByName('threat-beacon').traverse(o => o.raycast(new THREE.Raycaster(), hits));
	expect(hits).toHaveLength(0);
});

test('it goes when the mark runs out; a new capture renews it', () => {
	const group = groupWith('k1');
	markThreat('k1', 0);
	updateThreatBeacons(group, 10);
	markThreat('k1', 20000);
	updateThreatBeacons(group, THREAT_MS + 1);
	expect(group.children[0].getObjectByName('threat-beacon')).toBeTruthy();
	updateThreatBeacons(group, 20000 + THREAT_MS + 1);
	expect(group.children[0].getObjectByName('threat-beacon')).toBeUndefined();
	expect(activeThreats(20000 + THREAT_MS + 1)).toEqual([]);
});

test('when the piece that took yours steps back aboard, you are told once per boarding', () => {
	const group = groupWith('n1');
	const piece = group.children[0];
	piece.userData.pieceType = 'KNIGHT';
	const toast = jest.fn();
	markThreat('n1', 0);
	updateThreatBeacons(group, 10, { toast });
	expect(toast).not.toHaveBeenCalled();
	piece.userData.onShip = 'ship-1';
	updateThreatBeacons(group, 20, { toast });
	updateThreatBeacons(group, 30, { toast });
	expect(toast).toHaveBeenCalledTimes(1);
	expect(toast.mock.calls[0][0]).toMatch(/knight has stepped back aboard its longship/);
	// ashore and back aboard the same ship: not told twice; a different ship: told
	piece.userData.onShip = null;
	updateThreatBeacons(group, 40, { toast });
	piece.userData.onShip = 'ship-1';
	updateThreatBeacons(group, 50, { toast });
	expect(toast).toHaveBeenCalledTimes(1);
	piece.userData.onShip = 'ship-2';
	updateThreatBeacons(group, 60, { toast });
	expect(toast).toHaveBeenCalledTimes(2);
});
