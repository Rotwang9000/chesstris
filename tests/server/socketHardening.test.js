/**
 * Socket hardening: junk trailing args can't crash a handler, and the
 * world-admin events are closed outside development.
 */

'use strict';

const { attachPacketShape } = require('../../server/sockets/packetShape');

function runMiddleware(packet) {
	let mw;
	attachPacketShape({ use: (fn) => { mw = fn; } });
	let called = false;
	mw(packet, () => { called = true; });
	expect(called).toBe(true);
	return packet;
}

describe('packetShape', () => {
	const ack = () => {};

	test('drops a non-function "callback" argument', () => {
		expect(runMiddleware(['exit_game', {}, 'x'])).toEqual(['exit_game', {}]);
	});

	test('keeps data and a real ack', () => {
		expect(runMiddleware(['change_name', { playerName: 'a' }, ack]))
			.toEqual(['change_name', { playerName: 'a' }, ack]);
	});

	test('junk between data and ack is removed, ack kept last', () => {
		const out = runMiddleware(['exit_game', {}, 'x', 1, ack]);
		expect(out).toEqual(['exit_game', {}, ack]);
	});

	test('ack-only packets are untouched', () => {
		expect(runMiddleware(['get_boats', ack])).toEqual(['get_boats', ack]);
	});
});

describe('isWorldAdminAllowed', () => {
	const saved = { env: process.env.NODE_ENV, token: process.env.ADMIN_TOKEN };

	afterEach(() => {
		process.env.NODE_ENV = saved.env;
		if (saved.token === undefined) delete process.env.ADMIN_TOKEN;
		else process.env.ADMIN_TOKEN = saved.token;
	});

	const { isWorldAdminAllowed } = require('../../server/security/adminGate');

	test('open in development and tests', () => {
		process.env.NODE_ENV = 'development';
		expect(isWorldAdminAllowed()).toBe(true);
		process.env.NODE_ENV = 'test';
		expect(isWorldAdminAllowed()).toBe(true);
	});

	test.each(['production', 'staging'])('%s requires the admin token', (env) => {
		process.env.NODE_ENV = env;
		process.env.ADMIN_TOKEN = 's3cret';
		expect(isWorldAdminAllowed()).toBe(false);
		expect(isWorldAdminAllowed({ adminToken: 'wrong!' })).toBe(false);
		expect(isWorldAdminAllowed({ adminToken: 's3cret' })).toBe(true);
	});

	test('production with no ADMIN_TOKEN configured is closed', () => {
		process.env.NODE_ENV = 'production';
		delete process.env.ADMIN_TOKEN;
		expect(isWorldAdminAllowed({ adminToken: '' })).toBe(false);
	});
});

describe('validatePlayerName strips markup', () => {
	const { validatePlayerName } = require('../../server/utils/validation');

	test('tags and entities cannot survive', () => {
		const name = validatePlayerName('<img src=x onerror=alert(1)>');
		expect(name).not.toMatch(/[<>]/);
	});

	test('quotes become typographic, so names stay readable', () => {
		expect(validatePlayerName("O'Brien")).toBe('O’Brien');
		expect(validatePlayerName('"Ace"')).toBe('”Ace”');
	});

	test('control characters are dropped; empty result is rejected', () => {
		expect(validatePlayerName('Bo\u0000b\u0007')).toBe('Bob');
		expect(validatePlayerName('<>')).toBeNull();
	});
});

describe('king duel responses', () => {
	const World = require('../../server/world/World');
	const Sessions = require('../../server/world/Sessions');
	const { createKingDuelService } = require('../../server/king/duels');

	let service;
	beforeEach(() => {
		jest.useFakeTimers();
		World.resetWorld();
		Sessions.clearAll();
		const io = { to: () => ({ emit: () => {} }) };
		service = createKingDuelService({ io, kingCaptureService: { executeKingCapture: jest.fn() } });
	});
	afterEach(() => {
		service.reset();
		jest.useRealTimers();
	});

	test('a stranger cannot answer someone else\'s duel', () => {
		const duelId = service.startDuel('alice', 'bob');
		expect(service.recordResponse(duelId, 'mallory', 0, 0)).toEqual({ success: false, error: 'Not in this duel' });
		expect(service.recordResponse(duelId, 'alice', 0, 0).success).toBe(true);
	});

	test('in a battle, the seat\'s controller answers for the seat', () => {
		// Battle duels are between seat ids aliased to their humans.
		Sessions.setAlias('battle-b1-s0', 'alice');
		const duelId = service.startDuel('battle-b1-s0', 'battle-b1-s1');
		expect(service.recordResponse(duelId, 'alice', 1, 2).success).toBe(true);
		// Filed under the seat, so it counts towards resolving the duel.
		expect(service.recordResponse(duelId, 'alice', 1, 2)).toEqual({ success: false, error: 'Already responded' });
	});
});
