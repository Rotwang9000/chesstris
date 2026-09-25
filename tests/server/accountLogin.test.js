/**
 * Username+passphrase account login (the "kingdom key").
 *
 * The client derives a stable `player_<hex>` key from credentials and
 * presents it as the `tetches_auth_key` cookie. `resolvePlayerIdForSocket`
 * maps it to the account's public id (`accountIdForKey` — the key itself
 * is a credential and must never be broadcast) and must:
 *   - resume an existing account (keeping its kingdom),
 *   - migrate the current guest kingdom onto the account on first login,
 *   - or claim a fresh account when there's nothing to carry over.
 * A malformed key must be ignored so it can never hijack another id.
 */

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const Disconnects = require('../../server/world/Disconnects');
const {
	resolvePlayerIdForSocket,
	isWellFormedAuthKey,
} = require('../../server/sockets/connection');
const { accountIdForKey, bindNewSecret } = require('../../server/security/playerSession');

function fakeSocket(cookieStr, query = {}) {
	return {
		id: 'sock-' + Math.random().toString(16).slice(2, 8),
		handshake: { headers: { cookie: cookieStr || '' }, query },
		join: jest.fn(),
		emit: jest.fn(),
		disconnect: jest.fn(),
	};
}

// resolvePlayerIdForSocket only ever calls lifecycleService.removePlayerCompletely.
const services = {
	lifecycleService: {
		removePlayerCompletely: jest.fn((id) => World.removePlayer(id)),
	},
};

const KEY_A = 'player_' + 'a'.repeat(32);
const KEY_B = 'player_' + 'b'.repeat(32);
const KEY_C = 'player_' + 'c'.repeat(32);
const ID_A = accountIdForKey(KEY_A);
const ID_B = accountIdForKey(KEY_B);
const ID_C = accountIdForKey(KEY_C);

describe('account login — auth-key adoption', () => {
	beforeEach(() => {
		World.resetWorld();
		Sessions.clearAll();
		Disconnects.clearAll();
		services.lifecycleService.removePlayerCompletely.mockClear();
	});

	test('claims a fresh account when there is no record and no guest', () => {
		const socket = fakeSocket(`tetches_auth_key=${KEY_A}`, { playerName: 'Ada' });
		const id = resolvePlayerIdForSocket(socket, services);
		expect(id).toBe(ID_A);
		expect(id).not.toContain(KEY_A);
		expect(World.getPlayer(ID_A)).toBeTruthy();
		expect(World.getPlayer(ID_A).name).toBe('Ada');
		expect(socket.join).toHaveBeenCalled();
	});

	test('resumes an existing account and keeps its kingdom', () => {
		World.upsertPlayer(ID_B, { name: 'Existing' });
		const w = World.getWorld();
		w.homeZones[ID_B] = { x: 9, z: 9, width: 8, height: 2, player: ID_B };
		w.chessPieces.push({ id: 'k', player: ID_B, type: 'king' });

		const socket = fakeSocket(`tetches_auth_key=${KEY_B}`);
		const id = resolvePlayerIdForSocket(socket, services);

		expect(id).toBe(ID_B);
		expect(World.getPlayer(ID_B).name).toBe('Existing');
		expect(w.homeZones[ID_B]).toBeTruthy();
		expect(w.chessPieces).toHaveLength(1);
	});

	test('moves a legacy account (stored under its raw key) to the derived id', () => {
		World.upsertPlayer(KEY_B, { name: 'Legacy' });
		const w = World.getWorld();
		w.homeZones[KEY_B] = { x: 9, z: 9, width: 8, height: 2, player: KEY_B };
		w.chessPieces.push({ id: 'k', player: KEY_B, type: 'king' });

		const id = resolvePlayerIdForSocket(fakeSocket(`tetches_auth_key=${KEY_B}`), services);

		expect(id).toBe(ID_B);
		expect(World.getPlayer(KEY_B)).toBeNull();
		expect(World.getPlayer(ID_B).name).toBe('Legacy');
		expect(w.homeZones[ID_B].player).toBe(ID_B);
		expect(w.chessPieces[0].player).toBe(ID_B);
	});

	test('migrates the current guest kingdom onto the account on first login', () => {
		const deviceId = 'd3adb33f-0000-4000-8000-000000000000';
		const guest = World.upsertPlayer(deviceId, { name: 'Guesty' });
		const secret = bindNewSecret(guest);
		const w = World.getWorld();
		w.homeZones[deviceId] = { x: 3, z: 3, width: 8, height: 2, player: deviceId };
		w.chessPieces.push({ id: 'k1', player: deviceId, type: 'king' });
		w.board.cells['1,1'] = [{ type: 'tetromino', player: deviceId }];

		const socket = fakeSocket(`tetches_auth_key=${KEY_C}; tetches_player_id=${deviceId}; tetches_session=${secret}`);
		const id = resolvePlayerIdForSocket(socket, services);

		expect(id).toBe(ID_C);
		// Guest identity is gone; everything now belongs to the account.
		expect(World.getPlayer(deviceId)).toBeNull();
		expect(World.getPlayer(ID_C)).toBeTruthy();
		expect(w.homeZones[ID_C]).toBeTruthy();
		expect(w.homeZones[ID_C].player).toBe(ID_C);
		expect(w.homeZones[deviceId]).toBeUndefined();
		expect(w.chessPieces[0].player).toBe(ID_C);
		expect(w.board.cells['1,1'][0].player).toBe(ID_C);
	});

	test('a fresh key can NOT absorb someone else\'s guest kingdom without its secret', () => {
		const victimId = 'b0b0b0b0-0000-4000-8000-000000000000';
		const victim = World.upsertPlayer(victimId, { name: 'Victim' });
		bindNewSecret(victim);
		const w = World.getWorld();
		w.homeZones[victimId] = { x: 3, z: 3, width: 8, height: 2, player: victimId };

		const socket = fakeSocket(`tetches_auth_key=${KEY_C}; tetches_player_id=${victimId}`);
		const id = resolvePlayerIdForSocket(socket, services);

		expect(id).toBe(ID_C);
		expect(World.getPlayer(victimId).name).toBe('Victim');
		expect(w.homeZones[victimId].player).toBe(victimId);
		expect(w.homeZones[ID_C]).toBeUndefined();
	});

	test('logging into an EXISTING account never clobbers it with the guest kingdom', () => {
		// Account already has a kingdom; a different guest kingdom sits on
		// this device. Login must resume the account, leaving guest orphaned.
		World.upsertPlayer(ID_A, { name: 'Account' });
		const w = World.getWorld();
		w.homeZones[ID_A] = { x: 1, z: 1, width: 8, height: 2, player: ID_A };

		const deviceId = 'cafe0000-0000-4000-8000-000000000000';
		World.upsertPlayer(deviceId, { name: 'Guesty' });
		w.homeZones[deviceId] = { x: 50, z: 50, width: 8, height: 2, player: deviceId };

		const socket = fakeSocket(`tetches_auth_key=${KEY_A}; tetches_player_id=${deviceId}`);
		const id = resolvePlayerIdForSocket(socket, services);

		expect(id).toBe(ID_A);
		expect(World.getPlayer(ID_A).name).toBe('Account');
		expect(w.homeZones[ID_A].x).toBe(1); // untouched
	});

	test('a malformed auth key is ignored (falls through to a fresh identity)', () => {
		const socket = fakeSocket('tetches_auth_key=not-a-real-key');
		const id = resolvePlayerIdForSocket(socket, services);
		expect(id).not.toBe('not-a-real-key');
		expect(World.getPlayer(id)).toBeTruthy(); // a fresh uuid identity
	});
});

describe('isWellFormedAuthKey — strict namespace gate', () => {
	test('accepts derived keys of 16–64 hex chars', () => {
		expect(isWellFormedAuthKey('player_' + 'a'.repeat(16))).toBe(true);
		expect(isWellFormedAuthKey('player_' + 'a'.repeat(32))).toBe(true);
		expect(isWellFormedAuthKey('player_' + '0123456789abcdef'.repeat(4))).toBe(true); // 64
	});

	test('rejects anything that could collide with other id namespaces', () => {
		expect(isWellFormedAuthKey('player_' + 'a'.repeat(15))).toBe(false); // too short
		expect(isWellFormedAuthKey('player_' + 'a'.repeat(65))).toBe(false); // too long
		expect(isWellFormedAuthKey('player_DEADBEEF12345678')).toBe(false);  // non-hex (upper)
		expect(isWellFormedAuthKey('ai-expert-12345678')).toBe(false);       // bot id
		expect(isWellFormedAuthKey('123e4567-e89b-12d3-a456-426614174000')).toBe(false); // uuid
		expect(isWellFormedAuthKey('')).toBe(false);
		expect(isWellFormedAuthKey(null)).toBe(false);
		expect(isWellFormedAuthKey(undefined)).toBe(false);
	});
});
