/**
 * Player ids are public (broadcast in every game_update and listed by
 * GET /api/world), so knowing one must not be enough to become that
 * player. Reclaiming a guest id needs the session secret the server
 * issued to the owner's browser (`tetches_session` cookie).
 */

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const Disconnects = require('../../server/world/Disconnects');
const { resolvePlayerIdForSocket } = require('../../server/sockets/connection');
const { accountIdForKey } = require('../../server/security/playerSession');

function fakeSocket(cookieStr, query = {}) {
	return {
		id: 'sock-' + Math.random().toString(16).slice(2, 8),
		handshake: { headers: { cookie: cookieStr || '' }, query },
		join: jest.fn(),
		emit: jest.fn(),
		disconnect: jest.fn(),
	};
}

const services = {
	lifecycleService: {
		removePlayerCompletely: jest.fn((id) => World.removePlayer(id)),
	},
};

function connect(cookieStr) {
	const socket = fakeSocket(cookieStr);
	const id = resolvePlayerIdForSocket(socket, services);
	return { id, secret: socket.data && socket.data.issuedSessionSecret };
}

describe('guest identity requires the session secret', () => {
	beforeEach(() => {
		World.resetWorld();
		Sessions.clearAll();
		Disconnects.clearAll();
	});

	test('a new player is issued a secret, and only a hash is stored', () => {
		const { id, secret } = connect('');
		expect(secret).toMatch(/^[0-9a-f]{64}$/);
		const record = World.getPlayer(id);
		expect(record.sessionSecretHash).toMatch(/^[0-9a-f]{64}$/);
		expect(record.sessionSecretHash).not.toBe(secret);
	});

	test('the owner reconnects with id + secret, and is not re-issued one', () => {
		const first = connect('');
		const again = connect(`tetches_player_id=${first.id}; tetches_session=${first.secret}`);
		expect(again.id).toBe(first.id);
		expect(again.secret).toBeUndefined();
	});

	test('someone with only the public id gets a fresh identity', () => {
		const victim = connect('');
		const attacker = connect(`tetches_player_id=${victim.id}`);
		expect(attacker.id).not.toBe(victim.id);
		expect(World.getPlayer(victim.id)).toBeTruthy();
	});

	test('a wrong secret is refused too', () => {
		const victim = connect('');
		const attacker = connect(`tetches_player_id=${victim.id}; tetches_session=${'0'.repeat(64)}`);
		expect(attacker.id).not.toBe(victim.id);
	});

	test('a legacy guest (uuid, no secret yet) is bound on its next visit', () => {
		const legacyId = '1e9ac000-0000-4000-8000-000000000000';
		World.upsertPlayer(legacyId, { name: 'Oldtimer' });
		const first = connect(`tetches_player_id=${legacyId}`);
		expect(first.id).toBe(legacyId);
		expect(first.secret).toBeTruthy();
		// From now on the secret is required.
		expect(connect(`tetches_player_id=${legacyId}`).id).not.toBe(legacyId);
	});

	test('bots can not be claimed through the guest cookie', () => {
		World.upsertPlayer('ai-expert-12345678', { name: 'Bot', isComputer: true });
		expect(connect('tetches_player_id=ai-expert-12345678').id).not.toBe('ai-expert-12345678');
	});

	test('an account can not be claimed via its public id', () => {
		const accountId = connect(`tetches_auth_key=player_${'e'.repeat(32)}`).id;
		expect(accountId).toBe(accountIdForKey(`player_${'e'.repeat(32)}`));
		// As a guest cookie (no secret) …
		expect(connect(`tetches_player_id=${accountId}`).id).not.toBe(accountId);
		// … or presented as if it were a key.
		expect(connect(`tetches_auth_key=${accountId}`).id).not.toBe(accountId);
	});
});
