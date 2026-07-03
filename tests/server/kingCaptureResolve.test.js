/**
 * Unit tests for the shared king-capture resolver.
 *
 * `kingCaptureService.resolveKingCapture` is the single entry-point used
 * by BOTH the human chess handler and the AI. It must:
 *   • execute a normal (lone) king capture,
 *   • be idempotent when the defeated player is already eliminated, and
 *   • hand off to a King's Duel when an opposing capture is already
 *     pending inside the simultaneous-capture window.
 *
 * Previously the AI bypassed all of this by calling `executeKingCapture`
 * directly (so AI captures were never duel-eligible). These tests guard
 * the consolidation.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const { createKingCaptureService } = require(path.join('..', '..', 'server', 'king', 'capture'));

function makeIo() {
	return { to() { return { emit() { /* noop */ } }; }, emit() { /* noop */ } };
}
function makeBroadcaster() {
	return { broadcastGameUpdate() { /* noop */ } };
}
function makeGameManager() {
	// resolveKingCapture → executeKingCapture only touches the island
	// manager (no inherited pawns path) and the board manager indirectly.
	return {
		islandManager: { checkForIslandsAfterRowClear() { /* noop */ } },
		boardManager: {},
	};
}

function seedTwoPlayers() {
	World.resetWorld({ id: 'global_game' });
	World.upsertPlayer('p1', { color: 0xff0000 });
	World.upsertPlayer('p2', { color: 0x0000ff });
	const world = World.getWorld();
	// A non-pawn so executeKingCapture has something to transfer without
	// scheduling the (timer-based) suicidal-pawn detonation chain.
	world.chessPieces.push({ id: 'p2-R', type: 'ROOK', player: 'p2', position: { x: 1, z: 1 } });
	world.board.cells['1,1'] = [{ type: 'chess', pieceType: 'rook', player: 'p2', pieceId: 'p2-R' }];
	return world;
}

describe('kingCaptureService.resolveKingCapture', () => {
	test('executes a lone king capture and records it in the window', () => {
		const world = seedTwoPlayers();
		const svc = createKingCaptureService({
			io: makeIo(), gameManager: makeGameManager(), broadcaster: makeBroadcaster(),
		});

		const result = svc.resolveKingCapture({ captorId: 'p1', defeatedId: 'p2' });

		expect(result.executed).toBe(true);
		expect(result.duel).toBeFalsy();
		expect(world.players.p2.eliminated).toBe(true);
		// Defeated player's forces defect to the captor.
		expect(world.chessPieces.find(p => p.id === 'p2-R').player).toBe('p1');
		expect(Array.isArray(world.pendingKingCaptures)).toBe(true);
		expect(world.pendingKingCaptures.some(
			c => c.captorId === 'p1' && c.defeatedId === 'p2'
		)).toBe(true);
	});

	test('is idempotent when the defeated player is already eliminated', () => {
		const world = seedTwoPlayers();
		world.players.p2.eliminated = true;
		const svc = createKingCaptureService({
			io: makeIo(), gameManager: makeGameManager(), broadcaster: makeBroadcaster(),
		});

		const result = svc.resolveKingCapture({ captorId: 'p1', defeatedId: 'p2' });

		expect(result.executed).toBe(false);
		expect(result.alreadyEliminated).toBe(true);
		// Forces NOT transferred — the capture was a no-op.
		expect(world.chessPieces.find(p => p.id === 'p2-R').player).toBe('p2');
	});

	test('hands off to a King\'s Duel when a reverse capture is pending', () => {
		const world = seedTwoPlayers();
		// p2 had already captured p1's king moments ago.
		world.pendingKingCaptures = [{ captorId: 'p2', defeatedId: 'p1', timestamp: Date.now() }];

		let duelArgs = null;
		const duelService = {
			startDuel(a, b) { duelArgs = [a, b]; return 'duel-xyz'; },
		};
		const svc = createKingCaptureService({
			io: makeIo(), gameManager: makeGameManager(), broadcaster: makeBroadcaster(),
		});
		svc.setDuelService(duelService);

		const result = svc.resolveKingCapture({ captorId: 'p1', defeatedId: 'p2' });

		expect(result.duel).toBe(true);
		expect(result.duelId).toBe('duel-xyz');
		expect(duelArgs).toEqual(['p2', 'p1']);
		// Neither player is resolved — the duel decides who actually loses.
		expect(world.players.p1.eliminated).toBeFalsy();
		expect(world.players.p2.eliminated).toBeFalsy();
		// The reverse pending entry is consumed.
		expect(world.pendingKingCaptures.some(c => c.captorId === 'p2')).toBe(false);
	});

	test('falls back to executing when no duel service is wired', () => {
		const world = seedTwoPlayers();
		world.pendingKingCaptures = [{ captorId: 'p2', defeatedId: 'p1', timestamp: Date.now() }];
		const svc = createKingCaptureService({
			io: makeIo(), gameManager: makeGameManager(), broadcaster: makeBroadcaster(),
		});
		// No setDuelService — a reverse capture can't start a duel, so we
		// must still resolve the capture rather than silently dropping it.
		const result = svc.resolveKingCapture({ captorId: 'p1', defeatedId: 'p2' });

		expect(result.executed).toBe(true);
		expect(world.players.p2.eliminated).toBe(true);
	});

	test('never transfers the defeated king to the captor (one-king rule)', () => {
		const world = seedTwoPlayers();
		// Simulate a caller that DIDN'T pre-remove the king (or a respawn
		// racing the capture): the defeated player still owns a live king
		// when executeKingCapture runs. It must be retired, never defected.
		world.chessPieces.push({ id: 'p2-K', type: 'KING', player: 'p2', position: { x: 2, z: 2 } });
		world.board.cells['2,2'] = [{ type: 'chess', pieceType: 'king', player: 'p2', pieceId: 'p2-K' }];
		const svc = createKingCaptureService({
			io: makeIo(), gameManager: makeGameManager(), broadcaster: makeBroadcaster(),
		});

		svc.resolveKingCapture({ captorId: 'p1', defeatedId: 'p2' });

		// The defeated king is gone — NOT owned by the captor.
		expect(world.chessPieces.find(p => p.id === 'p2-K')).toBeUndefined();
		// The captor never ends up holding two kings.
		const captorKings = world.chessPieces.filter(
			p => p.player === 'p1' && String(p.type).toUpperCase() === 'KING'
		);
		expect(captorKings.length).toBe(0);
		// Its supporting cell marker is cleaned up too.
		const cell = world.board.cells['2,2'];
		const stillThere = Array.isArray(cell) && cell.some(
			it => it && it.type === 'chess' && String(it.pieceId) === 'p2-K'
		);
		expect(stillThere).toBe(false);
		// Non-king forces still defect as normal.
		expect(world.chessPieces.find(p => p.id === 'p2-R').player).toBe('p1');
	});
});
