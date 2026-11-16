/**
 * Longship sounds (Viking edition): every `tetches:ship` event that
 * concerns this player (their ship, their warrior, a ship taken from
 * them) plays its cue from vikingCues.js. In a battle every ship event
 * does: there are only a few seats. In the shared world, strangers'
 * ships far away stay quiet.
 */

import { SHIP_EVENT } from '../longships/shipEvents.js';
import { SHIP_KIND_CUES } from './vikingCues.js';
import { playSound } from './soundManager.js';

/** The player ids a ship event names. */
export function shipEventPlayers(detail) {
	const d = detail || {};
	const m = d.move || {};
	const ids = [
		d.playerId, d.seatId, d.player, d.owner, d.previousController,
		typeof d.to === 'string' ? d.to : null,
		typeof d.from === 'string' ? d.from : null,
		m.playerId, m.player, m.piece?.player, m.ship?.previousController, m.ship?.landOwner,
	];
	return ids.filter(v => v != null && v !== '').map(String);
}

/** The cue to play for this event, or null. */
export function shipCueFor(detail, { localId = null, inBattle = false } = {}) {
	const cue = SHIP_KIND_CUES[detail?.kind];
	if (!cue) return null;
	if (inBattle) return cue;
	if (localId == null) return null;
	return shipEventPlayers(detail).includes(String(localId)) ? cue : null;
}

let attached = false;

export function attachShipSounds(getGameState = () => (typeof window !== 'undefined' ? window.gameState : null)) {
	if (attached || typeof window === 'undefined') return;
	attached = true;
	window.addEventListener(SHIP_EVENT, (e) => {
		try {
			const gs = getGameState() || {};
			const cue = shipCueFor(e.detail, {
				localId: gs.localPlayerId ?? gs.myPlayerId ?? null,
				inBattle: !!gs.activeBattle,
			});
			if (cue) playSound(cue);
		} catch (_e) { /* sound is best-effort */ }
	});
}
