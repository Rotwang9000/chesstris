/**
 * Disconnect grace timers — purely in-memory.
 *
 * When a socket disconnects we don't immediately remove the player from
 * the world; we give them a few minutes to reconnect (refresh, lost
 * Wi-Fi, etc.).  After the grace expires we run an `onExpire` callback
 * that the server uses to fully clean up.
 *
 * Timers are deliberately NOT persisted — after a server restart the
 * world is restored, and any reconnecting client picks up where they
 * left off.
 */

const DEFAULT_GRACE_MS = 5 * 60 * 1000;

const timers = new Map();

/**
 * Schedule a grace timer for `playerId`.
 *
 * @param {string} playerId
 * @param {() => void} onExpire  Called if the grace period elapses.
 * @param {number} [graceMs]
 */
function arm(playerId, onExpire, graceMs = DEFAULT_GRACE_MS) {
	clear(playerId);
	const handle = setTimeout(() => {
		timers.delete(playerId);
		try { onExpire(); } catch (err) {
			console.error('[Disconnects] onExpire threw:', err);
		}
	}, graceMs);
	if (typeof handle.unref === 'function') handle.unref();
	timers.set(playerId, handle);
}

/**
 * Cancel the grace timer for `playerId`. Idempotent.
 * @returns {boolean} true if a timer was actually cleared.
 */
function clear(playerId) {
	const handle = timers.get(playerId);
	if (!handle) return false;
	clearTimeout(handle);
	timers.delete(playerId);
	return true;
}

function isPending(playerId) {
	return timers.has(playerId);
}

function clearAll() {
	for (const handle of timers.values()) clearTimeout(handle);
	timers.clear();
}

module.exports = {
	arm,
	clear,
	isPending,
	clearAll,
	DEFAULT_GRACE_MS,
};
