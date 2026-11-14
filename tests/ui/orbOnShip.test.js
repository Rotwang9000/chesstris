/**
 * @jest-environment jsdom
 *
 * Viking longships: an orb left on water a ship has sailed onto shows
 * just the orb — the ghost "build here" block and its tether are hidden
 * (nobody can build on a ship) and come back when the ship moves on.
 * Orbs anywhere else are drawn exactly as before.
 */

import * as THREE from 'three';
import gameState from '../../public/js/utils/gameState.js';
import { setTHREE, setScene, setPowerUpGroup } from '../../public/js/gameContext.js';
import { syncPowerUps, disposePowerUpVisuals } from '../../public/js/powerUpRenderer.js';

const orb = { id: 'o1', x: 3, z: 4, pieceType: 'KNIGHT' };
const ship = { type: 'ship', shipId: 's1', player: 'p1', readyAt: 0 };

function visual() {
	let found = null;
	gameState.scene.traverse(o => { if (!found && o.userData?.block && o.userData?.tether) found = o; });
	return found;
}

beforeEach(() => {
	setTHREE(THREE);
	setPowerUpGroup(null);
	setScene(new THREE.Scene());
	gameState.board = { cells: {} };
	gameState.activeBattle = null;
});
afterEach(() => { try { disposePowerUpVisuals(); } catch (_e) { /* ignore */ } });

test('an orb on empty water keeps its ghost block and tether', () => {
	syncPowerUps([orb]);
	const v = visual();
	expect(v.userData.block.visible).toBe(true);
	expect(v.userData.wireframe.visible).toBe(true);
	expect(v.userData.tether.visible).toBe(true);
});

test('a ship on the orb square hides the ghost block until it sails on', () => {
	gameState.board.cells['3,4'] = [ship];
	syncPowerUps([orb]);
	const v = visual();
	expect(v.userData.block.visible).toBe(false);
	expect(v.userData.wireframe.visible).toBe(false);
	expect(v.userData.tether.visible).toBe(false);
	expect(v.userData.orbCore.visible).toBe(true);
	delete gameState.board.cells['3,4'];
	syncPowerUps([orb]);
	expect(v.userData.block.visible).toBe(true);
	expect(v.userData.tether.visible).toBe(true);
});
