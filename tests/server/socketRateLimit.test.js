/**
 * Unit tests for the wire-level Socket.IO rate limiter.
 *
 * Pins the contract the connection layer relies on:
 *   - traffic under budget is dispatched untouched;
 *   - over-budget packets are dropped (handler never runs) with a single
 *     non-fatal warning per window;
 *   - a sustained flood past the hard limit severs the socket;
 *   - the per-window budget refreshes once the window rolls over;
 *   - lifecycle events (disconnect/error) are never throttled.
 *
 * A tiny fake socket exposes just the surface the limiter touches
 * (`use`, `emit`, `disconnect`), so the test exercises real behaviour
 * rather than a mock that hides it.
 */

'use strict';

const { attachSocketRateLimit } = require('../../server/sockets/rateLimiter');

function makeFakeSocket() {
	return {
		id: 'sock_test',
		_mw: null,
		emitted: [],
		disconnected: false,
		use(fn) { this._mw = fn; },
		emit(event, payload) { this.emitted.push({ event, payload }); },
		disconnect() { this.disconnected = true; },
	};
}

// Push `times` events named `eventName` through the registered middleware,
// returning how many were actually dispatched (i.e. called `next`).
function fire(socket, eventName, times) {
	let dispatched = 0;
	for (let i = 0; i < times; i += 1) {
		socket._mw([eventName], () => { dispatched += 1; });
	}
	return dispatched;
}

const OPTS = { windowMs: 1000, maxEvents: 5, hardMultiple: 4 }; // hardLimit 20

describe('attachSocketRateLimit', () => {
	test('dispatches all events while under budget', () => {
		const s = makeFakeSocket();
		attachSocketRateLimit(s, OPTS);
		expect(fire(s, 'chess_move', 5)).toBe(5);
		expect(s.disconnected).toBe(false);
		expect(s.emitted).toHaveLength(0);
	});

	test('drops over-budget packets and warns once (no disconnect)', () => {
		const s = makeFakeSocket();
		attachSocketRateLimit(s, OPTS);
		fire(s, 'chess_move', 5);                 // budget consumed
		const dispatched = fire(s, 'chess_move', 5); // events 6..10 dropped
		expect(dispatched).toBe(0);
		expect(s.disconnected).toBe(false);
		const warnings = s.emitted.filter((e) => e.event === 'rate_limited');
		expect(warnings).toHaveLength(1);
		expect(warnings[0].payload.fatal).toBe(false);
	});

	test('disconnects on a sustained flood past the hard limit', () => {
		const s = makeFakeSocket();
		attachSocketRateLimit(s, OPTS);
		fire(s, 'chess_move', 25);                // blows past hardLimit (20)
		expect(s.disconnected).toBe(true);
		const fatal = s.emitted.find((e) => e.event === 'rate_limited' && e.payload.fatal === true);
		expect(fatal).toBeTruthy();
	});

	test('refreshes the budget after the window rolls over', () => {
		jest.useFakeTimers();
		jest.setSystemTime(0);
		try {
			const s = makeFakeSocket();
			attachSocketRateLimit(s, OPTS);
			fire(s, 'm', 5);                      // window @0 budget used
			expect(fire(s, 'm', 1)).toBe(0);      // 6th dropped
			jest.setSystemTime(OPTS.windowMs + 1); // new window
			expect(fire(s, 'm', 5)).toBe(5);      // budget refreshed
		} finally {
			jest.useRealTimers();
		}
	});

	test('never throttles exempt lifecycle events', () => {
		const s = makeFakeSocket();
		attachSocketRateLimit(s, { windowMs: 1000, maxEvents: 2, hardMultiple: 100 });
		fire(s, 'chess_move', 2);                 // budget consumed
		let passed = 0;
		s._mw(['disconnect'], () => { passed += 1; });
		s._mw(['error'], () => { passed += 1; });
		expect(passed).toBe(2);
	});

	test('tolerates a missing/garbled socket (no throw)', () => {
		expect(() => attachSocketRateLimit(null)).not.toThrow();
		expect(() => attachSocketRateLimit({})).not.toThrow();
	});
});
