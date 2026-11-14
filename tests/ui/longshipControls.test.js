/**
 * @jest-environment jsdom
 *
 * Playable longships on the client (Viking battles):
 *   • vikingActive (edition.js)
 *   • sail lanes and chess-move filtering (longships/shipEnv.js)
 *   • the Longship HUD button state machine (longships/shipHudState.js)
 *   • refusal words for every reason the server sends
 *   • the 'tetches:ship' window event (longships/shipEvents.js)
 *   • the standard game's move lists are untouched
 */

import { vikingActive, isVikingBattle, requestedBattleEdition } from '../../public/js/edition.js';
import {
	laneTargets, checkSail, applyShipRules, listShips, shipsControlledBy, shipEntryAt, findShip,
	shipRefusalText, isShipRefusal, SHIP_REFUSAL_TEXT, noteSailReadyAt, shipServerNow, resetShipClock,
	shipRulesActive, rowingMsLeft, noMoveShipTip,
} from '../../public/js/longships/shipEnv.js';
import { shipButtonState, updateFleetMemo } from '../../public/js/longships/shipHudState.js';
import {
	SHIP_EVENT, SHIP_SOCKET_EVENTS, shipSocketDetail, chessMoveShipDetail, dispatchShipEvent,
} from '../../public/js/longships/shipEvents.js';
import { getChessPieceMoveSets } from '../../public/js/boardFunctions/moves.js';
import { makeShipItem, SHIP } from '../../public/js/viking/shipRulesClient.js';
import {
	VIKING_RULES, VIKING_CONTROLS, adoptedEdition, vikingBattleBadgeText, vikingRulesText, vikingControls, longshipsInPlayText,
} from '../../public/js/battle/vikingRules.js';

const C = { x: 2000, z: 2000 };
const key = (dx, dz) => `${C.x + dx},${C.z + dz}`;

/** A small Viking arena: land rows, ships and pieces at centre offsets. */
function arena({ edition = 'viking', sea = null } = {}) {
	const gameState = {
		localPlayerId: 's0',
		currentPlayer: 's0',
		turnPhase: 'chess',
		board: { cells: {} },
		chessPieces: [],
		activeBattle: { id: 'b1', centre: { ...C }, playRadius: 14, edition, sea },
	};
	const api = {
		gameState,
		land(dx, dz, player = 's0') {
			gameState.board.cells[key(dx, dz)] = [{ type: 'tetromino', player }];
			return api;
		},
		ship(dx, dz, { player = 's0', shipId = 'ship-a', readyAt = 0 } = {}) {
			gameState.board.cells[key(dx, dz)] = [makeShipItem({ shipId, player, battleId: 'b1', homeSeatId: player, readyAt })];
			return api;
		},
		piece(id, type, dx, dz, { player = 's0', hasMoved = true, orientation = 0 } = {}) {
			const k = key(dx, dz);
			if (!gameState.board.cells[k]) gameState.board.cells[k] = [{ type: 'tetromino', player }];
			gameState.board.cells[k].push({ type: 'chess', player, pieceId: id, pieceType: type.toLowerCase() });
			const p = { id, type, player, position: { x: C.x + dx, z: C.z + dz }, hasMoved, orientation };
			gameState.chessPieces.push(p);
			return p;
		},
	};
	return api;
}

const offsets = (moves) => moves.map(m => `${m.x - C.x},${m.z - C.z}`).sort();

afterEach(() => {
	delete document.documentElement.dataset.edition;
	resetShipClock();
});

describe('vikingActive', () => {
	test('off in the standard game with no battle', () => {
		expect(vikingActive({})).toBe(false);
		expect(vikingActive(null)).toBe(false);
		expect(vikingActive({ activeBattle: { edition: 'standard' } })).toBe(false);
	});

	test('on in a Viking battle even without the page switch', () => {
		expect(vikingActive({ activeBattle: { edition: 'viking' } })).toBe(true);
	});

	test('on with the page switch', () => {
		document.documentElement.dataset.edition = 'viking';
		expect(vikingActive({})).toBe(true);
		expect(requestedBattleEdition()).toBe('viking');
	});

	test('a standard client asks for standard battles', () => {
		expect(requestedBattleEdition()).toBe('standard');
	});

	test('isVikingBattle reads only the record', () => {
		expect(isVikingBattle({ edition: 'viking' })).toBe(true);
		expect(isVikingBattle({ edition: 'standard' })).toBe(false);
		expect(isVikingBattle({})).toBe(false);
		expect(isVikingBattle(null)).toBe(false);
	});
});

describe('edition adoption and words', () => {
	test('adopts the battle record, keeps the old value when the record is silent', () => {
		expect(adoptedEdition({ edition: 'viking' })).toBe('viking');
		expect(adoptedEdition({ edition: 'standard' }, 'viking')).toBe('standard');
		expect(adoptedEdition({ edition: 'nonsense' })).toBe('standard');
		expect(adoptedEdition({}, 'viking')).toBe('viking');
		expect(adoptedEdition(null)).toBe('standard');
	});

	test('badge only for Viking battles', () => {
		expect(vikingBattleBadgeText({ edition: 'viking' })).toMatch(/longships/i);
		expect(vikingBattleBadgeText({ edition: 'standard' })).toBeNull();
	});

	test('rules text carries the one-sided rowing lock wording', () => {
		const text = vikingRulesText();
		expect(VIKING_RULES.length).toBe(10);
		expect(text).toMatch(/While YOUR ship rows, your pieces can’t step on or off it/);
		expect(text).toMatch(/Enemies can still capture its passenger or seize it empty/);
		expect(text).toMatch(/5 squares/);
		expect(text).toMatch(/45 seconds/);
	});
});

describe('sail lanes', () => {
	test('up to 5 squares each way over open water, stopping at land and other ships', () => {
		const a = arena().land(0, 1).land(-2, 0).ship(0, 0).ship(0, -3, { shipId: 'b', player: 's1' });
		const entry = shipEntryAt(a.gameState, C.x, C.z);
		const { lanes, reason } = laneTargets(a.gameState, entry, 1000);
		expect(reason).toBeNull();
		expect(offsets(lanes)).toEqual(['-1,0', '0,-1', '0,-2', '1,0', '2,0', '3,0', '4,0', '5,0'].sort());
		expect(lanes.find(l => l.x === C.x + 5).distance).toBe(5);
	});

	test('the play area edge and the sunk sea close lanes', () => {
		const a = arena({
			sea: { startsAt: 0, cellMs: 1, outerBand: 15, clockOffset: 0 },
		}).land(0, 1).ship(10, 0);
		// Everything sank long ago in this sea: no water at all.
		const entry = shipEntryAt(a.gameState, C.x + 10, C.z);
		expect(laneTargets(a.gameState, entry, 10_000_000)).toEqual({ lanes: [], reason: 'no_water' });
		// No sea: lanes stop at the play radius (14).
		const b = arena().ship(12, 0);
		const lanes = laneTargets(b.gameState, shipEntryAt(b.gameState, C.x + 12, C.z), 1000).lanes;
		expect(lanes.some(l => l.x - C.x === 14)).toBe(true);
		expect(lanes.some(l => l.x - C.x === 15)).toBe(false);
	});

	test('a rowing ship has no lanes, and says so', () => {
		const a = arena().ship(0, 0, { readyAt: 5000 });
		const entry = shipEntryAt(a.gameState, C.x, C.z);
		expect(laneTargets(a.gameState, entry, 4000)).toEqual({ lanes: [], reason: 'ship_rowing' });
		expect(rowingMsLeft(entry.ship, 4000)).toBe(1000);
		expect(laneTargets(a.gameState, entry, 5000).lanes.length).toBeGreaterThan(0);
	});

	test('a square with a piece standing (no cell) is not water', () => {
		const a = arena().ship(0, 0);
		a.gameState.chessPieces.push({ id: 'float', type: 'ROOK', player: 's1', position: { x: C.x + 2, z: C.z } });
		const lanes = laneTargets(a.gameState, shipEntryAt(a.gameState, C.x, C.z), 1000).lanes;
		expect(offsets(lanes.filter(l => l.z === C.z && l.x > C.x))).toEqual(['1,0']);
	});

	test('checkSail mirrors validateSail', () => {
		const a = arena().land(0, 1).ship(0, 0);
		const entry = shipEntryAt(a.gameState, C.x, C.z);
		expect(checkSail(a.gameState, entry, { x: C.x + 3, z: C.z }, 1000)).toEqual({ ok: true });
		expect(checkSail(a.gameState, entry, { x: C.x + 6, z: C.z }, 1000).reason).toBe('bad_sail');
		expect(checkSail(a.gameState, entry, { x: C.x + 1, z: C.z + 1 }, 1000).reason).toBe('bad_sail');
		expect(checkSail(a.gameState, entry, { x: C.x, z: C.z + 1 }, 1000).reason).toBe('not_water');
	});

	test('listing ships: arena scan, controller filter, by id', () => {
		const a = arena().ship(0, 0).ship(3, 3, { shipId: 'b', player: 's1' });
		const rook = a.piece('r', 'ROOK', 0, 0);
		expect(listShips(a.gameState).map(e => e.ship.shipId)).toEqual(['b', 'ship-a']);
		expect(shipsControlledBy(a.gameState, 's0').map(e => e.ship.shipId)).toEqual(['ship-a']);
		expect(findShip(a.gameState, 'ship-a').passenger).toBe(rook);
		expect(findShip(a.gameState, 'nope')).toBeNull();
	});
});

describe('chess moves under the longship rules', () => {
	test('standard battles: move lists are exactly what they were, ships or not', () => {
		const a = arena({ edition: 'standard' }).land(-1, 0).land(0, 0).land(2, 0).ship(1, 0);
		const rook = a.piece('r', 'ROOK', -1, 0);
		expect(shipRulesActive(a.gameState)).toBe(false);
		const withShip = getChessPieceMoveSets(a.gameState, rook);
		// The same board with no battle at all.
		const plain = getChessPieceMoveSets({ ...a.gameState, activeBattle: null }, rook);
		expect(withShip).toEqual(plain);
		expect(offsets(withShip)).toEqual(['0,0', '1,0', '2,0'].sort());
	});

	test('Viking: a rook embarks but cannot slide past the ship', () => {
		const a = arena().land(-1, 0).land(2, 0).land(0, 1).ship(1, 0);
		const rook = a.piece('r', 'ROOK', -1, 0);
		a.gameState.board.cells[key(0, 0)] = [{ type: 'tetromino', player: 's0' }];
		const out = {};
		const moves = getChessPieceMoveSets(a.gameState, rook, out);
		expect(offsets(moves)).toEqual(['0,0', '1,0'].sort());
		expect(moves.find(m => m.x === C.x + 1).ship).toBe('embark');
		expect(out.refused).toEqual([
			expect.objectContaining({ x: C.x + 2, z: C.z, reason: 'path_blocked_by_ship' }),
		]);
	});

	test('Viking: kings and pawns may not board; rowing and mooring refusals', () => {
		const a = arena().land(0, 0).land(0, 1).ship(1, 0).ship(-1, 0, { shipId: 'b', readyAt: Date.now() + 60_000 });
		const king = a.piece('k', 'KING', 0, 0);
		const r = applyShipRules(a.gameState, king, [{ x: C.x + 1, z: C.z }, { x: C.x, z: C.z + 1 }]);
		expect(offsets(r.moves)).toEqual(['0,1']);
		expect(r.refused[0].reason).toBe('cannot_board');

		const knight = a.piece('n', 'KNIGHT', 0, 1);
		const lock = applyShipRules(a.gameState, knight, [{ x: C.x - 1, z: C.z }]);
		expect(lock.refused[0].reason).toBe('ship_rowing');

		const b = arena().land(0, 0).ship(3, 0);
		const n2 = b.piece('n', 'KNIGHT', 1, 1);
		b.gameState.board.cells[key(1, 1)] = [{ type: 'tetromino', player: 's0' }, { type: 'chess', player: 's0' }];
		const far = applyShipRules(b.gameState, n2, [{ x: C.x + 3, z: C.z }]);
		expect(far.refused[0].reason).toBe('ship_not_moored');
	});

	test('Viking: a passenger raids but never attacks a king', () => {
		const a = arena().land(-1, 1, 's1').land(0, 1, 's1').land(1, 1, 's1').ship(0, 0);
		const rook = a.piece('r', 'ROOK', 0, 0);
		a.piece('ek', 'KING', 0, 1, { player: 's1' });
		a.piece('eb', 'BISHOP', 1, 1, { player: 's1' });
		const queen = { ...rook, type: 'QUEEN' };
		const r = applyShipRules(a.gameState, queen, [{ x: C.x, z: C.z + 1 }, { x: C.x + 1, z: C.z + 1 }, { x: C.x - 1, z: C.z + 1 }]);
		expect(r.refused.map(m => m.reason)).toEqual(['aboard_no_king_attack']);
		expect(r.moves.map(m => m.ship)).toEqual(['raid', 'land']);
	});

	test('Viking: seizing an empty enemy ship and boarding a laden one are tagged', () => {
		const a = arena().land(0, 0).land(0, 2).ship(1, 0, { player: 's1', shipId: 'e1' }).ship(0, 1, { player: 's1', shipId: 'e2' });
		a.piece('ep', 'ROOK', 0, 1, { player: 's1' });
		const rook = a.piece('r', 'ROOK', 0, 0);
		const r = applyShipRules(a.gameState, rook, [{ x: C.x + 1, z: C.z }, { x: C.x, z: C.z + 1 }]);
		expect(r.moves.map(m => m.ship)).toEqual(['seize', 'boarded']);
	});
});

describe('Longship HUD button', () => {
	const ship = (readyAt, shipId = 'a') => ({ ship: { shipId, readyAt } });

	test('hidden outside Viking battles', () => {
		expect(shipButtonState({ active: false, ships: [ship(0)], now: 0 }).mode).toBe('hidden');
	});

	test('ready → rowing (ring fills over 3 s) → ready', () => {
		const ready = shipButtonState({ active: true, ships: [ship(0)], now: 10_000 });
		expect(ready).toMatchObject({ mode: 'ready', canSail: true, progress: 1, label: 'Longship' });
		const rowing = shipButtonState({ active: true, ships: [ship(11_500)], now: 10_000 });
		expect(rowing.mode).toBe('rowing');
		expect(rowing.detail).toBe('Rowing 1.5s');
		expect(rowing.progress).toBeCloseTo(0.5);
		expect(rowing.title).toMatch(/While YOUR ship rows/);
		expect(shipButtonState({ active: true, ships: [ship(11_500)], now: 11_500 }).mode).toBe('ready');
	});

	test('ready outside the chess phase, but it cannot sail then', () => {
		const s = shipButtonState({ active: true, ships: [ship(0)], now: 1, phase: 'tetris' });
		expect(s.mode).toBe('ready');
		expect(s.canSail).toBe(false);
		expect(s.detail).toMatch(/chess move/);
	});

	test('two ships: ready if either is, the count shows', () => {
		const s = shipButtonState({ active: true, ships: [ship(99_999, 'a'), ship(0, 'b')], now: 10 });
		expect(s).toMatchObject({ mode: 'ready', count: 2, label: 'Longship ×2' });
		// …unless the one you selected is rowing.
		expect(shipButtonState({ active: true, ships: [ship(99_999, 'a'), ship(0, 'b')], now: 10, selectedShipId: 'a' }).mode)
			.toBe('rowing');
	});

	test('lost: rebuilding countdown, then none when nothing is known', () => {
		const lost = shipButtonState({ active: true, ships: [], now: 1000, lost: { rebuildAt: 1000 + 37_200 } });
		expect(lost).toMatchObject({ mode: 'lost', detail: 'New keel in 38s', secondsLeft: 38 });
		expect(lost.progress).toBeCloseTo(1 - 37_200 / SHIP.RESPAWN_MS);
		expect(shipButtonState({ active: true, ships: [], now: 1000 }).mode).toBe('none');
	});

	test('the fleet memo follows ship_lost / ship_built / ship_seized for my seat only', () => {
		let memo = null;
		memo = updateFleetMemo(memo, { kind: 'lost', seatId: 's1', rebuildAt: 9 }, 's0');
		expect(memo).toBeNull();
		memo = updateFleetMemo(memo, { kind: 'lost', seatId: 's0', rebuildAt: 9, reason: 'sunk' }, 's0');
		expect(memo).toEqual({ rebuildAt: 9, reason: 'sunk' });
		expect(updateFleetMemo(memo, { kind: 'built', seatId: 's1' }, 's0')).toBe(memo);
		expect(updateFleetMemo(memo, { kind: 'built', seatId: 's0' }, 's0')).toBeNull();
		expect(updateFleetMemo(memo, { kind: 'seized', to: 's0', from: 's1' }, 's0')).toBeNull();
	});
});

describe('refusal words', () => {
	const CHESS_REASONS = ['cannot_board', 'ship_rowing', 'ship_not_moored', 'aboard_no_king_attack', 'ship_to_ship', 'path_blocked_by_ship'];
	const SAIL_REASONS = ['not_registered', 'eliminated', 'paused', 'not_viking', 'no_ship', 'not_your_ship', 'ship_rowing', 'bad_sail', 'not_water', 'passenger_cannot_sail', 'server_error'];

	test.each([...CHESS_REASONS, ...SAIL_REASONS])('%s has friendly words', (reason) => {
		expect(isShipRefusal(reason)).toBe(true);
		expect(shipRefusalText(reason)).toBe(SHIP_REFUSAL_TEXT[reason]);
		expect(shipRefusalText(reason).length).toBeGreaterThan(10);
	});

	test('the rowing words say it is YOUR ship’s crew', () => {
		expect(SHIP_REFUSAL_TEXT.ship_rowing).toMatch(/Your longship is still rowing/);
	});

	test('unknown reasons fall back to the server’s message', () => {
		expect(isShipRefusal('weird')).toBe(false);
		expect(shipRefusalText('weird', 'Server says no')).toBe('Server says no');
	});
});

describe('the ship clock', () => {
	test('a sail teaches the server offset from its readyAt', () => {
		noteSailReadyAt(100_000 + SHIP.ROW_LOCK_MS, 40_000);
		expect(shipServerNow({}, 41_000)).toBe(101_000);
	});

	test('without a sail, the sea clock is borrowed', () => {
		expect(shipServerNow({ activeBattle: { sea: { clockOffset: 250 } } }, 1000)).toBe(1250);
		expect(shipServerNow({}, 1000)).toBe(1000);
	});
});

describe("'tetches:ship' events", () => {
	test('every ship_* socket event maps to a kind with the payload spread in', () => {
		expect(SHIP_SOCKET_EVENTS).toEqual({
			ship_sailed: 'sailed', ship_sunk: 'sunk', ship_seized: 'seized', ship_lost: 'lost', ship_built: 'built',
		});
		expect(shipSocketDetail('ship_sailed', { shipId: 's', readyAt: 5 })).toEqual({ shipId: 's', readyAt: 5, kind: 'sailed' });
		expect(shipSocketDetail('ship_built', null)).toEqual({ kind: 'built' });
		expect(shipSocketDetail('chess_move', {})).toBeNull();
		// ship_seized's own kind survives as seizeKind.
		expect(shipSocketDetail('ship_seized', { shipId: 's', kind: 'boarded', capturedPieceId: 'p' }))
			.toEqual({ shipId: 's', kind: 'seized', seizeKind: 'boarded', capturedPieceId: 'p' });
	});

	test('chess_move with .ship becomes {kind, move}; without it, nothing', () => {
		const move = { pieceId: 'r', ship: { kind: 'raid', shipId: 's', landOwner: 'x' } };
		expect(chessMoveShipDetail(move)).toEqual({ kind: 'raid', move });
		expect(chessMoveShipDetail({ pieceId: 'r' })).toBeNull();
		expect(chessMoveShipDetail({ ship: { kind: 'weird' } })).toBeNull();
	});

	test('dispatch fires a window CustomEvent', () => {
		const seen = [];
		const listener = e => seen.push(e.detail);
		window.addEventListener(SHIP_EVENT, listener);
		expect(dispatchShipEvent({ kind: 'sunk', shipId: 'z' })).toBe(true);
		expect(dispatchShipEvent(null)).toBe(false);
		window.removeEventListener(SHIP_EVENT, listener);
		expect(seen).toEqual([{ kind: 'sunk', shipId: 'z' }]);
	});
});

describe('the tip for your piece with nowhere to step', () => {
	const NOW = 100000;
	// Land along dz = 0; the ship moored at dz = 1 with a rook aboard.
	function moored({ readyAt = 0, type = 'ROOK', dz = 1 } = {}) {
		const a = arena();
		for (let dx = -3; dx <= 3; dx++) a.land(dx, 0);
		a.ship(0, dz, { readyAt });
		const piece = a.piece('r1', type, 0, dz);
		return { gameState: a.gameState, piece };
	}

	test('aboard a rowing ship: it is rowing, the crew steps off in N s, or sails on', () => {
		const { gameState, piece } = moored({ readyAt: NOW + 2500 });
		expect(noMoveShipTip(gameState, piece, { now: NOW }))
			.toBe('Your longship is still rowing: your rook can step off in 3 s, or sail on.');
		// …the same on a phone (no tapping to be done yet), and never the
		// "nowhere to go" or "tap a tile to sail" hints.
		const phone = noMoveShipTip(gameState, piece, { now: NOW, touch: true, lanes: 0 });
		expect(phone).toBe('Your longship is still rowing: your rook can step off in 3 s, or sail on.');
		expect(noMoveShipTip(gameState, piece, { now: NOW + 2000 })).toMatch(/step off in 1 s/);
	});

	test('rowing wins over the refusals it causes', () => {
		const { gameState, piece } = moored({ readyAt: NOW + 1200 });
		const refused = [{ x: 0, z: 0, reason: 'ship_rowing' }];
		expect(noMoveShipTip(gameState, piece, { now: NOW, refused })).toMatch(/^Your longship is still rowing: your rook can step off in 2 s/);
	});

	test('a pawn aboard (it cannot be rowed away) is not told to sail on', () => {
		const { gameState, piece } = moored({ readyAt: NOW + 2500, type: 'PAWN' });
		expect(noMoveShipTip(gameState, piece, { now: NOW }))
			.toBe('Your longship is still rowing: your pawn can step off in 3 s.');
	});

	test('rowing out at sea: it can sail on; the crew lands once it touches land', () => {
		const { gameState, piece } = moored({ readyAt: NOW + 2500, dz: 4 });
		expect(noMoveShipTip(gameState, piece, { now: NOW }))
			.toBe('Your longship is still rowing: it can sail on in 3 s. Your rook steps off once it touches land.');
	});

	test('steady, with lanes: no square ashore from here — click (mouse) or tap (finger) to sail', () => {
		const { gameState, piece } = moored();
		const lanes = laneTargets(gameState, shipEntryAt(gameState, C.x, C.z + 1), NOW).lanes.length;
		expect(lanes).toBeGreaterThan(0);
		expect(noMoveShipTip(gameState, piece, { now: NOW, lanes }))
			.toBe('No square to step onto from here. Click a tile on the water to sail.');
		expect(noMoveShipTip(gameState, piece, { now: NOW, lanes, touch: true }))
			.toBe('No square to step onto from here. Tap a tile on the water to sail.');
		const atSea = moored({ dz: 4 });
		expect(noMoveShipTip(atSea.gameState, atSea.piece, { now: NOW, lanes, touch: true }))
			.toBe('Out at sea: sail next to land to step off. Tap a tile on the water to sail.');
	});

	test('a ship rule refusal is named, with the way to sail when there is one', () => {
		const { gameState, piece } = moored();
		const refused = [{ x: 0, z: 0, reason: 'path_blocked_by_ship' }, { x: 0, z: 0, reason: 'ship_not_moored' }];
		expect(noMoveShipTip(gameState, piece, { now: NOW, refused, lanes: 3 }))
			.toBe(`${SHIP_REFUSAL_TEXT.ship_not_moored} Click a tile on the water to sail.`);
		expect(noMoveShipTip(gameState, piece, { now: NOW, refused }))
			.toBe(SHIP_REFUSAL_TEXT.ship_not_moored);
	});

	test('ashore with nothing ship-related: null (the ordinary hint applies)', () => {
		const a = arena();
		for (let dx = -3; dx <= 3; dx++) a.land(dx, 0);
		const piece = a.piece('k1', 'KING', 0, 0);
		expect(noMoveShipTip(a.gameState, piece, { now: NOW })).toBeNull();
		expect(noMoveShipTip(a.gameState, { type: 'ROOK' }, { now: NOW })).toBeNull();
	});
});

describe('tap on touch, click on a mouse', () => {
	test('the battle-start toast', () => {
		expect(longshipsInPlayText(true)).toBe('Longships in play: tap your ship to sail it.');
		expect(longshipsInPlayText(false)).toBe('Longships in play: click your ship (or press L) to sail it.');
	});

	test('the help card controls', () => {
		const touch = vikingControls(true).map(([, v]) => v).join(' ');
		const mouse = vikingControls(false).map(([, v]) => v).join(' ');
		expect(touch).not.toMatch(/click|press L|keyboard| or L /i);
		expect(touch).toMatch(/^Tap/);
		expect(mouse).not.toMatch(/\btap\b/i);
		expect(mouse).toMatch(/press L/);
		expect(VIKING_CONTROLS).toEqual(vikingControls(false));
		expect(vikingControls(true).map(([k]) => k)).toEqual(vikingControls(false).map(([k]) => k));
	});
});
