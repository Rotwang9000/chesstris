/**
 * Battle mode tests — geometry, rule hooks, and the BattleManager
 * lifecycle (create → join → start → forfeit → finish → cleanup).
 *
 * Geometry and rules are pure. The manager runs against the real World
 * singleton and real board/chess/tetromino managers; only the transport
 * and scheduling seams (broadcaster, persistence, io, aiRunner,
 * lifecycle) are mocked.
 */

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');
const TetrominoManager = require('../../server/game/TetrominoManager');
const {
	BATTLE,
	BATTLE_REGION_BOUNDS,
	arenaCentreForSlot,
	radialBand,
	playRadiusForSeats,
	ringOuterRadius,
	isInsidePlayArea,
	isBattleRegionCell,
	ringCells,
	seatHomeZones,
	zoneCells,
} = require('../../server/battle/geometry');
const battleRules = require('../../server/battle/rules');
const { createBattleManager } = require('../../server/battle/BattleManager');

// ── Geometry ────────────────────────────────────────────────────────────────

describe('battle geometry', () => {
	test('arenaCentreForSlot lays slots on the pitch grid', () => {
		expect(arenaCentreForSlot(0)).toEqual({ x: BATTLE.ARENA_BASE.x, z: BATTLE.ARENA_BASE.z });
		expect(arenaCentreForSlot(1).x).toBe(BATTLE.ARENA_BASE.x + BATTLE.ARENA_PITCH);
		expect(arenaCentreForSlot(BATTLE.ARENA_GRID_COLUMNS).z)
			.toBe(BATTLE.ARENA_BASE.z + BATTLE.ARENA_PITCH);
		expect(() => arenaCentreForSlot(-1)).toThrow();
		expect(() => arenaCentreForSlot(BATTLE.MAX_ARENAS)).toThrow();
	});

	test('isBattleRegionCell is the arena-grid AABB, not distance-from-origin', () => {
		expect(isBattleRegionCell(0, 0)).toBe(false);
		expect(isBattleRegionCell(1500, 0)).toBe(false);
		expect(isBattleRegionCell(7218, 1893)).toBe(false);
		expect(isBattleRegionCell(BATTLE.ARENA_BASE.x, BATTLE.ARENA_BASE.z)).toBe(true);
		expect(isBattleRegionCell(BATTLE_REGION_BOUNDS.minX, BATTLE_REGION_BOUNDS.minZ)).toBe(true);
		expect(isBattleRegionCell(BATTLE_REGION_BOUNDS.maxX + 1, BATTLE_REGION_BOUNDS.maxZ)).toBe(false);
	});

	test.each([
		['2-seat', BATTLE.PLAY_RADIUS],
		['3-4 seat', BATTLE.PLAY_RADIUS_LARGE],
	])('radial bands tile the plane with no dead cells (%s arena)', (_label, playRadius) => {
		const centre = { x: 0, z: 0 };
		const outer = ringOuterRadius(playRadius);
		const span = outer + 4;
		for (let z = -span; z <= span; z++) {
			for (let x = -span; x <= span; x++) {
				const band = radialBand(centre, x, z);
				const inPlay = isInsidePlayArea(centre, x, z, playRadius);
				const inRing = band >= playRadius + 1 && band <= outer;
				const outside = band > outer;
				// Exactly one classification applies to every cell.
				expect(Number(inPlay) + Number(inRing) + Number(outside)).toBe(1);
			}
		}
	});

	test.each([
		['2-seat', BATTLE.PLAY_RADIUS],
		['3-4 seat', BATTLE.PLAY_RADIUS_LARGE],
	])('ringCells form an orthogonally connected closed loop (%s arena)', (_label, playRadius) => {
		const centre = { x: 100, z: 200 };
		const cells = ringCells(centre, playRadius);
		expect(cells.length).toBeGreaterThan(0);

		const keys = new Set(cells.map(c => `${c.x},${c.z}`));
		// Band check: every ring cell is in [inner, outer].
		const outer = ringOuterRadius(playRadius);
		for (const { x, z } of cells) {
			const band = radialBand(centre, x, z);
			expect(band).toBeGreaterThanOrEqual(playRadius + 1);
			expect(band).toBeLessThanOrEqual(outer);
		}

		// Orthogonal BFS from one ring cell must reach every ring cell.
		const start = cells[0];
		const seen = new Set([`${start.x},${start.z}`]);
		const queue = [start];
		while (queue.length) {
			const { x, z } = queue.shift();
			for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
				const key = `${x + dx},${z + dz}`;
				if (keys.has(key) && !seen.has(key)) {
					seen.add(key);
					queue.push({ x: x + dx, z: z + dz });
				}
			}
		}
		expect(seen.size).toBe(keys.size);
	});

	test('2-seat zones face off with pawn rows exactly FRONT_ROW_GAP apart', () => {
		const centre = { x: 0, z: 0 };
		const [north, south] = seatHomeZones(centre, 2);
		expect(north.orientation).toBe(0);
		expect(south.orientation).toBe(2);
		// Orientation 0: pawns at z+1. Orientation 2: pawns at z.
		const northPawnRow = north.z + 1;
		const southPawnRow = south.z;
		expect(southPawnRow - northPawnRow).toBe(BATTLE.FRONT_ROW_GAP);
	});

	test.each([3, 4])('%i-seat zones are disjoint and inside the LARGE play area', (seatCount) => {
		const centre = { x: 50, z: 50 };
		const zones = seatHomeZones(centre, seatCount);
		expect(zones).toHaveLength(seatCount);

		const seen = new Set();
		for (const zone of zones) {
			for (const { x, z } of zoneCells(zone)) {
				const key = `${x},${z}`;
				expect(seen.has(key)).toBe(false);
				seen.add(key);
				expect(isInsidePlayArea(centre, x, z, BATTLE.PLAY_RADIUS_LARGE)).toBe(true);
			}
		}
	});

	test.each([3, 4])('%i-seat fan keeps every pair of zones ≥8 cells apart', (seatCount) => {
		// The July 2026 report: with zones at ±5 a CPU pawn could hop
		// straight into a neighbour's spawn on its first move. The
		// pinwheel fan (front offset + tangent stagger) must keep EVERY
		// pair of zones at least 8 cells apart between closest cells —
		// beyond a pawn's diagonal capture, a knight's leap, and any
		// two-move combination.
		const centre = { x: 0, z: 0 };
		const zones = seatHomeZones(centre, seatCount);
		for (let a = 0; a < zones.length; a++) {
			for (let b = a + 1; b < zones.length; b++) {
				let minDist = Infinity;
				for (const ca of zoneCells(zones[a])) {
					for (const cb of zoneCells(zones[b])) {
						const d = Math.hypot(ca.x - cb.x, ca.z - cb.z);
						if (d < minDist) minDist = d;
					}
				}
				expect(minDist).toBeGreaterThanOrEqual(8);
			}
		}
	});

	test('4-seat pinwheel staggers opposing zones so nobody faces head-on', () => {
		// A "fan" means armies are offset sideways, not mirror-image
		// charges. Opposing pairs (N/S share the x axis, W/E share z)
		// must have completely disjoint footprints on their cross axis.
		const centre = { x: 0, z: 0 };
		const [north, south, west, east] = seatHomeZones(centre, 4);

		const xRange = z => [z.x, z.x + z.width - 1];
		const zRange = z => [z.z, z.z + z.height - 1];
		const disjoint = ([a0, a1], [b0, b1]) => a1 < b0 || b1 < a0;

		expect(disjoint(xRange(north), xRange(south))).toBe(true);
		expect(disjoint(zRange(west), zRange(east))).toBe(true);
	});

	test('seatHomeZones rejects out-of-range seat counts', () => {
		expect(() => seatHomeZones({ x: 0, z: 0 }, 1)).toThrow();
		expect(() => seatHomeZones({ x: 0, z: 0 }, 5)).toThrow();
	});
});

// ── Rule hooks ──────────────────────────────────────────────────────────────

describe('battle rules', () => {
	function gameWithBattle() {
		const centre = { x: 0, z: 0 };
		return {
			players: {
				seatA: { id: 'seatA', battleId: 'B1' },
				seatOther: { id: 'seatOther', battleId: 'B2' },
				civilian: { id: 'civilian' },
			},
			battles: {
				B1: { id: 'B1', status: 'active', centre },
				B2: { id: 'B2', status: 'active', centre: { x: 500, z: 500 } },
			},
		};
	}

	test('ringItemUsableBy only for seats of the same battle', () => {
		const game = gameWithBattle();
		const ringItem = { type: 'tetromino', player: null, battleRing: 'B1' };
		expect(battleRules.ringItemUsableBy(game, ringItem, 'seatA')).toBe(true);
		expect(battleRules.ringItemUsableBy(game, ringItem, 'seatOther')).toBe(false);
		expect(battleRules.ringItemUsableBy(game, ringItem, 'civilian')).toBe(false);
		expect(battleRules.ringItemUsableBy(game, { type: 'tetromino', player: 'x' }, 'seatA')).toBe(false);
	});

	test('seated players must stay inside their play area', () => {
		const game = gameWithBattle();
		const inside = battleRules.validateArenaBounds(game, 'seatA', [{ x: 3, z: 4 }]);
		expect(inside.valid).toBe(true);

		const outside = battleRules.validateArenaBounds(
			game, 'seatA', [{ x: 3, z: 4 }, { x: BATTLE.PLAY_RADIUS + 1, z: 0 }]
		);
		expect(outside.valid).toBe(false);
		expect(outside.reason).toBe('outside_arena');
	});

	test('a larger battle validates against its own playRadius', () => {
		const game = gameWithBattle();
		game.battles.B1.playRadius = BATTLE.PLAY_RADIUS_LARGE;
		// 15-16 from centre is now inside the play area…
		const nowInside = battleRules.validateArenaBounds(
			game, 'seatA', [{ x: BATTLE.PLAY_RADIUS + 1, z: 0 }]
		);
		expect(nowInside.valid).toBe(true);
		// …but the (larger) ring is still the wall.
		const stillOut = battleRules.validateArenaBounds(
			game, 'seatA', [{ x: BATTLE.PLAY_RADIUS_LARGE + 1, z: 0 }]
		);
		expect(stillOut.valid).toBe(false);
	});

	test('civilians are kept out of live arenas but free elsewhere', () => {
		const game = gameWithBattle();
		const trespass = battleRules.validateArenaBounds(game, 'civilian', [{ x: 2, z: 2 }]);
		expect(trespass.valid).toBe(false);
		expect(trespass.reason).toBe('arena_reserved');

		const clear = battleRules.validateArenaBounds(game, 'civilian', [{ x: 100, z: 100 }]);
		expect(clear.valid).toBe(true);
	});
});

// ── BattleManager lifecycle ─────────────────────────────────────────────────

describe('BattleManager', () => {
	let manager;
	let aiStarted;
	let aiStopped;

	function buildManager() {
		const boardManager = new BoardManager();
		const islandManager = new IslandManager();
		const chessManager = new ChessManager(boardManager, islandManager);
		const tetrominoManager = new TetrominoManager(boardManager, islandManager);

		aiStarted = [];
		aiStopped = [];
		return createBattleManager({
			gameManager: { boardManager, chessManager, tetrominoManager },
			aiRunner: {
				startAiPlayer: id => aiStarted.push(id),
				stopAiPlayer: id => aiStopped.push(id),
			},
			broadcaster: { broadcastGameUpdate: () => {} },
			persistence: { markDirty: () => {} },
			lifecycleService: { removePlayerCompletely: id => World.removePlayer(id) },
			io: { to: () => ({ emit: () => {} }) },
		});
	}

	beforeEach(() => {
		World.resetWorld();
		Sessions.clearAll();
		const world = World.getWorld();
		world.players.host1 = { id: 'host1', name: 'Hosty' };
		world.players.guest1 = { id: 'guest1', name: 'Guesty' };
		manager = buildManager();
	});

	function createAndJoin() {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 2 });
		expect(created.success).toBe(true);
		const joined = manager.joinBattle({
			code: created.battle.code, playerId: 'guest1', playerName: 'Guesty',
		});
		expect(joined.success).toBe(true);
		return created.battle.code;
	}

	test('create → lobby with host in seat 0 and a 6-char code', () => {
		const result = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 2 });
		expect(result.success).toBe(true);
		expect(result.battle.code).toMatch(/^[A-Z2-9]{6}$/);
		expect(result.battle.status).toBe('lobby');
		expect(result.battle.seats).toHaveLength(1);
		expect(result.battle.seats[0].controlledBy).toBe('host1');
		// Multi-battle: a second lobby is fine, a third is refused
		// (arena slots are finite; two open lobbies per host is plenty).
		expect(manager.createBattle({ hostId: 'host1', seatCount: 2 }).success).toBe(true);
		expect(manager.createBattle({ hostId: 'host1', seatCount: 2 }).success).toBe(false);
	});

	test('join is idempotent and rejects when full or already started', () => {
		const code = createAndJoin();
		const again = manager.joinBattle({ code, playerId: 'guest1', playerName: 'Guesty' });
		expect(again.success).toBe(true); // same seat back
		World.getWorld().players.late = { id: 'late', name: 'Late' };
		expect(manager.joinBattle({ code, playerId: 'late' }).success).toBe(false);
	});

	test('start: host-only, builds ring + seats + pieces, arms aliases', () => {
		const code = createAndJoin();
		expect(manager.startBattle({ battleId: code, playerId: 'guest1' }).success).toBe(false);

		const started = manager.startBattle({ battleId: code, playerId: 'host1' });
		expect(started.success).toBe(true);
		expect(started.battle.status).toBe('active');
		expect(started.battle.centre).toEqual(arenaCentreForSlot(0));

		const world = World.getWorld();
		const seat0 = started.battle.seats[0].seatId;
		const seat1 = started.battle.seats[1].seatId;

		// Seat records exist, carry battleId, and have kings on the board.
		for (const seatId of [seat0, seat1]) {
			expect(World.getPlayer(seatId)).toBeTruthy();
			expect(World.getPlayer(seatId).battleId).toBe(started.battle.id);
			expect(world.homeZones[seatId]).toBeTruthy();
			expect(world.chessPieces.some(
				p => String(p.player) === seatId && String(p.type).toUpperCase() === 'KING'
			)).toBe(true);
		}

		// Ring cells exist and are ownerless.
		const ring = ringCells(started.battle.centre);
		const sample = world.board.cells[`${ring[0].x},${ring[0].z}`];
		expect(Array.isArray(sample)).toBe(true);
		expect(sample[0].battleRing).toBe(started.battle.id);
		expect(sample[0].player).toBeNull();

		// No bots were needed (2 humans); aliases route seats to humans.
		expect(aiStarted).toHaveLength(0);
		expect(manager.effectivePlayerId('host1')).toBe(seat0);
		expect(manager.effectivePlayerId('guest1')).toBe(seat1);
		expect(manager.effectivePlayerId('nobody')).toBe('nobody');
	});

	test('start fills empty seats with AI bots', () => {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 3 });
		const started = manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });
		expect(started.success).toBe(true);
		const bots = started.battle.seats.filter(s => s.isAi);
		expect(bots).toHaveLength(2);
		expect(aiStarted).toEqual(bots.map(b => b.seatId));
		for (const bot of bots) {
			expect(World.getPlayer(bot.seatId).isComputer).toBe(true);
		}
	});

	test('forfeit → finish (last king standing) → cleanup strips the arena', () => {
		const code = createAndJoin();
		const started = manager.startBattle({ battleId: code, playerId: 'host1' });
		const battleId = started.battle.id;
		const seat1 = started.battle.seats[1].seatId;

		// Guest forfeits; sweep settles the win.
		expect(manager.leaveBattle({ playerId: 'guest1' }).forfeited).toBe(true);
		expect(World.getPlayer(seat1).eliminated).toBe(true);

		manager.tick();
		const finished = manager.getBattle(battleId);
		expect(finished.status).toBe('finished');
		expect(finished.winnerSeatId).toBe(started.battle.seats[0].seatId);

		// After the linger window the cleanup sweep removes every trace.
		manager.tick({ now: Date.now() + 10 * 60 * 1000 });
		expect(manager.getBattle(battleId)).toBeNull();
		const world = World.getWorld();
		expect(World.getPlayer(started.battle.seats[0].seatId)).toBeFalsy();
		expect(World.getPlayer(seat1)).toBeFalsy();
		for (const { x, z } of ringCells(started.battle.centre)) {
			expect(world.board.cells[`${x},${z}`]).toBeUndefined();
		}
		expect(world.chessPieces.some(p => String(p.player).startsWith('battle-'))).toBe(false);
	});

	test('lobby host leave cancels; guest leave frees the seat', () => {
		const code = createAndJoin();
		expect(manager.leaveBattle({ playerId: 'guest1' }).success).toBe(true);
		expect(manager.battleByCode(code).seats).toHaveLength(1);

		expect(manager.leaveBattle({ playerId: 'host1' }).success).toBe(true);
		expect(manager.battleByCode(code)).toBeNull();
	});

	test('stale lobbies evaporate on the sweep', () => {
		const created = manager.createBattle({ hostId: 'host1', seatCount: 2 });
		manager.tick({ now: Date.now() + 16 * 60 * 1000 });
		expect(manager.getBattle(created.battle.id)).toBeNull();
	});

	// ── activeBattleId stamping (ghost-sweep protection) ────────────────
	// Battle-only players own no world pieces under their real id; the
	// stamp is what stops the ghost sweep flagging them eliminated and
	// costing them their identity (and seat) on reconnect.

	test('create/join stamp real players; leave/cancel clear the stamps', () => {
		const code = createAndJoin();
		expect(World.getPlayer('host1').activeBattleId).toBe(code);
		expect(World.getPlayer('guest1').activeBattleId).toBe(code);

		// Guest frees their seat → their stamp clears, host's remains.
		manager.leaveBattle({ playerId: 'guest1' });
		expect(World.getPlayer('guest1').activeBattleId).toBeUndefined();
		expect(World.getPlayer('host1').activeBattleId).toBe(code);

		// Host cancels → everyone clear.
		manager.leaveBattle({ playerId: 'host1' });
		expect(World.getPlayer('host1').activeBattleId).toBeUndefined();
	});

	test('joining clears a stale eliminated flag on the real record', () => {
		// The ghost sweep may have flagged a long-idle spectator before
		// they clicked BATTLE — they're clearly alive, so the flag lifts.
		World.getPlayer('host1').eliminated = true;
		World.getPlayer('host1').eliminatedAt = 123;
		const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 2 });
		expect(created.success).toBe(true);
		expect(World.getPlayer('host1').eliminated).toBe(false);
		expect(World.getPlayer('host1').eliminatedAt).toBeUndefined();
	});

	test('finish and cleanup clear the stamps', () => {
		const code = createAndJoin();
		manager.startBattle({ battleId: code, playerId: 'host1' });
		expect(World.getPlayer('host1').activeBattleId).toBe(code);

		manager.leaveBattle({ playerId: 'guest1' });   // forfeit
		manager.tick();                                 // sweep settles the win
		expect(manager.getBattle(code).status).toBe('finished');
		expect(World.getPlayer('host1').activeBattleId).toBeUndefined();
		expect(World.getPlayer('guest1').activeBattleId).toBeUndefined();
	});

	test('lobby timeout clears the stamps', () => {
		const created = manager.createBattle({ hostId: 'host1', seatCount: 2 });
		expect(World.getPlayer('host1').activeBattleId).toBe(created.battle.id);
		manager.tick({ now: Date.now() + 16 * 60 * 1000 });
		expect(World.getPlayer('host1').activeBattleId).toBeUndefined();
	});

	test('sweep drops stale stamps whose battle no longer exists', () => {
		World.getPlayer('host1').activeBattleId = 'GONE99';
		manager.tick();
		expect(World.getPlayer('host1').activeBattleId).toBeUndefined();
	});

	// ── Mid-battle join: bot-seat takeover ───────────────────────────────

	test('joining an ACTIVE battle hands a live bot seat to the human', () => {
		const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 3 });
		manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });

		// Route the joiner's battle_started emit through a fake socket.
		const got = [];
		Sessions.bind({ id: 'sock-g', join: () => {}, emit: (ev, p) => got.push({ ev, p }) }, 'guest1');

		const result = manager.joinBattle({
			code: created.battle.code, playerId: 'guest1', playerName: 'Guesty',
		});
		expect(result.success).toBe(true);
		expect(result.tookOverBot).toBe(true);

		const seat = result.battle.seats.find(s => s.seatId === result.seatId);
		expect(seat.isAi).toBe(false);
		expect(seat.controlledBy).toBe('guest1');
		expect(seat.name).toBe('Guesty');

		// The seat record flips to human control; its ticker stops.
		const record = World.getPlayer(result.seatId);
		expect(record.isComputer).toBe(false);
		expect(record.controlledBy).toBe('guest1');
		expect(aiStopped).toContain(result.seatId);

		// Gameplay for the seat resolves to the new human; the joiner's
		// client is told the battle started so it adopts the seat.
		expect(manager.effectivePlayerId('guest1')).toBe(result.seatId);
		expect(got.some(m => m.ev === 'battle_started')).toBe(true);

		// One bot remains (3 seats: host + taken-over bot + 1 bot).
		expect(result.battle.seats.filter(s => s.isAi)).toHaveLength(1);
	});

	test('active-battle join fails cleanly when no live bot seat is free', () => {
		const code = createAndJoin();  // 2 humans, 2 seats
		manager.startBattle({ battleId: code, playerId: 'host1' });
		World.getWorld().players.late = { id: 'late', name: 'Late' };
		const result = manager.joinBattle({ code, playerId: 'late' });
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/all humans/i);
	});

	test('a player mid-battle CAN join another battle and hold both seats', () => {
		// Multi-battle membership: guest1 fights in battle 1 and queues
		// in battle 2's lobby at the same time; the socket focus picks
		// which seat gameplay acts as.
		const code = createAndJoin();
		manager.startBattle({ battleId: code, playerId: 'host1' });
		World.getWorld().players.other = { id: 'other', name: 'Other' };
		const second = manager.createBattle({ hostId: 'other', seatCount: 2 });
		const result = manager.joinBattle({ code: second.battle.code, playerId: 'guest1' });
		expect(result.success).toBe(true);

		const mine = manager.battlesForPlayer('guest1');
		expect(mine.map(b => b.code).sort()).toEqual([code, second.battle.code].sort());
	});

	test('effectivePlayerId honours the socket focus across battles', () => {
		const code = createAndJoin();
		const started = manager.startBattle({ battleId: code, playerId: 'host1' });
		const guestSeat = started.battle.seats[1].seatId;

		// Legacy (no focus): first active battle's seat.
		expect(manager.effectivePlayerId('guest1')).toBe(guestSeat);
		// Explicit world focus: the real id even while a battle rages.
		expect(manager.effectivePlayerId('guest1', { focusBattleId: null })).toBe('guest1');
		// Focused on the battle: its seat.
		expect(manager.effectivePlayerId('guest1', { focusBattleId: code })).toBe(guestSeat);
		// Focused on a battle that does not exist: fall back to real id.
		expect(manager.effectivePlayerId('guest1', { focusBattleId: 'NOPE99' })).toBe('guest1');
	});

	test('leaveBattle targets a specific battle when several are held', () => {
		const first = manager.createBattle({ hostId: 'host1', seatCount: 2 });
		manager.joinBattle({ code: first.battle.code, playerId: 'guest1', playerName: 'Guesty' });
		World.getWorld().players.other = { id: 'other', name: 'Other' };
		const second = manager.createBattle({ hostId: 'other', seatCount: 2 });
		manager.joinBattle({ code: second.battle.code, playerId: 'guest1', playerName: 'Guesty' });
		expect(manager.battlesForPlayer('guest1')).toHaveLength(2);

		// Leave ONLY the second; the first seat is untouched and the
		// ghost-sweep stamp falls back to the remaining battle.
		expect(manager.leaveBattle({ playerId: 'guest1', battleId: second.battle.id }).success).toBe(true);
		const remaining = manager.battlesForPlayer('guest1');
		expect(remaining).toHaveLength(1);
		expect(remaining[0].code).toBe(first.battle.code);
		expect(World.getPlayer('guest1').activeBattleId).toBe(first.battle.id);
	});

	test('a lingering FINISHED battle keeps its arena slot', () => {
		// Repro of the "bot never moves" cascade: battle A finishes and
		// lingers (ring + pieces still on the board). Battle B starting
		// during that window used to be given the SAME slot, so it built
		// its arena on top of A's leftovers — B's cleanup then stripped
		// cells tagged for A's ring, and A's cleanup nuked B's terrain.
		const code = createAndJoin();
		const started = manager.startBattle({ battleId: code, playerId: 'host1' });
		expect(started.battle.centre).toEqual(arenaCentreForSlot(0));

		manager.leaveBattle({ playerId: 'guest1' });   // forfeit
		manager.tick();                                 // sweep settles the win
		expect(manager.getBattle(code).status).toBe('finished');

		// A new battle starting during the linger window gets slot 1.
		World.getWorld().players.h2 = { id: 'h2', name: 'H2' };
		World.getWorld().players.g2 = { id: 'g2', name: 'G2' };
		const second = manager.createBattle({ hostId: 'h2', hostName: 'H2', seatCount: 2 });
		manager.joinBattle({ code: second.battle.code, playerId: 'g2', playerName: 'G2' });
		const secondStarted = manager.startBattle({
			battleId: second.battle.id, playerId: 'h2',
		});
		expect(secondStarted.success).toBe(true);
		expect(secondStarted.battle.centre).toEqual(arenaCentreForSlot(1));

		// Once the finished battle is cleaned up, slot 0 is free again.
		manager.tick({ now: Date.now() + 10 * 60 * 1000 });
		expect(manager.getBattle(code)).toBeNull();
		World.getWorld().players.h3 = { id: 'h3', name: 'H3' };
		const third = manager.createBattle({ hostId: 'h3', hostName: 'H3', seatCount: 2 });
		World.getWorld().players.g3 = { id: 'g3', name: 'G3' };
		manager.joinBattle({ code: third.battle.code, playerId: 'g3', playerName: 'G3' });
		const thirdStarted = manager.startBattle({ battleId: third.battle.id, playerId: 'h3' });
		expect(thirdStarted.battle.centre).toEqual(arenaCentreForSlot(0));
	});

	test('joining a second LOBBY keeps both seats (multi-battle)', () => {
		// guest1 waits in host1's lobby, then follows an invite to
		// other's — and keeps BOTH seats, switching views client-side.
		const first = manager.createBattle({ hostId: 'host1', seatCount: 2 });
		manager.joinBattle({ code: first.battle.code, playerId: 'guest1', playerName: 'Guesty' });
		World.getWorld().players.other = { id: 'other', name: 'Other' };
		const second = manager.createBattle({ hostId: 'other', seatCount: 2 });

		const result = manager.joinBattle({
			code: second.battle.code, playerId: 'guest1', playerName: 'Guesty',
		});
		expect(result.success).toBe(true);
		expect(manager.battleByCode(first.battle.code).seats.map(s => s.controlledBy))
			.toEqual(['host1', 'guest1']);
		expect(manager.battlesForPlayer('guest1').map(b => b.code).sort())
			.toEqual([first.battle.code, second.battle.code].sort());
	});

	// ── Bot difficulty + adaptive pacing ─────────────────────────────────

	test('battles carry a normalised botDifficulty and expose it publicly', () => {
		const auto = manager.createBattle({ hostId: 'host1', seatCount: 2 });
		expect(auto.battle.botDifficulty).toBe('auto');

		World.getWorld().players.h2 = { id: 'h2', name: 'H2' };
		const hard = manager.createBattle({ hostId: 'h2', seatCount: 2, botDifficulty: 'hard' });
		expect(hard.battle.botDifficulty).toBe('hard');

		World.getWorld().players.h3 = { id: 'h3', name: 'H3' };
		const junk = manager.createBattle({ hostId: 'h3', seatCount: 2, botDifficulty: 'ludicrous' });
		expect(junk.battle.botDifficulty).toBe('auto');
	});

	test('fixed difficulty sets the bots\u2019 move cadence at arena build', () => {
		const created = manager.createBattle({ hostId: 'host1', seatCount: 3, botDifficulty: 'hard' });
		const started = manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });
		const bots = started.battle.seats.filter(s => s.isAi);
		expect(bots.length).toBeGreaterThan(0);
		for (const bot of bots) {
			const record = World.getPlayer(bot.seatId);
			expect(record.difficulty).toBe('hard');
			expect(record.minMoveInterval).toBe(5000);
		}
	});

	test('auto pacing retunes bots to the humans\u2019 measured tempo', () => {
		const created = manager.createBattle({ hostId: 'host1', seatCount: 2, botDifficulty: 'auto' });
		const started = manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });
		const battle = manager.getBattle(started.battle.id);
		const humanSeat = started.battle.seats.find(s => !s.isAi).seatId;
		const botSeat = started.battle.seats.find(s => s.isAi).seatId;

		const t0 = Date.now();
		// Sample 1: no human moves yet.
		World.getPlayer(humanSeat).moveCount = 0;
		manager.tick({ now: t0 });
		// Sample 2: 10 human moves in 30s → ~3s tempo → clamped to the
		// 5s floor (× handicap = 3450 → floor 5000).
		World.getPlayer(humanSeat).moveCount = 10;
		manager.tick({ now: t0 + 30000 });
		expect(World.getPlayer(botSeat).minMoveInterval).toBe(5000);

		// Human goes quiet: the window empties of new moves → bots ease
		// off to the ceiling instead of steamrolling a thinking player.
		manager.tick({ now: t0 + 65000 });
		manager.tick({ now: t0 + 95000 });
		expect(World.getPlayer(botSeat).minMoveInterval).toBe(18000);
		expect(battle.paceSamples.length).toBeGreaterThan(1);
	});
});
