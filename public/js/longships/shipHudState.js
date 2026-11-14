/**
 * The Longship HUD button's state machine, as a pure function so it is
 * unit-tested without a DOM (tests/ui/longshipControls.test.js).
 *
 *   hidden   not in a Viking battle
 *   ready    you control a ship that can sail now
 *   rowing   every ship you control is rowing (3 s ring)
 *   lost     you control none; a new keel is due at rebuildAt
 *   none     you control none and no rebuild is known (mooring sunk,
 *            or the news hasn't arrived yet)
 *
 * `fleetMemo` remembers what the server said about this seat's fleet
 * (ship_lost / ship_built), so the countdown survives redraws.
 */

import { SHIP } from '../viking/shipRulesClient.js';

/**
 * @param {Object} input
 * @param {boolean} input.active          a Viking battle is being played
 * @param {Array<{ship:Object}>} input.ships  ships the local seat controls
 * @param {number} input.now              server-clock ms
 * @param {{rebuildAt?:number, reason?:string}|null} [input.lost]
 * @param {string} [input.phase]          gameState.turnPhase
 * @param {string|null} [input.selectedShipId]
 * @returns {{mode:string, label:string, detail:string, progress:number,
 *            secondsLeft:number, count:number, canSail:boolean, title:string}}
 */
export function shipButtonState({ active, ships = [], now, lost = null, phase = 'chess', selectedShipId = null }) {
	const base = { mode: 'hidden', label: '', detail: '', progress: 0, secondsLeft: 0, count: 0, canSail: false, title: '' };
	if (!active) return base;
	const count = ships.length;
	if (count === 0) {
		const rebuildAt = Number(lost?.rebuildAt);
		if (Number.isFinite(rebuildAt) && rebuildAt > 0) {
			const msLeft = Math.max(0, rebuildAt - now);
			const secondsLeft = Math.ceil(msLeft / 1000);
			return {
				...base,
				mode: 'lost',
				label: 'Longship lost',
				detail: msLeft > 0 ? `New keel in ${secondsLeft}s` : 'New keel any moment',
				progress: 1 - Math.min(1, msLeft / SHIP.RESPAWN_MS),
				secondsLeft,
				title: 'Your longship is lost. A new one is built at your mooring if the water there is still open.',
			};
		}
		return {
			...base,
			mode: 'none',
			label: 'No longship',
			detail: '',
			title: 'You have no longship. A new one is built at your mooring 45 s after you lose your last.',
		};
	}
	const rowLeft = (entry) => Math.max(0, Number(entry.ship.readyAt) - now);
	const selected = ships.find(e => String(e.ship.shipId) === String(selectedShipId)) || null;
	const ready = ships.filter(e => rowLeft(e) === 0);
	const inChess = phase === 'chess';
	const many = count > 1 ? ` ×${count}` : '';
	if (ready.length > 0 && (!selected || rowLeft(selected) === 0)) {
		return {
			...base,
			mode: 'ready',
			label: `Longship${many}`,
			detail: inChess ? 'Ready to sail' : 'Sail in your chess move',
			progress: 1,
			count,
			canSail: inChess,
			title: inChess
				? 'Select your longship (L) to see where it can sail.'
				: 'Longships sail during your chess move.',
		};
	}
	const soonest = selected || ships.reduce((a, b) => (rowLeft(a) <= rowLeft(b) ? a : b));
	const msLeft = rowLeft(soonest);
	return {
		...base,
		mode: 'rowing',
		label: `Longship${many}`,
		detail: `Rowing ${(msLeft / 1000).toFixed(1)}s`,
		progress: 1 - Math.min(1, msLeft / SHIP.ROW_LOCK_MS),
		secondsLeft: Math.ceil(msLeft / 1000),
		count,
		canSail: false,
		title: 'While YOUR ship rows, your pieces can’t step on or off it. Enemies still can.',
	};
}

/**
 * Fold one 'tetches:ship' event into the local seat's fleet memo.
 * Returns the new memo (null = nothing known / not lost).
 */
export function updateFleetMemo(memo, detail, mySeatId) {
	if (!detail || mySeatId == null) return memo;
	const mine = (id) => id != null && String(id) === String(mySeatId);
	switch (detail.kind) {
		case 'lost':
			if (mine(detail.seatId)) return { rebuildAt: Number(detail.rebuildAt) || 0, reason: detail.reason || null };
			return memo;
		case 'built':
			if (mine(detail.seatId)) return null;
			return memo;
		case 'seized':
			// Taking a ship back (or a new one) ends the wait.
			if (mine(detail.to)) return null;
			return memo;
		default:
			return memo;
	}
}
