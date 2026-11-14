/**
 * Viking longships — the pure rules (server/battle/shipRules.js).
 *
 * No World, no managers: a plain map stands in for the board so these
 * fixtures can later be replayed against the client ESM mirror.
 */

'use strict';

const rules = require('../../server/battle/shipRules');
const edition = require('../../server/battle/edition');

const { SHIP } = rules;

/** A tiny board: `land` and `ships` are "x,z" keys; play area |x|,|z| <= 10. */
function env({ land = [], ships = {}, sunk = [], now = 10_000 } = {}) {
	const cells = {};
	for (const key of land) cells[key] = [{ type: 'tetromino', player: 'p1' }];
	for (const [key, ship] of Object.entries(ships)) {
		cells[key] = [rules.makeShipItem({ shipId: key, player: 'p1', battleId: 'b', homeSeatId: 'p1', ...ship })];
	}
	const sunkSet = new Set(sunk);
	return {
		now,
		cells,
		getCell: (x, z) => cells[`${x},${z}`] || null,
		isInsidePlayArea: (x, z) => Math.abs(x) <= 10 && Math.abs(z) <= 10,
		isSunk: (x, z) => sunkSet.has(`${x},${z}`),
	};
}

describe('editions', () => {
	test('only an exact "viking" opts in; everything else is standard', () => {
		expect(edition.normaliseEdition('viking')).toBe('viking');
		expect(edition.normaliseEdition('  VIKING ')).toBe('viking');
		for (const v of [undefined, null, '', 'vikings', 'standard', 42, {}]) {
			expect(edition.normaliseEdition(v)).toBe('standard');
		}
		expect(edition.isVikingBattle({ edition: 'viking' })).toBe(true);
		expect(edition.isVikingBattle({})).toBe(false); // pre-edition battles
		expect(edition.isVikingBattle(null)).toBe(false);
	});
});

describe('ship items', () => {
	test('a ship cell is found, and is not land', () => {
		const e = env({ land: ['0,0'], ships: { '1,0': {} } });
		expect(rules.shipAt(e.getCell(1, 0))).toMatchObject({ type: 'ship', shipId: '1,0' });
		expect(rules.cellHasShip(e.getCell(0, 0))).toBe(false);
		expect(rules.isLandCell(e.getCell(0, 0))).toBe(true);
		expect(rules.isLandCell(e.getCell(1, 0))).toBe(false);
		expect(rules.isLandCell(null)).toBe(false);
	});

	test('kings and pawns never board; everyone else may', () => {
		expect(rules.mayBoard('KING')).toBe(false);
		expect(rules.mayBoard('pawn')).toBe(false);
		for (const type of ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT']) expect(rules.mayBoard(type)).toBe(true);
	});

	test('the factory stamps the full v1 shape', () => {
		const item = rules.makeShipItem({ shipId: 7, player: 's1', battleId: 'b1', homeSeatId: 's1', color: '#fff' });
		expect(item).toEqual({
			type: 'ship', shipId: '7', player: 's1', battleId: 'b1', homeSeatId: 's1', readyAt: 0, color: '#fff',
		});
	});
});

describe('water and mooring', () => {
	test('water is in the play area, empty, and not yet sunk', () => {
		const e = env({ land: ['0,0'], ships: { '2,0': {} }, sunk: ['3,0'] });
		expect(rules.isWater(e, 1, 0)).toBe(true);
		expect(rules.isWater(e, 0, 0)).toBe(false);   // land
		expect(rules.isWater(e, 2, 0)).toBe(false);   // another ship
		expect(rules.isWater(e, 3, 0)).toBe(false);   // the sea took it
		expect(rules.isWater(e, 11, 0)).toBe(false);  // beyond the ring
		expect(rules.isWater(e, 1.5, 0)).toBe(false); // not a square
		// Optional: a piece standing on a cell-less square isn't water.
		expect(rules.isWater({ ...e, hasPiece: (x, z) => x === 1 && z === 0 }, 1, 0)).toBe(false);
	});

	test('moored means land on any of the 8 neighbours — diagonals count, ships do not', () => {
		const e = env({ land: ['0,0'], ships: { '5,5': {} } });
		expect(rules.isMoored(e.getCell, 1, 1)).toBe(true);   // diagonal
		expect(rules.isMoored(e.getCell, 1, 0)).toBe(true);
		expect(rules.isMoored(e.getCell, 2, 0)).toBe(false);
		expect(rules.isMoored(e.getCell, 5, 4)).toBe(false);  // only a ship alongside
	});
});

describe('sailing', () => {
	test('reach is 1-5 squares in each orthogonal line, stopping at anything not water', () => {
		const e = env({ land: ['0,-2'] });
		const targets = rules.sailTargets(e, { x: 0, z: 0 });
		const key = t => `${t.x},${t.z}`;
		const set = new Set(targets.map(key));
		for (let s = 1; s <= SHIP.SAIL_MAX; s++) expect(set.has(`${s},0`)).toBe(true);
		expect(set.has('6,0')).toBe(false);          // reach is 5
		expect(set.has('0,-1')).toBe(true);
		expect(set.has('0,-3')).toBe(false);         // land in the way
		expect(set.has('1,1')).toBe(false);          // never diagonal
		expect(targets.length).toBe(5 + 5 + 5 + 1);
	});

	test('validateSail: each refusal, and a clean leg', () => {
		const ship = { readyAt: 0 };
		const e = env({ land: ['0,2'] });
		const from = { x: 0, z: 0 };
		expect(rules.validateSail(e, ship, from, { x: 3, z: 0 }, e.now)).toEqual({ ok: true });
		expect(rules.validateSail(e, ship, from, { x: 2, z: 2 }, e.now).reason).toBe('bad_sail');   // diagonal
		expect(rules.validateSail(e, ship, from, { x: 0, z: 0 }, e.now).reason).toBe('bad_sail');   // no move
		expect(rules.validateSail(e, ship, from, { x: 6, z: 0 }, e.now).reason).toBe('bad_sail');   // too far
		expect(rules.validateSail(e, ship, from, { x: 0.5, z: 0 }, e.now).reason).toBe('bad_sail');
		expect(rules.validateSail(e, ship, from, null, e.now).reason).toBe('bad_sail');
		expect(rules.validateSail(e, ship, from, { x: 0, z: 3 }, e.now).reason).toBe('not_water'); // crosses land
		expect(rules.validateSail(e, { readyAt: e.now + 1 }, from, { x: 1, z: 0 }, e.now).reason).toBe('ship_rowing');
		expect(rules.validateSail(e, null, from, { x: 1, z: 0 }, e.now).reason).toBe('no_ship');
	});

	test('the rowing lock lasts exactly ROW_LOCK_MS', () => {
		expect(SHIP.ROW_LOCK_MS).toBe(3000);
		expect(SHIP.SAIL_MAX).toBe(5);
		const ship = { readyAt: 5000 };
		expect(rules.isRowing(ship, 4999)).toBe(true);
		expect(rules.isRowing(ship, 5000)).toBe(false);
	});

	test('canSailAny: any ready ship with somewhere to go', () => {
		const boxed = env({ land: ['1,0', '-1,0', '0,1', '0,-1'] });
		expect(rules.canSailAny(boxed, [{ ship: { readyAt: 0 }, x: 0, z: 0 }], boxed.now)).toBe(false);
		const open = env();
		expect(rules.canSailAny(open, [{ ship: { readyAt: 0 }, x: 0, z: 0 }], open.now)).toBe(true);
		expect(rules.canSailAny(open, [{ ship: { readyAt: open.now + 10 }, x: 0, z: 0 }], open.now)).toBe(false);
		expect(rules.canSailAny(open, [], open.now)).toBe(false);
	});
});

describe('chess moves touching a ship', () => {
	const knight = { type: 'KNIGHT' };
	const veto = (e, piece, from, to, target = null) =>
		(rules.chessMoveVeto(e, piece, { x: from[0], z: from[1] }, { x: to[0], z: to[1] }, target) || {}).reason || null;

	test('moves that touch no ship are none of its business', () => {
		const e = env({ land: ['0,0', '1,0'] });
		expect(veto(e, knight, [0, 0], [1, 0])).toBeNull();
	});

	test('boarding: kings and pawns refused, ship must be moored and steady', () => {
		const e = env({ land: ['0,0'], ships: { '1,0': {}, '4,4': {}, '0,1': { readyAt: 99_999 } } });
		expect(veto(e, { type: 'KING' }, [0, 0], [1, 0])).toBe('cannot_board');
		expect(veto(e, { type: 'PAWN' }, [0, 0], [1, 0])).toBe('cannot_board');
		expect(veto(e, { type: 'ROOK' }, [0, 0], [1, 0])).toBeNull();
		expect(veto(e, knight, [0, 0], [4, 4])).toBe('ship_not_moored'); // the offshore knight snipe
		expect(veto(e, knight, [0, 0], [0, 1])).toBe('ship_rowing');
	});

	test('the rowing lock binds only the ship\'s own side', () => {
		const e = env({ land: ['0,0'], ships: { '0,1': { readyAt: 99_999 } } });
		const own = { type: 'KNIGHT', player: 'p1' };
		const foe = { type: 'KNIGHT', player: 'p2' };
		expect(veto(e, own, [0, 0], [0, 1])).toBe('ship_rowing');
		expect(veto(e, foe, [0, 0], [0, 1])).toBeNull();           // seize / board at once
		expect(veto(e, { type: 'KING', player: 'p2' }, [0, 0], [0, 1])).toBe('cannot_board');
		expect(rules.controls(e.cells['0,1'][0], {})).toBe(true);  // unknown side: the strict rule
	});

	test('leaving: moored and steady, and never onto a king', () => {
		const e = env({ land: ['0,0', '2,1'], ships: { '1,0': {}, '6,6': {} } });
		expect(veto(e, knight, [1, 0], [2, 1])).toBeNull();
		expect(veto(e, knight, [1, 0], [2, 1], { pieceType: 'king' })).toBe('aboard_no_king_attack');
		expect(veto(e, knight, [1, 0], [2, 1], { pieceType: 'rook' })).toBeNull();     // a raid
		expect(veto(e, knight, [6, 6], [7, 8])).toBe('ship_not_moored');
		e.cells['1,0'][0].readyAt = e.now + 1;
		expect(veto(e, knight, [1, 0], [2, 1])).toBe('ship_rowing');
	});

	test('ship to ship is forbidden', () => {
		const e = env({ land: ['0,0'], ships: { '1,0': {}, '1,1': {} } });
		expect(veto(e, { type: 'ROOK' }, [1, 0], [1, 1])).toBe('ship_to_ship');
	});

	test('a ship is not a path square', () => {
		const e = env({ ships: { '1,0': {} } });
		expect(rules.pathBlockedByShip(e.getCell, 1, 0)).toBe(true);
		expect(rules.pathBlockedByShip(e.getCell, 2, 0)).toBe(false);
	});
});

describe('classifyMove', () => {
	const own = [rules.makeShipItem({ shipId: 's-own', player: 'p1', battleId: 'b', homeSeatId: 'p1' })];
	const enemy = [rules.makeShipItem({ shipId: 's-foe', player: 'p2', battleId: 'b', homeSeatId: 'p2' })];
	const myLand = [{ type: 'tetromino', player: 'p1' }];
	const foeLand = [{ type: 'home', player: 'p2' }, { type: 'tetromino', player: 'p2' }];
	const foeHome = [{ type: 'home', player: 'p2' }];

	test('every kind', () => {
		expect(rules.classifyMove(myLand, own, 'p1', false)).toMatchObject({ kind: 'embark', shipId: 's-own' });
		expect(rules.classifyMove(myLand, enemy, 'p1', false)).toMatchObject({ kind: 'seize', previousController: 'p2' });
		expect(rules.classifyMove(myLand, enemy, 'p1', true)).toMatchObject({ kind: 'boarded', previousController: 'p2' });
		expect(rules.classifyMove(own, foeLand, 'p1', false)).toMatchObject({ kind: 'land', landOwner: 'p2' });
		expect(rules.classifyMove(own, foeHome, 'p1', false)).toMatchObject({ kind: 'land', landOwner: 'p2' });
		expect(rules.classifyMove(own, myLand, 'p1', true)).toMatchObject({ kind: 'raid', landOwner: 'p1' });
		expect(rules.classifyMove(myLand, foeLand, 'p1', true)).toBeNull();
	});
});
