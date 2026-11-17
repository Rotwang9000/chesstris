/**
 * Longships: the hull lies over two squares, and both are deck
 * (shipRules rule 8; owner 2026-11-17: "Boats take up 2 cells length
 * but appear to be only one... Make them board/unboard from either
 * cell"). Through the REAL validator, plus the pure heading rules.
 */

'use strict';

const World = require('../../server/world/World');
const rules = require('../../server/battle/shipRules');
const ships = require('../../server/battle/ships');
const {
	at, managers, vikingWorld, battle, land, ship, piece, cellAt,
} = require('./shipFixtures');

let chessManager;

beforeEach(() => {
	vikingWorld();
	({ chessManager } = managers());
});

const valid = (p, dx, dz) => {
	const { x, z } = at(dx, dz);
	return chessManager.isValidChessMove(World.getWorld(), p, x, z);
};
const point = (dx, dz, dir) => { cellAt(dx, dz)[0].dir = dir; };
const env = () => ships.boardEnv(World.getWorld(), battle(), Date.now());

describe('headingAt (pure)', () => {
	const sea = land => (x, z) => !land.has(`${x},${z}`);

	test('keeps the way it last sailed while that way is open', () => {
		expect(rules.headingAt(sea(new Set()), 0, 0, { dx: -1, dz: 0 })).toEqual({ dx: -1, dz: 0 });
	});

	test('turns away from land ahead, to lie alongside the shore', () => {
		const land = new Set(['1,0']);
		const d = rules.headingAt(sea(land), 0, 0, { dx: 1, dz: 0 });
		expect(d.dx).toBe(0); // keel parallel to the land on its beam
	});

	test('matches the renderer\'s chooseHeading for the same inputs', async () => {
		const { chooseHeading } = await import('../../public/js/viking/shipLayout.js');
		const land = new Set(['0,1', '-1,-1', '2,0']);
		for (const lastDir of [null, { dx: 1, dz: 0 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }]) {
			expect(rules.headingAt(sea(land), 0, 0, lastDir))
				.toEqual(chooseHeading({ x: 0, z: 0, isWater: sea(land), lastDir }));
		}
	});
});

describe('the deck square', () => {
	test('is the open water the prow points at', () => {
		ship(1, 0);
		point(1, 0, { dx: 0, dz: 1 });
		const { x, z } = at(1, 0);
		const deck = rules.deckSquare(env(), cellAt(1, 0)[0], x, z);
		expect(deck).toMatchObject(at(1, 1));
	});

	test('a sail leaves the prow pointing the way the ship went', () => {
		const from = ship(0, 3);
		land(-1, 3);
		const shipId = cellAt(0, 3)[0].shipId;
		const to = { x: from.x, z: from.z + 2 };
		const res = ships.sail(World.getWorld(), battle(), 's0', { shipId, to });
		expect(res.success).toBe(true);
		expect(World.getWorld().board.cells[`${to.x},${to.z}`][0].dir).toEqual({ dx: 0, dz: 1 });
	});
});

describe('boarding from either square', () => {
	// Land along z = 1 from x = 2 to 4; the ship at (1,0) points +z, so its
	// deck square is (1,1), beside the land. A rook on (3,1) reaches the
	// deck square along the row but not the ship's own square.
	function harbour(dir) {
		land(2, 1); land(4, 1);
		ship(1, 0);
		point(1, 0, dir);
		return piece('r', 'ROOK', 3, 1);
	}

	test('a rook steps aboard by reaching the deck square', () => {
		const rook = harbour({ dx: 0, dz: 1 });
		expect(valid(rook, 1, 0)).toBe(true);
	});

	test('…but not when the prow (and so the deck square) points away', () => {
		const rook = harbour({ dx: 0, dz: -1 });
		expect(valid(rook, 1, 0)).toBe(false);
	});

	test('a piece in the way still blocks the slide to the deck square', () => {
		const rook = harbour({ dx: 0, dz: 1 });
		piece('blocker', 'KNIGHT', 2, 1);
		expect(valid(rook, 1, 0)).toBe(false);
	});

	test('kings may not use it either', () => {
		land(2, 1);
		ship(1, 0);
		point(1, 0, { dx: 0, dz: 1 });
		const king = piece('k', 'KING', 2, 1);
		expect(valid(king, 1, 0)).toBe(false);
	});
});

describe('stepping off from either square', () => {
	test('a knight aboard lands where only the deck square reaches', () => {
		ship(0, 0);
		point(0, 0, { dx: 0, dz: 1 });
		land(-1, 0); // moored
		const knight = piece('n', 'KNIGHT', 0, 0);
		land(2, 2); // a knight's move from the deck square (0,1), not from (0,0)
		expect(valid(knight, 2, 2)).toBe(true);
		land(2, -2); // nor from the deck square: out of reach
		expect(valid(knight, 2, -2)).toBe(false);
	});

	test('the deck square touching land moors the ship', () => {
		ship(0, 0);
		point(0, 0, { dx: 0, dz: 1 });
		const rook = piece('q', 'QUEEN', 0, 0);
		land(1, 2); // diagonal to the deck square (0,1), two away from the ship
		expect(valid(rook, 1, 2)).toBe(true);
	});

	test('the rowing lock still holds', () => {
		ship(0, 0, { readyAt: Date.now() + 3000 });
		point(0, 0, { dx: 0, dz: 1 });
		land(-1, 0);
		const knight = piece('n', 'KNIGHT', 0, 0);
		land(2, 2);
		expect(valid(knight, 2, 2)).toBe(false);
	});
});
