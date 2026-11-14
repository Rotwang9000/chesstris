/**
 * Bundle stub of longships/shipControls.js (see vikingLazy/runtime.js):
 * forwards once the Viking chunk is here. Before, nothing is selected
 * and no click is a ship's; `installShipControls` (called at boot) waits
 * for the chunk, so a standard page never wires the Longship button or
 * the L key at all.
 */
import { vk, onVikingReady } from '../../runtime.js';
import { SEA_SURFACE_Y } from '../../../seaLevel.js';

// shipLayout's DECK_HEIGHT: DECK_MODEL_Y * SHIP_SCALE * SHIP_STRETCH_Y
// (checked against the real constant in tests/ui/vikingLazy.test.js).
const DECK_HEIGHT = 0.14 * (3.4 / 7.8) * 1.3;
/** Deck height for rings on ship squares (the passenger stands here). */
export const SHIP_DECK_Y = SEA_SURFACE_Y + DECK_HEIGHT + 0.08;

const sc = () => vk('shipControls');

export function installShipControls() {
	onVikingReady(() => sc()?.installShipControls());
}

export function selectedShipId() {
	return sc()?.selectedShipId() ?? null;
}

export function currentSailLanes() {
	return sc()?.currentSailLanes() ?? [];
}

export function markLaneCursor(target) {
	sc()?.markLaneCursor(target);
}

export function sailTo(x, z) {
	const m = sc();
	return m ? m.sailTo(x, z) : Promise.resolve(false);
}

export function trySailLaneClick(raycaster) {
	return sc()?.trySailLaneClick(raycaster) ?? false;
}

export function pickShipEntry(raycaster, opts) {
	return sc()?.pickShipEntry(raycaster, opts) ?? null;
}

export function handleShipClick(entry, moveTo) {
	return sc()?.handleShipClick(entry, moveTo) ?? false;
}

export function clearShipSelection() {
	sc()?.clearShipSelection();
}

export function showLanesForPassenger(pieceData) {
	sc()?.showLanesForPassenger(pieceData);
}

export function waterSquareUnderPointer(raycaster) {
	return sc()?.waterSquareUnderPointer(raycaster) ?? null;
}
