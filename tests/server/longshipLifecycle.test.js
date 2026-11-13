/**
 * Viking longships — lifecycle through the real BattleManager: a ship
 * moored behind every queen at the start, stripped at cleanup, and
 * rebuilt 45 s after a seat loses its last one (unless the seat is out
 * or the sea has taken the mooring).
 *
 * Same harness as battleSea.test.js: the real World and game managers,
 * with transport and scheduling seams mocked.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const sea = require('../../server/battle/sea');
const shipRules = require('../../server/battle/shipRules');
const ships = require('../../server/battle/ships');
const { createBattleManager } = require('../../server/battle/BattleManager');
const { managers } = require('./shipFixtures');

const { SHIP } = shipRules;

let manager;
let gm;
let events;

function buildManager() {
	gm = managers();
	return createBattleManager({
		gameManager: gm,
		aiRunner: { startAiPlayer: () => {}, stopAiPlayer: () => {} },
		broadcaster: { broadcastGameUpdate: () => {} },
		persistence: { markDirty: () => {} },
		lifecycleService: { removePlayerCompletely: id => World.removePlayer(id) },
		io: { to: () => ({ emit: () => {} }) },
	});
}

beforeEach(() => {
	World.resetWorld();
	Sessions.clearAll();
	jest.spyOn(Sessions, 'isOnline').mockReturnValue(true);
	events = [];
	jest.spyOn(Sessions, 'emitToPlayerSockets').mockImplementation((playerId, event, payload) => {
		events.push({ playerId, event, payload });
		return 1;
	});
	const world = World.getWorld();
	world.players.host1 = { id: 'host1', name: 'Hosty' };
	world.players.guest1 = { id: 'guest1', name: 'Guesty' };
	manager = buildManager();
});

afterEach(() => jest.restoreAllMocks());

function start({ edition = 'viking', mode = 'classic', seatCount = 2 } = {}) {
	const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount, mode, edition });
	manager.joinBattle({ code: created.battle.code, playerId: 'guest1', playerName: 'Guesty' });
	const pub = manager.startBattle({ battleId: created.battle.id, playerId: 'host1' }).battle;
	return manager.getBattle(pub.id);
}

const shipsOf = battle => ships.shipsInBattle(World.getWorld(), battle);
const named = name => events.filter(e => e.event === name).map(e => e.payload);
const cellAt = ({ x, z }) => World.getWorld().board.cells[`${x},${z}`] || null;

describe('spawn', () => {
	test('each seat gets one longship on the water square behind its queen', () => {
		const battle = start();
		const world = World.getWorld();
		const fleet = shipsOf(battle);
		expect(fleet).toHaveLength(2);
		for (const seat of battle.seats) {
			const queen = world.chessPieces.find(p => p.player === seat.seatId && p.type === 'QUEEN');
			const zone = world.homeZones[seat.seatId];
			const behind = ships.mooringBehind(queen.position, zone.orientation);
			const mine = fleet.find(e => e.ship.player === seat.seatId);
			expect({ x: mine.x, z: mine.z }).toEqual(behind);
			expect(mine.ship).toMatchObject({
				type: 'ship', player: seat.seatId, homeSeatId: seat.seatId, battleId: battle.id, readyAt: 0,
			});
			expect(cellAt(behind)).toHaveLength(1);          // starts empty
			expect(battle.fleet.moorings[seat.seatId]).toEqual(behind);
			// The queen starts ashore — and can embark on her first move.
			expect(queen.position).not.toEqual(behind);
			expect(gm.chessManager.isValidChessMove(world, queen, behind.x, behind.z)).toBe(true);
		}
	});

	test('standard battles have no ships at all', () => {
		const battle = start({ edition: 'standard' });
		expect(shipsOf(battle)).toHaveLength(0);
		expect(battle.fleet).toBeUndefined();
		expect(battle.edition).toBe('standard');
	});

	test('four seats, four ships', () => {
		const battle = start({ seatCount: 4 });
		expect(shipsOf(battle)).toHaveLength(4);
	});
});

describe('cleanup', () => {
	test('cleanup strips every ship of the battle, and only of that battle', () => {
		const battle = start();
		// Somebody else's ship item somewhere (another battle's id).
		World.getWorld().board.cells['1,1'] = [shipRules.makeShipItem({
			shipId: 'other', player: 'x', battleId: 'b-other', homeSeatId: 'x',
		})];
		battle.status = 'finished';
		battle.finishedAt = Date.now() - 61 * 1000;
		manager.tick({ now: Date.now() });
		expect(manager.getBattle(battle.id)).toBeNull();
		const left = Object.values(World.getWorld().board.cells)
			.flat().filter(item => shipRules.isShipItem(item));
		expect(left.map(i => i.shipId)).toEqual(['other']);
	});
});

describe('loss and rebuild', () => {
	test('a lost ship is announced and rebuilt at the mooring after 45 s', () => {
		const battle = start();
		const seat = battle.seats[0];
		const mine = shipsOf(battle).find(e => e.ship.player === seat.seatId);
		const t0 = battle.startedAt + 1000;
		manager.tick({ now: t0 });
		expect(named('ship_lost')).toHaveLength(0);

		delete World.getWorld().board.cells[`${mine.x},${mine.z}`];
		manager.tick({ now: t0 + 1 });
		const lost = named('ship_lost');
		expect(lost).toHaveLength(2); // each human seat hears it
		expect(lost[0]).toMatchObject({
			shipId: mine.ship.shipId, seatId: seat.seatId, reason: 'destroyed', rebuildAt: t0 + 1 + SHIP.RESPAWN_MS,
		});

		manager.tick({ now: t0 + SHIP.RESPAWN_MS });
		expect(shipsOf(battle).filter(e => e.ship.player === seat.seatId)).toHaveLength(0);
		manager.tick({ now: t0 + 1 + SHIP.RESPAWN_MS });
		const rebuilt = shipsOf(battle).find(e => e.ship.player === seat.seatId);
		expect(rebuilt).toBeTruthy();
		expect({ x: rebuilt.x, z: rebuilt.z }).toEqual({ x: mine.x, z: mine.z });
		expect(rebuilt.ship.shipId).not.toBe(mine.ship.shipId);
		expect(named('ship_built')[0]).toMatchObject({ shipId: rebuilt.ship.shipId, seatId: seat.seatId });
		// No repeat announcements once rebuilt.
		manager.tick({ now: t0 + 2 + SHIP.RESPAWN_MS });
		expect(named('ship_lost')).toHaveLength(2);
		expect(named('ship_built')).toHaveLength(2);
	});

	test('a seized ship is "seized" for the loser; the captor keeps both (no cap)', () => {
		const battle = start();
		const [s0, s1] = battle.seats;
		const mine = shipsOf(battle).find(e => e.ship.player === s0.seatId);
		mine.ship.player = s1.seatId;
		manager.tick({ now: battle.startedAt + 1000 });
		expect(named('ship_lost')[0]).toMatchObject({ seatId: s0.seatId, reason: 'seized' });
		expect(shipsOf(battle).filter(e => e.ship.player === s1.seatId)).toHaveLength(2);
		// While the prize still sits on s0's mooring nothing can be built
		// there; once its new owner sails it off, s0 rebuilds at home.
		const world = World.getWorld();
		const env = ships.boardEnv(world, battle);
		const away = shipRules.sailTargets(env, { x: mine.x, z: mine.z })[0];
		expect(ships.sail(world, battle, s1.seatId, { shipId: mine.ship.shipId, to: away }).success).toBe(true);
		manager.tick({ now: battle.startedAt + 1000 + SHIP.RESPAWN_MS });
		expect(shipsOf(battle).filter(e => e.ship.player === s0.seatId)).toHaveLength(1);
	});

	test('no rebuild once the sea has taken the mooring', () => {
		const battle = start({ mode: 'quick' });
		// Whichever mooring the sea reaches first.
		const sinkOf = st => {
			const m = battle.fleet.moorings[st.seatId];
			return sea.sinkAtMs(battle, m.x, m.z);
		};
		const seat = battle.seats.slice().sort((a, b) => sinkOf(a) - sinkOf(b))[0];
		const mooring = battle.fleet.moorings[seat.seatId];
		const sinkAt = sinkOf(seat);
		manager.seaTick({ now: sinkAt });
		const sunk = named('ship_sunk');
		expect(sunk[0]).toMatchObject({ x: mooring.x, z: mooring.z, passengerId: null });
		expect(cellAt(mooring)).toBeNull();

		manager.tick({ now: sinkAt + 1 });
		expect(named('ship_lost')[0]).toMatchObject({ seatId: seat.seatId, reason: 'sunk' });
		manager.tick({ now: sinkAt + 1 + SHIP.RESPAWN_MS });
		expect(battle.status).toBe('active');
		expect(shipsOf(battle).filter(e => e.ship.player === seat.seatId)).toHaveLength(0);
		expect(named('ship_built')).toHaveLength(0);
	});

	test('no rebuild for a seat that is out', () => {
		const battle = start({ seatCount: 3 });
		const world = World.getWorld();
		const out = battle.seats[2];
		const theirs = shipsOf(battle).find(e => e.ship.player === out.seatId);
		delete world.board.cells[`${theirs.x},${theirs.z}`];
		world.chessPieces = world.chessPieces.filter(p => !(p.player === out.seatId && p.type === 'KING'));
		const t0 = battle.startedAt + 1000;
		manager.tick({ now: t0 });
		manager.tick({ now: t0 + SHIP.RESPAWN_MS + 1 });
		expect(battle.status).toBe('active');
		expect(shipsOf(battle).filter(e => e.ship.player === out.seatId)).toHaveLength(0);
	});

	test('land over the mooring holds the rebuild until it is water again', () => {
		const battle = start();
		const seat = battle.seats[0];
		const mooring = battle.fleet.moorings[seat.seatId];
		const world = World.getWorld();
		delete world.board.cells[`${mooring.x},${mooring.z}`];
		const t0 = battle.startedAt + 1000;
		manager.tick({ now: t0 });
		world.board.cells[`${mooring.x},${mooring.z}`] = [{ type: 'tetromino', player: seat.seatId }];
		manager.tick({ now: t0 + SHIP.RESPAWN_MS });
		expect(shipsOf(battle).filter(e => e.ship.player === seat.seatId)).toHaveLength(0);
		delete world.board.cells[`${mooring.x},${mooring.z}`];
		manager.tick({ now: t0 + SHIP.RESPAWN_MS + 5000 });
		expect(shipsOf(battle).filter(e => e.ship.player === seat.seatId)).toHaveLength(1);
	});
});

describe('battle events stay in the battle', () => {
	test('ship events only reach the seated humans', () => {
		const battle = start();
		const mine = shipsOf(battle)[0];
		delete World.getWorld().board.cells[`${mine.x},${mine.z}`];
		manager.tick({ now: battle.startedAt + 1000 });
		const recipients = new Set(events.filter(e => e.event === 'ship_lost').map(e => e.playerId));
		expect([...recipients].sort()).toEqual(['guest1', 'host1']);
	});
});
