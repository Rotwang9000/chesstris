/**
 * @jest-environment node
 *
 * The client's longship rules are the server's:
 *   1. public/js/viking/shipRulesClient.js is the generated ESM mirror
 *      of server/battle/shipRules.js and is not stale;
 *   2. both modules give the same answers on a battery of boards;
 *   3. the client's move highlights (moves.js + shipEnv.js) equal what
 *      the server's real validator (ChessManager.isValidChessMove)
 *      accepts, square by square, on Viking battle boards.
 */

import fs from 'fs';
import * as client from '../../public/js/viking/shipRulesClient.js';
import { getChessPieceMoveSets } from '../../public/js/boardFunctions/moves.js';
import { resetShipClock } from '../../public/js/longships/shipEnv.js';

const server = require('../../server/battle/shipRules');
const gen = require('../../scripts/gen-ship-rules-client');
const World = require('../../server/world/World');
const { at, managers, vikingWorld, land, strip, ship, piece, CENTRE } = require('../server/shipFixtures');

describe('the generated mirror', () => {
	test('is up to date with server/battle/shipRules.js (npm run gen:ship-rules)', () => {
		expect(fs.readFileSync(gen.TARGET, 'utf8')).toBe(gen.generate());
	});

	test('exports exactly what the server module exports', () => {
		expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort());
		expect(client.SHIP).toEqual(server.SHIP);
		expect(client.SHIP_REJECTIONS).toEqual(server.SHIP_REJECTIONS);
	});
});

// ── A seeded battery of random boards ───────────────────────────────────────

function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const NOW = 5_000_000;
const TYPES = ['KING', 'QUEEN', 'ROOK', 'BISHOP', 'KNIGHT', 'PAWN'];

function randomBoard(seed) {
	const r = rng(seed);
	const cells = {};
	const pieces = [];
	const ships = [];
	for (let x = -6; x <= 6; x++) {
		for (let z = -6; z <= 6; z++) {
			const roll = r();
			const key = `${x},${z}`;
			if (roll < 0.42) {
				const owner = r() < 0.5 ? 'a' : 'b';
				cells[key] = r() < 0.1 ? [{ type: 'home', player: owner }] : [{ type: 'tetromino', player: owner }];
			} else if (roll < 0.5) {
				const owner = r() < 0.5 ? 'a' : 'b';
				const item = server.makeShipItem({
					shipId: `s${x}_${z}`, player: owner, battleId: 'b', homeSeatId: owner,
					readyAt: r() < 0.3 ? NOW + 2000 : NOW - 10,
				});
				cells[key] = [item];
				ships.push({ ship: item, x, z });
			}
			if (cells[key] && r() < 0.3) {
				const type = TYPES[Math.floor(r() * TYPES.length)];
				const player = r() < 0.5 ? 'a' : 'b';
				cells[key].push({ type: 'chess', player, pieceType: type.toLowerCase() });
				pieces.push({ type, player, x, z });
			}
		}
	}
	const getCell = (x, z) => cells[`${x},${z}`] || null;
	const env = {
		now: NOW,
		getCell,
		isInsidePlayArea: (x, z) => Math.round(Math.hypot(x, z)) <= 5,
		isSunk: (x, z) => x === 5 && z > 0,
		hasPiece: (x, z) => pieces.some(p => p.x === x && p.z === z),
	};
	return { cells, pieces, ships, env, getCell, r };
}

describe('server and client agree on a battery of boards', () => {
	const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919);

	test.each(SEEDS)('board seed %i', (seed) => {
		const board = randomBoard(seed);
		const { env, getCell, pieces, ships } = board;
		const squares = [];
		for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) squares.push({ x, z });

		// Collect both sides' answers and compare once (fast).
		const c = [];
		const sv = [];
		const both = (label, a, b) => { c.push([label, a]); sv.push([label, b]); };
		for (const { x, z } of squares) {
			both(`water ${x},${z}`, client.isWater(env, x, z), server.isWater(env, x, z));
			both(`moored ${x},${z}`, client.isMoored(getCell, x, z), server.isMoored(getCell, x, z));
			both(`path ${x},${z}`, client.pathBlockedByShip(getCell, x, z), server.pathBlockedByShip(getCell, x, z));
			both(`owner ${x},${z}`, client.landOwnerOf(getCell(x, z)), server.landOwnerOf(getCell(x, z)));
		}
		both('canSailAny', client.canSailAny(env, ships, NOW), server.canSailAny(env, ships, NOW));
		for (const entry of ships) {
			const from = { x: entry.x, z: entry.z };
			both(`lanes ${from.x},${from.z}`, client.sailTargets(env, from), server.sailTargets(env, from));
			for (const to of squares) {
				if (to.x !== from.x && to.z !== from.z && Math.abs(to.x - from.x) > 2) continue;
				both(`sail ${from.x},${from.z}->${to.x},${to.z}`,
					client.validateSail(env, entry.ship, from, to, NOW),
					server.validateSail(env, entry.ship, from, to, NOW));
			}
		}
		for (const p of pieces) {
			const from = { x: p.x, z: p.z };
			for (const to of squares) {
				const occupant = pieces.find(q => q.x === to.x && q.z === to.z);
				const target = occupant ? { pieceType: occupant.type.toLowerCase(), player: occupant.player } : null;
				const label = `${p.type}@${from.x},${from.z}->${to.x},${to.z}`;
				both(`veto ${label}`, client.chessMoveVeto(env, p, from, to, target), server.chessMoveVeto(env, p, from, to, target));
				both(`kind ${label}`,
					client.classifyMove(getCell(from.x, from.z), getCell(to.x, to.z), p.player, !!occupant),
					server.classifyMove(getCell(from.x, from.z), getCell(to.x, to.z), p.player, !!occupant));
			}
		}
		expect(c).toEqual(sv);
	});
});

// ── Highlights equal the server validator ───────────────────────────────────

describe('client move highlights equal ChessManager.isValidChessMove', () => {
	let chessManager;

	beforeEach(() => {
		resetShipClock();
		vikingWorld();
		({ chessManager } = managers());
	});

	function clientState() {
		const world = World.getWorld();
		return {
			board: { cells: world.board.cells },
			chessPieces: world.chessPieces,
			activeBattle: { id: 'bviking', centre: { ...CENTRE }, playRadius: 14, edition: 'viking', sea: null },
		};
	}

	/** Every square in reach: client highlight ⇔ server accepts. */
	function expectParity(p) {
		const world = World.getWorld();
		const gameState = clientState();
		const highlights = new Set(getChessPieceMoveSets(gameState, p).map(m => `${m.x},${m.z}`));
		for (let dx = -8; dx <= 8; dx++) {
			for (let dz = -8; dz <= 8; dz++) {
				const x = p.position.x + dx;
				const z = p.position.z + dz;
				if (dx === 0 && dz === 0) continue;
				const ok = chessManager.isValidChessMove(world, p, x, z);
				expect([`${p.type} -> ${dx},${dz}`, highlights.has(`${x},${z}`)])
					.toEqual([`${p.type} -> ${dx},${dz}`, ok]);
			}
		}
		return highlights;
	}

	test('a rook boards its moored ship and cannot slide past it', () => {
		strip(-3, 0, 0);
		strip(2, 4, 0);
		ship(1, 0);
		const rook = piece('r', 'ROOK', -2, 0);
		const h = expectParity(rook);
		const s = at(1, 0);
		expect(h.has(`${s.x},${s.z}`)).toBe(true);
		const beyond = at(3, 0);
		expect(h.has(`${beyond.x},${beyond.z}`)).toBe(false);
	});

	test('a passenger lands, raids, never attacks a king, and waits out its own rowing', () => {
		strip(-3, 3, 1, 's1');
		ship(0, 0);
		const rook = piece('r', 'ROOK', 0, 0);
		piece('ek', 'KING', 0, 1, { player: 's1' });
		piece('eb', 'BISHOP', -1, 1, { player: 's1' });
		piece('kn', 'KNIGHT', 2, 2, { player: 's0' });
		expectParity(rook);
		expectParity(World.getWorld().chessPieces.find(p => p.id === 'kn'));
		// Rowing: its own side can't step off.
		World.getWorld().board.cells[`${at(0, 0).x},${at(0, 0).z}`][0].readyAt = Date.now() + 60_000;
		expect(expectParity(rook).size).toBe(0);
	});

	test('the one-sided lock: an enemy may take a rowing ship’s passenger', () => {
		strip(-3, 3, 1, 's1');
		ship(0, 0, { readyAt: Date.now() + 60_000 });
		piece('r', 'ROOK', 0, 0);
		const foe = piece('q', 'QUEEN', 1, 1, { player: 's1' });
		const h = expectParity(foe);
		const s = at(0, 0);
		expect(h.has(`${s.x},${s.z}`)).toBe(true);
	});

	test('kings and pawns stay ashore; a knight needs the ship moored', () => {
		strip(-2, 2, 0);
		ship(0, 1);
		ship(0, 4, { shipId: 'far' }); // offshore: no land touching
		expectParity(piece('k', 'KING', 0, 0, { hasMoved: true }));
		expectParity(piece('p', 'PAWN', 1, 0, { orientation: 0 }));
		expectParity(piece('n', 'KNIGHT', -1, 2 + 0, { player: 's0' }));
	});

	test('ship to ship is forbidden; seizing an empty enemy ship is fine', () => {
		strip(-3, 3, 0);
		ship(0, 1);
		ship(1, 1, { player: 's1', shipId: 'foe' });
		const rook = piece('r', 'ROOK', 0, 1);
		expectParity(rook);
		expectParity(piece('b', 'BISHOP', 2, 0));
	});

	test('random Viking boards: highlights equal the validator for every piece', () => {
		for (let seed = 1; seed <= 12; seed++) {
			vikingWorld();
			const r = rng(seed * 104729);
			for (let dx = -5; dx <= 5; dx++) {
				for (let dz = -5; dz <= 5; dz++) {
					const roll = r();
					if (roll < 0.5) land(dx, dz, r() < 0.5 ? 's0' : 's1');
					else if (roll < 0.58) {
						ship(dx, dz, {
							player: r() < 0.5 ? 's0' : 's1',
							shipId: `x${dx}_${dz}`,
							readyAt: r() < 0.3 ? Date.now() + 60_000 : 0,
						});
					}
				}
			}
			let n = 0;
			for (let dx = -5; dx <= 5; dx++) {
				for (let dz = -5; dz <= 5; dz++) {
					const { x, z } = at(dx, dz);
					const cell = World.getWorld().board.cells[`${x},${z}`];
					if (!cell || r() > 0.22) continue;
					const type = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT', 'PAWN', 'KING'][Math.floor(r() * 6)];
					const player = r() < 0.5 ? 's0' : 's1';
					// Ships carry no king or pawn (the rules never let one aboard).
					if (client.cellHasShip(cell) && (type === 'KING' || type === 'PAWN')) continue;
					piece(`p${seed}_${n++}`, type, dx, dz, { player, orientation: player === 's0' ? 0 : 2 });
				}
			}
			for (const p of World.getWorld().chessPieces.slice()) expectParity(p);
		}
	});
});
