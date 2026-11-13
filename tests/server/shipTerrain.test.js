/**
 * Viking longships as terrain: a ship is open water with a boat on it,
 * not land. It never clears, never falls with gravity, never lets you
 * build off it, is never part of an island — and it anchors the landing
 * party it is moored against, so a raid doesn't simply evaporate.
 */

'use strict';

const World = require('../../server/world/World');
const cells = require('../../server/game/cells');
const {
	at, managers, vikingWorld, battle, land, strip, ship, piece, cellAt,
} = require('./shipFixtures');

let boardManager;
let islandManager;
let tetrominoManager;

beforeEach(() => {
	vikingWorld();
	({ boardManager, islandManager, tetrominoManager } = managers());
});

describe('cell helpers treat a ship as non-terrain', () => {
	const shipCell = () => cellAt(0, 0);

	test('never a clear target, never clearable, preserved by a strip, never moved', () => {
		ship(0, 0);
		piece('r', 'ROOK', 0, 0);
		expect(cells.hasShip(shipCell())).toBe(true);
		expect(cells.isLineClearTarget(shipCell())).toBe(false);
		expect(cells.isClearable(shipCell())).toBe(false);
		expect(cells.stripClearable(shipCell()).some(i => i.type === 'ship')).toBe(true);
		expect(cells.stripForLineClear(shipCell()).preserved.some(i => i.type === 'ship')).toBe(true);
		expect(cells.gravityAnchor(shipCell())).toEqual({ movable: false, owner: null });
	});
});

describe('line clears', () => {
	test('a ship breaks a row: two short runs either side never clear', () => {
		piece('k', 'KING', 0, -6);
		strip(-4, 3, 3);
		ship(0, 3);
		const { rows } = boardManager.findClearableLines(World.getWorld());
		expect(rows).not.toContain(at(0, 3).z);
	});

	test('a full run beside a ship clears, and the ship survives', () => {
		piece('k', 'KING', 0, -6);
		strip(-9, -2, 3);
		ship(-1, 3);
		strip(0, 2, 3);
		const world = World.getWorld();
		const found = boardManager.findClearableLines(world);
		expect(found.rows).toContain(at(0, 3).z);
		boardManager.applyClearedLines(world, found.rows, found.cols, { rowRuns: found.rowRuns, colRuns: found.colRuns });
		expect(cells.hasShip(cellAt(-1, 3))).toBe(true);
		expect(cellAt(-5, 3)).toBeNull();
	});
});

describe('gravity', () => {
	test('land beyond a cleared row falls toward the king; the ship stays put', () => {
		piece('k', 'KING', 0, -5);
		strip(0, 7, -3);           // the row that clears
		ship(2, 0, { shipId: 'moored' });
		land(3, 0);                // sole-owner land: this one moves
		const world = World.getWorld();
		const found = boardManager.findClearableLines(world);
		expect(found.rows).toContain(at(0, -3).z);
		boardManager.applyClearedLines(world, found.rows, found.cols, { rowRuns: found.rowRuns, colRuns: found.colRuns });
		expect(cells.hasShip(cellAt(2, 0))).toBe(true);
		expect(cellAt(2, -1)).toBeNull();
		expect(cellAt(3, 0)).toBeNull();
		expect(cellAt(3, -1)).not.toBeNull();
	});
});

describe('building', () => {
	function setup({ first = false } = {}) {
		piece('k', 'KING', -6, 0);
		ship(0, 0);
		piece('r', 'ROOK', 0, 0); // a passenger's chess marker on the ship
		if (!first) World.getPlayer('s0').lastTetrominoPlacement = { x: 0, z: 0 };
	}
	const place = (shape, dx, dz) => {
		const { x, z } = at(dx, dz);
		return tetrominoManager.validateTetrominoPlacement(World.getWorld(), shape, x, z, 0, 's0');
	};

	test('a ship (even with your passenger aboard) is not ground to build from', () => {
		setup();
		expect(place([[1, 1]], 1, 0)).toMatchObject({ valid: false, reason: 'not_adjacent' });
	});

	test('nor a first-block launch pad', () => {
		setup({ first: true });
		expect(place([[1, 1]], 1, 0)).toMatchObject({ valid: false, reason: 'not_adjacent' });
	});

	test('and you cannot build on top of one', () => {
		setup();
		expect(place([[1]], 0, 0)).toMatchObject({ valid: false, reason: 'occupied' });
	});

	test('control: the same placement beside your own land is fine', () => {
		setup();
		land(1, 1);
		piece('k2', 'KING', 1, 1); // a second king just to give (1,1) a path
		World.getWorld().chessPieces = World.getWorld().chessPieces.filter(p => p.id !== 'k');
		expect(place([[1, 1]], 1, 0)).toMatchObject({ valid: true });
	});
});

describe('islands', () => {
	test('a ship is never an island and never decays — passenger and all', () => {
		piece('k', 'KING', -6, 0);
		ship(0, 0);
		piece('q', 'QUEEN', 0, 0);
		const world = World.getWorld();
		const islands = islandManager.detectIslands(world);
		expect(islands.some(i => i.cells.some(c => c.x === at(0, 0).x && c.z === at(0, 0).z))).toBe(false);
		islandManager.checkForIslandsAfterRowClear(world);
		World.getPlayer('s0').moveCount = 1000;
		islandManager.checkForIslandsAfterRowClear(world);
		expect(cells.hasShip(cellAt(0, 0))).toBe(true);
		expect(world.chessPieces.some(p => p.id === 'q')).toBe(true);
	});

	test('a ship is not a path back to the king', () => {
		piece('k', 'KING', 0, 0);
		land(1, 0);
		ship(2, 0);
		land(3, 0);
		const { x, z } = at(3, 0);
		expect(islandManager.hasPathToKing(World.getWorld(), x, z, 's0')).toBe(false);
	});

	test('land touching your own ship is anchored (diagonals count); an enemy ship anchors nothing', () => {
		piece('k', 'KING', -8, 0);
		land(4, 4);                              // landing party A: diagonal to own ship
		ship(5, 5);
		land(-2, 6);                             // landing party B: touches an ENEMY ship
		ship(-2, 7, { player: 's1', shipId: 'foe' });
		const islands = islandManager.detectIslands(World.getWorld());
		const islandAt = (dx, dz) => islands.find(i => i.playerId === 's0'
			&& i.cells.some(c => c.x === at(dx, dz).x && c.z === at(dx, dz).z));
		expect(islandAt(4, 4)).toMatchObject({ hasKing: true, anchoredByShip: true });
		expect(islandAt(-2, 6).hasKing).toBe(false);

		battle().edition = 'standard';
		expect(islandManager.detectIslands(World.getWorld())
			.find(i => i.cells.some(c => c.x === at(4, 4).x && c.z === at(4, 4).z)).hasKing).toBe(false);
	});

	test('the anchored landing party survives decay; an unanchored one does not', () => {
		piece('k', 'KING', -8, 0);
		land(4, 4);
		ship(5, 5);
		land(-3, 8);
		const world = World.getWorld();
		islandManager.checkForIslandsAfterRowClear(world);
		World.getPlayer('s0').moveCount = 1000; // far past the move limit
		islandManager.checkForIslandsAfterRowClear(world);
		expect(cellAt(4, 4)).not.toBeNull();
		expect(cellAt(-3, 8)).toBeNull();
	});
});
