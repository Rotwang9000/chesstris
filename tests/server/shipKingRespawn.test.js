/**
 * Viking longships — a king never comes back aboard a ship.
 *
 * Regression: `findRespawnCell` step 1 takes the nearest cell the seat
 * owns with no chess piece on it, and an empty longship is exactly that
 * (its item carries `player: seatId`). The seat's own ship is moored a
 * square behind the queen, so early in a battle it was often the pick —
 * and a king aboard dodges `seatIsAlive`, the last-king tie-break and
 * island anchoring, can be rowed out to open sea where nothing can
 * reach it, and takes no island with it. The missing-king rescue had
 * the same gap on the home centre. `ships.sail` now also refuses to
 * row a king (or pawn) away, as defence in depth.
 *
 * Each case has a control on a board with no ship, proving the old
 * choice is unchanged wherever ships don't exist.
 */

'use strict';

const World = require('../../server/world/World');
const pieces = require('../../server/game/pieces');
const ships = require('../../server/battle/ships');
const { createKingLifeService, findRespawnCell } = require('../../server/king/kingLives');
const { rescueOnePlayer } = require('../../server/king/missingKingSweep');
const { cellHasShip } = require('../../server/battle/shipRules');
const fx = require('./shipFixtures');

const quietService = () => createKingLifeService({
	io: { to: () => ({ emit() {} }) },
	broadcaster: { broadcastGameUpdate() {} },
	persistence: { markDirty() {} },
});

/** s0's home: 8 x 2 at offsets x -4..3, z -1..0; its centre is offset (0, 0). */
function homeZone() {
	const base = fx.at(-4, -1);
	World.getWorld().homeZones.s0 = { x: base.x, z: base.z, width: 8, height: 2, orientation: 0 };
}

/** Fill the home with s0 pieces (the king first, at offset (-4, -1)). */
function crowdedHome() {
	let n = 0;
	for (let dx = -4; dx < 4; dx++) {
		for (let dz = -1; dz < 1; dz++) {
			fx.piece(`p${n}`, n === 0 ? 'KING' : 'ROOK', dx, dz);
			n++;
		}
	}
	return World.getWorld().chessPieces.find(p => p.type === 'KING');
}

const cellOf = p => World.getWorld().board.cells[`${p.position.x},${p.position.z}`];

beforeEach(() => {
	jest.spyOn(console, 'log').mockImplementation(() => {});
	fx.vikingWorld();
	homeZone();
});
afterEach(() => jest.restoreAllMocks());

describe('king respawn skips ship cells', () => {
	test('a crowded home with an empty ship moored behind it: the king lands ashore', () => {
		const king = crowdedHome();
		// The king's own square is taken by another piece, so only the
		// ship (and land further away) is free.
		World.getWorld().board.cells[`${king.position.x},${king.position.z}`].push({ type: 'chess', player: 's1', pieceId: 'squatter' });
		fx.ship(0, -2);
		fx.land(5, 5, 's0');
		const out = quietService().handleKingDeath(king, { reason: pieces.REMOVAL_REASONS.ISLAND_DECAY });
		expect(out.respawned).toBe(true);
		expect(cellHasShip(cellOf(king))).toBe(false);
		expect(king.position).toEqual(fx.at(5, 5));
	});

	test('control: the same board with land where the ship was still picks that square', () => {
		const king = crowdedHome();
		World.getWorld().board.cells[`${king.position.x},${king.position.z}`].push({ type: 'chess', player: 's1', pieceId: 'squatter' });
		fx.land(0, -2, 's0');
		fx.land(5, 5, 's0');
		quietService().handleKingDeath(king, { reason: pieces.REMOVAL_REASONS.ISLAND_DECAY });
		expect(king.position).toEqual(fx.at(0, -2));
	});

	test('an empty ship sitting on the home centre is not the fallback either', () => {
		// The home has gone to water; a ship has sailed onto its centre.
		const king = fx.piece('k', 'KING', 6, 6);
		fx.ship(0, 0);
		quietService().handleKingDeath(king, { reason: pieces.REMOVAL_REASONS.FELL_TO_WATER });
		const cell = cellOf(king);
		expect(cellHasShip(cell)).toBe(false);
		expect(cell.map(i => i.type)).toEqual(['tetromino', 'chess']);
		// The ship is untouched: no king anchor stamped into it.
		expect(fx.cellAt(0, 0).map(i => i.type)).toEqual(['ship']);
	});

	test('the pure picker: ships are skipped at every step; boards without ships are unchanged', () => {
		const world = World.getWorld();
		const centre = fx.at(0, 0);
		fx.ship(0, 0);
		const picked = findRespawnCell(world, 's0', centre.x, centre.z);
		expect(cellHasShip(world.board.cells[`${picked.x},${picked.z}`])).toBe(false);
		delete world.board.cells[`${centre.x},${centre.z}`];
		expect(findRespawnCell(world, 's0', centre.x, centre.z)).toEqual({ ...centre, needsAnchor: true });
	});
});

describe('the missing-king rescue skips a ship on the home centre', () => {
	test('a ship on the centre: the king is rescued onto the nearest other square', () => {
		fx.ship(0, 0);
		const king = rescueOnePlayer(World.getWorld(), 's0', World.getWorld().players.s0);
		expect(king).toBeTruthy();
		expect(king.position).not.toEqual(fx.at(0, 0));
		expect(cellHasShip(cellOf(king))).toBe(false);
		expect(fx.cellAt(0, 0).map(i => i.type)).toEqual(['ship']);
	});

	test('control: no ship, the rescue still uses the home centre', () => {
		const king = rescueOnePlayer(World.getWorld(), 's0', World.getWorld().players.s0);
		expect(king.position).toEqual(fx.at(0, 0));
	});
});

describe('defence in depth: a king or pawn aboard cannot be rowed away', () => {
	test.each(['KING', 'PAWN'])('%s aboard: sail refused, nothing moves', type => {
		fx.ship(0, 3, { shipId: 'drakkar' });
		const p = fx.piece('x', type, 0, 3);
		const res = ships.sail(World.getWorld(), fx.battle(), 's0', { shipId: 'drakkar', to: fx.at(0, 5) }, { now: Date.now() });
		expect(res).toMatchObject({ success: false, reason: 'passenger_cannot_sail' });
		expect(p.position).toEqual(fx.at(0, 3));
		expect(ships.canSailAnyFor(World.getWorld(), 's0')).toBe(false);
	});

	test('a knight aboard still sails', () => {
		fx.ship(0, 3, { shipId: 'drakkar' });
		fx.piece('n', 'KNIGHT', 0, 3);
		expect(ships.canSailAnyFor(World.getWorld(), 's0')).toBe(true);
		const res = ships.sail(World.getWorld(), fx.battle(), 's0', { shipId: 'drakkar', to: fx.at(0, 5) }, { now: Date.now() });
		expect(res.success).toBe(true);
	});
});
