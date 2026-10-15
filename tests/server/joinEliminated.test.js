/**
 * An eliminated player can't respawn in place with `join_game`.
 *
 * Starting over means refreshing, which mints a fresh identity in
 * connection.js. Re-joining on the same socket used to re-register the
 * old record: a new home zone and pieces, but kingLives 0 and the old
 * basket and score carried over.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const GameManager = require(path.join('..', '..', 'server', 'game', 'GameManager'));
const { registerJoinHandlers } = require(path.join('..', '..', 'server', 'sockets', 'join'));

function join(playerId) {
	const handlers = {};
	const socket = { id: 's', on: (e, h) => { handlers[e] = h; }, emit() {}, join() {}, to() { return { emit() {} }; } };
	const noop = () => {};
	registerJoinHandlers(socket, {
		playerId,
		io: { to() { return { emit() {} }; } },
		gameManager: new GameManager(),
		broadcaster: { broadcastGameUpdate: noop, buildPlayersList: () => [], emitFullStateTo: noop, buildGameStatePayload: () => ({}) },
		integrityService: { runIslandIntegrityPass: () => ({ changed: false }) },
		persistence: { markDirty: noop },
		lifecycleService: {},
	});
	let ack = null;
	handlers.join_game({}, (r) => { ack = r; });
	return ack;
}

describe('join_game after elimination', () => {
	beforeEach(() => World.resetWorld({ id: 'global_game' }));

	test('is refused and changes nothing', () => {
		World.upsertPlayer('p1', { color: 1, eliminated: true, kingLives: 0, capturedBasket: [{ type: 'QUEEN' }] });
		const ack = join('p1');
		expect(ack).toMatchObject({ success: false, reason: 'eliminated' });
		const world = World.getWorld();
		expect(world.players.p1.eliminated).toBe(true);
		expect(world.homeZones.p1).toBeUndefined();
		expect(world.chessPieces.filter(p => p.player === 'p1')).toHaveLength(0);
	});

	test('a player who is still in the game joins as before', () => {
		World.upsertPlayer('p2', { color: 2 });
		const ack = join('p2');
		expect(ack).toMatchObject({ success: true });
		expect(World.getWorld().homeZones.p2).toBeDefined();
	});
});
