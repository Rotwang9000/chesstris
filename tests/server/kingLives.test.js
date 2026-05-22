/**
 * Tests for the king-life service.
 *
 * Covers the user's "kings get 3 lives, fly back home on death" rule:
 *   • A `FELL_TO_WATER` removal respawns the king and decrements lives.
 *   • The 3rd consecutive death marks the player eliminated and lets
 *     the normal removal proceed.
 *   • Reasons we treat as intentional (`captured`, `detonated`) bypass
 *     the service entirely.
 */

const path = require('path');

const World = require(path.join('..', '..', 'server', 'world', 'World'));
const pieces = require(path.join('..', '..', 'server', 'game', 'pieces'));
const { createKingLifeService, KING_INITIAL_LIVES } = require(
	path.join('..', '..', 'server', 'king', 'kingLives')
);

function makeIo() {
	const events = [];
	return {
		_events: events,
		to() { return { emit(name, payload) { events.push({ name, payload }); } }; },
		emit(name, payload) { events.push({ name, payload }); },
	};
}

function makeBroadcaster() {
	return { broadcastGameUpdate() {} };
}

function makePersistence() {
	let count = 0;
	return {
		markDirty() { count++; },
		get dirtyCount() { return count; },
	};
}

function makeActivityLog() {
	const records = [];
	return {
		records,
		record(type, payload) { records.push({ type, payload }); },
	};
}

function seedWorldWithKing({ playerId = 'p1', kingAt = { x: 5, z: 5 } } = {}) {
	World.resetWorld();
	const world = World.getWorld();
	World.upsertPlayer(playerId, { name: 'Player', color: 0xCC0000 });
	world.homeZones[playerId] = { x: 0, z: 0, width: 8, height: 2, orientation: 0 };
	const king = {
		id: 'king-1',
		type: 'KING',
		player: playerId,
		position: { x: kingAt.x, z: kingAt.z },
		orientation: 0,
	};
	world.chessPieces.push(king);
	world.board.cells[`${kingAt.x},${kingAt.z}`] = [
		{ type: 'tetromino', pieceType: 'king_anchor', player: playerId },
		{ type: 'chess', pieceType: 'king', player: playerId, pieceId: king.id },
	];
	return { world, king };
}

describe('KingLifeService', () => {
	test('respawns the king at home after a fell_to_water removal', () => {
		const { world, king } = seedWorldWithKing();
		const io = makeIo();
		const persistence = makePersistence();
		const activityLog = makeActivityLog();
		const service = createKingLifeService({
			io, broadcaster: makeBroadcaster(), persistence, activityLog,
		});

		const before = world.players.p1.kingLives;
		expect(before === undefined || before === KING_INITIAL_LIVES).toBe(true);

		const outcome = service.handleKingDeath(king, {
			reason: pieces.REMOVAL_REASONS.FELL_TO_WATER,
		});

		expect(outcome).not.toBeNull();
		expect(outcome.respawned).toBe(true);
		expect(outcome.remainingLives).toBe(KING_INITIAL_LIVES - 1);
		expect(world.players.p1.kingLives).toBe(KING_INITIAL_LIVES - 1);
		expect(world.chessPieces).toHaveLength(1);
		// King has been re-positioned at the home-zone centre.
		const home = world.homeZones.p1;
		const expectedX = Math.round(home.x + home.width / 2);
		const expectedZ = Math.round(home.z + home.height / 2);
		expect(king.position).toEqual({ x: expectedX, z: expectedZ });
		const homeKey = `${expectedX},${expectedZ}`;
		const cellContents = world.board.cells[homeKey];
		expect(Array.isArray(cellContents)).toBe(true);
		expect(cellContents.some(i => i && i.isKingAnchor)).toBe(true);
		expect(cellContents.some(i => i && i.type === 'chess' && i.pieceId === king.id)).toBe(true);
		expect(io._events.some(e => e.name === 'king_respawned')).toBe(true);
		expect(activityLog.records.some(r => r.type === 'king_respawned')).toBe(true);
		expect(persistence.dirtyCount).toBeGreaterThan(0);
	});

	test('eliminates the player on the last life', () => {
		const { world, king } = seedWorldWithKing();
		const io = makeIo();
		const service = createKingLifeService({
			io, broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});

		for (let i = 0; i < KING_INITIAL_LIVES - 1; i++) {
			service.handleKingDeath(king, { reason: pieces.REMOVAL_REASONS.FELL_TO_WATER });
		}
		expect(world.players.p1.eliminated).toBeFalsy();
		expect(world.players.p1.kingLives).toBe(1);

		const finalOutcome = service.handleKingDeath(king, {
			reason: pieces.REMOVAL_REASONS.FELL_TO_WATER,
		});

		expect(finalOutcome.respawned).toBe(false);
		expect(finalOutcome.final).toBe(true);
		expect(world.players.p1.eliminated).toBe(true);
		expect(world.players.p1.kingLives).toBe(0);
		expect(io._events.some(e => e.name === 'king_eliminated')).toBe(true);
	});

	test('non-king pieces are ignored by the life service', () => {
		const { world } = seedWorldWithKing();
		const pawn = {
			id: 'pawn-1', type: 'PAWN', player: 'p1', position: { x: 6, z: 5 },
		};
		world.chessPieces.push(pawn);
		const service = createKingLifeService({
			io: makeIo(), broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});

		const outcome = service.handleKingDeath(pawn, {
			reason: pieces.REMOVAL_REASONS.FELL_TO_WATER,
		});

		expect(outcome).toBeNull();
		expect(world.players.p1.kingLives).toBeUndefined();
	});

	test('intentional removal reasons bypass the life cost', () => {
		const { world, king } = seedWorldWithKing();
		const service = createKingLifeService({
			io: makeIo(), broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});

		const intentional = [
			pieces.REMOVAL_REASONS.CAPTURED,
			pieces.REMOVAL_REASONS.DETONATED,
			pieces.REMOVAL_REASONS.KING_DETONATION_COLLATERAL,
			pieces.REMOVAL_REASONS.SUICIDAL_PAWN,
			pieces.REMOVAL_REASONS.PLAYER_LEFT,
			pieces.REMOVAL_REASONS.WORLD_RESET,
			pieces.REMOVAL_REASONS.OWNER_GONE,
		];

		for (const reason of intentional) {
			const outcome = service.handleKingDeath(king, { reason });
			expect(outcome).toBeNull();
		}
		// kingLives should never have been initialised.
		expect(world.players.p1.kingLives).toBeUndefined();
	});

	test('removePiece honours the kingLifeService hook', () => {
		const { world, king } = seedWorldWithKing();
		const service = createKingLifeService({
			io: makeIo(), broadcaster: makeBroadcaster(), persistence: makePersistence(),
		});

		const removed = pieces.removePiece(world, king, {
			reason: pieces.REMOVAL_REASONS.FELL_TO_WATER,
			kingLifeService: service,
		});

		expect(removed).toBeNull();
		expect(world.chessPieces).toHaveLength(1);
		expect(world.players.p1.kingLives).toBe(KING_INITIAL_LIVES - 1);
	});
});
