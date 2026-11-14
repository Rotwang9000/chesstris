/**
 * Bundle stub of viking/landDress.js (see vikingLazy/runtime.js): the
 * standard land until the Viking chunk is here (it redraws the board
 * when it lands).
 */
import { vk, wantViking } from '../../runtime.js';

export function vikingLandWanted(gameState, isActive) {
	const m = vk('landDress');
	if (m) return isActive === undefined ? m.vikingLandWanted(gameState) : m.vikingLandWanted(gameState, isActive);
	wantViking(gameState);
	return false;
}

export function vikingAppearance(appearance, x, z) {
	const m = vk('landDress');
	return m ? m.vikingAppearance(appearance, x, z) : appearance;
}

export function createVikingBase(THREE, boardGroup) {
	const m = vk('landDress');
	return m ? m.createVikingBase(THREE, boardGroup) : null;
}

export function dressInstancedCells(THREE, mesh, on) {
	const m = vk('landDress');
	if (m) m.dressInstancedCells(THREE, mesh, on);
}

export function setVikingOwnership(mesh, cells) {
	const m = vk('landDress');
	if (m) m.setVikingOwnership(mesh, cells);
}
