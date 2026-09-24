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
