/**
 * Wire-level Socket.IO rate limiting.
 *
 * The game already enforces per-ACTION cooldowns (chess move / tetromino
 * placement) on the player record, but nothing guarded the raw socket
 * channel — a misbehaving or malicious client could spam thousands of
 * events per second and tie up the single Node event loop. This adds a
 * cheap per-socket sliding-window budget via Socket.IO's inbound packet
 * middleware (`socket.use`), which runs before any event handler.
 *
 * Tuning: a legitimate human or AI player emits only a handful of events
 * per second, so the budget is deliberately generous. Over-budget packets
 * are dropped silently (handler never runs); a sustained flood past the
 * hard limit disconnects the socket entirely.
 */

const DEFAULT_WINDOW_MS = 1000;
// Generous: legit play is a few events/sec; this only catches floods.
const DEFAULT_MAX_EVENTS = 50;
// Sustained burst past (max * hardMultiple) in a window → disconnect.
const DEFAULT_HARD_MULTIPLE = 6;

// Lifecycle/transport events must never be throttled away.
const EXEMPT_EVENTS = new Set(['disconnect', 'disconnecting', 'error']);

/**
 * Attach a per-socket inbound rate limiter.
 *
 * @param {import('socket.io').Socket} socket
 * @param {{windowMs?:number, maxEvents?:number, hardMultiple?:number}} [opts]
 */
function attachSocketRateLimit(socket, opts = {}) {
	if (!socket || typeof socket.use !== 'function') return;

	const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : DEFAULT_WINDOW_MS;
	const maxEvents = Number(opts.maxEvents) > 0 ? Number(opts.maxEvents) : DEFAULT_MAX_EVENTS;
	const hardMultiple = Number(opts.hardMultiple) > 0 ? Number(opts.hardMultiple) : DEFAULT_HARD_MULTIPLE;
	const hardLimit = maxEvents * hardMultiple;

	let windowStart = Date.now();
	let count = 0;
	let warnedThisWindow = false;

	socket.use((packet, next) => {
		const eventName = Array.isArray(packet) ? packet[0] : undefined;
		if (EXEMPT_EVENTS.has(eventName)) return next();

		const now = Date.now();
		if (now - windowStart >= windowMs) {
			windowStart = now;
			count = 0;
			warnedThisWindow = false;
		}
		count += 1;

		// Sustained flood — sever the connection (client will reconnect
		// cleanly if it's actually a legitimate but buggy client).
		if (count > hardLimit) {
			console.warn(`[RateLimit] socket ${socket.id} flooded (${count} events / ${windowMs}ms); disconnecting`);
			try { socket.emit('rate_limited', { fatal: true }); } catch (_e) { /* closing */ }
			try { socket.disconnect(true); } catch (_e) { /* already closing */ }
			return; // do not dispatch
		}

		// Over budget — drop this packet without dispatching it.
		if (count > maxEvents) {
			if (!warnedThisWindow) {
				warnedThisWindow = true;
				try { socket.emit('rate_limited', { fatal: false }); } catch (_e) { /* ignore */ }
			}
			return; // do not call next() → handler never runs
		}

		return next();
	});
}

module.exports = { attachSocketRateLimit };
