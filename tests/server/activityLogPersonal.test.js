/**
 * A player's own failed moves (dissolved tetrominoes, rejected chess
 * moves) go only to that player, not to the whole world. Broadcast, they
 * were ~37 messages a second per client in a 40-player load test and
 * pushed real events out of the shared 200-event backlog.
 */

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const { createActivityLogService } = require('../../server/world/activityLog');

function setup() {
	World.resetWorld({ id: 'global_game' });
	Sessions.clearAll();
	const roomEmits = [];
	const io = { to: () => ({ emit: (event, payload) => roomEmits.push({ event, payload }) }) };
	const own = [];
	Sessions.bind({ id: 's1', emit: (event, payload) => own.push({ event, payload }) }, 'p1');
	return { log: createActivityLogService({ io }), roomEmits, own };
}

afterEach(() => Sessions.clearAll());

test('a rejected chess move reaches only its player and stays out of the shared backlog', () => {
	const { log, roomEmits, own } = setup();
	log.recordChessMoveRejected({ playerId: 'p1', playerName: 'Ann', pieceType: 'ROOK', reason: 'bad_geometry' });
	expect(own.map(e => e.payload.type)).toEqual(['chess_move_rejected']);
	expect(roomEmits).toHaveLength(0);
	expect(log.snapshot()).toHaveLength(0);
});

test('a dissolved tetromino is personal too', () => {
	const { log, roomEmits, own } = setup();
	log.recordTetrominoDissolved({ playerId: 'p1', playerName: 'Ann', x: 0, z: 0, pieceType: 'O', reason: 'not_adjacent' });
	expect(own).toHaveLength(1);
	expect(roomEmits).toHaveLength(0);
});

test('with no socket of their own (e.g. a battle seat) it is shared as before', () => {
	const { log, roomEmits, own } = setup();
	log.recordChessMoveRejected({ playerId: 'seat-x', playerName: 'Seat', reason: 'bad_geometry' });
	expect(own).toHaveLength(0);
	expect(roomEmits).toHaveLength(1);
	expect(log.snapshot()).toHaveLength(1);
});

test('real events are still broadcast to everyone', () => {
	const { log, roomEmits } = setup();
	log.recordTetrominoPlaced({ playerId: 'p1', playerName: 'Ann', x: 0, z: 0, pieceType: 'O' });
	expect(roomEmits).toHaveLength(1);
	expect(log.snapshot()).toHaveLength(1);
});
