/**
 * game_update piece deltas (server/net/broadcasts.js).
 *
 * Every delta used to carry the whole chessPieces array (~170KB with 700
 * pieces) when one or two had moved. Clients that connect with
 * proto=2 now get only the changes; older clients keep the full list.
 */

const World = require('../../server/world/World');
const { createBroadcaster, PROTO_ROOMS, protoRoomFor } = require('../../server/net/broadcasts');

function fakeIo() {
	const sent = [];
	const target = (room, except = null) => ({
		except: (ex) => target(room, ex),
		emit: (event, payload) => sent.push({ room, except, event, payload }),
	});
	return { sent, to: (room) => target(room) };
}

function setup() {
	World.resetWorld({ id: 'global_game' });
	const world = World.getWorld();
	world.board.cells['0,0'] = [{ type: 'tetromino', player: 'p1' }];
	world.chessPieces.push(
		{ id: 'k1', type: 'KING', player: 'p1', position: { x: 0, z: 0 } },
		{ id: 'r1', type: 'ROOK', player: 'p1', position: { x: 1, z: 0 } },
	);
	const io = fakeIo();
	const broadcaster = createBroadcaster({ io, persistence: { markDirty() {} } });
	broadcaster.broadcastGameUpdate(); // first broadcast is a full baseline
	io.sent.length = 0;
	return { world, io, broadcaster };
}

const legacy = (sent) => sent.find(s => s.except === PROTO_ROOMS.pieceDeltas).payload;
const deltas = (sent) => sent.find(s => s.except === PROTO_ROOMS.legacy).payload;

test('a moved piece goes out as a piece delta; legacy clients still get the full list', () => {
	const { world, io, broadcaster } = setup();
	world.chessPieces[1].position = { x: 2, z: 0 };
	broadcaster.broadcastGameUpdate();

	expect(legacy(io.sent).chessPieces).toHaveLength(2);
	const d = deltas(io.sent);
	expect(d.chessPieces).toBeUndefined();
	expect(d.pieceChanges).toEqual([{ id: 'r1', type: 'ROOK', player: 'p1', position: { x: 2, z: 0 } }]);
	expect(d.removedPieceIds).toEqual([]);
});

test('a captured piece is sent as a removed id', () => {
	const { world, io, broadcaster } = setup();
	world.chessPieces.splice(1, 1);
	broadcaster.broadcastGameUpdate();
	expect(deltas(io.sent)).toMatchObject({ pieceChanges: [], removedPieceIds: ['r1'] });
});

test('sockets pick their room from the handshake', () => {
	expect(protoRoomFor({ handshake: { query: { proto: '2' } } })).toBe(PROTO_ROOMS.pieceDeltas);
	expect(protoRoomFor({ handshake: { query: {} } })).toBe(PROTO_ROOMS.legacy);
});

test('player summaries go out as deltas too; legacy clients get the whole list', () => {
	const { world, io, broadcaster } = setup();
	World.upsertPlayer('p1', { name: 'Ann' });
	World.upsertPlayer('p2', { name: 'Bo' });
	broadcaster.broadcastGameUpdate();
	io.sent.length = 0;

	world.players.p2.name = 'Bob';
	broadcaster.broadcastGameUpdate();
	expect(legacy(io.sent).players.map(p => p.id).sort()).toEqual(['p1', 'p2']);
	const d = deltas(io.sent);
	expect(d.players).toBeUndefined();
	expect(d.playerChanges.map(p => [p.id, p.name])).toEqual([['p2', 'Bob']]);
	expect(d.removedPlayerIds).toEqual([]);
});

test('disconnectedSince goes out as a map delta, and not at all when unchanged', () => {
	const { world, io, broadcaster } = setup();
	world.disconnectedSince = { 'p1:0,0': { since: 1, moveSnapshot: 2 } };
	broadcaster.broadcastGameUpdate();
	expect(deltas(io.sent)).toMatchObject({ disconnectedChanges: { 'p1:0,0': { since: 1, moveSnapshot: 2 } }, disconnectedRemoved: [] });
	expect(legacy(io.sent).disconnectedSince).toEqual(world.disconnectedSince);

	io.sent.length = 0;
	broadcaster.broadcastGameUpdate();
	const d = deltas(io.sent);
	expect(d.disconnectedSince).toBeUndefined();
	expect(d.disconnectedChanges).toBeUndefined();

	io.sent.length = 0;
	world.disconnectedSince = {};
	broadcaster.broadcastGameUpdate();
	expect(deltas(io.sent)).toMatchObject({ disconnectedChanges: {}, disconnectedRemoved: ['p1:0,0'] });
});
