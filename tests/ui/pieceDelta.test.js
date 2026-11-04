/**
 * Piece deltas (public/js/utils/pieceDelta.js): clients rebuild the full
 * chessPieces list from the pieces that changed and the ids that went.
 */

import { mergePieceDelta, expandPieceDelta } from '../../public/js/utils/pieceDelta.js';

const a = { id: 'a', position: { x: 0, z: 0 } };
const b = { id: 'b', position: { x: 1, z: 0 } };

test('upserts changed pieces and drops removed ids', () => {
	const moved = { id: 'a', position: { x: 0, z: 1 } };
	const added = { id: 'c', position: { x: 2, z: 0 } };
	expect(mergePieceDelta([a, b], [moved, added], ['b'])).toEqual([moved, added]);
});

test('is idempotent, so a slightly stale baseline still converges', () => {
	const once = mergePieceDelta([a], [b], ['gone']);
	expect(mergePieceDelta(once, [b], ['gone'])).toEqual([a, b]);
});

test('expandPieceDelta fills chessPieces and strips the delta fields', () => {
	const state = { pieceChanges: [b], removedPieceIds: [] };
	expandPieceDelta(state, [a]);
	expect(state).toEqual({ chessPieces: [a, b] });
});

test('an empty delta leaves chessPieces out, so nothing re-renders', () => {
	const state = { pieceChanges: [], removedPieceIds: [] };
	expandPieceDelta(state, [a]);
	expect(state).toEqual({});
});

test('a full update with chessPieces is left alone', () => {
	const state = { chessPieces: [b] };
	expect(expandPieceDelta(state, [a])).toEqual({ chessPieces: [b] });
});

describe('expandPlayerDelta', () => {
	const { expandPlayerDelta } = require('../../public/js/utils/pieceDelta.js');

	test('merges changed players into the client map and drops removed ones', () => {
		const current = { p1: { id: 'p1', name: 'Ann' }, p2: { id: 'p2', name: 'Bo' } };
		const state = { playerChanges: [{ id: 'p1', name: 'Ann', lastActiveAt: 5 }], removedPlayerIds: ['p2'] };
		expandPlayerDelta(state, current);
		expect(state).toEqual({ players: [{ id: 'p1', name: 'Ann', lastActiveAt: 5 }] });
	});

	test('nothing changed leaves players out', () => {
		const state = { playerChanges: [], removedPlayerIds: [] };
		expandPlayerDelta(state, { p1: { id: 'p1' } });
		expect(state).toEqual({});
	});
});

test('expandDisconnectedDelta merges changes and removals into the map', () => {
	const { expandDisconnectedDelta } = require('../../public/js/utils/pieceDelta.js');
	const state = { disconnectedChanges: { 'p:1,1': { since: 3 } }, disconnectedRemoved: ['p:0,0'] };
	expandDisconnectedDelta(state, { 'p:0,0': { since: 1 }, 'p:2,2': { since: 2 } });
	expect(state).toEqual({ disconnectedSince: { 'p:2,2': { since: 2 }, 'p:1,1': { since: 3 } } });
});
