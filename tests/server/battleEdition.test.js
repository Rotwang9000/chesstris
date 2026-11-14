/**
 * Battle editions: the edition is a property of the BATTLE. It is
 * normalised on creation, matched by Quick match (Viking players are
 * only paired with Viking players), published in `publicState`, and
 * every way of joining — lobby, bot takeover, reconnect — hands the
 * client the battle's edition to adopt.
 */

'use strict';

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const { createBattleManager } = require('../../server/battle/BattleManager');
const { registerBattleHandlers } = require('../../server/sockets/battle');
const { managers } = require('./shipFixtures');

let manager;
let events;

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
	for (const id of ['host1', 'guest1', 'guest2']) world.players[id] = { id, name: id };
	manager = createBattleManager({
		gameManager: managers(),
		aiRunner: { startAiPlayer: () => {}, stopAiPlayer: () => {} },
		broadcaster: { broadcastGameUpdate: () => {} },
		persistence: { markDirty: () => {} },
		lifecycleService: { removePlayerCompletely: id => World.removePlayer(id) },
		io: { to: () => ({ emit: () => {} }) },
	});
});

afterEach(() => jest.restoreAllMocks());

describe('createBattle', () => {
	test('normalises the edition: only "viking" opts in, the default is standard', () => {
		const make = edition => manager.createBattle({ hostId: 'host1', hostName: 'H', edition });
		expect(make('viking').battle.edition).toBe('viking');
		World.getWorld().battles = {};
		expect(make('VIKING ').battle.edition).toBe('viking');
		World.getWorld().battles = {};
		expect(make('pirate').battle.edition).toBe('standard');
		World.getWorld().battles = {};
		expect(make(undefined).battle.edition).toBe('standard');
	});

	test('publicState carries the edition; battles from before editions read standard', () => {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'H', edition: 'viking' });
		const battle = manager.getBattle(created.battle.id);
		expect(manager.publicState(battle).edition).toBe('viking');
		delete battle.edition; // an old persisted record
		expect(manager.publicState(battle).edition).toBe('standard');
	});
});

describe('joining adopts the battle edition', () => {
	test('lobby join, start and reconnect all report it', () => {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'H', edition: 'viking' });
		const joined = manager.joinBattle({ code: created.battle.code, playerId: 'guest1', playerName: 'G' });
		expect(joined.battle.edition).toBe('viking');
		const started = manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });
		expect(started.battle.edition).toBe('viking');
		const startedEvents = events.filter(e => e.event === 'battle_started');
		expect(startedEvents.length).toBeGreaterThan(0);
		for (const e of startedEvents) expect(e.payload.battle.edition).toBe('viking');
		const again = manager.joinBattle({ code: created.battle.code, playerId: 'guest1', playerName: 'G' });
		expect(again.battle.edition).toBe('viking');
	});

	test('taking over a bot mid-battle hands over the edition too', () => {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'H', edition: 'viking' });
		manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });
		events.length = 0;
		const took = manager.joinBattle({ code: created.battle.code, playerId: 'guest2', playerName: 'G2' });
		expect(took.tookOverBot).toBe(true);
		expect(took.battle.edition).toBe('viking');
		const toJoiner = events.find(e => e.event === 'battle_started' && e.playerId === 'guest2');
		expect(toJoiner.payload.battle.edition).toBe('viking');
	});
});

describe('quick match pairs editions with their own', () => {
	test('a Viking seeker never joins a standard lobby, and vice versa', () => {
		const standard = manager.quickMatch({ playerId: 'host1', playerName: 'H' });
		expect(standard.battle.edition).toBe('standard');
		const viking = manager.quickMatch({ playerId: 'guest1', playerName: 'G', edition: 'viking' });
		expect(viking.battle.id).not.toBe(standard.battle.id);
		expect(viking.battle.edition).toBe('viking');
		expect(viking.battle.status).toBe('lobby');

		const second = manager.quickMatch({ playerId: 'guest2', playerName: 'G2', edition: 'viking' });
		expect(second.battle.id).toBe(viking.battle.id);
		expect(second.battle.status).toBe('active');
		expect(manager.getBattle(standard.battle.id).seats).toHaveLength(1);
	});

	test('old clients (no edition) still pair with each other', () => {
		const first = manager.quickMatch({ playerId: 'host1', playerName: 'H' });
		const second = manager.quickMatch({ playerId: 'guest1', playerName: 'G' });
		expect(second.battle.id).toBe(first.battle.id);
		expect(second.battle.edition).toBe('standard');
	});
});

describe('socket handlers pass the edition through', () => {
	function socketFor(playerId) {
		const handlers = new Map();
		const socket = { data: {}, on: (event, fn) => handlers.set(event, fn) };
		registerBattleHandlers(socket, { playerId, battleManager: manager });
		return (event, data) => new Promise(resolve => handlers.get(event)(data, resolve));
	}

	test('battle_create and battle_quickmatch', async () => {
		const host = socketFor('host1');
		const created = await host('battle_create', { seatCount: 2, edition: 'viking' });
		expect(created.success).toBe(true);
		expect(created.battle.edition).toBe('viking');

		const guest = socketFor('guest1');
		const matched = await guest('battle_quickmatch', { edition: 'viking' });
		expect(matched.success).toBe(true);
		expect(matched.battle.edition).toBe('viking');

		const plain = await socketFor('guest2')('battle_quickmatch', {});
		expect(plain.battle.edition).toBe('standard');
		expect(plain.battle.id).not.toBe(matched.battle.id);
	});
});
