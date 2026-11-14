/**
 * Viking longships — chess-move rules through the REAL validator
 * (ChessManager.isValidChessMove → moveValidation.js), plus the check
 * service's escape test that loops over every opposing piece.
 *
 * Each rule also has a standard-edition control on the identical board,
 * proving the gate: outside Viking battles nothing changes.
 */

'use strict';

const World = require('../../server/world/World');
const { createCheckService } = require('../../server/king/checkService');
const {
	at, managers, vikingWorld, battle, land, strip, ship, piece,
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
const asStandard = () => { battle().edition = 'standard'; };

describe('boarding', () => {
	test('a rook steps aboard its own moored ship', () => {
		const rook = piece('r', 'ROOK', 0, 0);
		ship(1, 0);
		expect(valid(rook, 1, 0)).toBe(true);
	});

	test('kings and pawns may not board', () => {
		const king = piece('k', 'KING', 0, 0);
		const pawn = piece('p', 'PAWN', 1, 1, { orientation: 0 });
		ship(1, 0);
		// The pawn advances +z: put a moored ship on its forward square.
		ship(1, 2, { shipId: 'ship-b' });
		expect(valid(king, 1, 0)).toBe(false);
		expect(valid(pawn, 1, 2)).toBe(false);
		asStandard();
		expect(valid(pawn, 1, 2)).toBe(true);
		expect(valid(king, 1, 0)).toBe(true);
	});

	test('one piece per ship: your own passenger blocks the deck', () => {
		ship(1, 0);
		piece('r1', 'ROOK', 1, 0);
		const rook2 = piece('r2', 'ROOK', 0, 0);
		expect(valid(rook2, 1, 0)).toBe(false);
	});

	test('capturing an enemy passenger (boarding) is a normal capture — but not for a pawn', () => {
		ship(1, 0, { player: 's1', shipId: 'foe' });
		piece('enemy', 'ROOK', 1, 0, { player: 's1' });
		const rook = piece('r', 'ROOK', 0, 0);
		const pawn = piece('p', 'PAWN', 0, -1, { orientation: 0 });
		expect(valid(rook, 1, 0)).toBe(true);
		expect(valid(pawn, 1, 0)).toBe(false); // a diagonal capture would put it aboard
	});
});

describe('the knight snipe and mooring', () => {
	test('a knight cannot leap onto a ship anchored offshore', () => {
		const knight = piece('n', 'KNIGHT', 0, 0);
		ship(2, 1); // open water all round — not moored
		expect(valid(knight, 2, 1)).toBe(false);
		asStandard();
		expect(valid(knight, 2, 1)).toBe(true); // control: the old rules would allow it
	});

	test('…but once that ship touches land (diagonals count) the knight may board', () => {
		const knight = piece('n', 'KNIGHT', 0, 0);
		ship(2, 1);
		land(3, 2);
		expect(valid(knight, 2, 1)).toBe(true);
	});

	test('nor leap off a ship that is out at sea', () => {
		ship(5, 5);
		const knight = piece('n', 'KNIGHT', 5, 5);
		land(6, 7);
		expect(valid(knight, 6, 7)).toBe(false);
	});
});

describe('the rowing lock', () => {
	test('its own side steps neither on nor off while the ship rows', () => {
		const rook = piece('r', 'ROOK', 0, 0);
		ship(1, 0, { readyAt: Date.now() + 3000 });
		expect(valid(rook, 1, 0)).toBe(false);
		ship(0, 2, { shipId: 'b', readyAt: Date.now() + 3000 });
		land(0, 3);
		const aboard = piece('q', 'QUEEN', 0, 2);
		expect(valid(aboard, 0, 3)).toBe(false);
		World.getWorld().board.cells[`${at(0, 2).x},${at(0, 2).z}`][0].readyAt = Date.now() - 1;
		expect(valid(aboard, 0, 3)).toBe(true);
	});
});

describe('the rowing lock is one-sided (no row shield)', () => {
	// Regression: a two-sided lock refused EVERY move onto a rowing
	// ship, so a laden ship that re-sailed one square at every lock end
	// could never be captured or seized, yet could strike at any lock
	// end it chose.
	const ships = require('../../server/battle/ships');
	const T0 = 5_000_000;
	let clock;

	beforeEach(() => {
		clock = T0;
		jest.spyOn(Date, 'now').mockImplementation(() => clock);
		piece('k0', 'KING', -10, -10);
		piece('k1', 'KING', 10, 10, { player: 's1' });
		strip(-3, 3, 0, 's0'); // s0's shore; water at z = 1
	});
	afterEach(() => jest.restoreAllMocks());

	test('an enemy takes a passenger 1 ms after it sails; the passenger cannot land until readyAt', () => {
		ship(0, 1, { player: 's1', shipId: 'raider' });
		const raider = piece('rr', 'ROOK', 0, 1, { player: 's1' });
		const queen = piece('q0', 'QUEEN', 0, 0);
		const res = ships.sail(World.getWorld(), battle(), 's1', { shipId: 'raider', to: at(1, 1) }, { now: clock });
		expect(res.success).toBe(true);
		clock += 1;
		// The raider is stuck on deck while it rows…
		expect(valid(raider, 1, 0)).toBe(false);
		// …but the defender may board it at once.
		expect(valid(queen, 1, 1)).toBe(true);
		clock = res.event.readyAt;
		expect(valid(raider, 1, 0)).toBe(true);
	});

	test('shuttling at every lock end no longer shields the passenger', () => {
		ship(0, 1, { player: 's1', shipId: 'raider' });
		piece('rr', 'ROOK', 0, 1, { player: 's1' });
		const queen = piece('q0', 'QUEEN', 0, 0);
		let pos = { dx: 0, dz: 1 };
		for (let leg = 0; leg < 6; leg++) {
			const next = pos.dx === 0 ? { dx: 1, dz: 1 } : { dx: 0, dz: 1 };
			const res = ships.sail(World.getWorld(), battle(), 's1', { shipId: 'raider', to: at(next.dx, next.dz) }, { now: clock });
			expect(res.success).toBe(true);
			pos = next;
			for (let t = 1; t < 3000; t += 500) {
				clock = res.event.readyAt - 3000 + t;
				expect(valid(queen, pos.dx, pos.dz)).toBe(true);
			}
			clock = res.event.readyAt;
		}
	});

	test('an empty enemy ship may be seized while it rows; your own may not be boarded', () => {
		ship(1, 1, { player: 's1', shipId: 'foe', readyAt: T0 + 3000 });
		ship(-1, 1, { player: 's0', shipId: 'mine', readyAt: T0 + 3000 });
		const rook = piece('r', 'ROOK', 1, 0);
		const knight = piece('n', 'KNIGHT', -3, 0);
		expect(valid(rook, 1, 1)).toBe(true);
		expect(valid(knight, -1, 1)).toBe(false);
		clock = T0 + 3000;
		expect(valid(knight, -1, 1)).toBe(true);
	});
});

describe('attacking from aboard', () => {
	test('a passenger never targets a king, but may raid anything else', () => {
		land(-1, 0);
		ship(0, 0);
		const knight = piece('n', 'KNIGHT', 0, 0);
		piece('king', 'KING', 1, 2, { player: 's1' });
		piece('foeRook', 'ROOK', 2, 1, { player: 's1' });
		expect(valid(knight, 1, 2)).toBe(false);
		expect(valid(knight, 2, 1)).toBe(true);
		asStandard();
		expect(valid(knight, 1, 2)).toBe(true);
	});

	test('ship to ship is forbidden', () => {
		land(0, -1);
		ship(0, 0);
		ship(1, 0, { shipId: 'other' });
		const rook = piece('r', 'ROOK', 0, 0);
		expect(valid(rook, 1, 0)).toBe(false);
	});
});

describe('ships are not path squares', () => {
	test('a rook cannot slide over a ship; a bishop neither', () => {
		const rook = piece('r', 'ROOK', 0, 0);
		land(1, 0);
		ship(2, 0);
		land(3, 0);
		expect(valid(rook, 3, 0)).toBe(false);
		const bishop = piece('b', 'BISHOP', 0, 4);
		land(1, 5);
		ship(2, 6, { shipId: 'diag' });
		land(3, 7);
		land(4, 8);
		expect(valid(bishop, 3, 7)).toBe(false);
		asStandard();
		expect(valid(rook, 3, 0)).toBe(true);
		expect(valid(bishop, 3, 7)).toBe(true);
	});

	test('a pawn cannot double-step over a ship', () => {
		const pawn = piece('p', 'PAWN', 0, 0, { orientation: 0, hasMoved: false });
		ship(0, 1);
		land(0, 2);
		expect(valid(pawn, 0, 2)).toBe(false);
		asStandard();
		expect(valid(pawn, 0, 2)).toBe(true);
	});

	test('castling through a ship is blocked', () => {
		const king = piece('k', 'KING', 0, 0, { hasMoved: false });
		land(1, 0);
		ship(2, 0);
		land(3, 0);
		piece('r', 'ROOK', 4, 0, { hasMoved: false });
		expect(valid(king, 2, 0)).toBe(false);
		asStandard();
		expect(valid(king, 2, 0)).toBe(true);
	});

	test('knights still jump over ships (they jump over everything)', () => {
		const knight = piece('n', 'KNIGHT', 0, 0);
		ship(1, 0);
		land(2, 1);
		expect(valid(knight, 2, 1)).toBe(true);
	});
});

describe('hasValidChessMoves sees ship moves', () => {
	test('a lone rook whose only move is boarding still has a move', () => {
		piece('r', 'ROOK', 0, 0);
		ship(1, 0);
		expect(chessManager.hasValidChessMoves(World.getWorld(), 's0')).toBe(true);
		World.getWorld().board.cells[`${at(1, 0).x},${at(1, 0).z}`][0].readyAt = Date.now() + 3000;
		expect(chessManager.hasValidChessMoves(World.getWorld(), 's0')).toBe(false);
	});
});

describe('check escapes ignore passengers', () => {
	function scenario() {
		// s0's king at (0,0) is checked by s1's rook down the x=0 column.
		strip(-1, 0, 0);
		land(0, -1);
		land(0, -2);
		land(0, 1);
		const king = piece('k0', 'KING', 0, 0);
		const rook = piece('r1', 'ROOK', 0, -3, { player: 's1' });
		// A s1 knight aboard a ship at (0,2): an L-move from the king's
		// escape square (-1,0) — a threat if it could attack from aboard.
		ship(0, 2, { player: 's1', shipId: 'foe' });
		piece('n1', 'KNIGHT', 0, 2, { player: 's1' });
		World.getWorld().pendingChecks = {
			s0: {
				defenderId: 's0', attackerId: 's1', attackerPieceId: rook.id,
				kingPieceId: king.id, kingPos: { ...king.position },
			},
		};
		const checkService = createCheckService({
			io: { to: () => ({ emit: () => {} }) },
			gameManager: { chessManager },
			broadcaster: { broadcastGameUpdate: () => {} },
			kingCaptureService: {},
		});
		return { king, checkService };
	}

	test('the king may step next to a laden enemy ship', () => {
		const { king, checkService } = scenario();
		const escape = at(-1, 0);
		expect(checkService.validateEscape({ world: World.getWorld(), piece: king, toX: escape.x, toZ: escape.z }).ok)
			.toBe(true);
	});

	test('control: under standard rules that knight would still threaten it', () => {
		const { king, checkService } = scenario();
		asStandard();
		const escape = at(-1, 0);
		expect(checkService.validateEscape({ world: World.getWorld(), piece: king, toX: escape.x, toZ: escape.z }).ok)
			.toBe(false);
	});
});
