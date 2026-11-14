/**
 * Who decides whether a reconnect may replace the local identity.
 *
 * On a socket reconnect the server re-announces the player's real id
 * ('player_id', and the world join's answer). While seated in a Viking
 * battle the battle seat must stay the local identity, so battleMode.js
 * registers its check here and the network handlers ask before writing
 * localPlayerId. A tiny module so they need not import battleMode.
 */

let hold = null;

/** battleMode.js: `fn(realId)` returns true when it keeps the seat. */
export function setSeatHold(fn) {
	hold = typeof fn === 'function' ? fn : null;
}

/** True when the battle seat stays the identity (do not overwrite it). */
export function keepSeatOnRejoin(realId) {
	try { return hold ? hold(realId) === true : false; } catch (_e) { return false; }
}
