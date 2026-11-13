/**
 * Quick battles: the rising sea, dropped-connection handover, and the
 * bots' sea sense.
 *
 * Same harness as battleMode.test.js — the real World and game
 * managers, with transport and scheduling seams mocked.
 */

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');
const TetrominoManager = require('../../server/game/TetrominoManager');
const { radialBand, ringOuterRadius, BATTLE } = require('../../server/battle/geometry');
const battleRules = require('../../server/battle/rules');
const sea = require('../../server/battle/sea');
const { triageForSea } = require('../../server/ai/actions');
const { createBattleManager } = require('../../server/battle/BattleManager');

const CENTRE = { x: 2000, z: 2000 };

function quickBattle(overrides = {}) {
	return {
		mode: 'quick', status: 'active', centre: CENTRE, playRadius: BATTLE.PLAY_RADIUS,
		seatCount: 2, startedAt: 1_000_000, ...overrides,
	};
}

describe('sea timing', () => {
	test('modes default to quick; only classic opts out', () => {
		expect(sea.normaliseBattleMode(undefined)).toBe('quick');
		expect(sea.normaliseBattleMode('CLASSIC')).toBe('classic');
		expect(sea.normaliseBattleMode('nonsense')).toBe('quick');
	});

	test('classic battles (and pre-mode battles) never sink', () => {
		expect(sea.sinkAtMs(quickBattle({ mode: 'classic' }), 2000, 1990)).toBe(Infinity);
		expect(sea.sinkAtMs(quickBattle({ mode: undefined }), 2000, 1990)).toBe(Infinity);
		expect(sea.publicSea(quickBattle({ mode: 'classic' }))).toBeNull();
	});

	test('the sea block starts north on the outer ring edge after the calm', () => {
		const battle = quickBattle();
		const outer = ringOuterRadius(BATTLE.PLAY_RADIUS);
		expect(sea.outerBand(battle)).toBe(outer);
		// Due north of the centre, on the outermost band: first to go.
		expect(sea.sinkAtMs(battle, CENTRE.x, CENTRE.z - outer)).toBe(battle.startedAt + sea.SEA.CALM_MS);
		// Nothing goes during the calm.
		expect(sea.cellsSinkingBetween(battle, 0, battle.startedAt + sea.SEA.CALM_MS - 1)).toEqual([]);
	});

	test('it eats one cell at a time at a steady pace, spiralling clockwise and inward', () => {
		const battle = quickBattle();
		const start = sea.seaStartMs(battle);
		const outer = sea.outerBand(battle);
		const all = sea.cellsSinkingBetween(battle, 0, Infinity);
		// Exactly one cell per CELL_MS, no two at once.
		all.forEach((c, i) => expect(c.t).toBe(start + i * sea.SEA.CELL_MS));
		// Neighbours along the path: the outer band goes clockwise from north…
		const at = (x, z) => sea.sinkAtMs(battle, x, z);
		const n = at(CENTRE.x, CENTRE.z - outer);
		const e = at(CENTRE.x + outer, CENTRE.z);
		const sth = at(CENTRE.x, CENTRE.z + outer);
		const w = at(CENTRE.x - outer, CENTRE.z);
		expect(n).toBeLessThan(e);
		expect(e).toBeLessThan(sth);
		expect(sth).toBeLessThan(w);
		// …and every cell of a band goes before any cell further in.
		const bandOf = c => radialBand(CENTRE, c.x, c.z);
		for (let i = 1; i < all.length; i++) expect(bandOf(all[i])).toBeLessThanOrEqual(bandOf(all[i - 1]));
		// The centre is last.
		expect(all[all.length - 1]).toMatchObject({ x: CENTRE.x, z: CENTRE.z });
		expect(sea.seaEndMs(battle)).toBe(start + all.length * sea.SEA.CELL_MS);
	});

	test('the server sinks at most one cell per tick', () => {
		expect(sea.SEA.TICK_MS).toBeLessThan(sea.SEA.CELL_MS);
	});

	test('every arena cell sinks exactly once, in time order, and a 1v1 lasts ~7 minutes', () => {
		const battle = quickBattle();
		const all = sea.cellsSinkingBetween(battle, 0, Infinity);
		const keys = new Set(all.map(c => `${c.x},${c.z}`));
		expect(keys.size).toBe(all.length);
		for (const c of all) expect(radialBand(CENTRE, c.x, c.z)).toBeLessThanOrEqual(sea.outerBand(battle));
		for (let i = 1; i < all.length; i++) expect(all[i].t).toBeGreaterThanOrEqual(all[i - 1].t);
		const minutes = (sea.seaEndMs(battle) - battle.startedAt) / 60000;
		expect(minutes).toBeGreaterThan(5);
		expect(minutes).toBeLessThan(9);
	});

	test('placements on sunk ground are refused', () => {
		const world = { players: { s0: { battleId: 'b1' } }, battles: { b1: quickBattle({ id: 'b1' }) } };
		const battle = world.battles.b1;
		const northEdge = { x: CENTRE.x, z: CENTRE.z - BATTLE.PLAY_RADIUS };
		const realNow = Date.now;
		try {
			Date.now = () => sea.sinkAtMs(battle, northEdge.x, northEdge.z) - 1;
			expect(battleRules.validateArenaBounds(world, 's0', [northEdge]).valid).toBe(true);
			Date.now = () => sea.sinkAtMs(battle, northEdge.x, northEdge.z) + 1;
			const late = battleRules.validateArenaBounds(world, 's0', [northEdge]);
			expect(late.valid).toBe(false);
			expect(late.reason).toBe('sunk_by_sea');
		} finally {
			Date.now = realNow;
		}
	});
});

describe('bots and the sea', () => {
	const battle = quickBattle();
	const now = sea.seaStartMs(battle);
	const outer = sea.outerBand(battle);
	// A cell that sinks right now vs one deep inside that's safe for minutes.
	const doomedCell = { x: CENTRE.x, z: CENTRE.z - outer };
	const safeCell = { x: CENTRE.x, z: CENTRE.z - 2 };
	const piece = (type, at) => ({ type, position: { ...at } });

	test('moves onto doomed cells are dropped and escapes rank the king first', () => {
		const king = piece('KING', doomedCell);
		const pawn = piece('PAWN', doomedCell);
		const queen = piece('QUEEN', safeCell);
		const quiet = [
			{ piece: pawn, target: safeCell },          // escape
			{ piece: king, target: safeCell },          // escape (more urgent)
			{ piece: queen, target: doomedCell },       // walks into the sea
			{ piece: queen, target: { x: CENTRE.x + 1, z: CENTRE.z } },
		];
		const out = triageForSea(battle, [], quiet, { now, moveIntervalMs: 5000 });
		expect(out.quiet.some(c => c.target === doomedCell)).toBe(false);
		expect(out.escapes.map(c => c.piece.type)).toEqual(['KING', 'PAWN']);
	});

	test('an escaping king heads for the ground the sea reaches last', () => {
		const king = piece('KING', doomedCell);
		const nearEdge = { x: CENTRE.x, z: CENTRE.z - outer + 6 };  // safe for now, sinks soon
		const inward = { x: CENTRE.x, z: CENTRE.z - 3 };            // sinks much later
		const quiet = [
			{ piece: king, target: nearEdge },
			{ piece: king, target: inward },
		];
		const out = triageForSea(battle, [], quiet, { now, moveIntervalMs: 5000 });
		expect(out.escapes[0].target).toBe(inward);
	});

	test('classic battles leave the candidates alone', () => {
		const quiet = [{ piece: piece('PAWN', safeCell), target: doomedCell }];
		const out = triageForSea(quickBattle({ mode: 'classic' }), [], quiet, { now });
		expect(out.quiet).toBe(quiet);
		expect(out.escapes).toEqual([]);
	});

	test('with nothing safe left, the bot still gets its moves', () => {
		const quiet = [{ piece: piece('PAWN', safeCell), target: doomedCell }];
		const out = triageForSea(battle, [], quiet, { now });
		expect(out.quiet).toHaveLength(1);
	});
});

describe('BattleManager — quick battles', () => {
	let manager;
	let aiStarted;
	let toasts;
	let online;

	function buildManager() {
		const boardManager = new BoardManager();
		const islandManager = new IslandManager();
		const chessManager = new ChessManager(boardManager, islandManager);
		const tetrominoManager = new TetrominoManager(boardManager, islandManager);
		aiStarted = [];
		return createBattleManager({
			gameManager: { boardManager, chessManager, tetrominoManager },
			aiRunner: { startAiPlayer: id => aiStarted.push(id), stopAiPlayer: () => {} },
			broadcaster: { broadcastGameUpdate: () => {} },
			persistence: { markDirty: () => {} },
			lifecycleService: { removePlayerCompletely: id => World.removePlayer(id) },
			io: { to: () => ({ emit: () => {} }) },
		});
	}

	beforeEach(() => {
		World.resetWorld();
		Sessions.clearAll();
		online = new Set(['host1', 'guest1']);
		jest.spyOn(Sessions, 'isOnline').mockImplementation(id => online.has(String(id)));
		toasts = [];
		jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
			if (event === 'server_toast') toasts.push(payload.message);
			return 1;
		});
		const world = World.getWorld();
		world.players.host1 = { id: 'host1', name: 'Hosty' };
		world.players.guest1 = { id: 'guest1', name: 'Guesty' };
		manager = buildManager();
	});

	afterEach(() => jest.restoreAllMocks());

	function startOneVsOne(mode) {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 2, mode });
		manager.joinBattle({ code: created.battle.code, playerId: 'guest1', playerName: 'Guesty' });
		return manager.startBattle({ battleId: created.battle.id, playerId: 'host1' }).battle;
	}

	test('battles are quick by default and tell clients the sea timing', () => {
		const pub = startOneVsOne();
		expect(pub.mode).toBe('quick');
		expect(pub.sea.startsAt).toBe(pub.startedAt + sea.SEA.CALM_MS);
		expect(pub.sea.cellMs).toBe(sea.SEA.CELL_MS);
		expect(startOneVsOne('classic').sea).toBeNull();
	});

	test('the sea eats the ring wall first, in order, and nothing during the calm', () => {
		const pub = startOneVsOne();
		const battle = manager.getBattle(pub.id);
		const cells = World.getWorld().board.cells;
		const outer = sea.outerBand(battle);
		const centre = battle.centre;
		const north = `${centre.x},${centre.z - outer}`;
		const south = `${centre.x},${centre.z + outer}`;
		expect(cells[north]).toBeDefined();

		expect(manager.seaTick({ now: sea.seaStartMs(battle) - 1 })).toBe(false);
		expect(cells[north]).toBeDefined();

		// A few cells in: north has gone, south hasn't yet.
		manager.seaTick({ now: sea.seaStartMs(battle) + 3 * sea.SEA.CELL_MS });
		expect(cells[north]).toBeUndefined();
		expect(cells[south]).toBeDefined();
	});

	test('a king caught by the sea is out for good, credited to the sea', () => {
		const pub = startOneVsOne();
		const battle = manager.getBattle(pub.id);
		const world = World.getWorld();
		// Whichever king the hand reaches first is the one that drowns.
		const kingOf = st => world.chessPieces.find(p => p.player === st.seatId && p.type === 'KING');
		const sinkOf = st => sea.sinkAtMs(battle, kingOf(st).position.x, kingOf(st).position.z);
		const [seat1, seat0] = battle.seats.slice().sort((a, b) => sinkOf(a) - sinkOf(b));
		const t = sinkOf(seat1);
		expect(sinkOf(seat0)).toBeGreaterThan(t + 2);

		manager.seaTick({ now: t + 1 });
		expect(world.chessPieces.some(p => p.player === seat1.seatId && p.type === 'KING')).toBe(false);
		expect(toasts.some(m => m.includes('The sea took') && m.includes(seat1.name))).toBe(true);

		// The king also takes the rest of the army down with it eventually
		// (detonation in production); here the sweep just settles the win.
		const emitted = [];
		Sessions.emitToPlayerSockets.mockImplementation((id, ev, payload) => emitted.push({ ev, payload }));
		manager.tick({ now: t + 2 });
		expect(manager.getBattle(pub.id).winnerSeatId).toBe(seat0.seatId);
		const finished = emitted.find(e => e.ev === 'battle_finished');
		const loser = finished.payload.results.standings.find(r => r.seatId === seat1.seatId);
		expect(loser.knockedOutBy).toBe('the sea');
	});

	test('when the last kings sink in the same sweep, the last one under wins', () => {
		const pub = startOneVsOne();
		const battle = manager.getBattle(pub.id);
		const world = World.getWorld();
		const kingOf = st => world.chessPieces.find(p => p.player === st.seatId && p.type === 'KING');
		const sinkOf = st => sea.sinkAtMs(battle, kingOf(st).position.x, kingOf(st).position.z);
		const [first, last] = battle.seats.slice().sort((a, b) => sinkOf(a) - sinkOf(b));
		const after = sinkOf(last) + 1;

		manager.seaTick({ now: after });            // both kings go in one pass
		manager.tick({ now: after });
		expect(battle.status).toBe('finished');
		expect(battle.winnerSeatId).toBe(last.seatId);
		expect(first.outAt).toBeLessThan(last.outAt);
	});

	test('a seat offline for over a minute is handed to a bot, and reclaimed on return', () => {
		const pub = startOneVsOne();
		const battle = manager.getBattle(pub.id);
		const guestSeat = battle.seats[1];
		const t0 = pub.startedAt + 1000;
		online.delete('guest1');

		manager.tick({ now: t0 });
		manager.tick({ now: t0 + 30 * 1000 });
		expect(guestSeat.isAi).toBe(false);
		manager.tick({ now: t0 + 61 * 1000 });
		expect(guestSeat.isAi).toBe(true);
		expect(guestSeat.leftBy).toBe('guest1');
		expect(aiStarted).toContain(guestSeat.seatId);
		expect(World.getPlayer(guestSeat.seatId).isComputer).toBe(true);
		expect(toasts.some(m => m.includes('lost connection'))).toBe(true);
		expect(battle.status).toBe('active');

		// Back with the code: the same seat, pieces and all.
		online.add('guest1');
		const back = manager.joinBattle({ code: battle.code, playerId: 'guest1', playerName: 'Guesty' });
		expect(back.success).toBe(true);
		expect(back.seatId).toBe(guestSeat.seatId);
		expect(guestSeat.isAi).toBe(false);
	});

	test('coming back within the minute keeps the seat', () => {
		const pub = startOneVsOne();
		const battle = manager.getBattle(pub.id);
		const t0 = pub.startedAt + 1000;
		online.delete('guest1');
		manager.tick({ now: t0 });
		online.add('guest1');
		manager.tick({ now: t0 + 30 * 1000 });
		manager.tick({ now: t0 + 90 * 1000 });
		expect(battle.seats[1].isAi).toBe(false);
	});

	describe('quick match', () => {
		test('two players looking are paired and start at once', () => {
			const first = manager.quickMatch({ playerId: 'host1', playerName: 'Hosty' });
			expect(first.success).toBe(true);
			expect(first.battle.isPublic).toBe(true);
			expect(first.battle.status).toBe('lobby');
			expect(first.battle.startsInMs).toBeGreaterThan(15000);
			expect(manager.quickMatchInfo().looking).toBe(1);
			// Asking again doesn't open a second lobby.
			expect(manager.quickMatch({ playerId: 'host1', playerName: 'Hosty' }).battle.id).toBe(first.battle.id);

			const second = manager.quickMatch({ playerId: 'guest1', playerName: 'Guesty' });
			expect(second.success).toBe(true);
			expect(second.battle.id).toBe(first.battle.id);
			expect(second.battle.status).toBe('active');
			expect(second.battle.mode).toBe('quick');
			expect(second.battle.seats.every(seat => !seat.isAi)).toBe(true);
			expect(manager.quickMatchInfo()).toMatchObject({ looking: 0, playing: 2 });
		});

		test('alone for the wait, a bot takes the other seat', () => {
			const first = manager.quickMatch({ playerId: 'host1', playerName: 'Hosty' });
			const battle = manager.getBattle(first.battle.id);
			manager.seaTick({ now: battle.autoStartAt - 1 });
			expect(battle.status).toBe('lobby');
			manager.seaTick({ now: battle.autoStartAt });
			expect(battle.status).toBe('active');
			expect(battle.seats.map(seat => seat.isAi)).toEqual([false, true]);
		});

		test('a lobby whose player has gone is dropped, not started', () => {
			const first = manager.quickMatch({ playerId: 'host1', playerName: 'Hosty' });
			const battle = manager.getBattle(first.battle.id);
			online.delete('host1');
			manager.tick({ now: battle.autoStartAt + 1 });
			expect(manager.getBattle(first.battle.id)).toBeNull();
			expect(World.getPlayer('host1').activeBattleId).toBeUndefined();
		});

		test('private lobbies are never matched with strangers', () => {
			const priv = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 2 });
			const match = manager.quickMatch({ playerId: 'guest1', playerName: 'Guesty' });
			expect(match.battle.id).not.toBe(priv.battle.id);
			expect(manager.getBattle(priv.battle.id).seats).toHaveLength(1);
		});
	});

	test('a battle nobody is playing or watching ends as abandoned', () => {
		const pub = startOneVsOne();
		online.clear();
		manager.tick({ now: pub.startedAt + 1000 });
		const battle = manager.getBattle(pub.id);
		expect(battle.status).toBe('active');           // still in the grace minute
		manager.tick({ now: pub.startedAt + 62 * 1000 });
		expect(battle.status).toBe('finished');
		expect(battle.winnerSeatId).toBeNull();
	});
});

describe('Viking longships and the sea', () => {
	const fixtures = require('./shipFixtures');
	const ships = require('../../server/battle/ships');
	const { shipAt } = require('../../server/battle/shipRules');
	let emitted;

	beforeEach(() => {
		fixtures.vikingWorld({ mode: 'quick' });
		emitted = [];
		jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
			emitted.push({ playerId, event, payload });
			return 1;
		});
	});

	afterEach(() => jest.restoreAllMocks());

	function manager() {
		const gm = fixtures.managers();
		return createBattleManager({
			gameManager: gm,
			aiRunner: { startAiPlayer: () => {}, stopAiPlayer: () => {} },
			broadcaster: { broadcastGameUpdate: () => {} },
			persistence: { markDirty: () => {} },
			lifecycleService: { removePlayerCompletely: id => World.removePlayer(id) },
			io: { to: () => ({ emit: () => {} }) },
		});
	}

	test('a ship sinks with its passenger aboard, and the battle is told who', () => {
		const battle = fixtures.battle();
		const spot = fixtures.ship(0, -12, { shipId: 'doomed' });
		fixtures.land(1, -12);
		fixtures.piece('crew', 'ROOK', 0, -12);
		const t = sea.sinkAtMs(battle, spot.x, spot.z);
		manager().seaTick({ now: t });
		expect(World.getWorld().board.cells[`${spot.x},${spot.z}`]).toBeUndefined();
		expect(World.getWorld().chessPieces.some(p => p.id === 'crew')).toBe(false);
		const sunk = emitted.filter(e => e.event === 'ship_sunk');
		expect(sunk.map(e => e.playerId).sort()).toEqual(['h0', 'h1']);
		expect(sunk[0].payload).toEqual({ shipId: 'doomed', x: spot.x, z: spot.z, passengerId: 'crew' });
	});

	test('an empty ship sinks with passengerId null', () => {
		const battle = fixtures.battle();
		const spot = fixtures.ship(0, -12, { shipId: 'empty' });
		manager().seaTick({ now: sea.sinkAtMs(battle, spot.x, spot.z) });
		expect(emitted.find(e => e.event === 'ship_sunk').payload.passengerId).toBeNull();
	});

	test('a ship cannot sail onto a square the sea has taken', () => {
		const battle = fixtures.battle();
		const world = World.getWorld();
		const from = fixtures.ship(0, -8, { shipId: 'drakkar' });
		const target = fixtures.at(0, -11);
		const realNow = Date.now;
		try {
			Date.now = () => sea.sinkAtMs(battle, target.x, target.z) - 1;
			expect(ships.sail(world, battle, 's0', { shipId: 'drakkar', to: target }, { now: Date.now() }).success)
				.toBe(true);
			// Back to where it was, and try again once that square has gone.
			delete world.board.cells[`${target.x},${target.z}`];
			fixtures.ship(0, -8, { shipId: 'drakkar' });
			const late = sea.sinkAtMs(battle, target.x, target.z) + 1;
			const refused = ships.sail(world, battle, 's0', { shipId: 'drakkar', to: target }, { now: late });
			expect(refused).toMatchObject({ success: false, reason: 'not_water' });
			expect(shipAt(world.board.cells[`${from.x},${from.z}`]).shipId).toBe('drakkar');
		} finally {
			Date.now = realNow;
		}
	});
});
