/**
 * Bundle stub of viking/shipRenderer.js (see vikingLazy/runtime.js):
 * forwards once the Viking chunk is here; before, no ship is drawn.
 */
import { vk, wantViking, loadViking } from '../../runtime.js';

export function passengerPose(gameState, x, z) {
	const m = vk('shipRenderer');
	return m ? m.passengerPose(gameState, x, z) : null;
}

export function hasShipsDrawn() {
	const m = vk('shipRenderer');
	return m ? m.hasShipsDrawn() : false;
}

export function syncShips(gameState, boardGroup, THREE, shipCells) {
	const m = vk('shipRenderer');
	if (m) return m.syncShips(gameState, boardGroup, THREE, shipCells);
	// Ships on the board: they need the chunk (which redraws on arrival).
	if (shipCells && Object.keys(shipCells).length > 0) loadViking();
	else wantViking(gameState);
	return undefined;
}

export function animateShips(scene, gameState, dtMs) {
	const m = vk('shipRenderer');
	if (m) m.animateShips(scene, gameState, dtMs);
}
